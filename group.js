/**
 * JTubeGroup — Real-time Community Chat
 * Uses Firebase Realtime Database for instant messaging,
 * Firestore for user profiles, and JAsk AI for bot responses.
 */
document.addEventListener("DOMContentLoaded", () => {
    // ===== DOM REFERENCES =====
    const authWarning = document.getElementById("auth-warning");
    const loadingState = document.getElementById("loading-state");
    const chatContainer = document.getElementById("chat-container");
    const chatMessages = document.getElementById("chat-messages");
    const chatForm = document.getElementById("chat-form");
    const chatInput = document.getElementById("chat-input");
    const sendBtn = document.getElementById("send-btn");
    const aiTyping = document.getElementById("ai-typing");
    const membersToggle = document.getElementById("members-toggle");
    const membersDrawer = document.getElementById("members-drawer");
    const closeMembers = document.getElementById("close-members");
    const membersList = document.getElementById("members-list");
    const headerAvatars = document.getElementById("header-avatars");
    const headerMemberCount = document.getElementById("header-member-count");
    const subtitleMemberCount = document.getElementById("subtitle-member-count");

    let allVideos = [];
    let isInitialLoad = true;
    let chatInitialized = false;
    let chatListenerRef = null;
    let allUsers = [{ name: 'Jaks AI', isAI: true, email: 'bot@jtube.com' }];

    const mentionDropdown = document.getElementById("mention-dropdown");
    const scrollBottomBtn = document.getElementById("scroll-bottom-btn");

    if (chatMessages && scrollBottomBtn) {
        chatMessages.addEventListener('scroll', () => {
            const distFromBottom = chatMessages.scrollHeight - chatMessages.scrollTop - chatMessages.clientHeight;
            if (distFromBottom > 200) {
                scrollBottomBtn.classList.remove('hidden');
            } else {
                scrollBottomBtn.classList.add('hidden');
            }
        });
        scrollBottomBtn.addEventListener('click', () => {
            chatMessages.scrollTo({ top: chatMessages.scrollHeight, behavior: 'smooth' });
        });
    }

    // ===== TEXTAREA AUTO-RESIZE =====
    if (chatInput) {
        chatInput.addEventListener('input', function () {
            this.style.height = 'auto';
            this.style.height = Math.min(this.scrollHeight, 112) + 'px';
            sendBtn.disabled = this.value.trim().length === 0;

            // Mention logic
            const cursorPosition = this.selectionStart;
            const textBeforeCursor = this.value.substring(0, cursorPosition);
            const match = textBeforeCursor.match(/@(\w*)$/);
            
            if (match && mentionDropdown) {
                const query = match[1].toLowerCase();
                const filteredUsers = allUsers.filter(u => {
                    const name = (u.name || u.displayName || 'User');
                    const normalized = name.replace(/\s+/g, '');
                    return normalized.toLowerCase().startsWith(query);
                });
                
                if (filteredUsers.length > 0) {
                    mentionDropdown.innerHTML = filteredUsers.slice(0, 8).map(u => {
                        const name = u.name || u.displayName || 'User';
                        return `<div class="px-4 py-2 hover:bg-zinc-700 cursor-pointer text-sm mention-item flex items-center" data-name="${name.replace(/\s+/g, '')}">${u.isAI ? '<i class="fas fa-robot text-indigo-400 mr-2 text-xs"></i>' : '<i class="fas fa-user text-zinc-400 mr-2 text-xs"></i>'}<span>${name}</span></div>`;
                    }).join('');
                    mentionDropdown.classList.remove('hidden');
                    mentionDropdown.classList.add('flex');
                } else {
                    mentionDropdown.classList.add('hidden');
                    mentionDropdown.classList.remove('flex');
                }
            } else if (mentionDropdown) {
                mentionDropdown.classList.add('hidden');
                mentionDropdown.classList.remove('flex');
            }
        });

        if (mentionDropdown) {
            mentionDropdown.addEventListener('click', (e) => {
                const item = e.target.closest('.mention-item');
                if (item) {
                    const name = item.dataset.name;
                    const cursorPosition = chatInput.selectionStart;
                    const textBeforeCursor = chatInput.value.substring(0, cursorPosition);
                    const textAfterCursor = chatInput.value.substring(cursorPosition);
                    const newTextBefore = textBeforeCursor.replace(/@\w*$/, `@${name} `);
                    chatInput.value = newTextBefore + textAfterCursor;
                    mentionDropdown.classList.add('hidden');
                    mentionDropdown.classList.remove('flex');
                    chatInput.focus();
                    chatInput.dispatchEvent(new Event('input'));
                }
            });
        }

        chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (chatInput.value.trim()) {
                    chatForm.dispatchEvent(new Event('submit'));
                }
            }
        });
    }

    // ===== MEMBERS DRAWER TOGGLE =====
    if (membersToggle) {
        membersToggle.addEventListener('click', () => {
            membersDrawer.classList.toggle('hidden-drawer');
        });
    }
    if (closeMembers) {
        closeMembers.addEventListener('click', () => {
            membersDrawer.classList.add('hidden-drawer');
        });
    }

    // ===== AUTH STATE HANDLING =====
    // Use Firebase's onAuthStateChanged directly — it's the most reliable approach.
    // The `auth` global is defined in data.js (which loads before this script).
    auth.onAuthStateChanged(async (user) => {
        if (loadingState) loadingState.classList.add('hidden');

        if (user) {
            // === LOGGED IN ===
            if (authWarning) authWarning.classList.add('hidden');
            chatContainer.classList.remove('hidden');
            chatContainer.classList.add('flex');

            // Load videos for link previews (non-blocking)
            try { allVideos = await getVideos(); } catch (e) { /* silent */ }

            if (!chatInitialized) {
                initChat(user);
                chatInitialized = true;
            }
        } else {
            // === NOT LOGGED IN ===
            chatContainer.classList.add('hidden');
            chatContainer.classList.remove('flex');
            if (authWarning) {
                authWarning.classList.remove('hidden');
                authWarning.classList.add('flex');
            }
        }
    });

    // ===== INIT CHAT =====
    function initChat(user) {
        // Firebase Firestore reference
        const chatRef = db.collection('jtube_group_chat');

        // Listen for last 80 messages
        chatListenerRef = chatRef.orderBy('timestamp').limitToLast(80);
        chatListenerRef.onSnapshot((snapshot) => {
            snapshot.docChanges().forEach((change) => {
                if (change.type === 'added') {
                    const msg = change.doc.data();
                    msg._id = change.doc.id;
                    renderMessage(msg, user);
                } else if (change.type === 'modified') {
                    const msg = change.doc.data();
                    const msgElement = document.getElementById(`msg-${change.doc.id}`);
                    if (msgElement) {
                        const scoreSpan = msgElement.querySelector('.react-msg-btn span');
                        const reactBtn = msgElement.querySelector('.react-msg-btn');
                        if (scoreSpan && reactBtn) {
                            scoreSpan.textContent = msg.score > 0 ? msg.score : '';
                            if (msg.score > 0) {
                                reactBtn.classList.remove('opacity-0', 'group-hover:opacity-100');
                            }
                        }
                    }
                } else if (change.type === 'removed') {
                    const msgId = change.doc.id;
                    const msgElement = document.getElementById(`msg-${msgId}`);
                    if (msgElement) msgElement.remove();
                }
            });
        });

        if (chatMessages) {
            chatMessages.addEventListener('click', async (e) => {
                const deleteBtn = e.target.closest('.delete-msg-btn');
                if (deleteBtn) {
                    const msgId = deleteBtn.dataset.id;
                    if (confirm("Are you sure you want to delete this message?")) {
                        try {
                            await chatRef.doc(msgId).delete();
                        } catch (err) {
                            console.error("Error deleting message:", err);
                        }
                    }
                }
                
                const reactBtn = e.target.closest('.react-msg-btn');
                if (reactBtn) {
                    const msgId = reactBtn.dataset.id;
                    try {
                        await chatRef.doc(msgId).update({
                            score: firebase.firestore.FieldValue.increment(1)
                        });
                    } catch (err) {
                        console.error("Error reacting to message:", err);
                    }
                }
            });
        }

        // Handle form submit
        chatForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const text = chatInput.value.trim();
            if (!text || text.length > 2000) return;

            // Anti-spam: prevent rapid fire
            if (sendBtn.dataset.cooldown === '1') return;
            sendBtn.dataset.cooldown = '1';
            setTimeout(() => { sendBtn.dataset.cooldown = '0'; }, 1500);

            // Reset input
            chatInput.value = '';
            chatInput.style.height = 'auto';
            sendBtn.disabled = true;

            // Build message payload
            const msgData = {
                uid: user.uid,
                name: user.displayName || user.email.split('@')[0],
                email: user.email,
                avatarUrl: user.photoURL || null,
                text: text,
                timestamp: Date.now() // Use client timestamp for immediate sorting
            };

            // Try to get richer avatar from Firestore profile
            try {
                if (typeof getUserProfile === 'function') {
                    const profile = await getUserProfile(user.uid);
                    if (profile) {
                        if (profile.avatarUrl) msgData.avatarUrl = profile.avatarUrl;
                        if (profile.name) msgData.name = profile.name;
                    }
                }
            } catch (err) { /* silent */ }

            // Push to Firebase
            try {
                await chatRef.add(msgData);
            } catch (err) {
                console.error("Failed to send message:", err);
                if (typeof showToast === 'function') showToast("Failed to send message", "error");
                return;
            }

            // ===== JAKS AI TRIGGER =====
            const lowerText = text.toLowerCase();
            if (lowerText.includes('@jaksai') || lowerText.startsWith('/ask')) {
                aiTyping.classList.remove('hidden');
                chatMessages.scrollTo({ top: chatMessages.scrollHeight, behavior: 'smooth' });

                try {
                    const query = text.replace(/@jaksai|\/ask/gi, '').trim() || "Hello!";
                    const dummyContext = {
                        title: 'JTubeGroup Community Chat',
                        channel: 'Community',
                        category: 'General',
                        description: 'JTube community group chat. You can recommend videos by including [Title](watch.html?id=ID) in your message. Available videos: ' + allVideos.slice(0, 30).map(v => `${v.title} (id=${v.id})`).join('; ')
                    };

                    const aiResponse = await JAsk.askGroq(query, dummyContext);

                    const aiMsgData = {
                        uid: 'jaks_ai_bot',
                        name: 'Jaks AI',
                        isAI: true,
                        avatarUrl: null,
                        text: aiResponse.text || "I couldn't process that. Try again!",
                        timestamp: Date.now() + 1 // Add 1ms to ensure AI message appears after user message
                    };

                    await chatRef.add(aiMsgData);
                } catch (err) {
                    console.error("Jaks AI Error:", err);
                    // Push an error message from the bot
                    await chatRef.add({
                        uid: 'jaks_ai_bot',
                        name: 'Jaks AI',
                        isAI: true,
                        text: "⚠️ Sorry, I'm having trouble right now. Please try again!",
                        timestamp: Date.now() + 1
                    });
                } finally {
                    aiTyping.classList.add('hidden');
                }
            }
        });

        // Load members
        loadGroupMembers();
    }

    // ===== RENDER A SINGLE MESSAGE =====
    function renderMessage(msg, currentUser) {
        const isMe = msg.uid === currentUser.uid;
        const isAI = msg.isAI === true;

        if (isAI) {
            const now = Date.now();
            const timeToLive = (msg.timestamp + 60000) - now;
            if (timeToLive > 0) {
                setTimeout(() => {
                    db.collection('jtube_group_chat').doc(msg._id).delete().catch(() => {});
                }, timeToLive);
            } else {
                db.collection('jtube_group_chat').doc(msg._id).delete().catch(() => {});
                return; // Already expired, do not render
            }
        }

        const wrapper = document.createElement('div');
        wrapper.className = `flex ${isMe ? 'justify-end' : 'justify-start'} msg-enter`;
        wrapper.id = `msg-${msg._id}`;

        // Avatar
        let avatarHtml = '';
        if (isAI) {
            avatarHtml = `<div class="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center flex-shrink-0 shadow-lg shadow-indigo-500/20 ring-2 ring-indigo-500/30"><i class="fas fa-robot text-white text-[10px]"></i></div>`;
        } else if (msg.avatarUrl) {
            avatarHtml = `<img src="${msg.avatarUrl}" class="w-8 h-8 rounded-full object-cover flex-shrink-0 ring-2 ring-zinc-800" loading="lazy">`;
        } else {
            const initial = (msg.name || 'U').charAt(0).toUpperCase();
            const colors = ['bg-purple-600','bg-emerald-600','bg-rose-600','bg-amber-600','bg-cyan-600','bg-pink-600'];
            const colorIdx = (msg.name || '').length % colors.length;
            avatarHtml = `<div class="w-8 h-8 rounded-full ${colors[colorIdx]} flex items-center justify-center text-[11px] font-bold flex-shrink-0 ring-2 ring-zinc-800">${initial}</div>`;
        }

        const ts = msg.timestamp ? new Date(msg.timestamp) : new Date();
        const timeStr = ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        const score = msg.score || 0;

        // Parse message text
        const contentHtml = parseMessageContent(msg.text || '');

        if (isMe) {
            // === MY MESSAGE (right aligned, blue bubble) ===
            wrapper.innerHTML = `
                <div class="flex flex-col items-end max-w-[85%] sm:max-w-[70%] group relative">
                    <button class="delete-msg-btn absolute -left-8 top-1 opacity-0 group-hover:opacity-100 transition-opacity text-zinc-500 hover:text-red-400 p-1" data-id="${msg._id}" title="Delete Message">
                        <i class="fas fa-trash-alt text-[10px]"></i>
                    </button>
                    <div class="flex items-end gap-2">
                        <span class="text-[9px] text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity mb-1 select-none">${timeStr}</span>
                        <div class="relative bg-indigo-600 text-white px-3.5 py-2 rounded-2xl rounded-br-md shadow-md text-[13px] leading-relaxed break-words min-w-[40px]">
                            ${contentHtml}
                            <div class="absolute -bottom-2 -left-2 bg-zinc-800 border border-zinc-700 text-xs px-1.5 py-0.5 rounded-full flex items-center gap-1 shadow-sm cursor-pointer react-msg-btn transition hover:bg-zinc-700 ${score > 0 ? '' : 'opacity-0 group-hover:opacity-100'}" data-id="${msg._id}">
                                <i class="fas fa-heart text-red-500 text-[9px]"></i> <span class="text-[9px] text-zinc-300 font-bold">${score > 0 ? score : ''}</span>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        } else {
            // === OTHER / AI MESSAGE (left aligned) ===
            const nameBadge = isAI
                ? `<span class="text-[11px] font-bold text-indigo-400">${msg.name}</span><span class="bg-indigo-500/20 text-indigo-400 text-[8px] px-1.5 py-0.5 rounded font-black uppercase ml-1">AI</span>`
                : `<span class="text-[11px] font-bold text-zinc-400">${msg.name || 'Anonymous'}</span>`;

            const bubbleClass = isAI
                ? 'bg-zinc-900 border border-indigo-500/20 shadow-lg shadow-indigo-500/5'
                : 'bg-zinc-800/80';

            wrapper.innerHTML = `
                <div class="flex gap-2.5 max-w-[85%] sm:max-w-[70%] group">
                    ${avatarHtml}
                    <div class="flex flex-col items-start min-w-0">
                        <div class="flex items-center gap-2 mb-0.5 ml-1">
                            ${nameBadge}
                            <span class="text-[9px] text-zinc-600">${timeStr}</span>
                        </div>
                        <div class="relative ${bubbleClass} text-zinc-200 px-3.5 py-2 rounded-2xl rounded-bl-md shadow-sm text-[13px] leading-relaxed break-words min-w-[40px]">
                            ${contentHtml}
                            <div class="absolute -bottom-2 -right-2 bg-zinc-800 border border-zinc-700 text-xs px-1.5 py-0.5 rounded-full flex items-center gap-1 shadow-sm cursor-pointer react-msg-btn transition hover:bg-zinc-700 ${score > 0 ? '' : 'opacity-0 group-hover:opacity-100'}" data-id="${msg._id}">
                                <i class="fas fa-heart text-red-500 text-[9px]"></i> <span class="text-[9px] text-zinc-300 font-bold">${score > 0 ? score : ''}</span>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }

        chatMessages.appendChild(wrapper);

        // Auto-scroll
        if (isInitialLoad) {
            chatMessages.scrollTop = chatMessages.scrollHeight;
            setTimeout(() => { isInitialLoad = false; }, 1500);
        } else {
            // Only auto-scroll if user is near the bottom
            const distFromBottom = chatMessages.scrollHeight - chatMessages.scrollTop - chatMessages.clientHeight;
            if (distFromBottom < 200 || isMe) {
                chatMessages.scrollTo({ top: chatMessages.scrollHeight, behavior: 'smooth' });
            }
        }
    }

    // ===== PARSE MESSAGE CONTENT =====
    function parseMessageContent(text) {
        // 1. Escape HTML
        let safe = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

        // 2. JTube video link previews
        const watchRegex = /(?:https?:\/\/[^\s<]+)?watch\.html\?id=([a-zA-Z0-9_-]+)/g;
        safe = safe.replace(watchRegex, (match, id) => {
            const video = allVideos.find(v => v.id === id);
            if (video) {
                return `<a href="watch.html?id=${video.id}" class="chat-video-preview block mt-2 mb-1 bg-zinc-950 border border-zinc-700/60 rounded-xl overflow-hidden hover:border-indigo-500/40 transition max-w-xs no-underline text-current cursor-pointer">
                    <div class="aspect-video relative overflow-hidden">
                        <img src="${video.thumbnail}" class="w-full h-full object-cover" loading="lazy">
                        <div class="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent"></div>
                        <div class="absolute bottom-2 right-2 bg-black/80 px-1.5 py-0.5 rounded text-[10px] font-bold">${video.duration || ''}</div>
                        <div class="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition bg-black/20">
                            <div class="w-10 h-10 bg-white/90 rounded-full flex items-center justify-center"><i class="fas fa-play text-black text-sm ml-0.5"></i></div>
                        </div>
                    </div>
                    <div class="p-2.5">
                        <h4 class="text-xs font-bold line-clamp-2 leading-snug text-white">${video.title}</h4>
                        <p class="text-[10px] text-zinc-500 mt-1 flex items-center gap-1">${video.channel} <img src="img/icons.svg" class="w-3 h-3"></p>
                    </div>
                </a>`;
            }
            return `<a href="${match}" class="text-indigo-400 hover:underline break-all">${match}</a>`;
        });

        // 3. Standard URLs
        const urlRegex = /(https?:\/\/[^\s<]+)/g;
        safe = safe.replace(urlRegex, (url) => {
            // Don't double-wrap URLs already inside an href
            if (safe.indexOf(`href="${url}"`) !== -1) return url;
            return `<a href="${url}" target="_blank" rel="noopener" class="text-indigo-400 hover:underline break-all">${url}</a>`;
        });

        // 4. @JaksAI mention highlight
        safe = safe.replace(/@Jaks\s?AI/gi, '<span class="text-indigo-400 font-bold">@Jaks AI</span>');

        // Other users highlight (@Username)
        safe = safe.replace(/@([a-zA-Z0-9_]+)/g, (match, username) => {
            if (match.toLowerCase() === '@jaksai') return match; // already handled
            return `<span class="text-indigo-300 font-semibold cursor-pointer hover:underline">${match}</span>`;
        });

        // 5. /ask command highlight
        safe = safe.replace(/^\/ask/gm, '<span class="text-indigo-400 font-mono font-bold">/ask</span>');

        return `<div class="whitespace-pre-wrap">${safe}</div>`;
    }

    // ===== LOAD GROUP MEMBERS =====
    async function loadGroupMembers() {
        try {
            if (typeof db === 'undefined') return;

            const snapshot = await db.collection("users").get();
            const users = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                data._id = doc.id;
                users.push(data);
                allUsers.push(data);
            });

            const totalCount = users.length + 1; // +1 for Jaks AI bot

            // Update counts
            if (headerMemberCount) headerMemberCount.textContent = `${totalCount}`;
            if (subtitleMemberCount) subtitleMemberCount.textContent = `${totalCount} members`;

            // Build header avatars (max 5)
            if (headerAvatars) {
                let html = '';
                users.slice(0, 5).forEach(u => {
                    const name = u.name || u.displayName || u.email || 'User';
                    if (u.avatarUrl) {
                        html += `<img src="${u.avatarUrl}" class="w-7 h-7 rounded-full border-2 border-zinc-900 object-cover" title="${name}" loading="lazy">`;
                    } else {
                        const initial = name.charAt(0).toUpperCase();
                        html += `<div class="w-7 h-7 rounded-full bg-purple-600 border-2 border-zinc-900 flex items-center justify-center text-[9px] font-bold" title="${name}">${initial}</div>`;
                    }
                });
                if (users.length > 5) {
                    html += `<div class="w-7 h-7 rounded-full bg-zinc-800 border-2 border-zinc-900 flex items-center justify-center text-[9px] font-bold text-zinc-400">+${users.length - 5}</div>`;
                }
                headerAvatars.innerHTML = html;
            }

            // Build members list in drawer
            if (membersList) {
                let html = '';
                users.forEach(u => {
                    const name = u.name || u.displayName || u.email || 'User';
                    const email = u.email || '';
                    const avatarInner = u.avatarUrl
                        ? `<img src="${u.avatarUrl}" class="w-9 h-9 rounded-full object-cover" loading="lazy">`
                        : `<div class="w-9 h-9 rounded-full bg-purple-600 flex items-center justify-center text-xs font-bold">${name.charAt(0).toUpperCase()}</div>`;

                    html += `
                        <div class="flex items-center gap-3 p-2 rounded-xl hover:bg-zinc-800/50 transition cursor-default">
                            <div class="relative flex-shrink-0">
                                ${avatarInner}
                            </div>
                            <div class="min-w-0">
                                <p class="text-xs font-semibold text-zinc-200 truncate">${name}</p>
                                <p class="text-[10px] text-zinc-600 truncate">${email}</p>
                            </div>
                        </div>
                    `;
                });

                if (users.length === 0) {
                    html = '<p class="text-center text-xs text-zinc-600 py-8">No members yet.</p>';
                }

                membersList.innerHTML = html;
            }

        } catch (e) {
            console.error("Error loading group members:", e);
            if (membersList) membersList.innerHTML = '<p class="text-center text-xs text-zinc-500 py-8">Could not load members.</p>';
        }
    }
});
