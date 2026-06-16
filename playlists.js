document.addEventListener("DOMContentLoaded", async () => {
    const loading = document.getElementById("playlists-loading");
    const grid = document.getElementById("playlists-grid");
    
    const modal = document.getElementById("playlist-modal");
    const closeBtn = document.getElementById("close-playlist");
    const modalName = document.getElementById("modal-playlist-name");
    const modalCount = document.getElementById("modal-playlist-count");
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
        modalCount.textContent = `${p.videos.length} videos`;
        
        modalVideos.innerHTML = "";
        p.videos.forEach((v, idx) => {
            modalVideos.innerHTML += `
                <div class="flex gap-4 p-3 hover:bg-zinc-800 rounded-xl cursor-pointer transition" onclick="location.href='watch.html?id=${v.id}'">
                    <div class="text-zinc-500 font-bold self-center w-6 text-center">${idx + 1}</div>
                    <div class="w-32 aspect-video bg-zinc-700 rounded-lg overflow-hidden flex-shrink-0 relative">
                        <img src="${v.thumbnail}" class="w-full h-full object-cover">
                        <span class="absolute bottom-1 right-1 bg-black/80 px-1 py-0.5 rounded text-[10px] font-semibold">${v.duration}</span>
                    </div>
                    <div class="flex-1">
                        <h4 class="font-bold text-sm text-zinc-100 line-clamp-2">${v.title}</h4>
                        <p class="text-xs text-zinc-400 mt-1">${v.channel}</p>
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
                    <p class="text-sm text-zinc-400 mt-0.5">${p.channel}</p>
                </div>
            </div>
        `;
    });
});
