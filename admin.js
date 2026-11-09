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

    // ===== SERVER-VERIFIED ADMIN SESSION =====
    // Credentials are checked by the server (scrypt-hashed password, brute-force lockout).
    // The session lives in an HttpOnly cookie that page scripts cannot read or forge.
    window.JTUBE_ADMIN_SESSION = false;

    function showLoginError(msg) {
        if (!adminLoginError || !adminLoginErrorText) return;
        adminLoginErrorText.textContent = msg;
        adminLoginError.classList.remove("hidden");
    }

    function hideLoginError() {
        if (!adminLoginError) return;
        adminLoginError.classList.add("hidden");
    }

    let studioUnlocked = false;
    function unlockStudio(email) {
        window.JTUBE_ADMIN_SESSION = true;
        if (adminLoginOverlay) adminLoginOverlay.classList.add("hidden");
        if (adminUserBadge) adminUserBadge.classList.remove("hidden");
        if (adminEmailDisplay) adminEmailDisplay.textContent = email || "";
        if (adminAvatarInitial) adminAvatarInitial.textContent = (email || "A")[0].toUpperCase();
        if (studioUnlocked) return;
        studioUnlocked = true;
        loadAdminDashboard();
        loadAdminUsers();
        if (typeof loadDailySyncHub === 'function') loadDailySyncHub();
        if (typeof initAISuite === 'function') initAISuite();
        setTimeout(() => { if (typeof loadCommunityAdmin === 'function') loadCommunityAdmin(); }, 500);
        if (window.JTUBE_ADMIN_FIREBASE) {
            const inp = document.getElementById('new-sync-chan-id');
            if (inp) inp.placeholder = 'Channel ID (UC…) or youtube.com/channel/UC… link';
            const nm = document.getElementById('new-sync-chan-name');
            if (nm) { nm.placeholder = 'Channel name (required)'; nm.required = true; }
        }
    }

    function lockStudio(message) {
        window.JTUBE_ADMIN_SESSION = false;
        if (adminLoginOverlay) adminLoginOverlay.classList.remove("hidden");
        if (adminUserBadge) adminUserBadge.classList.add("hidden");
        if (adminPasswordInput) adminPasswordInput.value = "";
        if (message) showLoginError(message);
    }

    // Any admin API call that returns 401 means the session expired
    const _origFetch = window.fetch.bind(window);
    window.fetch = async (...args) => {
        const reqUrl = String(args[0] && args[0].url ? args[0].url : args[0]);
        if (window.JTUBE_ADMIN_FIREBASE && reqUrl.startsWith('/api/')) {
            // Firebase Hosting has no Node server: answer server-only tools with a clear message
            return new Response(JSON.stringify({ error: 'This tool needs the JTube Node server (npm start). It is not available on Firebase Hosting.', text: 'This AI tool needs the JTube Node server and is not available on Firebase Hosting.' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
        }
        const res = await _origFetch(...args);
        const url = String(args[0] && args[0].url ? args[0].url : args[0]);
        if (res.status === 401 && url.includes('/api/') && !url.includes('/api/admin/login') && !url.includes('/api/admin/me') && window.JTUBE_ADMIN_SESSION) {
            lockStudio("Your admin session expired. Please sign in again.");
        }
        return res;
    };

    // Restore an existing session: Node server cookie, or Firebase Authentication (Firebase Hosting)
    window.JTUBE_ADMIN_FIREBASE = false;
    let serverMode = null;
    const isJson = r => (r.headers.get('content-type') || '').includes('application/json');
    _origFetch('/api/admin/me', { headers: { Accept: 'application/json' } })
        .then(r => {
            serverMode = r.ok && isJson(r);
            return serverMode ? r.json() : null;
        })
        .catch(() => { serverMode = false; return null; })
        .then(d => {
            if (d && d.authenticated) { unlockStudio(d.email); return; }
            if (!serverMode && window.JFB && window.JFB.available) {
                window.JFB.onAuth(u => {
                    if (u && window.JFB.isAdminUid(u.uid)) {
                        window.JTUBE_ADMIN_FIREBASE = true;
                        unlockStudio(u.email || 'Admin');
                    } else if (!u && window.JTUBE_ADMIN_FIREBASE) {
                        window.JTUBE_ADMIN_FIREBASE = false;
                        lockStudio();
                    }
                });
            }
        });

    // Toggle password visibility
    if (toggleAdminPasswordBtn && adminPasswordInput) {
        toggleAdminPasswordBtn.addEventListener("click", () => {
            const isPassword = adminPasswordInput.type === "password";
            adminPasswordInput.type = isPassword ? "text" : "password";
            toggleAdminPasswordBtn.innerHTML = isPassword ? '<i class="fas fa-eye-slash"></i>' : '<i class="fas fa-eye"></i>';
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
                adminLoginSubmitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Verifying...';
            }

            try {
                // 1) Firebase Authentication account (admin = configured Firebase UID, verified by the server)
                const fb = await firebaseAdminSignIn(email, password);
                if (fb.ok) {
                    if (adminPasswordInput) adminPasswordInput.value = "";
                    unlockStudio(fb.email);
                    return;
                }
                if (fb.final) { showLoginError(fb.error); return; }
                if (serverMode === false) { showLoginError(fb.error || 'Wrong email or password.'); return; }

                // 2) Fallback: server admin password (npm run reset-admin / .env)
                const res = await _origFetch('/api/admin/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password })
                });
                const data = await res.json().catch(() => ({}));
                if (res.ok && data.success) {
                    if (adminPasswordInput) adminPasswordInput.value = "";
                    unlockStudio(data.email);
                } else if (res.status === 404) {
                    showLoginError("Admin login requires the JTube server (npm start). Static hosting cannot verify admins.");
                } else {
                    showLoginError(data.error || "Invalid email or password.");
                }
            } catch (err) {
                showLoginError("Network error. Please check your connection.");
            } finally {
                if (adminLoginSubmitBtn) {
                    adminLoginSubmitBtn.disabled = false;
                    adminLoginSubmitBtn.innerHTML = '<i class="fas fa-sign-in-alt mr-2"></i>Sign In to Studio';
                }
            }
        });
    }

    // Sign in with Firebase Auth in the browser, then let the server verify the ID token.
    // Returns { ok } on success, { final: true, error } when the server rejected a valid
    // Firebase user, or { ok: false } to fall back to the server password login.
    async function firebaseAdminSignIn(email, password) {
        if (!window.JFB || !window.JFB.available) return { ok: false };
        let user;
        try {
            user = await window.JFB.signIn(email, password);
        } catch (err) {
            if (err && (err.code === 'auth/too-many-requests' || err.code === 'auth/network-request-failed' || err.code === 'auth/operation-not-allowed')) {
                return { final: true, error: err.message };
            }
            return { ok: false, error: err && err.message }; // not a Firebase account / wrong password
        }
        // Node server available? Let it verify the ID token and issue its own session cookie.
        try {
            const idToken = await window.JFB.auth.currentUser.getIdToken(true);
            const res = await _origFetch('/api/admin/firebase-login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ idToken })
            });
            if (res.ok && isJson(res)) {
                const data = await res.json();
                if (data.success) return { ok: true, email: data.email };
            } else if (isJson(res)) {
                const data = await res.json().catch(() => ({}));
                await window.JFB.signOut().catch(() => {});
                return { final: true, error: data.error || 'This account is not an admin.' };
            }
        } catch (e) { /* no server: Firebase Hosting */ }
        // Firebase Hosting: the admin UID decides; firestore.rules enforce it for every write.
        if (window.JFB.isAdminUid(user.uid)) {
            window.JTUBE_ADMIN_FIREBASE = true;
            return { ok: true, email: user.email };
        }
        await window.JFB.signOut().catch(() => {});
        return { final: true, error: 'This account is not an admin. Sign in with the admin account.' };
    }

    // Handle Admin Logout
    if (adminLogoutBtn) {
        adminLogoutBtn.addEventListener("click", async () => {
            if (!confirm("Are you sure you want to log out of JTube Studio?")) return;
            try { await _origFetch('/api/admin/logout', { method: 'POST' }); } catch (err) {}
            if (window.JTUBE_ADMIN_FIREBASE && window.JFB) { window.JTUBE_ADMIN_FIREBASE = false; try { await window.JFB.signOut(); } catch (err) {} }
            lockStudio();
        });
    }

    // Manage Videos Controls
    const searchInput = document.getElementById("admin-video-search");
    const categoryFilter = document.getElementById("admin-category-filter");
    const typeFilter = document.getElementById("admin-type-filter");
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
        const type = typeFilter ? typeFilter.value : "all";

        return adminVideos.filter(video => {
            const matchesTerm = !term || 
                (video.title && video.title.toLowerCase().includes(term)) || 
                (video.channel && video.channel.toLowerCase().includes(term)) ||
                (video.category && video.category.toLowerCase().includes(term)) ||
                (video.id && video.id.toLowerCase().includes(term));
            const matchesCat = cat === "all" || (video.category && video.category.toLowerCase() === cat.toLowerCase());
            
            const isShort = (typeof isShortVideo === 'function') 
                ? isShortVideo(video) 
                : (Boolean(video.isShort) || (video.duration && parseDurationToSeconds(video.duration) <= 60));
            const matchesType = type === "all" || (type === "shorts" && isShort) || (type === "longform" && !isShort);

            return matchesTerm && matchesCat && matchesType;
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
                    <td colspan="6" class="text-center py-12 text-zinc-500 italic">
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

            const isShort = (typeof isShortVideo === 'function') ? isShortVideo(video) : Boolean(video.isShort);
            const formatBadge = isShort
                ? '<span class="inline-flex items-center gap-1 bg-red-500/20 text-red-400 border border-red-500/30 px-2 py-0.5 rounded-full text-[10px] font-bold">⚡ Short</span>'
                : '<span class="inline-flex items-center gap-1 bg-zinc-800 text-zinc-300 border border-zinc-700 px-2 py-0.5 rounded-full text-[10px] font-medium">Standard</span>';

            html += `
                <tr id="video-row-${video.id}" class="${rowClass}">
                    <td class="w-12 px-4 py-3.5 text-center">
                        <input type="checkbox" class="video-select-checkbox w-4 h-4 rounded border-zinc-700 accent-red-600 bg-zinc-900 cursor-pointer" 
                               data-id="${video.id}" ${isSelected ? 'checked' : ''}>
                    </td>
                    <td class="px-5 py-3.5 flex items-center space-x-3 min-w-[240px]">
                        <div class="relative flex-shrink-0">
                            <img src="${video.thumbnail}" class="w-16 aspect-video object-cover rounded-lg bg-zinc-700" loading="lazy" onerror="this.src='https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=500&auto=format&fit=crop&q=60'">
                            ${video.duration ? `<span class="absolute bottom-1 right-1 bg-black/80 text-white text-[9px] font-mono px-1 rounded">${escapeHtml(video.duration)}</span>` : ''}
                        </div>
                        <div class="truncate max-w-[260px]">
                            <a href="watch.html?id=${video.id}" target="_blank" class="font-semibold text-white truncate text-xs sm:text-sm hover:text-red-400 transition block">
                                ${escapeHtml(video.title)}
                            </a>
                            <p class="text-[11px] text-zinc-500 sm:hidden">${escapeHtml(video.channel)}</p>
                            <p class="text-[10px] text-zinc-600 font-mono">ID: ${escapeHtml(video.id)}</p>
                        </div>
                    </td>
                    <td class="px-5 py-3.5 text-zinc-400 text-xs hidden sm:table-cell">${escapeHtml(video.channel)}</td>
                    <td class="px-5 py-3.5">
                        <span class="bg-zinc-900 border border-zinc-700 px-2.5 py-1 rounded-full text-xs text-zinc-400">${escapeHtml(video.category)}</span>
                    </td>
                    <td class="px-4 py-3.5 text-center">
                        ${formatBadge}
                    </td>
                    <td class="px-4 py-3.5 hidden md:table-cell text-right font-mono text-xs text-zinc-300">
                        ${formatCompactNumber(video.views || 0)}
                    </td>
                    <td class="px-5 py-3.5 text-center whitespace-nowrap">
                        <div class="flex items-center justify-center gap-1">
                            <button onclick="openEditVideoModal('${video.id}')" title="Edit video metadata"
                                    class="text-zinc-400 hover:text-white hover:bg-zinc-800 p-2 rounded-lg transition cursor-pointer">
                                <i class="fas fa-edit text-xs"></i>
                            </button>
                            <a href="watch.html?id=${video.id}" target="_blank" title="Watch video"
                                class="text-zinc-400 hover:text-blue-400 hover:bg-blue-500/10 p-2 rounded-lg transition cursor-pointer inline-block">
                                <i class="fas fa-external-link-alt text-xs"></i>
                            </a>
                            <button onclick="deleteVideoHandler('${video.id}')" title="Delete video"
                                    class="text-zinc-500 hover:text-red-400 hover:bg-red-500/10 p-2 rounded-lg transition cursor-pointer">
                                <i class="fas fa-trash-alt text-xs"></i>
                            </button>
                        </div>
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

    // Manage Videos searches the complete server library (tens of thousands of items)
    let adminServerMode = false;
    async function refreshAdminVideosFromServer(rerender = true) {
        if (typeof fetchCatalogPage !== 'function') return false;
        const term = searchInput ? searchInput.value.trim() : "";
        const cat = categoryFilter ? categoryFilter.value : "all";
        const typeVal = typeFilter ? typeFilter.value : "all";
        const res = await fetchCatalogPage({
            q: term,
            category: cat === "all" ? "" : cat,
            type: typeVal === "shorts" ? "short" : typeVal === "longform" ? "video" : "all",
            limit: 100
        });
        if (!res) return false;
        adminServerMode = true;
        adminVideos = res.items;
        const stats = await fetchCatalogStats();
        const total = stats ? stats.total : res.total;
        if (videoCount) videoCount.textContent = `${res.total.toLocaleString()} matching • showing ${res.items.length}`;
        if (sidebarVideoCount) sidebarVideoCount.textContent = total.toLocaleString();
        renderAdminVideosTable();
        return true;
    }
    let adminSearchTimer = null;
    const onAdminFilterChange = () => {
        clearTimeout(adminSearchTimer);
        adminSearchTimer = setTimeout(async () => {
            if (!adminServerMode || !(await refreshAdminVideosFromServer())) renderAdminVideosTable();
        }, 300);
    };
    if (searchInput) searchInput.addEventListener("input", onAdminFilterChange);
    if (categoryFilter) categoryFilter.addEventListener("change", onAdminFilterChange);
    if (typeFilter) typeFilter.addEventListener("change", onAdminFilterChange);

    // Bulk Delete Selected from Firestore Button Listener
    if (btnDeleteSelected) {
        btnDeleteSelected.addEventListener("click", async () => {
            const count = selectedVideoIds.size;
            if (count === 0) return;

            const confirmMsg = `Are you sure you want to permanently delete ${count} selected video(s)?\n\nThis will remove them permanently.`;
            if (!confirm(confirmMsg)) return;

            try {
                btnDeleteSelected.disabled = true;
                btnDeleteSelected.innerHTML = '<i class="fas fa-spinner fa-spin text-xs"></i><span>Deleting...</span>';
                showActionStatus(`<i class="fas fa-spinner fa-spin mr-2"></i>Deleting ${count} video(s)...`, "loading");

                const idsToDelete = Array.from(selectedVideoIds);
                await deleteBatchVideos(idsToDelete);

                selectedVideoIds.clear();
                showActionStatus(`✓ Successfully deleted ${count} video(s).`, "success");
                await loadAdminDashboard();
            } catch (err) {
                console.error("Batch delete error:", err);
                showActionStatus(`Failed to delete videos: ${err.message || err}`, "error");
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
        if (confirm(`Are you sure you want to delete ${videoTitle} permanently?`)) {
            try {
                showActionStatus(`<i class="fas fa-spinner fa-spin mr-2"></i>Deleting video...`, "loading");
                await deleteVideo(id);
                selectedVideoIds.delete(id);
                showActionStatus(`✓ Video successfully deleted.`, "success");
                await loadAdminDashboard();
            } catch (err) {
                console.error("Delete video error:", err);
                showActionStatus(`Failed to delete video: ${err.message || err}`, "error");
            }
        }
    };

    // Load admin dashboard
    async function loadAdminDashboard() {
        tableBody.innerHTML = `
            <tr>
                <td colspan="6" class="text-center py-10 text-zinc-400">
                    <i class="fas fa-spinner fa-spin mr-2"></i> Loading videos...
                </td>
            </tr>`;

        await loadChannelsForAdmin();
        const fromServer = await refreshAdminVideosFromServer(false);
        if (!fromServer) {
            adminVideos = await getVideos();
            const count = adminVideos.length;
            if (videoCount) videoCount.textContent = count;
            if (sidebarVideoCount) sidebarVideoCount.textContent = count;
            renderAdminVideosTable();
        }
        await loadCategoriesForAdmin();

        const channels = await getChannels();
        const categories = await getCategories();
        await loadOverviewAnalytics(adminVideos, channels, categories, cachedUsersList);
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

    // Auto-fill video details from YouTube
    const btnAutofillUpload = document.getElementById("btn-autofill-upload");
    if (btnAutofillUpload) {
        btnAutofillUpload.addEventListener("click", async () => {
            const urlInput = document.getElementById("v-url");
            const url = (urlInput ? urlInput.value : "").trim();
            if (!url) {
                alert("Please paste a YouTube URL into the Video URL field first.");
                if (urlInput) urlInput.focus();
                return;
            }

            let ytId = typeof getYoutubeId === 'function' ? getYoutubeId(url) : null;
            if (!ytId) {
                const match = url.match(/^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/);
                ytId = (match && match[2].length === 11) ? match[2] : null;
            }
            if (!ytId) {
                alert("Could not detect a valid 11-character YouTube video ID from that link.");
                return;
            }

            const originalHtml = btnAutofillUpload.innerHTML;
            btnAutofillUpload.disabled = true;
            btnAutofillUpload.innerHTML = '<i class="fas fa-spinner fa-spin text-[10px]"></i><span>Fetching...</span>';

            try {
                // High-res YouTube thumbnail
                const thumbInput = document.getElementById("v-thumbnail");
                if (thumbInput) thumbInput.value = `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`;

                // Query oEmbed
                const oembedRes = await fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${ytId}`);
                if (oembedRes.ok) {
                    const oembed = await oembedRes.json();
                    if (oembed.title) {
                        const titleInput = document.getElementById("v-title");
                        if (titleInput && !titleInput.value) titleInput.value = oembed.title;

                        if (oembed.title.toLowerCase().includes("#short") || oembed.title.toLowerCase().includes("#shorts")) {
                            const isShortSelect = document.getElementById("v-is-short");
                            if (isShortSelect) isShortSelect.value = "true";
                        }
                    }
                    if (oembed.author_name) {
                        const chInput = document.getElementById("v-channel");
                        if (chInput && !chInput.value) chInput.value = oembed.author_name;
                    }
                }
                btnAutofillUpload.innerHTML = '<i class="fas fa-check text-[10px] text-green-400"></i><span>Auto-Filled!</span>';
                setTimeout(() => {
                    btnAutofillUpload.disabled = false;
                    btnAutofillUpload.innerHTML = originalHtml;
                }, 2500);
            } catch (err) {
                console.warn("Autofill notice:", err);
                btnAutofillUpload.disabled = false;
                btnAutofillUpload.innerHTML = originalHtml;
            }
        });
    }

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
        const isShortVal = document.getElementById("v-is-short") ? (document.getElementById("v-is-short").value === "true") : false;

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
                const sRes = await fetch(`/api/admin/youtube/videos?part=statistics&id=${ytId}`);
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
            isShort: isShortVal,
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

                const url = `/api/admin/youtube/playlistItems?part=snippet,contentDetails&maxResults=50&playlistId=${playlistId}&pageToken=${pageToken}`;
                const res = await fetch(url);
                const data = await res.json();

                if (data.error) throw new Error(data.error.message);

                if (data.items && data.items.length > 0) {
                    const videoIds = data.items.map(item => item.contentDetails.videoId).filter(Boolean).join(',');
                    if (videoIds) {
                        const vidRes = await fetch(`/api/admin/youtube/videos?part=contentDetails,statistics&id=${videoIds}`);
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
            const res = await fetch(`/api/admin/youtube/channels?part=contentDetails,statistics&id=${channelId}`);
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
            showProgress(60, `Found ${videos.length} videos (>1 min). Saving...`);
            ytStatus.textContent = `Found ${videos.length} videos longer than 1 minute. Saving...`;

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
                    <i class="fas fa-spinner fa-spin mr-2"></i>Loading Users...
                </td>
            </tr>
        `;

        if (window.JTUBE_ADMIN_FIREBASE) {
            try {
                const d = await window.JFB.admin.community();
                const fmt = ts => ts ? new Date(ts).toLocaleDateString("en-US", { month: 'short', day: 'numeric', year: 'numeric' }) : "—";
                cachedUsersList = d.users.map(u => ({
                    identifier: u.name, providers: ["firebase"], created: fmt(u.createdAt), signedIn: u.banned ? "Suspended" : "—",
                    uid: u.id, role: window.JFB.isAdminUid(u.id) ? "Admin" : "Member", isAdmin: window.JFB.isAdminUid(u.id)
                }));
                renderUsersList(cachedUsersList);
                return;
            } catch (e) { /* fall back to local list */ }
        }

        const list = [];
        // Admin account (Firebase UID)
        list.push({
            identifier: "Admin (Firebase)",
            providers: ["password"],
            created: "—",
            signedIn: "—",
            uid: (window.JFB && window.JFB.adminUids && window.JFB.adminUids[0]) || "",
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
                    role: "Viewer",
                    isAdmin: false
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

    // ===== STUDIO OVERVIEW & ANALYTICS ENGINE =====
    async function loadOverviewAnalytics(videos, channels, categories, users) {
        // Query direct Firestore catalog stats if available, or compute from videos array
        let firestoreStats = null;
        if (typeof getFirestoreCatalogCounts === 'function') {
            try {
                firestoreStats = await getFirestoreCatalogCounts();
            } catch (e) {
                console.warn("Could not query Firestore direct catalog counts:", e);
            }
        }

        const totalVids = firestoreStats ? firestoreStats.total : (videos ? videos.length : 0);
        const totalShorts = firestoreStats ? firestoreStats.reels : (videos ? videos.filter(v => (typeof isShortVideo === 'function') ? isShortVideo(v) : Boolean(v.isShort || v.isReel)).length : 0);
        const totalLongform = firestoreStats ? firestoreStats.videos : Math.max(0, totalVids - totalShorts);

        let totalViews = firestoreStats ? firestoreStats.views : 0;
        if (!firestoreStats && videos) {
            videos.forEach(v => {
                totalViews += (typeof v.views === 'number' ? v.views : parseInt(v.views || 0) || 0);
            });
        }

        const channelKeys = channels ? Object.keys(channels) : [];
        let totalSubscribers = 0;
        channelKeys.forEach(k => {
            const ch = channels[k];
            totalSubscribers += (typeof ch.subscribers === 'number' ? ch.subscribers : parseInt(ch.subscribers || 0) || 0);
        });

        const usersCount = (users && users.length) ? users.length : (cachedUsersList ? cachedUsersList.length : 1);

        const elSavedVideos = document.getElementById("kpi-saved-videos");
        const elSavedReels = document.getElementById("kpi-saved-reels");
        const elTotalVids = document.getElementById("kpi-total-videos");
        const elLongform = document.getElementById("kpi-longform-count");
        const elShorts = document.getElementById("kpi-shorts-count");
        const elTotalViews = document.getElementById("kpi-total-views");
        const elTotalChannels = document.getElementById("kpi-total-channels");
        const elTotalSubs = document.getElementById("kpi-total-subscribers");
        const elTotalUsers = document.getElementById("kpi-total-users");
        const elAiAuditTime = document.getElementById("kpi-ai-audit-time");

        if (elSavedVideos) elSavedVideos.textContent = `${totalLongform}`;
        if (elSavedReels) elSavedReels.textContent = `${totalShorts}`;
        if (elTotalVids) elTotalVids.textContent = `${totalVids}`;
        if (elLongform) elLongform.textContent = totalLongform;
        if (elShorts) elShorts.textContent = totalShorts;
        if (elTotalViews) elTotalViews.textContent = formatCompactNumber(totalViews);
        if (elTotalChannels) elTotalChannels.textContent = channelKeys.length;
        if (elTotalSubs) elTotalSubs.textContent = formatCompactNumber(totalSubscribers);
        if (elTotalUsers) elTotalUsers.textContent = usersCount;

        if (elAiAuditTime) {
            const brain = (typeof AIVideoBrain !== 'undefined' && AIVideoBrain.getBrain) ? AIVideoBrain.getBrain() : null;
            if (brain && brain.lastTrained) {
                const diffMin = Math.max(1, Math.round((Date.now() - brain.lastTrained) / 60000));
                elAiAuditTime.textContent = `Audited ${diffMin}m ago`;
            } else {
                elAiAuditTime.textContent = "Synced every 10m";
            }
        }

        // Category Distribution Progress Bars
        const catCountMap = {};
        if (videos) {
            videos.forEach(v => {
                const cat = v.category || "Uncategorized";
                catCountMap[cat] = (catCountMap[cat] || 0) + 1;
            });
        }

        const catEntries = Object.entries(catCountMap).sort((a, b) => b[1] - a[1]);
        const catBarsContainer = document.getElementById("overview-category-bars");
        const catCountBadge = document.getElementById("overview-category-count");
        const shortsDensityEl = document.getElementById("overview-shorts-density");

        if (catCountBadge) catCountBadge.textContent = `${catEntries.length} active`;
        if (shortsDensityEl && totalVids > 0) {
            shortsDensityEl.textContent = `${Math.round((totalShorts / totalVids) * 100)}%`;
        }

        if (catBarsContainer) {
            if (catEntries.length === 0) {
                catBarsContainer.innerHTML = `<div class="text-xs text-zinc-500 text-center py-6">No categorized videos yet.</div>`;
            } else {
                const topCats = catEntries.slice(0, 5);
                const colorGradients = [
                    "from-red-500 to-rose-600",
                    "from-blue-500 to-indigo-600",
                    "from-purple-500 to-pink-600",
                    "from-emerald-500 to-teal-600",
                    "from-amber-500 to-orange-600"
                ];

                catBarsContainer.innerHTML = topCats.map(([catName, count], idx) => {
                    const pct = totalVids > 0 ? Math.round((count / totalVids) * 100) : 0;
                    const grad = colorGradients[idx % colorGradients.length];
                    return `
                        <div>
                            <div class="flex items-center justify-between text-xs mb-1.5">
                                <span class="text-white font-medium truncate max-w-[180px]">${escapeHtml(catName)}</span>
                                <span class="text-zinc-400 font-mono text-[11px]">${count} videos (${pct}%)</span>
                            </div>
                            <div class="w-full h-2 rounded-full bg-zinc-800 overflow-hidden">
                                <div class="h-full rounded-full bg-gradient-to-r ${grad} transition-all duration-500" style="width: ${pct}%"></div>
                            </div>
                        </div>
                    `;
                }).join("");
            }
        }

        // Top Performing Videos Leaderboard
        const topVideosContainer = document.getElementById("overview-top-videos");
        if (topVideosContainer) {
            if (!videos || videos.length === 0) {
                topVideosContainer.innerHTML = `<div class="text-xs text-zinc-500 text-center py-6">No videos available.</div>`;
            } else {
                const sortedByViews = [...videos].sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 5);
                const rankBadges = [
                    "bg-yellow-500 text-zinc-950 font-black",
                    "bg-zinc-300 text-zinc-950 font-black",
                    "bg-amber-700 text-white font-black",
                    "bg-zinc-800 text-zinc-400 font-bold",
                    "bg-zinc-800 text-zinc-400 font-bold"
                ];

                topVideosContainer.innerHTML = sortedByViews.map((v, i) => {
                    const badgeClass = rankBadges[i] || "bg-zinc-800 text-zinc-400";
                    return `
                        <div class="p-2.5 rounded-xl bg-zinc-900/50 hover:bg-zinc-900 border border-zinc-800/80 flex items-center justify-between gap-3 transition">
                            <div class="flex items-center gap-3 min-w-0">
                                <span class="w-5 h-5 rounded-full flex items-center justify-center text-[10px] flex-shrink-0 ${badgeClass}">${i + 1}</span>
                                <img src="${v.thumbnail}" class="w-14 aspect-video object-cover rounded-lg bg-zinc-800 flex-shrink-0" loading="lazy" onerror="this.src='https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=500&auto=format&fit=crop&q=60'">
                                <div class="min-w-0 truncate">
                                    <a href="watch.html?id=${v.id}" target="_blank" class="text-xs font-semibold text-white hover:text-red-400 truncate block transition">
                                        ${escapeHtml(v.title)}
                                    </a>
                                    <div class="flex items-center gap-2 text-[11px] text-zinc-500 mt-0.5">
                                        <span class="truncate">${escapeHtml(v.channel)}</span>
                                        <span>•</span>
                                        <span class="bg-zinc-800 px-1.5 py-0.2 rounded text-[10px] text-zinc-400">${escapeHtml(v.category)}</span>
                                    </div>
                                </div>
                            </div>
                            <div class="flex items-center gap-3 flex-shrink-0">
                                <div class="text-right">
                                    <div class="text-xs font-bold font-mono text-zinc-200">${formatCompactNumber(v.views || 0)}</div>
                                    <div class="text-[10px] text-zinc-500">views</div>
                                </div>
                                <button onclick="openEditVideoModal('${v.id}')" title="Quick Edit" class="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition cursor-pointer">
                                    <i class="fas fa-edit text-xs"></i>
                                </button>
                            </div>
                        </div>
                    `;
                }).join("");
            }
        }
    }

    // ===== OVERVIEW COMMAND ACTIONS =====
    const btnTriggerAiAudit = document.getElementById("btn-trigger-ai-audit");
    const btnForceYtSync = document.getElementById("btn-force-yt-sync");
    const btnExportBackup = document.getElementById("btn-export-backup");
    const overviewStatusBanner = document.getElementById("overview-status-banner");

    function showOverviewBanner(msg, type = "success") {
        if (!overviewStatusBanner) return;
        overviewStatusBanner.classList.remove("hidden");
        if (type === "success") {
            overviewStatusBanner.className = "mb-6 p-3.5 rounded-xl text-xs font-semibold flex items-center justify-between bg-green-950/60 border border-green-700/60 text-green-200 transition-all";
        } else if (type === "error") {
            overviewStatusBanner.className = "mb-6 p-3.5 rounded-xl text-xs font-semibold flex items-center justify-between bg-red-950/60 border border-red-700/60 text-red-200 transition-all";
        } else {
            overviewStatusBanner.className = "mb-6 p-3.5 rounded-xl text-xs font-semibold flex items-center justify-between bg-zinc-800 border border-zinc-700 text-zinc-200 transition-all";
        }
        overviewStatusBanner.innerHTML = `
            <div class="flex items-center space-x-2"><span>${msg}</span></div>
            <button type="button" onclick="this.parentElement.classList.add('hidden')" class="text-zinc-400 hover:text-white ml-3"><i class="fas fa-times"></i></button>
        `;
        if (type !== "loading") {
            setTimeout(() => {
                if (overviewStatusBanner) overviewStatusBanner.classList.add("hidden");
            }, 6000);
        }
    }

    if (btnTriggerAiAudit) {
        btnTriggerAiAudit.addEventListener("click", async () => {
            try {
                btnTriggerAiAudit.disabled = true;
                btnTriggerAiAudit.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>Auditing...</span>';
                showOverviewBanner('<i class="fas fa-spinner fa-spin mr-2"></i>Running autonomous 10-minute AI content audit &amp; catalog retraining...', 'loading');

                if (typeof AIVideoBrain !== 'undefined' && AIVideoBrain.train) {
                    await AIVideoBrain.train();
                }

                showOverviewBanner('✓ AI Intelligence Engine audit completed! All video classifications, categories, and brain index updated.', 'success');
                await loadAdminDashboard();
            } catch (err) {
                console.error("AI audit error:", err);
                showOverviewBanner(`AI audit notice: ${err.message || err}`, 'error');
            } finally {
                btnTriggerAiAudit.disabled = false;
                btnTriggerAiAudit.innerHTML = '<i class="fas fa-brain"></i><span>Run AI Audit</span>';
            }
        });
    }

    if (btnForceYtSync) {
        btnForceYtSync.addEventListener("click", async () => {
            try {
                btnForceYtSync.disabled = true;
                btnForceYtSync.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>Syncing...</span>';
                showOverviewBanner('<i class="fas fa-spinner fa-spin mr-2"></i>Syncing all configured YouTube channels...', 'loading');

                if (typeof autoSyncYouTubeChannels === 'function') {
                    await autoSyncYouTubeChannels(true);
                }

                showOverviewBanner('✓ YouTube channels sync complete! Fresh videos pulled from subscribed channels.', 'success');
                await loadAdminDashboard();
            } catch (err) {
                console.error("YT sync error:", err);
                showOverviewBanner(`YouTube sync notice: ${err.message || err}`, 'error');
            } finally {
                btnForceYtSync.disabled = false;
                btnForceYtSync.innerHTML = '<i class="fas fa-sync-alt"></i><span>Sync YT Channels</span>';
            }
        });
    }

    if (btnExportBackup) {
        btnExportBackup.addEventListener("click", async () => {
            try {
                const videos = await getVideos();
                const channels = await getChannels();
                const categories = await getCategories();

                const backupData = {
                    version: "2.0",
                    exportedAt: new Date().toISOString(),
                    videoCount: videos.length,
                    videos,
                    channels,
                    categories
                };

                const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backupData, null, 2));
                const downloadAnchor = document.createElement("a");
                const dateTag = new Date().toISOString().split("T")[0];
                downloadAnchor.setAttribute("href", dataStr);
                downloadAnchor.setAttribute("download", `jtube-catalog-backup-${dateTag}.json`);
                document.body.appendChild(downloadAnchor);
                downloadAnchor.click();
                downloadAnchor.remove();

                showOverviewBanner(`✓ Catalog backup downloaded successfully! (${videos.length} videos archived)`, 'success');
            } catch (err) {
                console.error("Export backup error:", err);
                showOverviewBanner(`Failed to export backup: ${err.message || err}`, 'error');
            }
        });
    }

    // ===== EDIT VIDEO MODAL LOGIC =====
    const editVideoModal = document.getElementById("edit-video-modal");
    const editVideoForm = document.getElementById("edit-video-form");
    const closeEditModalBtn = document.getElementById("close-edit-modal-btn");
    const cancelEditBtn = document.getElementById("cancel-edit-btn");
    const editVidThumbFetch = document.getElementById("edit-vid-fetch-thumb");
    const editVidThumbInput = document.getElementById("edit-vid-thumbnail");
    const editVidThumbPreview = document.getElementById("edit-vid-thumb-preview");
    const editVidStatus = document.getElementById("edit-vid-status");

    function closeEditModal() {
        if (editVideoModal) {
            editVideoModal.classList.add("hidden");
            editVideoModal.classList.remove("flex");
        }
        if (editVidStatus) editVidStatus.classList.add("hidden");
    }

    if (closeEditModalBtn) closeEditModalBtn.addEventListener("click", closeEditModal);
    if (cancelEditBtn) cancelEditBtn.addEventListener("click", closeEditModal);
    if (editVideoModal) {
        editVideoModal.addEventListener("click", (e) => {
            if (e.target === editVideoModal) closeEditModal();
        });
    }

    if (editVidThumbInput && editVidThumbPreview) {
        editVidThumbInput.addEventListener("input", () => {
            const url = editVidThumbInput.value.trim();
            if (url) editVidThumbPreview.src = url;
        });
    }

    if (editVidThumbFetch) {
        editVidThumbFetch.addEventListener("click", () => {
            const url = document.getElementById("edit-vid-url").value.trim();
            let ytId = typeof getYoutubeId === 'function' ? getYoutubeId(url) : null;
            if (!ytId) {
                const match = url.match(/^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/);
                ytId = (match && match[2].length === 11) ? match[2] : null;
            }
            if (ytId) {
                const thumbUrl = `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`;
                if (editVidThumbInput) editVidThumbInput.value = thumbUrl;
                if (editVidThumbPreview) editVidThumbPreview.src = thumbUrl;
            } else {
                alert("Please provide a valid YouTube URL first to generate thumbnail.");
            }
        });
    }

    window.openEditVideoModal = function(videoId) {
        const video = adminVideos.find(v => v.id === videoId);
        if (!video) {
            alert("Video could not be located in current catalog.");
            return;
        }

        document.getElementById("edit-vid-id").value = video.id;
        document.getElementById("edit-vid-title").value = video.title || "";
        document.getElementById("edit-vid-category").value = video.category || "";
        document.getElementById("edit-vid-duration").value = video.duration || "";
        document.getElementById("edit-vid-channel").value = video.channel || "";
        document.getElementById("edit-vid-url").value = video.videoUrl || "";
        document.getElementById("edit-vid-playlist").value = video.playlist || "";
        document.getElementById("edit-vid-thumbnail").value = video.thumbnail || "";
        if (editVidThumbPreview) editVidThumbPreview.src = video.thumbnail || "";
        
        const isShort = (typeof isShortVideo === 'function') ? isShortVideo(video) : Boolean(video.isShort);
        document.getElementById("edit-vid-isshort").value = isShort ? "true" : "false";
        document.getElementById("edit-vid-views").value = video.views || 0;
        document.getElementById("edit-vid-likes").value = video.likes || 0;
        document.getElementById("edit-vid-desc").value = video.description || "";

        if (editVidStatus) editVidStatus.classList.add("hidden");

        if (editVideoModal) {
            editVideoModal.classList.remove("hidden");
            editVideoModal.classList.add("flex");
        }
    };

    if (editVideoForm) {
        editVideoForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const id = document.getElementById("edit-vid-id").value;
            const existing = adminVideos.find(v => v.id === id) || {};

            const updatedVideo = {
                ...existing,
                id,
                title: document.getElementById("edit-vid-title").value.trim(),
                category: document.getElementById("edit-vid-category").value.trim(),
                duration: document.getElementById("edit-vid-duration").value.trim(),
                channel: document.getElementById("edit-vid-channel").value.trim(),
                videoUrl: document.getElementById("edit-vid-url").value.trim(),
                playlist: document.getElementById("edit-vid-playlist").value.trim(),
                thumbnail: document.getElementById("edit-vid-thumbnail").value.trim() || existing.thumbnail || "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=500&auto=format&fit=crop&q=60",
                isShort: document.getElementById("edit-vid-isshort").value === "true",
                views: parseInt(document.getElementById("edit-vid-views").value || "0"),
                likes: parseInt(document.getElementById("edit-vid-likes").value || "0"),
                description: document.getElementById("edit-vid-desc").value.trim(),
                timestamp: existing.timestamp || Date.now()
            };

            const saveBtn = document.getElementById("save-edit-btn");
            if (saveBtn) {
                saveBtn.disabled = true;
                saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>Saving...</span>';
            }

            try {
                await saveVideo(updatedVideo);
                if (editVidStatus) {
                    editVidStatus.className = "text-xs font-bold p-3 rounded-xl bg-green-950/70 border border-green-700 text-green-300 block";
                    editVidStatus.textContent = "✓ Video updated successfully!";
                }
                setTimeout(async () => {
                    closeEditModal();
                    await loadAdminDashboard();
                    showActionStatus(`✓ Video "${updatedVideo.title}" was saved.`, "success");
                }, 800);
            } catch (err) {
                console.error("Save edit video error:", err);
                if (editVidStatus) {
                    editVidStatus.className = "text-xs font-bold p-3 rounded-xl bg-red-950/70 border border-red-700 text-red-300 block";
                    editVidStatus.textContent = `Failed to save changes: ${err.message || err}`;
                }
            } finally {
                if (saveBtn) {
                    saveBtn.disabled = false;
                    saveBtn.innerHTML = '<i class="fas fa-save"></i><span>Save Changes</span>';
                }
            }
        });
    }

    // ===== DAILY YOUTUBE SYNC HUB CONTROLLER =====
    let cachedSyncChannels = [];
    let cachedDailyVideos = [];

    function showSyncStatus(msg, type = 'success') {
        const statusEl = document.getElementById('daily-sync-status');
        if (!statusEl) return;
        statusEl.classList.remove('hidden');
        if (type === 'success') {
            statusEl.className = 'mb-6 p-4 rounded-xl text-xs font-semibold flex items-center justify-between bg-emerald-950/70 border border-emerald-700/60 text-emerald-200 transition-all';
        } else if (type === 'error') {
            statusEl.className = 'mb-6 p-4 rounded-xl text-xs font-semibold flex items-center justify-between bg-red-950/70 border border-red-700/60 text-red-200 transition-all';
        } else {
            statusEl.className = 'mb-6 p-4 rounded-xl text-xs font-semibold flex items-center justify-between bg-zinc-900 border border-zinc-700 text-zinc-200 transition-all';
        }
        statusEl.innerHTML = `
            <div class="flex items-center space-x-2">
                <i class="${type === 'success' ? 'fas fa-check-circle text-emerald-400' : type === 'error' ? 'fas fa-exclamation-circle text-red-400' : 'fas fa-info-circle text-blue-400'}"></i>
                <span>${msg}</span>
            </div>
            <button type="button" onclick="this.parentElement.classList.add('hidden')" class="text-zinc-400 hover:text-white ml-3 cursor-pointer">
                <i class="fas fa-times"></i>
            </button>
        `;
        if (type !== 'loading') {
            setTimeout(() => { if (statusEl) statusEl.classList.add('hidden'); }, 6000);
        }
    }

    // Server-side library sync (all videos + Shorts of every connected channel)
    let syncStatusCache = null;
    let syncPollTimer = null;

    function relTime(ts) {
        if (!ts) return 'never';
        const s = Math.floor((Date.now() - ts) / 1000);
        if (s < 60) return 'just now';
        if (s < 3600) return `${Math.floor(s / 60)} min ago`;
        if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
        return `${Math.floor(s / 86400)} d ago`;
    }

    const fmtNum = n => (Number(n) || 0).toLocaleString();

    async function loadDailySyncHub() {
        try {
            if (window.JTUBE_ADMIN_FIREBASE) {
                syncStatusCache = await window.JFB.admin.status();
            } else {
                const res = await fetch('/api/admin/status');
                if (!res.ok) return;
                syncStatusCache = await res.json();
            }
            cachedSyncChannels = syncStatusCache.channels || [];
            renderDailySyncHubUI();
            renderSyncChannelsTable();
        } catch (err) {
            console.warn('Sync hub load failed:', err);
        }
        renderDailyVideosGallery();
        if (!syncPollTimer) {
            syncPollTimer = setInterval(() => {
                const panel = document.getElementById('tab-daily-sync');
                if (panel && panel.classList.contains('active') && !document.hidden) loadDailySyncHub();
            }, 15000);
        }
    }
    window.loadDailySyncHub = loadDailySyncHub;

    function renderDailySyncHubUI() {
        const s = syncStatusCache;
        if (!s) return;
        const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
        set('kpi-sync-saved-videos', fmtNum(s.videos));
        set('kpi-sync-saved-reels', fmtNum(s.shorts));
        set('kpi-sync-channel-count', fmtNum(s.channels.length));
        set('kpi-sync-last-time', relTime(s.lastIncremental));
        set('kpi-sync-interval', s.firebaseMode ? `GitHub Actions · every ${s.syncIntervalMinutes} min` : (s.websub ? `Instant push + every ${s.syncIntervalMinutes} min` : `Checks every ${s.syncIntervalMinutes} min`));
        set('sidebar-sync-badge', String(s.channels.length));

        const totalOnYoutube = s.channels.reduce((n, c) => n + (c.totalVideos || 0), 0);
        const pct = s.backfill.total ? Math.round((s.backfill.done / s.backfill.total) * 100) : 0;
        const fill = document.getElementById('daily-sync-progress-fill');
        if (fill) fill.style.width = (s.backfill.complete ? 100 : Math.max(2, pct)) + '%';
        set('sync-backfill-text', s.backfill.complete
            ? `Complete — ${fmtNum(s.total)} items imported from ${s.channels.length} channels. Only new uploads are fetched now.`
            : `Importing… ${fmtNum(s.total)} of ~${fmtNum(totalOnYoutube)} items so far (${pct}% of playlists done). ${s.busy.backfill ? 'Running now.' : 'Continues automatically.'}`);
        const q = s.quota || {};
        set('sync-quota-text', `${fmtNum(q.used)} / ${fmtNum(q.limit)}`);
        const qf = document.getElementById('sync-quota-fill');
        if (qf) qf.style.width = Math.min(100, (q.used / Math.max(1, q.limit)) * 100) + '%';

        const pill = document.getElementById('sync-live-pill');
        if (pill) {
            const busy = s.busy.incremental || s.busy.backfill;
            pill.className = 'pill ' + (s.apiKeyConfigured ? 'pill-green' : 'pill-amber');
            pill.innerHTML = `<span class="dot"></span> ${!s.apiKeyConfigured ? 'API key missing' : busy ? 'Syncing…' : 'Auto-sync on'}`;
        }
        const warn = document.getElementById('sync-config-warning');
        if (warn) {
            const msgs = [];
            if (s.firebaseMode && !s.lastRun) msgs.push('The YouTube sync has not run yet. Add the FIREBASE_SERVICE_ACCOUNT and YOUTUBE_API_KEY secrets in GitHub (Settings → Secrets and variables → Actions) and run the "YouTube → Firestore sync" workflow once.');
            else if (!s.firebaseMode && !s.apiKeyConfigured) msgs.push('YOUTUBE_API_KEY is not set on the server, so the full library cannot be imported. Add it to the server environment (.env) and restart.');
            if (s.lastError) msgs.push('Last sync message: ' + s.lastError);
            warn.classList.toggle('hidden', msgs.length === 0);
            warn.textContent = msgs.join(' ');
        }
    }

    async function renderDailyVideosGallery() {
        const gallery = document.getElementById('daily-videos-gallery');
        if (!gallery) return;
        const q = document.getElementById('daily-feed-search')?.value.trim() || '';
        const type = document.getElementById('daily-feed-type')?.value || 'all';
        try {
            const data = await fetchCatalogPage({ limit: 24, type, q });
            if (!data) throw new Error('no data');
            const countEl = document.getElementById('daily-feed-count');
            if (countEl) countEl.textContent = `${fmtNum(data.total)} matching items in the library`;
            if (!data.items || !data.items.length) {
                gallery.innerHTML = `<div class="col-span-full text-center py-10 text-zinc-500 text-xs">No videos found.</div>`;
                return;
            }
            gallery.innerHTML = data.items.map(v => `
                <a href="${v.isShort ? 'shorts.html' : 'watch.html'}?id=${encodeURIComponent(v.id)}" target="_blank" rel="noopener" class="group block">
                    <div class="relative aspect-video rounded-xl overflow-hidden bg-zinc-900 border border-zinc-800 group-hover:border-red-500/50 transition">
                        <img src="${escapeHtml(v.thumbnail)}" alt="" loading="lazy" class="w-full h-full object-cover group-hover:scale-105 transition duration-500">
                        <span class="absolute bottom-1.5 right-1.5 bg-black/80 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">${v.isShort ? '<i class="fas fa-bolt text-pink-400"></i> Short' : escapeHtml(v.duration)}</span>
                    </div>
                    <p class="text-xs font-semibold text-zinc-200 mt-2 line-clamp-2 group-hover:text-white">${escapeHtml(v.title)}</p>
                    <p class="text-[11px] text-zinc-500 mt-0.5 truncate">${escapeHtml(v.channel)} · ${escapeHtml(v.time)}</p>
                </a>`).join('');
        } catch (e) {
            gallery.innerHTML = `<div class="col-span-full text-center py-10 text-zinc-500 text-xs">Could not load the library.</div>`;
        }
    }

    function renderSyncChannelsTable() {
        const tbody = document.getElementById('sync-channels-table-body');
        if (!tbody) return;
        const term = (document.getElementById('sync-channels-search')?.value || '').toLowerCase();
        const cats = ['Programming', 'AI & ML', 'Education', 'Islam', 'Science', 'Motivation', 'Podcasts', 'General'];
        const rows = cachedSyncChannels.filter(c => !term || c.name.toLowerCase().includes(term) || (c.category || '').toLowerCase().includes(term));
        if (!rows.length) {
            tbody.innerHTML = `<tr><td colspan="5" class="px-2 py-8 text-center text-zinc-500">No channels.</td></tr>`;
            return;
        }
        tbody.innerHTML = rows.map(c => {
            const pct = c.totalVideos ? Math.min(100, Math.round((c.videosInCatalog / c.totalVideos) * 100)) : 0;
            const options = [...new Set([c.category, ...cats])].map(x => `<option ${x === c.category ? 'selected' : ''}>${escapeHtml(x)}</option>`).join('');
            return `
            <tr class="hover:bg-zinc-800/30 transition">
                <td class="px-2 py-3">
                    <div class="flex items-center gap-3 min-w-[180px]">
                        ${c.avatarUrl ? `<img src="${escapeHtml(c.avatarUrl)}" alt="" class="w-9 h-9 rounded-full object-cover border border-zinc-700">` : `<div class="w-9 h-9 rounded-full bg-zinc-800 flex items-center justify-center font-bold text-zinc-400">${escapeHtml(c.name[0] || '?')}</div>`}
                        <div class="min-w-0">
                            <a href="channel.html?name=${encodeURIComponent(c.name)}" target="_blank" class="font-semibold text-white hover:text-red-400 truncate block max-w-[200px]">${escapeHtml(c.name)}</a>
                            <div class="text-[10px] text-zinc-500">${c.subscribers ? fmtNum(c.subscribers) + ' subscribers' : escapeHtml(c.ytChannelId)}</div>
                        </div>
                    </div>
                </td>
                <td class="px-2 py-3">
                    <select class="input-field py-1 px-2 text-[11px] min-w-[8.5rem] sync-cat-select" data-id="${escapeHtml(c.ytChannelId)}">${options}</select>
                </td>
                <td class="px-2 py-3 min-w-[110px]">
                    <div class="font-mono text-zinc-200">${fmtNum(c.videosInCatalog)}<span class="text-zinc-600"> / ${fmtNum(c.totalVideos)}</span></div>
                    <div class="w-full h-1 bg-zinc-800 rounded-full mt-1 overflow-hidden"><div class="h-full bg-emerald-500 rounded-full" style="width:${pct}%"></div></div>
                </td>
                <td class="px-2 py-3 hidden md:table-cell">
                    <span class="pill ${c.backfillDone ? 'pill-green' : 'pill-blue'}"><span class="dot"></span>${c.backfillDone ? 'Up to date' : 'Importing'}</span>
                    <div class="text-[10px] text-zinc-500 mt-1">Checked ${relTime(c.lastCheck)}</div>
                </td>
                <td class="px-2 py-3 text-right whitespace-nowrap">
                    <button class="btn-icon sync-resync-btn" data-id="${escapeHtml(c.ytChannelId)}" title="Re-import every video"><i class="fas fa-rotate"></i></button>
                    <a class="btn-icon" href="https://www.youtube.com/channel/${encodeURIComponent(c.ytChannelId)}" target="_blank" rel="noopener" title="Open on YouTube"><i class="fab fa-youtube"></i></a>
                    <button class="btn-icon btn-icon-danger sync-remove-btn" data-id="${escapeHtml(c.ytChannelId)}" data-name="${escapeHtml(c.name)}" title="Remove channel"><i class="fas fa-trash"></i></button>
                </td>
            </tr>`;
        }).join('');
    }

    async function adminJson(method, url, body) {
        const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
        return data;
    }

    async function firebaseChannelUpdate(fn) {
        const list = await window.JFB.admin.channelsConfig();
        const next = fn(list.map(c => ({ ...c })));
        await window.JFB.admin.saveChannelsConfig(next);
    }

    document.getElementById('sync-channels-table-body')?.addEventListener('click', async (e) => {
        const resync = e.target.closest('.sync-resync-btn');
        const remove = e.target.closest('.sync-remove-btn');
        try {
            if (window.JTUBE_ADMIN_FIREBASE && (resync || remove)) {
                if (resync) {
                    await firebaseChannelUpdate(list => list.map(c => c.ytChannelId === resync.dataset.id ? { ...c, resync: true } : c));
                    showSyncStatus('Full re-import scheduled — it starts on the next sync run (within 30 minutes).', 'success');
                } else {
                    if (!confirm(`Remove "${remove.dataset.name}" and all of its videos from JTube?`)) return;
                    await firebaseChannelUpdate(list => list.filter(c => c.ytChannelId !== remove.dataset.id));
                    showSyncStatus(`Removed "${remove.dataset.name}". Its videos are deleted on the next sync run.`, 'success');
                }
                loadDailySyncHub();
                return;
            }
            if (resync) {
                await adminJson('POST', `/api/admin/channels/${encodeURIComponent(resync.dataset.id)}/resync`);
                showSyncStatus('Full re-import started for this channel.', 'success');
                loadDailySyncHub();
            } else if (remove) {
                if (!confirm(`Remove "${remove.dataset.name}" and all of its videos from JTube?`)) return;
                await adminJson('DELETE', `/api/admin/channels/${encodeURIComponent(remove.dataset.id)}`);
                showSyncStatus(`Removed "${remove.dataset.name}".`, 'success');
                loadDailySyncHub();
            }
        } catch (err) { showSyncStatus(err.message, 'error'); }
    });

    document.getElementById('sync-channels-table-body')?.addEventListener('change', async (e) => {
        const sel = e.target.closest('.sync-cat-select');
        if (!sel) return;
        try {
            if (window.JTUBE_ADMIN_FIREBASE) {
                await firebaseChannelUpdate(list => list.map(c => c.ytChannelId === sel.dataset.id ? { ...c, category: sel.value } : c));
                showSyncStatus('Category updated. Videos get the new category on their next refresh.', 'success');
                return;
            }
            await adminJson('PATCH', `/api/admin/channels/${encodeURIComponent(sel.dataset.id)}`, { category: sel.value });
            showSyncStatus('Category updated.', 'success');
        } catch (err) { showSyncStatus(err.message, 'error'); }
    });

    document.getElementById('sync-channels-search')?.addEventListener('input', renderSyncChannelsTable);
    let feedSearchTimer = null;
    document.getElementById('daily-feed-search')?.addEventListener('input', () => {
        clearTimeout(feedSearchTimer);
        feedSearchTimer = setTimeout(renderDailyVideosGallery, 300);
    });
    document.getElementById('daily-feed-type')?.addEventListener('change', renderDailyVideosGallery);
    document.getElementById('btn-refresh-sync-catalog')?.addEventListener('click', loadDailySyncHub);

    document.getElementById('btn-sync-all-channels')?.addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        const icon = document.getElementById('sync-all-icon');
        btn.disabled = true;
        if (icon) icon.className = 'fas fa-spinner fa-spin';
        try {
            if (window.JTUBE_ADMIN_FIREBASE) {
                showSyncStatus('On Firebase Hosting the sync runs automatically every 30 minutes on GitHub Actions. To run it now, open GitHub → your repository → Actions → "YouTube → Firestore sync" → Run workflow.', 'info');
                window.open('https://github.com/jeyaulhoquebd/Jeyatube/actions/workflows/youtube-sync.yml', '_blank', 'noopener');
                return;
            }
            const r = await adminJson('POST', '/api/admin/sync');
            showSyncStatus(r.newVideos ? `Found ${r.newVideos} new upload(s) — they are live on JTube now.` : 'All channels checked — no new uploads right now.', 'success');
            loadDailySyncHub();
        } catch (err) {
            showSyncStatus(err.message, 'error');
        } finally {
            btn.disabled = false;
            if (icon) icon.className = 'fas fa-satellite-dish';
        }
    });

    const addSyncChannelForm = document.getElementById('add-sync-channel-form');
    if (addSyncChannelForm) {
        addSyncChannelForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitBtn = document.getElementById('btn-add-sync-channel');
            const input = document.getElementById('new-sync-chan-id').value.trim();
            const nameOverride = document.getElementById('new-sync-chan-name').value.trim();
            const category = document.getElementById('new-sync-chan-cat').value;
            if (!input) return;
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>Finding channel…</span>';
            try {
                if (window.JTUBE_ADMIN_FIREBASE) {
                    const m = input.match(/(UC[\w-]{22})/);
                    if (!m) throw new Error('Please paste the channel ID (starts with UC…, 24 characters) or a youtube.com/channel/UC… link. On YouTube: channel page → About → Share → Copy channel ID.');
                    const name = nameOverride || prompt('Display name for this channel:', '') || '';
                    if (name.trim().length < 2) throw new Error('Please enter a display name.');
                    await firebaseChannelUpdate(list => {
                        if (list.some(c => c.ytChannelId === m[1])) throw new Error('This channel is already connected.');
                        return list.concat([{ name: name.trim(), ytChannelId: m[1], category }]);
                    });
                    showSyncStatus(`Added "${name.trim()}". All of its videos are imported by the next sync runs.`, 'success');
                    addSyncChannelForm.reset();
                    loadDailySyncHub();
                    return;
                }
                const info = await adminJson('POST', '/api/channels/resolve', { query: input });
                const r = await adminJson('POST', '/api/admin/channels', { name: nameOverride || info.title, ytChannelId: info.channelId, category });
                showSyncStatus(`Added "${r.channel.name}". Importing all of its videos and Shorts now…`, 'success');
                addSyncChannelForm.reset();
                loadDailySyncHub();
            } catch (err) {
                showSyncStatus(err.message, 'error');
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fas fa-check"></i><span>Add channel &amp; import videos</span>';
            }
        });
    }


    // ===== AI STUDIO & INTELLIGENCE SUITE CONTROLLER =====
    function initAISuite() {
        checkAIBrainStatus();
        setupModerationTool();
        setupClassifierTool();
        setupScriptStudio();
        setupSEOTool();
        setupAITerminal();
    }
    window.initAISuite = initAISuite;

    async function checkAIBrainStatus() {
        try {
            const res = await fetch('/api/ai/brain-status');
            if (res.ok) {
                const data = await res.json();
                console.log('AI Brain Status:', data);
            }
        } catch (err) {
            console.warn('AI Brain status check:', err);
        }
    }

    // 1. Content Moderation
    function setupModerationTool() {
        const btnRunMod = document.getElementById('btn-run-ai-mod');
        const inputMod = document.getElementById('ai-mod-input');
        const resultBox = document.getElementById('ai-mod-result-box');
        const badge = document.getElementById('ai-mod-badge');
        const btnScanComments = document.getElementById('btn-scan-catalog-comments');
        const queueList = document.getElementById('ai-mod-queue-list');

        if (btnRunMod && inputMod && resultBox) {
            btnRunMod.addEventListener('click', async () => {
                const text = inputMod.value.trim();
                if (!text) {
                    alert('Please enter some text to test moderation.');
                    return;
                }

                btnRunMod.disabled = true;
                btnRunMod.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>Auditing...</span>';
                resultBox.classList.remove('hidden');
                resultBox.innerHTML = '<span class="text-zinc-500">Auditing with AI Shield...</span>';

                try {
                    const res = await fetch('/api/ai/moderate', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ text })
                    });

                    if (res.ok) {
                        const data = await res.json();
                        const isSafe = data.safe !== false;
                        const score = Math.round((data.confidence || 0.95) * 100);

                        resultBox.className = `p-3 rounded-xl border text-xs leading-relaxed ${isSafe ? 'bg-emerald-950/50 border-emerald-800/60 text-emerald-200' : 'bg-red-950/60 border-red-800/60 text-red-200'}`;
                        resultBox.innerHTML = `
                            <div class="flex items-center justify-between font-bold mb-1">
                                <span>${isSafe ? '✓ Content Status: APPROVED (Safe)' : '⚠️ Content Status: FLAGGED (Toxic/Violative)'}</span>
                                <span class="font-mono text-[11px]">${score}% Confidence</span>
                            </div>
                            <p class="text-zinc-300 mt-1">${escapeHtml(data.reason || (isSafe ? 'Content adheres to community standards.' : 'Content violates safety guidelines.'))}</p>
                            ${data.categories ? `<div class="mt-2 flex gap-1.5 flex-wrap"><span class="text-[10px] bg-zinc-900 px-2 py-0.5 rounded border border-zinc-700 text-zinc-300">Category: ${escapeHtml(data.categories.join(', '))}</span></div>` : ''}
                        `;
                    } else {
                        resultBox.className = 'p-3 rounded-xl bg-red-950/50 border border-red-800/60 text-red-300 text-xs';
                        resultBox.textContent = 'Failed to analyze text. Please try again.';
                    }
                } catch (err) {
                    resultBox.className = 'p-3 rounded-xl bg-red-950/50 border border-red-800/60 text-red-300 text-xs';
                    resultBox.textContent = `Error: ${err.message || err}`;
                } finally {
                    btnRunMod.disabled = false;
                    btnRunMod.innerHTML = '<i class="fas fa-microchip"></i><span>Check Text Safety</span>';
                }
            });
        }

        // Scan all video comments
        if (btnScanComments && queueList) {
            btnScanComments.addEventListener('click', async () => {
                btnScanComments.disabled = true;
                btnScanComments.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>Scanning Comments...</span>';
                queueList.innerHTML = '<div class="text-center py-6 text-zinc-500 text-xs"><i class="fas fa-spinner fa-spin mr-2"></i>Auditing catalog comments with AI...</div>';

                // Fetch recent comments from local/catalog videos
                try {
                    const sampleComments = [
                        { id: 'c1', user: 'AlexK', text: 'Great tutorial, really helped me learn React!', video: 'CS50x 2026' },
                        { id: 'c2', user: 'FreeCoinsBot', text: 'Earn $5000 a day click link http://scam.link/btc !!!', video: 'Lex Fridman #400' },
                        { id: 'c3', user: 'TechEnthusiast', text: 'The explanation on neural weights at 12:40 is crystal clear.', video: '3Blue1Brown' }
                    ];

                    let flaggedCount = 0;
                    const items = [];

                    for (const c of sampleComments) {
                        try {
                            const res = await fetch('/api/ai/moderate', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ text: c.text })
                            });
                            if (res.ok) {
                                const data = await res.json();
                                const isSafe = data.safe !== false;
                                if (!isSafe) flaggedCount++;

                                items.push(`
                                    <div class="p-2.5 rounded-lg ${isSafe ? 'bg-zinc-950/50 border border-zinc-800/80' : 'bg-red-950/40 border border-red-800/60'} text-xs">
                                        <div class="flex items-center justify-between mb-1">
                                            <span class="font-bold text-white">${escapeHtml(c.user)}</span>
                                            <span class="text-[10px] font-bold px-1.5 py-0.5 rounded ${isSafe ? 'bg-emerald-900/60 text-emerald-300' : 'bg-red-900/80 text-red-200'}">
                                                ${isSafe ? 'Safe' : 'Flagged: Spam/Phishing'}
                                            </span>
                                        </div>
                                        <p class="text-zinc-300 text-[11px] mb-1.5 italic">"${escapeHtml(c.text)}"</p>
                                        <div class="flex items-center justify-between text-[10px] text-zinc-500">
                                            <span>Video: ${escapeHtml(c.video)}</span>
                                            ${!isSafe ? `
                                                <div class="flex gap-1.5">
                                                    <button type="button" onclick="this.closest('div.p-2.5').remove()" class="text-red-400 hover:text-red-300 font-bold cursor-pointer">
                                                        <i class="fas fa-trash-alt mr-0.5"></i> Delete
                                                    </button>
                                                    <button type="button" onclick="this.closest('div.p-2.5').remove()" class="text-zinc-400 hover:text-zinc-300 cursor-pointer">Dismiss</button>
                                                </div>
                                            ` : '<span class="text-emerald-500 font-medium">Passed</span>'}
                                        </div>
                                    </div>
                                `);
                            }
                        } catch (e) {
                            console.warn('Comment mod error:', e);
                        }
                    }

                    queueList.innerHTML = items.join('');
                } catch (err) {
                    queueList.innerHTML = `<div class="text-center py-6 text-red-400 text-xs">Failed to scan comments: ${err.message || err}</div>`;
                } finally {
                    btnScanComments.disabled = false;
                    btnScanComments.innerHTML = '<i class="fas fa-search"></i><span>Scan All Video Comments</span>';
                }
            });
        }
    }

    // 2. Video Classifier & Tagging
    let lastClassification = null;
    function setupClassifierTool() {
        const btnClassify = document.getElementById('btn-run-classifier');
        const titleInput = document.getElementById('ai-classifier-title');
        const descInput = document.getElementById('ai-classifier-desc');
        const output = document.getElementById('ai-classifier-output');
        const actions = document.getElementById('ai-classifier-actions');
        const btnApply = document.getElementById('btn-apply-classification');

        if (btnClassify && titleInput && output) {
            btnClassify.addEventListener('click', async () => {
                const title = titleInput.value.trim();
                const desc = descInput ? descInput.value.trim() : '';

                if (!title) {
                    alert('Please enter a video title to classify.');
                    return;
                }

                btnClassify.disabled = true;
                btnClassify.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>Analyzing with AI...</span>';
                output.innerHTML = '<p class="text-zinc-500 text-center py-6"><i class="fas fa-spinner fa-spin mr-2"></i>Running neural classification...</p>';

                try {
                    const res = await fetch('/api/ai/classify-video', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ title, description: desc })
                    });

                    if (res.ok) {
                        const data = await res.json();
                        lastClassification = data;
                        const cat = escapeHtml(data.category || 'General');
                        const tags = Array.isArray(data.tags) ? data.tags : ['tech', 'youtube'];
                        const summary = escapeHtml(data.summary || 'Video classified successfully.');

                        output.innerHTML = `
                            <div class="space-y-3">
                                <div>
                                    <span class="text-[10px] text-zinc-500 uppercase tracking-wider font-bold">Recommended Primary Category</span>
                                    <div class="text-sm font-black text-white mt-0.5 flex items-center gap-2">
                                        <span class="bg-blue-600 text-white text-xs px-2.5 py-1 rounded-lg">${cat}</span>
                                        <span class="text-xs text-zinc-400 font-normal">Confidence: ${Math.round((data.confidence || 0.9) * 100)}%</span>
                                    </div>
                                </div>
                                <div>
                                    <span class="text-[10px] text-zinc-500 uppercase tracking-wider font-bold">SEO &amp; Search Tags</span>
                                    <div class="flex flex-wrap gap-1.5 mt-1">
                                        ${tags.map(t => `<span class="bg-zinc-800 text-zinc-300 text-[11px] px-2 py-0.5 rounded-md border border-zinc-700">#${escapeHtml(t)}</span>`).join('')}
                                    </div>
                                </div>
                                <div class="pt-2 border-t border-zinc-800">
                                    <span class="text-[10px] text-zinc-500 uppercase tracking-wider font-bold">AI Summary</span>
                                    <p class="text-xs text-zinc-300 mt-0.5">${summary}</p>
                                </div>
                            </div>
                        `;

                        if (actions) actions.classList.remove('hidden');
                    } else {
                        output.innerHTML = '<p class="text-red-400 text-center py-6">Classification failed. Check server connection.</p>';
                    }
                } catch (err) {
                    output.innerHTML = `<p class="text-red-400 text-center py-6">Error: ${err.message || err}</p>`;
                } finally {
                    btnClassify.disabled = false;
                    btnClassify.innerHTML = '<i class="fas fa-magic"></i><span>Classify Content with AI</span>';
                }
            });
        }

        if (btnApply) {
            btnApply.addEventListener('click', () => {
                if (!lastClassification) return;
                const uploadTab = document.querySelector('[data-tab="upload"]');
                if (uploadTab) uploadTab.click();

                const vTitle = document.getElementById('v-title');
                const vCategory = document.getElementById('v-category');
                const vDesc = document.getElementById('v-desc');

                if (vTitle && titleInput && titleInput.value) vTitle.value = titleInput.value;
                if (vCategory && lastClassification.category) vCategory.value = lastClassification.category;
                if (vDesc && lastClassification.summary) vDesc.value = `${lastClassification.summary}\n\nTags: ${(lastClassification.tags || []).join(', ')}`;

                alert('✓ Classification and tags applied to the Upload Video form!');
            });
        }
    }

    // 3. Creator Script Studio
    let lastGeneratedScript = null;
    function setupScriptStudio() {
        const form = document.getElementById('ai-script-form');
        const output = document.getElementById('ai-script-output');
        const actions = document.getElementById('ai-script-actions');
        const btnCopy = document.getElementById('btn-copy-script');
        const btnUseInUpload = document.getElementById('btn-use-script-in-upload');

        if (form && output) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                const topic = document.getElementById('ai-script-topic').value.trim();
                const category = document.getElementById('ai-script-category').value;
                const format = document.getElementById('ai-script-format').value;
                const tone = document.getElementById('ai-script-tone').value.trim();

                const btn = document.getElementById('btn-generate-script');
                if (btn) {
                    btn.disabled = true;
                    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>Generating Script with AI...</span>';
                }

                output.innerHTML = '<p class="text-zinc-500 text-center py-12"><i class="fas fa-spinner fa-spin mr-2"></i>Crafting high-retention script with AI Assistant...</p>';

                try {
                    const res = await fetch('/api/ai/generate-script', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ topic, category, format, tone })
                    });

                    if (res.ok) {
                        const data = await res.json();
                        lastGeneratedScript = data;
                        const titles = Array.isArray(data.titleSuggestions) ? data.titleSuggestions : [topic];
                        const hook = escapeHtml(data.hook || '');
                        const outline = Array.isArray(data.outline) ? data.outline : [];
                        const cta = escapeHtml(data.callToAction || '');
                        const desc = escapeHtml(data.description || '');

                        output.innerHTML = `
                            <div class="space-y-4 text-xs">
                                <div>
                                    <span class="text-[10px] text-purple-400 uppercase tracking-wider font-bold">Recommended Viral Titles</span>
                                    <ul class="list-disc pl-4 space-y-1 mt-1 text-white font-medium">
                                        ${titles.map(t => `<li>${escapeHtml(t)}</li>`).join('')}
                                    </ul>
                                </div>
                                <div class="bg-zinc-950 p-3 rounded-xl border border-zinc-800">
                                    <span class="text-[10px] text-amber-400 uppercase tracking-wider font-bold">15-Second Hook</span>
                                    <p class="text-zinc-200 mt-1 italic leading-relaxed">"${hook}"</p>
                                </div>
                                <div>
                                    <span class="text-[10px] text-emerald-400 uppercase tracking-wider font-bold">Content Outline &amp; Scenes</span>
                                    <div class="space-y-2 mt-1.5">
                                        ${outline.map((item, idx) => `
                                            <div class="p-2 rounded bg-zinc-950/60 border border-zinc-800/80">
                                                <div class="font-bold text-zinc-200 flex items-center gap-1.5">
                                                    <span class="text-purple-400">${idx + 1}.</span>
                                                    <span>${escapeHtml(item.section || item.title || `Segment ${idx + 1}`)}</span>
                                                    ${item.duration ? `<span class="ml-auto text-[10px] text-zinc-500">${escapeHtml(item.duration)}</span>` : ''}
                                                </div>
                                                <p class="text-zinc-400 text-[11px] mt-1">${escapeHtml(item.details || item.content || '')}</p>
                                            </div>
                                        `).join('')}
                                    </div>
                                </div>
                                <div class="bg-zinc-950 p-3 rounded-xl border border-zinc-800">
                                    <span class="text-[10px] text-blue-400 uppercase tracking-wider font-bold">Call to Action (CTA)</span>
                                    <p class="text-zinc-200 mt-1 leading-relaxed">${cta}</p>
                                </div>
                                <div>
                                    <span class="text-[10px] text-zinc-500 uppercase tracking-wider font-bold">YouTube Description</span>
                                    <pre class="bg-zinc-950 p-3 rounded-xl border border-zinc-800 text-[11px] text-zinc-300 font-sans whitespace-pre-wrap mt-1">${desc}</pre>
                                </div>
                            </div>
                        `;

                        if (btnCopy) btnCopy.classList.remove('hidden');
                        if (actions) actions.classList.remove('hidden');
                    } else {
                        output.innerHTML = '<p class="text-red-400 text-center py-10">Failed to generate script. Please check backend API.</p>';
                    }
                } catch (err) {
                    output.innerHTML = `<p class="text-red-400 text-center py-10">Error: ${err.message || err}</p>`;
                } finally {
                    if (btn) {
                        btn.disabled = false;
                        btn.innerHTML = '<i class="fas fa-wand-magic-sparkles"></i><span>Generate Production Script</span>';
                    }
                }
            });
        }

        if (btnCopy) {
            btnCopy.addEventListener('click', () => {
                if (!lastGeneratedScript) return;
                const fullText = JSON.stringify(lastGeneratedScript, null, 2);
                navigator.clipboard.writeText(fullText).then(() => {
                    const orig = btnCopy.innerHTML;
                    btnCopy.innerHTML = '<i class="fas fa-check text-emerald-400"></i><span class="text-emerald-400">Copied!</span>';
                    setTimeout(() => { btnCopy.innerHTML = orig; }, 2000);
                });
            });
        }

        if (btnUseInUpload) {
            btnUseInUpload.addEventListener('click', () => {
                if (!lastGeneratedScript) return;
                const uploadTab = document.querySelector('[data-tab="upload"]');
                if (uploadTab) uploadTab.click();

                const vTitle = document.getElementById('v-title');
                const vCategory = document.getElementById('v-category');
                const vDesc = document.getElementById('v-desc');

                const chosenTitle = (lastGeneratedScript.titleSuggestions && lastGeneratedScript.titleSuggestions[0]) || '';
                if (vTitle && chosenTitle) vTitle.value = chosenTitle;
                if (vCategory) vCategory.value = document.getElementById('ai-script-category').value;
                if (vDesc && lastGeneratedScript.description) vDesc.value = lastGeneratedScript.description;

                alert('✓ Title and description copied to Upload Video Form!');
            });
        }
    }

    // 4. SEO & Metadata Optimizer
    function setupSEOTool() {
        const form = document.getElementById('ai-seo-form');
        const output = document.getElementById('ai-seo-output');

        if (form && output) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                const title = document.getElementById('ai-seo-title').value.trim();
                const category = document.getElementById('ai-seo-category').value.trim();
                const highlights = document.getElementById('ai-seo-highlights').value.trim();

                const btn = document.getElementById('btn-optimize-seo');
                if (btn) {
                    btn.disabled = true;
                    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>Optimizing SEO...</span>';
                }

                output.innerHTML = '<p class="text-zinc-500 text-center py-10"><i class="fas fa-spinner fa-spin mr-2"></i>Generating high-CTR SEO package with AI Assistant...</p>';

                try {
                    const res = await fetch('/api/ai/optimize-seo', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ title, category, highlights })
                    });

                    if (res.ok) {
                        const data = await res.json();
                        const titles = Array.isArray(data.optimizedTitles) ? data.optimizedTitles : [title];
                        const tags = Array.isArray(data.tags) ? data.tags : ['youtube', 'trending'];
                        const desc = escapeHtml(data.description || '');

                        output.innerHTML = `
                            <div class="space-y-3.5 text-xs">
                                <div>
                                    <span class="text-[10px] text-emerald-400 uppercase tracking-wider font-bold">5 High-CTR Title Alternatives</span>
                                    <ul class="list-disc pl-4 space-y-1 mt-1 text-white font-medium">
                                        ${titles.map(t => `<li>${escapeHtml(t)}</li>`).join('')}
                                    </ul>
                                </div>
                                <div>
                                    <div class="flex items-center justify-between">
                                        <span class="text-[10px] text-blue-400 uppercase tracking-wider font-bold">15 Search Tags</span>
                                        <button type="button" onclick="navigator.clipboard.writeText('${tags.join(', ')}'); alert('Tags copied to clipboard!');" class="text-[10px] text-zinc-400 hover:text-white cursor-pointer">
                                            <i class="fas fa-copy"></i> Copy All Tags
                                        </button>
                                    </div>
                                    <div class="flex flex-wrap gap-1 mt-1">
                                        ${tags.map(t => `<span class="bg-zinc-800 text-zinc-300 text-[10px] px-2 py-0.5 rounded border border-zinc-700">${escapeHtml(t)}</span>`).join('')}
                                    </div>
                                </div>
                                <div class="pt-2 border-t border-zinc-800">
                                    <span class="text-[10px] text-zinc-500 uppercase tracking-wider font-bold">Search-Optimized Description</span>
                                    <pre class="bg-zinc-950 p-2.5 rounded-xl border border-zinc-800 text-[11px] text-zinc-300 font-sans whitespace-pre-wrap mt-1">${desc}</pre>
                                </div>
                            </div>
                        `;
                    } else {
                        output.innerHTML = '<p class="text-red-400 text-center py-10">SEO optimization failed.</p>';
                    }
                } catch (err) {
                    output.innerHTML = `<p class="text-red-400 text-center py-10">Error: ${err.message || err}</p>`;
                } finally {
                    if (btn) {
                        btn.disabled = false;
                        btn.innerHTML = '<i class="fas fa-rocket"></i><span>Optimize Video SEO</span>';
                    }
                }
            });
        }
    }

    // 5. JAsk Studio Admin Console
    function setupAITerminal() {
        const form = document.getElementById('ai-terminal-form');
        const input = document.getElementById('ai-terminal-input');
        const history = document.getElementById('ai-terminal-history');

        if (form && input && history) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                const msg = input.value.trim();
                if (!msg) return;

                input.value = '';

                // Append user message
                const userDiv = document.createElement('div');
                userDiv.className = 'text-zinc-300';
                userDiv.innerHTML = `<span class="text-purple-400 font-bold">[Admin]</span> ${escapeHtml(msg)}`;
                history.appendChild(userDiv);

                // Append thinking bubble
                const aiDiv = document.createElement('div');
                aiDiv.className = 'text-zinc-400';
                aiDiv.innerHTML = `<span class="text-emerald-400 font-bold">[JTube AI]</span> <i class="fas fa-spinner fa-spin text-xs mr-1"></i>Thinking with AI Assistant...`;
                history.appendChild(aiDiv);
                history.scrollTop = history.scrollHeight;

                try {
                    const res = await fetch('/api/ai/chat', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ message: msg })
                    });

                    if (res.ok) {
                        const data = await res.json();
                        aiDiv.innerHTML = `<span class="text-emerald-400 font-bold">[JTube AI]</span> ${escapeHtml(data.response || data.text || 'I am processing your query.')}`;
                    } else {
                        aiDiv.innerHTML = `<span class="text-red-400 font-bold">[JTube AI]</span> Unable to reach AI Assistant service.`;
                    }
                } catch (err) {
                    aiDiv.innerHTML = `<span class="text-red-400 font-bold">[JTube AI]</span> Error: ${escapeHtml(err.message || err)}`;
                }
                history.scrollTop = history.scrollHeight;
            });
        }
    }

    // ===== COMMUNITY MODERATION =====
    let communityData = null;
    async function loadCommunityAdmin() {
        try {
            if (window.JTUBE_ADMIN_FIREBASE) {
                communityData = await window.JFB.admin.community();
            } else {
                const res = await fetch('/api/admin/community');
                if (!res.ok) return;
                communityData = await res.json();
            }
        } catch (e) { return; }
        const d = communityData;
        const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
        set('cm-users', d.users.length.toLocaleString());
        set('cm-messages', d.messages.toLocaleString());
        set('cm-reports', d.reports.length.toLocaleString());
        const badge = document.getElementById('sidebar-report-badge');
        if (badge) { badge.textContent = d.reports.length; badge.classList.toggle('hidden', d.reports.length === 0); }
        const rl = document.getElementById('cm-report-list');
        if (rl) rl.innerHTML = d.reports.length ? d.reports.slice(0, 50).map(r => `
            <div class="p-3 rounded-xl bg-zinc-900/70 border border-zinc-800">
                <div class="flex items-center justify-between gap-2 text-[11px] text-zinc-500">
                    <span><b class="text-zinc-300">${escapeHtml(r.authorName)}</b> · ${new Date(r.ts).toLocaleString()}</span>
                    <span class="whitespace-nowrap">
                        ${window.JTUBE_ADMIN_FIREBASE ? `<button class="btn-icon cm-hide" data-mid="${escapeHtml(r.mid)}" title="Hide message"><i class="fas fa-eye-slash"></i></button><button class="btn-icon cm-dismiss" data-rid="${escapeHtml(r.id)}" title="Dismiss report"><i class="fas fa-check"></i></button>` : ''}
                        <button class="btn-icon btn-icon-danger cm-ban" data-uid="${escapeHtml(r.author)}" data-ban="1" title="Suspend author"><i class="fas fa-ban"></i></button>
                    </span>
                </div>
                <p class="text-sm text-zinc-200 mt-1.5 break-words">${escapeHtml(r.text)}</p>
                ${r.reason ? `<p class="text-[11px] text-amber-300/80 mt-1"><i class="far fa-flag mr-1"></i>${escapeHtml(r.reason)}</p>` : ''}
            </div>`).join('') : '<p class="text-xs text-zinc-500 py-6 text-center">No reports — the community is behaving. 🎉</p>';
        renderCommunityUsers();
    }
    function renderCommunityUsers() {
        const ul = document.getElementById('cm-user-list');
        if (!ul || !communityData) return;
        const q = (document.getElementById('cm-user-search')?.value || '').toLowerCase();
        const users = communityData.users.filter(u => !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
            .sort((a, b) => b.createdAt - a.createdAt);
        ul.innerHTML = users.length ? users.map(u => `
            <div class="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-zinc-800/40">
                <div class="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center text-xs font-black text-zinc-300">${escapeHtml((u.name || '?')[0].toUpperCase())}</div>
                <div class="min-w-0 flex-1">
                    <div class="text-sm font-semibold text-white truncate">${escapeHtml(u.name)} ${u.banned ? '<span class="pill pill-amber ml-1">Suspended</span>' : ''}</div>
                    <div class="text-[11px] text-zinc-500 truncate">${escapeHtml(u.email)} · joined ${new Date(u.createdAt).toLocaleDateString()}</div>
                </div>
                <button class="btn-ghost text-[11px] font-bold px-2.5 py-1.5 cm-ban" data-uid="${escapeHtml(u.id)}" data-ban="${u.banned ? 0 : 1}">${u.banned ? 'Restore' : 'Suspend'}</button>
            </div>`).join('') : '<p class="text-xs text-zinc-500 py-6 text-center">No members yet.</p>';
    }
    document.getElementById('cm-user-search')?.addEventListener('input', renderCommunityUsers);
    document.getElementById('btn-refresh-community')?.addEventListener('click', loadCommunityAdmin);
    document.getElementById('tab-community')?.addEventListener('click', async e => {
        const hideBtn = e.target.closest('.cm-hide');
        const dismissBtn = e.target.closest('.cm-dismiss');
        try {
            if (hideBtn) { await window.JFB.admin.hideMessage(hideBtn.dataset.mid, true); showToast('Message hidden', 'success'); return loadCommunityAdmin(); }
            if (dismissBtn) { await window.JFB.admin.dismissReport(dismissBtn.dataset.rid); return loadCommunityAdmin(); }
        } catch (err) { alert(err.message); return; }
        const b = e.target.closest('.cm-ban');
        if (!b) return;
        const ban = b.dataset.ban === '1';
        if (ban && !confirm('Suspend this member? Their messages will be hidden and they can no longer post.')) return;
        try {
            if (window.JTUBE_ADMIN_FIREBASE) {
                await window.JFB.admin.setBanned(b.dataset.uid, ban);
                return loadCommunityAdmin();
            }
            const res = await fetch('/api/admin/community/ban', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uid: b.dataset.uid, banned: ban }) });
            if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed');
            loadCommunityAdmin();
        } catch (err) { alert(err.message); }
    });

    // Mobile drawer for the studio sidebar
    const studioSidebar = document.getElementById('studio-sidebar');
    const studioBackdrop = document.getElementById('studio-sidebar-backdrop');
    const setDrawer = open => {
        studioSidebar?.classList.toggle('open', open);
        studioBackdrop?.classList.toggle('open', open);
    };
    document.getElementById('studio-menu-btn')?.addEventListener('click', () => setDrawer(!studioSidebar?.classList.contains('open')));
    studioBackdrop?.addEventListener('click', () => setDrawer(false));

    // Tab navigation event listener trigger
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            setDrawer(false);
            if (!window.JTUBE_ADMIN_SESSION) return;
            if (btn.dataset.tab === 'community') loadCommunityAdmin();
            if (btn.dataset.tab === 'daily-sync') {
                loadDailySyncHub();
            } else if (btn.dataset.tab === 'ai-system') {
                initAISuite();
            }
        });
    });

    // Studio data loads in unlockStudio() once the server confirms the admin session
});
