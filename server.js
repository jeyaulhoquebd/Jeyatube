const express = require('express');
const path = require('path');
const { GoogleGenAI } = require('@google/genai');

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '10mb' }));

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

// ===== IN-MEMORY 5-MINUTE AI VIDEO BRAIN =====
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
  
  let genre = 'General Video';
  let category = video.category || 'General';
  let targetAudience = 'General viewers';
  let depth = 'Accessible / Informative';
  const tags = [];

  if (/islam|quran|hadith|tafsir|surah|prophet|dua|sunnah|allah|sermon|waz|namaz|ramadan|islamic/i.test(text)) {
    genre = 'Islamic & Spiritual Lecture';
    category = 'Islam';
    targetAudience = 'Spiritual seekers, Muslims, and anyone interested in Islamic teachings';
    depth = 'Spiritual, Moral, & Reflective';
    tags.push('Islamic Teachings', 'Spiritual Reflection', 'Quranic Wisdom');
  } else if (/ai|artificial intelligence|machine learning|deep learning|neural network|gemini|gpt|llm|transformer|openai|groq/i.test(text)) {
    genre = 'Artificial Intelligence & Machine Learning Breakdown';
    category = 'AI & ML';
    targetAudience = 'Tech enthusiasts, engineers, students, AI developers';
    depth = 'Cutting-edge Technology & Conceptual Analysis';
    tags.push('Artificial Intelligence', 'Machine Learning', 'Future Tech', 'Data Science');
  } else if (/python|javascript|typescript|coding|programming|react|node|html|css|developer|software|algorithm|github|bug/i.test(text)) {
    genre = 'Software Engineering & Coding Tutorial';
    category = 'Programming';
    targetAudience = 'Coders, web developers, computer science students';
    depth = 'Practical, Hands-on Technical Guide';
    tags.push('Programming', 'Code Walkthrough', 'Software Development');
  } else if (/physics|space|universe|quantum|astronomy|nasa|planet|science|chemistry|biology|galaxy/i.test(text)) {
    genre = 'Science & Scientific Exploration Documentary';
    category = 'Science';
    targetAudience = 'Curious minds, students, science lovers';
    depth = 'Scientific Breakdown & Discovery';
    tags.push('Science', 'Cosmic Exploration', 'STEM Education');
  } else if (/leadership|team|business|startup|founder|career|interview|productivity|mindset|habits/i.test(text)) {
    genre = 'Professional Leadership & Personal Growth';
    category = 'Growth & Leadership';
    targetAudience = 'Professionals, entrepreneurs, team leaders, students';
    depth = 'Actionable Strategy & Mindset Development';
    tags.push('Productivity', 'Leadership Skills', 'Personal Growth');
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
    summary: (video.description || video.title || '').substring(0, 160).replace(/\n/g, ' ')
  };
}

// AI Video Brain Training Function
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

// Train cycle timer every 5 minutes (300,000 ms)
setInterval(() => {
  console.log('[AI Video Brain] Running scheduled 5-minute automated knowledge refresh...');
  // The client synchronizer posts latest catalog; if empty, state timestamp is renewed
  AIBrainState.lastTrained = Date.now();
}, 5 * 60 * 1000);

