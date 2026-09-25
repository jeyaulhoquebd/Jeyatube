const express = require('express');
const path = require('path');
const { GoogleGenAI } = require('@google/genai');

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '15mb' }));

// ===== LAZY GEMINI CLIENT INITIALIZER =====
let genAIClient = null;
function getGeminiClient() {
  if (!genAIClient && process.env.GEMINI_API_KEY) {
    try {
      genAIClient = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build'
          }
        }
      });
    } catch (e) {
      console.warn('Failed to initialize Gemini client:', e);
    }
  }
  return genAIClient;
}

// ===== FEATURED YOUTUBE CHANNELS REGISTRY =====
// Verified, high-quality YouTube Channel IDs for automated daily video synchronization
// Exclusively curated for educational, scientific, AI, programming, and intellectual content
const FEATURED_CHANNELS = {
  "Stanford Online": { ytChannelId: "UCBa5G_ESCn8Yd4vw5U-gIcg", category: "Programming", lastSync: 0, videoCount: 0 },
  "CS50": { ytChannelId: "UCcabW7890RKJzL968QWEykA", category: "Programming", lastSync: 0, videoCount: 0 },
  "CodeWithHarry": { ytChannelId: "UCeVMnSShP_Iviwkknt83cww", category: "Programming", lastSync: 0, videoCount: 0 },
  "Programming Hero Bangladesh": { ytChannelId: "UCZ34f0PHL-TC8vD31hVPZuw", category: "Programming", lastSync: 0, videoCount: 0 },
  "Bro Code": { ytChannelId: "UC4SVo0Ue36XCfOyb5Lh1viQ", category: "Programming", lastSync: 0, videoCount: 0 },
  "Phitron": { ytChannelId: "UCjKb3rI-O-sAc64yXscpCDQ", category: "Programming", lastSync: 0, videoCount: 0 },
  "CPS Academy": { ytChannelId: "UC3S_jVMwhUrF6jjkFCQvyuA", category: "Programming", lastSync: 0, videoCount: 0 },
  "Hablu Programmer": { ytChannelId: "UCpGQisjfG8w-E21cG4ScEOA", category: "Programming", lastSync: 0, videoCount: 0 },
  "Ali Hossain": { ytChannelId: "UCnbAAJ1l1AvmfaH2TVdH18Q", category: "Programming", lastSync: 0, videoCount: 0 },
  "Mark Rober": { ytChannelId: "UCY1kMZp36IQSyNx_9h4mpCg", category: "Science", lastSync: 0, videoCount: 0 },
  "David Bombal": { ytChannelId: "UCP7WmQ_U4GB3K51Od9QvM0w", category: "AI & ML", lastSync: 0, videoCount: 0 },
  "AI Frontier": { ytChannelId: "UC6CGPM_qMkmtJY5_bd4rK2w", category: "AI & ML", lastSync: 0, videoCount: 0 },
  "MIT OpenCourseWare": { ytChannelId: "UCEBb1b_L6zDS3xTUrIALZOw", category: "Education", lastSync: 0, videoCount: 0 },
  "IIT Madras - B.S. Degree Programme": { ytChannelId: "UCvKzzGO37oT83K0FwnUucxw", category: "Education", lastSync: 0, videoCount: 0 },
  "Towards Eternity": { ytChannelId: "UCPubBVDCzu7IWWnitlkEsNw", category: "Islam", lastSync: 0, videoCount: 0 },
  "Alokito Ummah": { ytChannelId: "UCFRd_Id8mRnpjn-Cgm75fSA", category: "Islam", lastSync: 0, videoCount: 0 },
  "تلاوات ياسر الدوسري إمام الحرم المكي": { ytChannelId: "UClncV9OLPto_MinRzGfjr2g", category: "Islam", lastSync: 0, videoCount: 0 },
  "Qari Sabah Muhtadi Abid [Premium]": { ytChannelId: "UCY0tyW-tjT_-gGfxdagsmiw", category: "Islam", lastSync: 0, videoCount: 0 },
  "Sabit International": { ytChannelId: "UCGmpReKFeVJjviXDp9knOpA", category: "Motivation", lastSync: 0, videoCount: 0 },
  "Make First Million - Badar Munir": { ytChannelId: "UCVzgTh8i9W-UtengLs-xytA", category: "Motivation", lastSync: 0, videoCount: 0 },
  "Raj Shamani": { ytChannelId: "UCzwCEE_PchiBULMnAJqhGVg", category: "Podcasts", lastSync: 0, videoCount: 0 },
  "erspective Podcast Clips": { ytChannelId: "UCLx4XRxWzq3jLYqNfIGs15Q", category: "Podcasts", lastSync: 0, videoCount: 0 },
  "Dipro Prattoy": { ytChannelId: "UC_gzNUehJ7BS84seL2_e2FQ", category: "Education", lastSync: 0, videoCount: 0 },
  "Inception BD": { ytChannelId: "UCLakvfuaLwTC-KPVCccQXAA", category: "Education", lastSync: 0, videoCount: 0 },
  "উৎকর্ষ": { ytChannelId: "UCT9YVvhcV1SCSAk1aIP0f0A", category: "Education", lastSync: 0, videoCount: 0 },
  "Asadudzaman Joy": { ytChannelId: "UCiQwtqIAlphixACg_4ADeWA", category: "Education", lastSync: 0, videoCount: 0 },
  "Tech Minds": { ytChannelId: "UC9a8Z6Sp6eb2s3O79pX5Zvg", category: "AI & ML", lastSync: 0, videoCount: 0 },
  "Heritage & Science": { ytChannelId: "UCDE92JmI7T5C8fQwj2eNbhA", category: "Science", lastSync: 0, videoCount: 0 },
  "Fahim Abdullah": { ytChannelId: "UCzRXuZ2TLCtVywE676SYIVg", category: "Education", lastSync: 0, videoCount: 0 },
  "Abir Chowdhury": { ytChannelId: "UCaSJJoUiIAiD03pk4O426rQ", category: "Motivation", lastSync: 0, videoCount: 0 }
};

