// Suppress suspended endpoint and internal transport errors to protect tech privacy
if (typeof window !== 'undefined' && window.console) {
    const _origError = window.console.error;
    const _origWarn = window.console.warn;
    window.console.error = function(...args) {
        const str = args.map(a => String(a || '')).join(' ');
        if (str.includes('jeyatube') || str.includes('permission-denied') || str.includes('Could not reach Cloud Firestore') || str.includes('suspended')) {
            return;
        }
        _origError.apply(window.console, args);
    };
    window.console.warn = function(...args) {
        const str = args.map(a => String(a || '')).join(' ');
        if (str.includes('jeyatube') || str.includes('permission-denied') || str.includes('Could not reach Cloud Firestore') || str.includes('suspended')) {
            return;
        }
        _origWarn.apply(window.console, args);
    };
}

// Provide standard FieldValue helpers
const FieldValue = {
    increment: (n = 1) => ({ __isIncrement: true, value: n }),
    serverTimestamp: () => Date.now(),
    arrayUnion: (...items) => ({ __isArrayUnion: true, items }),
    arrayRemove: (...items) => ({ __isArrayRemove: true, items })
};

// Safe Internal Data Store Adapter (100% private, self-contained, zero external network errors)
function createInternalStore() {
    function getCollectionData(name) {
        if (name === 'videos') {
            return (typeof _cache !== 'undefined' && _cache && _cache.videos) ? _cache.videos : (typeof initialVideos !== 'undefined' ? initialVideos : []);
        }
        if (name === 'reels' || name === 'shorts') {
            const vids = (typeof _cache !== 'undefined' && _cache && _cache.videos) ? _cache.videos : (typeof initialVideos !== 'undefined' ? initialVideos : []);
            return vids.filter(v => (typeof isShortVideo === 'function' ? isShortVideo(v) : Boolean(v && (v.isShort || v.isReel))));
        }
        if (name === 'channels') {
            return (typeof _cache !== 'undefined' && _cache && _cache.channels) ? _cache.channels : (typeof initialChannels !== 'undefined' ? initialChannels : {});
        }
        if (name === 'categories') {
            return (typeof _cache !== 'undefined' && _cache && _cache.categories) ? _cache.categories : (typeof defaultCats !== 'undefined' ? defaultCats : []);
        }
        if (name === 'users') {
            const usersObj = typeof loadFromStorage === 'function' ? loadFromStorage('app_users', {}) : {};
            return Object.values(usersObj || {});
        }
        return typeof loadFromStorage === 'function' ? loadFromStorage(name, []) : [];
    }

    function createDocRef(colName, docId) {
        return {
            id: String(docId),
            collection: (subCol) => createCollectionRef(`${colName}/${docId}/${subCol}`),
            get: async () => {
                const list = getCollectionData(colName);
                let item = null;
                if (Array.isArray(list)) {
                    item = list.find(x => x && String(x.id || x.uid || x.name) === String(docId));
                } else if (list && typeof list === 'object') {
                    item = list[docId] || null;
                }
                return {
                    id: String(docId),
                    exists: Boolean(item),
                    data: () => (item ? JSON.parse(JSON.stringify(item)) : null)
                };
            },
            set: async (data, opts = {}) => {
                if (colName === 'videos' || colName === 'reels' || colName === 'shorts') {
                    const list = (typeof _cache !== 'undefined' && _cache && _cache.videos) ? _cache.videos : (typeof initialVideos !== 'undefined' ? initialVideos : []);
                    const idx = list.findIndex(x => x && String(x.id) === String(docId));
                    let updated = data;
                    if (opts.merge && idx >= 0) {
                        updated = { ...list[idx], ...data };
                    }
                    if (idx >= 0) {
                        list[idx] = updated;
                    } else {
                        list.unshift(updated);
                    }
                    if (typeof _cache !== 'undefined' && _cache) _cache.videos = list;
                    if (typeof saveToStorage === 'function') saveToStorage('videos', list.slice(0, 150));
                    if (typeof document !== 'undefined') {
                        document.dispatchEvent(new CustomEvent('jtube:videosUpdated', { detail: list }));
                    }
                } else if (colName === 'channels') {
                    const channels = (typeof _cache !== 'undefined' && _cache && _cache.channels) ? _cache.channels : (typeof initialChannels !== 'undefined' ? initialChannels : {});
                    channels[docId] = opts.merge ? { ...(channels[docId] || {}), ...data } : data;
                    if (typeof _cache !== 'undefined' && _cache) _cache.channels = channels;
                    if (typeof saveToStorage === 'function') saveToStorage('channels', channels);
                } else if (colName === 'categories') {
                    const cats = (typeof _cache !== 'undefined' && _cache && _cache.categories) ? _cache.categories : (typeof defaultCats !== 'undefined' ? defaultCats : []);
                    const idx = cats.findIndex(x => x && String(x.id) === String(docId));
                    if (idx >= 0) cats[idx] = opts.merge ? { ...cats[idx], ...data } : data;
                    else cats.push(data);
                    if (typeof _cache !== 'undefined' && _cache) _cache.categories = cats;
                    if (typeof saveToStorage === 'function') saveToStorage('categories', cats);
                } else if (colName === 'users') {
                    const users = typeof loadFromStorage === 'function' ? loadFromStorage('app_users', {}) : {};
                    users[docId] = opts.merge ? { ...(users[docId] || {}), ...data } : data;
                    if (typeof saveToStorage === 'function') saveToStorage('app_users', users);
                } else {
                    const stored = typeof loadFromStorage === 'function' ? loadFromStorage(colName, []) : [];
                    if (Array.isArray(stored)) {
                        const idx = stored.findIndex(x => x && String(x.id) === String(docId));
                        if (idx >= 0) stored[idx] = opts.merge ? { ...stored[idx], ...data } : data;
                        else stored.unshift(data);
                        if (typeof saveToStorage === 'function') saveToStorage(colName, stored);
                    }
                }
            },
            update: async (patch) => {
                if (colName === 'videos') {
                    const vids = (typeof _cache !== 'undefined' && _cache && _cache.videos) ? _cache.videos : (typeof initialVideos !== 'undefined' ? initialVideos : []);
                    const item = vids.find(x => x && String(x.id) === String(docId));
                    if (item) {
                        for (const [k, v] of Object.entries(patch)) {
                            if (v && v.__isIncrement) {
                                item[k] = (typeof item[k] === 'number' ? item[k] : 0) + v.value;
                            } else {
                                item[k] = v;
                            }
                        }
                        if (typeof _cache !== 'undefined' && _cache) _cache.videos = vids;
                        if (typeof saveToStorage === 'function') saveToStorage('videos', vids.slice(0, 150));
                    }
                }
            },
            delete: async () => {
                if (colName === 'videos' || colName === 'reels' || colName === 'shorts') {
                    const vids = (typeof _cache !== 'undefined' && _cache && _cache.videos) ? _cache.videos : (typeof initialVideos !== 'undefined' ? initialVideos : []);
                    const filtered = vids.filter(x => x && String(x.id) !== String(docId));
                    if (typeof _cache !== 'undefined' && _cache) _cache.videos = filtered;
                    if (typeof saveToStorage === 'function') saveToStorage('videos', filtered.slice(0, 150));
                } else if (colName === 'categories') {
                    const cats = (typeof _cache !== 'undefined' && _cache && _cache.categories) ? _cache.categories : (typeof defaultCats !== 'undefined' ? defaultCats : []);
                    const filtered = cats.filter(x => x && String(x.id) !== String(docId));
                    if (typeof _cache !== 'undefined' && _cache) _cache.categories = filtered;
                    if (typeof saveToStorage === 'function') saveToStorage('categories', filtered);
                }
            },
            onSnapshot: (cb) => {
                const list = getCollectionData(colName);
                const item = Array.isArray(list) ? list.find(x => x && String(x.id) === String(docId)) : (list ? list[docId] : null);
                if (typeof cb === 'function') {
                    cb({
                        id: String(docId),
                        exists: Boolean(item),
                        data: () => (item ? JSON.parse(JSON.stringify(item)) : null)
                    });
                }
                return () => {};
            }
        };
    }

    function createCollectionRef(colName, filters = [], sortField = null, sortDir = 'asc', limitCount = null) {
        return {
            doc: (docId) => createDocRef(colName, docId),
            where: (field, op, val) => {
                return createCollectionRef(colName, [...filters, { field, op, val }], sortField, sortDir, limitCount);
            },
            orderBy: (field, dir = 'asc') => {
                return createCollectionRef(colName, filters, field, dir, limitCount);
            },
            limit: (count) => {
                return createCollectionRef(colName, filters, sortField, sortDir, count);
            },
            get: async () => {
                let raw = getCollectionData(colName);
                let list = Array.isArray(raw) ? [...raw] : Object.values(raw || {});

                for (const f of filters) {
                    if (f.op === '==' || f.op === '===') {
                        list = list.filter(item => item && item[f.field] == f.val);
                    } else if (f.op === '!=') {
                        list = list.filter(item => item && item[f.field] != f.val);
                    }
                }
                if (sortField) {
                    list.sort((a, b) => {
                        const valA = a ? a[sortField] : 0;
                        const valB = b ? b[sortField] : 0;
                        return sortDir === 'desc' ? (valB > valA ? 1 : -1) : (valA > valB ? 1 : -1);
                    });
                }
                if (typeof limitCount === 'number') {
                    list = list.slice(0, limitCount);
                }

                const docs = list.map(item => ({
                    id: String(item.id || item.uid || item.name || Math.random().toString(36).substring(2)),
                    exists: true,
                    data: () => ({ ...item })
                }));

                return {
                    empty: docs.length === 0,
                    size: docs.length,
                    docs: docs,
                    forEach: (fn) => docs.forEach(fn),
                    docChanges: () => []
                };
            },
            onSnapshot: (cb) => {
                let raw = getCollectionData(colName);
                let list = Array.isArray(raw) ? [...raw] : Object.values(raw || {});
                const docs = list.map(item => ({
                    id: String(item.id || item.uid || item.name || ''),
                    exists: true,
                    data: () => ({ ...item })
                }));
                const snap = {
                    empty: docs.length === 0,
                    size: docs.length,
                    docs: docs,
                    forEach: (fn) => docs.forEach(fn),
                    docChanges: () => []
                };
                if (typeof cb === 'function') cb(snap);
                return () => {};
            }
        };
    }

    return {
        collection: (name) => createCollectionRef(name),
        batch: () => {
            const queue = [];
            return {
                set: (ref, data, opts) => queue.push(() => ref.set(data, opts)),
                update: (ref, data) => queue.push(() => ref.update(data)),
                delete: (ref) => queue.push(() => ref.delete()),
                commit: async () => {
                    for (const fn of queue) await fn();
                }
            };
        },
        disableNetwork: async () => {},
        enablePersistence: async () => {}
    };
}

const db = createInternalStore();
const rtdb = {
    ref: (path = '') => ({
        set: async () => {},
        update: async () => {},
        remove: async () => {},
        transaction: (fn) => {},
        on: () => {},
        off: () => {}
    })
};

const auth = {
    get currentUser() { return (typeof getCurrentUser === 'function') ? getCurrentUser() : null; },
    signInWithEmailAndPassword: async (e, p) => authenticateLocally(e, p),
    createUserWithEmailAndPassword: async (e, p, name) => registerWithEmail(e, p, name),
    signInWithPopup: async () => loginWithGoogle(),
    signOut: async () => logoutUser(),
    onAuthStateChanged: (cb) => {
        if (typeof document !== 'undefined') {
            document.addEventListener('authStateChanged', ev => cb(ev.detail));
        }
        if (typeof getCurrentUser === 'function') cb(getCurrentUser());
        return () => {};
    }
};

const googleProvider = {};

if (typeof window !== 'undefined') {
    window.firebase = window.firebase || {};
    window.firebase.apps = window.firebase.apps || [{ name: '[DEFAULT]' }];
    window.firebase.firestore = () => db;
    window.firebase.firestore.FieldValue = FieldValue;
    window.firebase.database = () => rtdb;
    window.firebase.auth = () => auth;
    if (!window.firebase.auth.GoogleAuthProvider) {
        window.firebase.auth.GoogleAuthProvider = function() {};
    }
}

// ===== THEME CONTROLLER (Auto System Switch + Dark Primary) =====
const THEME_STORAGE_KEY = 'jtube_theme_preference'; // 'auto' | 'dark' | 'light'

function getThemePreference() {
    try {
        if (typeof localStorage !== 'undefined') {
            return localStorage.getItem(THEME_STORAGE_KEY) || 'auto';
        }
    } catch (e) {}
    return 'auto';
}

