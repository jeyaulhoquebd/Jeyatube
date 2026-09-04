document.addEventListener("DOMContentLoaded", async () => {
    let shortsList = [];
    let currentIndex = 0;
    let ytPlayer = null;
    let isMuted = false;
    let isPlaying = true;
    let progressInterval = null;

    // DOM Elements
    const playerMount = document.getElementById("short-player-mount");
    const loadingSpinner = document.getElementById("short-loading");
    const touchLayer = document.getElementById("short-touch-layer");
    const playPulseIcon = document.getElementById("play-pulse-icon");
    const playPulseI = document.getElementById("play-pulse-i");
    const soundToggleBtn = document.getElementById("btn-sound-toggle");
    const soundIcon = document.getElementById("sound-icon");
    const shortsCounter = document.getElementById("shorts-counter");
    const bgBlur = document.getElementById("shorts-bg-blur");

    const channelAvatar = document.getElementById("short-channel-avatar");
    const channelName = document.getElementById("short-channel-name");
    const channelLink = document.getElementById("short-channel-link");
    const subscribeBtn = document.getElementById("short-subscribe-btn");
    const shortTitle = document.getElementById("short-title");
    const audioText = document.getElementById("short-audio-text");
    const progressBar = document.getElementById("short-progress-bar");

    const likeBtn = document.getElementById("short-like-btn");
    const likeIcon = document.getElementById("short-like-icon");
    const likeCountLabel = document.getElementById("short-like-count");
    const dislikeBtn = document.getElementById("short-dislike-btn");
    const dislikeIcon = document.getElementById("short-dislike-icon");
    const commentsBtn = document.getElementById("short-comments-btn");
    const commentCountLabel = document.getElementById("short-comment-count");
    const shareBtn = document.getElementById("short-share-btn");
    const aiBtn = document.getElementById("short-ai-btn");

    const btnPrev = document.getElementById("btn-prev-short");
    const btnNext = document.getElementById("btn-next-short");

    const commentsDrawer = document.getElementById("comments-drawer");
    const closeCommentsDrawer = document.getElementById("close-comments-drawer");
    const commentsListContainer = document.getElementById("comments-list-container");
    const drawerCommentCount = document.getElementById("drawer-comment-count");
    const commentForm = document.getElementById("short-comment-form");
    const commentInput = document.getElementById("short-comment-input");

    // Extract YouTube ID
    function getYoutubeId(url) {
        if (!url) return null;
        const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|shorts\/|&v=)([^#&?]*).*/;
        const match = url.match(regExp);
        return (match && match[2].length === 11) ? match[2] : null;
    }

    // Load Shorts
    async function initShorts() {
        const allVideos = await getVideos();
        // Filter videos that are short (duration <= 120s or tagged with #shorts)
        shortsList = allVideos.filter(v => isShortVideo(v));

        if (shortsList.length === 0) {
            // Fallback: take the 10 shortest videos if none explicitly matched
            shortsList = [...allVideos].sort((a, b) => parseDurationInSeconds(a.duration) - parseDurationInSeconds(b.duration)).slice(0, 10);
        }

        // Check if specific video ID in URL
        const params = new URLSearchParams(window.location.search);
        const targetId = params.get("id");
        if (targetId) {
            const foundIndex = shortsList.findIndex(s => s.id === targetId);
            if (foundIndex !== -1) {
                currentIndex = foundIndex;
            } else {
                // If not in shorts list, find in all videos and prepend
                const targetVideo = allVideos.find(v => v.id === targetId);
                if (targetVideo) {
                    shortsList.unshift(targetVideo);
                    currentIndex = 0;
                }
            }
        }

        renderCurrentShort();
    }

    // Render Short
    async function renderCurrentShort() {
        if (shortsList.length === 0) return;
        const video = shortsList[currentIndex];

        // Update URL query param quietly
        const url = new URL(window.location);
        url.searchParams.set('id', video.id);
        window.history.replaceState({}, '', url);

        // Counter
        if (shortsCounter) {
            shortsCounter.textContent = `${currentIndex + 1} / ${shortsList.length}`;
        }

        // Background thumbnail blur
        if (bgBlur) {
            bgBlur.style.backgroundImage = `url('${video.thumbnail || ''}')`;
        }

        // Title and Audio
        if (shortTitle) {
            shortTitle.textContent = video.title || "JTube Short";
        }
        if (audioText) {
            audioText.textContent = `Original sound • ${video.channel}`;
        }

        // Channel Info
        if (channelName) {
            channelName.textContent = video.channel;
        }
        if (channelLink) {
            channelLink.href = `channel.html?name=${encodeURIComponent(video.channel)}`;
        }
        if (channelAvatar) {
            channelAvatar.src = video.channelAvatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(video.channel)}&background=ef4444&color=fff`;
            // Fetch real avatar if available
            getChannels().then(channels => {
                if (channels[video.channel] && channels[video.channel].avatarUrl) {
                    channelAvatar.src = channels[video.channel].avatarUrl;
                }
            });
        }

        // Check channel subscription
        updateSubscribeButton(video.channel);

        // Likes and Comments
        const effectiveLikes = typeof getEffectiveLikes === 'function' ? getEffectiveLikes(video) : (video.likes || 0);
        if (likeCountLabel) {
            likeCountLabel.textContent = formatCompactNumber(effectiveLikes);
        }
        if (commentCountLabel) {
            commentCountLabel.textContent = formatCompactNumber(video.commentsCount || 0);
        }

        // Reset or set like/dislike buttons
        const userIdent = typeof getSiteUserIdentifier === 'function' ? getSiteUserIdentifier() : (currentUser ? currentUser.email : null);
        const isLikedAlready = video.likedBy && userIdent && video.likedBy.includes(userIdent);
        if (likeBtn) {
            if (isLikedAlready) {
                likeBtn.classList.add("!bg-red-600", "!border-red-500");
            } else {
                likeBtn.classList.remove("!bg-red-600", "!border-red-500");
            }
        }
        if (dislikeBtn) dislikeBtn.classList.remove("!bg-red-600", "!border-red-500");

        // Load comments count from Firestore
        loadShortComments(video.id);

        // Mount Player
        loadVideoPlayer(video);
    }

    // Player loader
    function loadVideoPlayer(video) {
        if (progressInterval) clearInterval(progressInterval);
        loadingSpinner.classList.remove("hidden");
        loadingSpinner.style.opacity = "1";
        playerMount.innerHTML = "";

        const ytId = getYoutubeId(video.videoUrl);

        if (ytId) {
            // YouTube Embed
            const iframeContainer = document.createElement("div");
            iframeContainer.id = "yt-player-target";
            iframeContainer.className = "w-full h-full";
            playerMount.appendChild(iframeContainer);

            // Use YouTube API if ready
            if (window.YT && window.YT.Player) {
                createYTPlayer(ytId);
            } else {
                // Fallback direct iframe with loop
                playerMount.innerHTML = `
                    <iframe id="short-yt-iframe" 
                            class="w-full h-full object-cover scale-[1.35] pointer-events-none" 
                            src="https://www.youtube.com/embed/${ytId}?autoplay=1&mute=${isMuted ? 1 : 0}&loop=1&playlist=${ytId}&controls=0&modestbranding=1&rel=0&playsinline=1&enablejsapi=1" 
                            frameborder="0" 
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                            allowfullscreen>
                    </iframe>
                `;
                setTimeout(() => {
                    loadingSpinner.classList.add("hidden");
                }, 700);
            }
        } else {
            // HTML5 Video
            const videoEl = document.createElement("video");
            videoEl.src = video.videoUrl;
            videoEl.className = "w-full h-full object-cover";
            videoEl.autoplay = true;
            videoEl.loop = true;
            videoEl.muted = isMuted;
            videoEl.playsInline = true;
            playerMount.appendChild(videoEl);

            videoEl.onloadeddata = () => {
                loadingSpinner.classList.add("hidden");
                videoEl.play().catch(e => console.log("Autoplay caught:", e));
            };

            videoEl.ontimeupdate = () => {
                if (videoEl.duration && progressBar) {
                    const pct = (videoEl.currentTime / videoEl.duration) * 100;
                    progressBar.style.width = `${pct}%`;
                }
            };
        }
    }

    function createYTPlayer(videoId) {
        if (ytPlayer && ytPlayer.destroy) {
            try { ytPlayer.destroy(); } catch (e) {}
        }

        ytPlayer = new YT.Player('yt-player-target', {
            videoId: videoId,
            playerVars: {
                autoplay: 1,
                mute: isMuted ? 1 : 0,
                loop: 1,
                playlist: videoId,
                controls: 0,
                modestbranding: 1,
                rel: 0,
                playsinline: 1,
                disablekb: 1,
                fs: 0
            },
            events: {
                onReady: (event) => {
                    loadingSpinner.classList.add("hidden");
                    if (isMuted) event.target.mute();
                    else event.target.unMute();
                    event.target.playVideo();
                    startProgressTracker();
                },
                onStateChange: (event) => {
                    if (event.data === YT.PlayerState.ENDED) {
                        // Loop short
                        event.target.playVideo();
                    }
                    if (event.data === YT.PlayerState.PLAYING) {
                        isPlaying = true;
                    } else if (event.data === YT.PlayerState.PAUSED) {
                        isPlaying = false;
                    }
                }
            }
        });
    }

    function startProgressTracker() {
        if (progressInterval) clearInterval(progressInterval);
        progressInterval = setInterval(() => {
            if (ytPlayer && ytPlayer.getCurrentTime && ytPlayer.getDuration && progressBar) {
                const current = ytPlayer.getCurrentTime();
                const total = ytPlayer.getDuration();
                if (total > 0) {
                    const pct = (current / total) * 100;
                    progressBar.style.width = `${pct}%`;
                }
            }
        }, 150);
    }

    // Play/Pause Pulse Animation
    function showPlayPulse(iconClass) {
        if (!playPulseIcon || !playPulseI) return;
        playPulseI.className = `fas ${iconClass}`;
        playPulseIcon.style.opacity = "1";
        setTimeout(() => {
            playPulseIcon.style.opacity = "0";
        }, 400);
    }

    // Toggle Play/Pause on Video Click
    if (touchLayer) {
        touchLayer.addEventListener("click", () => {
            const html5Video = playerMount.querySelector("video");
            if (ytPlayer && ytPlayer.getPlayerState) {
                const state = ytPlayer.getPlayerState();
                if (state === YT.PlayerState.PLAYING) {
                    ytPlayer.pauseVideo();
                    isPlaying = false;
                    showPlayPulse("fa-pause");
                } else {
                    ytPlayer.playVideo();
                    isPlaying = true;
                    showPlayPulse("fa-play");
                }
            } else if (html5Video) {
                if (html5Video.paused) {
                    html5Video.play();
                    isPlaying = true;
                    showPlayPulse("fa-play");
                } else {
                    html5Video.pause();
                    isPlaying = false;
                    showPlayPulse("fa-pause");
                }
            }
        });
    }

    // Sound Toggle
    if (soundToggleBtn) {
        soundToggleBtn.addEventListener("click", () => {
            isMuted = !isMuted;
            soundIcon.className = isMuted ? "fas fa-volume-mute text-sm text-red-400" : "fas fa-volume-up text-sm";
            const html5Video = playerMount.querySelector("video");
            if (ytPlayer && ytPlayer.mute) {
                if (isMuted) ytPlayer.mute();
                else ytPlayer.unMute();
            }
            if (html5Video) {
                html5Video.muted = isMuted;
            }
            showToast(isMuted ? "Audio muted" : "Audio unmuted", "info");
        });
    }

    // Next Short
    function nextShort() {
        if (currentIndex < shortsList.length - 1) {
            currentIndex++;
            renderCurrentShort();
        } else {
            // Loop back to start
            currentIndex = 0;
            renderCurrentShort();
        }
    }

    // Previous Short
    function prevShort() {
        if (currentIndex > 0) {
            currentIndex--;
            renderCurrentShort();
        }
    }

    if (btnNext) btnNext.addEventListener("click", nextShort);
    if (btnPrev) btnPrev.addEventListener("click", prevShort);

    // Keyboard Navigation (ArrowUp / ArrowDown / Space / M)
    window.addEventListener("keydown", (e) => {
        if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
        if (e.key === "ArrowDown" || e.key === "PageDown" || e.key === "j") {
            e.preventDefault();
            nextShort();
        } else if (e.key === "ArrowUp" || e.key === "PageUp" || e.key === "k") {
            e.preventDefault();
            prevShort();
        } else if (e.key === " " || e.key === "k") {
            e.preventDefault();
            if (touchLayer) touchLayer.click();
        } else if (e.key === "m" || e.key === "M") {
            if (soundToggleBtn) soundToggleBtn.click();
        }
    });

    // Touch Swipe Gesture for Mobile
    let touchStartY = 0;
    let touchEndY = 0;

    window.addEventListener("touchstart", (e) => {
        touchStartY = e.changedTouches[0].screenY;
    }, { passive: true });

    window.addEventListener("touchend", (e) => {
        touchEndY = e.changedTouches[0].screenY;
        const diffY = touchStartY - touchEndY;
        if (Math.abs(diffY) > 50) {
            if (diffY > 50) {
                // Swiped up -> Next Short
                nextShort();
            } else {
                // Swiped down -> Previous Short
                prevShort();
            }
        }
    }, { passive: true });

    // Wheel navigation (debounced)
    let lastWheelTime = 0;
    window.addEventListener("wheel", (e) => {
        if (commentsDrawer && !commentsDrawer.classList.contains("closed")) return;
        const now = Date.now();
        if (now - lastWheelTime < 600) return;
        if (Math.abs(e.deltaY) > 40) {
            lastWheelTime = now;
            if (e.deltaY > 0) nextShort();
            else prevShort();
        }
    }, { passive: true });

    // Like Action
    if (likeBtn) {
        likeBtn.addEventListener("click", async () => {
            const video = shortsList[currentIndex];
            if (!video) return;

            try {
                const updated = await likeVideo(video.id);
                if (updated) {
                    Object.assign(video, updated);
                    const userIdent = typeof getSiteUserIdentifier === 'function' ? getSiteUserIdentifier() : (currentUser ? currentUser.email : null);
                    const isLiked = video.likedBy && userIdent && video.likedBy.includes(userIdent);
                    if (isLiked) {
                        likeBtn.classList.add("!bg-red-600", "!border-red-500");
                        if (dislikeBtn) dislikeBtn.classList.remove("!bg-red-600", "!border-red-500");
                        showToast("Liked Short!", "success");
                    } else {
                        likeBtn.classList.remove("!bg-red-600", "!border-red-500");
                        showToast("Like removed", "info");
                    }
                    const effectiveLikes = typeof getEffectiveLikes === 'function' ? getEffectiveLikes(video) : (video.likes || 0);
                    if (likeCountLabel) {
                        likeCountLabel.textContent = formatCompactNumber(effectiveLikes);
                    }
                }
            } catch (e) {
                console.log("Like error:", e);
            }
        });
    }

    // Dislike Action
    if (dislikeBtn) {
        dislikeBtn.addEventListener("click", () => {
            const isDisliked = dislikeBtn.classList.contains("!bg-red-600");
            if (!isDisliked) {
                dislikeBtn.classList.add("!bg-red-600", "!border-red-500");
                likeBtn.classList.remove("!bg-red-600", "!border-red-500");
                showToast("Disliked", "info");
            } else {
                dislikeBtn.classList.remove("!bg-red-600", "!border-red-500");
            }
        });
    }

    // Share Action
    if (shareBtn) {
        shareBtn.addEventListener("click", async () => {
            const video = shortsList[currentIndex];
            const shareUrl = `${window.location.origin}/shorts.html?id=${video.id}`;
            if (navigator.share) {
                try {
                    await navigator.share({
                        title: video.title,
                        text: `Check out this Short on JTube: ${video.title}`,
                        url: shareUrl
                    });
                    return;
                } catch (e) {}
            }
            navigator.clipboard.writeText(shareUrl);
            showToast("Short link copied to clipboard!", "success");
        });
    }

    // JAsk AI Action
    if (aiBtn) {
        aiBtn.addEventListener("click", () => {
            const video = shortsList[currentIndex];
            location.href = `watch.html?id=${video.id}#jask`;
        });
    }

    // Subscribe Button
    async function updateSubscribeButton(chName) {
        if (!subscribeBtn) return;
        const channels = await getChannels();
        const chData = channels[chName] || {};
        const userIdent = typeof getSiteUserIdentifier === 'function' ? getSiteUserIdentifier() : (currentUser ? currentUser.email : null);
        const isSubscribed = userIdent && chData.subscribedBy && chData.subscribedBy.includes(userIdent);

        if (isSubscribed) {
            subscribeBtn.textContent = "Subscribed";
            subscribeBtn.className = "bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-bold px-3 py-1.5 rounded-full transition border border-zinc-700";
        } else {
            subscribeBtn.textContent = "Subscribe";
            subscribeBtn.className = "bg-red-600 hover:bg-red-500 text-white text-xs font-bold px-3 py-1.5 rounded-full transition shadow-md";
        }
    }

    if (subscribeBtn) {
        subscribeBtn.addEventListener("click", async () => {
            const video = shortsList[currentIndex];
            if (!video) return;
            try {
                const updatedChannel = await toggleSubscription(video.channel);
                updateSubscribeButton(video.channel);
                const userIdent = typeof getSiteUserIdentifier === 'function' ? getSiteUserIdentifier() : (currentUser ? currentUser.email : null);
                const isSub = updatedChannel && updatedChannel.subscribedBy && updatedChannel.subscribedBy.includes(userIdent);
                showToast(isSub ? `Subscribed to ${video.channel}!` : `Unsubscribed from ${video.channel}`, "success");
            } catch (err) {
                showToast("Subscription update failed", "error");
            }
        });
    }

    // Comments Drawer
    if (commentsBtn) {
        commentsBtn.addEventListener("click", () => {
            commentsDrawer.classList.remove("closed");
        });
    }

    if (closeCommentsDrawer) {
        closeCommentsDrawer.addEventListener("click", () => {
            commentsDrawer.classList.add("closed");
        });
    }

    async function loadShortComments(videoId) {
        try {
            const commentsFn = typeof getComments === 'function' ? getComments : (window.getComments || null);
            let comments = [];
            if (commentsFn) {
                comments = await commentsFn(videoId);
            } else {
                const currentV = shortsList[currentIndex];
                comments = (currentV && Array.isArray(currentV.comments)) ? currentV.comments : [];
            }
            const count = comments.length;
            if (commentCountLabel) commentCountLabel.textContent = formatCompactNumber(count);
            if (drawerCommentCount) drawerCommentCount.textContent = count;

            if (comments.length === 0) {
                commentsListContainer.innerHTML = `<p class="text-zinc-500 text-center py-6 text-xs">No comments yet. Be the first to comment!</p>`;
                return;
            }

            commentsListContainer.innerHTML = comments.map(c => {
                const name = c.userName || c.username || c.author || "User";
                const initial = (name[0] || "U").toUpperCase();
                const timeText = typeof timeAgo === 'function' ? timeAgo(c.timestamp) : 'Recently';
                const safeText = String(c.text || '').replace(/</g, "&lt;").replace(/>/g, "&gt;");
                return `
                <div class="flex space-x-2.5 items-start">
                    <div class="w-7 h-7 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
                        ${initial}
                    </div>
                    <div class="flex-1 min-w-0">
                        <div class="flex items-center space-x-1.5">
                            <span class="text-xs font-bold text-zinc-200">${name}</span>
                            <span class="text-[10px] text-zinc-500">${timeText}</span>
                        </div>
                        <p class="text-xs text-zinc-300 mt-0.5 break-words">${safeText}</p>
                    </div>
                </div>
            `;}).join("");
        } catch (e) {
            console.error("Comments error:", e);
        }
    }

    if (commentForm) {
        commentForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const text = commentInput.value.trim();
            if (!text) return;

            const video = shortsList[currentIndex];
            if (!video) return;

            const user = (typeof currentUser !== 'undefined' && currentUser) || (typeof getCurrentUser === 'function' ? getCurrentUser() : null);
            const authorName = user ? (user.displayName || user.email.split('@')[0]) : "Guest User";
            const authorEmail = user ? user.email : "guest@jtube.com";

            try {
                if (typeof addComment === 'function') {
                    await addComment(video.id, {
                        author: authorName,
                        username: authorName,
                        email: authorEmail,
                        text: text
                    });
                } else if (typeof window.addComment === 'function') {
                    await window.addComment(video.id, {
                        author: authorName,
                        username: authorName,
                        email: authorEmail,
                        text: text
                    });
                }
                commentInput.value = "";
                showToast("Comment posted!", "success");
                loadShortComments(video.id);
            } catch (err) {
                console.error("Comment submit error:", err);
                showToast("Failed to post comment", "error");
            }
        });
    }

    // Initialize
    await initShorts();
});
