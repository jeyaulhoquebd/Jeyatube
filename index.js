document.addEventListener("DOMContentLoaded", async () => {
    const videoGrid = document.getElementById("video-grid");
    const sidebar = document.getElementById("sidebar");
    const menuBtn = document.getElementById("menu-btn");
    const categoryBtns = document.querySelectorAll(".category-btn");
    const sidebarChannels = document.getElementById("sidebar-channels");

    // Toggle Responsive Mobile Sidebar
    menuBtn.addEventListener("click", () => {
        sidebar.classList.toggle("-translate-x-full");
    });

    // Populate Sidebar with Subscribed channels
    async function renderSidebarChannels() {
        const channels = await getChannels();
        sidebarChannels.innerHTML = "";
        Object.keys(channels).forEach(channelName => {
            if (channels[channelName].subscribed) {
                sidebarChannels.innerHTML += `
                    <div class="flex items-center space-x-3 p-2 hover:bg-zinc-800 rounded-xl text-zinc-300">
                        <div class="bg-zinc-700 w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs">${channelName[0]}</div>
                        <span class="text-sm truncate">${channelName}</span>
                    </div>
                `;
            }
        });
    }

    // Render Videos Grid
    async function renderVideos(filterCategory = "all") {
        const videos = await getVideos();
        videoGrid.innerHTML = "";

        const filteredVideos = filterCategory === "all" 
            ? videos 
            : videos.filter(v => v.category.toLowerCase() === filterCategory.toLowerCase());

        if (filteredVideos.length === 0) {
            videoGrid.innerHTML = `<p class="col-span-full text-zinc-500 text-center py-10">No videos found under this category.</p>`;
            return;
        }

        filteredVideos.forEach(video => {
            // --- Quality Badge ---
            let qualityBadgeHtml = "";
            if (video.contentQuality) {
                const isGood = video.contentQuality === "Good Video";
                const badgeColor = isGood ? "bg-green-500/20 text-green-400 border-green-500/30" : "bg-red-500/20 text-red-400 border-red-500/30";
                const badgeIcon = isGood ? "fa-circle-check" : "fa-triangle-exclamation";
                qualityBadgeHtml = `
                    <span class="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 font-bold rounded border ${badgeColor} mb-1">
                        <i class="fas ${badgeIcon} text-[8px]"></i> ${video.contentQuality}
                    </span>
                `;
            }

            videoGrid.innerHTML += `
                <div class="cursor-pointer group" onclick="location.href='watch.html?id=${video.id}'">
                    <div class="relative aspect-video bg-zinc-800 rounded-xl overflow-hidden mb-3">
                        <img src="${video.thumbnail}" alt="${video.title}" class="w-full h-full object-cover group-hover:scale-105 transition duration-200">
                        <span class="absolute bottom-2 right-2 bg-black/80 px-2 py-0.5 rounded text-xs font-semibold">${video.duration}</span>
                    </div>
                    <div class="flex space-x-3">
                        <div class="flex-shrink-0 bg-zinc-700 w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm mt-0.5">
                            ${video.channel[0]}
                        </div>
                        <div class="flex-1 min-w-0">
                            ${qualityBadgeHtml}
                            <h3 class="font-semibold text-sm line-clamp-2 leading-snug text-zinc-100 group-hover:text-white">${video.title}</h3>
                            <p class="text-xs text-zinc-400 mt-1 hover:text-zinc-200 truncate">${video.channel}</p>
                            <p class="text-xs text-zinc-400 mt-0.5">${video.views} views • ${video.time}</p>
                        </div>
                    </div>
                </div>
            `;
        });
    }

    // Category Tag Click Handlers
    categoryBtns.forEach(btn => {
        btn.addEventListener("click", async (e) => {
            categoryBtns.forEach(b => b.classList.replace("bg-white", "bg-zinc-800"));
            categoryBtns.forEach(b => b.classList.replace("text-black", "text-white"));
            
            e.target.classList.replace("bg-zinc-800", "bg-white");
            e.target.classList.replace("text-white", "text-black");

            await renderVideos(e.target.dataset.category);
        });
    });

    // Run Initializations
    await renderSidebarChannels();
    await renderVideos();
});