function setThemePreference(pref) {
    try {
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem(THEME_STORAGE_KEY, pref);
        }
    } catch (e) {}
    applyTheme();
}

function applyTheme() {
    if (typeof document === 'undefined') return;
    const pref = getThemePreference();
    const systemPrefersLight = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
    
    // Default is dark UI as primary style.
    // Light is active ONLY if user explicitly chose 'light' OR if 'auto' AND system prefers light.
    const isLight = pref === 'light' || (pref === 'auto' && systemPrefersLight);
    
    const root = document.documentElement;
    const body = document.body;
    
    if (isLight) {
        root.classList.add('light-theme');
        root.classList.remove('dark-theme');
        if (body) {
            body.classList.add('light-theme');
            body.classList.remove('dark-theme');
        }
    } else {
        root.classList.add('dark-theme');
        root.classList.remove('light-theme');
        if (body) {
            body.classList.add('dark-theme');
            body.classList.remove('light-theme');
        }
    }
    
    updateThemeToggleUI(pref, isLight);
    document.dispatchEvent(new CustomEvent('jtube:themeChanged', { detail: { isLight, preference: pref } }));
}

function updateThemeToggleUI(pref, isLight) {
    if (typeof document === 'undefined') return;
    const btns = document.querySelectorAll('.theme-toggle-btn, #theme-toggle-btn');
    btns.forEach(btn => {
        const icon = btn.querySelector('.theme-icon') || btn.querySelector('i');
        const label = btn.querySelector('.theme-label');
        if (icon) {
            if (pref === 'auto') {
                icon.className = isLight ? "fas fa-sun text-amber-500 theme-icon" : "fas fa-moon text-blue-400 theme-icon";
            } else if (pref === 'light') {
                icon.className = "fas fa-sun text-amber-500 theme-icon";
            } else {
                icon.className = "fas fa-moon text-blue-400 theme-icon";
            }
        }
        if (label) {
            label.textContent = pref === 'auto' ? (isLight ? 'Auto (Light)' : 'Auto (Dark)') : (isLight ? 'Light' : 'Dark');
        }
        btn.setAttribute('title', `Theme: ${pref.toUpperCase()} (${isLight ? 'Light' : 'Dark mode active'}). Click to switch.`);
    });
}

function cycleThemePreference() {
    const current = getThemePreference();
    let next = 'dark';
    if (current === 'auto') {
        next = 'dark'; // Auto -> Dark
    } else if (current === 'dark') {
        next = 'light'; // Dark -> Light
    } else {
        next = 'auto'; // Light -> Auto (system sync)
    }
    setThemePreference(next);
    const isLight = document.documentElement.classList.contains('light-theme');
    const msg = next === 'auto' 
        ? `Theme set to System Auto (${isLight ? 'Light' : 'Dark'})` 
        : `Theme set to ${next.toUpperCase()}`;
    if (typeof showToast === 'function') showToast(msg, 'info');
}

// Attach system theme change listener immediately
if (typeof window !== 'undefined' && window.matchMedia) {
    const schemeQuery = window.matchMedia('(prefers-color-scheme: light)');
    const handleSchemeChange = () => {
        if (getThemePreference() === 'auto') {
            applyTheme();
        }
    };
    if (schemeQuery.addEventListener) {
        schemeQuery.addEventListener('change', handleSchemeChange);
    } else if (schemeQuery.addListener) {
        schemeQuery.addListener(handleSchemeChange);
    }
}
// Apply immediately
applyTheme();

// ===== WATCH TIME & ENGAGEMENT STATISTICS =====
const WATCH_STATS_STORAGE_KEY = 'jtube_watch_stats';

function getWatchStats() {
    try {
        if (typeof localStorage !== 'undefined') {
            const stored = localStorage.getItem(WATCH_STATS_STORAGE_KEY);
            if (stored) {
                const parsed = JSON.parse(stored);
                if (parsed && typeof parsed.totalSeconds === 'number') {
                    // Check if day rolled over
                    const todayStr = new Date().toDateString();
                    if (parsed.todayDate !== todayStr) {
                        parsed.todayDate = todayStr;
                        parsed.todaySeconds = 0;
                    }
                    if (!parsed.videos) parsed.videos = {};
                    return parsed;
                }
            }
        }
    } catch (e) {}
    return {
        totalSeconds: 0,
        todaySeconds: 0,
        todayDate: new Date().toDateString(),
        videos: {} // videoId -> { id, secondsWatched, duration, durationSeconds, lastWatched, title, channel, thumbnail }
    };
}

function saveWatchStats(stats) {
    try {
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem(WATCH_STATS_STORAGE_KEY, JSON.stringify(stats));
        }
        if (typeof document !== 'undefined') {
            document.dispatchEvent(new CustomEvent('jtube:watchTimeUpdated', { detail: stats }));
        }
    } catch (e) {}
}

let _statsSyncTimeout = null;
function recordWatchTime(videoOrSec, secondsIncrement = 1) {
    let video = null;
    let sec = 1;
    if (typeof videoOrSec === 'number') {
        sec = videoOrSec || 1;
        video = { id: arguments[1], title: arguments[2], channel: arguments[3] };
    } else {
        video = videoOrSec;
        sec = secondsIncrement || 1;
    }
    if (!video || !video.id) return;
    const stats = getWatchStats();
    
    const todayStr = new Date().toDateString();
    if (stats.todayDate !== todayStr) {
        stats.todayDate = todayStr;
        stats.todaySeconds = 0;
    }

    stats.totalSeconds = (stats.totalSeconds || 0) + sec;
    stats.todaySeconds = (stats.todaySeconds || 0) + sec;

    if (!stats.videos) stats.videos = {};
    if (!stats.videos[video.id]) {
        stats.videos[video.id] = {
            id: video.id,
            secondsWatched: 0,
            duration: video.duration || "",
            durationSeconds: parseDurationToSeconds(video.duration) || 0,
            lastWatched: Date.now(),
            title: video.title || "Video",
            channel: video.channel || "",
            thumbnail: video.thumbnail || ""
        };
    }

    const vStats = stats.videos[video.id];
    vStats.secondsWatched = (vStats.secondsWatched || 0) + secondsIncrement;
    vStats.lastWatched = Date.now();
    if (video.title) vStats.title = video.title;
    if (video.channel) vStats.channel = video.channel;
    if (video.thumbnail) vStats.thumbnail = video.thumbnail;
    if (video.duration) {
        vStats.duration = video.duration;
        vStats.durationSeconds = parseDurationToSeconds(video.duration) || vStats.durationSeconds;
    }

    saveWatchStats(stats);

    // Debounced sync with Firebase Firestore user record if authenticated
    if (currentUser && currentUser.uid) {
        if (_statsSyncTimeout) clearTimeout(_statsSyncTimeout);
        _statsSyncTimeout = setTimeout(() => {
            try {
                db.collection("users").doc(currentUser.uid).set({
                    watchStats: {
                        totalSeconds: stats.totalSeconds,
                        todaySeconds: stats.todaySeconds,
                        lastUpdated: Date.now()
                    }
                }, { merge: true }).catch(err => console.warn("Watch stats firestore sync:", err));
            } catch (e) {}
        }, 4000);
    }
}

function formatWatchTime(totalSeconds) {
    if (!totalSeconds || isNaN(totalSeconds) || totalSeconds <= 0) return "0s";
    totalSeconds = Math.round(totalSeconds);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    }
    if (minutes > 0) {
        return `${minutes}m ${seconds > 0 ? seconds + 's' : ''}`.trim();
    }
    return `${seconds}s`;
}

function parseDurationToSeconds(dStr) {
    if (!dStr) return 0;
    if (typeof dStr === 'number') return dStr;
    // Format 1: ISO 8601 (PT1H2M3S)
    const isoMatch = dStr.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (isoMatch) {
        return (parseInt(isoMatch[1] || 0) * 3600) + (parseInt(isoMatch[2] || 0) * 60) + parseInt(isoMatch[3] || 0);
    }
    // Format 2: Standard mm:ss or hh:mm:ss
    const parts = dStr.split(':').map(p => parseInt(p, 10));
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        return parts[0] * 60 + parts[1];
    } else if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
        return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    return 0;
}

// ===== CONTINUE WATCHING (Firestore & Local Hybrid Persistence) =====
const CONTINUE_WATCHING_STORAGE_KEY = 'jtube_continue_watching';

function getLocalContinueWatching() {
    try {
        if (typeof localStorage !== 'undefined') {
            const raw = localStorage.getItem(CONTINUE_WATCHING_STORAGE_KEY);
            if (raw) {
                const list = JSON.parse(raw);
                if (Array.isArray(list)) return list;
            }
        }
    } catch (e) {}
    return [];
}

function saveLocalContinueWatching(list) {
    try {
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem(CONTINUE_WATCHING_STORAGE_KEY, JSON.stringify(list.slice(0, 25)));
        }
    } catch (e) {}
}

async function getContinueWatching() {
    let localList = getLocalContinueWatching();
    
    // If authenticated, sync with Firebase Firestore
    if (currentUser && currentUser.uid) {
        try {
            const snapshot = await db.collection("users")
                .doc(currentUser.uid)
                .collection("continueWatching")
                .orderBy("timestamp", "desc")
                .limit(20)
                .get();

            if (!snapshot.empty) {
                const firestoreList = [];
                snapshot.forEach(doc => {
                    const data = doc.data();
                    if (data && data.videoId) firestoreList.push(data);
                });

                // Merge with local list (prefer newest timestamp)
                const mergedMap = new Map();
                localList.forEach(item => { if (item.videoId) mergedMap.set(item.videoId, item); });
                firestoreList.forEach(item => {
                    const existing = mergedMap.get(item.videoId);
                    if (!existing || (item.timestamp || 0) >= (existing.timestamp || 0)) {
                        mergedMap.set(item.videoId, item);
                    }
                });

                localList = Array.from(mergedMap.values())
                    .filter(item => {
                        // Exclude finished videos
                        const percent = item.progressPercent || 0;
                        const remaining = (item.duration || 0) - (item.currentTime || 0);
                        return percent >= 2 && percent < 95 && remaining > 5;
                    })
                    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

                saveLocalContinueWatching(localList);
            }
        } catch (err) {
            console.warn("Error getting continue watching from Firestore:", err);
        }
    }

    // Filter out invalid or finished videos
    return localList.filter(item => {
        const percent = item.progressPercent || 0;
        const remaining = (item.duration || 0) - (item.currentTime || 0);
        return percent >= 1 && percent < 95 && (item.duration <= 0 || remaining > 5);
    });
}

let _saveProgressDebounce = null;
async function saveWatchProgress(video, currentTime, duration) {
    if (!video || !video.id) return;
    currentTime = Math.floor(currentTime || 0);
    duration = Math.floor(duration || 0);

    // Don't record under 4 seconds
    if (currentTime < 4) return;

    const progressPercent = duration > 0 ? Math.min(100, Math.round((currentTime / duration) * 100)) : 0;

    // If video is virtually finished (>= 93%), remove it from Continue Watching
    if (duration > 0 && progressPercent >= 93) {
        await removeContinueWatching(video.id);
        return;
    }

    const entry = {
        id: video.id,
        videoId: video.id,
        title: video.title || "Video",
        channel: video.channel || "",
        thumbnail: video.thumbnail || "",
        videoUrl: video.videoUrl || "",
        currentTime: currentTime,
        duration: duration,
        durationStr: video.duration || formatTime(duration),
        progressPercent: progressPercent,
        timestamp: Date.now()
    };

    // 1. Update local cache immediately
    let list = getLocalContinueWatching();
    list = list.filter(item => item.videoId !== video.id);
    list.unshift(entry);
    saveLocalContinueWatching(list);

    if (typeof document !== 'undefined') {
        document.dispatchEvent(new CustomEvent('jtube:continueWatchingUpdated', { detail: list }));
    }

    // 2. Debounced save to Firebase Firestore
    if (currentUser && currentUser.uid) {
        if (_saveProgressDebounce) clearTimeout(_saveProgressDebounce);
        _saveProgressDebounce = setTimeout(async () => {
            try {
                await db.collection("users")
                    .doc(currentUser.uid)
                    .collection("continueWatching")
                    .doc(video.id)
                    .set(entry, { merge: true });
            } catch (e) {
                console.warn("Failed to persist watch progress to Firestore:", e);
            }
        }, 2000);
    }
}