// In-memory synced videos map: videoId -> videoObject
const syncedVideosMap = new Map();
let lastSyncTimestamp = 0;
let isSyncingChannels = false;

function decodeHtml(str) {
  if (!str) return "";
  return str
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function timeAgo(date) {
  const sec = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (sec < 60) return "Just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day === 1) return "Yesterday";
  if (day < 30) return `${day} days ago`;
  const mo = Math.floor(day / 30);
  return `${mo} mo ago`;
}

// Fetch up to 15 latest videos for a channel via standard YouTube RSS feeds
async function fetchChannelRssVideos(channelId, channelName, category) {
  if (!channelId) return [];
  try {
    const res = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });
    if (!res.ok) {
      console.warn(`[Channel RSS] HTTP ${res.status} for ${channelName} (${channelId})`);
      return [];
    }
    const xml = await res.text();
    const entries = xml.split("<entry>").slice(1);
    
    return entries.map(entry => {
      const videoId = (entry.match(/<yt:videoId>(.*?)<\/yt:videoId>/) || [])[1];
      if (!videoId) return null;

      const rawTitle = (entry.match(/<title>(.*?)<\/title>/) || [])[1] || "Untitled Video";
      const title = decodeHtml(rawTitle);
      const pub = (entry.match(/<published>(.*?)<\/published>/) || [])[1];
      const thumb = (entry.match(/<media:thumbnail url="(.*?)"/) || [])[1] || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
      const rawDesc = (entry.match(/<media:description>([\s\S]*?)<\/media:description>/) || [])[1] || "";
      const description = decodeHtml(rawDesc).trim();
      const views = parseInt((entry.match(/<media:statistics views="(\d+)"/) || [])[1] || "0", 10);
      
      const isReel = /#shorts|#short|#reels|#reel|\bshorts\b|\breels\b/i.test(title + " " + description) ||
                     title.toLowerCase().includes('#reel') || title.toLowerCase().includes('#short');
      const isShort = isReel;
      const timestamp = pub ? new Date(pub).getTime() : Date.now();
      
      // Calculate realistic default likes & duration
      const likes = Math.max(12, Math.floor(views * 0.042));
      const duration = isReel ? "0:45" : (views > 100000 ? "14:22" : "09:40");

      return {
        id: "yt_" + videoId,
        videoId,
        title,
        channel: channelName,
        category: category || "General",
        views,
        time: timeAgo(timestamp),
        duration,
        thumbnail: thumb,
        videoUrl: isReel ? `https://www.youtube.com/shorts/${videoId}` : `https://www.youtube.com/watch?v=${videoId}`,
        description: description.slice(0, 1500),
        likes,
        baseLikes: likes,
        liked: false,
        likedBy: [],
        isShort: isReel,
        isReel: isReel,
        contentType: isReel ? 'reel' : 'video',
        comments: [],
        timestamp,
        isDailyUpload: (Date.now() - timestamp) <= 3 * 24 * 60 * 60 * 1000 // Last 72 hours
      };
    }).filter(Boolean);
  } catch (err) {
    console.warn(`[Channel RSS] Error fetching ${channelName}:`, err.message);
    return [];
  }
}

