document.addEventListener("DOMContentLoaded", async () => {
    const loading = document.getElementById("playlists-loading");
    const grid = document.getElementById("playlists-grid");
    
    const modal = document.getElementById("playlist-modal");
    const closeBtn = document.getElementById("close-playlist");
    const modalName = document.getElementById("modal-playlist-name");
    const modalChannel = document.getElementById("modal-playlist-channel");
    const modalStats = document.getElementById("modal-playlist-stats");
    const modalThumb = document.getElementById("modal-playlist-thumb");
    const modalBg = document.getElementById("modal-bg-img");
    const modalVideos = document.getElementById("modal-videos-grid");

    closeBtn.addEventListener("click", () => modal.classList.add("hidden"));

    const playlists = await getPlaylists();
    
    loading.classList.add("hidden");
    grid.classList.remove("hidden");

    if (playlists.length === 0) {
        grid.innerHTML = `<p class="col-span-full text-zinc-500 py-4 text-center">No playlists available.</p>`;
        return;
    }

    // Attach data safely to window to use in onclick without serialization issues
    window.openPlaylist = function(index) {
        const p = playlists[index];
        modalName.textContent = p.name;
        modalChannel.textContent = p.channel;
        
        // Find most recent timestamp for "Last updated"
        let latestTime = 0;
        p.videos.forEach(v => {
            if (v.timestamp > latestTime) latestTime = v.timestamp;
        });
        const updatedText = latestTime > 0 ? timeAgo(latestTime) : 'recently';
        modalStats.textContent = `${p.videos.length} videos • Last updated ${updatedText}`;
        
        modalThumb.src = p.thumbnail;
        modalBg.style.backgroundImage = `url('${p.thumbnail}')`;
        
        modalVideos.innerHTML = "";
        p.videos.forEach((v, idx) => {
            modalVideos.innerHTML += `
                <div class="flex gap-4 p-2 sm:p-3 hover:bg-white/10 rounded-xl cursor-pointer transition group" onclick="location.href='watch.html?id=${v.id}'">
                    <div class="text-zinc-400 font-medium self-center w-4 sm:w-6 text-center text-xs sm:text-sm group-hover:hidden">${idx + 1}</div>
                    <div class="text-white font-medium self-center w-4 sm:w-6 text-center text-xs sm:text-sm hidden group-hover:block"><i class="fas fa-play text-[10px]"></i></div>
                    
                    <div class="w-[120px] sm:w-[160px] aspect-video bg-zinc-800 rounded-lg overflow-hidden flex-shrink-0 relative">
                        <img src="${v.thumbnail}" class="w-full h-full object-cover">
                        <span class="absolute bottom-1 right-1 bg-black/80 px-1.5 py-0.5 rounded text-[10px] font-semibold text-white">${v.duration}</span>
                    </div>
                    <div class="flex-1 min-w-0 pr-2 sm:pr-4 py-1">
                        <h4 class="font-semibold text-sm sm:text-base text-zinc-100 line-clamp-2 leading-tight group-hover:text-white">${v.title}</h4>
                        <div class="flex flex-col sm:flex-row sm:items-center sm:space-x-1 mt-1 sm:mt-1.5 text-xs text-zinc-400">
                            <p class="truncate hover:text-zinc-300">${v.channel}</p>
                            <span class="hidden sm:inline">•</span>
                            <p>${formatCompactNumber(v.views)} views</p>
                        </div>
                    </div>
                </div>
            `;
        });
        modal.classList.remove("hidden");
    };

    playlists.forEach((p, index) => {
        grid.innerHTML += `
            <div class="cursor-pointer group relative" onclick="openPlaylist(${index})">
                <div class="relative aspect-video bg-zinc-800 rounded-xl overflow-hidden mb-3">
                    <img src="${p.thumbnail}" alt="${p.name}" class="w-full h-full object-cover group-hover:scale-105 transition duration-200 opacity-60">
                    <div class="absolute inset-0 flex items-center justify-center">
                        <i class="fas fa-play text-4xl text-white opacity-80 group-hover:opacity-100 group-hover:scale-110 transition drop-shadow-md"></i>
                    </div>
                    <div class="absolute top-2 right-2 bg-black/80 px-2 py-1 rounded text-xs font-bold flex items-center space-x-1">
                        <i class="fas fa-list"></i>
                        <span>${p.videos.length}</span>
                    </div>
                </div>
                <div>
                    <h3 class="font-bold text-base line-clamp-1 text-zinc-100 group-hover:text-white">${p.name}</h3>
                    <div class="flex items-center space-x-1 mt-0.5">
                        <p class="text-sm text-zinc-400 truncate">${p.channel}</p>
                        <img src="img/icons.svg" class="w-3.5 h-3.5 flex-shrink-0" alt="Verified" title="Verified">
                    </div>
                </div>
            </div>
        `;
    });
});
