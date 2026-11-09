/**
 * JTube ⇄ Firebase (project config in env.js).
 *
 * The site is hosted on Firebase Hosting, so the browser talks to Firebase directly:
 *   - Authentication: e-mail/password + Google sign-in
 *   - Firestore: video catalog (filled by the GitHub Actions sync), playlists, community chat,
 *     admin tools. Security is enforced by firestore.rules.
 *   - Google Analytics (skipped when Do Not Track / Global Privacy Control is on)
 *
 * Exposes window.JFB (promise-based API) and keeps window.JTubeFirebase / jtubeTrack for compatibility.
 * Local testing against the emulators: open any page with ?emulator=1 on localhost.
 */
(function () {
    'use strict';
    var cfg = (typeof ENV !== 'undefined' && ENV.FIREBASE_CONFIG) || null;
    var V = '10.14.1';
    var base = 'https://www.gstatic.com/firebasejs/' + V + '/';
    var ADMIN_UIDS = (typeof ENV !== 'undefined' && ENV.ADMIN_UIDS) || ['4biDan5sHsZgfN33920XYQoNkH22'];
    var dnt = navigator.doNotTrack === '1' || window.doNotTrack === '1' || navigator.globalPrivacyControl === true;
    var isLocal = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
    var useEmulator = false;
    try {
        if (isLocal && /[?&]emulator=1/.test(location.search)) sessionStorage.setItem('jtube_emulator', '1');
        useEmulator = isLocal && sessionStorage.getItem('jtube_emulator') === '1';
    } catch (e) {}

    var JFB = window.JFB = { available: Boolean(cfg && cfg.apiKey && location.protocol !== 'file:'), user: null, profile: null, adminUids: ADMIN_UIDS };
    window.JTubeFirebase = { ready: null, app: null, analytics: null };
    window.jtubeTrack = function () {};

    if (!JFB.available) { JFB.ready = Promise.resolve(null); window.JTubeFirebase.ready = JFB.ready; return; }

    var M = {}; // loaded SDK modules
    var authReadyResolve;
    JFB.authReady = new Promise(function (r) { authReadyResolve = r; });
    var authListeners = [];

    JFB.ready = Promise.all([
        import(base + 'firebase-app.js'),
        import(base + 'firebase-auth.js'),
        import(base + 'firebase-firestore.js')
    ]).then(function (mods) {
        M.app = mods[0]; M.auth = mods[1]; M.fs = mods[2];
        var app = M.app.getApps().find(function (a) { return a.name === 'jtube'; }) || M.app.initializeApp(cfg, 'jtube');
        var auth = M.auth.getAuth(app);
        var db = M.fs.getFirestore(app);
        if (useEmulator) {
            try { M.auth.connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true }); } catch (e) {}
            try { M.fs.connectFirestoreEmulator(db, '127.0.0.1', 8080); } catch (e) {}
        }
        JFB.app = app; JFB.auth = auth; JFB.db = db;
        window.JTubeFirebase.app = app;
        M.auth.onAuthStateChanged(auth, async function (u) {
            JFB.user = u || null;
            JFB.profile = null;
            if (u) { try { JFB.profile = await ensureProfile(u); } catch (e) {} }
            JFB._authResolved = true;
            authReadyResolve(JFB.user);
            authListeners.forEach(function (fn) { try { fn(JFB.user); } catch (e) {} });
        });
        if (!dnt && cfg.measurementId && !useEmulator) {
            import(base + 'firebase-analytics.js').then(async function (an) {
                if (!(await an.isSupported())) return;
                var analytics = an.getAnalytics(app);
                window.JTubeFirebase.analytics = analytics;
                window.jtubeTrack = function (name, params) { try { an.logEvent(analytics, String(name).slice(0, 40), params || {}); } catch (e) {} };
            }).catch(function () {});
        }
        return app;
    }).catch(function (e) {
        JFB.available = false;
        authReadyResolve(null);
        console.warn('Firebase could not be loaded:', e && e.message);
        return null;
    });
    window.JTubeFirebase.ready = JFB.ready;

    async function ready() {
        var app = await JFB.ready;
        if (!app) throw new Error('Firebase is not available right now. Please check your connection.');
        return app;
    }
    function F() { return M.fs; }

    // ---------------------------------------------------------------- auth
    JFB.isAdminUid = function (uid) { return Boolean(uid) && ADMIN_UIDS.indexOf(uid) !== -1; };
    JFB.onAuth = function (fn) {
        authListeners.push(fn);
        if (JFB._authResolved) { try { fn(JFB.user); } catch (e) {} }
        return function () { authListeners = authListeners.filter(function (f) { return f !== fn; }); };
    };

    function cleanName(n) {
        n = String(n || '').replace(/[<>"'`]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40);
        return n.length >= 2 ? n : (n + 'User').slice(0, 40);
    }

    async function ensureProfile(u, wantedName) {
        var ref = F().doc(JFB.db, 'users', u.uid);
        var snap = await F().getDoc(ref);
        if (snap.exists() && !wantedName) return snap.data();
        var name = cleanName(wantedName || (snap.exists() && snap.data().name) || u.displayName || (u.email || '').split('@')[0]);
        var data = { name: name, createdAt: snap.exists() && snap.data().createdAt ? snap.data().createdAt : Date.now(), updatedAt: F().serverTimestamp() };
        await F().setDoc(ref, data);
        return { name: name, createdAt: data.createdAt };
    }
    JFB.ensureProfile = function (name) { return JFB.user ? ensureProfile(JFB.user, name).then(function (p) { JFB.profile = p; return p; }) : Promise.resolve(null); };

    var AUTH_MESSAGES = {
        'auth/invalid-credential': 'Wrong email or password.',
        'auth/wrong-password': 'Wrong email or password.',
        'auth/user-not-found': 'No account with this email. Please create one.',
        'auth/invalid-email': 'Please enter a valid email address.',
        'auth/email-already-in-use': 'An account with this email already exists. Please sign in.',
        'auth/weak-password': 'Password must be at least 8 characters.',
        'auth/too-many-requests': 'Too many attempts. Please wait a few minutes and try again.',
        'auth/network-request-failed': 'Network error. Please check your internet connection.',
        'auth/popup-closed-by-user': 'The sign-in window was closed.',
        'auth/cancelled-popup-request': 'The sign-in window was closed.',
        'auth/popup-blocked': 'Your browser blocked the sign-in window. Please allow pop-ups for this site.',
        'auth/operation-not-allowed': 'This sign-in method is not enabled in Firebase (Authentication → Sign-in method).',
        'auth/unauthorized-domain': 'This website domain is not authorised in Firebase (Authentication → Settings → Authorized domains).',
        'auth/user-disabled': 'This account has been disabled.'
    };
    function authError(e) {
        var err = new Error(AUTH_MESSAGES[e && e.code] || (e && e.message) || 'Sign-in failed.');
        err.code = e && e.code;
        return err;
    }
    function publicUser(u) {
        return u ? { id: u.uid, uid: u.uid, email: u.email, name: (JFB.profile && JFB.profile.name) || u.displayName || (u.email || '').split('@')[0], isAdmin: JFB.isAdminUid(u.uid) } : null;
    }
    JFB.publicUser = function () { return publicUser(JFB.user); };

    JFB.signIn = async function (email, password) {
        await ready();
        try {
            var cred = await M.auth.signInWithEmailAndPassword(JFB.auth, String(email).trim(), String(password));
            JFB.user = cred.user;
            JFB.profile = await ensureProfile(cred.user).catch(function () { return null; });
            return publicUser(cred.user);
        } catch (e) { throw authError(e); }
    };

    JFB.register = async function (name, email, password) {
        await ready();
        if (String(password || '').length < 8) throw authError({ code: 'auth/weak-password' });
        try {
            var cred = await M.auth.createUserWithEmailAndPassword(JFB.auth, String(email).trim(), String(password));
            var clean = cleanName(name || String(email).split('@')[0]);
            await M.auth.updateProfile(cred.user, { displayName: clean }).catch(function () {});
            JFB.user = cred.user;
            JFB.profile = await ensureProfile(cred.user, clean);
            return publicUser(cred.user);
        } catch (e) { throw authError(e); }
    };

    JFB.signInGoogle = async function () {
        await ready();
        try {
            var provider = new M.auth.GoogleAuthProvider();
            provider.setCustomParameters({ prompt: 'select_account' });
            var cred = await M.auth.signInWithPopup(JFB.auth, provider);
            JFB.user = cred.user;
            JFB.profile = await ensureProfile(cred.user).catch(function () { return null; });
            return publicUser(cred.user);
        } catch (e) { throw authError(e); }
    };

    JFB.resetPassword = async function (email) {
        await ready();
        try { await M.auth.sendPasswordResetEmail(JFB.auth, String(email).trim()); } catch (e) { throw authError(e); }
    };

    JFB.signOut = async function () {
        await ready();
        await M.auth.signOut(JFB.auth);
        JFB.user = null; JFB.profile = null;
    };

    // ---------------------------------------------------------------- catalog
    var cursors = {}; // queryKey -> [lastDocOfPage1, lastDocOfPage2, ...]
    var counts = {};

    function tokens(q) {
        return String(q || '').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(function (w) { return w.length >= 2; }).slice(0, 8);
    }

    function buildQuery(p, withOrder) {
        var f = F();
        var cons = [];
        if (p.type === 'short') cons.push(f.where('isShort', '==', true));
        else if (p.type === 'video') cons.push(f.where('isShort', '==', false));
        if (p.category) cons.push(f.where('category', '==', p.category));
        if (p.channel) cons.push(f.where('channel', '==', p.channel));
        var toks = tokens(p.q);
        if (toks.length) {
            var main = toks.slice().sort(function (a, b) { return b.length - a.length; })[0];
            cons.push(f.where('keywords', 'array-contains', main));
            if (withOrder) cons.push(f.orderBy('views', 'desc'));
        } else if (p.since) {
            cons.push(f.where('timestamp', '>', Number(p.since)));
            if (withOrder) cons.push(f.orderBy('timestamp', 'desc'));
        } else if (withOrder) {
            cons.push(f.orderBy(p.sort === 'popular' ? 'views' : 'timestamp', p.sort === 'oldest' ? 'asc' : 'desc'));
        }
        return { cons: cons, toks: toks };
    }

    function mapVideo(d) {
        var v = d.data();
        v.id = v.id || d.id;
        delete v.keywords;
        return v;
    }

    JFB.catalogPage = async function (params) {
        await ready();
        var f = F();
        var p = Object.assign({ type: 'all', sort: 'latest', page: 1, limit: 24 }, params || {});
        var limit = Math.min(60, Math.max(1, parseInt(p.limit, 10) || 24));
        var page = Math.max(1, parseInt(p.page, 10) || 1);
        var key = JSON.stringify([p.type, p.category || '', p.channel || '', p.q || '', p.sort, p.since || 0, limit]);
        var list = cursors[key] || (cursors[key] = []);
        var built = buildQuery(p, true);
        var col = f.collection(JFB.db, 'videos');

        // walk forward to the requested page if needed (pages are normally requested in order)
        for (var i = list.length; i < page - 1; i++) {
            var qq = f.query.apply(null, [col].concat(built.cons, list[i - 1] ? [f.startAfter(list[i - 1])] : [], [f.limit(limit)]));
            var s = await f.getDocs(qq);
            if (s.empty) return { items: [], total: counts[key] || 0, page: page, hasMore: false };
            list[i] = s.docs[s.docs.length - 1];
        }
        var cons = built.cons.concat(page > 1 && list[page - 2] ? [f.startAfter(list[page - 2])] : [], [f.limit(limit)]);
        var snap = await f.getDocs(f.query.apply(null, [col].concat(cons)));
        if (snap.docs.length) list[page - 1] = snap.docs[snap.docs.length - 1];
        var items = snap.docs.map(mapVideo);
        if (built.toks.length > 1) {
            items = items.filter(function (v) {
                var hay = (v.title + ' ' + v.channel + ' ' + v.category).toLowerCase();
                return built.toks.every(function (t) { return hay.indexOf(t) !== -1; });
            });
        }
        if (counts[key] === undefined && !p.since) {
            try {
                var cq = f.query.apply(null, [col].concat(buildQuery(p, false).cons));
                counts[key] = (await f.getCountFromServer(cq)).data().count;
            } catch (e) { counts[key] = items.length; }
        }
        var total = p.since ? items.length : counts[key];
        return { items: items, total: total, page: page, limit: limit, hasMore: snap.docs.length === limit };
    };

    JFB.getVideo = async function (id) {
        await ready();
        var s = await F().getDoc(F().doc(JFB.db, 'videos', String(id)));
        return s.exists() ? mapVideo(s) : null;
    };

    JFB.stats = async function () {
        await ready();
        var s = await F().getDoc(F().doc(JFB.db, 'public', 'stats'));
        return s.exists() ? s.data() : null;
    };

    JFB.channels = async function () {
        await ready();
        var s = await F().getDoc(F().doc(JFB.db, 'public', 'channels'));
        return s.exists() ? (s.data().list || []) : [];
    };

    JFB.playlistsPage = async function (params) {
        await ready();
        var f = F();
        var p = Object.assign({ page: 1, limit: 24 }, params || {});
        var limit = Math.min(60, parseInt(p.limit, 10) || 24);
        var cons = [];
        if (p.channel) cons.push(f.where('channel', '==', p.channel));
        var toks = tokens(p.q);
        if (toks.length) cons.push(f.where('keywords', 'array-contains', toks.sort(function (a, b) { return b.length - a.length; })[0]));
        cons.push(f.orderBy('publishedAt', 'desc'));
        var key = 'pl' + JSON.stringify([p.channel || '', p.q || '', limit]);
        var list = cursors[key] || (cursors[key] = []);
        var page = Math.max(1, parseInt(p.page, 10) || 1);
        var col = f.collection(JFB.db, 'playlists');
        var snap = await f.getDocs(f.query.apply(null, [col].concat(cons, page > 1 && list[page - 2] ? [f.startAfter(list[page - 2])] : [], [f.limit(limit)])));
        if (snap.docs.length) list[page - 1] = snap.docs[snap.docs.length - 1];
        if (counts[key] === undefined) {
            try { counts[key] = (await f.getCountFromServer(f.query.apply(null, [col].concat(cons.slice(0, -1))))).data().count; } catch (e) { counts[key] = snap.size; }
        }
        return {
            items: snap.docs.map(function (d) { var x = d.data(); x.id = d.id; delete x.videoIds; delete x.keywords; return x; }),
            total: counts[key], page: page, hasMore: snap.docs.length === limit
        };
    };

    JFB.playlist = async function (id) {
        await ready();
        var f = F();
        var s = await f.getDoc(f.doc(JFB.db, 'playlists', String(id)));
        if (!s.exists()) return null;
        var p = s.data(); p.id = s.id;
        var ids = (p.videoIds || []).slice(0, 200);
        var items = [];
        for (var i = 0; i < ids.length; i += 30) {
            var chunk = ids.slice(i, i + 30);
            var snap = await f.getDocs(f.query(f.collection(JFB.db, 'videos'), f.where(f.documentId(), 'in', chunk)));
            var byId = {};
            snap.docs.forEach(function (d) { byId[d.id] = mapVideo(d); });
            chunk.forEach(function (vid) { if (byId[vid]) items.push(byId[vid]); });
        }
        delete p.videoIds; delete p.keywords;
        return { playlist: p, items: items };
    };

    // ---------------------------------------------------------------- community chat
    function viewMessage(d) {
        var m = d.data();
        var uid = JFB.user && JFB.user.uid;
        var ts = m.ts && m.ts.toMillis ? m.ts.toMillis() : (m.ts || Date.now());
        return {
            id: d.id, kind: 'user', uid: m.uid, name: m.name, text: m.hidden ? '' : m.text, hidden: Boolean(m.hidden), deleted: false,
            ts: ts, rev: ts, likes: (m.likes || []).length, liked: Boolean(uid && (m.likes || []).indexOf(uid) !== -1),
            mine: Boolean(uid && m.uid === uid), replyTo: m.replyTo || null, admin: JFB.isAdminUid(m.uid)
        };
    }

    /** Live subscription: cb(messagesArray) on every change. Returns an unsubscribe function. */
    JFB.chatSubscribe = function (cb, onError) {
        var unsub = function () {};
        var stopped = false;
        ready().then(function () {
            if (stopped) return;
            var f = F();
            var q = f.query(f.collection(JFB.db, 'group_messages'), f.orderBy('ts', 'desc'), f.limit(150));
            unsub = f.onSnapshot(q, function (snap) {
                cb(snap.docs.map(viewMessage).reverse());
            }, function (err) { if (onError) onError(err); });
        }).catch(function (e) { if (onError) onError(e); });
        return function () { stopped = true; unsub(); };
    };

    function chatError(e) {
        if (e && e.code === 'permission-denied') return new Error('Message not sent: you are sending too fast (wait 2 seconds), the message is too long, or your account is suspended.');
        return new Error((e && e.message) || 'Could not send the message.');
    }

    JFB.chatSend = async function (text, replyTo) {
        await ready();
        if (!JFB.user) throw new Error('Please sign in to chat.');
        var f = F();
        var profile = JFB.profile || await JFB.ensureProfile();
        var batch = f.writeBatch(JFB.db);
        var ref = f.doc(f.collection(JFB.db, 'group_messages'));
        batch.set(f.doc(JFB.db, 'rate_group', JFB.user.uid), { last: f.serverTimestamp() });
        batch.set(ref, {
            uid: JFB.user.uid, name: profile.name, text: String(text).slice(0, 1000), ts: f.serverTimestamp(), likes: [], hidden: false,
            replyTo: replyTo ? { id: String(replyTo.id).slice(0, 64), name: String(replyTo.name || '').slice(0, 40), text: String(replyTo.text || '').slice(0, 160) } : null
        });
        try { await batch.commit(); } catch (e) { throw chatError(e); }
        return ref.id;
    };

    JFB.chatLike = async function (id, like) {
        await ready();
        if (!JFB.user) throw new Error('Please sign in.');
        var f = F();
        await f.updateDoc(f.doc(JFB.db, 'group_messages', id), { likes: like ? f.arrayUnion(JFB.user.uid) : f.arrayRemove(JFB.user.uid) });
    };

    JFB.chatDelete = async function (id) {
        await ready();
        await F().deleteDoc(F().doc(JFB.db, 'group_messages', id));
    };

    JFB.chatReport = async function (m, reason) {
        await ready();
        if (!JFB.user) throw new Error('Please sign in.');
        var f = F();
        try {
            await f.setDoc(f.doc(JFB.db, 'group_reports', m.id + '_' + JFB.user.uid), {
                mid: m.id, by: JFB.user.uid, reason: String(reason || '').slice(0, 200), ts: f.serverTimestamp(),
                text: String(m.text || '').slice(0, 1000), author: m.uid
            });
            return { reported: true };
        } catch (e) {
            if (e && e.code === 'permission-denied') return { already: true };
            throw e;
        }
    };

    JFB.members = async function () {
        await ready();
        var f = F();
        var snap = await f.getDocs(f.query(f.collection(JFB.db, 'users'), f.orderBy('createdAt', 'desc'), f.limit(300)));
        return snap.docs.map(function (d) { var u = d.data(); return { id: d.id, name: u.name, joined: u.createdAt, online: false, messages: 0, admin: JFB.isAdminUid(d.id) }; });
    };

    JFB.amIBanned = async function () {
        if (!JFB.user) return false;
        try { return (await F().getDoc(F().doc(JFB.db, 'banned', JFB.user.uid))).exists(); } catch (e) { return false; }
    };

    // ---------------------------------------------------------------- forms
    JFB.developerApply = async function (d) {
        await ready();
        var f = F();
        await f.addDoc(f.collection(JFB.db, 'developer_applications'), {
            name: String(d.name || '').slice(0, 100), email: String(d.email || '').slice(0, 150), whatsapp: String(d.whatsapp || '').slice(0, 40),
            github: String(d.github || '').slice(0, 200), picture: String(d.picture || '').slice(0, 300), message: String(d.message || '').slice(0, 1500),
            ts: f.serverTimestamp(), uid: JFB.user ? JFB.user.uid : ''
        });
    };

    // ---------------------------------------------------------------- admin (enforced by firestore.rules)
    function keywordsFor(v) {
        var words = {};
        (String(v.title || '') + ' ' + String(v.channel || '') + ' ' + String(v.category || '')).toLowerCase().split(/[^\p{L}\p{N}]+/u)
            .forEach(function (w) { if (w.length >= 2 && w.length <= 30) words[w] = 1; });
        return Object.keys(words).slice(0, 60);
    }

    JFB.admin = {
        isAdmin: function () { return Boolean(JFB.user && JFB.isAdminUid(JFB.user.uid)); },
        status: async function () {
            await ready();
            var f = F();
            var r = await Promise.all([
                f.getDoc(f.doc(JFB.db, 'sync', 'state')), f.getDoc(f.doc(JFB.db, 'public', 'stats')),
                f.getDoc(f.doc(JFB.db, 'public', 'channels')), f.getDoc(f.doc(JFB.db, 'config', 'channels'))
            ]);
            var st = r[0].exists() ? r[0].data() : {};
            var stats = r[1].exists() ? r[1].data() : { total: 0, videos: 0, shorts: 0 };
            var info = {};
            (r[2].exists() ? r[2].data().list || [] : []).forEach(function (c) { info[c.ytChannelId] = c; });
            var cfgList = r[3].exists() ? (r[3].data().list || []) : Object.values(info).map(function (c) { return { name: c.name, ytChannelId: c.ytChannelId, category: c.category }; });
            var chState = st.channels || {};
            return {
                total: stats.total || 0, videos: stats.videos || 0, shorts: stats.shorts || 0,
                lastIncremental: st.lastIncremental || stats.lastIncremental || 0, lastRun: st.lastRun || 0,
                syncIntervalMinutes: 30, websub: false, firebaseMode: true,
                backfill: st.backfill || { done: 0, total: cfgList.length * 3, complete: false },
                quota: { used: (st.quota && st.quota.used) || 0, limit: st.quotaLimit || 9000, day: st.quota && st.quota.day },
                writes: st.writes || null,
                busy: {}, apiKeyConfigured: Boolean(st.lastRun), lastError: st.lastError || '',
                channels: cfgList.map(function (c) {
                    var i = info[c.ytChannelId] || {}, s = chState[c.ytChannelId] || {};
                    return {
                        name: c.name, ytChannelId: c.ytChannelId, category: c.category || 'General', resync: Boolean(c.resync),
                        avatarUrl: i.avatarUrl || '', subscribers: i.subscribers || 0, totalVideos: i.totalVideos || 0,
                        videosInCatalog: i.videosInCatalog || 0, backfillDone: Boolean(s.backfillDone), lastCheck: s.lastCheck || 0, fetched: s.fetched || 0
                    };
                })
            };
        },
        channelsConfig: async function () {
            await ready();
            var s = await F().getDoc(F().doc(JFB.db, 'config', 'channels'));
            if (s.exists()) return s.data().list || [];
            return (await JFB.channels()).map(function (c) { return { name: c.name, ytChannelId: c.ytChannelId, category: c.category }; });
        },
        saveChannelsConfig: async function (list) {
            await ready();
            var clean = list.map(function (c) {
                var o = { name: cleanName(c.name), ytChannelId: c.ytChannelId, category: String(c.category || 'General').replace(/[<>"'`]/g, '').slice(0, 50) };
                if (c.resync) o.resync = true;
                return o;
            });
            await F().setDoc(F().doc(JFB.db, 'config', 'channels'), { list: clean, updatedAt: Date.now() });
            return clean;
        },
        saveVideo: async function (v) {
            await ready();
            var id = String(v.id || '').replace(/[^\w-]/g, '') || ('adm_' + Date.now().toString(36));
            var doc = Object.assign({}, v, { id: id, source: v.source || 'admin', keywords: keywordsFor(v), isShort: Boolean(v.isShort || v.isReel), views: Number(v.views) || 0, timestamp: Number(v.timestamp) || Date.now() });
            delete doc.comments;
            await F().setDoc(F().doc(JFB.db, 'videos', id), JSON.parse(JSON.stringify(doc)));
            return doc;
        },
        hideVideos: async function (ids) {
            await ready();
            var f = F();
            for (var i = 0; i < ids.length; i += 200) {
                var batch = f.writeBatch(JFB.db);
                ids.slice(i, i + 200).forEach(function (id) {
                    id = String(id).replace(/[^\w-]/g, '');
                    if (!id) return;
                    batch.set(f.doc(JFB.db, 'hidden_videos', id), { at: Date.now() });
                    batch.delete(f.doc(JFB.db, 'videos', id));
                });
                await batch.commit();
            }
        },
        community: async function () {
            await ready();
            var f = F();
            var r = await Promise.all([
                f.getDocs(f.query(f.collection(JFB.db, 'group_reports'), f.limit(200))),
                f.getDocs(f.query(f.collection(JFB.db, 'users'), f.orderBy('createdAt', 'desc'), f.limit(500))),
                f.getDocs(f.collection(JFB.db, 'banned')),
                f.getCountFromServer(f.collection(JFB.db, 'group_messages'))
            ]);
            var banned = {};
            r[2].docs.forEach(function (d) { banned[d.id] = true; });
            var names = {};
            var users = r[1].docs.map(function (d) { var u = d.data(); names[d.id] = u.name; return { id: d.id, name: u.name, email: d.id, createdAt: u.createdAt || 0, banned: Boolean(banned[d.id]) }; });
            var reports = r[0].docs.map(function (d) { var x = d.data(); return { id: d.id, mid: x.mid, author: x.author, authorName: names[x.author] || '?', text: x.text, reason: x.reason, ts: x.ts && x.ts.toMillis ? x.ts.toMillis() : 0 }; })
                .sort(function (a, b) { return b.ts - a.ts; });
            return { users: users, reports: reports, messages: r[3].data().count };
        },
        setBanned: async function (uid, on) {
            await ready();
            var ref = F().doc(JFB.db, 'banned', String(uid));
            if (on) await F().setDoc(ref, { at: Date.now() }); else await F().deleteDoc(ref);
        },
        hideMessage: async function (id, hidden) {
            await ready();
            await F().updateDoc(F().doc(JFB.db, 'group_messages', id), { hidden: Boolean(hidden) });
        },
        dismissReport: async function (id) {
            await ready();
            await F().deleteDoc(F().doc(JFB.db, 'group_reports', id));
        }
    };
})();