// Background sync function for all featured channels
async function syncAllFeaturedChannels(force = false) {
  if (isSyncingChannels && !force) return { status: 'in_progress' };
  isSyncingChannels = true;
  const start = Date.now();
  let newCount = 0;
  let totalFetched = 0;

  console.log(`[YouTube Sync] Commencing daily upload sync for ${Object.keys(FEATURED_CHANNELS).length} featured channels...`);

  for (const [name, meta] of Object.entries(FEATURED_CHANNELS)) {
    try {
      const vids = await fetchChannelRssVideos(meta.ytChannelId, name, meta.category);
      totalFetched += vids.length;
      meta.videoCount = vids.length;
      meta.lastSync = Date.now();

      vids.forEach(v => {
        if (!syncedVideosMap.has(v.id)) {
          newCount++;
        }
        syncedVideosMap.set(v.id, v);
      });
    } catch (e) {
      console.warn(`[YouTube Sync] Failed for ${name}:`, e.message);
    }
  }

  lastSyncTimestamp = Date.now();
  isSyncingChannels = false;
  console.log(`[YouTube Sync] Finished in ${Date.now() - start}ms. Ingested ${totalFetched} items (${newCount} newly added) across all featured channels.`);

  // Auto-train AIBrain with latest video catalog
  if (syncedVideosMap.size > 0) {
    trainAIBrain(Array.from(syncedVideosMap.values()));
  }

  const allVids = Array.from(syncedVideosMap.values());
  const reelsCount = allVids.filter(v => v.isReel || v.contentType === 'reel' || v.isShort).length;
  const videosCount = Math.max(0, allVids.length - reelsCount);

  return {
    status: 'complete',
    totalChannels: Object.keys(FEATURED_CHANNELS).length,
    totalVideos: syncedVideosMap.size,
    videosCount,
    reelsCount,
    newVideosFound: newCount,
    lastSyncTimestamp
  };
}

// Initial background sync on server start (non-blocking)
setTimeout(() => {
  syncAllFeaturedChannels().catch(err => console.warn('Initial sync error:', err));
}, 1500);

// Recurring background sync every 10 minutes (600,000 ms)
setInterval(() => {
  console.log('[YouTube Sync] Triggering automated 10-minute daily video and Reel sync check...');
  syncAllFeaturedChannels().catch(err => console.warn('Scheduled sync error:', err));
}, 10 * 60 * 1000);

// ===== IN-MEMORY AI VIDEO BRAIN =====
const AIBrainState = {
  lastTrained: Date.now(),
  videoCount: 0,
  indexedCatalog: {},
  categoryCounts: {},
  trainingHistory: [],
  isTraining: false
};

