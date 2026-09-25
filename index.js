document.addEventListener("DOMContentLoaded", async () => {
    const videoGrid = document.getElementById("video-grid");
    const topVideoGrid = document.getElementById("top-video-grid");
    const bottomVideoGrid = document.getElementById("bottom-video-grid");
    const shortsShelf = document.getElementById("shorts-shelf");
    const shortsCarousel = document.getElementById("shorts-carousel");
    const sidebar = document.getElementById("sidebar");
    const menuBtn = document.getElementById("menu-btn");
    const categoryBtns = document.querySelectorAll(".category-btn");
    const sidebarChannels = document.getElementById("sidebar-channels");
    const historyBtn = document.getElementById("history-btn");
    const pageTitle = document.getElementById("page-title");
    const categoryBar = document.getElementById("category-bar");
    const searchInput = document.getElementById("search-input");
    const searchBtn = document.getElementById("search-btn");
    const searchDropdown = document.getElementById("search-dropdown");
    const searchResultsList = document.getElementById("search-results-list");
    const searchResultsSection = document.getElementById("search-results-section");
    const searchResultsGrid = document.getElementById("search-results-grid");
    const searchQueryLabel = document.getElementById("search-query-label");
    const clearSearchBtn = document.getElementById("clear-search-btn");
    const mobileSearchBtn = document.getElementById("mobile-search-btn");
    const mobileSearchBar = document.getElementById("mobile-search-bar");
    const mobileSearchInput = document.getElementById("mobile-search-input");
    const mobileSearchClear = document.getElementById("mobile-search-clear");

    // Show skeleton loading cards immediately for fast perceived load
    let allVideosCache = [];
    function showSkeletonLoading() {
        let skeletonHtml = '';
        for (let i = 0; i < 6; i++) {
            skeletonHtml += `
                <div class="animate-pulse bg-zinc-800/50 rounded-xl pb-3">
                    <div class="aspect-video bg-zinc-700/50 rounded-xl mb-3"></div>
                    <div class="flex space-x-3 px-3">
                        <div class="w-9 h-9 bg-zinc-700/50 rounded-full flex-shrink-0"></div>
                        <div class="flex-1 space-y-2">
                            <div class="h-3.5 bg-zinc-700/50 rounded w-full"></div>
                            <div class="h-3 bg-zinc-700/50 rounded w-3/4"></div>
                            <div class="h-2.5 bg-zinc-700/50 rounded w-1/2"></div>
                        </div>
                    </div>
                </div>`;
        }
        if (topVideoGrid) topVideoGrid.innerHTML = skeletonHtml;
        if (videoGrid) videoGrid.innerHTML = skeletonHtml;
    }
    showSkeletonLoading();

    // Auth Modal DOM
    const authModal = document.getElementById("auth-modal");
    const closeAuthBtn = document.getElementById("close-auth");
    const authForm = document.getElementById("auth-form");
    const authTitle = document.getElementById("auth-title");
    const nameGroup = document.getElementById("name-group");
    const authName = document.getElementById("auth-name");
    const authEmail = document.getElementById("auth-email");
    const authPassword = document.getElementById("auth-password");
    const authSubmitText = document.getElementById("auth-submit-text");
    const authSwitchText = document.getElementById("auth-switch-text");
    const authSwitchBtn = document.getElementById("auth-switch-btn");
    const googleAuthBtn = document.getElementById("google-auth-btn");
    
    let isRegistering = false;
    let showingHistory = false;

    // Handle User State
    document.addEventListener('authStateChanged', async (e) => {
        await renderSidebarChannels(); // Update sidebar on auth state change
        if (e.detail) {
            authModal.classList.add("hidden");
            if (showingHistory) {
                await renderVideos("history");
            }
        } else {
            if (showingHistory) {
                showingHistory = false;
                pageTitle.classList.add("hidden");
                categoryBar.classList.remove("hidden");
                await renderVideos("all");
            }
        }
    });

    function openAuthModal() {
        authModal.classList.remove("hidden");
    }

    closeAuthBtn.addEventListener("click", () => {
        authModal.classList.add("hidden");
    });

    authSwitchBtn.addEventListener("click", () => {
        isRegistering = !isRegistering;
        if (isRegistering) {
            authTitle.textContent = "Create an Account";
            nameGroup.classList.remove("hidden");
            authName.required = true;
            authSubmitText.textContent = "Register";
            authSwitchText.textContent = "Already have an account?";
            authSwitchBtn.textContent = "Login";
        } else {
            authTitle.textContent = "Login Required";
            nameGroup.classList.add("hidden");
            authName.required = false;
            authSubmitText.textContent = "Login";
            authSwitchText.textContent = "Don't have an account?";
            authSwitchBtn.textContent = "Register";
        }
    });

    authForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const email = authEmail.value;
        const pass = authPassword.value;
        try {
            if (isRegistering) {
                const name = authName.value;
                await registerWithEmail(email, pass, name);
                showToast('Registration successful!', 'success');
            } else {
                await loginWithEmail(email, pass);
            }
        } catch (error) {
            showToast(error.message, 'error');
        }
    });

    if (googleAuthBtn) {
        googleAuthBtn.addEventListener("click", async () => {
            try {
                await loginWithGoogle();
            } catch (error) {
                showToast(error.message, 'error');
            }
        });
    }

    // Toggle Responsive Mobile Sidebar
    const sidebarOverlay = document.getElementById("sidebar-overlay");
    
    function toggleSidebar() {
        sidebar.classList.toggle("-translate-x-full");
        if (sidebarOverlay) {
            sidebarOverlay.classList.toggle("hidden");
        }
    }

    menuBtn.addEventListener("click", toggleSidebar);

    if (sidebarOverlay) {
        sidebarOverlay.addEventListener("click", toggleSidebar);
    }

    // Populate Sidebar with Subscribed / Recommended channels with lazy loading
    async function renderSidebarChannels() {
        const channels = await getChannels();
        sidebarChannels.innerHTML = "";
        
        let channelList = [];
        if (currentUser) {
            Object.keys(channels).forEach(channelName => {
                const cData = channels[channelName];
                if (cData.subscribedBy && cData.subscribedBy.includes(currentUser.email)) {
                    channelList.push({ name: channelName, data: cData, subscribed: true });
                }
            });
        }

        // If no user subscriptions yet, show top channels for instant exploration
        if (channelList.length === 0) {
            channelList = Object.keys(channels).slice(0, 7).map(channelName => ({
                name: channelName,
                data: channels[channelName],
                subscribed: false
            }));
        }

        if (channelList.length === 0) {
            sidebarChannels.innerHTML = `<p class="text-xs text-zinc-500 px-3 py-2">No channels found.</p>`;
            return;
        }

        const fragment = document.createDocumentFragment();
        channelList.forEach(({ name: channelName, data: cData }) => {
            const link = document.createElement("a");
            link.href = `channel.html?name=${encodeURIComponent(channelName)}`;
            link.className = "flex items-center space-x-3 p-2 hover:bg-zinc-800 rounded-xl text-zinc-300 transition";
            
            const avatarHtml = (cData && cData.avatarUrl) 
                ? `<img src="${cData.avatarUrl}" alt="${channelName}" loading="lazy" decoding="async" class="w-6 h-6 rounded-full object-cover">`
                : `<div class="bg-zinc-700 w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs">${channelName[0]}</div>`;
            
            link.innerHTML = `
                ${avatarHtml}
                <div class="flex items-center space-x-1 min-w-0">
                    <span class="text-sm truncate">${channelName}</span>
                    <img src="img/icons.svg" class="w-3.5 h-3.5 flex-shrink-0" alt="Verified" title="Verified" loading="lazy">
                </div>
            `;
            fragment.appendChild(link);
        });
        sidebarChannels.appendChild(fragment);
    }

    // Track active category
    let currentCategory = "all";

    // Categories & channels listeners (do not auto-reload video feed)
    document.addEventListener('jtube:categoriesUpdated', () => {
        renderCategories();
    });
    document.addEventListener('jtube:channelsUpdated', () => {
        renderSidebarChannels();
    });

    // Progressive pagination state for thousands of videos & reels
    let activeVideosPool = [];
    let currentRenderIndex = 0;
    const CHUNK_SIZE = 24;
    let infiniteScrollObserver = null;
    let cachedChannelsMap = {};

    // Render Reel Feed Card for the main feed when viewed together with standard videos
    function renderReelFeedCard(video, channelsMap) {
        const channelData = (channelsMap && channelsMap[video.channel]) || {};
        const subsCount = typeof getEffectiveSubscribers === 'function' ? getEffectiveSubscribers(channelData) : (channelData.subscribers || 0);
        const effectiveLikes = typeof getEffectiveLikes === 'function' ? getEffectiveLikes(video) : (video.likes || 0);

        const card = document.createElement('div');
        card.className = "cursor-pointer group relative video-card-custom bg-[#14121b] rounded-2xl pb-3.5 h-full flex flex-col border border-pink-500/20 hover:border-pink-500/50 shadow-md hover:shadow-pink-500/10 transition-all";
        card.onclick = () => location.href = `shorts.html?id=${video.id}`;

        let avatarHtml = `<div class="flex-shrink-0 bg-zinc-800 text-zinc-300 border border-white/10 w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs mt-0.5">${(video.channel || 'C')[0]}</div>`;
        if (channelData && channelData.avatarUrl) {
            avatarHtml = `<img src="${channelData.avatarUrl}" class="flex-shrink-0 w-9 h-9 rounded-full object-cover border border-white/10 mt-0.5" alt="${video.channel}" loading="lazy">`;
        }

        card.innerHTML = `
            <div class="relative aspect-video thumbnail-wrapper bg-[#1d1424] rounded-t-2xl overflow-hidden mb-3 flex items-center justify-center">
                <img src="${video.thumbnail}" alt="${video.title.replace(/"/g, '&quot;')}" loading="lazy" decoding="async" class="w-full h-full object-cover group-hover:scale-105 transition duration-300">
                <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30 pointer-events-none"></div>
                
                <span class="absolute top-2.5 left-2.5 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-gradient-to-r from-red-600 via-rose-600 to-pink-600 text-white border border-white/20 z-20 flex items-center gap-1.5 shadow-lg shadow-red-600/30">
                    <i class="fas fa-bolt text-[9px] text-amber-300"></i> Reel
                </span>

                <div class="play-icon-overlay absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/35 transition-all duration-200 z-10">
                    <div class="w-11 h-11 bg-gradient-to-r from-red-600 to-pink-600 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-200 scale-90 group-hover:scale-100 shadow-xl shadow-pink-600/40">
                        <i class="fas fa-play text-xs ml-0.5"></i>
                    </div>
                </div>
                
                <span class="absolute bottom-2.5 right-2.5 px-2 py-0.5 rounded-md text-[11px] font-mono font-bold z-30 bg-black/85 backdrop-blur-md text-pink-300 border border-pink-500/30">
                    ⚡ ${video.duration || '0:45'}
                </span>
            </div>
            <div class="flex space-x-3 px-3.5 flex-1">
                ${avatarHtml}
                <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-1.5 mb-1.5">
                        <span class="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-pink-500/15 text-pink-400 border border-pink-500/25">
                            <i class="fas fa-bolt text-[8px]"></i> Reel & Short
                        </span>
                        <span class="text-[10px] text-zinc-500 font-medium">${video.category || 'Reel'}</span>
                    </div>
                    <h3 class="font-semibold text-sm line-clamp-2 leading-snug text-zinc-100 group-hover:text-pink-200 transition-colors">${video.title}</h3>
                    <div class="flex items-center space-x-1.5 mt-1.5 text-zinc-400 hover:text-zinc-200 cursor-pointer w-fit" onclick="event.stopPropagation(); location.href='channel.html?name=${encodeURIComponent(video.channel)}'">
                        <p class="text-xs truncate font-medium text-zinc-300">${video.channel}</p>
                        <img src="img/icons.svg" class="w-3.5 h-3.5 flex-shrink-0" alt="Verified" title="Verified Creator">
                        <span class="text-[11px] text-zinc-500 font-normal">(${formatCompactNumber(subsCount)} subs)</span>
                    </div>
                    <div class="flex items-center flex-wrap gap-x-2 gap-y-0.5 text-xs text-zinc-400 mt-1.5">
                        <span>${formatCompactNumber(video.views || 0)} views</span>
                        <span class="text-zinc-600">•</span>
                        <span class="inline-flex items-center gap-1 text-pink-400 font-medium"><i class="fas fa-heart text-[10px]"></i> ${formatCompactNumber(effectiveLikes)}</span>
                        <span class="text-zinc-600">•</span>
                        <span>${timeAgo(video.timestamp)}</span>
                    </div>
                </div>
            </div>
        `;
        return card;
    }

    // Helper to construct a standard big video card
    function renderStandardBigCard(video, channelsMap) {
        const cMap = channelsMap || cachedChannelsMap || {};
        const badgeLabel = video.qualityBadge || (video.duration && video.duration.length > 5 ? "✦ Masterclass" : "✦ Verified HD");
        const qualityBadgeHtml = `
            <div class="flex items-center gap-1.5 mb-1.5">
                <span class="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                    <i class="fas fa-check-circle text-[8px]"></i> ${badgeLabel}
                </span>
                <span class="text-[10px] text-zinc-500 font-medium">${video.category || 'Curated'}</span>
            </div>
        `;

        let avatarHtml = `<div class="flex-shrink-0 bg-zinc-800 text-zinc-300 border border-white/10 w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs mt-0.5">${(video.channel || 'J')[0]}</div>`;
        if (cMap[video.channel] && cMap[video.channel].avatarUrl) {
            avatarHtml = `<img src="${cMap[video.channel].avatarUrl}" class="flex-shrink-0 w-9 h-9 rounded-full object-cover border border-white/10 mt-0.5" alt="${video.channel}" loading="lazy">`;
        }

        const ytId = getYoutubeId(video.videoUrl);
        const card = document.createElement('div');
        card.className = "cursor-pointer group relative video-card-custom bg-[#12151c] rounded-2xl pb-3.5 h-full flex flex-col border border-white/[0.06] hover:border-white/[0.14] transition-all";
        card.onclick = () => location.href = `watch.html?id=${video.id}`;
        
        const durationBadge = `<span class="absolute bottom-2.5 right-2.5 px-2 py-0.5 rounded-md text-[11px] font-semibold z-30 bg-black/80 backdrop-blur-md text-zinc-200 border border-white/10">${video.duration || 'Video'}</span>`;

        const channelData = cMap[video.channel];
        const subsCount = typeof getEffectiveSubscribers === 'function' ? getEffectiveSubscribers(channelData) : (channelData ? (channelData.subscribers || 0) : 0);
        const effectiveLikes = typeof getEffectiveLikes === 'function' ? getEffectiveLikes(video) : (video.likes || 0);

        card.innerHTML = `
            <div class="relative aspect-video thumbnail-wrapper bg-[#181c26] rounded-t-2xl overflow-hidden mb-3">
                <img src="${video.thumbnail}" alt="${video.title.replace(/"/g, '&quot;')}" loading="lazy" decoding="async" class="w-full h-full object-cover group-hover:scale-105 transition duration-300">
                <span class="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-black/75 backdrop-blur-md text-zinc-200 border border-white/10 z-20 flex items-center gap-1">
                    <i class="fas fa-sparkles text-amber-400 text-[8px]"></i> Curated
                </span>
                <div class="video-preview-container absolute inset-0 w-full h-full bg-black z-20 pointer-events-none hidden"></div>
                <div class="play-icon-overlay absolute inset-0 flex items-center justify-center bg-black/25 group-hover:bg-black/40 transition-all duration-200 z-10">
                    <div class="w-11 h-11 bg-red-600 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-200 scale-90 group-hover:scale-100 shadow-xl">
                        <i class="fas fa-play text-xs ml-0.5"></i>
                    </div>
                </div>
                ${durationBadge}
            </div>
            <div class="flex space-x-3 px-3.5 flex-1">
                ${avatarHtml}
                <div class="flex-1 min-w-0">
                    ${qualityBadgeHtml}
                    <h3 class="font-semibold text-sm line-clamp-2 leading-snug text-zinc-100 group-hover:text-white">${video.title}</h3>
                    <div class="flex items-center space-x-1.5 mt-1.5 text-zinc-400 hover:text-zinc-200 cursor-pointer w-fit" onclick="event.stopPropagation(); location.href='channel.html?name=${encodeURIComponent(video.channel)}'">
                        <p class="text-xs truncate font-medium text-zinc-300">${video.channel}</p>
                        <img src="img/icons.svg" class="w-3.5 h-3.5 flex-shrink-0" alt="Verified" title="Verified Creator">
                        <span class="text-[11px] text-zinc-500 font-normal">(${formatCompactNumber(subsCount)} subs)</span>
                    </div>
                    <div class="flex items-center flex-wrap gap-x-2 gap-y-0.5 text-xs text-zinc-400 mt-1.5">
                        <span>${formatCompactNumber(video.views || 0)} views</span>
                        <span class="text-zinc-600">•</span>
                        <span class="inline-flex items-center gap-1 text-zinc-300 font-medium"><i class="far fa-thumbs-up text-[10px] text-red-400"></i> ${formatCompactNumber(effectiveLikes)}</span>
                        <span class="text-zinc-600">•</span>
                        <span>${timeAgo(video.timestamp)}</span>
                    </div>
                </div>
            </div>
        `;
        
        // Hover to play and prefetch
        let hoverTimeout;
        card.addEventListener('mouseenter', () => {
            hoverTimeout = setTimeout(() => {
                if (ytId) {
                    const previewContainer = card.querySelector('.video-preview-container');
                    if (previewContainer && previewContainer.innerHTML === '') {
                        previewContainer.innerHTML = `<iframe class='w-full h-full pointer-events-none' src='https://www.youtube.com/embed/${ytId}?autoplay=1&mute=0&controls=0&modestbranding=1&showinfo=0' frameborder='0' allow='autoplay; encrypted-media' allowfullscreen></iframe>`;
                    }
                    if (previewContainer) previewContainer.classList.remove('hidden');
                    const playOverlay = card.querySelector('.play-icon-overlay');
                    if (playOverlay) playOverlay.classList.add('hidden');
                }
                if (!document.querySelector(`link[href="watch.html?id=${video.id}"]`)) {
                    const link = document.createElement('link');
                    link.rel = 'prefetch';
                    link.href = `watch.html?id=${video.id}`;
                    document.head.appendChild(link);
                }
            }, 400);
        });
        
        card.addEventListener('mouseleave', () => {
            clearTimeout(hoverTimeout);
            const previewContainer = card.querySelector('.video-preview-container');
            if (previewContainer) {
                previewContainer.innerHTML = '';
                previewContainer.classList.add('hidden');
            }
            const playIcon = card.querySelector('.play-icon-overlay');
            if (playIcon) playIcon.classList.remove('hidden');
        });
        
        return card;
    }

    // Dynamic Feed Looping & Rotating Cycle State
    let feedReloadCycle = parseInt(sessionStorage.getItem('jtube_feed_cycle_offset') || '0', 10);
    feedReloadCycle = (feedReloadCycle + 1) % 1000;
    sessionStorage.setItem('jtube_feed_cycle_offset', String(feedReloadCycle));

    function applyDynamicLoopRotation(list) {
        if (!Array.isArray(list) || list.length <= 1) return list;
        const step = 4;
        const offset = (feedReloadCycle * step) % list.length;
        if (offset === 0) return [...list];
        return [...list.slice(offset), ...list.slice(0, offset)];
    }

    function createFeedCard(item, channelsMap) {
        if (isShortVideo(item)) {
            return renderReelFeedCard(item, channelsMap);
        }
        return renderStandardBigCard(item, channelsMap);
    }

    // Append next progressive batch to ensure zero lag and continuous loop
    function appendNextBatch() {
        if (!activeVideosPool || activeVideosPool.length === 0) return;

        const poolLength = activeVideosPool.length;
        const nextSlice = [];
        for (let i = 0; i < CHUNK_SIZE; i++) {
            const indexInPool = (currentRenderIndex + i) % poolLength;
            nextSlice.push(activeVideosPool[indexInPool]);
        }
        currentRenderIndex += nextSlice.length;

        const fragment = document.createDocumentFragment();
        nextSlice.forEach(item => {
            if (currentCategory === "shorts") {
                const shortCard = document.createElement('div');
                shortCard.className = "group relative aspect-[9/16] rounded-2xl overflow-hidden cursor-pointer bg-zinc-900 border border-zinc-800/80 shadow-md hover:shadow-red-600/20 hover:border-red-500/40 transition-all duration-300 flex flex-col justify-end";
                shortCard.onclick = () => location.href = `shorts.html?id=${item.id}`;
                shortCard.innerHTML = `
                    <img src="${item.thumbnail}" alt="${item.title.replace(/"/g, '&quot;')}" loading="lazy" class="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300">
                    <div class="absolute top-2.5 left-2.5 z-20">
                        <span class="bg-black/70 backdrop-blur-md text-red-500 text-[10px] font-black px-2 py-0.5 rounded-full flex items-center gap-1 border border-white/10">
                            <i class="fas fa-bolt text-[9px]"></i> Reel
                        </span>
                    </div>
                    <div class="absolute inset-0 bg-black/20 group-hover:bg-black/40 transition-colors flex items-center justify-center z-10">
                        <div class="w-10 h-10 rounded-full bg-red-600 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 scale-75 group-hover:scale-100 transition-all shadow-lg">
                            <i class="fas fa-play text-xs ml-0.5"></i>
                        </div>
                    </div>
                    <div class="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black via-black/70 to-transparent z-20 pointer-events-none"></div>
                    <div class="relative p-2.5 sm:p-3 z-30 pointer-events-none">
                        <h3 class="text-xs font-bold text-white line-clamp-2 leading-snug drop-shadow mb-1 group-hover:text-red-400 transition-colors">
                            ${item.title}
                        </h3>
                        <p class="text-[10px] text-zinc-400 font-medium">
                            ${formatCompactNumber(item.views || 0)} views
                        </p>
                    </div>
                `;
                fragment.appendChild(shortCard);
            } else {
                fragment.appendChild(createFeedCard(item, cachedChannelsMap));
            }
        });

        if (currentCategory === "shorts") {
            if (topVideoGrid) topVideoGrid.appendChild(fragment);
        } else {
            if (bottomVideoGrid) bottomVideoGrid.appendChild(fragment);
        }

        updateStatsBanner(currentRenderIndex, activeVideosPool.length);

        const loadBtn = document.getElementById("load-more-btn");
        const notice = document.getElementById("all-loaded-notice");
        if (loadBtn) {
            loadBtn.classList.remove("hidden");
            const loopPass = Math.floor(currentRenderIndex / poolLength);
            loadBtn.innerHTML = loopPass > 0 
                ? `<i class="fas fa-arrows-rotate text-xs animate-spin"></i> <span>Cycling Continuously (Loop Cycle ${loopPass + 1})</span>`
                : `<i class="fas fa-arrows-rotate text-xs"></i> <span>Cycle More Videos</span>`;
        }
        if (notice) notice.classList.add("hidden");
    }

    function updateStatsBanner(renderedCount, totalCount) {
        const counterEl = document.getElementById("content-counter-text");
        const modeBadge = document.getElementById("viewing-mode-badge");
        if (!counterEl) return;

        const reelsCount = activeVideosPool.filter(v => isShortVideo(v)).length;
        const videosCount = totalCount - reelsCount;

        if (totalCount === 0) {
            counterEl.innerHTML = `No items found`;
            return;
        }

        const loopCount = Math.floor(renderedCount / Math.max(1, totalCount));
        const loopBadge = loopCount > 0 
            ? ` <span class="text-amber-400 font-semibold">• Loop ${loopCount + 1}</span>` 
            : ``;

        counterEl.innerHTML = `Showing <span class="font-bold text-white">${renderedCount.toLocaleString()}</span> cycled <span class="text-zinc-400 font-normal">(${videosCount.toLocaleString()} Videos • ${reelsCount.toLocaleString()} Reels)</span>${loopBadge}`;

        if (modeBadge) {
            if (currentCategory === "all") {
                modeBadge.innerHTML = `<i class="fas fa-layer-group text-[10px] text-emerald-400"></i> All Videos &amp; Reels Viewable Together (${totalCount.toLocaleString()})`;
            } else if (currentCategory === "shorts") {
                modeBadge.innerHTML = `<i class="fas fa-bolt text-[10px] text-pink-400"></i> Reels &amp; Shorts Only (${reelsCount.toLocaleString()})`;
            } else if (currentCategory === "videos_only") {
                modeBadge.innerHTML = `<i class="fas fa-film text-[10px] text-blue-400"></i> Standard Videos Only (${videosCount.toLocaleString()})`;
            } else {
                modeBadge.innerHTML = `<i class="fas fa-filter text-[10px] text-amber-400"></i> Category: ${currentCategory} (${totalCount.toLocaleString()})`;
            }
        }
    }

    function setupInfiniteScroll() {
        if (infiniteScrollObserver) {
            infiniteScrollObserver.disconnect();
        }
        const sentinel = document.getElementById("infinite-scroll-sentinel");
        const spinner = document.getElementById("loading-more-spinner");
        const loadBtn = document.getElementById("load-more-btn");

        if (loadBtn) {
            loadBtn.onclick = () => {
                appendNextBatch();
            };
        }

        if (sentinel && 'IntersectionObserver' in window) {
            infiniteScrollObserver = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting && activeVideosPool && activeVideosPool.length > 0) {
                        if (spinner) spinner.classList.remove("hidden");
                        setTimeout(() => {
                            appendNextBatch();
                            if (spinner) spinner.classList.add("hidden");
                        }, 120);
                    }
                });
            }, { rootMargin: '400px' });
            infiniteScrollObserver.observe(sentinel);
        }
    }

    // Render Videos Grid: Ensures ALL videos and Reels in Cloud Firestore are viewable together
    async function renderVideos(filterCategory = "all") {
        currentCategory = filterCategory;
        
        // Fetch full library from Cloud Firestore and channel directory
        const [videosData, channelsMap] = await Promise.all([
            filterCategory === "history" ? getHistory() : getVideos(),
            getChannels()
        ]);
        cachedChannelsMap = channelsMap || {};

        let videosToRender = [];
        if (filterCategory === "history") {
            videosToRender = videosData || [];
        } else if (filterCategory === "playlists") {
            videosToRender = (videosData || []).filter(v => v.playlist && v.playlist.trim() !== "");
            videosToRender = applyDynamicLoopRotation(videosToRender);
        } else if (filterCategory === "shorts") {
            // Dedicated Reels/Shorts view: all reels from Firestore
            videosToRender = (videosData || []).filter(v => isShortVideo(v));
            videosToRender = applyDynamicLoopRotation(videosToRender);
        } else if (filterCategory === "videos_only") {
            // Videos only: standard long-form videos
            videosToRender = (videosData || []).filter(v => !isShortVideo(v));
            videosToRender = applyDynamicLoopRotation(videosToRender);
        } else if (filterCategory === "all") {
            // ALL videos and ALL Reels saved in Firestore are viewable together!
            videosToRender = (videosData || []);
            videosToRender = applyDynamicLoopRotation(videosToRender);
        } else {
            // Topic category: matching videos and reels in that category
            videosToRender = (videosData || []).filter(v => v.category && v.category.toLowerCase() === filterCategory.toLowerCase() && !v.playlist);
            videosToRender = applyDynamicLoopRotation(videosToRender);
        }

        if (videoGrid) videoGrid.innerHTML = "";
        activeVideosPool = videosToRender;
        currentRenderIndex = 0;

        const notice = document.getElementById("all-loaded-notice");
        const loadBtn = document.getElementById("load-more-btn");
        if (notice) notice.classList.add("hidden");
        if (loadBtn) loadBtn.classList.add("hidden");

        // If user specifically selected the "Shorts" filter tab
        if (filterCategory === "shorts") {
            if (shortsShelf) shortsShelf.classList.add("hidden");
            if (bottomVideoGrid) bottomVideoGrid.innerHTML = "";
            if (topVideoGrid) {
                topVideoGrid.className = "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4";
                topVideoGrid.innerHTML = "";
                if (videosToRender.length === 0) {
                    topVideoGrid.innerHTML = `<p class="col-span-full text-zinc-500 text-center py-10">No shorts or reels found.</p>`;
                    updateStatsBanner(0, 0);
                    return;
                }
            }
            appendNextBatch();
            setupInfiniteScroll();
            return;
        }

        // Standard combined view: 3-column grid
        if (topVideoGrid) {
            topVideoGrid.className = "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-y-6 sm:gap-x-4 sm:gap-y-8";
            topVideoGrid.innerHTML = "";
        }
        if (bottomVideoGrid) {
            bottomVideoGrid.className = "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-y-6 sm:gap-x-4 sm:gap-y-8";
            bottomVideoGrid.innerHTML = "";
        }

        if (videosToRender.length === 0) {
            if (topVideoGrid) topVideoGrid.innerHTML = `<p class="col-span-full text-zinc-500 text-center py-10">No videos or reels found matching your selection.</p>`;
            if (shortsShelf) shortsShelf.classList.add("hidden");
            updateStatsBanner(0, 0);
            return;
        }

        // Place first 6 items in top grid
        const initialTopSlice = activeVideosPool.slice(0, 6);
        currentRenderIndex = initialTopSlice.length;

        const topFragment = document.createDocumentFragment();
        initialTopSlice.forEach(item => {
            topFragment.appendChild(createFeedCard(item, cachedChannelsMap));
        });
        if (topVideoGrid) {
            topVideoGrid.appendChild(topFragment);
        }

        // Place Shorts Shelf in the MIDDLE
        renderShortsShelf();

        // Place next initial batch into bottom grid
        appendNextBatch();

        // Setup progressive observer for the rest of the 3,000+ videos and 6,000+ reels
        setupInfiniteScroll();
    }

    // Auto-update feed when new videos or reels are saved into Cloud Firestore
    document.addEventListener('jtube:videosUpdated', async (e) => {
        if (currentCategory === "all" || currentCategory === "shorts" || currentCategory === "videos_only") {
            const freshVideos = e.detail;
            if (Array.isArray(freshVideos) && freshVideos.length > 0) {
                // Update active pool and counters
                let filtered = freshVideos;
                if (currentCategory === "shorts") filtered = freshVideos.filter(v => isShortVideo(v));
                else if (currentCategory === "videos_only") filtered = freshVideos.filter(v => !isShortVideo(v));
                
                if (filtered.length !== activeVideosPool.length) {
                    activeVideosPool = filtered;
                    updateStatsBanner(currentRenderIndex, activeVideosPool.length);
                }
            }
        }
    });

    historyBtn.addEventListener("click", async (e) => {
        e.preventDefault();
        clearSearch();
        if (!currentUser) {
            showingHistory = true;
            openAuthModal();
            return;
        }
        showingHistory = true;
        pageTitle.classList.remove("hidden");
        pageTitle.textContent = "Your History";
        categoryBar.classList.add("hidden");
        await renderVideos("history");
    });
    
    const sidebarPlaylistsBtn = document.getElementById("sidebar-playlists-btn");
    if (sidebarPlaylistsBtn) {
        sidebarPlaylistsBtn.addEventListener("click", async (e) => {
            e.preventDefault();
            clearSearch();
            showingHistory = false;
            pageTitle.classList.remove("hidden");
            pageTitle.textContent = "Playlist Videos";
            categoryBar.classList.add("hidden");
            await renderVideos("playlists");
        });
    }

    async function renderCategories() {
        const rawCategories = await getCategories();
        const categories = (rawCategories || []).filter(c => c && c.name && c.name !== "Cartoon" && c.name !== "Entertainment");
        
        categoryBar.innerHTML = `
            <button class="category-btn whitespace-nowrap active-category bg-white text-zinc-900 px-4 py-1.5 rounded-full text-xs sm:text-sm font-semibold transition flex items-center gap-1.5 shadow-sm" data-category="all">
                <i class="fas fa-layer-group text-[11px]"></i> All (Videos & Reels)
            </button>
            <button class="category-btn whitespace-nowrap bg-white/[0.05] hover:bg-white/[0.1] text-zinc-300 hover:text-white border border-white/[0.08] px-4 py-1.5 rounded-full text-xs sm:text-sm font-medium transition flex items-center gap-1.5" data-category="videos_only">
                <i class="fas fa-film text-blue-400 text-xs"></i> Videos Only
            </button>
            <button class="category-btn whitespace-nowrap bg-white/[0.05] hover:bg-white/[0.1] text-zinc-300 hover:text-white border border-white/[0.08] px-4 py-1.5 rounded-full text-xs sm:text-sm font-medium transition flex items-center gap-1.5" data-category="shorts">
                <i class="fas fa-bolt text-pink-400 text-xs"></i> Reels & Shorts
            </button>
        `;

        categories.forEach(cat => {
            let catIcon = "fa-folder";
            const name = cat.name.toLowerCase();
            if (name.includes("program") || name.includes("code")) catIcon = "fa-code";
            else if (name.includes("ai") || name.includes("machine")) catIcon = "fa-brain";
            else if (name.includes("cyber") || name.includes("security")) catIcon = "fa-shield-halved";
            else if (name.includes("science")) catIcon = "fa-atom";
            else if (name.includes("islam") || name.includes("faith")) catIcon = "fa-moon";
            else if (name.includes("tech")) catIcon = "fa-microchip";
            else if (name.includes("motivation") || name.includes("podcast")) catIcon = "fa-lightbulb";

            categoryBar.innerHTML += `
                <button class="category-btn whitespace-nowrap bg-white/[0.05] hover:bg-white/[0.1] text-zinc-300 hover:text-white border border-white/[0.08] px-4 py-1.5 rounded-full text-xs sm:text-sm font-medium transition flex items-center gap-1.5" data-category="${cat.name}">
                    <i class="fas ${catIcon} text-[11px] text-zinc-400"></i> ${cat.name}
                </button>
            `;
        });

        categoryBar.innerHTML += `
            <button class="category-btn whitespace-nowrap bg-white/[0.05] hover:bg-white/[0.1] text-zinc-300 hover:text-white border border-white/[0.08] px-4 py-1.5 rounded-full text-xs sm:text-sm font-medium transition flex items-center gap-1.5" data-category="playlists">
                <i class="fas fa-layer-group text-xs text-zinc-400"></i> Playlists
            </button>
        `;

        const newCategoryBtns = document.querySelectorAll(".category-btn");
        newCategoryBtns.forEach(btn => {
            btn.addEventListener("click", async (e) => {
                clearSearch();
                showingHistory = false;
                pageTitle.classList.add("hidden");
                categoryBar.classList.remove("hidden");
                
                newCategoryBtns.forEach(b => {
                    b.classList.remove("active-category", "bg-white", "text-zinc-900", "font-semibold");
                    b.classList.add("bg-white/[0.05]", "text-zinc-300");
                });
                
                const target = e.currentTarget || e.target;
                target.classList.remove("bg-white/[0.05]", "text-zinc-300");
                target.classList.add("active-category", "bg-white", "text-zinc-900", "font-semibold");

                const cat = target.dataset.category;
                await renderVideos(cat);
            });
        });
    }

    // ===== POWERFUL SEARCH LOGIC =====
    function buildVideoCard(video, channelsMap) {
        const ytId = getYoutubeId(video.videoUrl);
        const cMap = channelsMap || allChannelsCache || {};
        const channelData = cMap[video.channel];
        const subsCount = typeof getEffectiveSubscribers === 'function' ? getEffectiveSubscribers(channelData) : (channelData ? (channelData.subscribers || 0) : 0);
        const effectiveLikes = typeof getEffectiveLikes === 'function' ? getEffectiveLikes(video) : (video.likes || 0);
        const isShort = isShortVideo(video);

        const avatarHtml = channelData && channelData.avatarUrl
            ? `<img src="${channelData.avatarUrl}" class="flex-shrink-0 w-9 h-9 rounded-full object-cover border border-white/10 mt-0.5" alt="${video.channel}" loading="lazy">`
            : `<div class="flex-shrink-0 bg-zinc-800 text-zinc-300 border border-white/10 w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs mt-0.5">${video.channel[0]}</div>`;
        
        const card = document.createElement('div');
        card.className = "cursor-pointer group relative video-card-custom bg-[#12151c] rounded-2xl pb-3.5 h-full flex flex-col border border-white/[0.06] hover:border-white/[0.14] transition-all";
        card.onclick = () => location.href = isShort ? `shorts.html?id=${video.id}` : `watch.html?id=${video.id}`;
        
        const durationBadge = isShort
            ? `<span class="absolute bottom-2 right-2 px-2 py-0.5 rounded text-xs font-bold z-30 bg-red-600 text-white flex items-center gap-1 shadow"><i class="fas fa-bolt text-[9px]"></i> Shorts • ${video.duration}</span>`
            : `<span class="absolute bottom-2 right-2 px-2 py-0.5 rounded text-xs font-semibold z-30 ${getDurationBadgeClass(video.duration)}">${video.duration}</span>`;

        card.innerHTML = `
            <div class="relative aspect-video bg-zinc-800 rounded-xl overflow-hidden mb-3">
                <img src="${video.thumbnail}" alt="${video.title.replace(/"/g, '&quot;')}" loading="lazy" decoding="async" class="w-full h-full object-cover group-hover:scale-105 transition duration-200">
                <div class="play-icon-overlay absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition-all duration-200 z-10">
                    <div class="w-12 h-12 ${isShort ? 'bg-red-600' : 'bg-red-600/90'} rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-200 scale-75 group-hover:scale-100 shadow-lg">
                        <i class="fas ${isShort ? 'fa-bolt text-sm' : 'fa-play text-sm ml-0.5'} text-white"></i>
                    </div>
                </div>
                ${durationBadge}
            </div>
            <div class="flex space-x-3 px-3 flex-1">
                ${avatarHtml}
                <div class="flex-1 min-w-0">
                    <h3 class="font-semibold text-sm line-clamp-2 leading-snug text-zinc-100 group-hover:text-white">${video.title}</h3>
                    <div class="flex items-center space-x-1.5 mt-1 text-zinc-400 hover:text-zinc-200 cursor-pointer w-fit" onclick="event.stopPropagation(); location.href='channel.html?name=${encodeURIComponent(video.channel)}'">
                        <p class="text-xs truncate font-medium text-zinc-300">${video.channel}</p>
                        <img src="img/icons.svg" class="w-3 h-3 flex-shrink-0" alt="Verified" title="Verified">
                        <span class="text-[11px] text-zinc-400 font-normal">(${formatCompactNumber(subsCount)} subs)</span>
                    </div>
                    <div class="flex items-center flex-wrap gap-x-2 gap-y-0.5 text-xs text-zinc-400 mt-1">
                        <span>${formatCompactNumber(video.views || 0)} views</span>
                        <span>•</span>
                        <span class="inline-flex items-center gap-1 text-zinc-300 font-medium"><i class="far fa-thumbs-up text-[10px] text-red-400"></i> ${formatCompactNumber(effectiveLikes)}</span>
                        <span>•</span>
                        <span>${timeAgo(video.timestamp)}</span>
                    </div>
                </div>
            </div>
        `;
        return card;
    }

    function highlight(text, query) {
        if (!query) return text;
        const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
        return text.replace(regex, '<mark class="bg-red-500/30 text-red-300 rounded px-0.5">$1</mark>');
    }

    function filterVideos(query) {
        const q = query.toLowerCase().trim();
        if (!q) return [];
        return allVideosCache.filter(v =>
            (v.title && v.title.toLowerCase().includes(q)) ||
            (v.channel && v.channel.toLowerCase().includes(q)) ||
            (v.category && v.category.toLowerCase().includes(q)) ||
            (v.description && v.description.toLowerCase().includes(q)) ||
            (v.playlist && v.playlist.toLowerCase().includes(q))
        );
    }

    let searchDebounceTimer;
    function handleSearchInput(query) {
        clearTimeout(searchDebounceTimer);
        searchDebounceTimer = setTimeout(() => {
            const results = filterVideos(query);
            if (!query.trim()) {
                searchDropdown.classList.add('hidden');
                return;
            }
            // Populate dropdown
            searchResultsList.innerHTML = '';
            if (results.length === 0) {
                searchResultsList.innerHTML = `<div class="px-5 py-6 text-center text-zinc-500 text-sm"><i class="fas fa-search text-2xl mb-2 block opacity-30"></i>No results for "${query}"</div>`;
            } else {
                results.slice(0, 8).forEach(v => {
                    const item = document.createElement('div');
                    item.className = 'flex items-center gap-3 px-4 py-3 hover:bg-zinc-800 cursor-pointer transition-colors group/item';
                    item.innerHTML = `
                        <img src="${v.thumbnail}" class="w-14 h-10 rounded-lg object-cover flex-shrink-0">
                        <div class="flex-1 min-w-0">
                            <p class="text-sm font-medium text-zinc-100 line-clamp-1">${highlight(v.title, query)}</p>
                            <p class="text-xs text-zinc-400 mt-0.5">${highlight(v.channel, query)} <span class="text-zinc-600">•</span> ${v.category || ''}</p>
                        </div>
                        <i class="fas fa-arrow-right text-zinc-600 group-hover/item:text-red-400 transition text-xs"></i>
                    `;
                    item.onclick = () => { location.href = `watch.html?id=${v.id}`; };
                    searchResultsList.appendChild(item);
                });
                if (results.length > 8) {
                    const more = document.createElement('div');
                    more.className = 'px-5 py-3 border-t border-zinc-800 text-center';
                    more.innerHTML = `<button class="text-xs text-red-400 hover:text-red-300 font-semibold">See all ${results.length} results for "${query}"</button>`;
                    more.onclick = () => showFullSearchResults(query);
                    searchResultsList.appendChild(more);
                }
            }
            searchDropdown.classList.remove('hidden');
        }, 200);
    }

    function showFullSearchResults(query) {
        searchDropdown.classList.add('hidden');
        const results = filterVideos(query);
        searchQueryLabel.textContent = `"${query}"`;
        searchResultsSection.classList.remove('hidden');
        categoryBar.classList.add('hidden');
        videoGrid.classList.add('hidden');
        pageTitle.classList.add('hidden');

        searchResultsGrid.innerHTML = '';
        if (results.length === 0) {
            searchResultsGrid.innerHTML = `
                <div class="col-span-full flex flex-col items-center py-16 text-center">
                    <div class="w-20 h-20 bg-zinc-800 rounded-full flex items-center justify-center mb-4">
                        <i class="fas fa-search text-3xl text-zinc-600"></i>
                    </div>
                    <h3 class="text-lg font-bold text-zinc-400">No results found</h3>
                    <p class="text-zinc-600 text-sm mt-1">Try a different keyword or check spelling</p>
                </div>`;
        } else {
            const fragment = document.createDocumentFragment();
            results.forEach(v => fragment.appendChild(buildVideoCard(v, null)));
            searchResultsGrid.appendChild(fragment);
        }
    }

    function clearSearch() {
        searchInput.value = '';
        if (mobileSearchInput) mobileSearchInput.value = '';
        searchDropdown.classList.add('hidden');
        searchResultsSection.classList.add('hidden');
        videoGrid.classList.remove('hidden');
        categoryBar.classList.remove('hidden');
    }

    // Desktop search events
    searchInput.addEventListener('input', (e) => handleSearchInput(e.target.value));
    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') showFullSearchResults(searchInput.value);
    });
    searchBtn.addEventListener('click', () => showFullSearchResults(searchInput.value));
    clearSearchBtn.addEventListener('click', clearSearch);

    // Close dropdown on outside click
    document.addEventListener('click', (e) => {
        const container = document.getElementById('search-container');
        if (container && !container.contains(e.target)) {
            searchDropdown.classList.add('hidden');
        }
    });

    // Mobile search toggle
    if (mobileSearchBtn) {
        mobileSearchBtn.addEventListener('click', () => {
            mobileSearchBar.classList.toggle('hidden');
            if (!mobileSearchBar.classList.contains('hidden')) mobileSearchInput.focus();
        });
    }
    if (mobileSearchInput) {
        mobileSearchInput.addEventListener('input', (e) => handleSearchInput(e.target.value));
        mobileSearchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { showFullSearchResults(mobileSearchInput.value); mobileSearchBar.classList.add('hidden'); }
        });
    }
    if (mobileSearchClear) {
        mobileSearchClear.addEventListener('click', () => { mobileSearchBar.classList.add('hidden'); clearSearch(); });
    }

    // Handle home button click — robust selector using data lookup
    const homeBtn = document.querySelector('nav a[href="#"]');
    if (homeBtn) {
        homeBtn.addEventListener("click", async (e) => {
            e.preventDefault();
            clearSearch();
            showingHistory = false;
            pageTitle.classList.add("hidden");
            categoryBar.classList.remove("hidden");
            await renderVideos("all");
        });
    }

    // Pre-load all videos and channels into cache for instant search
    async function preloadVideosForSearch() {
        allVideosCache = await getVideos();
        allChannelsCache = await getChannels();
    }

    // ===== SHORTS SHELF (YouTube Style, in the middle of page) =====
    async function renderShortsShelf() {
        const shelf = document.getElementById('shorts-shelf');
        const carousel = document.getElementById('shorts-carousel');
        if (!shelf || !carousel) return;

        const videos = await getVideos();
        // Shorts are strictly separated
        const shorts = videos.filter(v => isShortVideo(v)).slice(0, 6);

        if (shorts.length === 0) {
            shelf.classList.add('hidden');
            return;
        }

        shelf.classList.remove('hidden');

        // Update real-time sync badge
        const syncBadge = document.getElementById('shorts-sync-badge');
        if (syncBadge && typeof AIVideoBrain !== 'undefined' && AIVideoBrain.lastTrained) {
            syncBadge.innerHTML = `<i class="fas fa-arrows-rotate text-[9px] text-green-400"></i> Synced: ${timeAgo(AIVideoBrain.lastTrained)}`;
        }

        carousel.innerHTML = shorts.map(v => `
            <div onclick="location.href='shorts.html?id=${v.id}'" 
                 class="group relative aspect-[9/16] rounded-2xl overflow-hidden cursor-pointer bg-zinc-900 border border-zinc-800/80 shadow-md hover:shadow-red-600/20 hover:border-red-500/40 transition-all duration-300 flex flex-col justify-end">
                <img src="${v.thumbnail}" alt="${v.title.replace(/"/g, '&quot;')}" loading="lazy" class="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300">
                
                <!-- Red Shorts Badge -->
                <div class="absolute top-2.5 left-2.5 z-20">
                    <span class="bg-black/70 backdrop-blur-md text-red-500 text-[10px] font-black px-2 py-0.5 rounded-full flex items-center gap-1 border border-white/10">
                        <i class="fas fa-bolt text-[9px]"></i> Shorts
                    </span>
                </div>

                <!-- Hover Play Icon -->
                <div class="absolute inset-0 bg-black/20 group-hover:bg-black/40 transition-colors flex items-center justify-center z-10">
                    <div class="w-10 h-10 rounded-full bg-red-600 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 scale-75 group-hover:scale-100 transition-all shadow-lg">
                        <i class="fas fa-play text-xs ml-0.5"></i>
                    </div>
                </div>

                <!-- Bottom Gradient Scrim -->
                <div class="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black via-black/70 to-transparent z-20 pointer-events-none"></div>

                <!-- Title & Views -->
                <div class="relative p-2.5 sm:p-3 z-30 pointer-events-none">
                    <h3 class="text-xs font-bold text-white line-clamp-2 leading-snug drop-shadow mb-1 group-hover:text-red-400 transition-colors">
                        ${v.title}
                    </h3>
                    <p class="text-[10px] text-zinc-400 font-medium">
                        ${formatCompactNumber(v.views || 0)} views
                    </p>
                </div>
            </div>
        `).join("");
    }

    // ===== FOOTER =====
    function renderFooter() {
        const main = document.querySelector('main');
        if (!main || document.querySelector('.jtube-footer')) return;
        const footer = document.createElement('div');
        footer.className = 'jtube-footer';
        footer.innerHTML = `
            <p>© ${new Date().getFullYear()} <a href="index.html"><strong>JTube</strong></a> — Built with ❤️ | 
            <a href="terms.html">Terms</a> · <a href="privacy.html">Privacy</a> · <a href="developer.html">Developer</a></p>
        `;
        main.appendChild(footer);
    }

    // ===== CONTINUE WATCHING SHELF (Firebase Firestore & Local Cache) =====
    const continueWatchingShelf = document.getElementById("continue-watching-shelf");
    const continueWatchingGrid = document.getElementById("continue-watching-grid");
    const clearContinueWatchingBtn = document.getElementById("clear-continue-watching-btn");

    function formatTimeSec(sec) {
        if (!sec || isNaN(sec) || sec <= 0) return "0:00";
        sec = Math.floor(sec);
        const m = Math.floor(sec / 60);
        const s = sec % 60;
        return `${m}:${s < 10 ? '0' + s : s}`;
    }

    async function renderContinueWatching() {
        if (!continueWatchingShelf || !continueWatchingGrid) return;

        try {
            const list = await getContinueWatching();
            if (!list || list.length === 0) {
                continueWatchingShelf.classList.add("hidden");
                return;
            }

            continueWatchingShelf.classList.remove("hidden");
            continueWatchingGrid.innerHTML = "";

            const fragment = document.createDocumentFragment();

            list.forEach(item => {
                const card = document.createElement("div");
                card.className = "group relative bg-zinc-800/90 hover:bg-zinc-800 border border-zinc-700/60 hover:border-zinc-600 rounded-xl overflow-hidden transition duration-200 flex flex-col shadow-md";

                const percent = item.progressPercent || Math.min(100, Math.round(((item.currentTime || 0) / (item.duration || 1)) * 100));
                const remainingSec = Math.max(0, (item.duration || 0) - (item.currentTime || 0));
                const remainingText = remainingSec > 0 ? `${formatTimeSec(remainingSec)} left` : `${percent}% watched`;

                card.innerHTML = `
                    <div class="relative aspect-video bg-zinc-900 overflow-hidden cursor-pointer">
                        <img src="${item.thumbnail}" alt="${(item.title || 'Video').replace(/"/g, '&quot;')}" loading="lazy" class="w-full h-full object-cover group-hover:scale-105 transition duration-300">
                        
                        <!-- Overlay Play Button -->
                        <div class="absolute inset-0 bg-black/30 group-hover:bg-black/50 transition-colors flex items-center justify-center">
                            <div class="w-10 h-10 rounded-full bg-red-600 text-white flex items-center justify-center opacity-90 group-hover:scale-110 group-hover:opacity-100 transition shadow-lg">
                                <i class="fas fa-play text-xs ml-0.5"></i>
                            </div>
                        </div>

                        <!-- Resume timestamp badge -->
                        <span class="absolute bottom-2 right-2 px-2 py-0.5 rounded text-[11px] font-semibold bg-black/80 text-white z-20 backdrop-blur-sm border border-white/10">
                            ${remainingText}
                        </span>

                        <!-- Dismiss / Remove Button -->
                        <button class="remove-cw-btn absolute top-2 right-2 w-7 h-7 rounded-full bg-black/70 hover:bg-red-600 text-zinc-300 hover:text-white flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition z-30 shadow" title="Remove from Continue Watching" data-video-id="${item.videoId}">
                            <i class="fas fa-times"></i>
                        </button>

                        <!-- Progress Bar across bottom of thumbnail -->
                        <div class="continue-progress-track">
                            <div class="continue-progress-fill" style="width: ${percent}%;"></div>
                        </div>
                    </div>

                    <div class="p-3 flex-1 flex flex-col justify-between cursor-pointer">
                        <div>
                            <h4 class="text-xs sm:text-sm font-semibold text-zinc-100 group-hover:text-white line-clamp-2 leading-snug">
                                ${item.title || 'Untitled Video'}
                            </h4>
                            <p class="text-[11px] text-zinc-400 mt-1 truncate">${item.channel || 'JTube'}</p>
                        </div>
                        <div class="flex items-center justify-between mt-2 pt-2 border-t border-zinc-700/40 text-[10px] text-zinc-400 font-mono">
                            <span>Resumes at ${formatTimeSec(item.currentTime)}</span>
                            <span class="text-amber-400 font-semibold">${percent}% watched</span>
                        </div>
                    </div>
                `;

                // Card click resumes video at saved timestamp
                card.addEventListener("click", (e) => {
                    if (e.target.closest(".remove-cw-btn")) return;
                    const seekParam = item.currentTime > 2 ? `&t=${item.currentTime}` : '';
                    location.href = `watch.html?id=${encodeURIComponent(item.videoId)}${seekParam}`;
                });

                // Remove button click
                const removeBtn = card.querySelector(".remove-cw-btn");
                if (removeBtn) {
                    removeBtn.addEventListener("click", async (e) => {
                        e.stopPropagation();
                        await removeContinueWatching(item.videoId);
                        card.remove();
                        const current = await getContinueWatching();
                        if (!current || current.length === 0) {
                            continueWatchingShelf.classList.add("hidden");
                        }
                        showToast("Removed from Continue Watching", "info");
                    });
                }

                fragment.appendChild(card);
            });

            continueWatchingGrid.appendChild(fragment);
        } catch (err) {
            console.warn("Failed to render continue watching:", err);
        }
    }

    if (clearContinueWatchingBtn) {
        clearContinueWatchingBtn.addEventListener("click", async () => {
            if (confirm("Clear all continue watching progress?")) {
                await clearAllContinueWatching();
                if (continueWatchingShelf) continueWatchingShelf.classList.add("hidden");
                showToast("Continue Watching cleared", "info");
            }
        });
    }

    document.addEventListener('jtube:continueWatchingUpdated', () => {
        renderContinueWatching();
    });

    // ===== WATCH TIME ENGAGEMENT STATISTICS & MODAL =====
    const watchTimeStatsBtn = document.getElementById("watch-time-stats-btn");
    const headerWatchTimeLabel = document.getElementById("header-watch-time-label");
    const watchTimeModal = document.getElementById("watch-time-modal");
    const closeWatchTimeModal = document.getElementById("close-watch-time-modal");
    const modalTodayWatchTime = document.getElementById("modal-today-watch-time");
    const modalTotalWatchTime = document.getElementById("modal-total-watch-time");
    const modalTopVideosList = document.getElementById("modal-top-videos-list");
    const resetWatchStatsBtn = document.getElementById("reset-watch-stats-btn");

    function updateHeaderWatchTime() {
        if (!headerWatchTimeLabel) return;
        const stats = getWatchStats();
        const todayText = formatWatchTime(stats.todaySeconds || 0);
        headerWatchTimeLabel.textContent = `${todayText} today`;
    }

    function openWatchTimeModal() {
        if (!watchTimeModal) return;
        const stats = getWatchStats();

        if (modalTodayWatchTime) {
            modalTodayWatchTime.textContent = formatWatchTime(stats.todaySeconds || 0);
        }
        if (modalTotalWatchTime) {
            modalTotalWatchTime.textContent = formatWatchTime(stats.totalSeconds || 0);
        }

        if (modalTopVideosList) {
            const videoEntries = Object.entries(stats.videos || {})
                .sort((a, b) => (b[1].seconds || 0) - (a[1].seconds || 0))
                .slice(0, 5);

            if (videoEntries.length === 0) {
                modalTopVideosList.innerHTML = `<p class="text-xs text-zinc-500 italic py-2">Start watching videos to record engagement history.</p>`;
            } else {
                modalTopVideosList.innerHTML = videoEntries.map(([vidId, vData]) => `
                    <div class="flex items-center justify-between p-2.5 bg-zinc-800/80 hover:bg-zinc-800 rounded-xl text-xs transition">
                        <div class="flex-1 min-w-0 pr-3">
                            <p class="text-white font-medium truncate">${vData.title || 'Video ' + vidId}</p>
                            <p class="text-[11px] text-zinc-400 mt-0.5">${vData.channel || 'JTube'}</p>
                        </div>
                        <div class="text-right flex-shrink-0 font-mono">
                            <span class="text-emerald-400 font-bold">${formatWatchTime(vData.seconds || 0)}</span>
                        </div>
                    </div>
                `).join('');
            }
        }

        watchTimeModal.classList.remove("hidden");
    }

    if (watchTimeStatsBtn) {
        watchTimeStatsBtn.addEventListener("click", openWatchTimeModal);
    }
    if (closeWatchTimeModal && watchTimeModal) {
        closeWatchTimeModal.addEventListener("click", () => watchTimeModal.classList.add("hidden"));
        watchTimeModal.addEventListener("click", (e) => {
            if (e.target === watchTimeModal) watchTimeModal.classList.add("hidden");
        });
    }
    if (resetWatchStatsBtn) {
        resetWatchStatsBtn.addEventListener("click", () => {
            if (confirm("Reset your watch time statistics?")) {
                saveWatchStats({ totalSeconds: 0, todaySeconds: 0, lastActiveDate: new Date().toDateString(), videos: {} });
                updateHeaderWatchTime();
                openWatchTimeModal();
                showToast("Watch time statistics reset", "info");
            }
        });
    }

    // Update watch stats initially
    updateHeaderWatchTime();

    // Theme Toggle Listener (Auto System detection + Dark Primary Default)
    document.querySelectorAll(".theme-toggle-btn, #theme-toggle-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            if (typeof cycleThemePreference === 'function') {
                cycleThemePreference();
            }
        });
    });

    // Quality Charter Modal Handlers
    const qualityCharterModal = document.getElementById("quality-charter-modal");
    const openQualityCharterBtns = [
        document.getElementById("open-quality-charter-btn"),
        document.getElementById("banner-quality-charter-btn")
    ];
    const closeQualityCharterBtn = document.getElementById("close-quality-charter-btn");
    const dismissQualityCharterBtn = document.getElementById("dismiss-quality-charter-btn");

    function openQualityModal() {
        if (qualityCharterModal) qualityCharterModal.classList.remove("hidden");
    }
    function closeQualityModal() {
        if (qualityCharterModal) qualityCharterModal.classList.add("hidden");
    }

    openQualityCharterBtns.forEach(btn => {
        if (btn) btn.addEventListener("click", openQualityModal);
    });
    if (closeQualityCharterBtn) closeQualityCharterBtn.addEventListener("click", closeQualityModal);
    if (dismissQualityCharterBtn) dismissQualityCharterBtn.addEventListener("click", closeQualityModal);
    if (qualityCharterModal) {
        qualityCharterModal.addEventListener("click", (e) => {
            if (e.target === qualityCharterModal) closeQualityModal();
        });
    }

    // Keyboard shortcut (Ctrl+K or '/') to focus search
    document.addEventListener("keydown", (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            if (searchInput) {
                searchInput.focus();
                searchInput.select();
            }
        } else if (e.key === '/' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
            e.preventDefault();
            if (searchInput) {
                searchInput.focus();
                searchInput.select();
            }
        } else if (e.key === 'Escape') {
            closeQualityModal();
            if (watchTimeModal) watchTimeModal.classList.add("hidden");
            if (searchDropdown) searchDropdown.classList.add('hidden');
        }
    });

    // Render videos on page load (videos will not auto-reload; reload browser to fetch fresh videos)
    renderVideos("all");
    renderCategories();
    renderSidebarChannels();
    renderShortsShelf();
    renderContinueWatching();
    preloadVideosForSearch();
    renderFooter();
});