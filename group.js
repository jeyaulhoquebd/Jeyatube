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

    function scrollToBottom(smooth = true) {
        if (!chatMessages) return;
        const bottomAnchor = document.getElementById("chat-bottom-anchor");
        if (bottomAnchor) {
            bottomAnchor.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'end' });
        } else {
            chatMessages.scrollTo({
                top: chatMessages.scrollHeight + 1500,
                behavior: smooth ? 'smooth' : 'auto'
            });
        }
    }

    if (chatMessages && scrollBottomBtn) {
        chatMessages.addEventListener('scroll', () => {
            const distFromBottom = chatMessages.scrollHeight - chatMessages.scrollTop - chatMessages.clientHeight;
            if (distFromBottom > 160) {
                scrollBottomBtn.classList.remove('hidden');
            } else {
                scrollBottomBtn.classList.add('hidden');
            }
        });
        scrollBottomBtn.addEventListener('click', () => {
            scrollToBottom(true);
            scrollBottomBtn.classList.add('hidden');
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

    const groupGoogleAuthBtn = document.getElementById("group-google-auth-btn");
    if (groupGoogleAuthBtn) {
        groupGoogleAuthBtn.addEventListener("click", async () => {
            try {
                groupGoogleAuthBtn.disabled = true;
                groupGoogleAuthBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Connecting...';
                await loginWithGoogle(); // from data.js
            } catch (err) {
                console.error(err);
                groupGoogleAuthBtn.disabled = false;
                groupGoogleAuthBtn.innerHTML = '<i class="fab fa-google"></i> Sign In to Join';
            }
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
            let hasAdded = false;
            snapshot.docChanges().forEach((change) => {
                if (change.type === 'added') {
                    hasAdded = true;
                    const msg = change.doc.data();
                    msg._id = change.doc.id;

                    // AI Shield Moderation Check: auto-delete abusive messages immediately from group chat
                    if (typeof AIModeration !== 'undefined' && AIModeration.isAbusive(msg.text)) {
                        console.warn("AI Shield: Deleting abusive message from group chat:", msg._id);
                        chatRef.doc(msg._id).delete().catch(e => console.error("Auto-delete error:", e));
                        return; // Purged - do not render!
                    }

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
                    // Only remove if it was actually deleted from DB
                    chatRef.doc(msgId).get().then(doc => {
                        if (!doc.exists && msgElement) {
                            msgElement.remove();
                        }
                    });
                }
            });

            if (hasAdded && isInitialLoad) {
                requestAnimationFrame(() => {
                    scrollToBottom(false);
                    setTimeout(() => scrollToBottom(false), 120);
                    setTimeout(() => { scrollToBottom(false); isInitialLoad = false; }, 600);
                });
            }
        });

        if (chatMessages) {
            chatMessages.addEventListener('click', async (e) => {
                // Delete button handler
                const deleteBtn = e.target.closest('.delete-msg-btn');
                if (deleteBtn) {
                    const msgId = deleteBtn.dataset.id;
                    if (confirm("Are you sure you want to delete this message?")) {
                        try {
                            await chatRef.doc(msgId).delete();
                            if (typeof showToast === 'function') {
                                showToast("Message deleted", "info");
                            }
                        } catch (err) {
                            console.error("Error deleting message:", err);
                        }
                    }
                    return;
                }
                
                // Reaction (Heart) button handler
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
                    return;
                }

                // Reply / Mention button handler
                const replyBtn = e.target.closest('.reply-msg-btn');
                if (replyBtn) {
                    const authorName = replyBtn.dataset.name || '';
                    if (chatInput && authorName) {
                        const mentionTag = `@${authorName} `;
                        if (!chatInput.value.includes(mentionTag)) {
                            chatInput.value = mentionTag + chatInput.value;
                        }
                        chatInput.focus();
                        chatInput.dispatchEvent(new Event('input'));
                    }
                    return;
                }

                // Copy message text button handler
                const copyBtn = e.target.closest('.copy-msg-btn');
                if (copyBtn) {
                    const card = copyBtn.closest('.msg-card');
                    const textEl = card ? card.querySelector('.msg-text-content') : null;
                    if (textEl) {
                        const rawText = textEl.innerText.trim();
                        navigator.clipboard.writeText(rawText).then(() => {
                            if (typeof showToast === 'function') {
                                showToast("Message copied to clipboard!", "success");
                            }
                        }).catch(() => {
                            if (typeof showToast === 'function') {
                                showToast("Could not copy message", "error");
                            }
                        });
                    }
                    return;
                }
            });
        }

        // Handle form submit
        chatForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const text = chatInput.value.trim();
            if (!text || text.length > 2000) return;

            // AI Shield Auto-Moderation Check (deletes abusive messages immediately)
            if (typeof AIModeration !== 'undefined' && AIModeration.isAbusive(text)) {
                chatInput.value = '';
                chatInput.style.height = 'auto';
                sendBtn.disabled = true;
                if (typeof showToast === 'function') {
                    showToast("⚠️ Message deleted by AI Shield: Abusive and offensive language is strictly forbidden in JtubeGroup.", "error");
                }
                return;
            }

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
                scrollToBottom(true);

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

    // ===== RENDER A SINGLE MESSAGE (MODERN CARD-BASED DESIGN) =====
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
        wrapper.className = `w-full flex ${isMe ? 'justify-end' : 'justify-start'} msg-card-enter my-1.5`;
        wrapper.id = `msg-${msg._id}`;

        const isAdmin = (msg.email && msg.email.toLowerCase() === 'jeyaulhoquejaber@gmail.com');
        const adminBadge = isAdmin
            ? `<span class="bg-red-500/20 border border-red-500/30 text-red-400 text-[8px] px-1.5 py-0.5 rounded font-black uppercase tracking-wider" title="Admin">Admin</span>` 
            : '';

        const ts = msg.timestamp ? new Date(msg.timestamp) : new Date();
        const timeStr = ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const score = msg.score || 0;
        const contentHtml = parseMessageContent(msg.text || '');

        if (isMe) {
            // ==========================================
            // CURRENT USER CARD (ELEVATED INDIGO CARD)
            // ==========================================
            wrapper.innerHTML = `
                <div class="msg-card group relative flex flex-col max-w-[92%] sm:max-w-[76%] bg-gradient-to-br from-indigo-950/40 via-zinc-900/90 to-zinc-900/95 border border-indigo-500/30 hover:border-indigo-500/60 rounded-2xl p-3 sm:p-3.5 shadow-md hover:shadow-indigo-500/10 transition-all duration-200">
                    <!-- Card Header Bar -->
                    <div class="flex items-center justify-between gap-2 mb-1.5 pb-1 border-b border-zinc-800/60 text-xs">
                        <div class="flex items-center gap-1.5 min-w-0">
                            <span class="font-bold text-xs text-indigo-300">You</span>
                            ${adminBadge}
                            <span class="text-[10px] text-zinc-500 font-mono">${timeStr}</span>
                        </div>
                        
                        <!-- Hover Action Bar -->
                        <div class="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                            <button type="button" class="react-msg-btn flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-zinc-800/80 hover:bg-zinc-700/80 border border-zinc-700/50 hover:border-red-500/40 text-zinc-300 transition-all active:scale-95 cursor-pointer" data-id="${msg._id}" title="Like message">
                                <i class="fas fa-heart text-red-400 text-[9px]"></i>
                                <span class="font-bold text-[10px] text-zinc-200 font-mono">${score > 0 ? score : ''}</span>
                            </button>
                            <button type="button" class="copy-msg-btn text-zinc-400 hover:text-white p-1 rounded-lg hover:bg-zinc-800 transition" title="Copy text">
                                <i class="far fa-copy text-[11px]"></i>
                            </button>
                            <button type="button" class="delete-msg-btn text-zinc-500 hover:text-red-400 p-1 rounded-lg hover:bg-zinc-800 transition" data-id="${msg._id}" title="Delete message">
                                <i class="far fa-trash-alt text-[11px]"></i>
                            </button>
                        </div>
                    </div>

                    <!-- Card Body -->
                    <div class="msg-text-content text-[13.5px] leading-relaxed text-zinc-100 break-words select-text font-normal">
                        ${contentHtml}
                    </div>
                </div>
            `;
        } else if (isAI) {
            // ==========================================
            // JAKS AI ASSISTANT CARD (GLOWING AI SYSTEM CARD)
            // ==========================================
            wrapper.innerHTML = `
                <div class="msg-card group relative flex flex-col max-w-[94%] sm:max-w-[80%] bg-gradient-to-br from-indigo-950/45 via-zinc-900/95 to-purple-950/30 border border-indigo-500/40 hover:border-indigo-500/65 rounded-2xl p-3.5 sm:p-4 shadow-xl shadow-indigo-950/20 transition-all duration-200">
                    <!-- Card Header Bar -->
                    <div class="flex items-center justify-between gap-2 mb-2 pb-1.5 border-b border-indigo-500/20 text-xs">
                        <div class="flex items-center gap-2 min-w-0">
                            <div class="w-6 h-6 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center flex-shrink-0 shadow-sm ring-1 ring-indigo-400/40">
                                <i class="fas fa-robot text-white text-[10px]"></i>
                            </div>
                            <div class="flex items-center gap-1.5">
                                <span class="font-bold text-xs text-indigo-300">Jaks AI</span>
                                <span class="bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 text-[8px] px-1.5 py-0.5 rounded font-black uppercase">Assistant</span>
                            </div>
                            <span class="text-[10px] text-zinc-500 font-mono">${timeStr}</span>
                            <span class="hidden sm:inline-flex items-center gap-1 text-[9px] text-amber-400/90 bg-amber-500/10 px-1.5 py-0.5 rounded font-mono">
                                <i class="far fa-clock text-[8px]"></i> 60s temp
                            </span>
                        </div>

                        <!-- Action Bar -->
                        <div class="flex items-center gap-1">
                            <button type="button" class="react-msg-btn flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-zinc-800/80 hover:bg-zinc-700/80 border border-zinc-700/50 hover:border-red-500/40 text-zinc-300 transition-all active:scale-95 cursor-pointer" data-id="${msg._id}" title="Helpful response">
                                <i class="fas fa-heart text-red-400 text-[9px]"></i>
                                <span class="font-bold text-[10px] text-zinc-200 font-mono">${score > 0 ? score : ''}</span>
                            </button>
                            <button type="button" class="copy-msg-btn text-zinc-400 hover:text-white p-1 rounded-lg hover:bg-zinc-800 transition" title="Copy answer">
                                <i class="far fa-copy text-[11px]"></i>
                            </button>
                        </div>
                    </div>

                    <!-- Card Body -->
                    <div class="msg-text-content text-[13.5px] leading-relaxed text-zinc-200 break-words select-text font-normal">
                        ${contentHtml}
                    </div>
                </div>
            `;
        } else {
            // ==========================================
            // OTHER MEMBER CARD (POLISHED COMMUNITY CARD)
            // ==========================================
            let avatarHtml = '';
            if (msg.avatarUrl) {
                avatarHtml = `<img src="${msg.avatarUrl}" class="w-6 h-6 rounded-full object-cover ring-1 ring-zinc-700" loading="lazy">`;
            } else {
                const initial = (msg.name || 'U').charAt(0).toUpperCase();
                const colors = ['bg-purple-600','bg-emerald-600','bg-rose-600','bg-amber-600','bg-cyan-600','bg-pink-600'];
                const colorIdx = (msg.name || '').length % colors.length;
                avatarHtml = `<div class="w-6 h-6 rounded-full ${colors[colorIdx]} flex items-center justify-center text-[10px] font-bold text-white">${initial}</div>`;
            }

            wrapper.innerHTML = `
                <div class="msg-card group relative flex flex-col max-w-[92%] sm:max-w-[76%] bg-zinc-900/85 hover:bg-zinc-900 border border-zinc-800/85 hover:border-zinc-700/90 rounded-2xl p-3 sm:p-3.5 shadow-md transition-all duration-200">
                    <!-- Card Header Bar -->
                    <div class="flex items-center justify-between gap-2 mb-1.5 pb-1 border-b border-zinc-800/60 text-xs">
                        <div class="flex items-center gap-1.5 min-w-0">
                            <a href="profile.html?user=${encodeURIComponent(msg.email || '')}" class="flex items-center gap-1.5 cursor-pointer hover:opacity-80 transition flex-shrink-0">
                                ${avatarHtml}
                                <span class="font-bold text-xs text-zinc-200 hover:text-white transition truncate">${msg.name || 'Anonymous'}</span>
                            </a>
                            ${adminBadge}
                            <span class="text-[10px] text-zinc-500 font-mono">${timeStr}</span>
                        </div>

                        <!-- Hover Action Bar -->
                        <div class="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                            <button type="button" class="reply-msg-btn text-zinc-400 hover:text-indigo-400 p-1 rounded-lg hover:bg-zinc-800 transition" data-name="${msg.name || 'Member'}" title="Reply to ${msg.name}">
                                <i class="fas fa-reply text-[11px]"></i>
                            </button>
                            <button type="button" class="react-msg-btn flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-zinc-800/80 hover:bg-zinc-700/80 border border-zinc-700/50 hover:border-red-500/40 text-zinc-300 transition-all active:scale-95 cursor-pointer" data-id="${msg._id}" title="Like message">
                                <i class="fas fa-heart text-red-400 text-[9px]"></i>
                                <span class="font-bold text-[10px] text-zinc-200 font-mono">${score > 0 ? score : ''}</span>
                            </button>
                            <button type="button" class="copy-msg-btn text-zinc-400 hover:text-white p-1 rounded-lg hover:bg-zinc-800 transition" title="Copy text">
                                <i class="far fa-copy text-[11px]"></i>
                            </button>
                            ${currentUser && currentUser.email && currentUser.email.toLowerCase() === 'jeyaulhoquejaber@gmail.com' ? `
                            <button type="button" class="delete-msg-btn text-zinc-500 hover:text-red-400 p-1 rounded-lg hover:bg-zinc-800 transition" data-id="${msg._id}" title="Admin Delete">
                                <i class="far fa-trash-alt text-[11px]"></i>
                            </button>` : ''}
                        </div>
                    </div>

                    <!-- Card Body -->
                    <div class="msg-text-content text-[13.5px] leading-relaxed text-zinc-200 break-words select-text font-normal">
                        ${contentHtml}
                    </div>
                </div>
            `;
        }

        const bottomAnchor = document.getElementById("chat-bottom-anchor");
        if (bottomAnchor && bottomAnchor.parentNode === chatMessages) {
            chatMessages.insertBefore(wrapper, bottomAnchor);
        } else {
            chatMessages.appendChild(wrapper);
        }

        // Auto-scroll logic
        if (isInitialLoad) {
            scrollToBottom(false);
        } else {
            const distFromBottom = chatMessages.scrollHeight - chatMessages.scrollTop - chatMessages.clientHeight;
            if (distFromBottom < 260 || isMe) {
                scrollToBottom(true);
            }
        }

        // Handle async image/thumbnail loads to avoid messages below being obscured or cut off
        const cardImgs = wrapper.querySelectorAll('img');
        cardImgs.forEach(img => {
            if (!img.complete) {
                img.addEventListener('load', () => {
                    const distFromBottom = chatMessages.scrollHeight - chatMessages.scrollTop - chatMessages.clientHeight;
                    if (distFromBottom < 320 || isMe || isInitialLoad) {
                        scrollToBottom(false);
                    }
                }, { once: true });
            }
        });
    }

    // ===== PARSE MESSAGE CONTENT (MODERN RICH EMBEDS) =====
    function parseMessageContent(text) {
        // 1. Escape HTML
        let safe = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

        // 2. JTube video link previews (Elevated Card Layout)
        const watchRegex = /(?:https?:\/\/[^\s<]+)?watch\.html\?id=([a-zA-Z0-9_-]+)/g;
        safe = safe.replace(watchRegex, (match, id) => {
            const video = allVideos.find(v => v.id === id);
            if (video) {
                return `
                <a href="watch.html?id=${video.id}" class="chat-video-preview block mt-2 bg-zinc-950/80 border border-zinc-800 hover:border-indigo-500/50 rounded-2xl overflow-hidden shadow-lg group/vcard transition-all duration-200 no-underline text-current cursor-pointer max-w-sm">
                    <div class="aspect-video w-full relative overflow-hidden bg-zinc-900 rounded-t-2xl" style="aspect-ratio: 16 / 9;">
                        <img src="${video.thumbnail}" class="w-full h-full object-cover group-hover/vcard:scale-105 transition-transform duration-300" loading="lazy">
                        <div class="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent"></div>
                        <div class="absolute bottom-2 right-2 bg-black/85 backdrop-blur-sm px-2 py-0.5 rounded-md text-[10px] font-mono font-bold text-white border border-white/10">
                            ${video.duration || 'Video'}
                        </div>
                        <div class="absolute inset-0 flex items-center justify-center opacity-0 group-hover/vcard:opacity-100 transition-opacity duration-200 bg-black/35">
                            <div class="w-11 h-11 bg-indigo-600 hover:bg-indigo-500 text-white rounded-full flex items-center justify-center shadow-xl transform group-hover/vcard:scale-110 transition-transform">
                                <i class="fas fa-play text-xs ml-0.5"></i>
                            </div>
                        </div>
                    </div>
                    <div class="p-3 bg-zinc-950/60">
                        <h4 class="text-xs font-bold line-clamp-2 leading-snug text-white group-hover/vcard:text-indigo-300 transition-colors">${video.title}</h4>
                        <div class="flex items-center justify-between mt-2 pt-2 border-t border-zinc-800/70 text-[11px]">
                            <span class="text-zinc-400 truncate flex items-center gap-1.5 font-medium">
                                <i class="fas fa-circle-check text-indigo-400 text-[10px]"></i> ${video.channel}
                            </span>
                            <span class="text-indigo-400 font-bold uppercase tracking-wider text-[10px] flex items-center gap-1">
                                Play <i class="fas fa-chevron-right text-[8px]"></i>
                            </span>
                        </div>
                    </div>
                </a>`;
            }
            return `<a href="${match}" class="text-indigo-400 hover:underline break-all font-mono text-xs">${match}</a>`;
        });

        // 3. Standard URLs
        const urlRegex = /(https?:\/\/[^\s<]+)/g;
        safe = safe.replace(urlRegex, (url) => {
            if (safe.indexOf(`href="${url}"`) !== -1) return url;
            return `<a href="${url}" target="_blank" rel="noopener" class="text-indigo-400 hover:underline break-all font-mono text-xs">${url}</a>`;
        });

        // 4. @JaksAI mention highlight pill
        safe = safe.replace(/@Jaks\s?AI/gi, '<span class="inline-flex items-center gap-1 bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-semibold px-2 py-0.5 rounded-md text-xs"><i class="fas fa-robot text-[10px]"></i> @Jaks AI</span>');

        // Other users highlight (@Username)
        safe = safe.replace(/@([a-zA-Z0-9_]+)/g, (match, username) => {
            if (match.toLowerCase() === '@jaksai') return match;
            return `<span class="text-indigo-300 font-semibold bg-indigo-500/10 px-1.5 py-0.5 rounded text-xs cursor-pointer hover:underline">${match}</span>`;
        });

        // 5. /ask command highlight
        safe = safe.replace(/^\/ask/gm, '<span class="text-indigo-400 font-mono font-bold bg-indigo-500/10 px-1.5 py-0.5 rounded">/ask</span>');

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
            if (subtitleMemberCount) subtitleMemberCount.textContent = `${totalCount} members active`;

            // Build header avatars (max 5)
            if (headerAvatars) {
                let html = '';
                users.slice(0, 5).forEach(u => {
                    const name = u.name || u.displayName || u.email || 'User';
                    if (u.avatarUrl) {
                        html += `<img src="${u.avatarUrl}" class="w-7 h-7 rounded-full border-2 border-zinc-950 object-cover ring-1 ring-zinc-800" title="${name}" loading="lazy">`;
                    } else {
                        const initial = name.charAt(0).toUpperCase();
                        html += `<div class="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-600 to-purple-600 border-2 border-zinc-950 flex items-center justify-center text-[9px] font-bold text-white shadow-sm" title="${name}">${initial}</div>`;
                    }
                });
                if (users.length > 5) {
                    html += `<div class="w-7 h-7 rounded-full bg-zinc-800 border-2 border-zinc-950 flex items-center justify-center text-[9px] font-bold text-zinc-300 shadow-sm">+${users.length - 5}</div>`;
                }
                headerAvatars.innerHTML = html;
            }

            // Build members list in drawer
            if (membersList) {
                renderDrawerMembers(users);
            }

            // Member Search Filter
            const memberSearchInput = document.getElementById("member-search-input");
            if (memberSearchInput) {
                memberSearchInput.addEventListener("input", () => {
                    const query = memberSearchInput.value.toLowerCase().trim();
                    const filtered = users.filter(u => {
                        const name = (u.name || u.displayName || u.email || '').toLowerCase();
                        const email = (u.email || '').toLowerCase();
                        return name.includes(query) || email.includes(query);
                    });
                    renderDrawerMembers(filtered);
                });
            }

        } catch (e) {
            console.error("Error loading group members:", e);
            if (membersList) membersList.innerHTML = '<p class="text-center text-xs text-zinc-500 py-8">Could not load members.</p>';
        }
    }

    // ===== RENDER DRAWER MEMBERS (CARD-BASED INTERFACE) =====
    function renderDrawerMembers(users) {
        if (!membersList) return;
        let html = '';
        users.forEach(u => {
            const name = u.name || u.displayName || u.email || 'User';
            const email = u.email || '';
            const avatarInner = u.avatarUrl
                ? `<img src="${u.avatarUrl}" class="w-9 h-9 rounded-xl object-cover ring-1 ring-zinc-800" loading="lazy">`
                : `<div class="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center text-xs font-bold text-white shadow-sm">${name.charAt(0).toUpperCase()}</div>`;

            const isAdmin = (email.toLowerCase() === 'jeyaulhoquejaber@gmail.com');
            const roleBadge = isAdmin
                ? `<span class="bg-red-500/20 text-red-400 border border-red-500/30 text-[8px] px-1.5 py-0.5 rounded font-black uppercase tracking-wider">Admin</span>` 
                : `<span class="bg-zinc-800 text-zinc-400 text-[8px] px-1.5 py-0.5 rounded font-bold uppercase">Member</span>`;

            html += `
                <div class="flex items-center justify-between p-2.5 rounded-2xl bg-zinc-900/60 hover:bg-zinc-900 border border-zinc-800/70 hover:border-zinc-700/80 transition-all group">
                    <a href="profile.html?user=${encodeURIComponent(email)}" class="flex items-center gap-2.5 min-w-0 flex-1 cursor-pointer">
                        <div class="relative flex-shrink-0">
                            ${avatarInner}
                            <div class="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 rounded-full border border-zinc-950"></div>
                        </div>
                        <div class="min-w-0 flex-1">
                            <div class="flex items-center gap-1.5">
                                <p class="text-xs font-semibold text-zinc-200 group-hover:text-white transition truncate">${name}</p>
                                ${roleBadge}
                            </div>
                            <p class="text-[10px] text-zinc-500 truncate">${email}</p>
                        </div>
                    </a>
                    <button type="button" class="group-action-chip text-[10px] font-bold bg-zinc-800/80 hover:bg-indigo-600 text-zinc-400 hover:text-white border border-zinc-700/50 px-2 py-1 rounded-lg transition active:scale-95 ml-1 flex-shrink-0" data-insert="@${name} " title="Mention ${name}">
                        @
                    </button>
                </div>
            `;
        });

        if (users.length === 0) {
            html = '<p class="text-center text-xs text-zinc-500 py-8">No members found matching search.</p>';
        }

        membersList.innerHTML = html;

        // Attach event listeners to @ buttons in members drawer
        membersList.querySelectorAll('.group-action-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                const insertText = chip.dataset.insert;
                if (!insertText || !chatInput) return;
                chatInput.value = (chatInput.value ? chatInput.value + ' ' : '') + insertText;
                chatInput.focus();
                chatInput.dispatchEvent(new Event('input'));
            });
        });
    }

    // ===== QUICK ACTION PROMPT CHIPS =====
    document.querySelectorAll('.group-action-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            const insertText = chip.dataset.insert;
            if (!insertText || !chatInput) return;
            chatInput.value = insertText;
            chatInput.focus();
            chatInput.dispatchEvent(new Event('input'));
        });
    });

    // ===== EMOJI SELECTOR POPUP =====
    const btnToggleEmoji = document.getElementById("btn-toggle-emoji");
    const emojiPopup = document.getElementById("emoji-popup");
    if (btnToggleEmoji && emojiPopup) {
        btnToggleEmoji.addEventListener("click", (e) => {
            e.stopPropagation();
            emojiPopup.classList.toggle("hidden");
            emojiPopup.classList.toggle("flex");
        });
        document.addEventListener("click", (e) => {
            if (!emojiPopup.contains(e.target) && e.target !== btnToggleEmoji) {
                emojiPopup.classList.add("hidden");
                emojiPopup.classList.remove("flex");
            }
        });
        emojiPopup.querySelectorAll('.emoji-opt').forEach(btn => {
            btn.addEventListener('click', () => {
                if (chatInput) {
                    chatInput.value += btn.textContent.trim();
                    chatInput.focus();
                    chatInput.dispatchEvent(new Event('input'));
                }
            });
        });
    }

    // ===== VIDEO SHARE MODAL =====
    const btnOpenVideoPicker = document.getElementById("btn-open-video-picker");
    const btnQuickShare = document.getElementById("btn-quick-share");
    const videoShareModal = document.getElementById("video-share-modal");
    const closeVideoShareModal = document.getElementById("close-video-share-modal");
    const videoShareList = document.getElementById("video-share-list");
    const videoShareSearch = document.getElementById("video-share-search");

    function renderVideoShareList(filter = '') {
        if (!videoShareList) return;
        const q = filter.toLowerCase().trim();
        const filtered = (allVideos || []).filter(v => {
            if (!q) return true;
            return (v.title && v.title.toLowerCase().includes(q)) ||
                   (v.channel && v.channel.toLowerCase().includes(q)) ||
                   (v.category && v.category.toLowerCase().includes(q));
        });

        if (filtered.length === 0) {
            videoShareList.innerHTML = `<div class="text-center py-8 text-zinc-500 text-xs">No videos found.</div>`;
            return;
        }

        videoShareList.innerHTML = filtered.slice(0, 40).map(v => `
            <div class="flex items-center gap-3 p-2.5 bg-zinc-950/60 hover:bg-zinc-800/80 border border-zinc-800/80 rounded-xl transition cursor-pointer share-video-item" data-id="${v.id}" data-title="${encodeURIComponent(v.title)}">
                <div class="w-20 aspect-video rounded-lg overflow-hidden relative flex-shrink-0 bg-zinc-800">
                    <img src="${v.thumbnail}" class="w-full h-full object-cover" loading="lazy">
                </div>
                <div class="flex-1 min-w-0">
                    <h5 class="text-xs font-semibold text-white line-clamp-1">${v.title}</h5>
                    <p class="text-[10px] text-zinc-400 mt-0.5">${v.channel} • ${v.category || 'Video'}</p>
                </div>
                <button type="button" class="bg-indigo-600 hover:bg-indigo-500 text-white text-xs px-3 py-1.5 rounded-lg font-bold flex-shrink-0 transition">
                    Share
                </button>
            </div>
        `).join('');

        videoShareList.querySelectorAll('.share-video-item').forEach(item => {
            item.addEventListener('click', () => {
                const vidId = item.dataset.id;
                const vidTitle = decodeURIComponent(item.dataset.title || 'Video');
                if (chatInput) {
                    const shareText = `Check out this video: [${vidTitle}](watch.html?id=${vidId})`;
                    chatInput.value = (chatInput.value ? chatInput.value + ' ' : '') + shareText;
                    chatInput.focus();
                    chatInput.dispatchEvent(new Event('input'));
                }
                videoShareModal.classList.add("hidden");
                if (typeof showToast === 'function') {
                    showToast("Video link inserted into chat!", "info");
                }
            });
        });
    }

    function openVideoShareModal() {
        if (!videoShareModal) return;
        videoShareModal.classList.remove("hidden");
        renderVideoShareList();
        if (videoShareSearch) {
            videoShareSearch.value = '';
            videoShareSearch.focus();
        }
    }

    const btnHeaderShareVideo = document.getElementById("btn-header-share-video");
    if (btnOpenVideoPicker) btnOpenVideoPicker.addEventListener("click", openVideoShareModal);
    if (btnQuickShare) btnQuickShare.addEventListener("click", openVideoShareModal);
    if (btnHeaderShareVideo) btnHeaderShareVideo.addEventListener("click", openVideoShareModal);
    if (closeVideoShareModal) closeVideoShareModal.addEventListener("click", () => videoShareModal.classList.add("hidden"));
    if (videoShareModal) {
        videoShareModal.addEventListener("click", (e) => {
            if (e.target === videoShareModal) videoShareModal.classList.add("hidden");
        });
    }
    if (videoShareSearch) {
        videoShareSearch.addEventListener("input", () => {
            renderVideoShareList(videoShareSearch.value);
        });
    }

    // ===== AI SHIELD COMMUNITY RULES MODAL =====
    const btnAiShieldRules = document.getElementById("btn-ai-shield-rules");
    const btnViewSafety = document.getElementById("btn-view-safety");
    const aiShieldModal = document.getElementById("ai-shield-modal");
    const closeAiShieldModal = document.getElementById("close-ai-shield-modal");
    const confirmAiShieldModal = document.getElementById("confirm-ai-shield-modal");

    function openAiShieldModal() {
        if (aiShieldModal) aiShieldModal.classList.remove("hidden");
    }
    if (btnAiShieldRules) btnAiShieldRules.addEventListener("click", openAiShieldModal);
    if (btnViewSafety) btnViewSafety.addEventListener("click", openAiShieldModal);
    if (closeAiShieldModal) closeAiShieldModal.addEventListener("click", () => aiShieldModal.classList.add("hidden"));
    if (confirmAiShieldModal) confirmAiShieldModal.addEventListener("click", () => aiShieldModal.classList.add("hidden"));
    if (aiShieldModal) {
        aiShieldModal.addEventListener("click", (e) => {
            if (e.target === aiShieldModal) aiShieldModal.classList.add("hidden");
        });
    }

    // ===== AI BRAIN LEARNING STATUS MODAL =====
    const btnAiBrainInfo = document.getElementById("btn-ai-brain-info");
    const aiBrainModal = document.getElementById("ai-brain-modal");
    const closeAiBrainModal = document.getElementById("close-ai-brain-modal");
    const closeAiBrainModalBtn = document.getElementById("close-ai-brain-modal-btn");
    const brainModalSyncTime = document.getElementById("brain-modal-sync-time");
    const brainModalVideoCount = document.getElementById("brain-modal-video-count");

    if (btnAiBrainInfo && aiBrainModal) {
        btnAiBrainInfo.addEventListener("click", () => {
            aiBrainModal.classList.remove("hidden");
            if (typeof AIVideoBrain !== 'undefined') {
                const brain = typeof AIVideoBrain.getBrain === 'function'
                    ? AIVideoBrain.getBrain()
                    : {
                        lastTrained: AIVideoBrain.lastTrained || 0,
                        videoCount: AIVideoBrain.videoCount || 0,
                        totalVideos: AIVideoBrain.videoCount || Object.keys(AIVideoBrain.catalog || {}).length || 0,
                        catalog: AIVideoBrain.catalog || {}
                    };
                if (brainModalSyncTime && brain.lastTrained) {
                    brainModalSyncTime.textContent = new Date(brain.lastTrained).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                }
                if (brainModalVideoCount) {
                    brainModalVideoCount.textContent = `${brain.totalVideos || allVideos.length || 0} Videos`;
                }
            }
        });
        if (closeAiBrainModal) closeAiBrainModal.addEventListener("click", () => aiBrainModal.classList.add("hidden"));
        if (closeAiBrainModalBtn) closeAiBrainModalBtn.addEventListener("click", () => aiBrainModal.classList.add("hidden"));
        aiBrainModal.addEventListener("click", (e) => {
            if (e.target === aiBrainModal) aiBrainModal.classList.add("hidden");
        });
    }
});
