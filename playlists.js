document.addEventListener("DOMContentLoaded", async () => {
    const $ = id => document.getElementById(id);
    const loading = $("playlists-loading");
    const grid = $("playlists-grid");
    const moreBtn = $("playlist-more");
    const search = $("playlist-search");
    const channelSel = $("playlist-channel");
    const total = $("playlist-total");

    const modal = $("playlist-modal");
    const modalName = $("modal-playlist-name");
    const modalChannel = $("modal-playlist-channel");
    const modalStats = $("modal-playlist-stats");
    const modalThumb = $("modal-playlist-thumb");
    const modalBg = $("modal-bg-img");
    const modalVideos = $("modal-videos-grid");

    const esc = s => escapeHtml(s);
    const state = { page: 0, hasMore: false, server: null, items: [], current: null };

    const closeModal = () => { modal.classList.add("hidden"); modal.classList.remove("flex"); document.body.style.overflow = ""; };
    $("close-playlist").addEventListener("click", closeModal);
    document.addEventListener("keydown", e => { if (e.key === "Escape") closeModal(); });

    function videoHref(v) {
        const base = (v.isShort || v.isReel) ? "shorts.html" : "watch.html";
        return `${base}?id=${encodeURIComponent(v.id)}`;
    }

    // ---------- server playlists ----------
    async function fetchPage(reset) {
        if (reset) { state.page = 0; state.items = []; grid.innerHTML = ""; }
        const qs = new URLSearchParams({ page: state.page + 1, limit: 24, q: search.value.trim(), channel: channelSel.value });
        try {
            let data = null;
            if (state.backend !== 'static' && !(typeof ENV !== 'undefined' && ENV.STATIC_HOST === true)) {
                const res = await fetch("/api/playlists?" + qs).catch(() => null);
                if (res && res.ok && (res.headers.get('content-type') || '').includes('json')) { data = await res.json(); state.backend = 'server'; }
            }
            if (!data && window.StaticCatalog) {
                state.backend = 'static';
                data = await window.StaticCatalog.playlists({ page: state.page + 1, limit: 24, q: search.value.trim(), channel: channelSel.value });
            }
            if (!data) throw new Error();
            state.server = true;
            state.page = data.page;
            state.hasMore = data.hasMore;
            total.textContent = `${data.total.toLocaleString()} playlists`;
            renderCards(data.items, state.items.length);
            state.items.push(...data.items);
            if (!state.items.length) grid.innerHTML = `<p class="col-span-full text-zinc-500 py-16 text-center">No playlists found${search.value ? ' for “' + esc(search.value) + '”' : ''}.</p>`;
        } catch (e) {
            state.server = false;
        }
        moreBtn.classList.toggle("hidden", !state.hasMore);
    }

    function renderCards(items) {
        const frag = document.createDocumentFragment();
        items.forEach(p => {
            const card = document.createElement("button");
            card.type = "button";
            card.className = "text-left group";
            card.innerHTML = `
                <div class="relative aspect-video rounded-xl overflow-hidden mb-3 bg-zinc-800">
                    <div class="absolute -top-1.5 inset-x-3 h-3 rounded-t-xl bg-zinc-700/70"></div>
                    <img src="${esc(safeUrl(p.thumbnail))}" alt="" loading="lazy" class="relative w-full h-full object-cover group-hover:scale-105 transition duration-300">
                    <div class="absolute inset-y-0 right-0 w-2/5 bg-black/75 backdrop-blur-sm flex flex-col items-center justify-center text-white">
                        <span class="text-lg font-black">${Number(p.itemCount || 0).toLocaleString()}</span>
                        <i class="fas fa-list-ul text-sm mt-1 text-zinc-300"></i>
                    </div>
                    <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                        <span class="bg-white text-black text-xs font-bold px-3 py-1.5 rounded-full"><i class="fas fa-play mr-1"></i>View playlist</span>
                    </div>
                </div>
                <h3 class="font-bold text-[15px] leading-snug line-clamp-2 text-zinc-100 group-hover:text-white">${esc(p.title)}</h3>
                <p class="text-sm text-zinc-400 mt-1 truncate">${esc(p.channel)} <i class="fas fa-circle-check text-[10px] text-zinc-500"></i></p>`;
            card.addEventListener("click", () => openServerPlaylist(p));
            frag.appendChild(card);
        });
        grid.appendChild(frag);
    }

    function fillModalHeader(name, channel, thumb, statsText) {
        modalName.textContent = name;
        modalChannel.textContent = channel;
        modalStats.textContent = statsText;
        modalThumb.src = safeUrl(thumb);
        modalBg.style.backgroundImage = thumb ? `url("${safeUrl(thumb)}")` : "";
        modal.classList.remove("hidden");
        modal.classList.add("flex");
        document.body.style.overflow = "hidden";
    }

    function renderVideoList(videos) {
        state.current = videos;
        if (!videos.length) {
            modalVideos.innerHTML = `<p class="text-zinc-500 text-center py-16">This playlist has no videos on JTube yet.</p>`;
            return;
        }
        modalVideos.innerHTML = videos.map((v, idx) => `
            <a href="${videoHref(v)}" class="flex gap-4 p-2 sm:p-3 hover:bg-white/10 rounded-xl transition group">
                <div class="text-zinc-400 font-medium self-center w-6 text-center text-sm">${idx + 1}</div>
                <div class="w-[120px] sm:w-[168px] aspect-video bg-zinc-800 rounded-lg overflow-hidden flex-shrink-0 relative">
                    <img src="${esc(safeUrl(v.thumbnail))}" alt="" loading="lazy" class="w-full h-full object-cover">
                    <span class="absolute bottom-1 right-1 bg-black/80 px-1.5 py-0.5 rounded text-[10px] font-semibold text-white">${(v.isShort || v.isReel) ? "Short" : esc(v.duration || "")}</span>
                </div>
                <div class="flex-1 min-w-0 py-1">
                    <h4 class="font-semibold text-sm sm:text-[15px] text-zinc-100 line-clamp-2 leading-snug group-hover:text-white">${esc(v.title)}</h4>
                    <p class="text-xs text-zinc-400 mt-1.5 truncate">${esc(v.channel)} • ${formatCompactNumber(v.views || 0)} views • ${esc(v.time || "")}</p>
                </div>
            </a>`).join("");
    }

    async function openServerPlaylist(p) {
        fillModalHeader(p.title, p.channel, p.thumbnail, `${Number(p.itemCount).toLocaleString()} videos`);
        $("pl-youtube").href = `https://www.youtube.com/playlist?list=${encodeURIComponent(p.id)}`;
        $("pl-youtube").classList.remove("hidden");
        modalVideos.innerHTML = `<p class="text-zinc-500 text-center py-16"><i class="fas fa-spinner fa-spin mr-2"></i>Loading videos…</p>`;
        try {
            let data;
            if (state.backend === 'static') {
                data = await window.StaticCatalog.playlist(p.id);
                if (!data) throw new Error();
            } else {
                const res = await fetch("/api/playlists/" + encodeURIComponent(p.id));
                if (!res.ok) throw new Error();
                data = await res.json();
            }
            const items = sanitizeAndCurateVideos(data.items || []);
            modalStats.textContent = `${Number(p.itemCount).toLocaleString()} videos${items.length < p.itemCount ? ` • ${items.length} public` : ""}`;
            renderVideoList(items);
        } catch (e) {
            modalVideos.innerHTML = `<p class="text-zinc-500 text-center py-16">Could not load this playlist right now.</p>`;
        }
    }

    $("pl-play-all").addEventListener("click", () => { if (state.current && state.current[0]) location.href = videoHref(state.current[0]); });
    $("pl-shuffle").addEventListener("click", () => {
        if (state.current && state.current.length) location.href = videoHref(state.current[Math.floor(Math.random() * state.current.length)]);
    });
    $("pl-share").addEventListener("click", async () => {
        try { await navigator.clipboard.writeText($("pl-youtube").href || location.href); showToast("Link copied", "success"); } catch (e) {}
    });

    // ---------- legacy fallback (static hosting): playlists from local video fields ----------
    async function renderLegacy() {
        const playlists = await getPlaylists();
        total.textContent = `${playlists.length} playlists`;
        if (!playlists.length) { grid.innerHTML = `<p class="col-span-full text-zinc-500 py-16 text-center">No playlists available.</p>`; return; }
        playlists.forEach(p => {
            const card = document.createElement("button");
            card.type = "button";
            card.className = "text-left group";
            card.innerHTML = `
                <div class="relative aspect-video rounded-xl overflow-hidden mb-3 bg-zinc-800">
                    <img src="${esc(safeUrl(p.thumbnail))}" alt="" class="w-full h-full object-cover group-hover:scale-105 transition duration-300">
                    <div class="absolute top-2 right-2 bg-black/80 px-2 py-1 rounded text-xs font-bold"><i class="fas fa-list mr-1"></i>${p.videos.length}</div>
                </div>
                <h3 class="font-bold text-[15px] line-clamp-2 text-zinc-100">${esc(p.name)}</h3>
                <p class="text-sm text-zinc-400 mt-1 truncate">${esc(p.channel)}</p>`;
            card.addEventListener("click", () => {
                fillModalHeader(p.name, p.channel, p.thumbnail, `${p.videos.length} videos`);
                $("pl-youtube").classList.add("hidden");
                renderVideoList(p.videos);
            });
            grid.appendChild(card);
        });
    }

    // ---------- init ----------
    try {
        let chans = null;
        const res = (typeof ENV !== 'undefined' && ENV.STATIC_HOST === true) ? null : await fetch("/api/channels/featured").catch(() => null);
        if (res && res.ok && (res.headers.get('content-type') || '').includes('json')) chans = (await res.json()).channels;
        else if (window.StaticCatalog) chans = await window.StaticCatalog.channels();
        if (chans) {
            const d = { channels: chans };
            (d.channels || []).map(c => c.name).sort((a, b) => a.localeCompare(b)).forEach(n => {
                const o = document.createElement("option");
                o.value = n; o.textContent = n;
                channelSel.appendChild(o);
            });
        }
    } catch (e) {}

    await fetchPage(true);
    if (state.server === false) await renderLegacy();
    loading.classList.add("hidden");
    grid.classList.remove("hidden");

    moreBtn.addEventListener("click", () => fetchPage(false));
    let t = null;
    search.addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => state.server && fetchPage(true), 300); });
    channelSel.addEventListener("change", () => state.server && fetchPage(true));
});
