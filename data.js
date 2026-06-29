const firebaseConfig = {
    apiKey: "AIzaSyBgLd_OmawpDrDxOkm8msclKUqoI5nPZMw",
    authDomain: "jeyatube.firebaseapp.com",
    projectId: "jeyatube",
    storageBucket: "jeyatube.firebasestorage.app",
    messagingSenderId: "89347367792",
    appId: "1:89347367792:web:cd7233e0aacc4e93fea5b5",
    measurementId: "G-8X0ZJVHE84"
};

// Initialize Firebase
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.firestore();
const rtdb = firebase.database();
const auth = firebase.auth();
const googleProvider = new firebase.auth.GoogleAuthProvider();

// ===== FIRESTORE PERSISTENCE & CACHE =====
// Enable offline persistence so reads come from cache first (instant loads)
db.enablePersistence({ synchronizeTabs: true }).catch(err => {
    if (err.code === 'failed-precondition') {
        console.warn('Persistence failed: Multiple tabs open.');
    } else if (err.code === 'unimplemented') {
        console.warn('Persistence not supported in this browser.');
    }
});

// In-memory cache for ultra-fast repeat reads within same session
const _cache = {
    videos: null,
    videosTimestamp: 0,
    channels: null,
    channelsTimestamp: 0,
    categories: null,
    categoriesTimestamp: 0,
    TTL: 120000 // 2 minutes cache TTL for snappy repeat reads
};

function isCacheValid(key) {
    return _cache[key] !== null && (Date.now() - _cache[key + 'Timestamp']) < _cache.TTL;
}

function invalidateCache(key) {
    _cache[key] = null;
    _cache[key + 'Timestamp'] = 0;
}

let currentUser = null;
auth.onAuthStateChanged(user => {
    currentUser = user;
    document.dispatchEvent(new CustomEvent('authStateChanged', { detail: user }));
});

async function loginWithEmail(email, password) {
    return await auth.signInWithEmailAndPassword(email, password);
}

async function registerWithEmail(email, password, name) {
    const cred = await auth.createUserWithEmailAndPassword(email, password);
    await cred.user.updateProfile({ displayName: name });
    await db.collection("users").doc(cred.user.uid).set({
        name: name,
        email: email,
        createdAt: Date.now()
    });
    return cred.user;
}

async function loginWithGoogle() {
    return await auth.signInWithPopup(googleProvider);
}

async function logoutUser() {
    return await auth.signOut();
}

// ===== VIDEO FUNCTIONS (Firestore + RTDB, cached) =====

async function getVideos() {
    if (isCacheValid('videos')) return _cache.videos;
    
    try {
        // Try RTDB first for ultra-fast loading
        const snapshot = await rtdb.ref('videos').once('value');
        if (snapshot.exists()) {
            let videos = [];
            snapshot.forEach(child => {
                videos.push(child.val());
            });
            videos.sort((a, b) => b.timestamp - a.timestamp);
            _cache.videos = videos;
            _cache.videosTimestamp = Date.now();
            return videos;
        }
    } catch (err) {
        console.warn("RTDB read failed, falling back to Firestore", err);
    }

    const snapshot = await db.collection("videos").orderBy("timestamp", "desc").get();
    let videos = [];
    snapshot.forEach(doc => {
        videos.push(doc.data());
    });
    _cache.videos = videos;
    _cache.videosTimestamp = Date.now();
    return videos;
}

async function getVideoById(videoId) {
    // Try cache first
    if (isCacheValid('videos')) {
        const cached = _cache.videos.find(v => v.id === videoId);
        if (cached) return cached;
    }
    
    try {
        // Try RTDB first for ultra-fast loading
        const snapshot = await rtdb.ref(`videos/${videoId}`).once('value');
        if (snapshot.exists()) {
            return snapshot.val();
        }
    } catch (err) {
        console.warn("RTDB read failed, falling back to Firestore", err);
    }
    
    // Direct Firestore lookup — much faster than fetching ALL videos
    const doc = await db.collection("videos").doc(videoId).get();
    return doc.exists ? doc.data() : null;
}

async function saveVideo(video) {
    if (!video.timestamp) video.timestamp = Date.now();
    // Write to both Firestore and RTDB in parallel
    await Promise.all([
        db.collection("videos").doc(video.id).set(video),
        rtdb.ref(`videos/${video.id}`).set(video)
    ]);
    invalidateCache('videos');
}

