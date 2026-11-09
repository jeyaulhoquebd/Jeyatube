/**
 * JTube Community — shared group chat backed by the JTube server.
 * All rendering uses escaped text / DOM APIs; the server enforces auth,
 * flood control, abuse filtering, reports and admin moderation.
 */
document.addEventListener('DOMContentLoaded', () => {
    const $ = id => document.getElementById(id);
    const els = {
        scroll: $('chat-scroll'), list: $('chat-messages'), loading: $('chat-loading'), empty: $('chat-empty'),
        typing: $('ai-typing'), online: $('online-count'), scrollBtn: $('btn-scroll-bottom'),
        authCard: $('auth-card'), authForm: $('auth-form'), authName: $('auth-name'), authNameWrap: $('auth-name-wrap'),
        authEmail: $('auth-email'), authPassword: $('auth-password'), authSubmit: $('auth-submit'), authError: $('auth-error'),
        banned: $('banned-card'), form: $('chat-form'), input: $('chat-input'), send: $('send-btn'), count: $('char-count'),
        replyBar: $('reply-bar'), replyName: $('reply-name'), replyText: $('reply-text'),
        userChip: $('user-chip'), userAvatar: $('user-chip-avatar'), userName: $('user-chip-name'),
        membersPanel: $('members-panel'), membersBackdrop: $('members-backdrop'), membersList: $('members-list'),
        memberTotal: $('member-total'), memberBtnCount: $('member-count-btn'), memberSearch: $('member-search'),
        videoModal: $('video-modal'), videoSearch: $('video-search'), videoResults: $('video-results'), rulesModal: $('rules-modal')
    };

    const state = { seq: 0, me: null, isAdmin: false, messages: new Map(), order: [], replyTo: null, polling: null, members: [], authMode: 'login', waitingAI: 0 };
    const videoCache = new Map();
    const esc = s => (typeof escapeHtml === 'function' ? escapeHtml(s) : String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));

    // ---------- helpers ----------
    const COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#d946ef', '#ec4899'];
    function colorFor(id) { let h = 0; for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return COLORS[h % COLORS.length]; }
    function initial(name) { return (String(name || '?').trim()[0] || '?').toUpperCase(); }
    function timeStr(ts) { return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
    function dayStr(ts) {
        const d = new Date(ts), t = new Date();
        const y = new Date(); y.setDate(t.getDate() - 1);
        if (d.toDateString() === t.toDateString()) return 'Today';
        if (d.toDateString() === y.toDateString()) return 'Yesterday';
        return d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
    }
    function toast(msg, type = 'info') { if (typeof showToast === 'function') showToast(msg, type); }
    const nearBottom = () => els.scroll.scrollHeight - els.scroll.scrollTop - els.scroll.clientHeight < 160;
    const toBottom = (smooth = true) => els.scroll.scrollTo({ top: els.scroll.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });

    async function api(method, url, body) {
        const res = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw Object.assign(new Error(data.error || `Request failed (${res.status})`), { status: res.status });
        return data;
    }

    // Escape first, then add safe formatting: links, JTube video links, **bold**, bullets, @mentions
    function formatText(text, isAI) {
        let html = esc(text);
        html = html.replace(/\[([^\]]{1,200})\]\((?:https?:\/\/[^\s)]+\/)?(watch|shorts)\.html\?id=([\w-]{1,40})\)/g,
            (m, title, page, id) => `<a href="${page}.html?id=${id}" data-vid="${id}">${title}</a>`);
        html = html.replace(/(^|[\s(])(https:\/\/[^\s<]+[^\s<.,;:!?)'"])/g, (m, pre, url) => {
            const internal = url.match(/(watch|shorts)\.html\?id=([\w-]{1,40})/);
            if (internal) return `${pre}<a href="${internal[1]}.html?id=${internal[2]}" data-vid="${internal[2]}">${url}</a>`;
            return `${pre}<a href="${url}" target="_blank" rel="noopener nofollow ugc">${url}</a>`;
        });
        html = html.replace(/(^|\s)((?:watch|shorts)\.html\?id=([\w-]{1,40}))/g, (m, pre, path, id) => `${pre}<a href="${path}" data-vid="${id}">${path}</a>`);
        if (isAI) {
            html = html.replace(/\*\*([^*\n]{1,200})\*\*/g, '<strong>$1</strong>');
            html = html.replace(/^\s*[-•]\s+/gm, '• ');
        }
        html = html.replace(/(^|\s)@([\p{L}\p{N}_]{2,30})/gu, '$1<span class="text-indigo-300 font-semibold">@$2</span>');
        return html;
    }

    async function getVideo(id) {
        if (videoCache.has(id)) return videoCache.get(id);
        const p = (typeof getVideoById === 'function'
            ? getVideoById(id)
            : fetch('/api/videos/' + encodeURIComponent(id)).then(r => (r.ok ? r.json() : null))).catch(() => null);
        videoCache.set(id, p);
        return p;
    }

    async function attachPreview(container, text) {
        const m = String(text).match(/(?:watch|shorts)\.html\?id=([\w-]{1,40})/);
        if (!m) return;
        const v = await getVideo(m[1]);
        if (!v || !v.title) return;
        const isShort = Boolean(v.isShort || v.isReel);
        const a = document.createElement('a');
        a.className = 'video-card';
        a.href = `${isShort ? 'shorts' : 'watch'}.html?id=${encodeURIComponent(v.id)}`;
        a.innerHTML = `
            <div class="relative w-28 aspect-video rounded-lg overflow-hidden bg-zinc-800 flex-shrink-0">
                <img src="${esc(typeof safeUrl === 'function' ? safeUrl(v.thumbnail) : '')}" alt="" loading="lazy" class="w-full h-full object-cover">
                <span class="absolute bottom-1 right-1 bg-black/80 text-white text-[9px] font-bold px-1 rounded">${isShort ? 'Short' : esc(v.duration || '')}</span>
            </div>
            <div class="min-w-0 py-0.5">
                <p class="text-[13px] font-semibold text-white line-clamp-2 leading-snug">${esc(v.title)}</p>
                <p class="text-[11px] text-zinc-400 mt-1 truncate">${esc(v.channel)}</p>
            </div>`;
        container.appendChild(a);
    }

    // ---------- rendering ----------
    function buildMessage(m, prev) {
        const el = document.createElement('div');
        el.dataset.id = m.id;
        const compact = prev && !prev.deleted && prev.uid === m.uid && m.kind !== 'ai' && (m.ts - prev.ts) < 5 * 60 * 1000 && !m.replyTo
            && new Date(prev.ts).toDateString() === new Date(m.ts).toDateString();
        el.className = `msg msg-in ${compact ? 'compact' : ''} ${m.mine ? 'mine' : ''} ${m.kind === 'ai' ? 'ai' : ''}`;

        const avatar = m.kind === 'ai'
            ? `<div class="msg-avatar" style="background:linear-gradient(135deg,#6366f1,#8b5cf6)"><i class="fas fa-robot text-xs"></i></div>`
            : `<div class="msg-avatar" style="background:${colorFor(m.uid)}">${esc(initial(m.name))}</div>`;

        let body;
        if (m.deleted) body = `<p class="msg-text italic text-zinc-500 text-sm"><i class="fas fa-ban mr-1.5"></i>This message was deleted</p>`;
        else if (m.hidden) body = `<p class="msg-text italic text-zinc-500 text-sm"><i class="fas fa-eye-slash mr-1.5"></i>Hidden after community reports</p>`;
        else body = `<div class="msg-text">${formatText(m.text, m.kind === 'ai')}</div>`;

        const header = compact ? '' : `
            <div class="flex items-baseline gap-2 mb-0.5">
                <span class="msg-name text-sm font-bold ${m.kind === 'ai' ? 'text-indigo-300' : 'text-zinc-100'}">${esc(m.name)}${m.mine ? ' <span class="text-[10px] text-zinc-500 font-semibold">(you)</span>' : ''}</span>
                ${m.kind === 'ai' ? '<span class="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300">AI</span>' : ''}
                ${m.admin ? '<span class="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-red-500/20 text-red-300">Admin</span>' : ''}
                <span class="text-[11px] text-zinc-500">${timeStr(m.ts)}</span>
            </div>`;

        const reply = m.replyTo && !m.deleted ? `<span class="reply-quote" data-jump="${esc(m.replyTo.id)}"><i class="fas fa-reply fa-flip-horizontal mr-1 text-indigo-300"></i><b class="text-zinc-300">${esc(m.replyTo.name)}</b> ${esc(m.replyTo.text)}</span>` : '';
        const likes = !m.deleted && !m.hidden && m.likes > 0 ? `<button class="like-chip ${m.liked ? 'liked' : ''}" data-act="like"><i class="fas fa-heart text-[10px]"></i>${m.likes}</button>` : '';

        const canAct = !m.deleted && !m.hidden && !m.localOnly && state.me && !state.me.banned;
        const actions = canAct ? `
            <div class="msg-actions">
                <button class="act" data-act="like" title="Like"><i class="${m.liked ? 'fas text-red-400' : 'far'} fa-heart"></i></button>
                <button class="act" data-act="reply" title="Reply"><i class="fas fa-reply"></i></button>
                <button class="act" data-act="copy" title="Copy"><i class="far fa-copy"></i></button>
                ${!m.mine && m.kind !== 'ai' ? '<button class="act" data-act="report" title="Report"><i class="far fa-flag"></i></button>' : ''}
                ${m.mine || state.isAdmin ? '<button class="act danger" data-act="delete" title="Delete"><i class="far fa-trash-can"></i></button>' : ''}
            </div>` : (state.isAdmin && !m.deleted ? `<div class="msg-actions"><button class="act danger" data-act="delete" title="Delete (admin)"><i class="far fa-trash-can"></i></button></div>` : '');

        el.innerHTML = `${avatar}<div class="msg-body">${header}${reply}${body}${likes}</div>${actions}`;
        if (!m.deleted && !m.hidden) attachPreview(el.querySelector('.msg-body'), m.text);
        return el;
    }

    function renderAll() {
        els.list.innerHTML = '';
        let prev = null, lastDay = '';
        const frag = document.createDocumentFragment();
        for (const id of state.order) {
            const m = state.messages.get(id);
            const day = dayStr(m.ts);
            if (day !== lastDay) {
                const sep = document.createElement('div');
                sep.className = 'day-sep';
                sep.textContent = day;
                frag.appendChild(sep);
                lastDay = day;
                prev = null;
            }
            frag.appendChild(buildMessage(m, prev));
            prev = m;
        }
        els.list.appendChild(frag);
        els.empty.classList.toggle('hidden', state.order.length > 0);
    }

    function applyMessages(list, initial) {
        const stick = initial || nearBottom();
        let changed = false, newAI = false, newOthers = 0;
        for (const m of list) {
            if (!state.messages.has(m.id)) {
                state.order.push(m.id);
                if (!initial && m.kind === 'ai') newAI = true;
                if (!initial && !m.mine) newOthers++;
            }
            state.messages.set(m.id, m);
            changed = true;
        }
        if (!changed && !initial) return;
        state.order.sort((a, b) => state.messages.get(a).ts - state.messages.get(b).ts);
        if (state.order.length > 400) state.order.splice(0, state.order.length - 400).forEach(id => state.messages.delete(id));
        renderAll();
        if (newAI && state.waitingAI > 0) state.waitingAI--;
        els.typing.classList.toggle('hidden', state.waitingAI <= 0);
        els.typing.classList.toggle('flex', state.waitingAI > 0);
        if (stick) toBottom(!initial);
        else if (newOthers) els.scrollBtn.classList.remove('hidden');
    }

    // ---------- auth / UI state ----------
    function updateAuthUI() {
        const signedIn = Boolean(state.me);
        els.authCard.classList.toggle('hidden', signedIn);
        els.banned.classList.toggle('hidden', !(signedIn && state.me.banned));
        els.form.classList.toggle('hidden', !signedIn || state.me.banned);
        els.userChip.classList.toggle('hidden', !signedIn);
        els.userChip.classList.toggle('flex', signedIn);
        if (signedIn) {
            els.userAvatar.textContent = initial(state.me.name);
            els.userAvatar.style.background = colorFor(state.me.id);
            els.userName.textContent = state.me.name;
        }
    }

    function setAuthMode(mode) {
        state.authMode = mode;
        document.querySelectorAll('.tab-auth').forEach(t => t.classList.toggle('active', t.dataset.mode === mode));
        const reg = mode === 'register';
        els.authNameWrap.classList.toggle('hidden', !reg);
        els.authForm.classList.toggle('sm:grid-cols-3', !reg);
        els.authForm.classList.toggle('sm:grid-cols-4', reg);
        els.authName.required = reg;
        els.authPassword.autocomplete = reg ? 'new-password' : 'current-password';
        els.authSubmit.textContent = reg ? 'Create account' : 'Sign in to chat';
        els.authError.classList.add('hidden');
    }
    document.querySelectorAll('.tab-auth').forEach(t => t.addEventListener('click', () => setAuthMode(t.dataset.mode)));

    els.authForm.addEventListener('submit', async e => {
        e.preventDefault();
        els.authSubmit.disabled = true;
        els.authError.classList.add('hidden');
        try {
            const body = { email: els.authEmail.value.trim(), password: els.authPassword.value };
            if (state.authMode === 'register') {
                body.name = els.authName.value.trim();
                if (typeof registerWithEmail === 'function') await registerWithEmail(body.email, body.password, body.name);
                else await api('POST', '/api/auth/register', body);
            } else {
                if (typeof loginWithEmail === 'function') await loginWithEmail(body.email, body.password);
                else await api('POST', '/api/auth/login', body);
            }
            els.authPassword.value = '';
            if (FB.on) {
                await setFirebaseMe();
            } else {
                const me = await api('GET', '/api/auth/me');
                if (!me.authenticated) throw new Error('Sign-in did not complete. Please try again.');
                state.me = { id: me.user.id, name: me.user.name, banned: me.user.banned };
                updateAuthUI();
                await poll(true);
            }
            toast(`Welcome, ${state.me.name}!`, 'success');
            els.input.focus();
        } catch (err) {
            els.authError.textContent = err.message || 'Sign-in failed.';
            els.authError.classList.remove('hidden');
        } finally {
            els.authSubmit.disabled = false;
        }
    });

    $('btn-logout').addEventListener('click', async () => {
        if (typeof logoutUser === 'function') await logoutUser(); else await api('POST', '/api/auth/logout', {}).catch(() => {});
        state.me = null;
        updateAuthUI();
        if (FB.on) rerender(); else poll(true);
    });

    $('btn-google')?.addEventListener('click', async () => {
        els.authError.classList.add('hidden');
        try {
            if (typeof loginWithGoogle === 'function') await loginWithGoogle();
            if (FB.on) await setFirebaseMe(); else poll(true);
        } catch (err) {
            els.authError.textContent = err.message || 'Google sign-in failed.';
            els.authError.classList.remove('hidden');
        }
    });

    $('btn-forgot')?.addEventListener('click', async () => {
        const email = els.authEmail.value.trim() || prompt('Your account email:') || '';
        if (!email) return;
        try {
            if (!FB.on) throw new Error('Password reset is available on the Firebase version of the site.');
            await window.JFB.resetPassword(email);
            toast('Password reset email sent — check your inbox.', 'success');
        } catch (err) { toast(err.message, 'error'); }
    });

    // ---------- Firebase (Firestore real-time) mode — used on Firebase Hosting ----------
    const FB = { on: false, unsub: null };
    async function setFirebaseMe() {
        const u = window.JFB.user;
        if (!u) { state.me = null; state.isAdmin = false; updateAuthUI(); rerender(); return; }
        const profile = window.JFB.profile || await window.JFB.ensureProfile().catch(() => null);
        const banned = await window.JFB.amIBanned();
        state.me = { id: u.uid, name: (profile && profile.name) || u.displayName || 'Member', banned };
        state.isAdmin = window.JFB.isAdminUid(u.uid);
        updateAuthUI();
        rerender();
    }
    function rerender() {
        // Re-evaluate "mine"/"liked" flags for the current user and redraw
        const uid = state.me && state.me.id;
        for (const m of state.messages.values()) { m.mine = Boolean(uid && m.uid === uid); }
        renderAll();
    }
    function startFirebase() {
        FB.on = true;
        els.loading.classList.add('hidden');
        window.JFB.onAuth(() => { setFirebaseMe(); });
        let first = true;
        FB.unsub = window.JFB.chatSubscribe(list => {
            const stick = first || nearBottom();
            const before = new Set(state.order);
            state.messages = new Map(list.map(m => [m.id, m]));
            state.order = list.map(m => m.id);
            renderAll();
            const newOthers = list.filter(m => !before.has(m.id) && !m.mine).length;
            if (stick) toBottom(!first); else if (newOthers && !first) els.scrollBtn.classList.remove('hidden');
            first = false;
        }, err => {
            els.loading.classList.remove('hidden');
            els.loading.innerHTML = '<i class="fas fa-triangle-exclamation mr-2"></i>Could not connect to the chat. Please refresh the page.';
            console.warn('chat subscribe', err);
        });
        loadMembers();
    }
    async function askLocally(question) {
        // No AI server on Firebase Hosting: answer with matching JTube videos (only visible to you)
        const q = question.replace(/^\s*\/ask\b/i, '').replace(/@jask\s?ai\b|@jaksai\b/ig, '').trim();
        const res = q && typeof fetchCatalogPage === 'function' ? await fetchCatalogPage({ q, limit: 5, sort: 'popular' }) : null;
        const items = res ? res.items : [];
        const text = items.length
            ? 'Here are JTube videos about that:\n' + items.map(v => `- [${v.title}](${v.isShort ? 'shorts' : 'watch'}.html?id=${v.id})`).join('\n')
            : 'I could not find a matching video. Try different words.';
        const m = { id: 'local_' + Date.now(), kind: 'ai', uid: 'ai', name: 'JAsk AI', text, ts: Date.now(), likes: 0, liked: false, mine: false, replyTo: null, localOnly: true };
        state.messages.set(m.id, m);
        state.order.push(m.id);
        renderAll();
        toBottom();
    }

    // ---------- polling ----------
    let pollBusy = false;
    async function poll(reset = false) {
        if (pollBusy) return;
        pollBusy = true;
        try {
            if (reset) { state.seq = 0; state.messages.clear(); state.order = []; }
            const data = await api('GET', `/api/group/messages?after=${state.seq}`);
            const initial = state.seq === 0;
            state.isAdmin = Boolean(data.isAdmin);
            const meChanged = JSON.stringify(state.me) !== JSON.stringify(data.me);
            state.me = data.me;
            if (meChanged || initial) updateAuthUI();
            els.online.textContent = `${data.online} online now`;
            els.loading.classList.add('hidden');
            if (data.messages.length || initial || meChanged) {
                // when my identity changes, re-render so action buttons match
                if (meChanged && !initial) { state.seq = 0; pollBusy = false; return poll(true); }
                applyMessages(data.messages, initial);
            }
            state.seq = data.seq;
        } catch (e) {
            els.online.textContent = 'reconnecting…';
            if (state.seq === 0) els.loading.innerHTML = '<i class="fas fa-plug-circle-exclamation mr-2"></i>The community chat needs the JTube server.';
        } finally {
            pollBusy = false;
        }
    }
    function schedule() {
        clearTimeout(state.polling);
        state.polling = setTimeout(async () => { await poll(); schedule(); }, document.hidden ? 15000 : (state.waitingAI > 0 ? 1200 : 2500));
    }
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { poll(); schedule(); } });

    // ---------- composer ----------
    function autosize() {
        els.input.style.height = 'auto';
        els.input.style.height = Math.min(els.input.scrollHeight, 144) + 'px';
        const n = els.input.value.length;
        els.count.textContent = `${n} / 1000`;
        els.count.classList.toggle('text-amber-400', n > 900);
        els.send.disabled = els.input.value.trim().length === 0;
    }
    els.input.addEventListener('input', autosize);
    els.input.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); els.form.requestSubmit(); }
    });

    function setReply(m) {
        state.replyTo = m ? m.id : null;
        els.replyBar.classList.toggle('hidden', !m);
        els.replyBar.classList.toggle('flex', Boolean(m));
        if (m) { els.replyName.textContent = m.name; els.replyText.textContent = m.text.slice(0, 80); els.input.focus(); }
    }
    $('reply-cancel').addEventListener('click', () => setReply(null));

    els.form.addEventListener('submit', async e => {
        e.preventDefault();
        const text = els.input.value.trim();
        if (!text) return;
        els.send.disabled = true;
        try {
            if (FB.on) {
                const reply = state.replyTo ? state.messages.get(state.replyTo) : null;
                if (typeof AIModeration !== 'undefined' && AIModeration.isAbusive(text)) throw new Error('Message blocked: please keep the chat respectful.');
                await window.JFB.chatSend(text, reply ? { id: reply.id, name: reply.name, text: reply.text } : null);
                els.input.value = '';
                autosize();
                setReply(null);
                if (/^\s*\/ask\b/i.test(text) || /@jask\s?ai\b|@jaksai\b/i.test(text)) askLocally(text);
                return;
            }
            const r = await api('POST', '/api/group/messages', { text, replyTo: state.replyTo });
            els.input.value = '';
            autosize();
            setReply(null);
            if (/^\s*\/ask\b/i.test(text) || /@jask\s?ai\b|@jaksai\b/i.test(text)) state.waitingAI++;
            applyMessages([r.message], false);
            toBottom();
            await poll();
            schedule();
        } catch (err) {
            toast(err.message, 'error');
            if (err.status === 401) { state.me = null; updateAuthUI(); }
        } finally {
            autosize();
        }
    });

    $('btn-ask').addEventListener('click', () => {
        if (!/^\/ask\b/i.test(els.input.value)) els.input.value = '/ask ' + els.input.value;
        els.input.focus();
        autosize();
    });

    // ---------- message actions ----------
    els.list.addEventListener('click', async e => {
        const jump = e.target.closest('[data-jump]');
        if (jump) {
            const target = els.list.querySelector(`[data-id="${CSS.escape(jump.dataset.jump)}"]`);
            if (target) { target.scrollIntoView({ behavior: 'smooth', block: 'center' }); target.classList.add('highlight'); setTimeout(() => target.classList.remove('highlight'), 1700); }
            return;
        }
        const btn = e.target.closest('[data-act]');
        if (!btn) return;
        const id = btn.closest('.msg').dataset.id;
        const m = state.messages.get(id);
        if (!m) return;
        try {
            switch (btn.dataset.act) {
                case 'like': {
                    if (FB.on) { await window.JFB.chatLike(id, !m.liked); break; }
                    const r = await api('POST', `/api/group/messages/${encodeURIComponent(id)}/like`);
                    applyMessages([r.message], false);
                    break;
                }
                case 'reply': setReply(m); break;
                case 'copy':
                    await navigator.clipboard.writeText(m.text);
                    toast('Copied', 'success');
                    break;
                case 'report': {
                    const reason = prompt('Why are you reporting this message? (spam, abuse, …)');
                    if (reason === null) return;
                    const r = FB.on ? await window.JFB.chatReport(m, reason) : await api('POST', `/api/group/messages/${encodeURIComponent(id)}/report`, { reason });
                    toast(r.already ? 'You already reported this message.' : 'Thanks — the message was reported.', 'success');
                    if (!FB.on) poll();
                    break;
                }
                case 'delete':
                    if (!confirm('Delete this message?')) return;
                    if (FB.on) { await window.JFB.chatDelete(id); break; }
                    await api('DELETE', `/api/group/messages/${encodeURIComponent(id)}`);
                    poll();
                    break;
            }
        } catch (err) { toast(err.message, 'error'); }
    });

    els.scroll.addEventListener('scroll', () => { if (nearBottom()) els.scrollBtn.classList.add('hidden'); }, { passive: true });
    els.scrollBtn.addEventListener('click', () => { toBottom(); els.scrollBtn.classList.add('hidden'); });

    // ---------- members ----------
    async function loadMembers() {
        try {
            const d = FB.on ? await window.JFB.members().then(list => ({ members: list, total: list.length })) : await api('GET', '/api/group/members');
            if (FB.on) els.online.textContent = `${d.total} member${d.total === 1 ? '' : 's'}`;
            state.members = d.members;
            els.memberTotal.textContent = `· ${d.total}`;
            els.memberBtnCount.textContent = d.total;
            renderMembers();
        } catch (e) { els.membersList.innerHTML = '<p class="text-xs text-zinc-500 px-2">Could not load members.</p>'; }
    }
    function renderMembers() {
        const q = els.memberSearch.value.trim().toLowerCase();
        const list = state.members.filter(m => !q || m.name.toLowerCase().includes(q));
        if (!list.length) { els.membersList.innerHTML = '<p class="text-xs text-zinc-500 px-2 py-4 text-center">No members yet.</p>'; return; }
        els.membersList.innerHTML = list.map(m => `
            <button type="button" class="member w-full flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-white/5 text-left" data-name="${esc(m.name)}" title="Mention ${esc(m.name)}">
                <span class="relative">
                    <span class="w-8 h-8 rounded-xl flex items-center justify-center text-xs font-black text-white" style="background:${colorFor(m.id)}">${esc(initial(m.name))}</span>
                    ${m.online ? '<span class="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 border-2 border-[#0c0c10]"></span>' : ''}
                </span>
                <span class="min-w-0 flex-1">
                    <span class="block text-sm font-semibold text-zinc-200 truncate">${esc(m.name)}</span>
                    <span class="block text-[11px] text-zinc-500">${m.admin ? 'Admin' : m.online ? 'Online' : (FB.on ? 'Member' : m.messages + ' message' + (m.messages === 1 ? '' : 's'))}</span>
                </span>
            </button>`).join('');
    }
    els.memberSearch.addEventListener('input', renderMembers);
    els.membersList.addEventListener('click', e => {
        const b = e.target.closest('.member');
        if (!b || els.form.classList.contains('hidden')) return;
        const tag = '@' + b.dataset.name.replace(/\s+/g, '') + ' ';
        els.input.value = (els.input.value + (els.input.value && !els.input.value.endsWith(' ') ? ' ' : '') + tag);
        autosize();
        els.input.focus();
        toggleMembers(false);
    });
    function toggleMembers(open) {
        els.membersPanel.classList.toggle('open', open);
        els.membersBackdrop.classList.toggle('hidden', !open);
    }
    $('btn-members').addEventListener('click', () => toggleMembers(true));
    $('close-members').addEventListener('click', () => toggleMembers(false));
    els.membersBackdrop.addEventListener('click', () => toggleMembers(false));

    // ---------- modals ----------
    function openModal(m) { m.classList.remove('hidden'); }
    document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => b.closest('.fixed').classList.add('hidden')));
    [els.videoModal, els.rulesModal].forEach(m => m.addEventListener('click', e => { if (e.target === m) m.classList.add('hidden'); }));
    document.addEventListener('keydown', e => { if (e.key === 'Escape') [els.videoModal, els.rulesModal].forEach(m => m.classList.add('hidden')); });
    $('btn-rules').addEventListener('click', () => openModal(els.rulesModal));
    $('btn-rules-2').addEventListener('click', () => openModal(els.rulesModal));

    let videoTimer = null;
    async function searchVideos() {
        const q = els.videoSearch.value.trim();
        els.videoResults.innerHTML = '<p class="text-xs text-zinc-500 px-2 py-6 text-center"><i class="fas fa-spinner fa-spin mr-1"></i>Searching…</p>';
        const res = typeof fetchCatalogPage === 'function' ? await fetchCatalogPage({ q, limit: 30, sort: q ? 'popular' : 'latest' }) : null;
        const items = res ? res.items : [];
        if (!items.length) { els.videoResults.innerHTML = '<p class="text-xs text-zinc-500 px-2 py-6 text-center">No videos found.</p>'; return; }
        els.videoResults.innerHTML = items.map(v => `
            <button type="button" class="pick w-full flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 text-left" data-id="${esc(v.id)}" data-short="${v.isShort ? 1 : 0}">
                <img src="${esc(v.thumbnail)}" alt="" loading="lazy" class="w-24 aspect-video object-cover rounded-lg bg-zinc-800 flex-shrink-0">
                <span class="min-w-0">
                    <span class="block text-sm font-semibold text-zinc-100 line-clamp-2">${esc(v.title)}</span>
                    <span class="block text-[11px] text-zinc-500 mt-0.5 truncate">${esc(v.channel)} · ${v.isShort ? 'Short' : esc(v.duration)}</span>
                </span>
            </button>`).join('');
    }
    $('btn-share-video').addEventListener('click', () => { openModal(els.videoModal); els.videoSearch.focus(); searchVideos(); });
    els.videoSearch.addEventListener('input', () => { clearTimeout(videoTimer); videoTimer = setTimeout(searchVideos, 300); });
    els.videoResults.addEventListener('click', e => {
        const b = e.target.closest('.pick');
        if (!b) return;
        const link = `${b.dataset.short === '1' ? 'shorts' : 'watch'}.html?id=${b.dataset.id}`;
        els.input.value = (els.input.value ? els.input.value.trimEnd() + ' ' : '') + link + ' ';
        autosize();
        els.videoModal.classList.add('hidden');
        els.input.focus();
    });

    // ---------- start ----------
    setAuthMode('login');
    // Prefer the Node server when present; otherwise use Firestore (Firebase Hosting)
    (typeof ENV !== 'undefined' && ENV.STATIC_HOST === true ? Promise.resolve(false) : fetch('/api/group/messages?after=0', { headers: { Accept: 'application/json' } })
        .then(r => (r.ok && (r.headers.get('content-type') || '').includes('json')))
        .catch(() => false))
        .then(serverOk => {
            if (serverOk) { poll(true).then(() => { schedule(); loadMembers(); }); }
            else if (window.JFB && window.JFB.available) startFirebase();
            else { els.loading.innerHTML = '<i class="fas fa-plug-circle-exclamation mr-2"></i>The community chat is not available right now.'; }
        });
    setInterval(loadMembers, 60000);
});