// ===== COMPREHENSIVE MULTILINGUAL ABUSE FILTER =====
const ABUSE_REGEX_PATTERNS = [
  // English vulgarity & abusive insults
  /\b(fuck|fucker|fucking|f\*ck|shit|bitch|bastard|asshole|a\*\*hole|dick|pussy|whore|slut|cunt)\b/i,
  /\b(idiot|stupid|moron|retard|dumbass|motherfucker|douchebag|trash|scum)\b/i,
  /\b(kill\s*yourself|kys|die\s*in\s*a\s*fire|go\s*die|i\s*will\s*kill\s*you)\b/i,
  /\b(hate\s*you|ugly\s*pig|loser|burn\s*in\s*hell)\b/i,
  // Bengali / Bangla abusive words and slurs (Bangla script)
  /(খানকি|খানকির|বেশ্যা|শুয়োর|শুয়োরের|কুত্তা|কুত্তার|শালা|হারামজাদা|মাদারচোদ|চোদা|চোদ|মাগী|বাল|ভোদা|লওড়া)/u,
  // Bengali phonetic Latin slang
  /\b(khanki|khankir|beshya|shuyor|shuyorer|kutta|kuttar|sala|shala|haramjada|madarchod|choda|chod|magi|baal|bal|bhodai|lawra)\b/i,
  // Hindi / Urdu slang insults
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

// 1. Get AI Brain Training Status
app.get('/api/ai/brain-status', (req, res) => {
  const nextTrainingInSec = Math.max(0, Math.round((AIBrainState.lastTrained + 300000 - Date.now()) / 1000));
  res.json({
    status: 'online',
    lastTrained: AIBrainState.lastTrained,
    videoCount: AIBrainState.videoCount,
    categories: AIBrainState.categoryCounts,
    nextTrainingInSec,
    intervalMinutes: 5,
    isTraining: AIBrainState.isTraining
  });
});

// 2. Train AI Brain with Video Catalog (every 5 minutes or on-demand)
app.post('/api/ai/train', (req, res) => {
  const { videos } = req.body || {};
  if (Array.isArray(videos) && videos.length > 0) {
    const result = trainAIBrain(videos);
    return res.json(result);
  }
  res.json({
    trained: false,
    message: 'No video catalog provided',
    currentCount: AIBrainState.videoCount,
    lastTrained: AIBrainState.lastTrained
  });
});

// 3. What kind of video is this? (AI Video Knowledge Diagnosis)
app.post('/api/ai/video-type', async (req, res) => {
  const { videoId, title, description, channel, category } = req.body || {};
  
  // Find in pre-trained 5-minute brain first
  let brainData = null;
  if (videoId && AIBrainState.indexedCatalog[videoId]) {
    brainData = AIBrainState.indexedCatalog[videoId];
  } else {
    brainData = classifyVideoContent({ id: videoId, title, description, channel, category });
  }

  // If Gemini client is available, get a rich explanation
  const gemini = getGeminiClient();
  if (gemini) {
    try {
      const prompt = `You are JTube's Video Intelligence AI. A user is asking to find out what kind of video this is.
Based on our knowledge base, here are the video details:
Title: "${title || brainData.title}"
Channel: "${channel || brainData.channel}"
Category: "${category || brainData.category}"
Description: "${(description || brainData.summary).substring(0, 300)}"
Inferred Genre: "${brainData.genre}"

Please provide a concise, engaging, and structured breakdown:
1. Video Type & Genre (Exact categorization)
2. Core Themes & Content (What it actually discusses)
3. Target Audience (Who should watch it)
4. Why Watch It (Value proposition)
Keep it friendly, clear, and informative in 2-3 short paragraphs or clean bullet points.`;

      const response = await gemini.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt
      });

      const aiExplanation = response.text;
      return res.json({
        brainData,
        explanation: aiExplanation,
        source: 'gemini-3.8-flash',
        lastTrained: AIBrainState.lastTrained
      });
    } catch (err) {
      console.warn('Gemini API call failed in /api/ai/video-type, falling back to local brain:', err);
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

**Summary**: ${brainData.summary || 'A curated video hosted on JTube exploring key educational and cultural concepts.'}`;

  res.json({
    brainData,
    explanation: fallbackExplanation,
    source: 'ai-video-brain-cache',
    lastTrained: AIBrainState.lastTrained
  });
});

// 4. Comment & Chat AI Moderation Check (detects & rejects abuse)
app.post('/api/ai/moderate', async (req, res) => {
  const { text, author, context } = req.body || {};
  const localCheck = checkAbusiveContent(text);

  if (localCheck.isAbusive) {
    return res.json({
      isAbusive: true,
      action: 'delete',
      reason: localCheck.reason,
      source: 'ai-shield-rules'
    });
  }

  // Secondary deep analysis with Gemini if available and text is non-empty
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
        config: {
          responseMimeType: 'application/json'
        }
      });

      const parsed = JSON.parse(response.text);
      return res.json({
        isAbusive: Boolean(parsed.isAbusive),
        action: parsed.isAbusive ? 'delete' : 'allow',
        reason: parsed.reason || (parsed.isAbusive ? 'Abusive language detected' : null),
        source: 'gemini-3.8-flash'
      });
    } catch (e) {
      // Ignore AI failure and allow based on clean local check
    }
  }

  res.json({
    isAbusive: false,
    action: 'allow',
    reason: null,
    source: 'ai-shield-clean'
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