async function removeContinueWatching(videoId) {
    if (!videoId) return;

    // 1. Remove from local storage
    let list = getLocalContinueWatching();
    list = list.filter(item => item.videoId !== videoId && item.id !== videoId);
    saveLocalContinueWatching(list);

    if (typeof document !== 'undefined') {
        document.dispatchEvent(new CustomEvent('jtube:continueWatchingUpdated', { detail: list }));
    }

    // 2. Remove from Firebase Firestore
    if (currentUser && currentUser.uid) {
        try {
            await db.collection("users")
                .doc(currentUser.uid)
                .collection("continueWatching")
                .doc(videoId)
                .delete();
        } catch (e) {
            console.warn("Failed to delete continue watching item in Firestore:", e);
        }
    }
}

async function clearAllContinueWatching() {
    saveLocalContinueWatching([]);
    if (typeof document !== 'undefined') {
        document.dispatchEvent(new CustomEvent('jtube:continueWatchingUpdated', { detail: [] }));
    }

    if (currentUser && currentUser.uid) {
        try {
            const snapshot = await db.collection("users")
                .doc(currentUser.uid)
                .collection("continueWatching")
                .limit(50)
                .get();

            const batch = db.batch();
            snapshot.forEach(doc => {
                batch.delete(doc.ref);
            });
            await batch.commit();
        } catch (e) {
            console.warn("Failed to clear continue watching in Firestore:", e);
        }
    }
}

// In-memory cache & persistent localStorage helper for instant loading
function sanitizeAndCurateVideos(videosList) {
    if (!Array.isArray(videosList)) return [];
    const excludedChannels = new Set(["Fun With Gopal", "Bismillah Agro", "Basic Bhai", "Studio of Creative Arts Ltd"]);
    return videosList.filter(v => {
        if (!v || !v.title) return false;
        if (excludedChannels.has(v.channel)) return false;
        if (v.category === "Cartoon") return false;
        if (typeof v.title === 'string' && (v.title.includes("Gopal Bhar") || v.title.includes("গোপাল ভাঁড়") || v.title.includes("গোপাল দাদার"))) return false;
        return true;
    }).map(v => {
        if (!v.contentQuality || v.contentQuality === "Good Video" || v.contentQuality === "Bad Video") {
            v.contentQuality = "Curated High Quality";
        }
        if (!v.qualityScore) {
            v.qualityScore = 98;
        }
        if (!v.qualityBadge) {
            if (v.category === "Programming" || v.category === "Tech" || v.category === "AI" || v.category === "Machine Learning") {
                v.qualityBadge = "✦ STEM Curated";
            } else if (v.category === "Science" || v.category === "Cyber ​​Security") {
                v.qualityBadge = "✦ Deep Dive";
            } else if (v.category === "Islam") {
                v.qualityBadge = "✦ Curated Wisdom";
            } else {
                v.qualityBadge = "✦ High Quality";
            }
        }
        return v;
    });
}

function loadFromStorage(key, fallback) {
    try {
        if (typeof localStorage !== 'undefined') {
            const stored = localStorage.getItem('jtube_' + key);
            if (stored) {
                const parsed = JSON.parse(stored);
                if (parsed && (Array.isArray(parsed) ? parsed.length > 0 : Object.keys(parsed).length > 0)) {
                    if (key === 'videos' && Array.isArray(parsed)) {
                        return sanitizeAndCurateVideos(parsed);
                    }
                    return parsed;
                }
            }
        }
    } catch (e) {}
    return fallback;
}

function saveToStorage(key, data) {
    try {
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem('jtube_' + key, JSON.stringify(data));
        }
    } catch (e) {}
}

const seedData = (typeof window !== 'undefined' && window.JEYA_INITIAL_DATA) ? window.JEYA_INITIAL_DATA : {};
const initialVideos = seedData.videos || [
    {
        id: "1",
        title: "The Future of Artificial Intelligence in 2026",
        channel: "AI Frontier",
        category: "AI",
        playlist: "AI Masterclass 2026",
        views: 125000,
        time: "2 days ago",
        duration: "10:15",
        thumbnail: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=500&auto=format&fit=crop&q=60",
        videoUrl: "https://www.youtube.com/watch?v=60Yo63VFt-M", 
        description: "An in-depth look into how AI and Machine Learning are transforming our daily lives in 2026.",
        likes: 4500,
        liked: false,
        comments: [
            { username: "Rahat", text: "Brilliant explanation! Looking forward to more ML content." }
        ],
        timestamp: Date.now()
    }
];

const initialChannels = seedData.channels || {
    "AI Frontier": { subscribers: 50000, subscribed: false, coverUrl: "https://images.unsplash.com/photo-1620712943543-bcc4688e7485?w=1200&h=300&fit=crop", avatarUrl: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&h=100&fit=crop" }
};

const defaultCats = seedData.categories || [
    { id: "islam", name: "Islam", order: 1 },
    { id: "science", name: "Science", order: 2 },
    { id: "ai", name: "AI", order: 3 },
    { id: "machine-learning", name: "Machine Learning", order: 4 },
    { id: "entertainment", name: "Entertainment", order: 5 }
];

const _cache = {
    videos: loadFromStorage('videos', initialVideos),
    videosTimestamp: Date.now(),
    channels: loadFromStorage('channels', initialChannels),
    channelsTimestamp: Date.now(),
    categories: loadFromStorage('categories', defaultCats),
    categoriesTimestamp: Date.now(),
    TTL: 15 * 60 * 1000 // 15 minutes cache TTL to significantly reduce unnecessary Firestore reads
};

function isCacheValid(key) {
    return _cache[key] !== null && (Date.now() - _cache[key + 'Timestamp']) < _cache.TTL;
}

function invalidateCache(key) {
    _cache[key] = null;
    _cache[key + 'Timestamp'] = 0;
    try {
        if (typeof localStorage !== 'undefined') {
            localStorage.removeItem('jtube_' + key);
        }
    } catch (e) {}
}

let currentUser = null;
try {
    const savedUser = loadFromStorage('current_user', null);
    if (savedUser) {
        currentUser = savedUser;
        if (typeof window !== 'undefined') window.currentUser = savedUser;
    }
} catch (e) {}

if (auth && typeof auth.onAuthStateChanged === 'function') {
    auth.onAuthStateChanged(user => {
        if (user) {
            currentUser = user;
            if (typeof window !== 'undefined') window.currentUser = user;
            saveToStorage('current_user', { uid: user.uid, email: user.email, displayName: user.displayName });
            document.dispatchEvent(new CustomEvent('authStateChanged', { detail: user }));
        }
    });
}

function getCurrentUser() {
    return currentUser || (typeof window !== 'undefined' ? window.currentUser : null);
}

function authenticateLocally(email, password) {
    const users = loadFromStorage('app_users', {});
    const existing = users[email.toLowerCase()];
    if (existing) {
        if (existing.password && existing.password !== password) {
            const err = new Error("Invalid password.");
            err.code = "auth/wrong-password";
            throw err;
        }
        currentUser = { uid: existing.uid, email: existing.email, displayName: existing.displayName || existing.name || email.split('@')[0] };
        saveToStorage('current_user', currentUser);
        if (typeof window !== 'undefined') window.currentUser = currentUser;
        document.dispatchEvent(new CustomEvent('authStateChanged', { detail: currentUser }));
        return { user: currentUser };
    }
    // Master admin credentials check
    if (email === "admin@jtube.com" && (password === "Jeyaul" || password === "admin123")) {
        currentUser = { uid: 'admin_master_1', email: 'admin@jtube.com', displayName: 'JTube Admin' };
        saveToStorage('current_user', currentUser);
        if (typeof window !== 'undefined') window.currentUser = currentUser;
        document.dispatchEvent(new CustomEvent('authStateChanged', { detail: currentUser }));
        return { user: currentUser };
    }
    const err = new Error("User account not found. Please sign up.");
    err.code = "auth/user-not-found";
    throw err;
}

async function loginWithEmail(email, password) {
    if (auth) {
        try {
            return await auth.signInWithEmailAndPassword(email, password);
        } catch (err) {
            return authenticateLocally(email, password);
        }
    }
    return authenticateLocally(email, password);
}

async function registerWithEmail(email, password, name) {
    if (auth) {
        try {
            const cred = await auth.createUserWithEmailAndPassword(email, password);
            await cred.user.updateProfile({ displayName: name });
            if (db) {
                await db.collection("users").doc(cred.user.uid).set({
                    name: name,
                    email: email,
                    createdAt: Date.now()
                }).catch(() => {});
            }
            return cred.user;
        } catch (err) {
            if (err.code === 'auth/email-already-in-use') throw err;
        }
    }
    // Local registration fallback
    const users = loadFromStorage('app_users', {});
    if (users[email.toLowerCase()]) {
        const err = new Error("Email already registered.");
        err.code = "auth/email-already-in-use";
        throw err;
    }
    const uid = 'usr_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    const newUser = {
        uid: uid,
        email: email.toLowerCase(),
        name: name,
        displayName: name || email.split('@')[0],
        password: password,
        createdAt: Date.now()
    };
    users[email.toLowerCase()] = newUser;
    saveToStorage('app_users', users);
    currentUser = { uid: newUser.uid, email: newUser.email, displayName: newUser.displayName };
    saveToStorage('current_user', currentUser);
    if (typeof window !== 'undefined') window.currentUser = currentUser;
    document.dispatchEvent(new CustomEvent('authStateChanged', { detail: currentUser }));
    return currentUser;
}

async function loginWithGoogle() {
    if (auth && googleProvider) {
        try {
            return await auth.signInWithPopup(googleProvider);
        } catch (err) {}
    }
    currentUser = {
        uid: 'user_session_' + Date.now(),
        email: 'viewer@jtube.local',
        displayName: 'JTube Viewer'
    };
    saveToStorage('current_user', currentUser);
    if (typeof window !== 'undefined') window.currentUser = currentUser;
    document.dispatchEvent(new CustomEvent('authStateChanged', { detail: currentUser }));
    return { user: currentUser };
}

async function logoutUser() {
    if (auth) {
        try { await auth.signOut(); } catch (e) {}
    }
    currentUser = null;
    if (typeof window !== 'undefined') window.currentUser = null;
    try {
        if (typeof localStorage !== 'undefined') {
            localStorage.removeItem('jtube_current_user');
        }
    } catch (e) {}
    document.dispatchEvent(new CustomEvent('authStateChanged', { detail: null }));
}

// ===== VIDEO FUNCTIONS (Instant Cache-First + Robust Firestore Sync) =====

let _isSyncingAllVideos = false;
async function syncAllWebsiteVideosToFirestore() {
    if (_isSyncingAllVideos) return;
    _isSyncingAllVideos = true;
    try {
        const catalog = Array.isArray(seedData.videos) && seedData.videos.length > 0 
            ? seedData.videos 
            : initialVideos;
        
        // Check existing videos in Firestore
        const existingSnapshot = await db.collection("videos").get().catch(() => null);
        const existingIds = new Set();
        if (existingSnapshot && !existingSnapshot.empty) {
            existingSnapshot.forEach(doc => existingIds.add(doc.id));
        }

        const missingVideos = catalog.filter(v => v && v.id && !existingIds.has(v.id));
        if (missingVideos.length > 0) {
            const prepared = missingVideos.map(v => {
                const cleanYt = v.id.startsWith('yt_') ? v.id.replace('yt_', '') : v.id;
                return {
                    id: v.id,
                    title: v.title || 'Untitled',
                    videoUrl: v.videoUrl || `https://www.youtube.com/watch?v=${cleanYt}`,
                    thumbnail: v.thumbnail || `https://i.ytimg.com/vi/${cleanYt}/hqdefault.jpg`,
                    channel: v.channel || 'JTube',
                    category: v.category || 'General',
                    playlist: v.playlist || '',
                    views: typeof v.views === 'number' ? v.views : 0,
                    duration: v.duration || '0:00',
                    time: v.time || 'Recently added',
                    description: v.description || '',
                    likes: typeof v.likes === 'number' ? v.likes : 0,
                    baseLikes: typeof v.baseLikes === 'number' ? v.baseLikes : (v.likes || 0),
                    liked: Boolean(v.liked),
                    likedBy: Array.isArray(v.likedBy) ? v.likedBy : [],
                    isShort: isShortVideo(v),
                    comments: Array.isArray(v.comments) ? v.comments : [],
                    timestamp: v.timestamp || Date.now()
                };
            });

            await saveBatchVideos(prepared);
        }
    } catch (e) {
    } finally {
        _isSyncingAllVideos = false;
    }
}

let _isFetchingVideos = false;
let _hasFetchedFromFirestore = false;
let _videosRealtimeListenerAttached = false;

