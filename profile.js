document.addEventListener("DOMContentLoaded", async () => {
    // ===== PUBLIC PROFILE VIEW =====
    const urlParams = new URLSearchParams(window.location.search);
    const publicUserParam = urlParams.get('user');

    if (publicUserParam) {
        // Show public profile for another user
        document.getElementById('own-profile-view').classList.add('hidden');
        const publicView = document.getElementById('public-profile-view');
        publicView.classList.remove('hidden');

        // Try to look up by email in Firestore users collection
        let displayName = publicUserParam;
        let avatarUrl = null;
        let coverUrl = null;

        try {
            // Wait for firebase to be ready
            await new Promise(resolve => {
                if (typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length) return resolve();
                const interval = setInterval(() => {
                    if (typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length) {
                        clearInterval(interval); resolve();
                    }
                }, 100);
                setTimeout(() => { clearInterval(interval); resolve(); }, 5000);
            });
            // Look up user by email
            const snapshot = await db.collection('users').where('email', '==', publicUserParam).limit(1).get();
            if (!snapshot.empty) {
                const data = snapshot.docs[0].data();
                displayName = data.name || data.displayName || publicUserParam;
                avatarUrl = data.avatarUrl || null;
                coverUrl = data.coverUrl || null;
            }
        } catch(e) { /* silently fail */ }

        document.getElementById('public-profile-name').textContent = displayName;
        document.getElementById('public-profile-email').textContent = publicUserParam.includes('@') ? publicUserParam : '';
        document.getElementById('public-avatar-letter').textContent = displayName[0].toUpperCase();

        if (avatarUrl) {
            document.getElementById('public-profile-avatar').innerHTML = `<img src="${avatarUrl}" class="w-full h-full object-cover">`;
        }
        if (coverUrl) {
            document.getElementById('public-profile-cover').innerHTML = `<img src="${coverUrl}" class="w-full h-full object-cover">`;
        }
        return; // Stop here, don't render own profile
    }

    // ===== OWN PROFILE VIEW =====
    const profileCover = document.getElementById("profile-cover");
    const profileAvatar = document.getElementById("profile-avatar");
    const profileName = document.getElementById("profile-name");
    const profileEmail = document.getElementById("profile-email");
    const editBtn = document.getElementById("edit-profile-btn");
    const editFormContainer = document.getElementById("edit-form-container");
    const profileForm = document.getElementById("profile-form");
    const cancelEditBtn = document.getElementById("cancel-edit-btn");
    const historyGrid = document.getElementById("history-grid");
    const savedGrid = document.getElementById("saved-grid");
    
    const pAvatarUrl = document.getElementById("p-avatar-url");
    const pCoverUrl = document.getElementById("p-cover-url");

    document.addEventListener('authStateChanged', async (e) => {
        if (e.detail) {
            loadProfile(e.detail);
            loadHistory();
            loadSavedVideos(e.detail);
        } else {
            window.location.href = "index.html"; // Not logged in
        }
    });

    async function loadProfile(user) {
        profileName.textContent = user.displayName || "User";
        profileEmail.textContent = user.email || "No Email";

        const profileData = await getUserProfile(user.uid);
        if (profileData) {
            if (profileData.coverUrl) {
                profileCover.innerHTML = `<img src="${profileData.coverUrl}" class="w-full h-full object-cover">`;
                pCoverUrl.value = profileData.coverUrl;
            }
            if (profileData.avatarUrl) {
                profileAvatar.innerHTML = `<img src="${profileData.avatarUrl}" class="w-full h-full object-cover">`;
                pAvatarUrl.value = profileData.avatarUrl;
            } else {
                profileAvatar.innerHTML = `<div class="w-full h-full flex items-center justify-center bg-purple-600 text-3xl font-bold">${user.displayName ? user.displayName[0] : 'U'}</div>`;
            }
        } else {
            profileAvatar.innerHTML = `<div class="w-full h-full flex items-center justify-center bg-purple-600 text-3xl font-bold">${user.displayName ? user.displayName[0] : 'U'}</div>`;
        }
    }

    async function loadHistory() {
        const history = await getHistory();
        historyGrid.innerHTML = "";
        
        if (history.length === 0) {
            historyGrid.innerHTML = `<p class="col-span-full text-zinc-500 py-4">No watch history available.</p>`;
            return;
        }

        history.forEach(video => {
            historyGrid.innerHTML += `
                <div class="cursor-pointer group relative" onclick="location.href='watch.html?id=${video.id}'">
                    <div class="relative aspect-video bg-zinc-800 rounded-xl overflow-hidden mb-2">
                        <img src="${video.thumbnail}" alt="${video.title}" class="w-full h-full object-cover group-hover:scale-105 transition duration-200">
                        <span class="absolute bottom-2 right-2 bg-black/80 px-2 py-0.5 rounded text-xs font-semibold z-20">${video.duration}</span>
                    </div>
                    <div>
                        <h3 class="font-semibold text-sm line-clamp-2 leading-snug text-zinc-100 group-hover:text-white">${video.title}</h3>
                        <div class="flex items-center space-x-1 mt-1">
                            <p class="text-xs text-zinc-400 truncate">${video.channel}</p>
                            <img src="img/icons.svg" class="w-3 h-3 flex-shrink-0" alt="Verified" title="Verified">
                        </div>
                    </div>
                </div>
            `;
        });
    }

    async function loadSavedVideos(user) {
        const videos = await getVideos();
        const savedVideos = videos.filter(v => v.savedBy && v.savedBy.includes(user.email));
        
        savedGrid.innerHTML = "";
        
        if (savedVideos.length === 0) {
            savedGrid.innerHTML = `<p class="col-span-full text-zinc-500 py-4">No saved videos yet.</p>`;
            return;
        }

        savedVideos.forEach(video => {
            savedGrid.innerHTML += `
                <div class="cursor-pointer group relative" onclick="location.href='watch.html?id=${video.id}'">
                    <div class="relative aspect-video bg-zinc-800 rounded-xl overflow-hidden mb-2">
                        <img src="${video.thumbnail}" alt="${video.title}" class="w-full h-full object-cover group-hover:scale-105 transition duration-200">
                        <span class="absolute bottom-2 right-2 bg-black/80 px-2 py-0.5 rounded text-xs font-semibold z-20">${video.duration}</span>
                    </div>
                    <div>
                        <h3 class="font-semibold text-sm line-clamp-2 leading-snug text-zinc-100 group-hover:text-white">${video.title}</h3>
                        <div class="flex items-center space-x-1 mt-1">
                            <p class="text-xs text-zinc-400 truncate">${video.channel}</p>
                            <img src="img/icons.svg" class="w-3 h-3 flex-shrink-0" alt="Verified" title="Verified">
                        </div>
                    </div>
                </div>
            `;
        });
    }

    editBtn.addEventListener("click", () => {
        editFormContainer.classList.toggle("hidden");
    });

    cancelEditBtn.addEventListener("click", () => {
        editFormContainer.classList.add("hidden");
    });

    profileForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        if(!currentUser) return;

        const data = {
            avatarUrl: pAvatarUrl.value.trim(),
            coverUrl: pCoverUrl.value.trim()
        };

        await updateUserProfile(currentUser.uid, data);
        alert("Profile updated successfully!");
        editFormContainer.classList.add("hidden");
        loadProfile(currentUser);
    });
});
