document.addEventListener("DOMContentLoaded", async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const channelNameParam = urlParams.get('name');

    if (!channelNameParam) {
        document.body.innerHTML = `<div class="text-center py-20"><h1 class="text-2xl">Channel not found.</h1><a href="index.html" class="text-blue-500 mt-4 block">Return Home</a></div>`;
        return;
    }

    const channelContent = document.getElementById("channel-content");
    const channelLoading = document.getElementById("channel-loading");
    const channelCover = document.getElementById("channel-cover");
    const channelAvatar = document.getElementById("channel-avatar");
    const channelNameTitle = document.getElementById("channel-name-title");
    const channelSubs = document.getElementById("channel-subs");
    const subscribeBtn = document.getElementById("subscribe-btn");
    const channelVideos = document.getElementById("channel-videos");
    
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
            alert(error.message);
        }
    });

    if(googleAuthBtn) {
        googleAuthBtn.addEventListener("click", async () => {
            try {
                await loginWithGoogle();
                authModal.classList.add("hidden");
            } catch (error) {
                alert(error.message);
            }
        });
    }

    let currentChannelData = await getChannel(channelNameParam);
    if (!currentChannelData) {
        currentChannelData = { subscribers: 0, subscribed: false };
    }

    // UI Updates
    channelLoading.classList.add("hidden");
    channelContent.classList.remove("hidden");
    
    channelNameTitle.textContent = channelNameParam;
    channelSubs.textContent = `${currentChannelData.subscribers || 0} subscribers`;
    
    if (currentChannelData.coverUrl) {
        channelCover.innerHTML = `<img src="${currentChannelData.coverUrl}" class="w-full h-full object-cover">`;
    }
    if (currentChannelData.avatarUrl) {
        channelAvatar.innerHTML = `<img src="${currentChannelData.avatarUrl}" class="w-full h-full object-cover">`;
    } else {
        channelAvatar.innerHTML = `<div class="w-full h-full flex items-center justify-center bg-purple-600 text-3xl font-bold">${channelNameParam[0]}</div>`;
    }
    
    document.getElementById("channel-bio").innerHTML = parseLinks(currentChannelData.bio || "");
    
    const channelLinks = document.getElementById("channel-links");
    channelLinks.innerHTML = "";
    if (currentChannelData.links) {
        const linksArray = currentChannelData.links.split(",");
        linksArray.forEach(linkStr => {
            const parts = linkStr.split("|");
            if (parts.length === 2) {
                channelLinks.innerHTML += `<a href="${parts[1].trim()}" target="_blank" class="bg-zinc-800 text-blue-400 hover:text-blue-300 font-semibold text-xs px-3 py-1.5 rounded-full inline-flex items-center space-x-1 border border-zinc-700 transition">
                    <i class="fas fa-link"></i> <span>${parts[0].trim()}</span>
                </a>`;
            }
        });
    }

    function updateSubscribeUI() {
        const isSubscribed = currentChannelData.subscribedBy && currentUser && currentChannelData.subscribedBy.includes(currentUser.email);
        
        if (isSubscribed) {
            subscribeBtn.textContent = "Subscribed";
            subscribeBtn.className = "mt-4 md:mt-0 mb-2 bg-zinc-800 text-zinc-400 px-6 py-2 rounded-full font-semibold transition text-sm";
        } else {
            subscribeBtn.textContent = "Subscribe";
            subscribeBtn.className = "mt-4 md:mt-0 mb-2 bg-white text-black px-6 py-2 rounded-full font-semibold transition text-sm hover:bg-zinc-200";
        }
        
        const subCount = currentChannelData.subscribedBy ? currentChannelData.subscribedBy.length : (currentChannelData.subscribers || 0);
        channelSubs.textContent = `${subCount.toLocaleString()} subscribers`;
    }
    updateSubscribeUI();

    document.addEventListener('authStateChanged', (e) => {
        updateSubscribeUI();
    });

    subscribeBtn.addEventListener("click", async () => {
        if (!currentUser) return authModal.classList.remove("hidden");
        
        if (!currentChannelData.subscribedBy) currentChannelData.subscribedBy = [];
        
        const index = currentChannelData.subscribedBy.indexOf(currentUser.email);
        if (index > -1) {
            currentChannelData.subscribedBy.splice(index, 1);
        } else {
            currentChannelData.subscribedBy.push(currentUser.email);
        }
        await saveChannel(channelNameParam, currentChannelData);
        updateSubscribeUI();
    });

    const videos = await getVideosByChannel(channelNameParam);
    if (videos.length === 0) {
        channelVideos.innerHTML = `<p class="col-span-full text-zinc-500 py-4">No videos found for this channel.</p>`;
    } else {
        videos.forEach(video => {
            const ytId = getYoutubeId(video.videoUrl);
            const previewHtml = ytId ? `<iframe class='w-full h-full pointer-events-none' src='https://www.youtube.com/embed/${ytId}?autoplay=1&mute=0&controls=0&modestbranding=1&showinfo=0' frameborder='0' allow='autoplay; encrypted-media' allowfullscreen></iframe>` : "";
            
            channelVideos.innerHTML += `
                <div class="cursor-pointer group relative video-card-custom bg-zinc-800 rounded-xl pb-3 h-full flex flex-col" onclick="location.href='watch.html?id=${video.id}'"
                     onmouseenter="this.querySelector('.video-preview').innerHTML = \`${previewHtml}\`"
                     onmouseleave="this.querySelector('.video-preview').innerHTML = ''">
                    <div class="relative aspect-video bg-zinc-800 rounded-xl overflow-hidden mb-2">
                        <img src="${video.thumbnail}" alt="${video.title}" class="w-full h-full object-cover group-hover:scale-105 transition duration-200">
                        <div class="video-preview absolute inset-0 w-full h-full bg-black z-10 pointer-events-none empty:hidden"></div>
                        <span class="absolute bottom-2 right-2 bg-black/80 px-2 py-0.5 rounded text-xs font-semibold z-20">${video.duration}</span>
                    </div>
                    <div class="px-3 flex-1">
                        <h3 class="font-semibold text-sm line-clamp-2 leading-snug text-zinc-100 group-hover:text-white">${video.title}</h3>
                        <p class="text-xs text-zinc-400 mt-1">${video.views} views • ${video.time}</p>
                    </div>
                </div>
            `;
        });
    }
});
