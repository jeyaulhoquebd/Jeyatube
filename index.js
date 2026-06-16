document.addEventListener("DOMContentLoaded", async () => {
    const videoGrid = document.getElementById("video-grid");
    const sidebar = document.getElementById("sidebar");
    const menuBtn = document.getElementById("menu-btn");
    const categoryBtns = document.querySelectorAll(".category-btn");
    const sidebarChannels = document.getElementById("sidebar-channels");
    const historyBtn = document.getElementById("history-btn");
    const pageTitle = document.getElementById("page-title");
    const categoryBar = document.getElementById("category-bar");

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
                sidebarChannels.innerHTML += `
                    <a href="channel.html?name=${encodeURIComponent(channelName)}" class="flex items-center space-x-3 p-2 hover:bg-zinc-800 rounded-xl text-zinc-300 transition">
                        <div class="bg-zinc-700 w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs">${channelName[0]}</div>
                        <span class="text-sm truncate">${channelName}</span>
                    </a>
                `;
            }
        });
    }

    // Render Videos Grid
    async function renderVideos(filterCategory = "all") {
        let videosToRender = [];
        
        if (filterCategory === "history") {
            videosToRender = await getHistory();
        } else {
            const videos = await getVideos();
            videosToRender = filterCategory === "all" 
                ? videos 
                : videos.filter(v => v.category.toLowerCase() === filterCategory.toLowerCase());
        }

        videoGrid.innerHTML = "";

        if (videosToRender.length === 0) {
            videoGrid.innerHTML = `<p class="col-span-full text-zinc-500 text-center py-10">No videos found.</p>`;
            return;
        }

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

            const ytId = getYoutubeId(video.videoUrl);
            const previewHtml = ytId ? `<iframe class='w-full h-full' src='https://www.youtube.com/embed/${ytId}?autoplay=1&mute=1&controls=0&modestbranding=1&showinfo=0' frameborder='0' allow='autoplay; encrypted-media' allowfullscreen></iframe>` : "";

            videoGrid.innerHTML += `
                <div class="cursor-pointer group relative" onclick="location.href='watch.html?id=${video.id}'"
                     onmouseenter="this.querySelector('.video-preview').innerHTML = \`${previewHtml}\`"
                     onmouseleave="this.querySelector('.video-preview').innerHTML = ''">
                    <div class="relative aspect-video bg-zinc-800 rounded-xl overflow-hidden mb-3">
                        <img src="${video.thumbnail}" alt="${video.title}" class="w-full h-full object-cover group-hover:scale-105 transition duration-200">
                        <div class="video-preview absolute inset-0 w-full h-full bg-black z-10 pointer-events-none empty:hidden"></div>
                        <span class="absolute bottom-2 right-2 bg-black/80 px-2 py-0.5 rounded text-xs font-semibold z-20">${video.duration}</span>
                    </div>
                    <div class="flex space-x-3">
                        <div class="flex-shrink-0 bg-zinc-700 w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm mt-0.5">
                            ${video.channel[0]}
                        </div>
                        <div class="flex-1 min-w-0">
                            ${qualityBadgeHtml}
                            <h3 class="font-semibold text-sm line-clamp-2 leading-snug text-zinc-100 group-hover:text-white">${video.title}</h3>
                            <p class="text-xs text-zinc-400 mt-1 hover:text-zinc-200 truncate cursor-pointer" onclick="event.stopPropagation(); location.href='channel.html?name=${encodeURIComponent(video.channel)}'">${video.channel}</p>
                            <p class="text-xs text-zinc-400 mt-0.5">${video.views} views • ${video.time}</p>
                        </div>
                    </div>
                </div>
            `;
        });
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

    categoryBtns.forEach(btn => {
        btn.addEventListener("click", async (e) => {
            showingHistory = false;
            pageTitle.classList.add("hidden");
            categoryBar.classList.remove("hidden");
            
            categoryBtns.forEach(b => b.classList.replace("bg-white", "bg-zinc-800"));
            categoryBtns.forEach(b => b.classList.replace("text-black", "text-white"));
            
            e.target.classList.replace("bg-zinc-800", "bg-white");
            e.target.classList.replace("text-white", "text-black");

            await renderVideos(e.target.dataset.category);
        });
    });

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

    await renderSidebarChannels();
    await renderVideos();
});