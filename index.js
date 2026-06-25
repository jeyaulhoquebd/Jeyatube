document.addEventListener("DOMContentLoaded", async () => {
    const videoGrid = document.getElementById("video-grid");
    const sidebar = document.getElementById("sidebar");
    const menuBtn = document.getElementById("menu-btn");
    const categoryBtns = document.querySelectorAll(".category-btn");
    const sidebarChannels = document.getElementById("sidebar-channels");
    const historyBtn = document.getElementById("history-btn");
    const pageTitle = document.getElementById("page-title");
    const categoryBar = document.getElementById("category-bar");

    // Show skeleton loading cards immediately for fast perceived load
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
        if (e.detail) {
            authModal.classList.add("hidden");
            if (showingHistory) {
                await renderVideos("history");
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
    menuBtn.addEventListener("click", () => {
        sidebar.classList.toggle("-translate-x-full");
    });

    // Populate Sidebar with Subscribed channels
    async function renderSidebarChannels() {
        const channels = await getChannels();
        sidebarChannels.innerHTML = "";
        Object.keys(channels).forEach(channelName => {
            if (channels[channelName].subscribed) {
                const cData = channels[channelName];
                const avatarHtml = cData.avatarUrl 
                    ? `<img src="${cData.avatarUrl}" class="w-6 h-6 rounded-full object-cover">`
                    : `<div class="bg-zinc-700 w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs">${channelName[0]}</div>`;
                
                sidebarChannels.innerHTML += `
                    <a href="channel.html?name=${encodeURIComponent(channelName)}" class="flex items-center space-x-3 p-2 hover:bg-zinc-800 rounded-xl text-zinc-300 transition">
                        ${avatarHtml}
                        <span class="text-sm truncate">${channelName}</span>
                    </a>
                `;
            }
        });
    }

    // Render Videos Grid
    async function renderVideos(filterCategory = "all") {
        let videosToRender = [];
        const channelsMap = await getChannels();
        
        if (filterCategory === "history") {
            videosToRender = await getHistory();
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

            const card = document.createElement('div');
            card.className = "cursor-pointer group relative video-card-custom bg-zinc-800 rounded-xl pb-3 h-full flex flex-col";
            card.onclick = () => location.href = `watch.html?id=${video.id}`;
            card.innerHTML = `
                <div class="relative aspect-video bg-zinc-800 rounded-xl overflow-hidden mb-3">
                    <img src="${video.thumbnail}" alt="${video.title}" loading="lazy" decoding="async" class="w-full h-full object-cover group-hover:scale-105 transition duration-200">
                    <div class="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition-all duration-200 z-10">
                        <div class="w-12 h-12 bg-red-600/90 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-200 scale-75 group-hover:scale-100 shadow-lg">
                            <i class="fas fa-play text-white text-sm ml-0.5"></i>
                        </div>
                    </div>
                    <span class="absolute bottom-2 right-2 bg-black/80 px-2 py-0.5 rounded text-xs font-semibold z-20">${video.duration}</span>
                </div>
                <div class="flex space-x-3 px-3 flex-1">
                    ${avatarHtml}
                    <div class="flex-1 min-w-0">
                        ${qualityBadgeHtml}
                        <h3 class="font-semibold text-sm line-clamp-2 leading-snug text-zinc-100 group-hover:text-white">${video.title}</h3>
                        <p class="text-xs text-zinc-400 mt-1 hover:text-zinc-200 truncate cursor-pointer" onclick="event.stopPropagation(); location.href='channel.html?name=${encodeURIComponent(video.channel)}'">${video.channel}</p>
                        <p class="text-xs text-zinc-400 mt-0.5">${(video.views || 0).toLocaleString()} views • ${video.time}</p>
                    </div>
                </div>
            `;
            fragment.appendChild(card);
        });

        videoGrid.appendChild(fragment);
    }

    historyBtn.addEventListener("click", async (e) => {
        e.preventDefault();
        if (!currentUser) {
            showingHistory = true;
            openAuthModal();
            return;
        }
        showingHistory = true;
        pageTitle.classList.remove("hidden");
        categoryBar.classList.add("hidden");
        await renderVideos("history");
    });

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
                showingHistory = false;
                pageTitle.classList.add("hidden");
                categoryBar.classList.remove("hidden");
                
                newCategoryBtns.forEach(b => b.classList.replace("bg-white", "bg-zinc-800"));
                newCategoryBtns.forEach(b => b.classList.replace("text-black", "text-white"));
                
                e.target.classList.replace("bg-zinc-800", "bg-white");
                e.target.classList.replace("text-white", "text-black");

                const cat = e.target.dataset.category;
                if (cat === "playlists") {
                    window.location.href = "playlists.html";
                } else {
                    await renderVideos(cat);
                }
            });
        });
    }

    // Handle home button click
    const homeBtn = document.querySelector('a[href="#"] span').parentElement; // First nav link
    if(homeBtn && homeBtn.innerText.includes("Home")){
        homeBtn.addEventListener("click", async (e) => {
            e.preventDefault();
            showingHistory = false;
            pageTitle.classList.add("hidden");
            categoryBar.classList.remove("hidden");
            await renderVideos("all");
        });
    }

    await renderCategories();
    await renderSidebarChannels();
    await renderVideos();
});