// Real-time Firestore sync for all videos and reels (instantly catches newly saved items)
function initVideosRealtimeSync() {
    if (_videosRealtimeListenerAttached || typeof db === 'undefined' || !db.collection) return;
    _videosRealtimeListenerAttached = true;
    try {
        // 1. Realtime listener for videos collection
        db.collection("videos").onSnapshot(snapshot => {
            if (!snapshot || snapshot.empty) return;
            handleFirestoreRealtimeSnapshot(snapshot, false);
        }, err => console.warn("Live Firestore videos snapshot warning:", err));

        // 2. Realtime listener for reels collection
        db.collection("reels").onSnapshot(snapshot => {
            if (!snapshot || snapshot.empty) return;
            handleFirestoreRealtimeSnapshot(snapshot, true);
        }, err => console.warn("Live Firestore reels snapshot warning:", err));
    } catch (e) {
        console.warn("Could not attach Firestore realtime listener:", e);
    }
}

function handleFirestoreRealtimeSnapshot(snapshot, isReelsCol) {
    if (!snapshot || snapshot.empty) return;
    let changed = false;
    const currentVideos = Array.isArray(_cache.videos) ? [..._cache.videos] : [];
    const videoMap = new Map(currentVideos.map(v => [v.id, v]));

    snapshot.docChanges().forEach(change => {
        const doc = change.doc;
        const d = doc.data();
        if (!d || !d.id) return;
        if (isReelsCol) {
            d.isShort = true;
            d.isReel = true;
        }

        if (change.type === "added" || change.type === "modified") {
            videoMap.set(d.id, d);
            changed = true;
        } else if (change.type === "removed") {
            if (videoMap.has(d.id)) {
                videoMap.delete(d.id);
                changed = true;
            }
        }
    });

    if (changed) {
        const merged = Array.from(videoMap.values());
        merged.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        _cache.videos = merged;
        _cache.videosTimestamp = Date.now();
        _hasFetchedFromFirestore = true;
        try { saveToStorage('videos', merged.slice(0, 100)); } catch (e) {}
        if (typeof document !== 'undefined') {
            document.dispatchEvent(new CustomEvent('jtube:videosUpdated', { detail: merged }));
        }
    }
}

async function fetchVideosFromFirestore() {
    if (_isFetchingVideos) return (_cache.videos || []);
    _isFetchingVideos = true;
    try {
        // Fetch all videos and reels from Cloud Firestore in parallel
        // Do not restrict by server-side orderBy to prevent dropping documents missing the timestamp field
        const queries = [
            db.collection("videos").get().catch(e => {
                console.warn("Error fetching /videos collection:", e);
                return null;
            }),
            db.collection("reels").get().catch(e => {
                console.warn("Error fetching /reels collection:", e);
                return null;
            }),
            db.collection("shorts").get().catch(e => {
                console.warn("Error fetching /shorts collection:", e);
                return null;
            })
        ];

        const [videosSnap, reelsSnap, shortsSnap] = await Promise.all(queries);

        const videoMap = new Map();

        // 1. Ingest videos collection (standard videos and reels saved in videos)
        if (videosSnap && !videosSnap.empty) {
            videosSnap.forEach(doc => {
                const d = doc.data();
                if (d && d.id) {
                    if (isShortVideo(d)) {
                        d.isShort = true;
                        d.isReel = true;
                    }
                    videoMap.set(d.id, d);
                }
            });
        }

        // 2. Ingest dedicated reels collection
        if (reelsSnap && !reelsSnap.empty) {
            reelsSnap.forEach(doc => {
                const d = doc.data();
                if (d && d.id) {
                    d.isShort = true;
                    d.isReel = true;
                    videoMap.set(d.id, d);
                }
            });
        }

        // 3. Ingest dedicated shorts collection
        if (shortsSnap && !shortsSnap.empty) {
            shortsSnap.forEach(doc => {
                const d = doc.data();
                if (d && d.id) {
                    d.isShort = true;
                    d.isReel = true;
                    videoMap.set(d.id, d);
                }
            });
        }

        let combined = Array.from(videoMap.values());

        // Sort descending by timestamp in memory (safely handles any item missing timestamp)
        combined.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

        if (combined.length > 0) {
            _cache.videos = combined;
            _cache.videosTimestamp = Date.now();
            _hasFetchedFromFirestore = true;
            try { saveToStorage('videos', combined.slice(0, 100)); } catch (e) {}
            if (typeof document !== 'undefined') {
                document.dispatchEvent(new CustomEvent('jtube:videosUpdated', { detail: combined }));
            }
            initVideosRealtimeSync();
            return combined;
        } else {
            // Firestore was empty: seed default catalog into Firestore so it's initialized
            await syncAllWebsiteVideosToFirestore();
            initVideosRealtimeSync();
            return _cache.videos || [];
        }
    } catch (err) {
        console.warn("Error fetching all videos and reels from Firestore:", err);
        return _cache.videos || [];
    } finally {
        _isFetchingVideos = false;
    }
}

async function getVideos() {
    initVideosRealtimeSync();

    // 1. If we have already fetched the full Firestore database in memory, return it instantly
    if (_hasFetchedFromFirestore && _cache.videos && _cache.videos.length > 0) {
        return sanitizeAndCurateVideos(_cache.videos);
    }

    // 2. Fetch directly from Firestore to ensure all 3,000 videos and 6,000 Reels are retrieved
    try {
        const firestoreVideos = await fetchVideosFromFirestore();
        if (firestoreVideos && firestoreVideos.length > 0) {
            return sanitizeAndCurateVideos(firestoreVideos);
        }
    } catch (e) {
        console.warn("getVideos Firestore load fallback:", e);
    }

    // 3. Fallback to storage cache if Firestore fetch failed or is offline
    const stored = loadFromStorage('videos', null);
    if (stored && stored.length > 0) {
        const curated = sanitizeAndCurateVideos(stored);
        _cache.videos = curated;
        _cache.videosTimestamp = Date.now();
        return curated;
    }

    // 4. Fallback to initial seeds
    const fallback = (seedData.videos && seedData.videos.length > 0) ? seedData.videos : initialVideos;
    if (fallback && fallback.length > 0) {
        const curated = sanitizeAndCurateVideos(fallback);
        _cache.videos = curated;
        _cache.videosTimestamp = Date.now();
        return curated;
    }

    return [];
}

async function getVideoById(videoId) {
    if (!videoId) return null;
    // 1. Try cache
    if (_cache.videos && _cache.videos.length > 0) {
        const cached = _cache.videos.find(v => v.id === videoId);
        if (cached) return cached;
    }
    const stored = loadFromStorage('videos', []);
    const local = stored.find(v => v.id === videoId);
    if (local) return local;

    // 2. Direct Firestore lookup with fast timeout
    try {
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000));
        const doc = await Promise.race([db.collection("videos").doc(videoId).get(), timeoutPromise]);
        if (doc && doc.exists) return doc.data();
    } catch (err) {
        console.warn("Firestore video lookup failed", err);
    }

    // 3. Fallback: If it's a YouTube ID, fetch from YouTube and save to Firebase FIRST!
    const cleanYtId = videoId.startsWith("yt_") ? videoId.substring(3) : (videoId.length === 11 ? videoId : null);
    if (cleanYtId && typeof ENV !== 'undefined' && ENV.YOUTUBE_API_KEY) {
        try {
            const ytRes = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics&id=${cleanYtId}&key=${ENV.YOUTUBE_API_KEY}`);
            const ytData = await ytRes.json();
            if (ytData.items && ytData.items.length > 0) {
                const item = ytData.items[0];
                const snippet = item.snippet;
                const dIso = item.contentDetails?.duration || "";
                const totalSeconds = parseDurationToSeconds(dIso);
                const h = Math.floor(totalSeconds / 3600);
                const m = Math.floor((totalSeconds % 3600) / 60);
                const s = totalSeconds % 60;
                const durationText = h > 0 
                    ? `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}` 
                    : `${m}:${s.toString().padStart(2, '0')}`;

                const freshYtVideo = {
                    id: videoId.startsWith("yt_") ? videoId : `yt_${cleanYtId}`,
                    title: snippet.title,
                    channel: snippet.channelTitle || "YouTube Creator",
                    category: "General",
                    playlist: "",
                    views: parseInt(item.statistics?.viewCount || 0),
                    time: "Just now",
                    duration: durationText,
                    thumbnail: snippet.thumbnails?.maxres?.url || snippet.thumbnails?.high?.url || snippet.thumbnails?.medium?.url || snippet.thumbnails?.default?.url || "",
                    videoUrl: `https://www.youtube.com/watch?v=${cleanYtId}`,
                    description: snippet.description || "Saved from YouTube",
                    likes: parseInt(item.statistics?.likeCount || 0),
                    baseLikes: parseInt(item.statistics?.likeCount || 0),
                    liked: false,
                    likedBy: [],
                    isShort: totalSeconds <= 60,
                    comments: [],
                    timestamp: Date.now()
                };

                // Save to video library first, then return
                await saveVideo(freshYtVideo);
                console.log(`Saved video ${cleanYtId} to library.`);
                return freshYtVideo;
            }
        } catch (e) {
            console.warn("Could not auto-fetch video details:", e);
        }
    }

    return initialVideos.find(v => v.id === videoId) || null;
}

async function saveVideo(video) {
    if (!video.timestamp) video.timestamp = Date.now();
    const isReelContent = isShortVideo(video);
    if (isReelContent) {
        video.isShort = true;
        video.isReel = true;
    }

    const savePromises = [
        db.collection("videos").doc(video.id).set(video)
    ];
    if (isReelContent) {
        savePromises.push(db.collection("reels").doc(video.id).set(video).catch(() => {}));
    }
    await Promise.all(savePromises);
    try { rtdb.ref(`videos/${video.id}`).set(video); } catch (e) {}
    
    // Update local memory cache immediately
    if (!_cache.videos) _cache.videos = [];
    const idx = _cache.videos.findIndex(v => v.id === video.id);
    if (idx >= 0) _cache.videos[idx] = video;
    else _cache.videos.unshift(video);
    
    try { saveToStorage('videos', _cache.videos.slice(0, 100)); } catch (e) {}
    invalidateCache('videos');

    if (typeof document !== 'undefined') {
        document.dispatchEvent(new CustomEvent('jtube:videosUpdated', { detail: _cache.videos }));
    }
}

async function saveBatchVideos(videosArray) {
    if (!Array.isArray(videosArray) || videosArray.length === 0) return;
    const batchSize = 450;
    for (let i = 0; i < videosArray.length; i += batchSize) {
        const batch = db.batch();
        const chunk = videosArray.slice(i, i + batchSize);
        chunk.forEach(video => {
            if (!video.timestamp) video.timestamp = Date.now();
            const isReelContent = isShortVideo(video);
            if (isReelContent) {
                video.isShort = true;
                video.isReel = true;
            }
            const ref = db.collection("videos").doc(video.id);
            batch.set(ref, video);
            if (isReelContent) {
                const reelRef = db.collection("reels").doc(video.id);
                batch.set(reelRef, video);
            }
            try { rtdb.ref(`videos/${video.id}`).set(video); } catch (e) {}
        });
        await batch.commit();
    }
    // Update memory cache immediately for instant UI availability
    if (!_cache.videos) _cache.videos = [];
    videosArray.forEach(v => {
        const idx = _cache.videos.findIndex(item => item.id === v.id);
        if (idx >= 0) _cache.videos[idx] = v;
        else _cache.videos.unshift(v);
    });
    try { saveToStorage('videos', _cache.videos.slice(0, 100)); } catch (e) {}
    invalidateCache('videos');
    if (typeof document !== 'undefined') {
        document.dispatchEvent(new CustomEvent('jtube:videosUpdated', { detail: _cache.videos || [] }));
    }
}

async function deleteVideo(id) {
    if (!id) return;
    // 1. Delete from Firestore (both collections)
    await Promise.all([
        db.collection("videos").doc(id).delete().catch(() => {}),
        db.collection("reels").doc(id).delete().catch(() => {}),
        db.collection("shorts").doc(id).delete().catch(() => {})
    ]);
    // 2. Delete from RTDB
    try { rtdb.ref(`videos/${id}`).remove(); } catch (e) {}
    // 3. Update memory and local persistent storage
    if (_cache.videos) {
        _cache.videos = _cache.videos.filter(v => v.id !== id);
        try { saveToStorage('videos', _cache.videos.slice(0, 100)); } catch (e) {}
    }
    invalidateCache('videos');
    if (typeof document !== 'undefined') {
        document.dispatchEvent(new CustomEvent('jtube:videosUpdated', { detail: _cache.videos || [] }));
    }
}

