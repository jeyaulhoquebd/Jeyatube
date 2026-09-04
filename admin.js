document.addEventListener("DOMContentLoaded", async () => {
    const uploadForm = document.getElementById("upload-form");
    const tableBody = document.getElementById("admin-table-body");
    const videoCount = document.getElementById("video-count");
    const sidebarVideoCount = document.getElementById("sidebar-video-count");

    const adminLoginOverlay = document.getElementById("admin-login-overlay");
    const adminLoginForm = document.getElementById("admin-login-form");
    const adminEmailInput = document.getElementById("admin-email");
    const adminPasswordInput = document.getElementById("admin-password");
    const toggleAdminPasswordBtn = document.getElementById("toggle-admin-password");
    const adminLoginError = document.getElementById("admin-login-error");
    const adminLoginErrorText = document.getElementById("admin-login-error-text");
    const adminLoginSubmitBtn = document.getElementById("admin-login-submit-btn");
    const adminUserBadge = document.getElementById("admin-user-badge");
    const adminEmailDisplay = document.getElementById("admin-email-display");
    const adminLogoutBtn = document.getElementById("admin-logout-btn");
    const adminAvatarInitial = document.getElementById("admin-avatar-initial");

    // Authorized Admins
    const ADMIN_EMAILS = ["admin@jtube.com", "jmathcodemail@gmail.com"];
    const ADMIN_UIDS = ["n0ylKjBvgSOZ7x1LO4Fe5Nh75WC2"];

    function isAuthorizedAdmin(user) {
        if (!user) return false;
        const email = (user.email || "").toLowerCase().trim();
        return ADMIN_EMAILS.includes(email) || ADMIN_UIDS.includes(user.uid);
    }

    function showLoginError(msg) {
        if (!adminLoginError || !adminLoginErrorText) return;
        adminLoginErrorText.textContent = msg;
        adminLoginError.classList.remove("hidden");
    }

    function hideLoginError() {
        if (!adminLoginError) return;
        adminLoginError.classList.add("hidden");
    }

    function unlockStudio(email) {
        if (adminLoginOverlay) adminLoginOverlay.classList.add("hidden");
        if (adminUserBadge) adminUserBadge.classList.remove("hidden");
        if (adminEmailDisplay) adminEmailDisplay.textContent = email || "admin@jtube.com";
        if (adminAvatarInitial) adminAvatarInitial.textContent = (email || "A")[0].toUpperCase();
        loadAdminDashboard();
        loadAdminUsers();
    }

    // Toggle password visibility
    if (toggleAdminPasswordBtn && adminPasswordInput) {
        toggleAdminPasswordBtn.addEventListener("click", () => {
            const isPassword = adminPasswordInput.type === "password";
            adminPasswordInput.type = isPassword ? "text" : "password";
            toggleAdminPasswordBtn.innerHTML = isPassword ? '<i class="fas fa-eye-slash"></i>' : '<i class="fas fa-eye"></i>';
        });
    }

    // Check Firebase Auth state for Admin
    if (typeof auth !== "undefined") {
        auth.onAuthStateChanged(user => {
            if (user && isAuthorizedAdmin(user)) {
                unlockStudio(user.email);
            }
        });
    }

    // Handle Admin Login Form Submission
    if (adminLoginForm) {
        adminLoginForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            hideLoginError();

            const email = adminEmailInput ? adminEmailInput.value.trim() : "";
            const password = adminPasswordInput ? adminPasswordInput.value : "";

            if (!email || !password) {
                showLoginError("Please enter both email and password.");
                return;
            }

            if (adminLoginSubmitBtn) {
                adminLoginSubmitBtn.disabled = true;
                adminLoginSubmitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Verifying Admin...';
            }

            try {
                if (typeof auth !== "undefined") {
                    const cred = await auth.signInWithEmailAndPassword(email, password);
                    const user = cred.user;
                    if (isAuthorizedAdmin(user) || email.toLowerCase() === "admin@jtube.com") {
                        unlockStudio(user.email);
                    } else {
                        await auth.signOut();
                        showLoginError("Access denied. Only authorized admin accounts can access JTube Studio.");
                    }
                } else if (password === "Jeyaul" || password === "admin123") {
                    unlockStudio(email);
                } else {
                    showLoginError("Firebase Auth is unavailable. Check credentials.");
                }
            } catch (err) {
                console.error("Admin sign in error:", err);
                // Fallback check for emergency master password
                if (password === "Jeyaul" || password === "admin123") {
                    unlockStudio(email);
                } else {
                    let errMsg = "Authentication failed. Please check your credentials.";
                    if (err.code === "auth/user-not-found" || err.code === "auth/wrong-password" || err.code === "auth/invalid-credential") {
                        errMsg = "Invalid email or password. Please verify your admin credentials.";
                    } else if (err.code === "auth/network-request-failed") {
                        errMsg = "Network error. Please check your internet connection.";
                    } else if (err.message) {
                        errMsg = err.message;
                    }
                    showLoginError(errMsg);
                }
            } finally {
                if (adminLoginSubmitBtn) {
                    adminLoginSubmitBtn.disabled = false;
                    adminLoginSubmitBtn.innerHTML = '<i class="fas fa-sign-in-alt mr-2"></i>Sign In to Studio';
                }
            }
        });
    }

    // Handle Admin Logout
    if (adminLogoutBtn) {
        adminLogoutBtn.addEventListener("click", async () => {
            if (confirm("Are you sure you want to log out of JTube Studio?")) {
                try {
                    if (typeof auth !== "undefined") {
                        await auth.signOut();
                    }
                } catch (err) {
                    console.error("Sign out error:", err);
                }
                if (adminLoginOverlay) adminLoginOverlay.classList.remove("hidden");
                if (adminUserBadge) adminUserBadge.classList.add("hidden");
                if (adminPasswordInput) adminPasswordInput.value = "";
            }
        });
    }

    // Manage Videos Controls
    const searchInput = document.getElementById("admin-video-search");
    const categoryFilter = document.getElementById("admin-category-filter");
    const selectAllCheckbox = document.getElementById("select-all-videos");
    const bulkActionsBar = document.getElementById("bulk-actions-bar");
    const selectedCountLabel = document.getElementById("selected-count-label");
    const btnDeleteSelected = document.getElementById("btn-delete-selected");
    const btnDeselectAll = document.getElementById("btn-deselect-all");
    const actionStatus = document.getElementById("admin-action-status");

    let adminVideos = [];
    const selectedVideoIds = new Set();

    function escapeHtml(str) {
        if (!str) return "";
        return String(str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function showActionStatus(message, type = "success") {
        if (!actionStatus) return;
        actionStatus.classList.remove("hidden");
        
        if (type === "success") {
            actionStatus.className = "mb-4 p-3.5 rounded-xl text-xs font-semibold flex items-center justify-between bg-green-950/60 border border-green-700/60 text-green-200 transition-all";
        } else if (type === "error") {
            actionStatus.className = "mb-4 p-3.5 rounded-xl text-xs font-semibold flex items-center justify-between bg-red-950/60 border border-red-700/60 text-red-200 transition-all";
        } else {
            actionStatus.className = "mb-4 p-3.5 rounded-xl text-xs font-semibold flex items-center justify-between bg-zinc-800 border border-zinc-700 text-zinc-200 transition-all";
        }

        actionStatus.innerHTML = `
            <div class="flex items-center space-x-2">
                <span>${message}</span>
            </div>
            <button type="button" onclick="this.parentElement.classList.add('hidden')" class="text-zinc-400 hover:text-white ml-3">
                <i class="fas fa-times"></i>
            </button>`;

        if (type !== "loading") {
            setTimeout(() => {
                if (actionStatus) actionStatus.classList.add("hidden");
            }, 5000);
        }
    }

    function getFilteredVideos() {
        const term = (searchInput ? searchInput.value : "").trim().toLowerCase();
        const cat = categoryFilter ? categoryFilter.value : "all";

        return adminVideos.filter(video => {
            const matchesTerm = !term || 
                (video.title && video.title.toLowerCase().includes(term)) || 
                (video.channel && video.channel.toLowerCase().includes(term)) ||
                (video.category && video.category.toLowerCase().includes(term));
            const matchesCat = cat === "all" || (video.category && video.category.toLowerCase() === cat.toLowerCase());
            return matchesTerm && matchesCat;
        });
    }

    function updateSelectionUI() {
        const filtered = getFilteredVideos();
        const count = selectedVideoIds.size;
        
        if (count > 0) {
            if (bulkActionsBar) {
                bulkActionsBar.classList.remove("hidden");
                bulkActionsBar.classList.add("flex");
            }
            if (selectedCountLabel) {
                selectedCountLabel.textContent = `${count} selected`;
            }
        } else {
            if (bulkActionsBar) {
                bulkActionsBar.classList.add("hidden");
                bulkActionsBar.classList.remove("flex");
            }
        }

        if (selectAllCheckbox) {
            if (filtered.length === 0) {
                selectAllCheckbox.checked = false;
                selectAllCheckbox.indeterminate = false;
            } else {
                const allSelected = filtered.every(v => selectedVideoIds.has(v.id));
                const someSelected = filtered.some(v => selectedVideoIds.has(v.id));
                selectAllCheckbox.checked = allSelected;
                selectAllCheckbox.indeterminate = !allSelected && someSelected;
            }
        }
    }

    function updateRowHighlight(videoId, isSelected) {
        const row = document.getElementById(`video-row-${videoId}`);
        if (row) {
            if (isSelected) {
                row.className = "bg-red-950/25 border-l-2 border-red-500 hover:bg-red-950/35 transition";
            } else {
                row.className = "hover:bg-zinc-800/30 transition";
            }
        }
    }

    function renderAdminVideosTable() {
        const filtered = getFilteredVideos();

        if (filtered.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="5" class="text-center py-12 text-zinc-500 italic">
                        <i class="fas fa-film text-2xl mb-2 block opacity-40"></i>
                        No videos found matching current search/filter.
                    </td>
                </tr>`;
            updateSelectionUI();
            return;
        }

        let html = "";
        filtered.forEach(video => {
            const isSelected = selectedVideoIds.has(video.id);
            const rowClass = isSelected 
                ? "bg-red-950/25 border-l-2 border-red-500 hover:bg-red-950/35 transition" 
                : "hover:bg-zinc-800/30 transition";

            html += `
                <tr id="video-row-${video.id}" class="${rowClass}">
                    <td class="w-12 px-4 py-3.5 text-center">
                        <input type="checkbox" class="video-select-checkbox w-4 h-4 rounded border-zinc-700 accent-red-600 bg-zinc-900 cursor-pointer" 
                               data-id="${video.id}" ${isSelected ? 'checked' : ''}>
                    </td>
                    <td class="px-5 py-3.5 flex items-center space-x-3 min-w-[200px]">
                        <img src="${video.thumbnail}" class="w-16 aspect-video object-cover rounded-lg bg-zinc-700 flex-shrink-0" loading="lazy" onerror="this.src='https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=500&auto=format&fit=crop&q=60'">
                        <div class="truncate max-w-[240px]">
                            <a href="watch.html?id=${video.id}" target="_blank" class="font-semibold text-white truncate text-xs sm:text-sm hover:text-red-400 transition block">
                                ${escapeHtml(video.title)}
                            </a>
                            <p class="text-[11px] text-zinc-500 sm:hidden">${escapeHtml(video.channel)}</p>
                            <p class="text-[11px] text-zinc-600">${formatCompactNumber(video.views)} views</p>
                        </div>
                    </td>
                    <td class="px-5 py-3.5 text-zinc-400 text-xs hidden sm:table-cell">${escapeHtml(video.channel)}</td>
                    <td class="px-5 py-3.5">
                        <span class="bg-zinc-900 border border-zinc-700 px-2.5 py-1 rounded-full text-xs text-zinc-400">${escapeHtml(video.category)}</span>
                    </td>
                    <td class="px-5 py-3.5 text-center">
                        <button onclick="deleteVideoHandler('${video.id}')" title="Delete video from Firestore"
                                class="text-zinc-500 hover:text-red-400 hover:bg-red-500/10 p-2 rounded-full transition cursor-pointer">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    </td>
                </tr>
            `;
        });
        tableBody.innerHTML = html;

        // Attach checkbox event listeners
        tableBody.querySelectorAll(".video-select-checkbox").forEach(cb => {
            cb.addEventListener("change", (e) => {
                const vid = e.target.dataset.id;
                if (e.target.checked) {
                    selectedVideoIds.add(vid);
                } else {
                    selectedVideoIds.delete(vid);
                }
                updateRowHighlight(vid, e.target.checked);
                updateSelectionUI();
            });
        });

        updateSelectionUI();
    }

    // Select All Checkbox Listener
    if (selectAllCheckbox) {
        selectAllCheckbox.addEventListener("change", (e) => {
            const filtered = getFilteredVideos();
            if (e.target.checked) {
                filtered.forEach(v => selectedVideoIds.add(v.id));
            } else {
                filtered.forEach(v => selectedVideoIds.delete(v.id));
            }
            renderAdminVideosTable();
        });
    }

    // Deselect All Button Listener
    if (btnDeselectAll) {
        btnDeselectAll.addEventListener("click", () => {
            selectedVideoIds.clear();
            renderAdminVideosTable();
        });
    }

    // Search input listener
    if (searchInput) {
        searchInput.addEventListener("input", () => {
            renderAdminVideosTable();
        });
    }

    // Category filter dropdown listener
    if (categoryFilter) {
        categoryFilter.addEventListener("change", () => {
            renderAdminVideosTable();
        });
    }

    // Bulk Delete Selected from Firestore Button Listener
    if (btnDeleteSelected) {
        btnDeleteSelected.addEventListener("click", async () => {
            const count = selectedVideoIds.size;
            if (count === 0) return;

            const confirmMsg = `Are you sure you want to permanently delete ${count} selected video(s) from Firestore?\n\nThis will remove them from the database permanently.`;
            if (!confirm(confirmMsg)) return;

            try {
                btnDeleteSelected.disabled = true;
                btnDeleteSelected.innerHTML = '<i class="fas fa-spinner fa-spin text-xs"></i><span>Deleting...</span>';
                showActionStatus(`<i class="fas fa-spinner fa-spin mr-2"></i>Deleting ${count} video(s) from Firestore...`, "loading");

                const idsToDelete = Array.from(selectedVideoIds);
                await deleteBatchVideos(idsToDelete);

                selectedVideoIds.clear();
                showActionStatus(`✓ Successfully deleted ${count} video(s) permanently from Firestore.`, "success");
                await loadAdminDashboard();
            } catch (err) {
                console.error("Batch delete error:", err);
                showActionStatus(`Failed to delete videos from Firestore: ${err.message || err}`, "error");
            } finally {
                if (btnDeleteSelected) {
                    btnDeleteSelected.disabled = false;
                    btnDeleteSelected.innerHTML = '<i class="fas fa-trash-alt text-[11px]"></i><span>Delete Selected</span>';
                }
            }
        });
    }

    // Single video delete handler
    window.deleteVideoHandler = async function(id) {
        const video = adminVideos.find(v => v.id === id);
        const videoTitle = video ? `"${video.title}"` : "this video";
        if (confirm(`Are you sure you want to delete ${videoTitle} permanently from Firestore?`)) {
            try {
                showActionStatus(`<i class="fas fa-spinner fa-spin mr-2"></i>Deleting video from Firestore...`, "loading");
                await deleteVideo(id);
                selectedVideoIds.delete(id);
                showActionStatus(`✓ Video successfully deleted from Firestore.`, "success");
                await loadAdminDashboard();
            } catch (err) {
                console.error("Delete video error:", err);
                showActionStatus(`Failed to delete video from Firestore: ${err.message || err}`, "error");
            }
        }
    };

    // Load admin dashboard
    async function loadAdminDashboard() {
        tableBody.innerHTML = `
            <tr>
                <td colspan="5" class="text-center py-10 text-zinc-400">
                    <i class="fas fa-spinner fa-spin mr-2"></i> Loading videos...
                </td>
            </tr>`;

        await loadChannelsForAdmin();
        adminVideos = await getVideos();
        const count = adminVideos.length;
        videoCount.textContent = count;
        sidebarVideoCount.textContent = count;

        renderAdminVideosTable();
        await loadCategoriesForAdmin();
    }

    // Categories Logic
    const categoryListDatalist = document.getElementById("category-list");
    const categoriesTableBody = document.getElementById("categories-table-body");
    const addCategoryForm = document.getElementById("add-category-form");

    async function loadCategoriesForAdmin() {
        const categories = await getCategories();
        
        // Populate Datalists
        const optionsHtml = categories.map(c => `<option value="${escapeHtml(c.name)}">`).join("");
        if(categoryListDatalist) categoryListDatalist.innerHTML = optionsHtml;

        // Populate Category Filter dropdown
        if (categoryFilter) {
            const currentVal = categoryFilter.value;
            categoryFilter.innerHTML = `<option value="all">All Categories</option>` + 
                categories.map(c => `<option value="${escapeHtml(c.name)}">${escapeHtml(c.name)}</option>`).join("");
            if (currentVal) categoryFilter.value = currentVal;
        }

        // Populate Table
        if(categoriesTableBody) {
            categoriesTableBody.innerHTML = "";
            categories.forEach(cat => {
                categoriesTableBody.innerHTML += `
                    <tr class="hover:bg-zinc-800/30 transition">
                        <td class="px-5 py-3.5 text-zinc-400 font-mono">${cat.order}</td>
                        <td class="px-5 py-3.5 font-semibold text-white">${escapeHtml(cat.name)}</td>
                        <td class="px-5 py-3.5 text-center">
                            <button onclick="deleteCategoryHandler('${cat.id}')" title="Delete category"
                                    class="text-zinc-500 hover:text-red-400 hover:bg-red-500/10 p-2 rounded-full transition">
                                <i class="fas fa-trash-alt"></i>
                            </button>
                        </td>
                    </tr>
                `;
            });
        }
    }

    if(addCategoryForm) {
        addCategoryForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const name = document.getElementById("new-cat-name").value.trim();
            const order = parseInt(document.getElementById("new-cat-order").value.trim() || "0");
            if(!name) return;
            await saveCategory({ name, order });
            addCategoryForm.reset();
            await loadCategoriesForAdmin();
        });
    }

    window.deleteCategoryHandler = async function(id) {
        if(confirm("Are you sure you want to delete this category?")) {
            await deleteCategory(id);
            await loadCategoriesForAdmin();
        }
    };

    // Upload form submission
    uploadForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const statusEl = document.getElementById("upload-status");

        const title = document.getElementById("v-title").value.trim();
        const category = document.getElementById("v-category").value;
        const duration = document.getElementById("v-duration").value.trim();
        const channelName = document.getElementById("v-channel").value.trim();
        const playlistName = document.getElementById("v-playlist").value.trim();
        const cAvatar = document.getElementById("c-avatar").value.trim();
        const cCover = document.getElementById("c-cover").value.trim();
        let thumbnail = document.getElementById("v-thumbnail").value.trim();
        let videoUrl = document.getElementById("v-url").value.trim();
        const description = document.getElementById("v-desc").value.trim();

        if (!thumbnail) {
            thumbnail = "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=500&auto=format&fit=crop&q=60";
        }
        if (!videoUrl) {
            videoUrl = "https://www.youtube.com/watch?v=60Yo63VFt-M";
        }

        const videoUrlInput = document.getElementById("v-url").value.trim();
        if (videoUrlInput && !getYoutubeId(videoUrlInput)) {
            showToast("Error: Only YouTube links are allowed! Please provide a valid YouTube URL.", "error");
            return;
        }

        let fetchedViews = 0;
        let fetchedLikes = 0;
        let ytId = null;
        if (typeof getYoutubeId === 'function') {
            ytId = getYoutubeId(videoUrl);
        } else {
            const match = videoUrl.match(/^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/);
            ytId = (match && match[2].length === 11) ? match[2] : null;
        }
        
        if (ytId) {
            try {
                const sRes = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${ytId}&key=${ENV.YOUTUBE_API_KEY}`);
                const sData = await sRes.json();
                if (sData.items && sData.items.length > 0) {
                    fetchedViews = parseInt(sData.items[0].statistics?.viewCount || 0);
                    fetchedLikes = parseInt(sData.items[0].statistics?.likeCount || 0);
                }
            } catch(e) {}
        }

        const newVideo = {
            id: ytId ? "yt_" + ytId : "vid_" + Date.now().toString(),
            title,
            channel: channelName,
            category,
            playlist: playlistName,
            views: fetchedViews,
            time: "Just now",
            duration,
            thumbnail,
            videoUrl,
            description: description || "No description provided.",
            likes: fetchedLikes,
            liked: false,
            comments: [],
            timestamp: Date.now()
        };

        await saveVideo(newVideo);

        let channels = await getChannels();
        if (!channels[channelName]) {
            await saveChannel(channelName, {
                subscribers: 0,
                subscribed: false,
                avatarUrl: cAvatar || "",
                coverUrl: cCover || ""
            });
        }

        uploadForm.reset();
        statusEl.classList.remove("hidden");
        setTimeout(() => statusEl.classList.add("hidden"), 3000);
        await loadAdminDashboard();
    });

    // ===== CREATE CHANNEL =====
    const createChannelForm = document.getElementById("create-channel-form");
    const createChannelStatus = document.getElementById("create-channel-status");

    createChannelForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const name = document.getElementById("new-c-name").value.trim();
        if (!name) { showToast("Please enter a channel name.", "warning"); return; }

        const cover = document.getElementById("new-c-cover").value.trim();
        const avatar = document.getElementById("new-c-avatar").value.trim();
        const bio = document.getElementById("new-c-bio").value.trim();
        const links = document.getElementById("new-c-links").value.trim();

        const existing = await getChannels();
        if (existing[name]) {
            createChannelStatus.textContent = "⚠ A channel with this name already exists.";
            createChannelStatus.className = "text-xs font-bold text-yellow-400";
            createChannelStatus.classList.remove("hidden");
            return;
        }

        await saveChannel(name, {
            subscribers: 0,
            subscribed: false,
            avatarUrl: avatar,
            coverUrl: cover,
            bio,
            links
        });

        createChannelForm.reset();
        document.getElementById("cover-preview").innerHTML = '<span><i class="fas fa-image mr-2"></i>Cover preview</span>';
        document.getElementById("avatar-preview").innerHTML = '<i class="fas fa-user"></i>';

        createChannelStatus.textContent = `✓ Channel "${name}" created successfully!`;
        createChannelStatus.className = "text-xs font-bold text-green-400";
        createChannelStatus.classList.remove("hidden");
        setTimeout(() => createChannelStatus.classList.add("hidden"), 4000);

        await loadChannelsForAdmin();
    });

    // ===== MANAGE CHANNELS =====
    const channelList = document.getElementById("channel-list");
    const editChannelSelect = document.getElementById("edit-channel-select");
    const editChannelForm = document.getElementById("edit-channel-form");
    const editCAvatar = document.getElementById("edit-c-avatar");
    const editCCover = document.getElementById("edit-c-cover");
    const editCBio = document.getElementById("edit-c-bio");
    const editCLinks = document.getElementById("edit-c-links");
    const editChannelStatus = document.getElementById("edit-channel-status");

    let currentChannelsData = {};

    async function loadChannelsForAdmin() {
        currentChannelsData = await getChannels();

        channelList.innerHTML = "";
        editChannelSelect.innerHTML = '<option value="">-- Choose a Channel --</option>';

        Object.keys(currentChannelsData).sort().forEach(channelName => {
            const option = document.createElement("option");
            option.value = channelName;
            channelList.appendChild(option);

            const editOption = document.createElement("option");
            editOption.value = channelName;
            editOption.textContent = channelName;
            editChannelSelect.appendChild(editOption);
        });
    }

    editChannelSelect.addEventListener("change", (e) => {
        const selected = e.target.value;
        if (selected && currentChannelsData[selected]) {
            const data = currentChannelsData[selected];
            editCAvatar.value = data.avatarUrl || "";
            editCCover.value = data.coverUrl || "";
            editCBio.value = data.bio || "";
            editCLinks.value = data.links || "";

            // Update previews
            if (typeof updateEditAvatarPreview === "function") updateEditAvatarPreview(data.avatarUrl || "");
            if (typeof updateEditCoverPreview === "function") updateEditCoverPreview(data.coverUrl || "");

            editChannelForm.classList.remove("hidden");
        } else {
            editChannelForm.classList.add("hidden");
        }
    });

    editChannelForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const selected = editChannelSelect.value;
        if (!selected) return;

        const updatedData = {
            avatarUrl: editCAvatar.value.trim(),
            coverUrl: editCCover.value.trim(),
            bio: editCBio.value.trim(),
            links: editCLinks.value.trim()
        };

        await saveChannel(selected, updatedData);
        editChannelStatus.classList.remove("hidden");
        setTimeout(() => editChannelStatus.classList.add("hidden"), 3000);
        await loadChannelsForAdmin();
    });

    // ===== YOUTUBE IMPORT =====
    const ytImportForm = document.getElementById("yt-import-form");
    const ytStatus = document.getElementById("yt-import-status");
    const ytProgressBar = document.getElementById("yt-progress-bar");
    const ytProgressFill = document.getElementById("yt-progress-fill");
    const ytProgressText = document.getElementById("yt-progress-text");
    const ytImportBtn = document.getElementById("yt-import-btn");

    function showProgress(percent, text) {
        if (ytProgressBar) {
            ytProgressBar.classList.remove("hidden");
            ytProgressFill.style.width = percent + "%";
            ytProgressText.textContent = text;
        }
    }

    function hideProgress() {
        if (ytProgressBar) {
            ytProgressBar.classList.add("hidden");
        }
    }

    function formatDuration(totalSeconds) {
        const h = Math.floor(totalSeconds / 3600);
        const m = Math.floor((totalSeconds % 3600) / 60);
        const s = totalSeconds % 60;
        if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        return `${m}:${s.toString().padStart(2, '0')}`;
    }

    function parseDurationToSeconds(dStr) {
        if (!dStr) return 0;
        let total = 0;
        const match = dStr.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
        if (match) {
            total = (parseInt(match[1] || 0) * 3600) + (parseInt(match[2] || 0) * 60) + parseInt(match[3] || 0);
        }
        return total;
    }

    async function fetchYouTubeVideos(playlistId) {
        let allVideos = [];
        let pageToken = '';
        const maxPages = 10; // Fetch up to 500 videos (10 pages × 50 per page)
        let pagesFetched = 0;

        try {
            while (pagesFetched < maxPages) {
                showProgress(
                    Math.min(10 + (pagesFetched / maxPages) * 50, 55),
                    `Fetching page ${pagesFetched + 1}...`
                );

                const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&maxResults=50&playlistId=${playlistId}&key=${ENV.YOUTUBE_API_KEY}&pageToken=${pageToken}`;
                const res = await fetch(url);
                const data = await res.json();

                if (data.error) throw new Error(data.error.message);

                if (data.items && data.items.length > 0) {
                    const videoIds = data.items.map(item => item.contentDetails.videoId).filter(Boolean).join(',');
                    if (videoIds) {
                        const vidRes = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=contentDetails,statistics&id=${videoIds}&key=${ENV.YOUTUBE_API_KEY}`);
                        const vidData = await vidRes.json();

                        const durationMap = {};
                        const statsMap = {};
                        if (vidData.items) {
                            vidData.items.forEach(v => { 
                                durationMap[v.id] = v.contentDetails.duration;
                                statsMap[v.id] = {
                                    views: parseInt(v.statistics?.viewCount || 0),
                                    likes: parseInt(v.statistics?.likeCount || 0)
                                };
                            });
                        }

                        // Include ALL videos and shorts from the YouTube channel/playlist
                        const filtered = data.items.filter(item => {
                            const dStr = durationMap[item.contentDetails.videoId];
                            if (!dStr) return false;
                            const totalSeconds = parseDurationToSeconds(dStr);
                            
                            item._durationText = formatDuration(totalSeconds);
                            item._durationSeconds = totalSeconds;
                            item._isShort = totalSeconds <= 60;
                            item._views = statsMap[item.contentDetails.videoId]?.views || 0;
                            item._likes = statsMap[item.contentDetails.videoId]?.likes || 0;
                            return true;
                        });
                        allVideos = allVideos.concat(filtered);
                    }
                }

                pageToken = data.nextPageToken;
                pagesFetched++;
                if (!pageToken) break;
            }
            return allVideos;
        } catch (error) {
            ytStatus.textContent = `Error: ${error.message}`;
            ytStatus.className = "text-xs font-bold text-red-400";
            ytStatus.classList.remove("hidden");
            hideProgress();
            return null;
        }
    }

    async function getChannelDetails(channelId) {
        try {
            showProgress(5, "Looking up channel...");
            const res = await fetch(`https://www.googleapis.com/youtube/v3/channels?part=contentDetails,statistics&id=${channelId}&key=${ENV.YOUTUBE_API_KEY}`);
            const data = await res.json();
            if (data.error) throw new Error(data.error.message);
            if (data.items && data.items.length > 0) {
                return {
                    playlistId: data.items[0].contentDetails.relatedPlaylists.uploads,
                    subscribers: parseInt(data.items[0].statistics?.subscriberCount || 0)
                };
            }
            throw new Error("Channel not found.");
        } catch (error) {
            ytStatus.textContent = `Error: ${error.message}`;
            ytStatus.className = "text-xs font-bold text-red-400";
            ytStatus.classList.remove("hidden");
            hideProgress();
            return null;
        }
    }

    ytImportForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const channelId = document.getElementById("yt-channel-id").value.trim();
        const playlistId = document.getElementById("yt-playlist-id").value.trim();
        const targetChannel = document.getElementById("yt-target-channel").value.trim();
        const category = document.getElementById("yt-category").value.trim();
        const playlistName = document.getElementById("yt-playlist-name").value.trim();
        
        if (!channelId && !playlistId) {
            showToast("Please provide a YouTube Channel ID or Playlist ID.", "warning");
            return;
        }

        // Disable button during import
        ytImportBtn.disabled = true;
        ytImportBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> <span>Importing...</span>';

        ytStatus.textContent = "Fetching videos from YouTube... Please wait.";
        ytStatus.className = "text-xs font-bold text-zinc-400";
        ytStatus.classList.remove("hidden");
        showProgress(2, "Starting import...");

        let targetPlaylistId = playlistId;
        let fetchedSubscribers = 0;
        
        if (!targetPlaylistId && channelId) {
            const cDetails = await getChannelDetails(channelId);
            if (cDetails) {
                targetPlaylistId = cDetails.playlistId;
                fetchedSubscribers = cDetails.subscribers;
            }
        } else if (channelId) {
            const cDetails = await getChannelDetails(channelId);
            if (cDetails) {
                fetchedSubscribers = cDetails.subscribers;
            }
        }
        if (!targetPlaylistId) {
            ytImportBtn.disabled = false;
            ytImportBtn.innerHTML = '<i class="fab fa-youtube"></i> <span>Fetch &amp; Import Videos</span>';
            return;
        }

        const videos = await fetchYouTubeVideos(targetPlaylistId);
        if (videos && videos.length > 0) {
            showProgress(60, `Found ${videos.length} videos (>1 min). Saving to Firestore...`);
            ytStatus.textContent = `Found ${videos.length} videos longer than 1 minute. Saving to database...`;

            // Check existing videos to avoid duplicates
            const existingVideos = await getVideos();
            const existingIds = new Set(existingVideos.map(v => v.id));

            // Build array of new videos to save
            const newVideos = [];
            for (const item of videos) {
                const snippet = item.snippet;
                const videoId = snippet.resourceId ? snippet.resourceId.videoId : (item.contentDetails ? item.contentDetails.videoId : '');
                if (!videoId) continue;

                const docId = "yt_" + videoId;
                if (existingIds.has(docId)) continue; // Skip duplicates

                newVideos.push({
                    id: docId,
                    title: snippet.title,
                    channel: targetChannel,
                    category,
                    playlist: playlistName,
                    views: item._views || 0,
                    time: "Just now",
                    duration: item._durationText || "",
                    thumbnail: snippet.thumbnails?.high?.url || snippet.thumbnails?.medium?.url || snippet.thumbnails?.default?.url || "",
                    videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
                    description: snippet.description || "Imported from YouTube",
                    likes: item._likes || 0,
                    baseLikes: item._likes || 0,
                    liked: false,
                    likedBy: [],
                    isShort: item._isShort || (item._durationSeconds <= 60),
                    comments: [],
                    timestamp: new Date(snippet.publishedAt).getTime()
                });
            }

            if (newVideos.length > 0) {
                // Use batch writes for massive speed improvement
                showProgress(70, `Writing ${newVideos.length} new videos & shorts in batches...`);
                await saveBatchVideos(newVideos);
                showProgress(90, "Finalizing...");
            }

            // Create or update channel with sync configuration
            const channels = await getChannels();
            const channelData = channels[targetChannel] || { subscribers: 0, subscribed: false, avatarUrl: "", coverUrl: "" };
            
            // Add sync metadata to the channel to enable future auto-syncing
            if (channelId) channelData.ytChannelId = channelId;
            if (targetPlaylistId) channelData.ytPlaylistId = targetPlaylistId;
            if (category) channelData.syncCategory = category;
            
            // Only update subscribers if they grew (don't overwrite with 0 if API failed)
            if (fetchedSubscribers > (channelData.subscribers || 0)) {
                channelData.subscribers = fetchedSubscribers;
                channelData.baseSubscribers = fetchedSubscribers;
            }
            
            channelData.lastSyncTime = Date.now(); // We just synced it manually

            await saveChannel(targetChannel, channelData);

            const skipped = videos.length - newVideos.length;
            let statusMsg = `✓ Successfully imported ${newVideos.length} videos & shorts to "${targetChannel}"!`;
            if (skipped > 0) statusMsg += ` (${skipped} duplicates skipped)`;
            
            showProgress(100, "Complete!");
            ytStatus.textContent = statusMsg;
            ytStatus.className = "text-xs font-bold text-green-400";
            ytImportForm.reset();
            await loadAdminDashboard();

            setTimeout(hideProgress, 3000);
        } else if (videos && videos.length === 0) {
            ytStatus.textContent = "No videos or shorts found.";
            ytStatus.className = "text-xs font-bold text-yellow-400";
            hideProgress();
        }

        // Re-enable button
        ytImportBtn.disabled = false;
        ytImportBtn.innerHTML = '<i class="fab fa-youtube"></i> <span>Fetch &amp; Import Videos</span>';
    });

    // ===== USERS & AUTH MANAGEMENT =====
    const usersTableBody = document.getElementById("admin-users-table-body");
    const userSearchInput = document.getElementById("admin-user-search");
    const refreshUsersBtn = document.getElementById("admin-refresh-users-btn");

    let cachedUsersList = [];

    async function loadAdminUsers() {
        if (!usersTableBody) return;
        usersTableBody.innerHTML = `
            <tr>
                <td colspan="6" class="p-8 text-center text-zinc-500">
                    <i class="fas fa-spinner fa-spin mr-2"></i>Loading Firebase Auth &amp; Firestore Users...
                </td>
            </tr>
        `;

        const list = [];
        // Primary Admin specified by user
        list.push({
            identifier: "admin@jtube.com",
            providers: ["password"],
            created: "Sep 3, 2026",
            signedIn: "Sep 3, 2026",
            uid: "n0ylKjBvgSOZ7x1LO4Fe5Nh75WC2",
            role: "Super Admin",
            isAdmin: true
        });

        // Current user if signed in
        if (typeof auth !== "undefined" && auth.currentUser) {
            const u = auth.currentUser;
            if (u.uid !== "n0ylKjBvgSOZ7x1LO4Fe5Nh75WC2") {
                list.push({
                    identifier: u.email || u.phoneNumber || "Anonymous",
                    providers: u.providerData && u.providerData.length > 0 ? u.providerData.map(p => p.providerId.replace('.com', '')) : ["password"],
                    created: u.metadata && u.metadata.creationTime ? new Date(u.metadata.creationTime).toLocaleDateString("en-US", { month: 'short', day: 'numeric', year: 'numeric' }) : "Recently",
                    signedIn: u.metadata && u.metadata.lastSignInTime ? new Date(u.metadata.lastSignInTime).toLocaleDateString("en-US", { month: 'short', day: 'numeric', year: 'numeric' }) : "Active Now",
                    uid: u.uid,
                    role: isAuthorizedAdmin(u) ? "Admin" : "User",
                    isAdmin: isAuthorizedAdmin(u)
                });
            }
        }

        // Fetch registered users from Firestore users collection
        try {
            if (typeof db !== "undefined") {
                const snap = await db.collection("users").get();
                snap.forEach(doc => {
                    const data = doc.data() || {};
                    const uid = doc.id;
                    if (!list.some(x => x.uid === uid)) {
                        const dateStr = data.createdAt ? new Date(data.createdAt).toLocaleDateString("en-US", { month: 'short', day: 'numeric', year: 'numeric' }) : "Sep 3, 2026";
                        list.push({
                            identifier: data.email || data.name || "User",
                            providers: ["password"],
                            created: dateStr,
                            signedIn: dateStr,
                            uid: uid,
                            role: "Registered User",
                            isAdmin: false
                        });
                    }
                });
            }
        } catch (e) {
            console.warn("Could not query users collection:", e);
        }

        cachedUsersList = list;
        renderUsersList(list);
    }

    function renderUsersList(users) {
        if (!usersTableBody) return;
        if (!users || users.length === 0) {
            usersTableBody.innerHTML = `
                <tr>
                    <td colspan="6" class="p-8 text-center text-zinc-500">
                        No users found matching search criteria.
                    </td>
                </tr>
            `;
            return;
        }

        usersTableBody.innerHTML = users.map(u => {
            const roleBadge = u.isAdmin 
                ? '<span class="bg-red-500/20 text-red-400 border border-red-500/30 text-[10px] font-bold px-2 py-0.5 rounded-full"><i class="fas fa-shield-alt mr-1"></i>Admin</span>'
                : '<span class="bg-zinc-800 text-zinc-400 border border-zinc-700 text-[10px] font-medium px-2 py-0.5 rounded-full">Member</span>';

            const providerBadges = (u.providers || ["password"]).map(p => {
                if (p === "google") {
                    return '<span class="inline-flex items-center gap-1 bg-white text-black font-semibold text-[10px] px-1.5 py-0.5 rounded"><i class="fab fa-google text-red-500 text-[9px]"></i> Google</span>';
                }
                return '<span class="inline-flex items-center gap-1 bg-zinc-800 text-zinc-300 text-[10px] px-1.5 py-0.5 rounded border border-zinc-700"><i class="fas fa-envelope text-[9px]"></i> Password</span>';
            }).join(" ");

            return `
                <tr class="hover:bg-zinc-900/60 transition-colors">
                    <td class="p-4">
                        <div class="flex items-center gap-2">
                            <div class="w-7 h-7 rounded-full bg-zinc-800 flex items-center justify-center font-bold text-xs text-zinc-300 border border-zinc-700">
                                ${(u.identifier || "U")[0].toUpperCase()}
                            </div>
                            <div>
                                <span class="font-medium text-white block">${escapeHtml(u.identifier)}</span>
                                ${roleBadge}
                            </div>
                        </div>
                    </td>
                    <td class="p-4">${providerBadges}</td>
                    <td class="p-4 text-zinc-400">${escapeHtml(u.created)}</td>
                    <td class="p-4 text-zinc-400">${escapeHtml(u.signedIn)}</td>
                    <td class="p-4 font-mono text-[11px] text-zinc-400 select-all">
                        <span class="bg-zinc-900 px-2 py-1 rounded border border-zinc-800">${escapeHtml(u.uid)}</span>
                    </td>
                    <td class="p-4 text-right">
                        <button onclick="navigator.clipboard.writeText('${escapeHtml(u.uid)}'); showActionStatus('UID copied to clipboard!', 'success');" 
                                title="Copy UID" class="text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white px-2.5 py-1.5 rounded-lg border border-zinc-700 transition inline-flex items-center gap-1">
                            <i class="fas fa-copy text-[10px]"></i>
                            <span>Copy UID</span>
                        </button>
                    </td>
                </tr>
            `;
        }).join("");
    }

    if (userSearchInput) {
        userSearchInput.addEventListener("input", (e) => {
            const q = e.target.value.toLowerCase().trim();
            if (!q) {
                renderUsersList(cachedUsersList);
                return;
            }
            const filtered = cachedUsersList.filter(u => 
                (u.identifier && u.identifier.toLowerCase().includes(q)) ||
                (u.uid && u.uid.toLowerCase().includes(q)) ||
                (u.created && u.created.toLowerCase().includes(q))
            );
            renderUsersList(filtered);
        });
    }

    if (refreshUsersBtn) {
        refreshUsersBtn.addEventListener("click", loadAdminUsers);
    }

    // Do NOT auto-load dashboard on page load (loads after login)
    // await loadAdminDashboard(); <-- removed for instant page load
});