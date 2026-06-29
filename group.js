document.addEventListener("DOMContentLoaded", async () => {
    const authWarning = document.getElementById("auth-warning");
    const chatContainer = document.getElementById("chat-container");
    const chatMessages = document.getElementById("chat-messages");
    const chatForm = document.getElementById("chat-form");
    const chatInput = document.getElementById("chat-input");
    const sendBtn = document.getElementById("send-btn");
    const aiTyping = document.getElementById("ai-typing");
    
    let allVideos = [];
    let isInitialLoad = true;

    // Load videos for link previews
    try {
        allVideos = await getVideos();
    } catch (e) {
        console.error("Failed to load videos for previews", e);
    }

    // Auto resize textarea
    chatInput.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = (this.scrollHeight) + 'px';
        sendBtn.disabled = this.value.trim().length === 0;
    });

    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            chatForm.dispatchEvent(new Event('submit'));
        }
    });

    // Check Auth State
    document.addEventListener('authStateChanged', (e) => {
        if (e.detail) {
            // Logged in
            authWarning.classList.add('hidden');
            chatContainer.classList.remove('hidden');
            chatContainer.classList.add('flex');
            initChat(e.detail);
        } else {
            // Not logged in
            authWarning.classList.remove('hidden');
            authWarning.classList.add('flex');
            chatContainer.classList.add('hidden');
            chatContainer.classList.remove('flex');
        }
    });

    function initChat(user) {
        const chatRef = dbRealtime.ref('jtube_group_chat');
        
        // Listen for new messages
        chatRef.limitToLast(100).on('child_added', (snapshot) => {
            const msg = snapshot.val();
            renderMessage(msg, user);
        });

        // Handle sending
        chatForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const text = chatInput.value.trim();
            if (!text) return;

            // Reset input
            chatInput.value = '';
            chatInput.style.height = 'auto';
            sendBtn.disabled = true;

            const msgData = {
                uid: user.uid,
                email: user.email,
                name: user.displayName || user.email.split('@')[0],
                avatarUrl: null, // Could pull from firestore if needed
                text: text,
                timestamp: firebase.database.ServerValue.TIMESTAMP
            };

            // Get user's avatar from Firestore (optional but nice)
            try {
                const profile = await getUserProfile(user.uid);
                if (profile && profile.avatarUrl) {
                    msgData.avatarUrl = profile.avatarUrl;
                }
            } catch (err) { }

            // Push message
            await chatRef.push(msgData);

            // Check if Jaks AI was mentioned
            if (text.toLowerCase().includes('@jaksai') || text.toLowerCase().startsWith('/ask')) {
                aiTyping.classList.remove('hidden');
                
                try {
                    const query = text.replace(/@jaksai|\/ask/gi, '').trim() || "Hello!";
                    // JAsk expects a current video context, we'll pass a dummy one for the group chat
                    const dummyContext = { title: 'JtubeGroup Chat', channel: 'Community', category: 'General', description: 'Jtube group chat' };
                    
                    const aiResponse = await JAsk.askGroq(query, dummyContext);
                    
                    const aiMsgData = {
                        uid: 'jaks_ai',
                        name: 'Jaks AI',
                        isAI: true,
                        text: aiResponse.text,
                        timestamp: firebase.database.ServerValue.TIMESTAMP
                    };
                    
                    await chatRef.push(aiMsgData);
                } catch (err) {
                    console.error("AI Error:", err);
                } finally {
                    aiTyping.classList.add('hidden');
                }
            }
        });
    }

    function renderMessage(msg, currentUser) {
        const isMe = msg.uid === currentUser.uid;
        const isAI = msg.isAI;
        
        const div = document.createElement('div');
        div.className = `flex ${isMe ? 'justify-end' : 'justify-start'} mb-4 group`;

        let avatarHtml = '';
        if (isAI) {
            avatarHtml = `<div class="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0 shadow-lg shadow-blue-500/20 border border-blue-500"><i class="fas fa-robot text-white text-xs"></i></div>`;
        } else if (msg.avatarUrl) {
            avatarHtml = `<img src="${msg.avatarUrl}" class="w-8 h-8 rounded-full object-cover flex-shrink-0 border border-zinc-700">`;
        } else {
            avatarHtml = `<div class="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center text-xs font-bold flex-shrink-0 border border-zinc-700">${msg.name.charAt(0).toUpperCase()}</div>`;
        }

        const timeString = new Date(msg.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        // Parse links and specifically watch.html links
        let contentHtml = parseLinksAndVideo(msg.text);

        if (isMe) {
            div.innerHTML = `
                <div class="flex flex-col items-end max-w-[80%]">
                    <div class="flex items-end gap-2">
                        <span class="text-[10px] text-zinc-500 opacity-0 group-hover:opacity-100 transition-opacity mb-1">${timeString}</span>
                        <div class="bg-blue-600 text-white px-4 py-2 rounded-2xl rounded-tr-sm shadow-md leading-relaxed text-sm break-words">
                            ${contentHtml}
                        </div>
                    </div>
                </div>
            `;
        } else {
            div.innerHTML = `
                <div class="flex gap-3 max-w-[85%]">
                    ${avatarHtml}
                    <div class="flex flex-col items-start">
                        <div class="flex items-center gap-2 mb-1">
                            <span class="text-xs font-bold ${isAI ? 'text-blue-400' : 'text-zinc-300'}">${msg.name} ${isAI ? '<i class="fas fa-certificate text-[10px] text-blue-500 ml-0.5"></i>' : ''}</span>
                            <span class="text-[10px] text-zinc-500">${timeString}</span>
                        </div>
                        <div class="${isAI ? 'bg-zinc-800/80 border border-blue-500/30' : 'bg-zinc-800'} text-zinc-100 px-4 py-2 rounded-2xl rounded-tl-sm shadow-md leading-relaxed text-sm break-words w-full">
                            ${contentHtml}
                        </div>
                    </div>
                </div>
            `;
        }

        chatMessages.appendChild(div);
        
        // Auto scroll down smoothly
        if (isInitialLoad) {
            chatMessages.scrollTop = chatMessages.scrollHeight;
            setTimeout(() => isInitialLoad = false, 1000);
        } else {
            chatMessages.scrollTo({
                top: chatMessages.scrollHeight,
                behavior: 'smooth'
            });
        }
    }

    function parseLinksAndVideo(text) {
        // Escape HTML
        let safeText = text.replace(/</g, "&lt;").replace(/>/g, "&gt;");
        
        // Check for Jtube video links first
        const watchLinkRegex = /watch\.html\?id=([a-zA-Z0-9_-]+)/g;
        let hasVideoLink = false;
        
        safeText = safeText.replace(watchLinkRegex, (match, id) => {
            const video = allVideos.find(v => v.id === id);
            if (video) {
                hasVideoLink = true;
                return `
                    <a href="watch.html?id=${video.id}" class="block mt-2 mb-1 bg-zinc-900 border border-zinc-700/80 rounded-xl overflow-hidden hover:border-zinc-500 transition max-w-sm group no-underline text-current">
                        <div class="aspect-video relative overflow-hidden">
                            <img src="${video.thumbnail}" class="w-full h-full object-cover group-hover:scale-105 transition duration-300">
                            <div class="absolute inset-0 bg-black/10 group-hover:bg-black/30 transition flex items-center justify-center">
                                <i class="fas fa-play text-white text-3xl opacity-0 group-hover:opacity-100 transition drop-shadow-lg"></i>
                            </div>
                            <span class="absolute bottom-2 right-2 bg-black/80 px-1.5 py-0.5 rounded text-[10px] font-semibold">${video.duration}</span>
                        </div>
                        <div class="p-3">
                            <h4 class="text-sm font-bold line-clamp-2 leading-snug group-hover:text-blue-400 transition">${video.title}</h4>
                            <p class="text-xs text-zinc-400 mt-1 flex items-center gap-1">
                                ${video.channel} <i class="fas fa-check-circle text-[10px]"></i>
                            </p>
                        </div>
                    </a>
                `;
            }
            return `<a href="${match}" class="text-blue-400 hover:underline break-all">${match}</a>`;
        });

        // Convert standard URLs if they weren't matched as videos
        const urlRegex = /(https?:\/\/[^\s]+)(?![^<]*>|[^<>]*<\/)/g;
        safeText = safeText.replace(urlRegex, function(url) {
            return `<a href="${url}" target="_blank" class="text-blue-400 hover:underline break-all">${url}</a>`;
        });

        // Convert newlines to breaks for regular text parts
        // A bit tricky because we injected HTML blocks. Let's just do a simple replace that ignores HTML
        // Actually, we can just style the container with whitespace-pre-wrap
        
        return `<div class="whitespace-pre-wrap font-sans">${safeText}</div>`;
    }
});