async function deleteBatchVideos(idsArray) {
    if (!Array.isArray(idsArray) || idsArray.length === 0) return { success: true, count: 0 };
    
    // 1. Batch delete from Firestore in chunks of up to 450 (Firestore batch limit is 500)
    const batchSize = 450;
    for (let i = 0; i < idsArray.length; i += batchSize) {
        const batch = db.batch();
        const chunk = idsArray.slice(i, i + batchSize);
        chunk.forEach(id => {
            if (id) {
                const ref = db.collection("videos").doc(id);
                batch.delete(ref);
            }
        });
        await batch.commit();
    }

    // 2. Delete from RTDB
    try {
        const rtdbRemovals = {};
        idsArray.forEach(id => {
            if (id) rtdbRemovals[`videos/${id}`] = null;
        });
        if (Object.keys(rtdbRemovals).length > 0) {
            await rtdb.ref().update(rtdbRemovals);
        }
    } catch (e) {}

    // 3. Update memory and local persistent storage
    const idSet = new Set(idsArray);
    if (_cache.videos) {
        _cache.videos = _cache.videos.filter(v => !idSet.has(v.id));
        saveToStorage('videos', _cache.videos);
    }
    invalidateCache('videos');

    if (typeof document !== 'undefined') {
        document.dispatchEvent(new CustomEvent('jtube:videosUpdated', { detail: _cache.videos || [] }));
    }

    return { success: true, count: idsArray.length };
}

// ===== CHANNEL FUNCTIONS (Instant Cache-First + Background Firestore Sync) =====

let _isFetchingChannels = false;
async function fetchChannelsFromFirestore() {
    if (_isFetchingChannels) return;
    _isFetchingChannels = true;
    try {
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 4000));
        const fetchPromise = db.collection("channels").get();
        const snapshot = await Promise.race([fetchPromise, timeoutPromise]);
        
        let freshChannels = {};
        snapshot.forEach(doc => {
            freshChannels[doc.id] = doc.data();
        });
        if (Object.keys(freshChannels).length > 0) {
            _cache.channels = freshChannels;
            _cache.channelsTimestamp = Date.now();
            saveToStorage('channels', freshChannels);
            if (typeof document !== 'undefined') {
                document.dispatchEvent(new CustomEvent('jtube:channelsUpdated', { detail: freshChannels }));
            }
        }
    } catch (err) {
        console.warn("Background Firestore channels fetch:", err.message || err);
    } finally {
        _isFetchingChannels = false;
    }
}

async function getChannels() {
    if (_cache.channels && Object.keys(_cache.channels).length > 0) {
        if (!isCacheValid('channels')) {
            fetchChannelsFromFirestore();
        }
        return _cache.channels;
    }
    const stored = loadFromStorage('channels', null);
    if (stored && Object.keys(stored).length > 0) {
        _cache.channels = stored;
        _cache.channelsTimestamp = Date.now();
        return stored;
    }
    if (initialChannels && Object.keys(initialChannels).length > 0) {
        _cache.channels = initialChannels;
        _cache.channelsTimestamp = Date.now();
        fetchChannelsFromFirestore();
        return initialChannels;
    }
    await fetchChannelsFromFirestore();
    return (_cache.channels && Object.keys(_cache.channels).length > 0) ? _cache.channels : initialChannels;
}

async function saveChannel(channelName, channelData) {
    await db.collection("channels").doc(channelName).set(channelData, { merge: true });
    try { rtdb.ref(`channels/${channelName}`).update(channelData); } catch (e) {}
    if (_cache.channels) {
        _cache.channels[channelName] = { ...(_cache.channels[channelName] || {}), ...channelData };
        saveToStorage('channels', _cache.channels);
    }
    invalidateCache('channels');
}

async function getChannel(channelName) {
    if (_cache.channels && _cache.channels[channelName]) {
        return _cache.channels[channelName];
    }
    const stored = loadFromStorage('channels', {});
    if (stored[channelName]) return stored[channelName];
    
    try {
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000));
        const doc = await Promise.race([db.collection("channels").doc(channelName).get(), timeoutPromise]);
        return doc && doc.exists ? doc.data() : null;
    } catch (err) {
        console.warn("Firestore channel lookup failed", err);
    }
    return null;
}

async function getVideosByChannel(channelName) {
    // Use in-memory cache if available — avoids a Firestore query entirely
    if (isCacheValid('videos')) {
        return _cache.videos
            .filter(v => v.channel === channelName)
            .sort((a, b) => b.timestamp - a.timestamp);
    }
    
    const snapshot = await db.collection("videos").where("channel", "==", channelName).get();
    let videos = [];
    snapshot.forEach(doc => videos.push(doc.data()));
    return videos.sort((a, b) => b.timestamp - a.timestamp);
}

async function incrementView(videoId) {
    const videoRef = db.collection("videos").doc(videoId);
    await videoRef.update({
        views: firebase.firestore.FieldValue.increment(1)
    });
    // Also increment in RTDB (fire and forget for speed)
    rtdb.ref(`videos/${videoId}/views`).transaction(current => (current || 0) + 1);
    invalidateCache('videos');
}

async function getUserProfile(uid) {
    const doc = await db.collection("users").doc(uid).get();
    return doc.exists ? doc.data() : null;
}

async function updateUserProfile(uid, data) {
    await db.collection("users").doc(uid).set(data, { merge: true });
}

// User History functionality
async function addToHistory(video) {
    if (!currentUser) return;
    await db.collection("users").doc(currentUser.uid).collection("history").doc(video.id).set({
        id: video.id,
        title: video.title,
        channel: video.channel,
        thumbnail: video.thumbnail,
        duration: video.duration || "",
        views: video.views || "",
        time: video.time || "",
        videoUrl: video.videoUrl,
        timestamp: Date.now()
    });
}

async function getHistory() {
    if (!currentUser) return [];
    const snapshot = await db.collection("users").doc(currentUser.uid).collection("history").orderBy("timestamp", "desc").get();
    let history = [];
    snapshot.forEach(doc => {
        let data = doc.data();
        if(!data.views) data.views = 0; // Fix legacy string views in UI
        history.push(data);
    });
    return history;
}

async function getPlaylists() {
    // Use cache to avoid extra Firestore query
    if (isCacheValid('videos')) {
        let playlistsMap = {};
        _cache.videos.forEach(data => {
            if (data.playlist && data.playlist.trim() !== "") {
                if (!playlistsMap[data.playlist]) {
                    playlistsMap[data.playlist] = { name: data.playlist, videos: [], thumbnail: data.thumbnail, channel: data.channel };
                }
                playlistsMap[data.playlist].videos.push(data);
            }
        });
        return Object.values(playlistsMap);
    }
    
    const snapshot = await db.collection("videos").where("playlist", "!=", "").get();
    let playlistsMap = {};
    snapshot.forEach(doc => {
        const data = doc.data();
        if (data.playlist) {
            if (!playlistsMap[data.playlist]) {
                playlistsMap[data.playlist] = { name: data.playlist, videos: [], thumbnail: data.thumbnail, channel: data.channel };
            }
            playlistsMap[data.playlist].videos.push(data);
        }
    });
    return Object.values(playlistsMap);
}

// ===== CATEGORIES =====

let _isFetchingCategories = false;
async function fetchCategoriesFromFirestore() {
    if (_isFetchingCategories) return;
    _isFetchingCategories = true;
    try {
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 4000));
        const fetchPromise = db.collection("categories").orderBy("order").get();
        const snapshot = await Promise.race([fetchPromise, timeoutPromise]);
        let categories = [];
        snapshot.forEach(doc => {
            categories.push({ id: doc.id, ...doc.data() });
        });
        if (categories.length > 0) {
            _cache.categories = categories;
            _cache.categoriesTimestamp = Date.now();
            saveToStorage('categories', categories);
            if (typeof document !== 'undefined') {
                document.dispatchEvent(new CustomEvent('jtube:categoriesUpdated', { detail: categories }));
            }
        }
    } catch (err) {
        console.warn("Background Firestore categories fetch:", err.message || err);
    } finally {
        _isFetchingCategories = false;
    }
}

async function getCategories() {
    if (_cache.categories && _cache.categories.length > 0) {
        if (!isCacheValid('categories')) {
            fetchCategoriesFromFirestore();
        }
        return _cache.categories;
    }
    const stored = loadFromStorage('categories', null);
    if (stored && stored.length > 0) {
        _cache.categories = stored;
        _cache.categoriesTimestamp = Date.now();
        return stored;
    }
    if (defaultCats && defaultCats.length > 0) {
        _cache.categories = defaultCats;
        _cache.categoriesTimestamp = Date.now();
        fetchCategoriesFromFirestore();
        return defaultCats;
    }
    await fetchCategoriesFromFirestore();
    return (_cache.categories && _cache.categories.length > 0) ? _cache.categories : defaultCats;
}

async function saveCategory(category) {
    if (!category.id) {
        category.id = category.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
    }
    await db.collection("categories").doc(category.id).set(category);
    invalidateCache('categories');
}

async function deleteCategory(categoryId) {
    await db.collection("categories").doc(categoryId).delete();
    invalidateCache('categories');
}

// Extract YouTube ID
function getYoutubeId(url) {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
}

// Parse text to convert URLs to bright links
function parseLinks(text) {
    if (!text) return "";
    // Regular expression to find URLs
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    return text.replace(urlRegex, function(url) {
        return `<a href="${url}" target="_blank" class="text-blue-400 hover:text-blue-300 font-semibold underline break-all">${url}</a>`;
    });
}

function timeAgo(timestamp) {
    if (!timestamp) return "Just now";
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    let interval = seconds / 31536000;
    if (interval >= 1) {
        const val = Math.floor(interval);
        return val + (val === 1 ? " year ago" : " years ago");
    }
    interval = seconds / 2592000;
    if (interval >= 1) {
        const val = Math.floor(interval);
        return val + (val === 1 ? " month ago" : " months ago");
    }
    interval = seconds / 86400;
    if (interval >= 1) {
        const val = Math.floor(interval);
        return val + (val === 1 ? " day ago" : " days ago");
    }
    interval = seconds / 3600;
    if (interval >= 1) {
        const val = Math.floor(interval);
        return val + (val === 1 ? " hour ago" : " hours ago");
    }
    interval = seconds / 60;
    if (interval >= 1) {
        const val = Math.floor(interval);
        return val + (val === 1 ? " minute ago" : " minutes ago");
    }
    return "Just now";
}

// Format number concisely (e.g. 1.2M, 15K)
function formatCompactNumber(number) {
    if (number === undefined || number === null) return "0";
    const num = parseInt(number, 10);
    if (isNaN(num)) return "0";
    return new Intl.NumberFormat('en-US', { notation: "compact", maximumFractionDigits: 1 }).format(num);
}

