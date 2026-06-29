document.addEventListener("DOMContentLoaded", async () => {
    const uploadForm = document.getElementById("upload-form");
    const tableBody = document.getElementById("admin-table-body");
    const videoCount = document.getElementById("video-count");
    const sidebarVideoCount = document.getElementById("sidebar-video-count");

    const adminLoginOverlay = document.getElementById("admin-login-overlay");
    const adminLoginForm = document.getElementById("admin-login-form");
    const adminPassword = document.getElementById("admin-password");

    adminLoginForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const masterPass = typeof ENV !== 'undefined' && ENV.ADMIN_PASSWORD ? ENV.ADMIN_PASSWORD : "Jeyaul";
        if (adminPassword.value === masterPass) {
            adminLoginOverlay.classList.add("hidden");
            // Load dashboard AFTER login — not before
            await loadAdminDashboard();
        } else {
            adminPassword.classList.add("border-red-500");
            adminPassword.value = "";
            adminPassword.placeholder = "Wrong password. Try again.";
            setTimeout(() => {
                adminPassword.classList.remove("border-red-500");
                adminPassword.placeholder = "Master Password";
            }, 2000);
        }
    });

    // Load admin dashboard
    async function loadAdminDashboard() {
        tableBody.innerHTML = `
            <tr>
                <td colspan="4" class="text-center py-10 text-zinc-400">
                    <i class="fas fa-spinner fa-spin mr-2"></i> Loading videos...
                </td>
            </tr>`;

        await loadChannelsForAdmin();
        const videos = await getVideos();
        const count = videos.length;
        videoCount.textContent = count;
        sidebarVideoCount.textContent = count;

        if (videos.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="4" class="text-center py-10 text-zinc-500 italic">No videos in database. Upload one first!</td>
                </tr>`;
        } else {
            let html = "";
            videos.forEach(video => {
                html += `
                    <tr class="hover:bg-zinc-800/30 transition">
                        <td class="px-5 py-3.5 flex items-center space-x-3 min-w-[200px]">
                            <img src="${video.thumbnail}" class="w-16 aspect-video object-cover rounded-lg bg-zinc-700 flex-shrink-0" loading="lazy">
                            <div class="truncate max-w-[200px]">
                                <p class="font-semibold text-white truncate text-xs sm:text-sm">${video.title}</p>
                                <p class="text-[11px] text-zinc-500 sm:hidden">${video.channel}</p>
                                <p class="text-[11px] text-zinc-600">${formatCompactNumber(video.views)} views</p>
                            </div>
                        </td>
                        <td class="px-5 py-3.5 text-zinc-400 text-xs hidden sm:table-cell">${video.channel}</td>
                        <td class="px-5 py-3.5">
                            <span class="bg-zinc-900 border border-zinc-700 px-2.5 py-1 rounded-full text-xs text-zinc-400">${video.category}</span>
                        </td>
                        <td class="px-5 py-3.5 text-center">
                            <button onclick="deleteVideoHandler('${video.id}')" title="Delete video"
                                    class="text-zinc-500 hover:text-red-400 hover:bg-red-500/10 p-2 rounded-full transition">
                                <i class="fas fa-trash-alt"></i>
                            </button>
                        </td>
                    </tr>
                `;
            });
            tableBody.innerHTML = html;
        }

        // Load Categories
        await loadCategoriesForAdmin();
    }

    // Categories Logic
    const categoryListDatalist = document.getElementById("category-list");
    const categoriesTableBody = document.getElementById("categories-table-body");
    const addCategoryForm = document.getElementById("add-category-form");

    async function loadCategoriesForAdmin() {
        const categories = await getCategories();
        
        // Populate Datalists
        const optionsHtml = categories.map(c => `<option value="${c.name}">`).join("");
        if(categoryListDatalist) categoryListDatalist.innerHTML = optionsHtml;

        // Populate Table
        if(categoriesTableBody) {
            categoriesTableBody.innerHTML = "";
            categories.forEach(cat => {
                categoriesTableBody.innerHTML += `
                    <tr class="hover:bg-zinc-800/30 transition">
                        <td class="px-5 py-3.5 text-zinc-400 font-mono">${cat.order}</td>
                        <td class="px-5 py-3.5 font-semibold text-white">${cat.name}</td>
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

    window.deleteVideoHandler = async function(id) {
        if (confirm("Are you sure you want to delete this video from JTube?")) {
            await deleteVideo(id);
            await loadAdminDashboard();
        }
    };

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

                        // FILTER: Only keep videos LONGER than 1 minute (60 seconds)
                        const filtered = data.items.filter(item => {
                            const dStr = durationMap[item.contentDetails.videoId];
                            if (!dStr) return false;
                            const totalSeconds = parseDurationToSeconds(dStr);
                            
                            // Skip videos shorter than 1 minute
                            if (totalSeconds < 60) return false;
                            
                            item._durationText = formatDuration(totalSeconds);
                            item._durationSeconds = totalSeconds;
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

        let targetPlaylistId = ytPlaylistId;
        let fetchedSubscribers = 0;
        
        if (!targetPlaylistId && ytChannelId) {
            const cDetails = await getChannelDetails(ytChannelId);
            if (cDetails) {
                targetPlaylistId = cDetails.playlistId;
                fetchedSubscribers = cDetails.subscribers;
            }
        } else if (ytChannelId) {
            const cDetails = await getChannelDetails(ytChannelId);
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
                    liked: false,
                    comments: [],
                    timestamp: new Date(snippet.publishedAt).getTime()
                });
            }

            if (newVideos.length > 0) {
                // Use batch writes for massive speed improvement
                showProgress(70, `Writing ${newVideos.length} new videos in batches...`);
                await saveBatchVideos(newVideos);
                showProgress(90, "Finalizing...");
            }

            // Create or update channel with sync configuration
            const channels = await getChannels();
            const channelData = channels[targetChannel] || { subscribers: 0, subscribed: false, avatarUrl: "", coverUrl: "" };
            
            // Add sync metadata to the channel to enable future auto-syncing
            if (ytChannelId) channelData.ytChannelId = ytChannelId;
            if (targetPlaylistId) channelData.ytPlaylistId = targetPlaylistId;
            if (category) channelData.syncCategory = category;
            
            // Only update subscribers if they grew (don't overwrite with 0 if API failed)
            if (fetchedSubscribers > (channelData.subscribers || 0)) {
                channelData.subscribers = fetchedSubscribers;
            }
            
            channelData.lastSyncTime = Date.now(); // We just synced it manually

            await saveChannel(targetChannel, channelData);

            const skipped = videos.length - newVideos.length;
            let statusMsg = `✓ Successfully imported ${newVideos.length} videos to "${targetChannel}"!`;
            if (skipped > 0) statusMsg += ` (${skipped} duplicates skipped)`;
            
            showProgress(100, "Complete!");
            ytStatus.textContent = statusMsg;
            ytStatus.className = "text-xs font-bold text-green-400";
            ytImportForm.reset();
            await loadAdminDashboard();

            setTimeout(hideProgress, 3000);
        } else if (videos && videos.length === 0) {
            ytStatus.textContent = "No videos found longer than 1 minute.";
            ytStatus.className = "text-xs font-bold text-yellow-400";
            hideProgress();
        }

        // Re-enable button
        ytImportBtn.disabled = false;
        ytImportBtn.innerHTML = '<i class="fab fa-youtube"></i> <span>Fetch &amp; Import Videos</span>';
    });

    // Do NOT auto-load dashboard on page load (loads after login)
    // await loadAdminDashboard(); <-- removed for instant page load
});