// Auto-tag video type heuristics based on title, channel, description, category
function classifyVideoContent(video) {
  const text = `${video.title || ''} ${video.description || ''} ${video.channel || ''} ${video.category || ''}`.toLowerCase();
  
  let genre = 'General Educational Video';
  let category = video.category || 'General';
  let targetAudience = 'General viewers and lifelong learners';
  let depth = 'Accessible & Informative';
  const tags = [];

  if (/islam|quran|hadith|tafsir|surah|prophet|dua|sunnah|allah|sermon|waz|namaz|ramadan|islamic/i.test(text)) {
    genre = 'Islamic & Spiritual Lecture';
    category = 'Islam';
    targetAudience = 'Spiritual seekers, Muslims, and anyone interested in Islamic teachings';
    depth = 'Spiritual, Moral, & Reflective';
    tags.push('Islamic Teachings', 'Spiritual Reflection', 'Quranic Wisdom', 'Moral Values');
  } else if (/ai|artificial intelligence|machine learning|deep learning|neural network|gemini|gpt|llm|transformer|openai|groq|agentic/i.test(text)) {
    genre = 'Artificial Intelligence & Machine Learning Breakdown';
    category = 'AI & ML';
    targetAudience = 'Tech enthusiasts, engineers, students, AI practitioners';
    depth = 'Cutting-edge Technology & Conceptual Analysis';
    tags.push('Artificial Intelligence', 'Machine Learning', 'Future Tech', 'Data Science', 'LLMs');
  } else if (/python|javascript|typescript|coding|programming|react|node|html|css|developer|software|algorithm|github|bug|cs50/i.test(text)) {
    genre = 'Software Engineering & Coding Tutorial';
    category = 'Programming';
    targetAudience = 'Software developers, coders, computer science students';
    depth = 'Practical, Hands-on Technical Guide';
    tags.push('Programming', 'Code Walkthrough', 'Software Development', 'Web Dev');
  } else if (/physics|space|universe|quantum|astronomy|nasa|planet|science|chemistry|biology|galaxy|engineering/i.test(text)) {
    genre = 'Science & Scientific Exploration Documentary';
    category = 'Science';
    targetAudience = 'Curious minds, students, science & engineering lovers';
    depth = 'Scientific Breakdown & Discovery';
    tags.push('Science', 'Cosmic Exploration', 'STEM Education', 'Hands-on Engineering');
  } else if (/leadership|team|business|startup|founder|career|interview|productivity|mindset|habits|million/i.test(text)) {
    genre = 'Professional Leadership & Personal Growth';
    category = 'Motivation';
    targetAudience = 'Entrepreneurs, professionals, team leaders, motivated learners';
    depth = 'Actionable Strategy & Mindset Development';
    tags.push('Productivity', 'Leadership Skills', 'Personal Growth', 'Wealth Creation');
  } else if (/podcast|conversation|talk|interview|dialogue/i.test(text)) {
    genre = 'Long-form Interview & Cultural Dialogue';
    category = 'Podcasts';
    targetAudience = 'Podcast listeners, intellectuals, debate enthusiasts';
    depth = 'Deep Analytical Conversation';
    tags.push('In-depth Interview', 'Podcasts', 'Thought Leadership');
  }

  const isShort = (video.duration && (video.duration.includes('0:') || parseInt(video.duration, 10) <= 90)) ||
                  Boolean(video.isShort) ||
                  /shorts|#shorts|short/i.test(text);

  return {
    id: video.id,
    title: video.title || 'Untitled',
    channel: video.channel || 'Unknown Channel',
    genre,
    category,
    targetAudience,
    depth,
    isShort,
    views: video.views || 0,
    tags,
    summary: (video.description || video.title || '').substring(0, 200).replace(/\n/g, ' ')
  };
}

function trainAIBrain(videoList) {
  AIBrainState.isTraining = true;
  const now = Date.now();
  const catalog = {};
  const catCounts = {};

  if (Array.isArray(videoList)) {
    videoList.forEach(v => {
      if (!v || !v.id) return;
      const analyzed = classifyVideoContent(v);
      catalog[v.id] = analyzed;
      catCounts[analyzed.category] = (catCounts[analyzed.category] || 0) + 1;
    });
  }

  AIBrainState.indexedCatalog = catalog;
  AIBrainState.videoCount = Object.keys(catalog).length;
  AIBrainState.categoryCounts = catCounts;
  AIBrainState.lastTrained = now;
  AIBrainState.isTraining = false;

  AIBrainState.trainingHistory.unshift({
    timestamp: now,
    videoCount: AIBrainState.videoCount,
    categories: Object.keys(catCounts)
  });
  if (AIBrainState.trainingHistory.length > 20) {
    AIBrainState.trainingHistory.pop();
  }

  console.log(`[AI Video Brain] Successfully trained on ${AIBrainState.videoCount} videos across ${Object.keys(catCounts).length} categories.`);
  return {
    trained: true,
    lastTrained: now,
    videoCount: AIBrainState.videoCount,
    categories: catCounts
  };
}

// ===== MULTILINGUAL ABUSE FILTER =====
const ABUSE_REGEX_PATTERNS = [
  /\b(fuck|fucker|fucking|f\*ck|shit|bitch|bastard|asshole|a\*\*hole|dick|pussy|whore|slut|cunt)\b/i,
  /\b(idiot|stupid|moron|retard|dumbass|motherfucker|douchebag|trash|scum)\b/i,
  /\b(kill\s*yourself|kys|die\s*in\s*a\s*fire|go\s*die|i\s*will\s*kill\s*you)\b/i,
  /\b(hate\s*you|ugly\s*pig|loser|burn\s*in\s*hell)\b/i,
  /(খানকি|খানকির|বেশ্যা|শুয়োর|শুয়োরের|কুত্তা|কুত্তার|শালা|হারামজাদা|মাদারচোদ|চোদা|চোদ|মাগী|বাল|ভোদা|লওড়া)/u,
  /\b(khanki|khankir|beshya|shuyor|shuyorer|kutta|kuttar|sala|shala|haramjada|madarchod|choda|chod|magi|baal|bal|bhodai|lawra)\b/i,
  /\b(bhenchod|behenchod|chutiya|gaand|bhosdike|bhosadi|harami|kamina)\b/i
];