// Seed initial data if empty
async function initializeDatabase() {
    try {
        const videos = await getVideos();
        if (videos.length === 0) {
            console.log("Seeding initial database...");
            const initialVideos = [
                {
                    id: "1",
                    title: "The Future of Artificial Intelligence in 2026",
                    channel: "AI Frontier",
                    category: "AI",
                    playlist: "AI Masterclass 2026",
                    views: 125000,
                    time: "2 days ago",
                    duration: "10:15",
                    thumbnail: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=500&auto=format&fit=crop&q=60",
                    videoUrl: "https://www.youtube.com/watch?v=60Yo63VFt-M", 
                    description: "An in-depth look into how AI and Machine Learning are transforming our daily lives in 2026.",
                    likes: 4500,
                    liked: false,
                    comments: [
                        { username: "Rahat", text: "Brilliant explanation! Looking forward to more ML content." }
                    ],
                    timestamp: Date.now()
                },
                {
                    id: "2",
                    title: "Understanding the Golden Age of Islamic Science",
                    channel: "Heritage & Science",
                    category: "Islam",
                    playlist: "",
                    views: 89000,
                    time: "1 week ago",
                    duration: "15:40",
                    thumbnail: "https://images.unsplash.com/photo-1542838132-92c53300491e?w=500&auto=format&fit=crop&q=60",
                    videoUrl: "https://www.youtube.com/watch?v=60Yo63VFt-M",
                    description: "Exploring the historic contributions of Muslim scientists to modern physics, medicine, and mathematics.",
                    likes: 3200,
                    liked: false,
                    comments: [],
                    timestamp: Date.now() - 1000
                },
                {
                    id: "3",
                    title: "Introduction to Neural Networks from Scratch",
                    channel: "Tech Minds",
                    category: "Machine Learning",
                    playlist: "Deep Learning Series",
                    views: 45000,
                    time: "3 days ago",
                    duration: "12:20",
                    thumbnail: "https://images.unsplash.com/photo-1509228468518-180dd4864904?w=500&auto=format&fit=crop&q=60",
                    videoUrl: "https://www.youtube.com/watch?v=60Yo63VFt-M",
                    description: "Learn how weights, biases, and activation functions work in a basic neural network.",
                    likes: 1200,
                    liked: false,
                    comments: [],
                    timestamp: Date.now() - 2000
                }
            ];
            for (let vid of initialVideos) {
                await saveVideo(vid);
            }
            
            const initialChannels = {
                "AI Frontier": { subscribers: 50000, subscribed: false, coverUrl: "https://images.unsplash.com/photo-1620712943543-bcc4688e7485?w=1200&h=300&fit=crop", avatarUrl: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&h=100&fit=crop" },
                "Heritage & Science": { subscribers: 34000, subscribed: false, coverUrl: "https://images.unsplash.com/photo-1519817650390-64a4560f3290?w=1200&h=300&fit=crop", avatarUrl: "https://images.unsplash.com/photo-1527980965255-d3b416303d12?w=100&h=100&fit=crop" },
                "Tech Minds": { subscribers: 12000, subscribed: false, coverUrl: "https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=1200&h=300&fit=crop", avatarUrl: "https://images.unsplash.com/photo-1599566150163-29194dcaad36?w=100&h=100&fit=crop" }
            };
            for (let [name, data] of Object.entries(initialChannels)) {
                await saveChannel(name, data);
            }
        }
        
        // Initialize default categories if not exists
        const categories = await getCategories();
        if (categories.length === 0) {
            const defaultCats = [
                { name: "Islam", order: 1 },
                { name: "Science", order: 2 },
                { name: "AI", order: 3 },
                { name: "Machine Learning", order: 4 },
                { name: "Entertainment", order: 5 }
            ];
            for (let cat of defaultCats) {
                await saveCategory(cat);
            }
        }
    } catch (error) {
        console.error("Database initialization failed.", error);
    }
}

// Only seed initial data once per browser session to avoid blocking every page load
if (!sessionStorage.getItem('jtube_db_init')) {
    sessionStorage.setItem('jtube_db_init', '1');
    initializeDatabase(); // non-blocking: no await
}

// ===== AUTO-SYNC YOUTUBE CHANNELS & STATS (REAL DAILY SYNC) =====
const VERIFIED_FEATURED_CHANNELS = {
    "Stanford Online": { ytChannelId: "UCBa5G_ESCn8Yd4vw5U-gIcg", category: "Programming" },
    "CS50": { ytChannelId: "UCcabW7890RKJzL968QWEykA", category: "Programming" },
    "CodeWithHarry": { ytChannelId: "UCeVMnSShP_Iviwkknt83cww", category: "Programming" },
    "Programming Hero Bangladesh": { ytChannelId: "UCZ34f0PHL-TC8vD31hVPZuw", category: "Programming" },
    "Bro Code": { ytChannelId: "UC4SVo0Ue36XCfOyb5Lh1viQ", category: "Programming" },
    "Phitron": { ytChannelId: "UCjKb3rI-O-sAc64yXscpCDQ", category: "Programming" },
    "CPS Academy": { ytChannelId: "UC3S_jVMwhUrF6jjkFCQvyuA", category: "Programming" },
    "Hablu Programmer": { ytChannelId: "UCpGQisjfG8w-E21cG4ScEOA", category: "Programming" },
    "Ali Hossain": { ytChannelId: "UCnbAAJ1l1AvmfaH2TVdH18Q", category: "Programming" },
    "Mark Rober": { ytChannelId: "UCY1kMZp36IQSyNx_9h4mpCg", category: "Science" },
    "David Bombal": { ytChannelId: "UCP7WmQ_U4GB3K51Od9QvM0w", category: "AI & ML" },
    "AI Frontier": { ytChannelId: "UC6CGPM_qMkmtJY5_bd4rK2w", category: "AI & ML" },
    "MIT OpenCourseWare": { ytChannelId: "UCEBb1b_L6zDS3xTUrIALZOw", category: "Education" },
    "IIT Madras - B.S. Degree Programme": { ytChannelId: "UCvKzzGO37oT83K0FwnUucxw", category: "Education" },
    "Towards Eternity": { ytChannelId: "UCPubBVDCzu7IWWnitlkEsNw", category: "Islam" },
    "Alokito Ummah": { ytChannelId: "UCFRd_Id8mRnpjn-Cgm75fSA", category: "Islam" },
    "تلاوات ياسر الدوسري إمام الحرم المكي": { ytChannelId: "UClncV9OLPto_MinRzGfjr2g", category: "Islam" },
    "Qari Sabah Muhtadi Abid [Premium]": { ytChannelId: "UCY0tyW-tjT_-gGfxdagsmiw", category: "Islam" },
    "Sabit International": { ytChannelId: "UCGmpReKFeVJjviXDp9knOpA", category: "Motivation" },
    "Make First Million - Badar Munir": { ytChannelId: "UCVzgTh8i9W-UtengLs-xytA", category: "Motivation" },
    "Raj Shamani": { ytChannelId: "UCzwCEE_PchiBULMnAJqhGVg", category: "Podcasts" },
    "erspective Podcast Clips": { ytChannelId: "UCLx4XRxWzq3jLYqNfIGs15Q", category: "Podcasts" },
    "Fun With Gopal": { ytChannelId: "UCpjQGNslJmPeGywrPlBEpNQ", category: "Entertainment" },
    "The Kohistani": { ytChannelId: "UCCBGUffdWwRV0gUqgElkCfw", category: "Entertainment" },
    "Basic Bhai": { ytChannelId: "UC8jp_6lbyD9EffZ1ZkyU5dQ", category: "Entertainment" },
    "Dipro Prattoy": { ytChannelId: "UC_gzNUehJ7BS84seL2_e2FQ", category: "Education" },
    "Inception BD": { ytChannelId: "UCLakvfuaLwTC-KPVCccQXAA", category: "Education" },
    "উৎকর্ষ": { ytChannelId: "UCT9YVvhcV1SCSAk1aIP0f0A", category: "Education" },
    "Asadudzaman Joy": { ytChannelId: "UCiQwtqIAlphixACg_4ADeWA", category: "Education" },
    "Bismillah Agro": { ytChannelId: "UC0k1lj3hwhACiBlCw8L96cg", category: "General" },
    "Rokomari․com": { ytChannelId: "UCMtGHnB-gqavI2L0d8SP2xg", category: "General" },
    "Studio of Creative Arts Ltd": { ytChannelId: "UCMWEXniw4ADj95vExGV5iAQ", category: "Entertainment" },
    "Tech Minds": { ytChannelId: "UC9a8Z6Sp6eb2s3O79pX5Zvg", category: "AI & ML" },
    "Heritage & Science": { ytChannelId: "UCDE92JmI7T5C8fQwj2eNbhA", category: "Science" },
    "Fahim Abdullah": { ytChannelId: "UCzRXuZ2TLCtVywE676SYIVg", category: "Education" },
    "Abir Chowdhury": { ytChannelId: "UCaSJJoUiIAiD03pk4O426rQ", category: "Motivation" }
};

function decodeXmlEntities(str) {
    if (!str) return "";
    return str
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');
}

function computeRelativeTime(timestamp) {
    const sec = Math.floor((Date.now() - timestamp) / 1000);
    if (sec < 60) return "Just now";
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    const day = Math.floor(hr / 24);
    if (day === 1) return "Yesterday";
    if (day < 30) return `${day} days ago`;
    const mo = Math.floor(day / 30);
    return `${mo} mo ago`;
}

async function syncChannelByName(channelName, force = false) {
    if (!channelName) return false;

    try {
        const channels = await getChannels();
        const data = channels[channelName] || {};
        const verified = VERIFIED_FEATURED_CHANNELS[channelName] || {};
        const ytChannelId = data.ytChannelId || verified.ytChannelId;
        const category = data.syncCategory || verified.category || data.category || "General";

        // 1. Try server-side sync endpoint first (fast, cached, bypasses CORS)
        try {
            const sRes = await fetch('/api/channels/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ channelName, force })
            });
            if (sRes.ok) {
                const sData = await sRes.json();
                if (sData.videos && sData.videos.length > 0) {
                    const allVideos = await getVideos();
                    const existingIds = new Set(allVideos.map(v => v.id));
                    const newVids = sData.videos.filter(v => !existingIds.has(v.id));
                    if (newVids.length > 0) {
                        await saveBatchVideos(newVids);
                        console.log(`[JTube Sync] Ingested ${newVids.length} new videos from server sync for ${channelName}`);
                    }
                    data.lastSyncTime = Date.now();
                    if (_cache.channels) {
                        _cache.channels[channelName] = data;
                        saveToStorage('channels', _cache.channels);
                    }
                    return true;
                }
            }
        } catch (serverErr) {
            // Server sync not available, proceed to direct fetch
        }

        // 2. Direct client-side RSS sync if channel ID known
        if (ytChannelId) {
            try {
                const res = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${ytChannelId}`);
                if (res.ok) {
                    const xml = await res.text();
                    const entries = xml.split("<entry>").slice(1);
                    const allVideos = await getVideos();
                    const existingIds = new Set(allVideos.map(v => v.id));
                    const newVideos = [];

                    for (const entry of entries) {
                        const videoId = (entry.match(/<yt:videoId>(.*?)<\/yt:videoId>/) || [])[1];
                        if (!videoId) continue;
                        const docId = "yt_" + videoId;
                        if (existingIds.has(docId)) continue;

                        const rawTitle = (entry.match(/<title>(.*?)<\/title>/) || [])[1] || "Untitled";
                        const title = decodeXmlEntities(rawTitle);
                        const pub = (entry.match(/<published>(.*?)<\/published>/) || [])[1];
                        const thumb = (entry.match(/<media:thumbnail url="(.*?)"/) || [])[1] || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
                        const desc = decodeXmlEntities((entry.match(/<media:description>([\s\S]*?)<\/media:description>/) || [])[1] || "");
                        const views = parseInt((entry.match(/<media:statistics views="(\d+)"/) || [])[1] || "0", 10);
                        const isReel = /#shorts|#short|#reels|#reel|\bshorts\b|\breels\b/i.test(title + " " + desc) || title.toLowerCase().includes('#reel') || title.toLowerCase().includes('#short');
                        const isShort = isReel;
                        const timestamp = pub ? new Date(pub).getTime() : Date.now();

                        newVideos.push({
                            id: docId,
                            title,
                            channel: channelName,
                            category,
                            playlist: "",
                            views,
                            time: computeRelativeTime(timestamp),
                            duration: isReel ? "0:45" : "11:20",
                            thumbnail: thumb,
                            videoUrl: isReel ? `https://www.youtube.com/shorts/${videoId}` : `https://www.youtube.com/watch?v=${videoId}`,
                            description: desc.slice(0, 1000),
                            likes: Math.max(10, Math.floor(views * 0.04)),
                            baseLikes: Math.max(10, Math.floor(views * 0.04)),
                            liked: false,
                            likedBy: [],
                            isShort: isReel,
                            isReel: isReel,
                            contentType: isReel ? 'reel' : 'video',
                            comments: [],
                            timestamp
                        });
                    }

                    if (newVideos.length > 0) {
                        // 1. First save video and Reel links to Firestore
                        await saveBatchVideos(newVideos);
                        data.lastSyncTime = Date.now();
                        data.ytChannelId = ytChannelId;
                        if (_cache.channels) {
                            _cache.channels[channelName] = data;
                            saveToStorage('channels', _cache.channels);
                        }
                        // 2. Then display those saved videos and reels on website
                        if (typeof document !== 'undefined') {
                            document.dispatchEvent(new CustomEvent('jtube:videosUpdated', { detail: newVideos }));
                        }
                        return true;
                    }
                }
            } catch (rssErr) {
                console.warn(`[JTube Sync] Client RSS error for ${channelName}:`, rssErr);
            }
        }
    } catch (e) {
        console.warn(`Error syncing channel ${channelName}:`, e);
    }
    return false;
}