async function saveBatchVideos(videosArray) {
    // Firestore batch writes — up to 500 per batch, much faster than individual writes
    const batchSize = 450;
    const rtdbUpdates = {}; // RTDB batch updates

    for (let i = 0; i < videosArray.length; i += batchSize) {
        const batch = db.batch();
        const chunk = videosArray.slice(i, i + batchSize);
        chunk.forEach(video => {
            if (!video.timestamp) video.timestamp = Date.now();
            const ref = db.collection("videos").doc(video.id);
            batch.set(ref, video);
            
            // Collect RTDB updates
            rtdbUpdates[`videos/${video.id}`] = video;
        });
        await batch.commit();
    }
    
    // Save to RTDB for faster subsequent reads
    if (Object.keys(rtdbUpdates).length > 0) {
        await rtdb.ref().update(rtdbUpdates);
    }
    
    invalidateCache('videos');
}

async function deleteVideo(id) {
    // Delete from both in parallel
    await Promise.all([
        db.collection("videos").doc(id).delete(),
        rtdb.ref(`videos/${id}`).remove()
    ]);
    invalidateCache('videos');
}

// ===== CHANNEL FUNCTIONS (Firestore + RTDB, cached) =====

async function getChannels() {
    if (isCacheValid('channels')) return _cache.channels;
    
    try {
        // Try RTDB first for ultra-fast loading
        const snapshot = await rtdb.ref('channels').once('value');
        if (snapshot.exists()) {
            const channels = snapshot.val();
            _cache.channels = channels;
            _cache.channelsTimestamp = Date.now();
            return channels;
        }
    } catch (err) {
        console.warn("RTDB channels read failed, falling back to Firestore", err);
    }
    
    const snapshot = await db.collection("channels").get();
    let channels = {};
    snapshot.forEach(doc => {
        channels[doc.id] = doc.data();
    });
    _cache.channels = channels;
    _cache.channelsTimestamp = Date.now();
    return channels;
}

async function saveChannel(channelName, channelData) {
    // Write to both Firestore and RTDB in parallel for fast reads
    await Promise.all([
        db.collection("channels").doc(channelName).set(channelData, { merge: true }),
        rtdb.ref(`channels/${channelName}`).update(channelData)
    ]);
    invalidateCache('channels');
}

async function getChannel(channelName) {
    // Try cache first
    if (isCacheValid('channels') && _cache.channels[channelName]) {
        return _cache.channels[channelName];
    }
    
    try {
        // Try RTDB first
        const snapshot = await rtdb.ref(`channels/${channelName}`).once('value');
        if (snapshot.exists()) {
            return snapshot.val();
        }
    } catch (err) {
        console.warn("RTDB channel read failed, falling back to Firestore", err);
    }
    
    const doc = await db.collection("channels").doc(channelName).get();
    return doc.exists ? doc.data() : null;
}

async function getVideosByChannel(channelName) {
    // Use in-memory cache if available — avoids a Firestore query entirely
    if (isCacheValid('videos')) {
        return _cache.videos
            .filter(v => v.channel === channelName)
            .sort((a, b) => b.timestamp - a.timestamp);
    }
    
    const snapshot = await db.collection("videos").where("channel", "==", channelName).get();
    let videos = [];
    snapshot.forEach(doc => videos.push(doc.data()));
    return videos.sort((a, b) => b.timestamp - a.timestamp);
}

async function incrementView(videoId) {
    const videoRef = db.collection("videos").doc(videoId);
    await videoRef.update({
        views: firebase.firestore.FieldValue.increment(1)
    });
    // Also increment in RTDB (fire and forget for speed)
    rtdb.ref(`videos/${videoId}/views`).transaction(current => (current || 0) + 1);
    invalidateCache('videos');
}

async function getUserProfile(uid) {
    const doc = await db.collection("users").doc(uid).get();
    return doc.exists ? doc.data() : null;
}

async function updateUserProfile(uid, data) {
    await db.collection("users").doc(uid).set(data, { merge: true });
}

// User History functionality
async function addToHistory(video) {
    if (!currentUser) return;
    await db.collection("users").doc(currentUser.uid).collection("history").doc(video.id).set({
        id: video.id,
        title: video.title,
        channel: video.channel,
        thumbnail: video.thumbnail,
        duration: video.duration || "",
        views: video.views || "",
        time: video.time || "",
        videoUrl: video.videoUrl,
        timestamp: Date.now()
    });
}

