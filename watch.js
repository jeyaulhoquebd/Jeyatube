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
    const saveBtn = document.getElementById("save-btn");
    const shareBtn = document.getElementById("share-btn");
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
    videoMeta.textContent = `${video.views} views • ${timeAgo(video.timestamp)}`;

    // Update OG meta tags dynamically
    const ogTitle = document.getElementById("og-title");
    if (ogTitle) ogTitle.setAttribute("content", video.title);
    const ogDesc = document.getElementById("og-desc");
    if (ogDesc) ogDesc.setAttribute("content", video.description ? video.description.substring(0, 150) : "Watch this video on JTube");
    const ogImage = document.getElementById("og-image");
    if (ogImage) ogImage.setAttribute("content", video.thumbnail);
    const ogUrl = document.getElementById("og-url");
    if (ogUrl) ogUrl.setAttribute("content", window.location.href);
    document.title = `${video.title} - JTube`;
    
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

        const isSaved = video.savedBy && currentUser && video.savedBy.includes(currentUser.email);
        const saveIcon = saveBtn.querySelector("i");
        if (isSaved) {
            saveIcon.className = "fas fa-bookmark text-blue-500";
            saveBtn.querySelector("span").textContent = "Saved";
        } else {
            saveIcon.className = "far fa-bookmark";
            saveBtn.querySelector("span").textContent = "Save";
        }

        commentCount.textContent = video.comments ? video.comments.length : 0;
        renderComments();
    }

    function renderComments() {
        commentsList.innerHTML = "";
        if (!video.comments) video.comments = [];
        video.comments.forEach((comment, idx) => {
            const avatarLetter = comment.username ? comment.username[0].toUpperCase() : 'U';
            const profileLink = `profile.html?user=${encodeURIComponent(comment.email || comment.username)}`;
            const repliesHtml = (comment.replies && comment.replies.length > 0)
                ? comment.replies.map(r => `
                    <div class="flex gap-2 items-start text-sm mt-3 ml-1">
                        <a href="${`profile.html?user=${encodeURIComponent(r.email || r.username)}`}" onclick="event.stopPropagation()" class="bg-gradient-to-br from-blue-600 to-purple-700 w-7 h-7 rounded-full flex items-center justify-center font-bold text-[11px] flex-shrink-0 cursor-pointer hover:opacity-80 transition" title="View profile">${r.username ? r.username[0].toUpperCase() : 'U'}</a>
                        <div class="bg-zinc-800/60 rounded-xl px-3 py-2 flex-1">
                            <p class="font-semibold text-zinc-300 text-xs">${r.username}</p>
                            <p class="text-zinc-100 mt-0.5 text-sm">${r.text}</p>
                        </div>
                    </div>`).join('')
                : '';

            const commentEl = document.createElement('div');
            commentEl.className = 'comment-item';
            commentEl.dataset.idx = idx;
            commentEl.innerHTML = `
                <div class="flex gap-3 items-start text-sm">
                    <a href="${profileLink}" onclick="event.stopPropagation()" class="bg-gradient-to-br from-purple-600 to-red-600 w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs flex-shrink-0 cursor-pointer hover:opacity-80 transition" title="View ${comment.username}'s profile">${avatarLetter}</a>
                    <div class="flex-1">
                        <div class="bg-zinc-800/50 rounded-xl px-3 py-2">
                            <a href="${profileLink}" class="font-semibold text-zinc-200 text-xs hover:text-white transition cursor-pointer">${comment.username}</a>
                            <p class="text-zinc-100 mt-0.5">${comment.text}</p>
                        </div>
                        <div class="flex items-center gap-4 mt-1.5 px-1">
                            <span class="text-[11px] text-zinc-500">${comment.time || 'Just now'}</span>
                            <button class="reply-btn text-[11px] text-zinc-400 hover:text-red-400 font-semibold transition flex items-center gap-1" data-idx="${idx}">
                                <i class="fas fa-reply text-[9px]"></i> Reply
                            </button>
                        </div>
                        <!-- Reply input (hidden by default) -->
                        <div class="reply-form hidden mt-3 flex gap-2 items-start">
                            <div class="bg-purple-600 w-7 h-7 rounded-full flex items-center justify-center font-bold text-[11px] flex-shrink-0 text-white">${currentUser ? (currentUser.displayName || 'U')[0].toUpperCase() : 'U'}</div>
                            <div class="flex-1">
                                <input type="text" placeholder="Add a reply..." class="reply-input w-full bg-transparent border-b border-zinc-600 focus:border-white focus:outline-none py-1 text-xs text-white">
                                <div class="flex justify-end space-x-2 mt-1.5">
                                    <button type="button" class="cancel-reply-btn px-3 py-1 rounded-full text-[11px] font-semibold hover:bg-zinc-800 transition">Cancel</button>
                                    <button type="button" class="submit-reply-btn bg-blue-600 px-3 py-1 rounded-full text-[11px] font-semibold hover:bg-blue-500 transition" data-idx="${idx}">Reply</button>
                                </div>
                            </div>
                        </div>
                        <!-- Replies -->
                        <div class="replies-container mt-1">${repliesHtml}</div>
                    </div>
                </div>
            `;
            commentsList.appendChild(commentEl);
        });

        // Attach reply button events
        commentsList.querySelectorAll('.reply-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                if (!currentUser) return openAuthModal();
                const form = btn.closest('.comment-item').querySelector('.reply-form');
                form.classList.toggle('hidden');
                if (!form.classList.contains('hidden')) form.querySelector('.reply-input').focus();
            });
        });
        commentsList.querySelectorAll('.cancel-reply-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                btn.closest('.reply-form').classList.add('hidden');
            });
        });
        commentsList.querySelectorAll('.submit-reply-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (!currentUser) return openAuthModal();
                const idx = parseInt(btn.dataset.idx);
                const input = btn.closest('.reply-form').querySelector('.reply-input');
                const text = input.value.trim();
                if (!text) return;
                if (!video.comments[idx].replies) video.comments[idx].replies = [];
                video.comments[idx].replies.push({
                    username: currentUser.displayName || 'User',
                    email: currentUser.email,
                    text: text,
                    time: 'Just now'
                });
                input.value = '';
                await saveVideo(video);
                renderComments();
                commentCount.textContent = video.comments.length;
            });
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

    saveBtn.addEventListener("click", async () => {
        if (!currentUser) return openAuthModal();
        if (!video.savedBy) video.savedBy = [];
        
        const index = video.savedBy.indexOf(currentUser.email);
        if (index > -1) {
            video.savedBy.splice(index, 1);
        } else {
            video.savedBy.push(currentUser.email);
        }
        await saveVideo(video);
        updateInteractionsUI();
    });

    if (shareBtn) {
        shareBtn.addEventListener("click", async () => {
            const shareData = {
                title: video.title,
                text: video.description ? video.description.substring(0, 100) : "Watch this video on JTube",
                url: window.location.href
            };
            try {
                if (navigator.share) {
                    await navigator.share(shareData);
                } else {
                    await navigator.clipboard.writeText(window.location.href);
                    alert("Link copied to clipboard!");
                }
            } catch (err) {
                console.log("Error sharing:", err);
            }
        });
    }

    // ===== JAsk AI Panel Logic =====
    const jaskBtn = document.getElementById("jask-btn");
    const jaskPanel = document.getElementById("jask-panel");
    const jaskClose = document.getElementById("jask-close");
    const jaskInput = document.getElementById("jask-input");
    const jaskSend = document.getElementById("jask-send");
    const jaskMessages = document.getElementById("jask-messages");
    const jaskSuggestions = document.getElementById("jask-suggestions");
    const jaskWelcome = document.getElementById("jask-welcome");

    // Initialize suggested questions
    function initJAskSuggestions() {
        if (!jaskSuggestions) return;
        const questions = JAsk.getSuggestedQuestions(video);
        jaskSuggestions.innerHTML = '';
        questions.forEach(q => {
            const btn = document.createElement('button');
            btn.className = 'text-xs px-3 py-1.5 rounded-full border border-violet-500/30 text-violet-300 hover:bg-violet-500/20 hover:border-violet-400/50 transition-all duration-200 text-left';
            btn.textContent = q;
            btn.addEventListener('click', () => sendJAskMessage(q));
            jaskSuggestions.appendChild(btn);
        });
    }

    // Format AI response text (markdown-like to HTML)
    function formatAIResponse(text) {
        let html = text;
        // Convert JTube video links: [Title](watch.html?id=xxx) -> clickable cards
        html = html.replace(/\[([^\]]+)\]\(watch\.html\?id=([^)]+)\)/g, (match, title, id) => {
            const linkedVideo = allJAskVideos.find(v => v.id === id);
            if (linkedVideo) {
                return `<a href="watch.html?id=${id}" class="jask-video-card flex items-center gap-2 p-2 my-1 bg-zinc-800/80 hover:bg-zinc-700/80 rounded-xl border border-zinc-700/50 hover:border-violet-500/30 transition-all group/link no-underline block">
                    <img src="${linkedVideo.thumbnail}" class="w-16 h-10 rounded-lg object-cover flex-shrink-0">
                    <div class="flex-1 min-w-0">
                        <p class="text-xs font-semibold text-zinc-100 line-clamp-1 group-hover/link:text-violet-300 transition">${title}</p>
                        <p class="text-[10px] text-zinc-500">${linkedVideo.channel} • ${(linkedVideo.views || 0).toLocaleString()} views</p>
                    </div>
                    <i class="fas fa-play text-[10px] text-violet-400 opacity-0 group-hover/link:opacity-100 transition"></i>
                </a>`;
            }
            return `<a href="watch.html?id=${id}" class="text-violet-400 hover:text-violet-300 underline">${title}</a>`;
        });
        // Bold text
        html = html.replace(/\*\*([^*]+)\*\*/g, '<strong class="text-zinc-100">$1</strong>');
        // Italic
        html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
        // Bullet points
        html = html.replace(/^[\-•]\s+(.+)/gm, '<span class="flex items-start gap-1.5 mb-0.5"><span class="text-violet-400 mt-0.5">•</span><span>$1</span></span>');
        // Line breaks
        html = html.replace(/\n/g, '<br>');
        // Emojis are already supported
        return html;
    }

    let allJAskVideos = [];
    // Preload videos for link matching
    async function preloadJAskVideos() {
        try {
            allJAskVideos = await getVideos();
        } catch (e) {
            allJAskVideos = [];
        }
    }
    preloadJAskVideos();

    // Add a message bubble to the chat
    function addJAskMessage(content, isUser = false) {
        if (jaskWelcome && !jaskWelcome.classList.contains('hidden')) {
            jaskWelcome.classList.add('hidden');
        }
        const msg = document.createElement('div');
        msg.className = isUser
            ? 'flex justify-end'
            : 'flex items-start gap-2';

        if (isUser) {
            msg.innerHTML = `
                <div class="bg-violet-600/30 border border-violet-500/20 text-sm text-zinc-100 px-3 py-2 rounded-2xl rounded-br-md max-w-[85%] leading-relaxed">
                    ${content}
                </div>`;
        } else {
            msg.innerHTML = `
                <div class="w-6 h-6 bg-gradient-to-br from-violet-500 to-blue-500 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <i class="fas fa-robot text-white text-[9px]"></i>
                </div>
                <div class="bg-zinc-800/60 border border-zinc-700/40 text-sm text-zinc-300 px-3 py-2 rounded-2xl rounded-bl-md max-w-[85%] leading-relaxed jask-ai-response">
                    ${content}
                </div>`;
        }
        jaskMessages.appendChild(msg);
        jaskMessages.scrollTop = jaskMessages.scrollHeight;
    }

    // Show typing indicator
    function showTypingIndicator() {
        const typing = document.createElement('div');
        typing.id = 'jask-typing';
        typing.className = 'flex items-start gap-2';
        typing.innerHTML = `
            <div class="w-6 h-6 bg-gradient-to-br from-violet-500 to-blue-500 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                <i class="fas fa-robot text-white text-[9px]"></i>
            </div>
            <div class="bg-zinc-800/60 border border-zinc-700/40 px-4 py-3 rounded-2xl rounded-bl-md">
                <div class="flex items-center gap-1">
                    <div class="jask-typing-dot w-2 h-2 bg-violet-400 rounded-full"></div>
                    <div class="jask-typing-dot w-2 h-2 bg-violet-400 rounded-full" style="animation-delay: 0.15s"></div>
                    <div class="jask-typing-dot w-2 h-2 bg-violet-400 rounded-full" style="animation-delay: 0.3s"></div>
                </div>
            </div>`;
        jaskMessages.appendChild(typing);
        jaskMessages.scrollTop = jaskMessages.scrollHeight;
    }

    function removeTypingIndicator() {
        const typing = document.getElementById('jask-typing');
        if (typing) typing.remove();
    }

    // Send message to AI
    async function sendJAskMessage(text) {
        if (!text || !text.trim()) return;
        const userMsg = text.trim();
        jaskInput.value = '';

        // Show user message
        addJAskMessage(userMsg, true);

        // Show typing...
        showTypingIndicator();

        try {
            const result = await JAsk.askGroq(userMsg, video);
            removeTypingIndicator();
            addJAskMessage(formatAIResponse(result.text));
        } catch (err) {
            removeTypingIndicator();
            addJAskMessage('⚠️ Something went wrong. Please try again.');
            console.error('JAsk error:', err);
        }
    }

    // Event listeners
    if (jaskBtn) {
        jaskBtn.addEventListener('click', () => {
            jaskPanel.classList.toggle('hidden');
            if (!jaskPanel.classList.contains('hidden')) {
                initJAskSuggestions();
                jaskInput.focus();
            }
        });
    }
    if (jaskClose) {
        jaskClose.addEventListener('click', () => {
            jaskPanel.classList.add('hidden');
        });
    }
    if (jaskSend) {
        jaskSend.addEventListener('click', () => sendJAskMessage(jaskInput.value));
    }
    if (jaskInput) {
        jaskInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') sendJAskMessage(jaskInput.value);
        });
    }

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
            email: currentUser.email,
            text: text,
            time: 'Just now',
            replies: []
        });

        commentInput.value = "";
        await saveVideo(video);
        commentCount.textContent = video.comments.length;
        renderComments();
    });

    document.getElementById("cancel-comment").addEventListener("click", () => {
        commentInput.value = "";
    });

    // Auto-rotate on fullscreen for mobile
    function handleFullscreenChange() {
        const isFullscreen = document.fullscreenElement || document.webkitFullscreenElement;
        
        if (isFullscreen) {
            // Attempt to lock to landscape on mobile when entering fullscreen
            if (screen.orientation && screen.orientation.lock) {
                screen.orientation.lock('landscape').catch((err) => {
                    console.log('Orientation lock failed:', err);
                });
            }
        } else {
            // Unlock orientation when exiting fullscreen
            if (screen.orientation && screen.orientation.unlock) {
                screen.orientation.unlock();
            }
        }
    }

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);

    updateInteractionsUI();
    await renderRecommendations();
});