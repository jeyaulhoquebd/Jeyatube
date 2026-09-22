document.addEventListener("DOMContentLoaded", async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const videoId = urlParams.get('id');
    const timeParam = urlParams.get('t') || urlParams.get('time');
    const initialSeekTime = timeParam ? Math.max(0, parseInt(timeParam, 10)) : 0;

    const [channels, video] = await Promise.all([getChannels(), getVideoById(videoId)]);

    const loadingScreen = document.getElementById("video-loading-screen");
    if (loadingScreen) {
        loadingScreen.style.opacity = '0';
        setTimeout(() => loadingScreen.classList.add("hidden"), 300);
    }

    if (!video) {
        document.body.innerHTML = `<div class="text-center py-20"><h1 class="text-2xl">Video not found.</h1><a href="index.html" class="text-blue-500 mt-4 block">Return Home</a></div>`;
        return;
    }
    
    // Increment real views asynchronously (Task 2)
    incrementView(video.id);

    const videoPlayer = document.getElementById("video-player");
    const videoTitle = document.getElementById("video-title");
    const channelAvatar = document.getElementById("channel-avatar");
    const channelName = document.getElementById("channel-name");
    const channelSubs = document.getElementById("channel-subs");
    const subscribeBtn = document.getElementById("subscribe-btn");
    const likeBtn = document.getElementById("like-btn");
    const likeCount = document.getElementById("like-count");
    const saveBtn = document.getElementById("save-btn");
    const shareBtn = document.getElementById("share-btn");
    const videoMeta = document.getElementById("video-meta");
    const videoDesc = document.getElementById("video-desc");
    const commentsList = document.getElementById("comments-list");
    const commentCount = document.getElementById("comment-count");
    const commentForm = document.getElementById("comment-form");
    const commentInput = document.getElementById("comment-input");
    const recommendationsContainer = document.getElementById("recommendations");

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
    
    let isRegistering = false;

    // Handle User State
    document.addEventListener('authStateChanged', async (e) => {
        if (e.detail) {
            authModal.classList.add("hidden");
            await addToHistory(video); // Add to history when logged in user visits
        }
        updateInteractionsUI(); // Update UI with correct user state
    });

    function openAuthModal() {
        authModal.classList.remove("hidden");
    }

    closeAuthBtn.addEventListener("click", () => {
        authModal.classList.add("hidden");
    });

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
        const email = authEmail.value;
        const pass = authPassword.value;
        try {
            if (isRegistering) {
                const name = authName.value;
                await registerWithEmail(email, pass, name);
                showToast("Registration successful!", "success");
            } else {
                await loginWithEmail(email, pass);
            }
        } catch (error) {
            showToast(error.message, "error");
        }
    });

    const googleAuthBtn = document.getElementById("google-auth-btn");
    if (googleAuthBtn) {
        googleAuthBtn.addEventListener("click", async () => {
            try {
                await loginWithGoogle();
            } catch (error) {
                showToast(error.message, "error");
            }
        });
    }

    // YouTube Embed Helper
    function getYoutubeId(url) {
        if (!url) return null;
        const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
        const match = url.match(regExp);
        return (match && match[2].length === 11) ? match[2] : null;
    }

    // Shorts Banner Check
    const shortsNoticeBanner = document.getElementById("shorts-notice-banner");
    const shortsBannerLink = document.getElementById("shorts-banner-link");
    if (shortsNoticeBanner && typeof isShortVideo === "function" && isShortVideo(video)) {
        shortsNoticeBanner.classList.remove("hidden");
        if (shortsBannerLink) {
            shortsBannerLink.href = `shorts.html?id=${encodeURIComponent(video.id)}`;
        }
    }

    // Player State & Interactive Controls
    let ytPlayer = null;
    let isUserScrubbing = false;
    let playerDuration = 0;
    let playerCurrentTime = 0;
    let isVideoPlaying = false;
    let controlsInterval = null;

    // Control Elements
    const timeCurrentEl = document.getElementById("player-time-current");
    const timeDurationEl = document.getElementById("player-time-duration");
    const seekSlider = document.getElementById("player-seek-slider");
    const playPauseBtn = document.getElementById("ctrl-play-pause-btn");
    const playIcon = document.getElementById("ctrl-play-icon");
    const rewind10Btn = document.getElementById("ctrl-rewind-10");
    const forward10Btn = document.getElementById("ctrl-forward-10");
    const volumeBtn = document.getElementById("ctrl-volume-btn");
    const volumeIcon = document.getElementById("ctrl-volume-icon");
    const volumeSlider = document.getElementById("ctrl-volume-slider");
    const volumeLabel = document.getElementById("ctrl-volume-label");
    const resolutionBtn = document.getElementById("ctrl-resolution-btn");
    const resolutionLabel = document.getElementById("ctrl-resolution-label");
    const resolutionMenu = document.getElementById("ctrl-resolution-menu");
    const speedBtn = document.getElementById("ctrl-speed-btn");
    const speedLabel = document.getElementById("ctrl-speed-label");
    const speedMenu = document.getElementById("ctrl-speed-menu");
    const fullscreenBtn = document.getElementById("ctrl-fullscreen-btn");
    const videoContainer = document.getElementById("video-container");

    function formatTime(seconds) {
        if (!seconds || isNaN(seconds) || seconds < 0) return "0:00";
        seconds = Math.floor(seconds);
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        const sFormatted = s < 10 ? `0${s}` : `${s}`;
        if (h > 0) {
            const mFormatted = m < 10 ? `0${m}` : `${m}`;
            return `${h}:${mFormatted}:${sFormatted}`;
        }
        return `${m}:${sFormatted}`;
    }

    function updatePlayPauseUI(playing) {
        isVideoPlaying = playing;
        if (playIcon) {
            playIcon.className = playing ? "fas fa-pause text-xs" : "fas fa-play text-xs";
        }
    }

    function updateVolumeUI(volumePercent, isMuted) {
        if (volumeSlider) volumeSlider.value = isMuted ? 0 : volumePercent;
        if (volumeLabel) volumeLabel.textContent = isMuted ? "0%" : `${Math.round(volumePercent)}%`;
        if (volumeIcon) {
            if (isMuted || volumePercent === 0) {
                volumeIcon.className = "fas fa-volume-mute text-xs text-red-400";
            } else if (volumePercent < 50) {
                volumeIcon.className = "fas fa-volume-down text-xs";
            } else {
                volumeIcon.className = "fas fa-volume-up text-xs";
            }
        }
    }

    const ytId = getYoutubeId(video.videoUrl);
    const startQuery = initialSeekTime > 0 ? `&start=${initialSeekTime}` : '';

    // HUD Feedback Indicator helper
    function showPlayerHUD(iconClass, text) {
        const hud = document.getElementById("player-hud");
        const icon = document.getElementById("player-hud-icon");
        const label = document.getElementById("player-hud-text");
        if (!hud || !icon || !label) return;
        icon.className = iconClass;
        label.textContent = text;
        hud.classList.add("show");
        clearTimeout(hud._hideTimeout);
        hud._hideTimeout = setTimeout(() => {
            hud.classList.remove("show");
        }, 800);
    }

    // Engagement & Watch Time Tracking Badge elements
    let thisVideoWatchSeconds = 0;
    let saveProgressCounter = 0;
    const playerThisVideoTimeEl = document.getElementById("player-this-video-time");
    const playerTotalWatchTimeEl = document.getElementById("player-total-watch-time");

    function updateWatchBadgeUI() {
        if (playerThisVideoTimeEl) {
            playerThisVideoTimeEl.textContent = `Watching: ${formatWatchTime(thisVideoWatchSeconds)}`;
        }
        if (playerTotalWatchTimeEl) {
            const stats = getWatchStats();
            playerTotalWatchTimeEl.textContent = `${formatWatchTime(stats.totalSeconds || 0)} total`;
        }
    }
    updateWatchBadgeUI();

    // Universal Seek Helper
    function applySeek(targetSeconds) {
        const safeSeconds = Math.max(0, Math.min(playerDuration || 9999, targetSeconds));
        if (ytPlayer && ytPlayer.seekTo) {
            ytPlayer.seekTo(safeSeconds, true);
        } else if (videoPlayer) {
            videoPlayer.currentTime = safeSeconds;
        }
        playerCurrentTime = safeSeconds;
        if (timeCurrentEl) timeCurrentEl.textContent = formatTime(safeSeconds);
        if (seekSlider && playerDuration > 0) {
            seekSlider.value = (safeSeconds / playerDuration) * 100;
        }
    }

    if (ytId) {
        const container = videoPlayer.parentElement;
        // Instantly mount high-performance eager iframe for instant mobile playback
        container.innerHTML = `
            <div id="iframe-loading" class="absolute inset-0 flex items-center justify-center bg-black/70 z-10 pointer-events-none transition-opacity duration-200">
                <div class="w-9 h-9 border-3 border-zinc-700 border-t-red-600 rounded-full animate-spin"></div>
            </div>
            <!-- On-Screen HUD feedback for keyboard shortcuts & controls -->
            <div id="player-hud" class="player-feedback-hud">
                <i id="player-hud-icon" class="fas fa-play"></i>
                <span id="player-hud-text">Play</span>
            </div>
            <iframe id="yt-player-target" class="w-full h-full border-0 absolute inset-0 z-20"
                src="https://www.youtube-nocookie.com/embed/${ytId}?autoplay=1&enablejsapi=1&playsinline=1&modestbranding=1&rel=0&iv_load_policy=3${startQuery}"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowfullscreen
                loading="eager"
                fetchpriority="high">
            </iframe>
        `;

        function mountYTPlayer() {
            if (ytPlayer) return;
            try {
                ytPlayer = new YT.Player('yt-player-target', {
                    events: {
                        onReady: (event) => {
                            const loading = document.getElementById("iframe-loading");
                            if (loading) {
                                loading.style.opacity = '0';
                                setTimeout(() => loading.remove(), 200);
                            }
                            updatePlayPauseUI(true);
                            playerDuration = ytPlayer.getDuration() || 0;
                            if (timeDurationEl) timeDurationEl.textContent = formatTime(playerDuration);
                            const vol = ytPlayer.getVolume();
                            const muted = ytPlayer.isMuted();
                            updateVolumeUI(vol, muted);
                            if (initialSeekTime > 0) {
                                try { ytPlayer.seekTo(initialSeekTime, true); } catch(e){}
                                showToast(`Resumed from ${formatTime(initialSeekTime)}`, "info");
                            }
                            startControlsSync();
                        },
                        onStateChange: (event) => {
                            if (event.data === YT.PlayerState.PLAYING) {
                                updatePlayPauseUI(true);
                                playerDuration = ytPlayer.getDuration() || playerDuration;
                                if (timeDurationEl) timeDurationEl.textContent = formatTime(playerDuration);
                            } else if (event.data === YT.PlayerState.PAUSED || event.data === YT.PlayerState.ENDED) {
                                updatePlayPauseUI(false);
                                if (playerCurrentTime > 3) {
                                    saveWatchProgress(video, playerCurrentTime, playerDuration);
                                }
                            }
                        }
                    }
                });
            } catch (err) {
                console.warn("YT player hook error:", err);
            }
        }

        if (window.YT && window.YT.Player) {
            mountYTPlayer();
        } else {
            const checkYT = setInterval(() => {
                if (window.YT && window.YT.Player) {
                    clearInterval(checkYT);
                    mountYTPlayer();
                }
            }, 100);
            setTimeout(() => clearInterval(checkYT), 10000);
        }
    } else {
        videoPlayer.src = video.videoUrl;
        videoPlayer.addEventListener("loadedmetadata", () => {
            playerDuration = videoPlayer.duration || 0;
            if (timeDurationEl) timeDurationEl.textContent = formatTime(playerDuration);
            updateVolumeUI(videoPlayer.volume * 100, videoPlayer.muted);
            if (initialSeekTime > 0) {
                videoPlayer.currentTime = initialSeekTime;
                showToast(`Resumed from ${formatTime(initialSeekTime)}`, "info");
            }
        });
        videoPlayer.addEventListener("play", () => updatePlayPauseUI(true));
        videoPlayer.addEventListener("pause", () => {
            updatePlayPauseUI(false);
            if (playerCurrentTime > 3) {
                saveWatchProgress(video, playerCurrentTime, playerDuration);
            }
        });
        videoPlayer.addEventListener("ended", () => {
            updatePlayPauseUI(false);
            removeContinueWatching(video.id);
        });
        videoPlayer.addEventListener("timeupdate", () => {
            if (!isUserScrubbing && videoPlayer.duration) {
                playerCurrentTime = videoPlayer.currentTime;
                if (timeCurrentEl) timeCurrentEl.textContent = formatTime(playerCurrentTime);
                if (seekSlider) seekSlider.value = (playerCurrentTime / videoPlayer.duration) * 100;
            }
        });
    }

    function startControlsSync() {
        if (controlsInterval) clearInterval(controlsInterval);
        controlsInterval = setInterval(() => {
            if (ytPlayer && ytPlayer.getCurrentTime && !isUserScrubbing) {
                try {
                    playerCurrentTime = ytPlayer.getCurrentTime() || 0;
                    playerDuration = ytPlayer.getDuration() || playerDuration;
                    if (timeCurrentEl) timeCurrentEl.textContent = formatTime(playerCurrentTime);
                    if (timeDurationEl && playerDuration > 0) timeDurationEl.textContent = formatTime(playerDuration);
                    if (seekSlider && playerDuration > 0) {
                        seekSlider.value = (playerCurrentTime / playerDuration) * 100;
                    }
                } catch (e) {}
            }
        }, 350);
    }

    // Engagement & Watch Time Tracking interval (1s cadence during playback)
    setInterval(() => {
        let isPlaying = false;
        if (ytPlayer && ytPlayer.getPlayerState) {
            isPlaying = (ytPlayer.getPlayerState() === YT.PlayerState.PLAYING);
        } else if (videoPlayer) {
            isPlaying = (!videoPlayer.paused && !videoPlayer.ended && videoPlayer.readyState > 2);
        }

        if (isPlaying) {
            thisVideoWatchSeconds += 1;
            recordWatchTime(1, video.id, video.title, video.channel);
            updateWatchBadgeUI();

            saveProgressCounter += 1;
            // Persist progress to Firestore/localStorage every 3 seconds
            if (saveProgressCounter % 3 === 0 && playerCurrentTime > 3) {
                saveWatchProgress(video, playerCurrentTime, playerDuration);
            }
        }
    }, 1000);

    // Save progress on page exit
    window.addEventListener("beforeunload", () => {
        if (playerCurrentTime > 3) {
            saveWatchProgress(video, playerCurrentTime, playerDuration);
        }
    });

    // Control Handlers
    function togglePlayPause() {
        if (ytPlayer && ytPlayer.getPlayerState) {
            const state = ytPlayer.getPlayerState();
            if (state === YT.PlayerState.PLAYING) {
                ytPlayer.pauseVideo();
                updatePlayPauseUI(false);
                showPlayerHUD("fas fa-pause", "Paused");
            } else {
                ytPlayer.playVideo();
                updatePlayPauseUI(true);
                showPlayerHUD("fas fa-play", "Playing");
            }
        } else if (videoPlayer) {
            if (videoPlayer.paused) {
                videoPlayer.play();
                updatePlayPauseUI(true);
                showPlayerHUD("fas fa-play", "Playing");
            } else {
                videoPlayer.pause();
                updatePlayPauseUI(false);
                showPlayerHUD("fas fa-pause", "Paused");
            }
        }
    }

    function seekDelta(seconds) {
        const dur = playerDuration || 9999;
        const target = Math.max(0, Math.min(dur, playerCurrentTime + seconds));
        applySeek(target);
        const icon = seconds > 0 ? "fas fa-forward" : "fas fa-backward";
        showPlayerHUD(icon, `${seconds > 0 ? '+' : ''}${seconds}s (${formatTime(target)})`);
    }

    function changeVolumeDelta(delta) {
        let currentVol = 100;
        if (volumeSlider) currentVol = parseFloat(volumeSlider.value);
        const newVol = Math.max(0, Math.min(100, Math.round(currentVol + delta)));
        
        if (volumeSlider) volumeSlider.value = newVol;
        if (ytPlayer && ytPlayer.setVolume) {
            if (newVol === 0) ytPlayer.mute();
            else {
                ytPlayer.unMute();
                ytPlayer.setVolume(newVol);
            }
        } else if (videoPlayer) {
            videoPlayer.volume = newVol / 100;
            videoPlayer.muted = (newVol === 0);
        }
        updateVolumeUI(newVol, newVol === 0);
        showPlayerHUD(newVol === 0 ? "fas fa-volume-mute" : "fas fa-volume-up", `${newVol}%`);
    }

    function toggleMute() {
        if (ytPlayer && ytPlayer.isMuted) {
            if (ytPlayer.isMuted()) {
                ytPlayer.unMute();
                const vol = ytPlayer.getVolume() || 80;
                updateVolumeUI(vol, false);
                showPlayerHUD("fas fa-volume-up", `${vol}%`);
            } else {
                ytPlayer.mute();
                updateVolumeUI(0, true);
                showPlayerHUD("fas fa-volume-mute", "Muted");
            }
        } else if (videoPlayer) {
            videoPlayer.muted = !videoPlayer.muted;
            updateVolumeUI(videoPlayer.volume * 100, videoPlayer.muted);
            showPlayerHUD(videoPlayer.muted ? "fas fa-volume-mute" : "fas fa-volume-up", videoPlayer.muted ? "Muted" : "Unmuted");
        }
    }

    function toggleFullscreen() {
        if (!document.fullscreenElement) {
            if (videoContainer) {
                videoContainer.requestFullscreen().catch(() => {});
            }
            showPlayerHUD("fas fa-expand", "Fullscreen");
        } else {
            document.exitFullscreen().catch(() => {});
            showPlayerHUD("fas fa-compress", "Exit Fullscreen");
        }
    }

    // Play/Pause Button
    if (playPauseBtn) {
        playPauseBtn.addEventListener("click", togglePlayPause);
    }

    // Rewind -10s
    if (rewind10Btn) {
        rewind10Btn.addEventListener("click", () => seekDelta(-10));
    }

    // Forward +10s
    if (forward10Btn) {
        forward10Btn.addEventListener("click", () => seekDelta(10));
    }

    // Seek / Scrubbing Bar
    if (seekSlider) {
        seekSlider.addEventListener("pointerdown", () => { isUserScrubbing = true; });
        seekSlider.addEventListener("input", (e) => {
            isUserScrubbing = true;
            const pct = parseFloat(e.target.value);
            const targetTime = (pct / 100) * (playerDuration || 0);
            if (timeCurrentEl) timeCurrentEl.textContent = formatTime(targetTime);
        });
        seekSlider.addEventListener("change", (e) => {
            const pct = parseFloat(e.target.value);
            const targetTime = (pct / 100) * (playerDuration || 0);
            applySeek(targetTime);
            isUserScrubbing = false;
        });
        seekSlider.addEventListener("click", (e) => {
            const rect = seekSlider.getBoundingClientRect();
            if (rect.width > 0) {
                const clickPos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                seekSlider.value = clickPos * 100;
                const targetTime = clickPos * (playerDuration || 0);
                applySeek(targetTime);
                isUserScrubbing = false;
            }
        });
    }

    // Volume Slider & Mute Toggle
    if (volumeSlider) {
        volumeSlider.addEventListener("input", (e) => {
            const val = parseFloat(e.target.value);
            if (ytPlayer && ytPlayer.setVolume) {
                if (val === 0) {
                    ytPlayer.mute();
                } else {
                    ytPlayer.unMute();
                    ytPlayer.setVolume(val);
                }
            } else if (videoPlayer) {
                videoPlayer.volume = val / 100;
                videoPlayer.muted = (val === 0);
            }
            updateVolumeUI(val, val === 0);
        });
    }

    if (volumeBtn) {
        volumeBtn.addEventListener("click", toggleMute);
    }

    // Fullscreen Action
    if (fullscreenBtn) {
        fullscreenBtn.addEventListener("click", toggleFullscreen);
    }

    // Keyboard Shortcuts Guide Modal
    const ctrlShortcutsBtn = document.getElementById("ctrl-shortcuts-btn");
    const shortcutsModal = document.getElementById("shortcuts-modal");
    const closeShortcutsModal = document.getElementById("close-shortcuts-modal");

    if (ctrlShortcutsBtn && shortcutsModal) {
        ctrlShortcutsBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            shortcutsModal.classList.toggle("hidden");
        });
    }
    if (closeShortcutsModal && shortcutsModal) {
        closeShortcutsModal.addEventListener("click", () => {
            shortcutsModal.classList.add("hidden");
        });
        shortcutsModal.addEventListener("click", (e) => {
            if (e.target === shortcutsModal) shortcutsModal.classList.add("hidden");
        });
    }

    // Comprehensive Keyboard Shortcuts Listener
    window.addEventListener("keydown", (e) => {
        const active = document.activeElement;
        // Ignore if user is currently typing inside an input/textarea or editor
        if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) {
            return;
        }

        const key = e.key;
        const code = e.code;

        // Space or 'k' / 'K': Play / Pause
        if (code === "Space" || key === "k" || key === "K") {
            e.preventDefault();
            togglePlayPause();
        }
        // 'f' or 'F': Fullscreen
        else if (key === "f" || key === "F") {
            e.preventDefault();
            toggleFullscreen();
        }
        // 'm' or 'M': Mute / Unmute
        else if (key === "m" || key === "M") {
            e.preventDefault();
            toggleMute();
        }
        // ArrowLeft: Seek -5s
        else if (code === "ArrowLeft") {
            e.preventDefault();
            seekDelta(-5);
        }
        // ArrowRight: Seek +5s
        else if (code === "ArrowRight") {
            e.preventDefault();
            seekDelta(5);
        }
        // 'j' or 'J': Seek -10s
        else if (key === "j" || key === "J") {
            e.preventDefault();
            seekDelta(-10);
        }
        // 'l' or 'L': Seek +10s
        else if (key === "l" || key === "L") {
            e.preventDefault();
            seekDelta(10);
        }
        // ArrowUp: Volume +10%
        else if (code === "ArrowUp") {
            e.preventDefault();
            changeVolumeDelta(10);
        }
        // ArrowDown: Volume -10%
        else if (code === "ArrowDown") {
            e.preventDefault();
            changeVolumeDelta(-10);
        }
        // Digits 0 through 9: Jump to percentage (e.g., 0 = start, 5 = 50%)
        else if ((key >= '0' && key <= '9') && (code.startsWith("Digit") || code.startsWith("Numpad"))) {
            const digit = parseInt(key, 10);
            if (!isNaN(digit) && playerDuration > 0) {
                e.preventDefault();
                const targetSec = (digit / 10) * playerDuration;
                applySeek(targetSec);
                showPlayerHUD("fas fa-forward", `${digit * 10}% (${formatTime(targetSec)})`);
            }
        }
        // '?': Toggle shortcuts modal
        else if (key === "?" && shortcutsModal) {
            e.preventDefault();
            shortcutsModal.classList.toggle("hidden");
        }
    });

    // Resolution Menu (রেজুলেশন)
    if (resolutionBtn && resolutionMenu) {
        resolutionBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            resolutionMenu.classList.toggle("hidden");
            if (speedMenu) speedMenu.classList.add("hidden");
        });

        document.querySelectorAll(".res-opt").forEach(btn => {
            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                const res = btn.getAttribute("data-res");
                if (resolutionLabel) {
                    resolutionLabel.textContent = res === "auto" ? "Auto" : `${res} HD`;
                }
                // Try setPlaybackQuality on YouTube player
                if (ytPlayer && ytPlayer.setPlaybackQuality) {
                    try {
                        const qualityMap = {
                            "1080p": "hd1080",
                            "720p": "hd720",
                            "480p": "large",
                            "360p": "medium",
                            "auto": "default"
                        };
                        ytPlayer.setPlaybackQuality(qualityMap[res] || "default");
                    } catch (e) {}
                }
                showToast(`Video resolution set to ${res.toUpperCase()}`, "success");
                resolutionMenu.classList.add("hidden");
            });
        });
    }

    // Playback Speed Menu
    if (speedBtn && speedMenu) {
        speedBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            speedMenu.classList.toggle("hidden");
            if (resolutionMenu) resolutionMenu.classList.add("hidden");
        });

        document.querySelectorAll(".speed-opt").forEach(btn => {
            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                const speed = parseFloat(btn.getAttribute("data-speed"));
                if (speedLabel) speedLabel.textContent = `${speed}x`;
                if (ytPlayer && ytPlayer.setPlaybackRate) {
                    try { ytPlayer.setPlaybackRate(speed); } catch (e) {}
                } else if (videoPlayer) {
                    videoPlayer.playbackRate = speed;
                }
                showToast(`Playback speed set to ${speed}x`, "info");
                speedMenu.classList.add("hidden");
            });
        });
    }

    // Close menus on outside click
    document.addEventListener("click", () => {
        if (resolutionMenu) resolutionMenu.classList.add("hidden");
        if (speedMenu) speedMenu.classList.add("hidden");
    });

    videoTitle.textContent = video.title;

    // Populate Curated Quality Indicators
    const videoQualityPill = document.getElementById("video-quality-pill");
    const videoCategoryTag = document.getElementById("video-category-tag");
    if (videoQualityPill) {
        const badge = video.qualityBadge || (video.duration && video.duration.length > 5 ? "✦ Curated Masterclass" : "✦ Verified HD");
        videoQualityPill.innerHTML = `<i class="fas fa-check-circle text-[10px]"></i> ${badge} &bull; Verified Quality`;
    }
    if (videoCategoryTag) {
        videoCategoryTag.textContent = video.category || "STEM & Tech";
    }

    const currentChannelData = channels[video.channel];
    if (currentChannelData && currentChannelData.avatarUrl) {
        channelAvatar.innerHTML = `<img src="${currentChannelData.avatarUrl}" class="w-full h-full object-cover rounded-full" alt="${video.channel}">`;
    } else {
        channelAvatar.textContent = video.channel[0];
    }
    channelName.textContent = video.channel;
    const initialLikes = typeof getEffectiveLikes === 'function' ? getEffectiveLikes(video) : (video.likes || 0);
    videoMeta.innerHTML = `<span class="font-bold text-white">${formatCompactNumber(video.views || 0)} views</span> • <span>Uploaded ${timeAgo(video.timestamp)}</span> • <span class="inline-flex items-center gap-1 text-zinc-300 font-medium"><i class="far fa-thumbs-up text-red-400"></i> ${formatCompactNumber(initialLikes)} likes</span>`;

    // Update OG meta tags dynamically
    const ogTitle = document.getElementById("og-title");
    if (ogTitle) ogTitle.setAttribute("content", video.title);
    const ogDesc = document.getElementById("og-desc");
    if (ogDesc) ogDesc.setAttribute("content", video.description ? video.description.substring(0, 150) : "Watch this video on JTube");
    const ogImage = document.getElementById("og-image");
    if (ogImage) ogImage.setAttribute("content", video.thumbnail);
    const ogUrl = document.getElementById("og-url");
    if (ogUrl) ogUrl.setAttribute("content", window.location.href);
    document.title = `${video.title} - JTube`;
    
    function renderDescription() {
        const descText = video.description || "";
        const lines = descText.split('\n');
        if (lines.length > 3 || descText.length > 200) {
            let shortText = lines.slice(0, 3).join('\n');
            if (shortText.length > 200) shortText = shortText.substring(0, 200) + '...';
            else if (lines.length > 3) shortText += '...';
            
            videoDesc.innerHTML = parseLinks(shortText) + '<br><button id="read-more-btn" class="text-zinc-400 hover:text-white font-bold mt-2">Read More</button>';
            document.getElementById("read-more-btn").addEventListener("click", () => {
                videoDesc.innerHTML = parseLinks(descText) + '<br><button id="read-less-btn" class="text-zinc-400 hover:text-white font-bold mt-2">Show Less</button>';
                document.getElementById("read-less-btn").addEventListener("click", renderDescription);
            });
        } else {
            videoDesc.innerHTML = parseLinks(descText);
        }
    }
    renderDescription();

    function updateInteractionsUI() {
        const currentChannel = channels[video.channel];
        const userIdent = typeof getSiteUserIdentifier === 'function' ? getSiteUserIdentifier() : (currentUser ? currentUser.email : null);
        const isSubscribed = currentChannel && currentChannel.subscribedBy && userIdent && currentChannel.subscribedBy.includes(userIdent);
        
        if (isSubscribed) {
            subscribeBtn.textContent = "Subscribed";
            subscribeBtn.className = "ml-4 bg-zinc-800 text-zinc-400 px-4 py-2 rounded-full font-semibold text-xs md:text-sm transition hover:bg-zinc-700";
        } else {
            subscribeBtn.textContent = "Subscribe";
            subscribeBtn.className = "ml-4 bg-white text-black px-4 py-2 rounded-full font-semibold text-xs md:text-sm transition hover:bg-zinc-200";
        }
        
        // Calculate subscribers safely
        const subCount = typeof getEffectiveSubscribers === 'function' ? getEffectiveSubscribers(currentChannel) : (currentChannel ? (currentChannel.subscribers || 0) : 0);
        channelSubs.textContent = `${formatCompactNumber(subCount)} subscribers`;

        const likeCountNum = typeof getEffectiveLikes === 'function' ? getEffectiveLikes(video) : (video.likes || 0);
        likeCount.textContent = formatCompactNumber(likeCountNum);
        
        videoMeta.innerHTML = `<span class="font-bold text-white">${formatCompactNumber(video.views || 0)} views</span> • <span>Uploaded ${timeAgo(video.timestamp)}</span> • <span class="inline-flex items-center gap-1 text-zinc-300 font-medium"><i class="far fa-thumbs-up text-red-400"></i> ${formatCompactNumber(likeCountNum)} likes</span>`;
        
        const isLiked = video.likedBy && userIdent && video.likedBy.includes(userIdent);
        const icon = likeBtn.querySelector("i");
        if (isLiked) {
            icon.className = "fas fa-thumbs-up text-red-500";
        } else {
            icon.className = "far fa-thumbs-up";
        }

        const isSaved = video.savedBy && currentUser && video.savedBy.includes(currentUser.email);
        const saveIcon = saveBtn.querySelector("i");
        if (isSaved) {
            saveIcon.className = "fas fa-bookmark text-blue-500";
            saveBtn.querySelector("span").textContent = "Saved";
        } else {
            saveIcon.className = "far fa-bookmark";
            saveBtn.querySelector("span").textContent = "Save";
        }

        commentCount.textContent = video.comments ? video.comments.length : 0;
        renderComments();
    }

    function renderComments() {
        commentsList.innerHTML = "";
        if (!video.comments) video.comments = [];
        
        // Auto-clean any abusive comments that violate community standards
        if (typeof AIModeration !== 'undefined') {
            const initialCount = video.comments.length;
            video.comments = video.comments.filter(c => !AIModeration.isAbusive(c.text));
            if (video.comments.length !== initialCount) {
                saveVideo(video);
            }
        }

        video.comments.forEach((comment, idx) => {
            const avatarLetter = comment.username ? comment.username[0].toUpperCase() : 'U';
            const profileLink = `profile.html?user=${encodeURIComponent(comment.email || comment.username)}`;
            const repliesHtml = (comment.replies && comment.replies.length > 0)
                ? comment.replies.map(r => `
                    <div class="flex gap-2 items-start text-sm mt-3 ml-1">
                        <a href="${`profile.html?user=${encodeURIComponent(r.email || r.username)}`}" onclick="event.stopPropagation()" class="bg-gradient-to-br from-blue-600 to-purple-700 w-7 h-7 rounded-full flex items-center justify-center font-bold text-[11px] flex-shrink-0 cursor-pointer hover:opacity-80 transition" title="View profile">${r.username ? r.username[0].toUpperCase() : 'U'}</a>
                        <div class="bg-zinc-800/60 rounded-xl px-3 py-2 flex-1">
                            <p class="font-semibold text-zinc-300 text-xs">${r.username}</p>
                            <p class="text-zinc-100 mt-0.5 text-sm">${r.text}</p>
                        </div>
                    </div>`).join('')
                : '';

            const commentEl = document.createElement('div');
            commentEl.className = 'comment-item';
            commentEl.dataset.idx = idx;
            commentEl.innerHTML = `
                <div class="flex gap-3 items-start text-sm">
                    <a href="${profileLink}" onclick="event.stopPropagation()" class="bg-gradient-to-br from-purple-600 to-red-600 w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs flex-shrink-0 cursor-pointer hover:opacity-80 transition" title="View ${comment.username}'s profile">${avatarLetter}</a>
                    <div class="flex-1">
                        <div class="bg-zinc-800/50 rounded-xl px-3 py-2">
                            <a href="${profileLink}" class="font-semibold text-zinc-200 text-xs hover:text-white transition cursor-pointer">${comment.username}</a>
                            <p class="text-zinc-100 mt-0.5">${comment.text}</p>
                        </div>
                        <div class="flex items-center gap-4 mt-1.5 px-1">
                            <span class="text-[11px] text-zinc-500">${comment.time || 'Just now'}</span>
                            <button class="reply-btn text-[11px] text-zinc-400 hover:text-red-400 font-semibold transition flex items-center gap-1" data-idx="${idx}">
                                <i class="fas fa-reply text-[9px]"></i> Reply
                            </button>
                        </div>
                        <!-- Reply input (hidden by default) -->
                        <div class="reply-form hidden mt-3 flex gap-2 items-start">
                            <div class="bg-purple-600 w-7 h-7 rounded-full flex items-center justify-center font-bold text-[11px] flex-shrink-0 text-white">${currentUser ? (currentUser.displayName || 'U')[0].toUpperCase() : 'U'}</div>
                            <div class="flex-1">
                                <input type="text" placeholder="Add a reply..." class="reply-input w-full bg-transparent border-b border-zinc-600 focus:border-white focus:outline-none py-1 text-xs text-white">
                                <div class="flex justify-end space-x-2 mt-1.5">
                                    <button type="button" class="cancel-reply-btn px-3 py-1 rounded-full text-[11px] font-semibold hover:bg-zinc-800 transition">Cancel</button>
                                    <button type="button" class="submit-reply-btn bg-blue-600 px-3 py-1 rounded-full text-[11px] font-semibold hover:bg-blue-500 transition" data-idx="${idx}">Reply</button>
                                </div>
                            </div>
                        </div>
                        <!-- Replies -->
                        <div class="replies-container mt-1">${repliesHtml}</div>
                    </div>
                </div>
            `;
            commentsList.appendChild(commentEl);
        });

        // Attach reply button events
        commentsList.querySelectorAll('.reply-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                if (!currentUser) return openAuthModal();
                const form = btn.closest('.comment-item').querySelector('.reply-form');
                form.classList.toggle('hidden');
                if (!form.classList.contains('hidden')) form.querySelector('.reply-input').focus();
            });
        });
        commentsList.querySelectorAll('.cancel-reply-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                btn.closest('.reply-form').classList.add('hidden');
            });
        });
        commentsList.querySelectorAll('.submit-reply-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (!currentUser) return openAuthModal();
                const idx = parseInt(btn.dataset.idx);
                const input = btn.closest('.reply-form').querySelector('.reply-input');
                const text = input.value.trim();
                if (!text) return;

                // AI Shield Auto-Moderation Check
                if (typeof AIModeration !== 'undefined' && AIModeration.isAbusive(text)) {
                    input.value = '';
                    showToast("⚠️ Reply deleted by AI Shield: Abusive language is strictly prohibited.", "error");
                    return;
                }

                if (!video.comments[idx].replies) video.comments[idx].replies = [];
                video.comments[idx].replies.push({
                    username: currentUser.displayName || 'User',
                    email: currentUser.email,
                    text: text,
                    time: 'Just now'
                });
                input.value = '';
                await saveVideo(video);
                renderComments();
                commentCount.textContent = video.comments.length;
            });
        });
    }

    async function renderRecommendations() {
        recommendationsContainer.innerHTML = `
            <div class="flex items-center justify-between mb-3 pb-2 border-b border-white/[0.08]">
                <h3 class="text-xs font-bold text-zinc-300 tracking-wider uppercase flex items-center gap-1.5">
                    <i class="fas fa-sparkles text-amber-400 text-[10px]"></i> Curated Next
                </h3>
                <span class="text-[10px] text-zinc-500 font-medium">Auto-filter ON</span>
            </div>
        `;
        const videos = await getVideos();
        let recs = videos.filter(v => v.id !== video.id);
        // Shuffle for variety
        for (let i = recs.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [recs[i], recs[j]] = [recs[j], recs[i]];
        }
        recs = recs.slice(0, 15);
        const fragment = document.createDocumentFragment();
        recs.forEach(v => {
            const el = document.createElement('div');
            el.className = 'flex space-x-3 cursor-pointer group p-2 rounded-xl hover:bg-white/[0.04] transition border border-transparent hover:border-white/[0.06]';
            el.onclick = () => location.href = `watch.html?id=${v.id}`;
            const badgeLabel = v.qualityBadge || (v.duration && v.duration.length > 5 ? "✦ Masterclass" : "✦ Verified HD");
            el.innerHTML = `
                <div class="relative w-36 sm:w-40 aspect-video bg-[#181c26] rounded-xl overflow-hidden flex-shrink-0 border border-white/[0.06]">
                    <img src="${v.thumbnail}" loading="lazy" class="w-full h-full object-cover group-hover:scale-105 transition duration-300" alt="${v.title.replace(/"/g, '&quot;')}">
                    <span class="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-black/80 backdrop-blur-sm text-zinc-200 border border-white/10">${v.duration || 'HD'}</span>
                </div>
                <div class="flex-1 min-w-0">
                    <span class="inline-flex items-center gap-1 text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 mb-1">
                        ${badgeLabel}
                    </span>
                    <h4 class="text-xs font-semibold line-clamp-2 text-zinc-100 leading-snug group-hover:text-white">${v.title}</h4>
                    <div class="flex items-center space-x-1 mt-1">
                        <p class="text-[11px] text-zinc-400 truncate">${v.channel}</p>
                        <img src="img/icons.svg" class="w-3 h-3 flex-shrink-0" alt="Verified" title="Verified Creator">
                    </div>
                    <p class="text-[10px] text-zinc-500 mt-0.5">${formatCompactNumber(v.views)} views • ${timeAgo(v.timestamp)}</p>
                </div>
            `;
            fragment.appendChild(el);
        });
        recommendationsContainer.appendChild(fragment);
    }

    likeBtn.addEventListener("click", async () => {
        const updated = await likeVideo(video.id);
        if (updated) {
            Object.assign(video, updated);
            updateInteractionsUI();
            showToast(video.liked ? "Video liked!" : "Like removed", "info");
        }
    });

    saveBtn.addEventListener("click", async () => {
        if (!currentUser) return openAuthModal();
        if (!video.savedBy) video.savedBy = [];
        
        const index = video.savedBy.indexOf(currentUser.email);
        if (index > -1) {
            video.savedBy.splice(index, 1);
        } else {
            video.savedBy.push(currentUser.email);
        }
        await saveVideo(video);
        updateInteractionsUI();
    });

    if (shareBtn) {
        shareBtn.addEventListener("click", async () => {
            const shareData = {
                title: video.title,
                text: video.description ? video.description.substring(0, 100) : "Watch this video on JTube",
                url: window.location.href
            };
            try {
                if (navigator.share) {
                    await navigator.share(shareData);
                } else {
                    navigator.clipboard.writeText(window.location.href);
                    showToast("Link copied to clipboard!", "success");
                }
            } catch (err) {
                console.log("Error sharing:", err);
            }
        });
    }

    // ===== JAsk AI Panel Logic =====
    const jaskBtn = document.getElementById("jask-btn");
    const jaskPanel = document.getElementById("jask-panel");
    const jaskClose = document.getElementById("jask-close");
    const jaskInput = document.getElementById("jask-input");
    const jaskSend = document.getElementById("jask-send");
    const jaskMessages = document.getElementById("jask-messages");
    const jaskSuggestions = document.getElementById("jask-suggestions");
    const jaskWelcome = document.getElementById("jask-welcome");

    // Initialize suggested questions
    function initJAskSuggestions() {
        if (!jaskSuggestions) return;
        const questions = JAsk.getSuggestedQuestions(video);
        jaskSuggestions.innerHTML = '';
        questions.forEach(q => {
            const btn = document.createElement('button');
            btn.className = 'text-xs px-3 py-1.5 rounded-full border border-violet-500/30 text-violet-300 hover:bg-violet-500/20 hover:border-violet-400/50 transition-all duration-200 text-left';
            btn.textContent = q;
            btn.addEventListener('click', () => sendJAskMessage(q));
            jaskSuggestions.appendChild(btn);
        });
    }

    // Format AI response text (markdown-like to HTML)
    function formatAIResponse(text) {
        let html = text;
        // Convert JTube video links: [Title](watch.html?id=xxx) -> clickable cards
        html = html.replace(/\[([^\]]+)\]\(watch\.html\?id=([^)]+)\)/g, (match, title, id) => {
            const linkedVideo = allJAskVideos.find(v => v.id === id);
            if (linkedVideo) {
                return `<a href="watch.html?id=${id}" class="jask-video-card flex items-center gap-2 p-2 my-1 bg-zinc-800/80 hover:bg-zinc-700/80 rounded-xl border border-zinc-700/50 hover:border-violet-500/30 transition-all group/link no-underline block">
                    <img src="${linkedVideo.thumbnail}" class="w-16 h-10 rounded-lg object-cover flex-shrink-0">
                    <div class="flex-1 min-w-0">
                        <p class="text-xs font-semibold text-zinc-100 line-clamp-1 group-hover/link:text-violet-300 transition">${title}</p>
                        <p class="text-[10px] text-zinc-500">${linkedVideo.channel} • ${formatCompactNumber(linkedVideo.views)} views</p>
                    </div>
                    <i class="fas fa-play text-[10px] text-violet-400 opacity-0 group-hover/link:opacity-100 transition"></i>
                </a>`;
            }
            return `<a href="watch.html?id=${id}" class="text-violet-400 hover:text-violet-300 underline">${title}</a>`;
        });
        // Bold text
        html = html.replace(/\*\*([^*]+)\*\*/g, '<strong class="text-zinc-100">$1</strong>');
        // Italic
        html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
        // Bullet points
        html = html.replace(/^[\-•]\s+(.+)/gm, '<span class="flex items-start gap-1.5 mb-0.5"><span class="text-violet-400 mt-0.5">•</span><span>$1</span></span>');
        // Line breaks
        html = html.replace(/\n/g, '<br>');
        // Emojis are already supported
        return html;
    }

    let allJAskVideos = [];
    // Preload videos for link matching
    async function preloadJAskVideos() {
        try {
            allJAskVideos = await getVideos();
        } catch (e) {
            allJAskVideos = [];
        }
    }
    preloadJAskVideos();

    // Add a message bubble to the chat
    function addJAskMessage(content, isUser = false) {
        if (jaskWelcome && !jaskWelcome.classList.contains('hidden')) {
            jaskWelcome.classList.add('hidden');
        }
        const msg = document.createElement('div');
        msg.className = isUser
            ? 'flex justify-end'
            : 'flex items-start gap-2';

        if (isUser) {
            msg.innerHTML = `
                <div class="bg-violet-600/30 border border-violet-500/20 text-sm text-zinc-100 px-3 py-2 rounded-2xl rounded-br-md max-w-[85%] leading-relaxed">
                    ${content}
                </div>`;
        } else {
            msg.innerHTML = `
                <div class="w-6 h-6 bg-gradient-to-br from-violet-500 to-blue-500 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <i class="fas fa-robot text-white text-[9px]"></i>
                </div>
                <div class="bg-zinc-800/60 border border-zinc-700/40 text-sm text-zinc-300 px-3 py-2 rounded-2xl rounded-bl-md max-w-[85%] leading-relaxed jask-ai-response">
                    ${content}
                </div>`;
        }
        jaskMessages.appendChild(msg);
        jaskMessages.scrollTop = jaskMessages.scrollHeight;
    }

    // Show typing indicator
    function showTypingIndicator() {
        const typing = document.createElement('div');
        typing.id = 'jask-typing';
        typing.className = 'flex items-start gap-2';
        typing.innerHTML = `
            <div class="w-6 h-6 bg-gradient-to-br from-violet-500 to-blue-500 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                <i class="fas fa-robot text-white text-[9px]"></i>
            </div>
            <div class="bg-zinc-800/60 border border-zinc-700/40 px-4 py-3 rounded-2xl rounded-bl-md">
                <div class="flex items-center gap-1">
                    <div class="jask-typing-dot w-2 h-2 bg-violet-400 rounded-full"></div>
                    <div class="jask-typing-dot w-2 h-2 bg-violet-400 rounded-full" style="animation-delay: 0.15s"></div>
                    <div class="jask-typing-dot w-2 h-2 bg-violet-400 rounded-full" style="animation-delay: 0.3s"></div>
                </div>
            </div>`;
        jaskMessages.appendChild(typing);
        jaskMessages.scrollTop = jaskMessages.scrollHeight;
    }

    function removeTypingIndicator() {
        const typing = document.getElementById('jask-typing');
        if (typing) typing.remove();
    }

    // Send message to AI
    async function sendJAskMessage(text) {
        if (!text || !text.trim()) return;
        const userMsg = text.trim();
        jaskInput.value = '';

        // Show user message
        addJAskMessage(userMsg, true);

        // Show typing...
        showTypingIndicator();

        try {
            const result = await JAsk.askGroq(userMsg, video);
            removeTypingIndicator();
            addJAskMessage(formatAIResponse(result.text));
        } catch (err) {
            removeTypingIndicator();
            addJAskMessage('⚠️ Something went wrong. Please try again.');
            console.error('JAsk error:', err);
        }
    }

    // Event listeners
    if (jaskBtn) {
        jaskBtn.addEventListener('click', () => {
            jaskPanel.classList.toggle('hidden');
            if (!jaskPanel.classList.contains('hidden')) {
                initJAskSuggestions();
                jaskInput.focus();
            }
        });
    }
    const searchInput = document.getElementById("search-input");
    const mobileSearchInput = document.getElementById("mobile-search-input");
    
    if (searchInput) {
        searchInput.addEventListener("keypress", (e) => {
            if (e.key === "Enter" && searchInput.value.trim()) {
                location.href = `index.html?q=${encodeURIComponent(searchInput.value.trim())}`;
            }
        });
    }

    if (mobileSearchInput) {
        mobileSearchInput.addEventListener("keypress", (e) => {
            if (e.key === "Enter" && mobileSearchInput.value.trim()) {
                location.href = `index.html?q=${encodeURIComponent(mobileSearchInput.value.trim())}`;
            }
        });
    }

    // ===== KEYBOARD SHORTCUTS =====
    document.addEventListener('keydown', (e) => {
        if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
        
        const iframe = document.querySelector('#video-player-container iframe');
        
        // F for fullscreen
        if (e.key.toLowerCase() === 'f') {
            e.preventDefault();
            const container = document.getElementById('video-player-container');
            if (!document.fullscreenElement) {
                if (container.requestFullscreen) container.requestFullscreen();
            } else {
                if (document.exitFullscreen) document.exitFullscreen();
            }
        }
        
        // Space, K, M, J, L - focus iframe so YouTube handles it
        if ([' ', 'k', 'm', 'j', 'l'].includes(e.key.toLowerCase())) {
            if (iframe && document.activeElement !== iframe) {
                e.preventDefault();
                iframe.focus();
                
                // For play/pause via Space/K when not focused, we can try to send postMessage
                if (e.key === ' ' || e.key.toLowerCase() === 'k') {
                    // Send toggle play/pause via YouTube API
                    iframe.contentWindow.postMessage(JSON.stringify({
                        event: 'command',
                        func: 'playVideo' // Wait, we don't know state. We'll just rely on user pressing again if it doesn't do what they expect. 
                    }), '*');
                    
                    showToast("Video player focused. Press again to play/pause.", "info", 2000);
                }
            }
        }
    });
    if (jaskClose) {
        jaskClose.addEventListener('click', () => {
            jaskPanel.classList.add('hidden');
        });
    }
    if (jaskSend) {
        jaskSend.addEventListener('click', () => sendJAskMessage(jaskInput.value));
    }
    if (jaskInput) {
        jaskInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') sendJAskMessage(jaskInput.value);
        });
    }

    subscribeBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const updatedChannel = await toggleSubscription(video.channel);
        if (updatedChannel) {
            channels[video.channel] = updatedChannel;
            updateInteractionsUI();
        }
    });

    commentForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        if (!currentUser) return openAuthModal();
        const text = commentInput.value.trim();
        if (!text) return;

        // AI Shield Auto-Moderation Check (rejects and deletes abusive comments)
        if (typeof AIModeration !== 'undefined' && AIModeration.isAbusive(text)) {
            commentInput.value = "";
            showToast("⚠️ Comment deleted by AI Shield: Abusive or offensive language is strictly prohibited.", "error");
            return;
        }

        if (!video.comments) video.comments = [];
        video.comments.unshift({
            username: currentUser.displayName || "User",
            email: currentUser.email,
            text: text,
            time: 'Just now',
            replies: []
        });

        commentInput.value = "";
        await saveVideo(video);
        commentCount.textContent = video.comments.length;
        renderComments();
        showToast("Comment posted!", "success");
    });

    // ===== WHAT KIND OF VIDEO IS THIS? (AI BRAIN DIAGNOSIS) =====
    const btnVideoTypeAi = document.getElementById("btn-video-type-ai");
    const videoTypeModal = document.getElementById("video-type-modal");
    const closeVideoTypeModal = document.getElementById("close-video-type-modal");
    const videoTypeContent = document.getElementById("video-type-content");
    const askJaskMoreBtn = document.getElementById("ask-jask-more-btn");

    if (btnVideoTypeAi && videoTypeModal) {
        btnVideoTypeAi.addEventListener("click", async () => {
            videoTypeModal.classList.remove("hidden");
            videoTypeContent.innerHTML = `
                <div class="flex flex-col items-center justify-center py-10 text-center">
                    <div class="w-10 h-10 border-4 border-zinc-700 border-t-indigo-500 rounded-full animate-spin mb-3"></div>
                    <p class="text-sm font-semibold text-zinc-200">AI Brain analyzing video content & genre...</p>
                    <p class="text-xs text-zinc-500 mt-1">Cross-referencing 5-minute continuous knowledge base</p>
                </div>
            `;

            try {
                const diagnosis = await (typeof AIVideoBrain !== 'undefined'
                    ? AIVideoBrain.findVideoType(video)
                    : { explanation: "Analyzing...", brainData: {} });

                const data = diagnosis.brainData || {};
                const tagsList = (data.tags && data.tags.length > 0) ? data.tags : ['Knowledge', 'Tutorial', 'Discussion'];

                videoTypeContent.innerHTML = `
                    <div class="bg-gradient-to-r from-indigo-950/60 via-purple-950/40 to-zinc-900 border border-indigo-500/30 p-4 rounded-xl space-y-2">
                        <div class="flex items-center justify-between">
                            <span class="text-[10px] uppercase tracking-wider font-bold text-indigo-300 bg-indigo-500/20 px-2.5 py-0.5 rounded-full border border-indigo-500/30">${data.genre || 'Categorized Video'}</span>
                            <span class="text-[10px] text-zinc-400 font-mono"><i class="fas fa-bolt text-amber-400 mr-1"></i>${data.isShort ? 'Short Reel' : 'Standard Video'}</span>
                        </div>
                        <h4 class="text-base font-bold text-white leading-snug">${video.title}</h4>
                        <p class="text-xs text-zinc-300">Channel: <strong class="text-white">${video.channel}</strong> • Category: <strong class="text-white">${video.category || data.category || 'General'}</strong></p>
                    </div>

                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div class="bg-zinc-800/70 border border-zinc-700/60 p-3.5 rounded-xl">
                            <div class="flex items-center gap-2 mb-1.5 text-indigo-400 text-xs font-bold uppercase tracking-wider">
                                <i class="fas fa-users"></i>
                                <span>Target Audience</span>
                            </div>
                            <p class="text-xs text-zinc-300 leading-relaxed">${data.targetAudience || 'General audience interested in learning and educational discovery.'}</p>
                        </div>

                        <div class="bg-zinc-800/70 border border-zinc-700/60 p-3.5 rounded-xl">
                            <div class="flex items-center gap-2 mb-1.5 text-purple-400 text-xs font-bold uppercase tracking-wider">
                                <i class="fas fa-layer-group"></i>
                                <span>Presentation Depth</span>
                            </div>
                            <p class="text-xs text-zinc-300 leading-relaxed">${data.depth || 'Accessible, conceptual analysis and engaging instruction.'}</p>
                        </div>
                    </div>

                    <div class="bg-zinc-800/70 border border-zinc-700/60 p-3.5 rounded-xl">
                        <div class="flex items-center gap-2 mb-2 text-emerald-400 text-xs font-bold uppercase tracking-wider">
                            <i class="fas fa-tags"></i>
                            <span>Key Themes & Topics</span>
                        </div>
                        <div class="flex flex-wrap gap-1.5">
                            ${tagsList.map(tag => `<span class="text-[11px] bg-zinc-700/80 text-zinc-200 px-2 py-0.5 rounded-md border border-zinc-600/50">${tag}</span>`).join('')}
                        </div>
                    </div>

                    <div class="p-3.5 rounded-xl bg-zinc-800/50 border border-zinc-700/50 text-xs text-zinc-300 leading-relaxed">
                        <h5 class="text-xs font-bold text-white mb-1.5 flex items-center gap-1.5">
                            <i class="fas fa-lightbulb text-amber-400"></i> AI Summary & Value
                        </h5>
                        <div class="text-xs text-zinc-300 whitespace-pre-line leading-relaxed">${diagnosis.explanation ? diagnosis.explanation.replace(/###.*?\n/g, '') : data.summary}</div>
                    </div>
                `;
            } catch (err) {
                console.error("AI diagnosis error:", err);
                videoTypeContent.innerHTML = `<p class="text-xs text-red-400">Failed to analyze video. Please try again.</p>`;
            }
        });

        if (closeVideoTypeModal) {
            closeVideoTypeModal.addEventListener("click", () => videoTypeModal.classList.add("hidden"));
        }
        videoTypeModal.addEventListener("click", (e) => {
            if (e.target === videoTypeModal) videoTypeModal.classList.add("hidden");
        });

        if (askJaskMoreBtn) {
            askJaskMoreBtn.addEventListener("click", () => {
                videoTypeModal.classList.add("hidden");
                if (jaskPanel) {
                    jaskPanel.classList.remove("hidden");
                    sendJAskMessage("What kind of video is this?");
                }
            });
        }
    }

    document.getElementById("cancel-comment").addEventListener("click", () => {
        commentInput.value = "";
    });

    // Auto-rotate on fullscreen for mobile
    function handleFullscreenChange() {
        const isFullscreen = document.fullscreenElement || document.webkitFullscreenElement;
        
        if (isFullscreen) {
            // Attempt to lock to landscape on mobile when entering fullscreen
            if (screen.orientation && screen.orientation.lock) {
                screen.orientation.lock('landscape').catch((err) => {
                    console.log('Orientation lock failed:', err);
                });
            }
        } else {
            // Unlock orientation when exiting fullscreen
            if (screen.orientation && screen.orientation.unlock) {
                screen.orientation.unlock();
            }
        }
    }

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);

    // Theme Toggle Listener
    document.querySelectorAll(".theme-toggle-btn, #theme-toggle-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            if (typeof cycleThemePreference === 'function') {
                cycleThemePreference();
            }
        });
    });

    updateInteractionsUI();
    await renderRecommendations();
});