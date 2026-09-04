document.addEventListener("DOMContentLoaded", async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const channelNameParam = urlParams.get('name');

    if (!channelNameParam) {
        document.body.innerHTML = `<div class="text-center py-20"><h1 class="text-2xl">Channel not found.</h1><a href="index.html" class="text-blue-500 mt-4 block">Return Home</a></div>`;
        return;
    }

    // Set dynamic page title
    document.title = `${channelNameParam} - JTube`;

    const channelContent = document.getElementById("channel-content");
    const channelLoading = document.getElementById("channel-loading");
    const channelCover = document.getElementById("channel-cover");
    const channelAvatar = document.getElementById("channel-avatar");
    const channelNameTitle = document.getElementById("channel-name-title");
    const channelSubs = document.getElementById("channel-subs");
    const channelVideoCount = document.getElementById("channel-video-count");
    const subscribeBtn = document.getElementById("subscribe-btn");
    const channelVideos = document.getElementById("channel-videos");
    const channelPlaylists = document.getElementById("channel-playlists");
    
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

    closeAuthBtn.addEventListener("click", () => authModal.classList.add("hidden"));
    
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
        try {
            if (isRegistering) {
                await registerWithEmail(authEmail.value, authPassword.value, authName.value);
            } else {
                await loginWithEmail(authEmail.value, authPassword.value);
            }
            authModal.classList.add("hidden");
        } catch (error) {
            showToast(error.message, "error");
        }
    });

    if(googleAuthBtn) {
        googleAuthBtn.addEventListener("click", async () => {
            try {
                await loginWithGoogle();
                authModal.classList.add("hidden");
            } catch (error) {
                showToast(error.message, "error");
            }
        });
    }

    // ===== TAB NAVIGATION =====
    document.querySelectorAll('.channel-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.channel-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            tab.classList.add('active');
            const target = document.getElementById('tab-' + tab.dataset.tab);
            if (target) target.classList.add('active');
        });
    });

    // ===== LOAD CHANNEL DATA =====
    let currentChannelData = await getChannel(channelNameParam);
    if (!currentChannelData) {
        currentChannelData = { subscribers: 0, subscribed: false };
    }

    // UI Updates
    channelLoading.classList.add("hidden");
    channelContent.classList.remove("hidden");
    
    channelNameTitle.textContent = channelNameParam;
    channelSubs.textContent = `${formatCompactNumber(currentChannelData.subscribers)} subscribers`;
    
    if (currentChannelData.coverUrl) {
        channelCover.innerHTML = `<img src="${currentChannelData.coverUrl}" class="w-full h-full object-cover" loading="lazy" alt="Channel cover">`;
    }
    if (currentChannelData.avatarUrl) {
        channelAvatar.innerHTML = `<img src="${currentChannelData.avatarUrl}" class="w-full h-full object-cover" loading="lazy" alt="${channelNameParam}">`;
    } else {
        channelAvatar.innerHTML = `<div class="w-full h-full flex items-center justify-center bg-purple-600 text-3xl font-bold">${channelNameParam[0]}</div>`;
    }
    
    // About tab content
    document.getElementById("channel-bio").innerHTML = parseLinks(currentChannelData.bio || "");
    
    const channelLinks = document.getElementById("channel-links");
    channelLinks.innerHTML = "";
    if (currentChannelData.links) {
        const linksArray = currentChannelData.links.split(",");
        linksArray.forEach(linkStr => {
            const parts = linkStr.split("|");
            if (parts.length === 2) {
                channelLinks.innerHTML += `<a href="${parts[1].trim()}" target="_blank" class="bg-zinc-800 text-blue-400 hover:text-blue-300 font-semibold text-xs px-3 py-1.5 rounded-full inline-flex items-center space-x-1.5 border border-zinc-700 transition">
                    <i class="fas fa-link"></i> <span>${parts[0].trim()}</span>
                </a>`;
            }
        });
    }

    // ===== SUBSCRIBE LOGIC =====
    function updateSubscribeUI() {
        const userIdent = typeof getSiteUserIdentifier === 'function' ? getSiteUserIdentifier() : (currentUser ? currentUser.email : null);
        const isSubscribed = currentChannelData.subscribedBy && userIdent && currentChannelData.subscribedBy.includes(userIdent);
        
        if (isSubscribed) {
            subscribeBtn.textContent = "Subscribed";
            subscribeBtn.className = "mt-4 sm:mt-0 sm:mb-2 bg-zinc-800 text-zinc-400 px-6 py-2 rounded-full font-semibold transition text-sm flex-shrink-0";
        } else {
            subscribeBtn.textContent = "Subscribe";
            subscribeBtn.className = "mt-4 sm:mt-0 sm:mb-2 bg-white text-black px-6 py-2 rounded-full font-semibold transition text-sm hover:bg-zinc-200 flex-shrink-0";
        }
        
        const subCount = typeof getEffectiveSubscribers === 'function' ? getEffectiveSubscribers(currentChannelData) : (currentChannelData.subscribers || 0);
        channelSubs.textContent = `${formatCompactNumber(subCount)} subscribers`;
    }
    updateSubscribeUI();

    document.addEventListener('authStateChanged', () => {
        updateSubscribeUI();
    });

    subscribeBtn.addEventListener("click", async () => {
        const updatedChannel = await toggleSubscription(channelNameParam);
        if (updatedChannel) {
            currentChannelData = updatedChannel;
            updateSubscribeUI();
        }
    });

    // ===== VIDEOS TAB =====
    const videos = await getVideosByChannel(channelNameParam);
    channelVideoCount.textContent = `${videos.length} video${videos.length !== 1 ? 's' : ''}`;

    if (videos.length === 0) {
        channelVideos.innerHTML = `<p class="col-span-full text-zinc-500 py-4">No videos found for this channel.</p>`;
    } else {
        channelVideos.innerHTML = "";
        const fragment = document.createDocumentFragment();
        videos.forEach(video => {
            const ytId = getYoutubeId(video.videoUrl);
            const isShort = isShortVideo(video);
            const effectiveLikes = typeof getEffectiveLikes === 'function' ? getEffectiveLikes(video) : (video.likes || 0);
            const subCount = typeof getEffectiveSubscribers === 'function' ? getEffectiveSubscribers(currentChannelData) : (currentChannelData.subscribers || 0);

            const card = document.createElement('div');
            card.className = "cursor-pointer group relative video-card-custom bg-zinc-800 rounded-xl pb-3 h-full flex flex-col";
            card.onclick = () => location.href = isShort ? `shorts.html?id=${video.id}` : `watch.html?id=${video.id}`;

            const durationBadge = isShort
                ? `<span class="absolute bottom-2 right-2 px-2 py-0.5 rounded text-xs font-bold z-30 bg-red-600 text-white flex items-center gap-1 shadow"><i class="fas fa-bolt text-[9px]"></i> Shorts • ${video.duration}</span>`
                : `<span class="absolute bottom-2 right-2 px-2 py-0.5 rounded text-xs font-semibold z-30 ${getDurationBadgeClass(video.duration)}">${video.duration}</span>`;

            card.innerHTML = `
                <div class="relative aspect-video bg-zinc-800 rounded-xl overflow-hidden mb-2">
                    <img src="${video.thumbnail}" alt="${video.title.replace(/"/g, '&quot;')}" class="w-full h-full object-cover group-hover:scale-105 transition duration-200" loading="lazy" decoding="async">
                    <div class="video-preview-container absolute inset-0 w-full h-full bg-black z-20 pointer-events-none hidden"></div>
                    <div class="play-icon-overlay absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition-all duration-200 z-10">
                        <div class="w-12 h-12 ${isShort ? 'bg-red-600' : 'bg-red-600/90'} rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-200 scale-75 group-hover:scale-100 shadow-lg">
                            <i class="fas ${isShort ? 'fa-bolt text-sm' : 'fa-play text-sm ml-0.5'} text-white"></i>
                        </div>
                    </div>
                    ${durationBadge}
                </div>
                <div class="px-3 flex-1 flex flex-col justify-between">
                    <h3 class="font-semibold text-sm line-clamp-2 leading-snug text-zinc-100 group-hover:text-white">${video.title}</h3>
                    <div class="flex items-center flex-wrap gap-x-2 gap-y-0.5 text-xs text-zinc-400 mt-1.5">
                        <span>${formatCompactNumber(video.views || 0)} views</span>
                        <span>•</span>
                        <span class="inline-flex items-center gap-1 text-zinc-300 font-medium"><i class="far fa-thumbs-up text-[10px] text-red-400"></i> ${formatCompactNumber(effectiveLikes)}</span>
                        <span>•</span>
                        <span>${timeAgo(video.timestamp)}</span>
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
            
            fragment.appendChild(card);
        });
        channelVideos.appendChild(fragment);
    }

    // ===== PLAYLISTS TAB (YouTube-style) =====
    // Group videos by playlist name for this channel
    const playlistsMap = {};
    videos.forEach(video => {
        if (video.playlist && video.playlist.trim() !== "") {
            const plName = video.playlist.trim();
            if (!playlistsMap[plName]) {
                playlistsMap[plName] = [];
            }
            playlistsMap[plName].push(video);
        }
    });

    const playlistNames = Object.keys(playlistsMap);

    if (playlistNames.length === 0) {
        channelPlaylists.innerHTML = `<p class="col-span-full text-zinc-500 py-4">This channel has no playlists yet.</p>`;
    } else {
        channelPlaylists.innerHTML = "";
        // Store playlists on window for onclick access
        window._channelPlaylists = playlistsMap;

        playlistNames.forEach(plName => {
            const plVideos = playlistsMap[plName];
            const firstVideo = plVideos[0];
            const count = plVideos.length;

            channelPlaylists.innerHTML += `
                <div class="playlist-card group" onclick="openChannelPlaylist('${plName.replace(/'/g, "\\'")}')">
                    <div class="playlist-stack mb-4 mt-3 mx-2">
                        <div class="playlist-thumb relative">
                            <img src="${firstVideo.thumbnail}" alt="${plName}" class="w-full h-full object-cover" loading="lazy">
                            <div class="playlist-count-badge">
                                <i class="fas fa-list text-base text-white"></i>
                                <span class="text-xs font-bold text-white">${count} video${count !== 1 ? 's' : ''}</span>
                            </div>
                            <div class="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition flex items-center justify-center">
                                <i class="fas fa-play text-2xl text-white opacity-0 group-hover:opacity-100 transition drop-shadow-lg"></i>
                            </div>
                        </div>
                    </div>
                    <div class="px-3 pb-3">
                        <h3 class="font-bold text-sm line-clamp-2 text-zinc-100 group-hover:text-white leading-snug">${plName}</h3>
                        <p class="text-xs text-zinc-500 mt-1">Playlist • ${count} video${count !== 1 ? 's' : ''}</p>
                        <p class="text-xs text-blue-400 mt-1.5 group-hover:text-blue-300 transition font-medium">
                            <i class="fas fa-play-circle mr-1"></i>View full playlist
                        </p>
                    </div>
                </div>
            `;
        });
    }

    // ===== PLAYLIST MODAL (opens all videos in that playlist) =====
    window.openChannelPlaylist = function(plName) {
        const plVideos = window._channelPlaylists[plName];
        if (!plVideos || plVideos.length === 0) return;

        // Navigate to the first video with playlist context
        // But first show an inline expanded view
        const modal = document.createElement('div');
        modal.id = 'playlist-modal-overlay';
        modal.className = 'fixed inset-0 z-[100] bg-zinc-950/95 backdrop-blur-sm flex flex-col';
        modal.innerHTML = `
            <div class="max-w-4xl mx-auto w-full flex-1 flex flex-col overflow-hidden">
                <div class="px-6 py-5 border-b border-zinc-800 flex justify-between items-center flex-shrink-0">
                    <div>
                        <div class="flex items-center space-x-2">
                            <h2 class="text-xl font-black text-white">${plName}</h2>
                        </div>
                        <div class="flex items-center space-x-1 mt-0.5">
                            <p class="text-xs text-zinc-400">${channelNameParam}</p>
                            <img src="img/icons.svg" class="w-3 h-3 flex-shrink-0" alt="Verified" title="Verified">
                            <p class="text-xs text-zinc-400">• ${plVideos.length} video${plVideos.length !== 1 ? 's' : ''}</p>
                        </div>
                    </div>
                    <button onclick="document.getElementById('playlist-modal-overlay').remove()" class="text-zinc-400 hover:text-white transition p-2">
                        <i class="fas fa-times text-xl"></i>
                    </button>
                </div>
                <div class="flex-1 overflow-y-auto p-4 space-y-2">
                    ${plVideos.map((v, idx) => `
                        <div class="flex gap-4 p-3 hover:bg-zinc-800/70 rounded-xl cursor-pointer transition group" onclick="location.href='watch.html?id=${v.id}'">
                            <div class="text-zinc-600 font-bold self-center w-7 text-center text-sm flex-shrink-0">${idx + 1}</div>
                            <div class="w-36 aspect-video bg-zinc-800 rounded-lg overflow-hidden flex-shrink-0 relative">
                                <img src="${v.thumbnail}" class="w-full h-full object-cover group-hover:scale-105 transition" loading="lazy">
                                <span class="absolute bottom-1 right-1 bg-black/80 px-1.5 py-0.5 rounded text-[10px] font-semibold">${v.duration || ''}</span>
                            </div>
                            <div class="flex-1 min-w-0">
                                <h4 class="font-semibold text-sm text-zinc-100 line-clamp-2 group-hover:text-white">${v.title}</h4>
                                <p class="text-xs text-zinc-500 mt-1">${formatCompactNumber(v.views)} views • ${timeAgo(v.timestamp)}</p>
                            </div>
                        </div>
                    `).join('')}
                </div>
                <div class="px-6 py-3 border-t border-zinc-800 flex-shrink-0">
                    <a href="watch.html?id=${plVideos[0].id}" class="inline-flex items-center space-x-2 bg-white text-black px-5 py-2 rounded-full font-bold text-sm hover:bg-zinc-200 transition">
                        <i class="fas fa-play"></i>
                        <span>Play all</span>
                    </a>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    };
});
