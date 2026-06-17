document.addEventListener("DOMContentLoaded", async () => {
    const uploadForm = document.getElementById("upload-form");
    const tableBody = document.getElementById("admin-table-body");
    const videoCount = document.getElementById("video-count");
    
    const adminLoginOverlay = document.getElementById("admin-login-overlay");
    const adminLoginForm = document.getElementById("admin-login-form");
    const adminPassword = document.getElementById("admin-password");

    adminLoginForm.addEventListener("submit", (e) => {
        e.preventDefault();
        if (adminPassword.value === "Jeyaul") {
            adminLoginOverlay.classList.add("hidden");
        } else {
            alert("Incorrect password!");
            adminPassword.value = "";
        }
    });

    // Load elements and paint structural data view metrics
    async function loadAdminDashboard() {
        await loadChannelsForAdmin();
        const videos = await getVideos();
        videoCount.textContent = videos.length;
        tableBody.innerHTML = "";

        if (videos.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="4" class="text-center py-8 text-zinc-500 italic">No videos inside database. Upload one above!</td>
                </tr>`;
            return;
        }

        videos.forEach(video => {
            tableBody.innerHTML += `
                <tr class="hover:bg-zinc-800/30 transition">
                    <td class="px-4 py-3 flex items-center space-x-3">
                        <img src="${video.thumbnail}" class="w-14 aspect-video object-cover rounded bg-zinc-700 flex-shrink-0">
                        <div class="truncate max-w-[180px] sm:max-w-xs">
                            <p class="font-medium text-white truncate text-xs sm:text-sm">${video.title}</p>
                            <p class="text-[11px] text-zinc-500 sm:hidden">${video.channel}</p>
                        </div>
                    </td>
                    <td class="px-4 py-3 text-zinc-400 text-xs sm:text-sm hidden sm:table-cell">${video.channel}</td>
                    <td class="px-4 py-3">
                        <span class="bg-zinc-900 px-2 py-1 rounded text-xs text-zinc-400 border border-zinc-700">${video.category}</span>
                    </td>
                    <td class="px-4 py-3 text-center">
                        <button onclick="deleteVideoHandler('${video.id}')" class="text-red-500 hover:text-red-400 hover:bg-red-500/10 p-2 rounded-full transition">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    </td>
                </tr>
            `;
        });
    }

    // Video Submission Sequence
    uploadForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        // Capture values
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

        // Assign clean placeholder defaults if values are left empty
        if (!thumbnail) {
            thumbnail = "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=500&auto=format&fit=crop&q=60";
        }
        if (!videoUrl) {
            videoUrl = "https://www.youtube.com/watch?v=60Yo63VFt-M"; // Only youtube links allowed per prompt
        }

        // Validate YouTube Link
        const ytRegex = /^(https?\:\/\/)?(www\.youtube\.com|youtu\.?be)\/.+$/;
        if (!ytRegex.test(videoUrl)) {
            alert("Error: Only YouTube links can be added to the website! Please provide a valid YouTube URL (e.g., https://www.youtube.com/watch?v=...).");
            return;
        }

        // Build new structured layout model payload
        const newVideo = {
            id: "vid_" + Date.now().toString(),
            title: title,
            channel: channelName,
            category: category,
            playlist: playlistName,
            views: 0,
            time: "Just now",
            duration: duration,
            thumbnail: thumbnail,
            videoUrl: videoUrl,
            description: description || "No description provided.",
            likes: 0,
            liked: false,
            comments: [],
            timestamp: Date.now()
        };

        // Inject video update sequence to Firebase
        await saveVideo(newVideo);

        // Auto-provision channel profile parameters inside channel database map if not found
        let channels = await getChannels();
        if (!channels[channelName]) {
            await saveChannel(channelName, { 
                subscribers: 0, 
                subscribed: false,
                avatarUrl: cAvatar || "",
                coverUrl: cCover || ""
            });
        }

        // Reset inputs and repaint table metrics
        uploadForm.reset();
        await loadAdminDashboard();
    });

    // Make target deletion functional context variables accessible globally
    window.deleteVideoHandler = async function(id) {
        if (confirm("Are you sure you want to delete this video from JTube?")) {
            await deleteVideo(id); // calls data.js delete function
            await loadAdminDashboard();
        }
    };

    // Channel Management Logic
    const channelList = document.getElementById("channel-list");
    const editChannelSelect = document.getElementById("edit-channel-select");
    const editChannelForm = document.getElementById("edit-channel-form");
    const editCAvatar = document.getElementById("edit-c-avatar");
    const editCCover = document.getElementById("edit-c-cover");
    const editCBio = document.getElementById("edit-c-bio");
    const editCLinks = document.getElementById("edit-c-links");

    let currentChannelsData = {};

    async function loadChannelsForAdmin() {
        currentChannelsData = await getChannels();
        
        channelList.innerHTML = "";
        editChannelSelect.innerHTML = '<option value="">-- Choose a Channel --</option>';

        Object.keys(currentChannelsData).forEach(channelName => {
            // Populate datalist for video upload
            const option = document.createElement("option");
            option.value = channelName;
            channelList.appendChild(option);

            // Populate select for edit
            const editOption = document.createElement("option");
            editOption.value = channelName;
            editOption.textContent = channelName;
            editChannelSelect.appendChild(editOption);
        });
    }

    editChannelSelect.addEventListener("change", (e) => {
        const selectedChannel = e.target.value;
        if (selectedChannel && currentChannelsData[selectedChannel]) {
            const data = currentChannelsData[selectedChannel];
            editCAvatar.value = data.avatarUrl || "";
            editCCover.value = data.coverUrl || "";
            editCBio.value = data.bio || "";
            editCLinks.value = data.links || "";
            editChannelForm.classList.remove("hidden");
        } else {
            editChannelForm.classList.add("hidden");
        }
    });

    editChannelForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const selectedChannel = editChannelSelect.value;
        if (!selectedChannel) return;

        const updatedData = {
            avatarUrl: editCAvatar.value.trim(),
            coverUrl: editCCover.value.trim(),
            bio: editCBio.value.trim(),
            links: editCLinks.value.trim()
        };

        await saveChannel(selectedChannel, updatedData);
        alert("Channel updated successfully!");
        await loadChannelsForAdmin(); // Refresh data
        editChannelForm.classList.add("hidden");
        editChannelSelect.value = "";
    });

    // YouTube Import Logic
    const ytImportForm = document.getElementById("yt-import-form");
    const ytStatus = document.getElementById("yt-import-status");

    async function fetchYouTubeVideos(playlistId) {
        let allVideos = [];
        let pageToken = '';
        const maxPages = 3; // Limit to 150 videos per import to avoid overloading
        let pagesFetched = 0;

        function formatDuration(totalSeconds) {
            const h = Math.floor(totalSeconds / 3600);
            const m = Math.floor((totalSeconds % 3600) / 60);
            const s = totalSeconds % 60;
            if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
            return `${m}:${s.toString().padStart(2, '0')}`;
        }

        try {
            while (pagesFetched < maxPages) {
                const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&maxResults=50&playlistId=${playlistId}&key=${ENV.YOUTUBE_API_KEY}&pageToken=${pageToken}`;
                const res = await fetch(url);
                const data = await res.json();

                if (data.error) {
                    throw new Error(data.error.message);
                }

                if (data.items && data.items.length > 0) {
                    const videoIds = data.items.map(item => item.contentDetails.videoId).filter(Boolean).join(',');
                    if (videoIds) {
                        const vidUrl = `https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${videoIds}&key=${ENV.YOUTUBE_API_KEY}`;
                        const vidRes = await fetch(vidUrl);
                        const vidData = await vidRes.json();
                        
                        const durationMap = {};
                        if(vidData.items) {
                            vidData.items.forEach(v => {
                                durationMap[v.id] = v.contentDetails.duration;
                            });
                        }

                        const filteredItems = data.items.filter(item => {
                            const durationStr = durationMap[item.contentDetails.videoId];
                            if(!durationStr) return false;
                            
                            let totalSeconds = 0;
                            const match = durationStr.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
                            if(match) {
                                const h = parseInt(match[1] || 0);
                                const m = parseInt(match[2] || 0);
                                const s = parseInt(match[3] || 0);
                                totalSeconds = h * 3600 + m * 60 + s;
                            }
                            
                            item._durationText = formatDuration(totalSeconds);
                            return totalSeconds > 180; // Only videos above 3 minutes
                        });

                        allVideos = allVideos.concat(filteredItems);
                    }
                }

                pageToken = data.nextPageToken;
                pagesFetched++;

                if (!pageToken) break;
            }
            return allVideos;
        } catch (error) {
            ytStatus.textContent = `Error fetching videos: ${error.message}`;
            ytStatus.classList.remove("hidden", "text-green-500", "text-zinc-400");
            ytStatus.classList.add("text-red-500");
            console.error(error);
            return null;
        }
    }

    async function getChannelUploadPlaylistId(channelId) {
        try {
            const url = `https://www.googleapis.com/youtube/v3/channels?part=contentDetails&id=${channelId}&key=${ENV.YOUTUBE_API_KEY}`;
            const res = await fetch(url);
            const data = await res.json();
            
            if (data.error) throw new Error(data.error.message);
            if (data.items && data.items.length > 0) {
                return data.items[0].contentDetails.relatedPlaylists.uploads;
            }
            throw new Error("Channel not found or has no uploads playlist.");
        } catch (error) {
            ytStatus.textContent = `Error fetching channel: ${error.message}`;
            ytStatus.classList.remove("hidden", "text-green-500", "text-zinc-400");
            ytStatus.classList.add("text-red-500");
            console.error(error);
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
            alert("Please provide either a YouTube Channel ID or Playlist ID.");
            return;
        }

        ytStatus.textContent = "Fetching videos from YouTube... Please wait.";
        ytStatus.classList.remove("hidden", "text-red-500", "text-green-500");
        ytStatus.classList.add("text-zinc-400");

        let targetPlaylistId = ytPlaylistId;

        if (!targetPlaylistId && ytChannelId) {
            targetPlaylistId = await getChannelUploadPlaylistId(ytChannelId);
        }

        if (!targetPlaylistId) return; // Error already handled

        const videos = await fetchYouTubeVideos(targetPlaylistId);
        
        if (videos && videos.length > 0) {
            ytStatus.textContent = `Found ${videos.length} videos. Importing to Firebase...`;

            for (let i = 0; i < videos.length; i++) {
                const item = videos[i];
                const snippet = item.snippet;
                
                // Construct new video object
                const videoId = snippet.resourceId ? snippet.resourceId.videoId : (item.contentDetails ? item.contentDetails.videoId : '');
                if (!videoId) continue;
                
                const newVideo = {
                    id: "yt_" + videoId, // Using YouTube ID to avoid duplicates
                    title: snippet.title,
                    channel: targetChannel,
                    category: category,
                    playlist: "",
                    views: 0,
                    time: "Just now",
                    duration: item._durationText || "", 
                    thumbnail: snippet.thumbnails.high ? snippet.thumbnails.high.url : (snippet.thumbnails.default ? snippet.thumbnails.default.url : ""),
                    videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
                    description: snippet.description || "Imported from YouTube",
                    likes: 0,
                    liked: false,
                    comments: [],
                    timestamp: new Date(snippet.publishedAt).getTime()
                };

                await saveVideo(newVideo);
            }

            // Create target channel if doesn't exist
            let channels = await getChannels();
            if (!channels[targetChannel]) {
                await saveChannel(targetChannel, { 
                    subscribers: 0, 
                    subscribed: false,
                    avatarUrl: "",
                    coverUrl: ""
                });
            }

            ytStatus.textContent = `Successfully imported ${videos.length} videos to channel ${targetChannel}!`;
            ytStatus.classList.remove("text-zinc-400");
            ytStatus.classList.add("text-green-500");
            
            ytImportForm.reset();
            await loadAdminDashboard();
        } else if (videos && videos.length === 0) {
            ytStatus.textContent = "No videos found in the provided channel/playlist.";
            ytStatus.classList.remove("text-zinc-400");
            ytStatus.classList.add("text-red-500");
        }
    });

    // Initialize Dashboard UI Components
    await loadAdminDashboard();
});