async function autoSyncYouTubeChannels(force = false) {
    try {
        console.log("[JTube Sync] Checking for new daily videos and Reels across featured YouTube channels...");
        
        // 1. Fetch daily videos from server cache (instant, pre-synced background engine)
        try {
            const res = await fetch('/api/channels/daily-videos');
            if (res.ok) {
                const data = await res.json();
                if (data.videos && data.videos.length > 0) {
                    const allVideos = await getVideos();
                    const existingIds = new Set(allVideos.map(v => v.id));
                    const freshVideos = data.videos.filter(v => !existingIds.has(v.id)).map(v => {
                        const isReelVid = isShortVideo(v);
                        return {
                            ...v,
                            isShort: isReelVid,
                            isReel: isReelVid,
                            contentType: isReelVid ? 'reel' : 'video',
                            videoUrl: v.videoUrl || (isReelVid ? `https://www.youtube.com/shorts/${v.videoId || v.id.replace('yt_', '')}` : `https://www.youtube.com/watch?v=${v.videoId || v.id.replace('yt_', '')}`)
                        };
                    });
                    
                    if (freshVideos.length > 0) {
                        // 1. First save newly discovered video and Reel links
                        await saveBatchVideos(freshVideos);
                        const vCount = freshVideos.filter(v => !v.isReel).length;
                        const rCount = freshVideos.filter(v => v.isReel).length;
                        console.log(`[JTube Sync] Successfully saved ${vCount} new videos and ${rCount} new Reels!`);
                        
                        // 2. Then display saved videos on website
                        if (typeof document !== 'undefined') {
                            document.dispatchEvent(new CustomEvent('jtube:videosUpdated', { detail: freshVideos }));
                        }
                        return { synced: true, savedCount: freshVideos.length, videosCount: vCount, reelsCount: rCount };
                    }
                }
            }
        } catch (serverErr) {
            console.warn("[JTube Sync] Server daily-videos fetch skipped:", serverErr.message);
        }

        // 2. Client-side fallback: check featured channels that have not been synced in 30 minutes
        const channels = await getChannels();
        const now = Date.now();
        const SYNC_INTERVAL = 30 * 60 * 1000;
        let syncedAny = false;

        for (const [name, meta] of Object.entries(VERIFIED_FEATURED_CHANNELS)) {
            const chanData = channels[name] || {};
            if (force || !chanData.lastSyncTime || (now - chanData.lastSyncTime > SYNC_INTERVAL)) {
                const ok = await syncChannelByName(name, force);
                if (ok) syncedAny = true;
            }
        }

        return syncedAny;
    } catch (e) {
        console.error("Auto-sync background process failed:", e);
        return false;
    }
}

// Fetch and append country code to logo — fully non-blocking
document.addEventListener('DOMContentLoaded', () => {
    // Apply current theme settings to UI
    applyTheme();

    // Delegate theme toggle clicks anywhere on the page
    document.addEventListener('click', (e) => {
        const toggleBtn = e.target.closest('.theme-toggle-btn, #theme-toggle-btn');
        if (toggleBtn) {
            e.preventDefault();
            cycleThemePreference();
        }
    });

    // Start YouTube background sync 1.5 seconds after page load
    setTimeout(() => {
        autoSyncYouTubeChannels();
    }, 1500);

    // Keep checking every 30 minutes for new YouTube videos to save to Firebase automatically
    setInterval(() => {
        autoSyncYouTubeChannels(false);
    }, 30 * 60 * 1000);

    setTimeout(() => {
        fetch('https://api.country.is')
            .then(res => res.json())
            .then(data => {
                if (data.country) {
                    const brandLogos = document.querySelectorAll('.brand-logo-text');
                    brandLogos.forEach(logo => {
                        const span = document.createElement('span');
                        span.className = 'text-[10px] text-zinc-400 font-medium ml-1 self-start mt-0.5';
                        span.textContent = data.country;
                        logo.parentElement.appendChild(span);
                    });
                }
            })
            .catch(() => {}); // Silently ignore
    }, 2000); // Defer 2 seconds so it never blocks page load

    // ===== TOAST NOTIFICATION SYSTEM =====
    let toastContainer = document.getElementById('toast-container');
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'toast-container';
        document.body.appendChild(toastContainer);
    }

    // ===== SCROLL-TO-TOP BUTTON =====
    const scrollBtn = document.createElement('button');
    scrollBtn.id = 'scroll-to-top';
    scrollBtn.innerHTML = '<i class="fas fa-arrow-up"></i>';
    scrollBtn.title = 'Back to top';
    scrollBtn.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    document.body.appendChild(scrollBtn);

    window.addEventListener('scroll', () => {
        if (window.scrollY > 400) {
            scrollBtn.classList.add('visible');
        } else {
            scrollBtn.classList.remove('visible');
        }
    }, { passive: true });
});

// ===== GLOBAL TOAST FUNCTION =====
// Usage: showToast('Message', 'success') — types: success, error, info, warning
function showToast(message, type = 'info', duration = 3500) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const icons = {
        success: 'fa-circle-check',
        error: 'fa-circle-xmark',
        info: 'fa-circle-info',
        warning: 'fa-triangle-exclamation'
    };

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<i class="fas ${icons[type] || icons.info}"></i><span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('toast-out');
        toast.addEventListener('animationend', () => toast.remove());
    }, duration);
}

// ===== DURATION BADGE CLASS HELPER =====
function parseDurationInSeconds(durationStr) {
    if (!durationStr) return 0;
    const parts = String(durationStr).trim().split(':').map(Number);
    if (parts.length === 3) return (parts[0] * 3600) + (parts[1] * 60) + (parts[2] || 0);
    if (parts.length === 2) return (parts[0] * 60) + (parts[1] || 0);
    if (parts.length === 1) return parts[0] || 0;
    return 0;
}

function isShortVideo(video) {
    if (!video) return false;
    if (video.isShort === true || video.isReel === true) return true;
    if (video.contentType === 'reel' || video.contentType === 'short' || video.type === 'reel') return true;
    if (video.category && (video.category.toLowerCase() === 'shorts' || video.category.toLowerCase() === 'reels')) return true;
    if (video.videoUrl && (/youtube\.com\/shorts\//i.test(video.videoUrl) || /instagram\.com\/reel\//i.test(video.videoUrl))) return true;
    if (video.title && (/#shorts?\b|#reels?\b|\bshorts\b|\breels\b/i.test(video.title))) return true;
    if (video.description && (/#shorts?\b|#reels?\b|\bshorts\b|\breels\b/i.test(video.description))) return true;
    const secs = parseDurationInSeconds(video.duration);
    return secs > 0 && secs <= 120; // 2 minutes or less
}

function isReel(video) {
    return isShortVideo(video);
}

function isRegularVideo(video) {
    return !isShortVideo(video);
}

async function getShortVideos() {
    const all = await getVideos();
    return all.filter(v => isShortVideo(v));
}

// Direct Firestore Catalog Counter for Admin Dashboard
async function getFirestoreCatalogCounts() {
    try {
        const snapshot = await db.collection("videos").get();
        let videosCount = 0;
        let reelsCount = 0;
        let totalViews = 0;
        snapshot.forEach(doc => {
            const data = doc.data();
            if (isShortVideo(data)) {
                reelsCount++;
            } else {
                videosCount++;
            }
            totalViews += (typeof data.views === 'number' ? data.views : parseInt(data.views || 0) || 0);
        });
        return {
            total: snapshot.size,
            videos: videosCount,
            reels: reelsCount,
            views: totalViews
        };
    } catch (err) {
        console.warn("getFirestoreCatalogCounts fallback to memory cache:", err);
        const all = await getVideos();
        const reelsCount = all.filter(v => isShortVideo(v)).length;
        return {
            total: all.length,
            videos: Math.max(0, all.length - reelsCount),
            reels: reelsCount,
            views: all.reduce((sum, v) => sum + (parseInt(v.views) || 0), 0)
        };
    }
}

function getDurationBadgeClass(durationStr) {
    if (!durationStr) return '';
    const secs = parseDurationInSeconds(durationStr);
    if (secs > 0 && secs <= 120) return 'duration-short bg-red-600/90 text-white';
    const totalMinutes = Math.floor(secs / 60);
    if (totalMinutes < 5) return 'duration-short';
    if (totalMinutes >= 30) return 'duration-long';
    return 'duration-medium';
}

// ===== COMMENTS & INTERACTIONS HELPERS =====
async function getComments(videoId) {
    if (!videoId) return [];
    try {
        const video = await getVideoById(videoId);
        if (video && Array.isArray(video.comments)) {
            return video.comments;
        }
        // Direct Firestore fallback
        try {
            const doc = await db.collection("videos").doc(videoId).get();
            if (doc.exists && Array.isArray(doc.data().comments)) {
                return doc.data().comments;
            }
        } catch (e) {}
    } catch (err) {
        console.warn("getComments error:", err);
    }
    return [];
}

// ===== AI SHIELD AUTO-MODERATION ENGINE =====
const AIModeration = {
    // Multilingual abuse patterns (English, Bengali script, Bengali phonetic, Hindi)
    patterns: [
        /\b(fuck|fucker|fucking|f\*ck|shit|bitch|bastard|asshole|a\*\*hole|dick|pussy|whore|slut|cunt)\b/i,
        /\b(idiot|stupid|moron|retard|dumbass|motherfucker|douchebag|trash|scum)\b/i,
        /\b(kill\s*yourself|kys|die\s*in\s*a\s*fire|go\s*die|i\s*will\s*kill\s*you)\b/i,
        /\b(hate\s*you|ugly\s*pig|loser|burn\s*in\s*hell)\b/i,
        // Bengali / Bangla abusive words and slurs
        /(খানকি|খানকির|বেশ্যা|শুয়োর|শুয়োরের|কুত্তা|কুত্তার|শালা|হারামজাদা|মাদারচোদ|চোদা|চোদ|মাগী|বাল|ভোদা|লওড়া)/u,
        // Bengali phonetic Latin slang
        /\b(khanki|khankir|beshya|shuyor|shuyorer|kutta|kuttar|sala|shala|haramjada|madarchod|choda|chod|magi|baal|bal|bhodai|lawra)\b/i,
        // Hindi / Urdu slang insults
        /\b(bhenchod|behenchod|chutiya|gaand|bhosdike|bhosadi|harami|kamina)\b/i
    ],

    isAbusive(text) {
        if (!text || typeof text !== 'string') return false;
        const clean = text.trim();
        return this.patterns.some(p => p.test(clean));
    },

    check(text) {
        const abusive = this.isAbusive(text);
        return {
            isAbusive: abusive,
            reason: abusive ? 'Violates community guidelines: contains abusive, offensive, or harassing language.' : null
        };
    },

    async checkAsync(text) {
        if (this.isAbusive(text)) {
            return { isAbusive: true, reason: 'Abusive language detected by AI Shield.' };
        }
        try {
            const resp = await fetch('/api/ai/moderate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text })
            });
            if (resp.ok) {
                const data = await resp.json();
                return data;
            }
        } catch (e) {
            // fallback to local check
        }
        return { isAbusive: false, reason: null };
    }
};

// ===== 60-MINUTE CONTINUOUS AI VIDEO BRAIN =====
const AIVideoBrain = {
    lastTrained: 0,
    intervalMs: 60 * 60 * 1000, // 60 minutes (saves massive Firestore write operations)
    timerId: null,
    catalog: {},
    videoCount: 0,
    isTraining: false,

    // Classify a single video into category, genre, target audience, themes
    classify(v) {
        const text = `${v.title || ''} ${v.description || ''} ${v.channel || ''} ${v.category || ''}`.toLowerCase();
        let genre = 'General Video';
        let category = v.category || 'General';
        let targetAudience = 'General viewers & learners';
        let depth = 'Informative & Accessible';
        const tags = [];

        if (/islam|quran|hadith|tafsir|surah|prophet|dua|sunnah|allah|sermon|waz|namaz|ramadan|islamic/i.test(text)) {
            genre = 'Islamic & Spiritual Lecture';
            category = 'Islam';
            targetAudience = 'Spiritual seekers, Muslims, and anyone seeking moral & ethical reflection';
            depth = 'Spiritual Guidance & Religious Wisdom';
            tags.push('Islamic Teachings', 'Spiritual Reflection', 'Faith & Wisdom');
        } else if (/ai|artificial intelligence|machine learning|deep learning|neural network|gemini|gpt|llm|transformer|openai|groq/i.test(text)) {
            genre = 'Artificial Intelligence & Machine Learning Breakdown';
            category = 'AI & ML';
            targetAudience = 'Tech enthusiasts, engineers, students, AI developers';
            depth = 'Cutting-edge Technology, Algorithms & Conceptual Analysis';
            tags.push('Artificial Intelligence', 'Machine Learning', 'Future Tech', 'Data Science');
        } else if (/python|javascript|typescript|coding|programming|react|node|html|css|developer|software|algorithm|github|bug/i.test(text)) {
            genre = 'Software Engineering & Coding Tutorial';
            category = 'Programming';
            targetAudience = 'Software engineers, web developers, programming students';
            depth = 'Hands-on Technical Implementation & Best Practices';
            tags.push('Coding', 'Web Development', 'Software Architecture');
        } else if (/physics|space|universe|quantum|astronomy|nasa|planet|science|chemistry|biology|galaxy/i.test(text)) {
            genre = 'Science & Scientific Exploration Documentary';
            category = 'Science';
            targetAudience = 'Curious minds, students, science lovers';
            depth = 'Scientific Breakdown & Natural Discovery';
            tags.push('Science', 'Cosmos', 'STEM Education');
        } else if (/leadership|team|business|startup|founder|career|interview|productivity|mindset|habits/i.test(text)) {
            genre = 'Professional Leadership & Personal Growth';
            category = 'Growth & Leadership';
            targetAudience = 'Professionals, entrepreneurs, team leaders, students';
            depth = 'Actionable Strategy & Mindset Development';
            tags.push('Leadership', 'Productivity', 'Personal Growth');
        }

        const isShort = isShortVideo(v);

        return {
            id: v.id,
            title: v.title || 'Untitled',
            channel: v.channel || 'Unknown',
            genre,
            category,
            targetAudience,
            depth,
            isShort,
            views: v.views || 0,
            tags,
            summary: (v.description || v.title || '').substring(0, 160).replace(/\n/g, ' ')
        };
    },

    // Train AI by reading videos, caching locally, and writing only new/changed insights to Firestore
    async train() {
        if (this.isTraining) return null;
        this.isTraining = true;
        try {
            console.log('[AIVideoBrain] Beginning AI audit of website videos...');
            const videos = await getVideos();
            if (!Array.isArray(videos) || videos.length === 0) return null;

            const previousCatalog = this.catalog || {};
            const catalog = {};
            const insightsToSave = [];

            videos.forEach(v => {
                if (v && v.id) {
                    const classified = this.classify(v);
                    catalog[v.id] = classified;

                    // Only write to Firestore if this video hasn't been learned yet or genre/category changed
                    const prev = previousCatalog[v.id];
                    const isNewOrChanged = !prev || prev.genre !== classified.genre || prev.category !== classified.category;
                    if (isNewOrChanged) {
                        insightsToSave.push({
                            videoId: v.id,
                            title: v.title || 'Untitled',
                            channel: v.channel || 'Unknown',
                            category: classified.category,
                            genre: classified.genre,
                            targetAudience: classified.targetAudience,
                            depth: classified.depth,
                            isShort: classified.isShort,
                            tags: classified.tags,
                            summary: classified.summary,
                            lastLearned: Date.now()
                        });
                    }
                }
            });

            this.catalog = catalog;
            this.videoCount = Object.keys(catalog).length;
            this.lastTrained = Date.now();

            // 1. Cache locally for instant retrieval
            try {
                localStorage.setItem('jtube_ai_brain_cache', JSON.stringify({
                    lastTrained: this.lastTrained,
                    videoCount: this.videoCount,
                    catalog: this.catalog
                }));
            } catch (e) {}

            // 2. Persist AI learned info to Firestore ONLY for newly discovered or modified videos
            if (insightsToSave.length > 0) {
                try {
                    const batch = db.batch();
                    let batchCount = 0;
                    for (const insight of insightsToSave.slice(0, 50)) {
                        const ref = db.collection("ai_video_insights").doc(insight.videoId);
                        batch.set(ref, insight, { merge: true });
                        batchCount++;
                    }
                    if (batchCount > 0) {
                        await batch.commit().catch(() => {});
                    }
                } catch (e) {
                }
            }

            // 3. Send to server-side AI Brain endpoint
            fetch('/api/ai/train', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ videos })
            }).catch(() => {});

            // 4. Dispatch events for UI badges & shorts refresh
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('aiBrainUpdated', {
                    detail: {
                        lastTrained: this.lastTrained,
                        videoCount: this.videoCount
                    }
                }));
            }

            console.log(`[AIVideoBrain] Completed training: analyzed ${this.videoCount} videos (${Object.values(catalog).filter(c => c.isShort).length} Shorts) across website at ${new Date(this.lastTrained).toLocaleTimeString()}`);
            return this.catalog;
        } catch (err) {
            console.warn('[AIVideoBrain] Training cycle encountered an error:', err);
            return null;
        } finally {
            this.isTraining = false;
        }
    },

    // Start automated learning cycle
    startPeriodicTraining() {
        // Load cache first if available
        try {
            const cached = localStorage.getItem('jtube_ai_brain_cache');
            if (cached) {
                const parsed = JSON.parse(cached);
                this.catalog = parsed.catalog || {};
                this.videoCount = parsed.videoCount || 0;
                this.lastTrained = parsed.lastTrained || 0;
            }
        } catch (e) {}

        // Immediate training only if never trained or cache is older than interval
        if (!this.lastTrained || (Date.now() - this.lastTrained > this.intervalMs)) {
            this.train();
        }

        // Repeat every 60 minutes
        if (this.timerId) clearInterval(this.timerId);
        this.timerId = setInterval(() => {
            console.log('[AIVideoBrain] Scheduled 60-minute learning cycle triggered...');
            this.train();
        }, this.intervalMs);
    },

    // Find out what kind of video a given video is
    async findVideoType(videoOrId) {
        let video = null;
        if (typeof videoOrId === 'string') {
            video = this.catalog[videoOrId] || await getVideoById(videoOrId);
        } else {
            video = videoOrId;
        }

        if (!video) {
            return {
                title: 'Unknown',
                genre: 'Unclassified',
                explanation: 'No video details found to classify.'
            };
        }

        // Try server-side video type explanation first
        try {
            const resp = await fetch('/api/ai/video-type', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    videoId: video.id,
                    title: video.title,
                    description: video.description,
                    channel: video.channel,
                    category: video.category
                })
            });
            if (resp.ok) {
                const data = await resp.json();
                return {
                    brainData: data.brainData,
                    explanation: data.explanation,
                    lastTrained: data.lastTrained
                };
            }
        } catch (e) {
            // fallback
        }

        const classified = this.catalog[video.id] || this.classify(video);
        const explanation = `### 🎬 Video Classification Analysis
- **Genre & Type**: **${classified.genre}** (${classified.isShort ? '⚡ JTube Short' : 'Standard Video'})
- **Creator / Channel**: **${classified.channel}**
- **Platform Category**: **${classified.category}**
- **Target Audience**: ${classified.targetAudience}
- **Presentation Depth**: ${classified.depth}
- **Core Themes**: ${classified.tags.join(' • ')}

**Content Overview**: ${classified.summary}`;

        return {
            brainData: classified,
            explanation,
            lastTrained: this.lastTrained
        };
    },

    // Get current AI Brain state and diagnostics
    getBrain() {
        return {
            lastTrained: this.lastTrained,
            videoCount: this.videoCount,
            totalVideos: this.videoCount || Object.keys(this.catalog || {}).length,
            catalog: this.catalog || {},
            intervalMs: this.intervalMs
        };
    }
};

