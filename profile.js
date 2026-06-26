document.addEventListener("DOMContentLoaded", () => {
    const profileCover = document.getElementById("profile-cover");
    const profileAvatar = document.getElementById("profile-avatar");
    const profileName = document.getElementById("profile-name");
    const profileEmail = document.getElementById("profile-email");
    const editBtn = document.getElementById("edit-profile-btn");
    const editFormContainer = document.getElementById("edit-form-container");
    const profileForm = document.getElementById("profile-form");
    const cancelEditBtn = document.getElementById("cancel-edit-btn");
    const historyGrid = document.getElementById("history-grid");
    
    const pAvatarUrl = document.getElementById("p-avatar-url");
    const pCoverUrl = document.getElementById("p-cover-url");

    document.addEventListener('authStateChanged', async (e) => {
        if (e.detail) {
            loadProfile(e.detail);
            loadHistory();
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
