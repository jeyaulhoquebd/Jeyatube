document.addEventListener("DOMContentLoaded", async () => {
    const promoBox = document.getElementById("premium-promo-box");
    const creatorHub = document.getElementById("premium-creator-dashboard");
    const activateBtn = document.getElementById("activate-premium-btn");
    const cancelBtn = document.getElementById("cancel-premium-btn");
    const uploadForm = document.getElementById("premium-upload-form");

    function checkPremiumState() {
        const isPremium = localStorage.getItem("jtube_user_premium") === "true";
        if (isPremium) {
            promoBox.classList.add("hidden");
            creatorHub.classList.remove("hidden");
        } else {
            creatorHub.classList.add("hidden");
            promoBox.classList.remove("hidden");
        }
    }

    activateBtn.addEventListener("click", () => {
        localStorage.setItem("jtube_user_premium", "true");
        alert("Welcome to JTube Premium! Your Upload Dashboard has been generated below.");
        checkPremiumState();
    });

    cancelBtn.addEventListener("click", () => {
        if(confirm("Are you sure you want to cancel your Premium features? This resets upload permission access rights.")) {
            localStorage.setItem("jtube_user_premium", "false");
            checkPremiumState();
        }
    });

    uploadForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        const title = document.getElementById("p-title").value.trim();
        const category = document.getElementById("p-category").value;
        const duration = document.getElementById("p-duration").value.trim();
        const qualityType = document.getElementById("p-quality").value; // Capture condition: Good Video or Bad Video
        const channelName = document.getElementById("p-channel").value.trim();
        let thumbnail = document.getElementById("p-thumbnail").value.trim();
        let videoUrl = document.getElementById("p-url").value.trim();

        if (!thumbnail) {
            thumbnail = "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=500&auto=format&fit=crop&q=60";
        }
        if (!videoUrl) {
            videoUrl = "https://www.youtube.com/watch?v=60Yo63VFt-M"; // default is YT link
        }

        // Validate YouTube Link
        const ytRegex = /^(https?\:\/\/)?(www\.youtube\.com|youtu\.?be)\/.+$/;
        if (!ytRegex.test(videoUrl)) {
            alert("Error: Only YouTube links can be added to the website! Please provide a valid YouTube URL (e.g., https://www.youtube.com/watch?v=...).");
            return;
        }

        const newPremiumVideo = {
            id: "prem_" + Date.now().toString(),
            title: title,
            channel: channelName + " [Premium]",
            category: category,
            views: "10",
            time: "Just now",
            duration: duration,
            thumbnail: thumbnail,
            videoUrl: videoUrl,
            description: `This content was posted by a verified JTube Premium member. Creator Rated: ${qualityType}`,
            likes: 1,
            liked: true,
            comments: [],
            contentQuality: qualityType, // Added property flag into database record object array
            timestamp: Date.now()
        };

        // Save inside Firebase directly
        await saveVideo(newPremiumVideo);

        // Auto register their channel to channel configuration matrix mappings
        let channels = await getChannels();
        if (!channels[newPremiumVideo.channel]) {
            await saveChannel(newPremiumVideo.channel, { subscribers: 1, subscribed: false });
        }

        uploadForm.reset();
        alert(`Successfully published! Your video is logged as a [${qualityType}] on JTube.`);
        window.location.href = "index.html"; // Redirect to feed to view it instantly
    });

    // Initial load check execution
    checkPremiumState();
});