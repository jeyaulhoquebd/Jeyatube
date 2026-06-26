document.addEventListener("DOMContentLoaded", async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const videoId = urlParams.get('id');

    let channels = await getChannels();
    let video = await getVideoById(videoId);

    if (!video) {
        document.body.innerHTML = `<div class="text-center py-20"><h1 class="text-2xl">Video not found.</h1><a href="index.html" class="text-blue-500 mt-4 block">Return Home</a></div>`;
        return;
    }
    
    // Increment real views asynchronously (Task 2)
    incrementView(video.id);

    const videoPlayer = document.getElementById("video-player");
    const videoTitle = document.getElementById("video-title");
    const channelAvatar = document.getElementById("channel-avatar");
    const channelName = document.getElementById("channel-name");
    const channelSubs = document.getElementById("channel-subs");
    const subscribeBtn = document.getElementById("subscribe-btn");
    const likeBtn = document.getElementById("like-btn");
    const likeCount = document.getElementById("like-count");
    const videoMeta = document.getElementById("video-meta");
    const videoDesc = document.getElementById("video-desc");
    const commentsList = document.getElementById("comments-list");
    const commentCount = document.getElementById("comment-count");
    const commentForm = document.getElementById("comment-form");
    const commentInput = document.getElementById("comment-input");
    const recommendationsContainer = document.getElementById("recommendations");

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
    
    let isRegistering = false;

    // Handle User State
    document.addEventListener('authStateChanged', async (e) => {
        if (e.detail) {
            authModal.classList.add("hidden");
            await addToHistory(video); // Add to history when logged in user visits
        }
        updateInteractionsUI(); // Update UI with correct user state
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

    const googleAuthBtn = document.getElementById("google-auth-btn");
    if (googleAuthBtn) {
        googleAuthBtn.addEventListener("click", async () => {
            try {
                await loginWithGoogle();
            } catch (error) {
                alert(error.message);
            }
        });
    }

    // YouTube Embed
    function convertToEmbedUrl(url) {
        const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
        const match = url.match(regExp);
        if (match && match[2].length === 11) {
            return 'https://www.youtube.com/embed/' + match[2] + '?autoplay=1';
        }
        return null;
    }

    const embedUrl = convertToEmbedUrl(video.videoUrl);
    if (embedUrl) {
        const container = videoPlayer.parentElement;
        container.innerHTML = `<iframe class="w-full h-full" src="${embedUrl}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
    } else {
        videoPlayer.src = video.videoUrl;
    }

    videoTitle.textContent = video.title;
    const currentChannelData = channels[video.channel];
    if (currentChannelData && currentChannelData.avatarUrl) {
        channelAvatar.innerHTML = `<img src="${currentChannelData.avatarUrl}" class="w-full h-full object-cover rounded-full" alt="${video.channel}">`;
    } else {
        channelAvatar.textContent = video.channel[0];
    }
    channelName.textContent = video.channel;
    videoMeta.textContent = `${video.views} views • ${video.time}`;
    
    function renderDescription() {
        const descText = video.description || "";
        const lines = descText.split('\n');
        if (lines.length > 3 || descText.length > 200) {
            let shortText = lines.slice(0, 3).join('\n');
            if (shortText.length > 200) shortText = shortText.substring(0, 200) + '...';
            else if (lines.length > 3) shortText += '...';
            
            videoDesc.innerHTML = parseLinks(shortText) + '<br><button id="read-more-btn" class="text-zinc-400 hover:text-white font-bold mt-2">Read More</button>';
            document.getElementById("read-more-btn").addEventListener("click", () => {
                videoDesc.innerHTML = parseLinks(descText) + '<br><button id="read-less-btn" class="text-zinc-400 hover:text-white font-bold mt-2">Show Less</button>';
                document.getElementById("read-less-btn").addEventListener("click", renderDescription);
            });
        } else {
            videoDesc.innerHTML = parseLinks(descText);
        }
    }
    renderDescription();

    function updateInteractionsUI() {
        const currentChannel = channels[video.channel];
        const isSubscribed = currentChannel && currentChannel.subscribedBy && currentUser && currentChannel.subscribedBy.includes(currentUser.email);
        
        if (isSubscribed) {
            subscribeBtn.textContent = "Subscribed";
            subscribeBtn.className = "ml-4 bg-zinc-800 text-zinc-400 px-4 py-2 rounded-full font-semibold text-xs md:text-sm transition hover:bg-zinc-700";
        } else {
            subscribeBtn.textContent = "Subscribe";
            subscribeBtn.className = "ml-4 bg-white text-black px-4 py-2 rounded-full font-semibold text-xs md:text-sm transition hover:bg-zinc-200";
        }
        
        // Calculate subscribers safely
        const subCount = currentChannel && currentChannel.subscribedBy ? currentChannel.subscribedBy.length : (currentChannel ? currentChannel.subscribers : 0);
        channelSubs.textContent = `${subCount.toLocaleString()} subscribers`;

        const likeCountNum = video.likedBy ? video.likedBy.length : (video.likes || 0);
        likeCount.textContent = likeCountNum.toLocaleString();
        
        const isLiked = video.likedBy && currentUser && video.likedBy.includes(currentUser.email);
        const icon = likeBtn.querySelector("i");
        if (isLiked) {
            icon.className = "fas fa-thumbs-up text-blue-500";
        } else {
            icon.className = "far fa-thumbs-up";
        }

        commentCount.textContent = video.comments ? video.comments.length : 0;
        renderComments();
    }

    function renderComments() {
        commentsList.innerHTML = "";
        if (!video.comments) video.comments = [];
        video.comments.forEach(comment => {
            commentsList.innerHTML += `
                <div class="flex gap-3 items-start text-sm">
                    <div class="bg-zinc-700 w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs flex-shrink-0">${comment.username[0]}</div>
                    <div>
                        <p class="font-semibold text-zinc-300 text-xs">${comment.username}</p>
                        <p class="text-zinc-100 mt-0.5">${comment.text}</p>
                    </div>
                </div>
            `;
        });
    }

    async function renderRecommendations() {
        recommendationsContainer.innerHTML = `<h3 class="text-xs font-bold text-zinc-400 tracking-wider uppercase mb-1">Up Next</h3>`;
        // Lazy-load recommendations only when needed
        const videos = await getVideos();
        const recs = videos.filter(v => v.id !== video.id).slice(0, 15);
        recs.forEach(v => {
            recommendationsContainer.innerHTML += `
                <div class="flex space-x-3 cursor-pointer group" onclick="location.href='watch.html?id=${v.id}'">
                    <div class="relative w-32 sm:w-40 aspect-video bg-zinc-800 rounded-lg overflow-hidden flex-shrink-0">
                        <img src="${v.thumbnail}" loading="lazy" class="w-full h-full object-cover">
                    </div>
                    <div class="flex-1">
                        <h4 class="text-xs font-semibold line-clamp-2 text-zinc-100 leading-snug group-hover:text-white">${v.title}</h4>
                        <div class="flex items-center space-x-1 mt-1">
                            <p class="text-[11px] text-zinc-400 truncate">${v.channel}</p>
                            <img src="img/icons.svg" class="w-3 h-3 flex-shrink-0" alt="Verified" title="Verified">
                        </div>
                        <p class="text-[11px] text-zinc-400">${(v.views || 0).toLocaleString()} views</p>
                    </div>
                </div>
            `;
        });
    }

    likeBtn.addEventListener("click", async () => {
        if (!currentUser) return openAuthModal();
        if (!video.likedBy) video.likedBy = [];
        
        const index = video.likedBy.indexOf(currentUser.email);
        if (index > -1) {
            video.likedBy.splice(index, 1);
        } else {
            video.likedBy.push(currentUser.email);
        }
        await saveVideo(video);
        updateInteractionsUI();
    });

    subscribeBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        if (!currentUser) return openAuthModal();
        let currentChannel = channels[video.channel];
        if (!currentChannel) {
            currentChannel = { subscribers: 0, subscribedBy: [] };
        }
        if (!currentChannel.subscribedBy) currentChannel.subscribedBy = [];

        const index = currentChannel.subscribedBy.indexOf(currentUser.email);
        if (index > -1) {
            currentChannel.subscribedBy.splice(index, 1);
        } else {
            currentChannel.subscribedBy.push(currentUser.email);
        }
        
        channels[video.channel] = currentChannel;
        await saveChannel(video.channel, currentChannel);
        updateInteractionsUI();
    });

    commentForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        if (!currentUser) return openAuthModal();
        const text = commentInput.value.trim();
        if (!text) return;

        if (!video.comments) video.comments = [];
        video.comments.unshift({
            username: currentUser.displayName || "User",
            text: text
        });

        commentInput.value = "";
        await saveVideo(video);
        updateInteractionsUI();
    });

    document.getElementById("cancel-comment").addEventListener("click", () => {
        commentInput.value = "";
    });

    updateInteractionsUI();
    await renderRecommendations();
});