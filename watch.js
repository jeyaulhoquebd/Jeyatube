document.addEventListener("DOMContentLoaded", async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const videoId = urlParams.get('id');

    let videos = await getVideos();
    let channels = await getChannels();
    let video = videos.find(v => v.id === videoId);

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
    channelAvatar.textContent = video.channel[0];
    channelName.textContent = video.channel;
    videoMeta.textContent = `${video.views} views • ${video.time}`;
    videoDesc.textContent = video.description;

    function updateInteractionsUI() {
        const currentChannel = channels[video.channel];
        if (currentChannel && currentChannel.subscribed) {
            subscribeBtn.textContent = "Subscribed";
            subscribeBtn.className = "ml-4 bg-zinc-800 text-zinc-400 px-4 py-2 rounded-full font-semibold text-xs md:text-sm transition hover:bg-zinc-700";
        } else {
            subscribeBtn.textContent = "Subscribe";
            subscribeBtn.className = "ml-4 bg-white text-black px-4 py-2 rounded-full font-semibold text-xs md:text-sm transition hover:bg-zinc-200";
        }
        channelSubs.textContent = currentChannel ? `${currentChannel.subscribers.toLocaleString()} subscribers` : '0 subscribers';

        likeCount.textContent = video.likes ? video.likes.toLocaleString() : "0";
        const icon = likeBtn.querySelector("i");
        if (video.liked) {
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

    function renderRecommendations() {
        recommendationsContainer.innerHTML = `<h3 class="text-xs font-bold text-zinc-400 tracking-wider uppercase mb-1">Up Next</h3>`;
        videos.filter(v => v.id !== video.id).forEach(v => {
            recommendationsContainer.innerHTML += `
                <div class="flex space-x-3 cursor-pointer group" onclick="location.href='watch.html?id=${v.id}'">
                    <div class="relative w-32 sm:w-40 aspect-video bg-zinc-800 rounded-lg overflow-hidden flex-shrink-0">
                        <img src="${v.thumbnail}" class="w-full h-full object-cover">
                    </div>
                    <div class="flex-1">
                        <h4 class="text-xs font-semibold line-clamp-2 text-zinc-100 leading-snug group-hover:text-white">${v.title}</h4>
                        <p class="text-[11px] text-zinc-400 mt-1">${v.channel}</p>
                        <p class="text-[11px] text-zinc-400">${v.views} views</p>
                    </div>
                </div>
            `;
        });
    }

    likeBtn.addEventListener("click", async () => {
        if (!currentUser) return openAuthModal();
        if (!video.likes) video.likes = 0;
        if (video.liked) {
            video.likes--;
            video.liked = false;
        } else {
            video.likes++;
            video.liked = true;
        }
        await saveVideo(video);
        updateInteractionsUI();
    });

    subscribeBtn.addEventListener("click", async () => {
        if (!currentUser) return openAuthModal();
        let currentChannel = channels[video.channel];
        if (!currentChannel) {
            currentChannel = { subscribers: 0, subscribed: false };
        }

        if (currentChannel.subscribed) {
            currentChannel.subscribers--;
            currentChannel.subscribed = false;
        } else {
            currentChannel.subscribers++;
            currentChannel.subscribed = true;
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
    renderRecommendations();
});