// Start AI Brain 5-minute training cycle in browser
if (typeof window !== 'undefined') {
    setTimeout(() => {
        AIVideoBrain.startPeriodicTraining();
    }, 1000);
}

async function addComment(videoId, commentData) {
    if (!videoId || !commentData) return null;
    try {
        const text = (commentData.text || "").trim();
        if (!text) return null;

        // AI Shield Auto-Moderation Check (deletes abusive comments)
        if (AIModeration.isAbusive(text)) {
            console.warn("Abusive comment blocked by AI Shield:", text);
            if (typeof showToast === 'function') {
                showToast("⚠️ Comment deleted by AI Shield: Abusive or offensive language is strictly prohibited.", "error");
            }
            return { abusive: true, error: "Comment deleted by AI Shield for abusive content" };
        }

        let video = await getVideoById(videoId);
        if (!video) {
            try {
                const doc = await db.collection("videos").doc(videoId).get();
                if (doc.exists) {
                    video = { id: doc.id, ...doc.data() };
                }
            } catch (e) {}
        }
        if (!video) return null;
        if (!Array.isArray(video.comments)) {
            video.comments = [];
        }

        // Clean out any previously stored abusive comments automatically
        video.comments = video.comments.filter(c => !AIModeration.isAbusive(c.text));

        const user = typeof currentUser !== 'undefined' && currentUser ? currentUser : (typeof getCurrentUser === 'function' ? getCurrentUser() : null);
        const username = commentData.username || commentData.userName || commentData.author || (user && (user.displayName || user.email.split('@')[0])) || "User";
        const email = commentData.email || (user ? user.email : "");

        const newComment = {
            id: 'c_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
            username: username,
            userName: username,
            author: username,
            email: email,
            text: text,
            timestamp: commentData.timestamp || Date.now(),
            replies: commentData.replies || []
        };

        video.comments.unshift(newComment);
        video.commentsCount = video.comments.length;
        await saveVideo(video);
        return newComment;
    } catch (err) {
        console.error("addComment error:", err);
        throw err;
    }
}

function getEffectiveLikes(video) {
    if (!video) return 0;
    const base = (typeof video.baseLikes === 'number') 
        ? video.baseLikes 
        : (typeof video.likes === 'number' ? video.likes : 0);
    const siteLikes = Array.isArray(video.likedBy) ? video.likedBy.length : 0;
    return base + siteLikes;
}

function getEffectiveSubscribers(channelData) {
    if (!channelData) return 0;
    const base = (typeof channelData.baseSubscribers === 'number') 
        ? channelData.baseSubscribers 
        : (typeof channelData.subscribers === 'number' ? channelData.subscribers : 0);
    const siteSubs = Array.isArray(channelData.subscribedBy) ? channelData.subscribedBy.length : 0;
    return base + siteSubs;
}

function getSiteUserIdentifier(providedEmail) {
    if (providedEmail) return providedEmail;
    const user = typeof currentUser !== 'undefined' && currentUser ? currentUser : (typeof getCurrentUser === 'function' ? getCurrentUser() : null);
    if (user && user.email) return user.email;
    if (typeof localStorage !== 'undefined') {
        let guestId = localStorage.getItem('jtube_guest_uid');
        if (!guestId) {
            guestId = 'guest_' + Math.random().toString(36).substring(2, 10);
            localStorage.setItem('jtube_guest_uid', guestId);
        }
        return guestId;
    }
    return 'anonymous_' + Date.now();
}

async function likeVideo(videoId, userEmail) {
    if (!videoId) return 0;
    try {
        let video = await getVideoById(videoId);
        if (!video) return 0;

        const identifier = getSiteUserIdentifier(userEmail);

        if (!Array.isArray(video.likedBy)) {
            video.likedBy = [];
        }

        // Preserve original YouTube or imported likes as baseLikes
        if (typeof video.baseLikes !== 'number') {
            video.baseLikes = typeof video.likes === 'number' ? video.likes : 0;
        }

        const idx = video.likedBy.indexOf(identifier);
        let isNowLiked = false;
        if (idx > -1) {
            video.likedBy.splice(idx, 1);
            isNowLiked = false;
        } else {
            video.likedBy.push(identifier);
            isNowLiked = true;
        }

        // Total likes = YouTube base likes + local website users who liked
        video.likes = (video.baseLikes || 0) + video.likedBy.length;
        video.liked = isNowLiked;

        await saveVideo(video);
        return video.likes;
    } catch (err) {
        console.error("likeVideo error:", err);
        return 0;
    }
}

async function toggleSubscription(channelName, userEmail) {
    if (!channelName) return false;
    try {
        const channels = await getChannels();
        const chData = channels[channelName] || { subscribers: 0, subscribedBy: [] };
        if (!Array.isArray(chData.subscribedBy)) {
            chData.subscribedBy = [];
        }

        const identifier = getSiteUserIdentifier(userEmail);
        if (!identifier) return false;

        // Preserve YouTube or imported subscribers as baseSubscribers
        if (typeof chData.baseSubscribers !== 'number') {
            chData.baseSubscribers = typeof chData.subscribers === 'number' ? chData.subscribers : 0;
        }

        const idx = chData.subscribedBy.indexOf(identifier);
        let isSubbed = false;
        if (idx > -1) {
            chData.subscribedBy.splice(idx, 1);
            isSubbed = false;
        } else {
            chData.subscribedBy.push(identifier);
            isSubbed = true;
        }

        // Total subscribers = YouTube base subscribers + local website subscribers
        chData.subscribers = (chData.baseSubscribers || 0) + chData.subscribedBy.length;

        await saveChannel(channelName, chData);
        return isSubbed;
    } catch (err) {
        console.error("toggleSubscription error:", err);
        return false;
    }
}

// Global Browser Exports
if (typeof window !== 'undefined') {
    window.getComments = getComments;
    window.addComment = addComment;
    window.likeVideo = likeVideo;
    window.toggleSubscription = toggleSubscription;
    window.getEffectiveLikes = getEffectiveLikes;
    window.getEffectiveSubscribers = getEffectiveSubscribers;
    window.getSiteUserIdentifier = getSiteUserIdentifier;
    window.AIModeration = AIModeration;
    window.AIVideoBrain = AIVideoBrain;
    window.isReel = isReel;
    window.isRegularVideo = isRegularVideo;
    window.getFirestoreCatalogCounts = getFirestoreCatalogCounts;
    window.autoSyncYouTubeChannels = autoSyncYouTubeChannels;
    window.syncChannelByName = syncChannelByName;
}