function checkAbusiveContent(text) {
  if (!text || typeof text !== 'string') {
    return { isAbusive: false, reason: null };
  }
  const cleanInput = text.trim();
  for (const pattern of ABUSE_REGEX_PATTERNS) {
    if (pattern.test(cleanInput)) {
      return {
        isAbusive: true,
        reason: 'Violates community standards: contains profanity, abusive insults, or harassment.'
      };
    }
  }
  return { isAbusive: false, reason: null };
}

// ===== API ROUTES =====

// 1. Featured Channels & Live Sync Status
app.get('/api/channels/featured', (req, res) => {
  const list = Object.entries(FEATURED_CHANNELS).map(([name, data]) => ({
    name,
    ...data,
    latestVideosInCache: Array.from(syncedVideosMap.values()).filter(v => v.channel === name).length
  }));
  res.json({
    channels: list,
    totalCount: list.length,
    lastSyncTimestamp,
    isSyncing: isSyncingChannels
  });
});

// 2. Trigger Channel Synchronization (All or Specific)
app.post('/api/channels/sync', async (req, res) => {
  const { channelName, force } = req.body || {};
  
  if (channelName && FEATURED_CHANNELS[channelName]) {
    const meta = FEATURED_CHANNELS[channelName];
    const vids = await fetchChannelRssVideos(meta.ytChannelId, channelName, meta.category);
    vids.forEach(v => syncedVideosMap.set(v.id, v));
    meta.lastSync = Date.now();
    meta.videoCount = vids.length;
    const reelsInChannel = vids.filter(v => v.isReel || v.contentType === 'reel' || v.isShort).length;
    return res.json({
      success: true,
      channel: channelName,
      videosFetched: vids.length,
      videosCount: Math.max(0, vids.length - reelsInChannel),
      reelsCount: reelsInChannel,
      videos: vids
    });
  }

  // Full sync across all channels
  const result = await syncAllFeaturedChannels(Boolean(force));
  res.json({
    ...result,
    videos: Array.from(syncedVideosMap.values())
  });
});

// 3. Get Newly Uploaded Daily Videos (Last 72 hours)
app.get('/api/channels/daily-videos', (req, res) => {
  const now = Date.now();
  const threeDaysAgo = now - 3 * 24 * 60 * 60 * 1000;
  
  const daily = Array.from(syncedVideosMap.values())
    .filter(v => (v.timestamp || 0) >= threeDaysAgo)
    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

  res.json({
    count: daily.length,
    lastSync: lastSyncTimestamp,
    videos: daily
  });
});

