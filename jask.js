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

    // Build a knowledge context string from ALL videos on the platform
    function buildVideoKnowledgeBase(videos) {
        if (!videos || videos.length === 0) return "No videos currently available on the platform.";
        // Limit to 80 videos and keep compact to stay within token limits
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
            "Summarize this video",
            "Recommend related content",
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

    // Send message to Groq API and get AI response
    async function askGroq(userMessage, currentVideo) {
        const apiKey = typeof ENV !== 'undefined' ? ENV.GROQ_API_KEY : null;
        if (!apiKey) {
            return { text: "⚠️ AI configuration is missing. Please add your Groq API key to env.js.", links: [] };
        }

        await loadVideoLibrary();
        const videoKB = buildVideoKnowledgeBase(allVideos);
        const relevantVideos = findRelevantVideos(userMessage, allVideos);

        // Build system prompt with full video knowledge
        const systemPrompt = `You are JAsk, the AI assistant for JTube video platform. Be friendly, concise, use emojis.

CURRENT VIDEO:
Title: "${currentVideo.title}"
Channel: "${currentVideo.channel}"
Category: "${currentVideo.category || 'General'}"
Description: "${(currentVideo.description || '').substring(0, 300)}"

ALL JTUBE VIDEOS (format: ID|Title|Channel|Category|Views|Description):
${videoKB}

RULES:
1. Answer about current video using its title/description.
2. When user asks for a video, find matching ones and link them as: [Title](watch.html?id=ID)
3. Always use that exact link format for JTube videos.
4. Never invent video IDs that don't exist above.
5. You can answer general questions but relate to JTube content when possible.`;

        // Add relevant video context to user message
        let enrichedMessage = userMessage;
        if (relevantVideos.length > 0) {
            enrichedMessage += `\n\n[System hint: These videos from the library seem most relevant to the query: ${relevantVideos.map(v => `"${v.title}" (ID: ${v.id})`).join(', ')}]`;
        }

        // Maintain conversation context (keep last 6 messages for context)
        conversationHistory.push({ role: "user", content: enrichedMessage });
        if (conversationHistory.length > 8) {
            conversationHistory = conversationHistory.slice(-8);
        }

        const messages = [
            { role: "system", content: systemPrompt },
            ...conversationHistory
        ];

        try {
            const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: "llama-3.3-70b-versatile",
                    messages: messages,
                    temperature: 0.7,
                    max_tokens: 800,
                    stream: false
                })
            });

            if (!response.ok) {
                // Try fallback model if primary fails
                const fallbackResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${apiKey}`
                    },
                    body: JSON.stringify({
                        model: "llama-3.1-8b-instant",
                        messages: messages,
                        temperature: 0.7,
                        max_tokens: 800,
                        stream: false
                    })
                });

                if (!fallbackResponse.ok) {
                    const errData = await fallbackResponse.json().catch(() => ({}));
                    console.error("Groq API Error (fallback):", errData);
                    return { text: "⚠️ Sorry, I'm having trouble connecting right now. Please try again in a moment.", links: [] };
                }

                const fallbackData = await fallbackResponse.json();
                const fallbackText = fallbackData.choices?.[0]?.message?.content || "I couldn't generate a response.";
                conversationHistory.push({ role: "assistant", content: fallbackText });
                const fallbackLinks = [];
                const flinkRegex = /\[([^\]]+)\]\(watch\.html\?id=([^)]+)\)/g;
                let fmatch;
                while ((fmatch = flinkRegex.exec(fallbackText)) !== null) {
                    const fv = allVideos.find(v => v.id === fmatch[2]);
                    if (fv) fallbackLinks.push({ title: fmatch[1], id: fmatch[2], thumbnail: fv.thumbnail, channel: fv.channel, views: fv.views });
                }
                return { text: fallbackText, links: fallbackLinks };
            }

            const data = await response.json();
            const aiText = data.choices?.[0]?.message?.content || "I couldn't generate a response. Please try again.";

            // Save AI response to history
            conversationHistory.push({ role: "assistant", content: aiText });

            // Parse video links from response
            const links = [];
            const linkRegex = /\[([^\]]+)\]\(watch\.html\?id=([^)]+)\)/g;
            let match;
            while ((match = linkRegex.exec(aiText)) !== null) {
                const linkedVideo = allVideos.find(v => v.id === match[2]);
                if (linkedVideo) {
                    links.push({
                        title: match[1],
                        id: match[2],
                        thumbnail: linkedVideo.thumbnail,
                        channel: linkedVideo.channel,
                        views: linkedVideo.views
                    });
                }
            }

            return { text: aiText, links };
        } catch (error) {
            console.error("JAsk API call failed:", error);
            return { text: "⚠️ Network error. Please check your connection and try again.", links: [] };
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
