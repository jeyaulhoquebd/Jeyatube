document.addEventListener("DOMContentLoaded", async () => {
    const loading = document.getElementById("channels-loading");
    const grid = document.getElementById("channels-grid");
    
    // Auth Modal DOM
    const authModal = document.getElementById("auth-modal");
    const closeAuthBtn = document.getElementById("close-auth");
    const authForm = document.getElementById("auth-form");
    const authTitle = document.getElementById("auth-title");
    const nameGroup = document.getElementById("name-group");
    const authName = document.getElementById("auth-name");
    const authEmail = document.getElementById("auth-email");
    const authPassword = document.getElementById("auth-password");
    const authSubmitText = document.getElementById("auth-submit-text");
    const authSwitchText = document.getElementById("auth-switch-text");
    const authSwitchBtn = document.getElementById("auth-switch-btn");
    const googleAuthBtn = document.getElementById("google-auth-btn");
    
    let isRegistering = false;

    closeAuthBtn.addEventListener("click", () => authModal.classList.add("hidden"));
    
    authSwitchBtn.addEventListener("click", () => {
        isRegistering = !isRegistering;
        if (isRegistering) {
            authTitle.textContent = "Create an Account";
            nameGroup.classList.remove("hidden");
            authName.required = true;
            authSubmitText.textContent = "Register";
            authSwitchText.textContent = "Already have an account?";
            authSwitchBtn.textContent = "Login";
        } else {
            authTitle.textContent = "Login Required";
            nameGroup.classList.add("hidden");
            authName.required = false;
            authSubmitText.textContent = "Login";
            authSwitchText.textContent = "Don't have an account?";
            authSwitchBtn.textContent = "Register";
        }
    });

    authForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        try {
            if (isRegistering) {
                await registerWithEmail(authEmail.value, authPassword.value, authName.value);
            } else {
                await loginWithEmail(authEmail.value, authPassword.value);
            }
            authModal.classList.add("hidden");
        } catch (error) {
            showToast(error.message, "error");
        }
    });

    if(googleAuthBtn) {
        googleAuthBtn.addEventListener("click", async () => {
            try {
                await loginWithGoogle();
                authModal.classList.add("hidden");
            } catch (error) {
                showToast(error.message, "error");
            }
        });
    }

    const channelsMap = await getChannels();
    const channels = Object.keys(channelsMap).map(name => ({ name, ...channelsMap[name] }));
    
    loading.classList.add("hidden");
    grid.classList.remove("hidden");

    if (channels.length === 0) {
        grid.innerHTML = `<p class="col-span-full text-zinc-500 py-4 text-center">No channels available.</p>`;
        return;
    }

    window.openAuthModal = function() {
        authModal.classList.remove("hidden");
    }

    window.subscribeToChannel = async function(e, channelName) {
        e.stopPropagation();
        if (!currentUser) return openAuthModal();
        
        let cData = channelsMap[channelName];
        if (!cData.subscribedBy) cData.subscribedBy = [];
        
        const index = cData.subscribedBy.indexOf(currentUser.email);
        if (index > -1) {
            cData.subscribedBy.splice(index, 1);
        } else {
            cData.subscribedBy.push(currentUser.email);
        }
        await saveChannel(channelName, cData);
        renderChannels();
    };

    function renderChannels() {
        grid.innerHTML = "";
        const fragment = document.createDocumentFragment();
        channels.forEach(c => {
            const isSubscribed = c.subscribedBy && currentUser && c.subscribedBy.includes(currentUser.email);
            const subCount = c.subscribedBy ? c.subscribedBy.length : (c.subscribers || 0);
            
            let btnClass = isSubscribed 
                ? "bg-zinc-800 text-zinc-400 hover:bg-zinc-700" 
                : "bg-white text-black hover:bg-zinc-200";
            let btnText = isSubscribed ? "Subscribed" : "Subscribe";

            let avatarHtml = c.avatarUrl 
                ? `<img src="${c.avatarUrl}" class="w-full h-full object-cover">`
                : `<div class="w-full h-full flex items-center justify-center bg-purple-600 text-3xl font-bold">${c.name[0]}</div>`;

            let coverHtml = c.coverUrl
                ? `<img src="${c.coverUrl}" class="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition">`
                : `<div class="w-full h-full bg-zinc-800"></div>`;

            const el = document.createElement('div');
            el.className = "cursor-pointer group relative bg-[#12151c] hover:bg-[#181c26] border border-white/[0.08] hover:border-white/[0.18] rounded-2xl overflow-hidden transition-all duration-200 shadow-sm";
            el.onclick = () => location.href = `channel.html?name=${encodeURIComponent(c.name)}`;
            el.innerHTML = `
                <div class="h-24 w-full relative">
                    ${coverHtml}
                </div>
                <div class="px-5 pb-5 flex flex-col items-center -mt-10 relative">
                    <div class="w-20 h-20 rounded-full border-4 border-[#0b0e14] overflow-hidden bg-zinc-800 shadow-lg mb-3">
                        ${avatarHtml}
                    </div>
                    <span class="inline-flex items-center gap-1 text-[9px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 mb-2">
                        <i class="fas fa-certificate text-[8px]"></i> Curated Creator
                    </span>
                    <div class="flex items-center space-x-1 mb-1">
                        <h3 class="font-bold text-base text-white text-center line-clamp-1 group-hover:text-emerald-300 transition">${c.name}</h3>
                        <img src="img/icons.svg" class="w-4 h-4 flex-shrink-0" alt="Verified" title="Verified">
                    </div>
                    <p class="text-xs text-zinc-400 mb-4">${formatCompactNumber(subCount)} subscribers</p>
                    
                    <button class="w-full ${btnClass} px-4 py-2 rounded-full font-semibold transition text-sm shadow-sm" onclick="subscribeToChannel(event, '${c.name.replace(/'/g, "\\'")}')">
                        ${btnText}
                    </button>
                </div>
            `;
            fragment.appendChild(el);
        });
        grid.appendChild(fragment);
    }

    renderChannels();

    document.addEventListener('authStateChanged', () => {
        renderChannels();
    });
});