// 4. Resolve YouTube Channel ID from Handle or URL
app.post('/api/channels/resolve', async (req, res) => {
  const { query } = req.body || {};
  if (!query) return res.status(400).json({ error: 'Query required' });

  try {
    let clean = query.trim();
    if (clean.includes('youtube.com/')) {
      clean = clean.split('youtube.com/')[1].split('/')[0];
    }
    if (!clean.startsWith('@') && !clean.startsWith('UC')) {
      clean = '@' + clean;
    }

    const fetchUrl = clean.startsWith('UC')
      ? `https://www.youtube.com/channel/${clean}`
      : `https://www.youtube.com/${clean}`;

    const htmlRes = await fetch(fetchUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    });
    const html = await htmlRes.text();

    const mChanId = html.match(/"channelId":"(UC[a-zA-Z0-9_-]{22})"/);
    const mTitle = html.match(/<meta property="og:title" content="([^"]+)"/);
    const mImage = html.match(/<meta property="og:image" content="([^"]+)"/);
    const mDesc = html.match(/<meta property="og:description" content="([^"]+)"/);

    const channelId = mChanId ? mChanId[1] : null;
    if (!channelId) {
      return res.status(404).json({ error: 'Could not resolve YouTube Channel ID' });
    }

    res.json({
      success: true,
      channelId,
      title: mTitle ? decodeHtml(mTitle[1]) : clean,
      avatarUrl: mImage ? mImage[1] : '',
      description: mDesc ? decodeHtml(mDesc[1]) : ''
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Unified JAsk AI & Gemini Chat API
app.post(['/api/ai/chat', '/api/gemini/chat'], async (req, res) => {
  const { message, currentVideo, history, relevantVideos } = req.body || {};
  
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ text: "Please provide a valid question or message." });
  }

  // Check abuse before answering
  const abuseCheck = checkAbusiveContent(message);
  if (abuseCheck.isAbusive) {
    return res.json({
      text: "⚠️ JAsk AI adheres to community guidelines. Please keep questions respectful and constructive.",
      links: []
    });
  }

  const gemini = getGeminiClient();
  let aiText = null;

  // Build context
  let videoContext = "No specific video currently playing.";
  if (currentVideo) {
    const brainData = (AIBrainState.indexedCatalog && AIBrainState.indexedCatalog[currentVideo.id]) || classifyVideoContent(currentVideo);
    videoContext = `CURRENT PLAYING VIDEO ON JTUBE:
- Title: "${currentVideo.title || 'Unknown'}"
- Channel: "${currentVideo.channel || 'Unknown'}"
- Category: "${currentVideo.category || brainData.category}"
- Classification: "${brainData.genre}"
- Description: "${(currentVideo.description || brainData.summary).slice(0, 300)}"
- Tags: ${brainData.tags.join(', ')}`;
  }

  const systemInstructions = `You are JAsk, the intelligent, friendly, YouTube-style AI assistant built into JTube.
You help viewers understand videos, provide summaries, explain complex technical or academic topics, highlight key takeaways, and recommend videos.

${videoContext}

RULES:
1. Always format key video timestamps as [MM:SS] (for example [02:15] or [10:45]) so they are interactive.
2. Be concise, highly structured (use bullet points and bolding), friendly, and use suitable emojis.
3. If asked "What kind of video is this?", provide:
   - 🎯 Video Type & Genre
   - 💡 Core Concepts & Themes
   - 👥 Target Audience
   - 🌟 Key Takeaways
4. If recommending videos, link them using: [Video Title](watch.html?id=VIDEO_ID).
5. Always provide direct, helpful answers without unnecessary preamble.
6. Identity & Privacy: You are simply JAsk, the JTube AI Assistant. Never mention or reveal what underlying model, LLM, or database technology is used under any circumstances.`;

  if (gemini) {
    try {
      const chatPrompt = `${systemInstructions}\n\nUSER QUESTION: ${message}`;
      const response = await gemini.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: chatPrompt
      });
      aiText = response.text;
    } catch (err) {
      console.warn('[AI Assistant Chat] Intelligent fallback active');
    }
  }

  // Fallback if Gemini unavailable or failed
  if (!aiText) {
    const q = message.toLowerCase();
    if (currentVideo && (q.includes('what kind') || q.includes('type') || q.includes('summarize') || q.includes('about'))) {
      const brain = classifyVideoContent(currentVideo);
      aiText = `### 🎬 Video Breakdown: **${currentVideo.title}**

- **🎯 Genre & Format**: **${brain.genre}** (${brain.isShort ? '⚡ JTube Short' : 'Standard Video'})
- **📺 Channel / Creator**: **${currentVideo.channel}**
- **📂 Category**: **${brain.category}**
- **👥 Target Audience**: ${brain.targetAudience}
- **📚 Presentation Depth**: ${brain.depth}
- **🔑 Key Themes**: ${brain.tags.join(' • ') || 'General Knowledge'}

**Summary**: ${brain.summary || currentVideo.description || 'An engaging educational video hosted on JTube.'}

💡 *Feel free to ask me for a quiz, related topics, or a quick breakdown of any concept in this video!*`;
    } else {
      aiText = `Hello! I'm **JAsk**, your JTube AI Assistant. 🚀

I'm here to help you get the most out of JTube! You can ask me to:
- ⚡ **Summarize** the current video
- 💡 Extract **Key Takeaways** & interactive timestamps
- ❓ Give you a **Quick Quiz** on the topic
- 👶 **Explain concepts simply**
- 🔍 Recommend more videos from **${currentVideo ? currentVideo.channel : 'featured channels'}**

How can I help you right now?`;
    }
  }

  // Extract clickable video links
  const links = [];
  const linkRegex = /\[([^\]]+)\]\(watch\.html\?id=([^)]+)\)/g;
  let match;
  while ((match = linkRegex.exec(aiText)) !== null) {
    const vid = syncedVideosMap.get(match[2]);
    if (vid) {
      links.push({
        title: match[1],
        id: match[2],
        thumbnail: vid.thumbnail,
        channel: vid.channel,
        views: vid.views
      });
    }
  }

  res.json({
    text: aiText,
    links,
    source: 'jtube-ai-engine'
  });
});

