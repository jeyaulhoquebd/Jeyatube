document.addEventListener("DOMContentLoaded", async () => {
    const videoGrid = document.getElementById("video-grid");
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
        for (let i = 0; i < 8; i++) {
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
        videoGrid.innerHTML = skeletonHtml;
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
                alert("Registration successful!");
            } else {
                await loginWithEmail(email, pass);
            }
        } catch (error) {
            alert(error.message);
        }
    });

    if (googleAuthBtn) {
        googleAuthBtn.addEventListener("click", async () => {
            try {
                await loginWithGoogle();
            } catch (error) {
                alert(error.message);
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

    // Populate Sidebar with Subscribed channels
    async function renderSidebarChannels() {
        const channels = await getChannels();
        sidebarChannels.innerHTML = "";
        
        if (!currentUser) {
            sidebarChannels.innerHTML = `<p class="text-xs text-zinc-500 px-3 py-2">Sign in to see subscriptions</p>`;
            return;
        }

        let hasSubs = false;
        Object.keys(channels).forEach(channelName => {
            const cData = channels[channelName];
            if (cData.subscribedBy && cData.subscribedBy.includes(currentUser.email)) {
                hasSubs = true;
                const avatarHtml = cData.avatarUrl 
                    ? `<img src="${cData.avatarUrl}" class="w-6 h-6 rounded-full object-cover">`
                    : `<div class="bg-zinc-700 w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs">${channelName[0]}</div>`;
                
                sidebarChannels.innerHTML += `
                    <a href="channel.html?name=${encodeURIComponent(channelName)}" class="flex items-center space-x-3 p-2 hover:bg-zinc-800 rounded-xl text-zinc-300 transition">
                        ${avatarHtml}
                        <div class="flex items-center space-x-1 min-w-0">
                            <span class="text-sm truncate">${channelName}</span>
                            <img src="img/icons.svg" class="w-3.5 h-3.5 flex-shrink-0" alt="Verified" title="Verified">
                        </div>
                    </a>
                `;
            }
        });

        if (!hasSubs) {
            sidebarChannels.innerHTML = `<p class="text-xs text-zinc-500 px-3 py-2">No subscriptions yet.</p>`;
        }
    }

    // Render Videos Grid
    async function renderVideos(filterCategory = "all") {
        let videosToRender = [];
        const channelsMap = await getChannels();
        
        if (filterCategory === "history") {
            videosToRender = await getHistory();
        } else if (filterCategory === "playlists") {
            const videos = await getVideos();
            videosToRender = videos.filter(v => v.playlist && v.playlist.trim() !== "");
        } else {
            const videos = await getVideos();
            videosToRender = filterCategory === "all" 
                ? videos.filter(v => !v.playlist)
                : videos.filter(v => v.category.toLowerCase() === filterCategory.toLowerCase() && !v.playlist);
        }

        videoGrid.innerHTML = "";

        if (videosToRender.length === 0) {
            videoGrid.innerHTML = `<p class="col-span-full text-zinc-500 text-center py-10">No videos found.</p>`;
            return;
        }

        // Feature 6: Interleave videos so not all videos of one channel are together
        if (filterCategory === "all") {
            const channelGroups = {};
            videosToRender.forEach(v => {
                if (!channelGroups[v.channel]) channelGroups[v.channel] = [];
                channelGroups[v.channel].push(v);
            });
            
            const interleaved = [];
            let added = true;
            while (added) {
                added = false;
                for (const channel in channelGroups) {
                    const chunk = channelGroups[channel].splice(0, 2); // Take 2 videos from this channel
                    if (chunk.length > 0) {
                        interleaved.push(...chunk);
                        added = true;
                    }
                }
            }
            videosToRender = interleaved;
        }

        // Shuffle the videos to show a random order on each reload, while keeping the same number of videos
        for (let i = videosToRender.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [videosToRender[i], videosToRender[j]] = [videosToRender[j], videosToRender[i]];
        }

        // Build all cards as a document fragment for maximum DOM performance
        const fragment = document.createDocumentFragment();

        videosToRender.forEach(video => {
            let qualityBadgeHtml = "";
            if (video.contentQuality) {
                const isGood = video.contentQuality === "Good Video";
                const badgeColor = isGood ? "bg-green-500/20 text-green-400 border-green-500/30" : "bg-red-500/20 text-red-400 border-red-500/30";
                const badgeIcon = isGood ? "fa-circle-check" : "fa-triangle-exclamation";
                qualityBadgeHtml = `
                    <span class="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 font-bold rounded border ${badgeColor} mb-1">
                        <i class="fas ${badgeIcon} text-[8px]"></i> ${video.contentQuality}
                    </span>
                `;
            }

            let avatarHtml = `<div class="flex-shrink-0 bg-zinc-700 w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm mt-0.5">${video.channel[0]}</div>`;
            if (channelsMap[video.channel] && channelsMap[video.channel].avatarUrl) {
                avatarHtml = `<img src="${channelsMap[video.channel].avatarUrl}" class="flex-shrink-0 w-9 h-9 rounded-full object-cover mt-0.5" alt="${video.channel}" loading="lazy">`;
            }

            const ytId = getYoutubeId(video.videoUrl);
            const card = document.createElement('div');
            card.className = "cursor-pointer group relative video-card-custom bg-zinc-800 rounded-xl pb-3 h-full flex flex-col";
            card.onclick = () => location.href = `watch.html?id=${video.id}`;
            card.innerHTML = `
                <div class="relative aspect-video bg-zinc-800 rounded-xl overflow-hidden mb-3">
                    <img src="${video.thumbnail}" alt="${video.title}" loading="lazy" decoding="async" class="w-full h-full object-cover group-hover:scale-105 transition duration-200">
                    <div class="video-preview-container absolute inset-0 w-full h-full bg-black z-20 pointer-events-none hidden"></div>
                    <div class="play-icon-overlay absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition-all duration-200 z-10">
                        <div class="w-12 h-12 bg-red-600/90 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-200 scale-75 group-hover:scale-100 shadow-lg">
                            <i class="fas fa-play text-white text-sm ml-0.5"></i>
                        </div>
                    </div>
                    <span class="absolute bottom-2 right-2 bg-black/80 px-2 py-0.5 rounded text-xs font-semibold z-30">${video.duration}</span>
                </div>
                <div class="flex space-x-3 px-3 flex-1">
                    ${avatarHtml}
                    <div class="flex-1 min-w-0">
                        ${qualityBadgeHtml}
                        <h3 class="font-semibold text-sm line-clamp-2 leading-snug text-zinc-100 group-hover:text-white">${video.title}</h3>
                        <div class="flex items-center space-x-1 mt-1 text-zinc-400 hover:text-zinc-200 cursor-pointer w-fit" onclick="event.stopPropagation(); location.href='channel.html?name=${encodeURIComponent(video.channel)}'">
                            <p class="text-xs truncate">${video.channel}</p>
                            <img src="img/icons.svg" class="w-3 h-3 flex-shrink-0" alt="Verified" title="Verified">
                        </div>
                        <p class="text-xs text-zinc-400 mt-0.5">${(video.views || 0).toLocaleString()} views • ${timeAgo(video.timestamp)}</p>
                    </div>
                </div>
            `;
            
            // Hover to play and prefetch for instant loading
            let hoverTimeout;
            card.addEventListener('mouseenter', () => {
                hoverTimeout = setTimeout(() => {
                    if (ytId) {
                        const previewContainer = card.querySelector('.video-preview-container');
                        if (previewContainer.innerHTML === '') {
                            previewContainer.innerHTML = `<iframe class='w-full h-full pointer-events-none' src='https://www.youtube.com/embed/${ytId}?autoplay=1&mute=1&controls=0&modestbranding=1&showinfo=0' frameborder='0' allow='autoplay; encrypted-media' allowfullscreen></iframe>`;
                        }
                        previewContainer.classList.remove('hidden');
                        card.querySelector('.play-icon-overlay').classList.add('hidden');
                    }
                    // Prefetch watch page
                    if (!document.querySelector(`link[href="watch.html?id=${video.id}"]`)) {
                        const link = document.createElement('link');
                        link.rel = 'prefetch';
                        link.href = `watch.html?id=${video.id}`;
                        document.head.appendChild(link);
                    }
                }, 400); // 400ms delay to prevent lag while scrolling
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
            
            fragment.appendChild(card);
        });

        videoGrid.appendChild(fragment);
    }

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
        const categories = await getCategories();
        categoryBar.innerHTML = `<button class="category-btn whitespace-nowrap bg-white text-black px-4 py-1.5 rounded-lg text-sm font-medium transition" data-category="all">All</button>`;
        categories.forEach(cat => {
            categoryBar.innerHTML += `<button class="category-btn whitespace-nowrap bg-zinc-800 hover:bg-zinc-700 px-4 py-1.5 rounded-lg text-sm font-medium transition" data-category="${cat.name}">${cat.name}</button>`;
        });
        categoryBar.innerHTML += `<button class="category-btn whitespace-nowrap bg-zinc-800 hover:bg-zinc-700 px-4 py-1.5 rounded-lg text-sm font-medium transition" data-category="playlists">Playlists</button>`;

        const newCategoryBtns = document.querySelectorAll(".category-btn");
        newCategoryBtns.forEach(btn => {
            btn.addEventListener("click", async (e) => {
                clearSearch();
                showingHistory = false;
                pageTitle.classList.add("hidden");
                categoryBar.classList.remove("hidden");
                
                newCategoryBtns.forEach(b => b.classList.replace("bg-white", "bg-zinc-800"));
                newCategoryBtns.forEach(b => b.classList.replace("text-black", "text-white"));
                
                e.target.classList.replace("bg-zinc-800", "bg-white");
                e.target.classList.replace("text-white", "text-black");

                const cat = e.target.dataset.category;
                await renderVideos(cat);
            });
        });
    }

    // ===== POWERFUL SEARCH LOGIC =====
    function buildVideoCard(video, channelsMap) {
        const ytId = getYoutubeId(video.videoUrl);
        const channelData = channelsMap ? channelsMap[video.channel] : null;
        const avatarHtml = channelData && channelData.avatarUrl
            ? `<img src="${channelData.avatarUrl}" class="flex-shrink-0 w-9 h-9 rounded-full object-cover mt-0.5" alt="${video.channel}" loading="lazy">`
            : `<div class="flex-shrink-0 bg-zinc-700 w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm mt-0.5">${video.channel[0]}</div>`;
        
        const card = document.createElement('div');
        card.className = "cursor-pointer group relative video-card-custom bg-zinc-800 rounded-xl pb-3 h-full flex flex-col";
        card.onclick = () => location.href = `watch.html?id=${video.id}`;
        card.innerHTML = `
            <div class="relative aspect-video bg-zinc-800 rounded-xl overflow-hidden mb-3">
                <img src="${video.thumbnail}" alt="${video.title}" loading="lazy" decoding="async" class="w-full h-full object-cover group-hover:scale-105 transition duration-200">
                <div class="play-icon-overlay absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition-all duration-200 z-10">
                    <div class="w-12 h-12 bg-red-600/90 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-200 scale-75 group-hover:scale-100 shadow-lg">
                        <i class="fas fa-play text-white text-sm ml-0.5"></i>
                    </div>
                </div>
                <span class="absolute bottom-2 right-2 bg-black/80 px-2 py-0.5 rounded text-xs font-semibold z-30">${video.duration}</span>
            </div>
            <div class="flex space-x-3 px-3 flex-1">
                ${avatarHtml}
                <div class="flex-1 min-w-0">
                    <h3 class="font-semibold text-sm line-clamp-2 leading-snug text-zinc-100 group-hover:text-white">${video.title}</h3>
                    <div class="flex items-center space-x-1 mt-1 text-zinc-400 hover:text-zinc-200 cursor-pointer w-fit" onclick="event.stopPropagation(); location.href='channel.html?name=${encodeURIComponent(video.channel)}'">
                        <p class="text-xs truncate">${video.channel}</p>
                        <img src="img/icons.svg" class="w-3 h-3 flex-shrink-0" alt="Verified" title="Verified">
                    </div>
                    <p class="text-xs text-zinc-400 mt-0.5">${(video.views || 0).toLocaleString()} views • ${timeAgo(video.timestamp)}</p>
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

    // Handle home button click
    const homeBtn = document.querySelector('a[href="#"] span').parentElement; // First nav link
    if(homeBtn && homeBtn.innerText.includes("Home")){
        homeBtn.addEventListener("click", async (e) => {
            e.preventDefault();
            clearSearch();
            showingHistory = false;
            pageTitle.classList.add("hidden");
            categoryBar.classList.remove("hidden");
            await renderVideos("all");
        });
    }

    // Pre-load all videos into cache for instant search
    async function preloadVideosForSearch() {
        allVideosCache = await getVideos();
    }

    await renderCategories();
    await renderSidebarChannels();
    await renderVideos();
    preloadVideosForSearch(); // non-blocking preload for instant search
});