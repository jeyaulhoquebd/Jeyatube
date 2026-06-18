document.addEventListener("DOMContentLoaded", async () => {
    const uploadForm = document.getElementById("upload-form");
    const tableBody = document.getElementById("admin-table-body");
    const videoCount = document.getElementById("video-count");
    const sidebarVideoCount = document.getElementById("sidebar-video-count");

    const adminLoginOverlay = document.getElementById("admin-login-overlay");
    const adminLoginForm = document.getElementById("admin-login-form");
    const adminPassword = document.getElementById("admin-password");

    adminLoginForm.addEventListener("submit", (e) => {
        e.preventDefault();
        if (adminPassword.value === "Jeyaul") {
            adminLoginOverlay.classList.add("hidden");
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
        await loadChannelsForAdmin();
        const videos = await getVideos();
        const count = videos.length;
        videoCount.textContent = count;
        sidebarVideoCount.textContent = count;
        tableBody.innerHTML = "";

        if (videos.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="4" class="text-center py-10 text-zinc-500 italic">No videos in database. Upload one first!</td>
                </tr>`;
            return;
        }

        videos.forEach(video => {
            tableBody.innerHTML += `
                <tr class="hover:bg-zinc-800/30 transition">
                    <td class="px-5 py-3.5 flex items-center space-x-3 min-w-[200px]">
                        <img src="${video.thumbnail}" class="w-16 aspect-video object-cover rounded-lg bg-zinc-700 flex-shrink-0" loading="lazy">
                        <div class="truncate max-w-[200px]">
                            <p class="font-semibold text-white truncate text-xs sm:text-sm">${video.title}</p>
                            <p class="text-[11px] text-zinc-500 sm:hidden">${video.channel}</p>
                            <p class="text-[11px] text-zinc-600">${video.views?.toLocaleString() || 0} views</p>
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

        if (!thumbnail) {
            thumbnail = "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=500&auto=format&fit=crop&q=60";
        }
        if (!videoUrl) {
            videoUrl = "https://www.youtube.com/watch?v=60Yo63VFt-M";
        }

        const ytRegex = /^(https?:\/\/)?(www\.youtube\.com|youtu\.?be)\/.+$/;
        if (!ytRegex.test(videoUrl)) {
            alert("Error: Only YouTube links are allowed! Please provide a valid YouTube URL.");
            return;
        }

        const newVideo = {
            id: "vid_" + Date.now().toString(),
            title,
            channel: channelName,
            category,
            playlist: playlistName,
            views: 0,
            time: "Just now",
            duration,
            thumbnail,
            videoUrl,
            description: description || "No description provided.",
            likes: 0,
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
        const cover = document.getElementById("new-c-cover").value.trim();
        const avatar = document.getElementById("new-c-avatar").value.trim();
        const bio = document.getElementById("new-c-bio").value.trim();
        const links = document.getElementById("new-c-links").value.trim();

        if (!name) { alert("Please enter a channel name."); return; }

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

    function formatDuration(totalSeconds) {
        const h = Math.floor(totalSeconds / 3600);
        const m = Math.floor((totalSeconds % 3600) / 60);
        const s = totalSeconds % 60;
        if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        return `${m}:${s.toString().padStart(2, '0')}`;
    }

    async function fetchYouTubeVideos(playlistId) {
        let allVideos = [];
        let pageToken = '';
        const maxPages = 3;
        let pagesFetched = 0;

        try {
            while (pagesFetched < maxPages) {
                const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&maxResults=50&playlistId=${playlistId}&key=${ENV.YOUTUBE_API_KEY}&pageToken=${pageToken}`;
                const res = await fetch(url);
                const data = await res.json();

                if (data.error) throw new Error(data.error.message);

                if (data.items && data.items.length > 0) {
                    const videoIds = data.items.map(item => item.contentDetails.videoId).filter(Boolean).join(',');
                    if (videoIds) {
                        const vidRes = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${videoIds}&key=${ENV.YOUTUBE_API_KEY}`);
                        const vidData = await vidRes.json();

                        const durationMap = {};
                        if (vidData.items) {
                            vidData.items.forEach(v => { durationMap[v.id] = v.contentDetails.duration; });
                        }

                        const filtered = data.items.filter(item => {
                            const dStr = durationMap[item.contentDetails.videoId];
                            if (!dStr) return false;
                            let total = 0;
                            const match = dStr.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
                            if (match) {
                                total = (parseInt(match[1] || 0) * 3600) + (parseInt(match[2] || 0) * 60) + parseInt(match[3] || 0);
                            }
                            item._durationText = formatDuration(total);
                            return total > 180;
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
            return null;
        }
    }

    async function getChannelUploadPlaylistId(channelId) {
        try {
            const res = await fetch(`https://www.googleapis.com/youtube/v3/channels?part=contentDetails&id=${channelId}&key=${ENV.YOUTUBE_API_KEY}`);
            const data = await res.json();
            if (data.error) throw new Error(data.error.message);
            if (data.items && data.items.length > 0) {
                return data.items[0].contentDetails.relatedPlaylists.uploads;
            }
            throw new Error("Channel not found.");
        } catch (error) {
            ytStatus.textContent = `Error: ${error.message}`;
            ytStatus.className = "text-xs font-bold text-red-400";
            ytStatus.classList.remove("hidden");
            return null;
        }
    }

    ytImportForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const ytChannelId = document.getElementById("yt-channel-id").value.trim();
        const ytPlaylistId = document.getElementById("yt-playlist-id").value.trim();
        const targetChannel = document.getElementById("yt-target-channel").value.trim();
        const category = document.getElementById("yt-category").value.trim();

        if (!ytChannelId && !ytPlaylistId) {
            alert("Please provide a YouTube Channel ID or Playlist ID.");
            return;
        }

        ytStatus.textContent = "Fetching videos from YouTube... Please wait.";
        ytStatus.className = "text-xs font-bold text-zinc-400";
        ytStatus.classList.remove("hidden");

        let targetPlaylistId = ytPlaylistId;
        if (!targetPlaylistId && ytChannelId) {
            targetPlaylistId = await getChannelUploadPlaylistId(ytChannelId);
        }
        if (!targetPlaylistId) return;

        const videos = await fetchYouTubeVideos(targetPlaylistId);
        if (videos && videos.length > 0) {
            ytStatus.textContent = `Found ${videos.length} videos. Importing...`;
            for (const item of videos) {
                const snippet = item.snippet;
                const videoId = snippet.resourceId ? snippet.resourceId.videoId : (item.contentDetails ? item.contentDetails.videoId : '');
                if (!videoId) continue;

                await saveVideo({
                    id: "yt_" + videoId,
                    title: snippet.title,
                    channel: targetChannel,
                    category,
                    playlist: "",
                    views: 0,
                    time: "Just now",
                    duration: item._durationText || "",
                    thumbnail: snippet.thumbnails?.high?.url || snippet.thumbnails?.default?.url || "",
                    videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
                    description: snippet.description || "Imported from YouTube",
                    likes: 0,
                    liked: false,
                    comments: [],
                    timestamp: new Date(snippet.publishedAt).getTime()
                });
            }

            const channels = await getChannels();
            if (!channels[targetChannel]) {
                await saveChannel(targetChannel, { subscribers: 0, subscribed: false, avatarUrl: "", coverUrl: "" });
            }

            ytStatus.textContent = `✓ Successfully imported ${videos.length} videos to "${targetChannel}"!`;
            ytStatus.className = "text-xs font-bold text-green-400";
            ytImportForm.reset();
            await loadAdminDashboard();
        } else if (videos && videos.length === 0) {
            ytStatus.textContent = "No qualifying videos found (all under 3 minutes?).";
            ytStatus.className = "text-xs font-bold text-red-400";
        }
    });

    // Initialize
    await loadAdminDashboard();
});