// 6. AI Video Knowledge Diagnosis
app.post('/api/ai/video-type', async (req, res) => {
  const { videoId, title, description, channel, category } = req.body || {};
  
  let brainData = null;
  if (videoId && AIBrainState.indexedCatalog[videoId]) {
    brainData = AIBrainState.indexedCatalog[videoId];
  } else {
    brainData = classifyVideoContent({ id: videoId, title, description, channel, category });
  }

  const gemini = getGeminiClient();
  if (gemini) {
    try {
      const prompt = `You are JTube's Video Intelligence AI. A user is asking to find out what kind of video this is.
Video details:
Title: "${title || brainData.title}"
Channel: "${channel || brainData.channel}"
Category: "${category || brainData.category}"
Description: "${(description || brainData.summary).substring(0, 400)}"
Inferred Genre: "${brainData.genre}"

Provide a structured, engaging breakdown:
1. Video Type & Genre (Exact YouTube classification)
2. Core Themes & Content
3. Target Audience & Educational Value
4. 3 Quick Key Takeaways with estimated timestamps [MM:SS]
5. 1 Practice Quiz Question for the viewer
Keep it clean, well-formatted with markdown and bullet points.`;

      const response = await gemini.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt
      });

      return res.json({
        brainData,
        explanation: response.text,
        source: 'jtube-ai-engine',
        lastTrained: AIBrainState.lastTrained
      });
    } catch (err) {
      console.warn('AI API call failed in /api/ai/video-type:', err.message);
    }
  }

  // Fallback to pre-trained catalog diagnosis
  const fallbackExplanation = `### 🎬 Video Classification
- **Genre & Type**: **${brainData.genre}** (${brainData.isShort ? '⚡ JTube Short' : 'Standard Video'})
- **Channel / Creator**: **${brainData.channel}**
- **Category**: **${brainData.category}**
- **Target Audience**: ${brainData.targetAudience}
- **Presentation Depth**: ${brainData.depth}
- **Key Themes**: ${brainData.tags.join(' • ') || 'General Knowledge'}

**Summary**: ${brainData.summary || 'A curated educational video hosted on JTube exploring key concepts.'}`;

  res.json({
    brainData,
    explanation: fallbackExplanation,
    source: 'ai-video-brain-cache',
    lastTrained: AIBrainState.lastTrained
  });
});

// 7. AI Creator Assistant: Script Generator (for Admin Studio)
app.post('/api/ai/generate-script', async (req, res) => {
  const { topic, channel, tone, targetDuration } = req.body || {};
  if (!topic) return res.status(400).json({ error: 'Topic is required' });

  const gemini = getGeminiClient();
  if (gemini) {
    try {
      const prompt = `You are an expert YouTube content strategist and scriptwriter for JTube.
Generate a complete YouTube video blueprint for:
Topic: "${topic}"
Channel Type: "${channel || 'Educational'}"
Tone: "${tone || 'Engaging and informative'}"
Target Duration: "${targetDuration || '8-10 minutes'}"

Output format:
# [Catchy Viral YouTube Title]
## 🎯 3 High-CTR Title Alternatives
## 🎣 The Hook (First 15 Seconds)
## 📋 Video Outline with Timestamps
## ✍️ Full Spoken Script Draft (Key Segments)
## 🚀 Call To Action (Subscribe & Like)
## 🏷️ Top 15 SEO Tags (comma separated)`;

      const response = await gemini.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt
      });

      return res.json({
        success: true,
        script: response.text,
        source: 'jtube-ai-engine'
      });
    } catch (err) {
      console.warn('Gemini script generator failed:', err.message);
    }
  }

  // Fallback script template
  const fallbackScript = `# Complete YouTube Blueprint: ${topic}
## 🎯 High-CTR Title Alternatives
1. How I Mastered ${topic} (Step-by-Step)
2. Why Most People Fail at ${topic}
3. The Ultimate Guide to ${topic} in 2026

## 🎣 The Hook (0:00 - 0:15)
"What if everything you knew about ${topic} was missing one crucial element? In this video, we'll break down exactly what you need to know, avoid the common pitfalls, and give you actionable steps right now."

## 📋 Video Outline
- [00:00] The Hook & Overview
- [01:30] Core Principles
- [04:00] Common Mistakes to Avoid
- [07:00] Advanced Action Plan
- [09:15] Conclusion & Takeaway

## 🚀 Call To Action
"If you enjoyed this breakdown, make sure to hit Subscribe on JTube and leave a comment below!"

## 🏷️ Top 15 SEO Tags
${topic}, tutorial, guide, education, learning, jtube, walkthrough, step by step, tips, 2026`;

  res.json({
    success: true,
    script: fallbackScript,
    source: 'template-generator'
  });
});

