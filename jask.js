/**
 * JAsk AI — JTube's intelligent video assistant powered by Groq
 * Reads all video data (titles, descriptions, channels) and provides
 * contextual answers + direct JTube video links.
 */
const JAsk = (() => {
    let allVideos = [];
    let isLoaded = false;
    let conversationHistory = [];

    // Load all videos into memory so AI knows everything
    async function loadVideoLibrary() {
        if (isLoaded && allVideos.length > 0) return allVideos;
        try {
            allVideos = await getVideos();
            isLoaded = true;
        } catch (err) {
            console.error("JAsk: Failed to load video library", err);
            allVideos = [];
        }
        return allVideos;
    }

    // (Unused) Full KB builder, kept for reference
    function buildVideoKnowledgeBase(videos) {
        if (!videos || videos.length === 0) return "No videos currently available on the platform.";
        return videos.slice(0, 80).map((v, i) => {
            const desc = (v.description || '').substring(0, 100).replace(/\n/g, ' ');
            return `${v.id}|${v.title}|${v.channel}|${v.category || ''}|${v.views || 0}|${desc}`;
        }).join('\n');
    }

    // Search for relevant videos based on user query
    function findRelevantVideos(query, videos) {
        const q = query.toLowerCase();
        const words = q.split(/\s+/).filter(w => w.length > 2);

        return videos
            .map(v => {
                let score = 0;
                const title = (v.title || '').toLowerCase();
                const desc = (v.description || '').toLowerCase();
                const channel = (v.channel || '').toLowerCase();
                const category = (v.category || '').toLowerCase();

                words.forEach(word => {
                    if (title.includes(word)) score += 5;
                    if (channel.includes(word)) score += 3;
                    if (category.includes(word)) score += 2;
                    if (desc.includes(word)) score += 1;
                });

                // Exact phrase match bonus
                if (title.includes(q)) score += 10;
                if (channel.includes(q)) score += 8;

                return { ...v, score };
            })
            .filter(v => v.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, 5);
    }

    // Generate dynamic suggested questions based on current video
    function getSuggestedQuestions(video) {
        const title = video.title || '';
        const channel = video.channel || '';
        const questions = [
            "What kind of video is this?",
            "Summarize this video",
            "Recommend related content"
        ];

        // Add context-specific questions based on title keywords
        const titleLower = title.toLowerCase();
        if (titleLower.includes('ai') || titleLower.includes('artificial intelligence') || titleLower.includes('machine learning')) {
            questions.push("How does AI/ML work in this context?");
            questions.push("What are the key takeaways about technology?");
        } else if (titleLower.includes('islam') || titleLower.includes('quran') || titleLower.includes('hadith')) {
            questions.push("What Islamic teachings are discussed?");
            questions.push("How is this relevant today?");
        } else if (titleLower.includes('science') || titleLower.includes('physics') || titleLower.includes('chemistry')) {
            questions.push("What scientific concepts are explained?");
            questions.push("Why is this discovery important?");
        } else if (titleLower.includes('team') || titleLower.includes('leadership') || titleLower.includes('business')) {
            questions.push("How do you build a great team?");
            questions.push("Why is saying no important?");
        } else {
            questions.push(`What is "${title.substring(0, 40)}..." about?`);
            questions.push(`Tell me more about ${channel}`);
        }

        return questions;
    }

    // Without the AI server (Firebase Hosting): answer with matching videos from the library
    async function searchAnswer(question) {
        const q = String(question || '').replace(/[?!.,]/g, ' ').trim();
        const res = typeof fetchCatalogPage === 'function' ? await fetchCatalogPage({ q, limit: 5, sort: 'popular' }) : null;
        const items = res ? res.items : [];
        if (!items.length) return { text: "I couldn't find a JTube video about that. Try other keywords 🙂", links: [] };
        return {
            text: "Here are JTube videos that match your question 🎬\n" + items.map(v => `- [${v.title}](watch.html?id=${v.id})`).join('\n'),
            links: items.map(v => ({ title: v.title, id: v.id, thumbnail: v.thumbnail, channel: v.channel, views: v.views }))
        };
    }

    // Ask JAsk through the JTube server. The Groq API key lives only on the server,
    // and the server searches the full video catalog for relevant recommendations.
    async function askGroq(userMessage, currentVideo) {
        const cv = currentVideo || {};
        conversationHistory.push({ role: "user", content: String(userMessage).slice(0, 1500) });
        if (conversationHistory.length > 8) conversationHistory = conversationHistory.slice(-8);
        try {
            const response = await fetch("/api/jask/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    message: userMessage,
                    history: conversationHistory.slice(0, -1),
                    currentVideo: {
                        id: cv.id, title: cv.title, channel: cv.channel,
                        category: cv.category, description: (cv.description || "").slice(0, 400)
                    }
                })
            });
            const isJson = (response.headers.get('content-type') || '').includes('json');
            const data = isJson ? await response.json().catch(() => ({})) : {};
            if (!isJson || response.status === 404) return await searchAnswer(userMessage);
            if (!response.ok) {
                return { text: data.error || "⚠️ JAsk is busy right now. Please try again in a moment.", links: [] };
            }
            const aiText = data.text || "";
            conversationHistory.push({ role: "assistant", content: aiText });
            return { text: aiText, links: Array.isArray(data.links) ? data.links : [] };
        } catch (error) {
            return await searchAnswer(userMessage);
        }
    }

    // Reset conversation when switching videos
    function resetConversation() {
        conversationHistory = [];
    }

    // Refresh video library (e.g., when new videos are uploaded)
    async function refreshLibrary() {
        isLoaded = false;
        await loadVideoLibrary();
    }

    return {
        askGroq,
        getSuggestedQuestions,
        resetConversation,
        refreshLibrary,
        loadVideoLibrary,
        findRelevantVideos
    };
})();