async function getHistory() {
    if (!currentUser) return [];
    const snapshot = await db.collection("users").doc(currentUser.uid).collection("history").orderBy("timestamp", "desc").get();
    let history = [];
    snapshot.forEach(doc => {
        let data = doc.data();
        if(!data.views) data.views = 0; // Fix legacy string views in UI
        history.push(data);
    });
    return history;
}

async function getPlaylists() {
    // Use cache to avoid extra Firestore query
    if (isCacheValid('videos')) {
        let playlistsMap = {};
        _cache.videos.forEach(data => {
            if (data.playlist && data.playlist.trim() !== "") {
                if (!playlistsMap[data.playlist]) {
                    playlistsMap[data.playlist] = { name: data.playlist, videos: [], thumbnail: data.thumbnail, channel: data.channel };
                }
                playlistsMap[data.playlist].videos.push(data);
            }
        });
        return Object.values(playlistsMap);
    }
    
    const snapshot = await db.collection("videos").where("playlist", "!=", "").get();
    let playlistsMap = {};
    snapshot.forEach(doc => {
        const data = doc.data();
        if (data.playlist) {
            if (!playlistsMap[data.playlist]) {
                playlistsMap[data.playlist] = { name: data.playlist, videos: [], thumbnail: data.thumbnail, channel: data.channel };
            }
            playlistsMap[data.playlist].videos.push(data);
        }
    });
    return Object.values(playlistsMap);
}

// ===== CATEGORIES =====

async function getCategories() {
    if (isCacheValid('categories')) return _cache.categories;

    const snapshot = await db.collection("categories").orderBy("order").get();
    let categories = [];
    snapshot.forEach(doc => {
        categories.push({ id: doc.id, ...doc.data() });
    });
    _cache.categories = categories;
    _cache.categoriesTimestamp = Date.now();
    return categories;
}

async function saveCategory(category) {
    if (!category.id) {
        category.id = category.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
    }
    await db.collection("categories").doc(category.id).set(category);
    invalidateCache('categories');
}

async function deleteCategory(categoryId) {
    await db.collection("categories").doc(categoryId).delete();
    invalidateCache('categories');
}

// Extract YouTube ID
function getYoutubeId(url) {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
}

// Parse text to convert URLs to bright links
function parseLinks(text) {
    if (!text) return "";
    // Regular expression to find URLs
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    return text.replace(urlRegex, function(url) {
        return `<a href="${url}" target="_blank" class="text-blue-400 hover:text-blue-300 font-semibold underline break-all">${url}</a>`;
    });
}

function timeAgo(timestamp) {
    if (!timestamp) return "Just now";
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    let interval = seconds / 31536000;
    if (interval >= 1) {
        const val = Math.floor(interval);
        return val + (val === 1 ? " year ago" : " years ago");
    }
    interval = seconds / 2592000;
    if (interval >= 1) {
        const val = Math.floor(interval);
        return val + (val === 1 ? " month ago" : " months ago");
    }
    interval = seconds / 86400;
    if (interval >= 1) {
        const val = Math.floor(interval);
        return val + (val === 1 ? " day ago" : " days ago");
    }
    interval = seconds / 3600;
    if (interval >= 1) {
        const val = Math.floor(interval);
        return val + (val === 1 ? " hour ago" : " hours ago");
    }
    interval = seconds / 60;
    if (interval >= 1) {
        const val = Math.floor(interval);
        return val + (val === 1 ? " minute ago" : " minutes ago");
    }
    return "Just now";
}

// Format number concisely (e.g. 1.2M, 15K)
function formatCompactNumber(number) {
    if (number === undefined || number === null) return "0";
    const num = parseInt(number, 10);
    if (isNaN(num)) return "0";
    return new Intl.NumberFormat('en-US', { notation: "compact", maximumFractionDigits: 1 }).format(num);
}