// 8. AI Title & SEO Tag Optimizer (for Admin Studio)
app.post('/api/ai/optimize-seo', async (req, res) => {
  const { title, description, category } = req.body || {};
  if (!title) return res.status(400).json({ error: 'Title required' });

  const gemini = getGeminiClient();
  if (gemini) {
    try {
      const prompt = `Act as an expert YouTube SEO optimizer.
Analyze this video:
Title: "${title}"
Description: "${description || ''}"
Category: "${category || 'General'}"

Generate:
1. 5 High-CTR YouTube Titles (engineered for click-through rate and curiosity).
2. Recommended Primary Category.
3. 20 High-Ranking SEO Tags separated by commas.
4. An engaging 2-sentence YouTube description hook.`;

      const response = await gemini.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt
      });

      return res.json({
        success: true,
        optimization: response.text,
        source: 'jtube-ai-engine'
      });
    } catch (e) {
      console.warn('Gemini SEO optimization failed:', e.message);
    }
  }

  res.json({
    success: true,
    optimization: `### 🎯 High-CTR Titles
1. ${title} - Everything You Need to Know
2. Why ${title} is Changing Everything
3. The Truth About ${title} (Explained)
4. Master ${title} Faster Than Ever
5. 5 Things You Didn't Know About ${title}

### 🏷️ Recommended Tags
${title.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(' ').slice(0, 5).join(', ')}, tutorial, jtube, guide, tips, viral`,
    source: 'heuristic-optimizer'
  });
});

// 9. Comment & Chat AI Moderation Check
app.post('/api/ai/moderate', async (req, res) => {
  const { text } = req.body || {};
  const localCheck = checkAbusiveContent(text);

  if (localCheck.isAbusive) {
    return res.json({
      isAbusive: true,
      action: 'delete',
      reason: localCheck.reason,
      source: 'ai-shield-rules'
    });
  }

  const gemini = getGeminiClient();
  if (gemini && text && text.trim().length > 3) {
    try {
      const modPrompt = `Analyze the following user comment on a video sharing platform:
"${text.replace(/"/g, "'")}"

Determine if this comment contains abuse, harassment, toxic insults, profanity, or hate speech.
Respond ONLY with a JSON object in this format:
{"isAbusive": boolean, "reason": "short reason if abusive or empty string"}`;

      const response = await gemini.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: modPrompt,
        config: { responseMimeType: 'application/json' }
      });

      const parsed = JSON.parse(response.text);
      return res.json({
        isAbusive: Boolean(parsed.isAbusive),
        action: parsed.isAbusive ? 'delete' : 'allow',
        reason: parsed.reason || (parsed.isAbusive ? 'Abusive language detected' : null),
        source: 'jtube-ai-engine'
      });
    } catch (e) {
      // Allow based on clean local check
    }
  }

  res.json({
    isAbusive: false,
    action: 'allow',
    reason: null,
    source: 'ai-shield-clean'
  });
});

// 10. AI Brain Training Status
app.get('/api/ai/brain-status', (req, res) => {
  const nextTrainingInSec = Math.max(0, Math.round((AIBrainState.lastTrained + 1200000 - Date.now()) / 1000));
  res.json({
    status: 'online',
    lastTrained: AIBrainState.lastTrained,
    videoCount: AIBrainState.videoCount,
    categories: AIBrainState.categoryCounts,
    nextTrainingInSec,
    intervalMinutes: 20,
    isTraining: AIBrainState.isTraining,
    channelsTracked: Object.keys(FEATURED_CHANNELS).length,
    dailyVideosCached: Array.from(syncedVideosMap.values()).filter(v => v.isDailyUpload).length
  });
});

// 11. Train AI Brain with Video Catalog
app.post('/api/ai/train', (req, res) => {
  const { videos } = req.body || {};
  const list = (Array.isArray(videos) && videos.length > 0) 
    ? videos 
    : Array.from(syncedVideosMap.values());

  if (list.length > 0) {
    const result = trainAIBrain(list);
    return res.json(result);
  }

  res.json({
    trained: false,
    message: 'No video catalog provided and no cached videos found',
    currentCount: AIBrainState.videoCount,
    lastTrained: AIBrainState.lastTrained
  });
});

// Serve static assets with support for .html extensions
app.use(express.static(path.join(__dirname, '.'), {
  extensions: ['html', 'htm']
}));

// Route fallback for root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Fallback to index.html for unrecognized routes
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`JTube server running at http://0.0.0.0:${PORT}`);
});