// Seed initial data if empty
async function initializeDatabase() {
    try {
        const videos = await getVideos();
        if (videos.length === 0) {
            console.log("Seeding initial database...");
            const initialVideos = [
                {
                    id: "1",
                    title: "The Future of Artificial Intelligence in 2026",
                    channel: "AI Frontier",
                    category: "AI",
                    playlist: "AI Masterclass 2026",
                    views: 125000,
                    time: "2 days ago",
                    duration: "10:15",
                    thumbnail: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=500&auto=format&fit=crop&q=60",
                    videoUrl: "https://www.youtube.com/watch?v=60Yo63VFt-M", 
                    description: "An in-depth look into how AI and Machine Learning are transforming our daily lives in 2026.",
                    likes: 4500,
                    liked: false,
                    comments: [
                        { username: "Rahat", text: "Brilliant explanation! Looking forward to more ML content." }
                    ],
                    timestamp: Date.now()
                },
                {
                    id: "2",
                    title: "Understanding the Golden Age of Islamic Science",
                    channel: "Heritage & Science",
                    category: "Islam",
                    playlist: "",
                    views: 89000,
                    time: "1 week ago",
                    duration: "15:40",
                    thumbnail: "https://images.unsplash.com/photo-1542838132-92c53300491e?w=500&auto=format&fit=crop&q=60",
                    videoUrl: "https://www.youtube.com/watch?v=60Yo63VFt-M",
                    description: "Exploring the historic contributions of Muslim scientists to modern physics, medicine, and mathematics.",
                    likes: 3200,
                    liked: false,
                    comments: [],
                    timestamp: Date.now() - 1000
                },
                {
                    id: "3",
                    title: "Introduction to Neural Networks from Scratch",
                    channel: "Tech Minds",
                    category: "Machine Learning",
                    playlist: "Deep Learning Series",
                    views: 45000,
                    time: "3 days ago",
                    duration: "12:20",
                    thumbnail: "https://images.unsplash.com/photo-1509228468518-180dd4864904?w=500&auto=format&fit=crop&q=60",
                    videoUrl: "https://www.youtube.com/watch?v=60Yo63VFt-M",
                    description: "Learn how weights, biases, and activation functions work in a basic neural network.",
                    likes: 1200,
                    liked: false,
                    comments: [],
                    timestamp: Date.now() - 2000
                }
            ];
            for (let vid of initialVideos) {
                await saveVideo(vid);
            }
            
            const initialChannels = {
                "AI Frontier": { subscribers: 50000, subscribed: false, coverUrl: "https://images.unsplash.com/photo-1620712943543-bcc4688e7485?w=1200&h=300&fit=crop", avatarUrl: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&h=100&fit=crop" },
                "Heritage & Science": { subscribers: 34000, subscribed: false, coverUrl: "https://images.unsplash.com/photo-1519817650390-64a4560f3290?w=1200&h=300&fit=crop", avatarUrl: "https://images.unsplash.com/photo-1527980965255-d3b416303d12?w=100&h=100&fit=crop" },
                "Tech Minds": { subscribers: 12000, subscribed: false, coverUrl: "https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=1200&h=300&fit=crop", avatarUrl: "https://images.unsplash.com/photo-1599566150163-29194dcaad36?w=100&h=100&fit=crop" }
            };
            for (let [name, data] of Object.entries(initialChannels)) {
                await saveChannel(name, data);
            }
        }
        
        // Initialize default categories if not exists
        const categories = await getCategories();
        if (categories.length === 0) {
            const defaultCats = [
                { name: "Islam", order: 1 },
                { name: "Science", order: 2 },
                { name: "AI", order: 3 },
                { name: "Machine Learning", order: 4 },
                { name: "Entertainment", order: 5 }
            ];
            for (let cat of defaultCats) {
                await saveCategory(cat);
            }
        }
    } catch (error) {
        console.error("Database initialization failed.", error);
    }
}

// Only seed initial data once per browser session to avoid blocking every page load
if (!sessionStorage.getItem('jtube_db_init')) {
    sessionStorage.setItem('jtube_db_init', '1');
    initializeDatabase(); // non-blocking: no await
}

// ===== AUTO-SYNC YOUTUBE CHANNELS & STATS =====
async function autoSyncYouTubeChannels() {
    const apiKey = typeof ENV !== 'undefined' ? ENV.YOUTUBE_API_KEY : null;
    if (!apiKey) return;

    try {
        const channels = await getChannels();
        const now = Date.now();
        const SYNC_INTERVAL = 12 * 60 * 60 * 1000; // 12 hours between syncs
        let hasUpdates = false;
        const allVideos = await getVideos(); // Fetch all once for fast lookup

        for (const [channelName, data] of Object.entries(channels)) {
            // Only sync if configured and past the interval
            if ((data.ytChannelId || data.ytPlaylistId) && (!data.lastSyncTime || (now - data.lastSyncTime > SYNC_INTERVAL))) {
                console.log(`Auto-syncing YouTube channel & stats: ${channelName}`);
                
                let playlistId = data.ytPlaylistId;
                let ytChannelId = data.ytChannelId;
                
                // 1. Sync Channel Subscribers & Get Playlist ID if needed
                if (ytChannelId) {
                    try {
                        const res = await fetch(`https://www.googleapis.com/youtube/v3/channels?part=contentDetails,statistics&id=${ytChannelId}&key=${apiKey}`);
                        const cData = await res.json();
                        if (cData.items && cData.items.length > 0) {
                            const item = cData.items[0];
                            if (!playlistId) {
                                playlistId = item.contentDetails.relatedPlaylists.uploads;
                                data.ytPlaylistId = playlistId; // Cache it
                            }
                            // Update subscribers from YouTube
                            if (item.statistics && item.statistics.subscriberCount) {
                                data.subscribers = parseInt(item.statistics.subscriberCount);
                            }
                        }
                    } catch (e) { console.warn("Error syncing channel stats", e); }
                }

                // 2. Fetch new videos from Playlist
                if (playlistId) {
                    try {
                        // Fetch latest 15 videos to save quota
                        const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&maxResults=15&playlistId=${playlistId}&key=${apiKey}`;
                        const res = await fetch(url);
                        const pData = await res.json();
                        
                        if (pData.items && pData.items.length > 0) {
                            const videoIds = pData.items.map(item => item.contentDetails.videoId).filter(Boolean).join(',');
                            
                            const vidRes = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=contentDetails,statistics&id=${videoIds}&key=${apiKey}`);
                            const vidData = await vidRes.json();
                            
                            const durationMap = {};
                            const statsMap = {};
                            if (vidData.items) {
                                vidData.items.forEach(v => { 
                                    durationMap[v.id] = v.contentDetails.duration; 
                                    statsMap[v.id] = v.statistics || {};
                                });
                            }

                            const existingIds = new Set(allVideos.map(v => v.id));
                            const newVideos = [];

                            for (const item of pData.items) {
                                const snippet = item.snippet;
                                const videoId = snippet.resourceId ? snippet.resourceId.videoId : (item.contentDetails ? item.contentDetails.videoId : '');
                                if (!videoId) continue;
                                
                                const docId = "yt_" + videoId;
                                if (existingIds.has(docId)) continue; // Already exists

                                const dStr = durationMap[videoId];
                                if (!dStr) continue;
                                
                                // Parse duration
                                let totalSeconds = 0;
                                const match = dStr.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
                                if (match) {
                                    totalSeconds = (parseInt(match[1] || 0) * 3600) + (parseInt(match[2] || 0) * 60) + parseInt(match[3] || 0);
                                }
                                if (totalSeconds < 60) continue; // Skip shorts < 1m

                                // Format duration
                                const h = Math.floor(totalSeconds / 3600);
                                const m = Math.floor((totalSeconds % 3600) / 60);
                                const s = totalSeconds % 60;
                                const durationText = h > 0 ? `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}` : `${m}:${s.toString().padStart(2, '0')}`;

                                const stats = statsMap[videoId] || {};

                                newVideos.push({
                                    id: docId,
                                    title: snippet.title,
                                    channel: channelName,
                                    category: data.syncCategory || "General",
                                    playlist: "",
                                    views: parseInt(stats.viewCount || 0),
                                    time: "Just now",
                                    duration: durationText,
                                    thumbnail: snippet.thumbnails?.high?.url || snippet.thumbnails?.medium?.url || snippet.thumbnails?.default?.url || "",
                                    videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
                                    description: snippet.description || "Imported automatically from YouTube",
                                    likes: parseInt(stats.likeCount || 0),
                                    liked: false,
                                    comments: [],
                                    timestamp: new Date(snippet.publishedAt).getTime()
                                });
                            }

                            if (newVideos.length > 0) {
                                await saveBatchVideos(newVideos);
                                console.log(`Auto-synced ${newVideos.length} new videos for ${channelName}!`);
                                hasUpdates = true;
                                allVideos.push(...newVideos); // Add to local array so stats sync sees them if needed
                            }
                        }
                    } catch (e) { console.warn("Error during auto-sync fetch for " + channelName, e); }
                }

                // 3. Sync stats for existing videos belonging to this channel
                const channelVideos = allVideos.filter(v => v.channel === channelName && v.id.startsWith("yt_"));
                if (channelVideos.length > 0) {
                    console.log(`Syncing YouTube stats for ${channelVideos.length} existing videos of ${channelName}...`);
                    const chunkedVideos = [];
                    for(let i=0; i < channelVideos.length; i+=50) {
                        chunkedVideos.push(channelVideos.slice(i, i+50));
                    }
                    
                    const updatedVideos = [];
                    for(const chunk of chunkedVideos) {
                        const ytIds = chunk.map(v => v.id.replace("yt_", "")).join(',');
                        try {
                            const statsRes = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${ytIds}&key=${apiKey}`);
                            const statsData = await statsRes.json();
                            if (statsData.items) {
                                statsData.items.forEach(ytVid => {
                                    const jtubeVid = chunk.find(v => v.id === `yt_${ytVid.id}`);
                                    if (jtubeVid && ytVid.statistics) {
                                        const newViews = parseInt(ytVid.statistics.viewCount || jtubeVid.views);
                                        const newLikes = parseInt(ytVid.statistics.likeCount || jtubeVid.likes);
                                        if (jtubeVid.views !== newViews || jtubeVid.likes !== newLikes) {
                                            jtubeVid.views = newViews;
                                            jtubeVid.likes = newLikes;
                                            updatedVideos.push(jtubeVid);
                                        }
                                    }
                                });
                            }
                        } catch(e) { console.warn("Error syncing video stats batch", e); }
                    }
                    
                    if (updatedVideos.length > 0) {
                        await saveBatchVideos(updatedVideos);
                        hasUpdates = true;
                        console.log(`Updated YouTube stats for ${updatedVideos.length} videos of ${channelName}.`);
                    }
                }

                // Update sync time
                await saveChannel(channelName, { ...data, lastSyncTime: Date.now() });
            }
        }

        if (hasUpdates && typeof renderVideos === 'function') {
            renderVideos("all"); // Refresh UI if on homepage
        }
    } catch (e) {
        console.error("Auto-sync background process failed:", e);
    }
}

// Fetch and append country code to logo — fully non-blocking
document.addEventListener('DOMContentLoaded', () => {
    // Start YouTube background sync 5 seconds after page load (only once per session)
    if (!sessionStorage.getItem('jtube_yt_sync')) {
        sessionStorage.setItem('jtube_yt_sync', '1');
        setTimeout(() => {
            autoSyncYouTubeChannels();
        }, 5000); 
    }

    setTimeout(() => {
        fetch('https://api.country.is')
            .then(res => res.json())
            .then(data => {
                if (data.country) {
                    const brandLogos = document.querySelectorAll('.brand-logo-text');
                    brandLogos.forEach(logo => {
                        const span = document.createElement('span');
                        span.className = 'text-[10px] text-zinc-400 font-medium ml-1 self-start mt-0.5';
                        span.textContent = data.country;
                        logo.parentElement.appendChild(span);
                    });
                }
            })
            .catch(() => {}); // Silently ignore
    }, 2000); // Defer 2 seconds so it never blocks page load

    // ===== TOAST NOTIFICATION SYSTEM =====
    let toastContainer = document.getElementById('toast-container');
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'toast-container';
        document.body.appendChild(toastContainer);
    }

    // ===== SCROLL-TO-TOP BUTTON =====
    const scrollBtn = document.createElement('button');
    scrollBtn.id = 'scroll-to-top';
    scrollBtn.innerHTML = '<i class="fas fa-arrow-up"></i>';
    scrollBtn.title = 'Back to top';
    scrollBtn.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    document.body.appendChild(scrollBtn);

    window.addEventListener('scroll', () => {
        if (window.scrollY > 400) {
            scrollBtn.classList.add('visible');
        } else {
            scrollBtn.classList.remove('visible');
        }
    }, { passive: true });
});

// ===== GLOBAL TOAST FUNCTION =====
// Usage: showToast('Message', 'success') — types: success, error, info, warning
function showToast(message, type = 'info', duration = 3500) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const icons = {
        success: 'fa-circle-check',
        error: 'fa-circle-xmark',
        info: 'fa-circle-info',
        warning: 'fa-triangle-exclamation'
    };

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<i class="fas ${icons[type] || icons.info}"></i><span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('toast-out');
        toast.addEventListener('animationend', () => toast.remove());
    }, duration);
}

// ===== DURATION BADGE CLASS HELPER =====
function getDurationBadgeClass(durationStr) {
    if (!durationStr) return '';
    const parts = durationStr.split(':').map(Number);
    let totalMinutes = 0;
    if (parts.length === 3) totalMinutes = parts[0] * 60 + parts[1];
    else if (parts.length === 2) totalMinutes = parts[0];
    if (totalMinutes < 5) return 'duration-short';
    if (totalMinutes >= 30) return 'duration-long';
    return 'duration-medium';
}