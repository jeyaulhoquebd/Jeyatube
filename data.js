const firebaseConfig = {
    apiKey: "AIzaSyBgLd_OmawpDrDxOkm8msclKUqoI5nPZMw",
    authDomain: "jeyatube.firebaseapp.com",
    databaseURL: "https://jeyatube-default-rtdb.firebaseio.com",
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

// In-memory cache & persistent localStorage helper for instant loading
function loadFromStorage(key, fallback) {
    try {
        if (typeof localStorage !== 'undefined') {
            const stored = localStorage.getItem('jtube_' + key);
            if (stored) {
                const parsed = JSON.parse(stored);
                if (parsed && (Array.isArray(parsed) ? parsed.length > 0 : Object.keys(parsed).length > 0)) {
                    return parsed;
                }
            }
        }
    } catch (e) {}
    return fallback;
}

function saveToStorage(key, data) {
    try {
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem('jtube_' + key, JSON.stringify(data));
        }
    } catch (e) {}
}

const seedData = (typeof window !== 'undefined' && window.JEYA_INITIAL_DATA) ? window.JEYA_INITIAL_DATA : {};
const initialVideos = seedData.videos || [
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
    }
];

const initialChannels = seedData.channels || {
    "AI Frontier": { subscribers: 50000, subscribed: false, coverUrl: "https://images.unsplash.com/photo-1620712943543-bcc4688e7485?w=1200&h=300&fit=crop", avatarUrl: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&h=100&fit=crop" }
};

const defaultCats = seedData.categories || [
    { id: "islam", name: "Islam", order: 1 },
    { id: "science", name: "Science", order: 2 },
    { id: "ai", name: "AI", order: 3 },
    { id: "machine-learning", name: "Machine Learning", order: 4 },
    { id: "entertainment", name: "Entertainment", order: 5 }
];

const _cache = {
    videos: loadFromStorage('videos', initialVideos),
    videosTimestamp: Date.now(),
    channels: loadFromStorage('channels', initialChannels),
    channelsTimestamp: Date.now(),
    categories: loadFromStorage('categories', defaultCats),
    categoriesTimestamp: Date.now(),
    TTL: 180000 // 3 minutes cache TTL
};

function isCacheValid(key) {
    return _cache[key] !== null && (Date.now() - _cache[key + 'Timestamp']) < _cache.TTL;
}

function invalidateCache(key) {
    _cache[key] = null;
    _cache[key + 'Timestamp'] = 0;
    try {
        if (typeof localStorage !== 'undefined') {
            localStorage.removeItem('jtube_' + key);
        }
    } catch (e) {}
}

let currentUser = null;
auth.onAuthStateChanged(user => {
    currentUser = user;
    if (typeof window !== 'undefined') window.currentUser = user;
    document.dispatchEvent(new CustomEvent('authStateChanged', { detail: user }));
});

function getCurrentUser() {
    return currentUser || (typeof window !== 'undefined' ? window.currentUser : null);
}

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

// ===== VIDEO FUNCTIONS (Instant Cache-First + Background Firestore Sync) =====

let _isFetchingVideos = false;
async function fetchVideosFromFirestore() {
    if (_isFetchingVideos) return;
    _isFetchingVideos = true;
    try {
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 4000));
        const fetchPromise = db.collection("videos").orderBy("timestamp", "desc").get();
        const snapshot = await Promise.race([fetchPromise, timeoutPromise]);
        
        let freshVideos = [];
        snapshot.forEach(doc => {
            freshVideos.push(doc.data());
        });
        if (freshVideos.length > 0) {
            _cache.videos = freshVideos;
            _cache.videosTimestamp = Date.now();
            saveToStorage('videos', freshVideos);
            if (typeof document !== 'undefined') {
                document.dispatchEvent(new CustomEvent('jtube:videosUpdated', { detail: freshVideos }));
            }
        }
    } catch (err) {
        console.warn("Background Firestore videos fetch:", err.message || err);
    } finally {
        _isFetchingVideos = false;
    }
}

async function getVideos() {
    // 1. In-memory cache: return INSTANTLY (0ms)
    if (_cache.videos && _cache.videos.length > 0) {
        fetchVideosFromFirestore(); // background sync
        return _cache.videos;
    }
    
    // 2. LocalStorage cache
    const stored = loadFromStorage('videos', null);
    if (stored && stored.length > 0) {
        _cache.videos = stored;
        _cache.videosTimestamp = Date.now();
        fetchVideosFromFirestore();
        return stored;
    }

    // 3. First-run fallback: seed data
    if (initialVideos && initialVideos.length > 0) {
        _cache.videos = initialVideos;
        _cache.videosTimestamp = Date.now();
        fetchVideosFromFirestore();
        return initialVideos;
    }

    // 4. Await fresh fetch if no cache available
    await fetchVideosFromFirestore();
    return (_cache.videos && _cache.videos.length > 0) ? _cache.videos : initialVideos;
}

async function getVideoById(videoId) {
    if (!videoId) return null;
    // 1. Try cache
    if (_cache.videos && _cache.videos.length > 0) {
        const cached = _cache.videos.find(v => v.id === videoId);
        if (cached) return cached;
    }
    const stored = loadFromStorage('videos', []);
    const local = stored.find(v => v.id === videoId);
    if (local) return local;

    // 2. Direct Firestore lookup with fast timeout
    try {
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000));
        const doc = await Promise.race([db.collection("videos").doc(videoId).get(), timeoutPromise]);
        if (doc && doc.exists) return doc.data();
    } catch (err) {
        console.warn("Firestore video lookup failed", err);
    }
    return initialVideos.find(v => v.id === videoId) || null;
}

async function saveVideo(video) {
    if (!video.timestamp) video.timestamp = Date.now();
    await db.collection("videos").doc(video.id).set(video);
    try { rtdb.ref(`videos/${video.id}`).set(video); } catch (e) {}
    
    // Update local cache immediately
    if (_cache.videos) {
        const idx = _cache.videos.findIndex(v => v.id === video.id);
        if (idx >= 0) _cache.videos[idx] = video;
        else _cache.videos.unshift(video);
        saveToStorage('videos', _cache.videos);
    }
    invalidateCache('videos');
}

async function saveBatchVideos(videosArray) {
    const batchSize = 450;
    for (let i = 0; i < videosArray.length; i += batchSize) {
        const batch = db.batch();
        const chunk = videosArray.slice(i, i + batchSize);
        chunk.forEach(video => {
            if (!video.timestamp) video.timestamp = Date.now();
            const ref = db.collection("videos").doc(video.id);
            batch.set(ref, video);
        });
        await batch.commit();
    }
    invalidateCache('videos');
}

async function deleteVideo(id) {
    if (!id) return;
    // 1. Delete from Firestore
    await db.collection("videos").doc(id).delete();
    // 2. Delete from RTDB
    try { rtdb.ref(`videos/${id}`).remove(); } catch (e) {}
    // 3. Update memory and local persistent storage
    if (_cache.videos) {
        _cache.videos = _cache.videos.filter(v => v.id !== id);
        saveToStorage('videos', _cache.videos);
    }
    invalidateCache('videos');
    if (typeof document !== 'undefined') {
        document.dispatchEvent(new CustomEvent('jtube:videosUpdated', { detail: _cache.videos || [] }));
    }
}

async function deleteBatchVideos(idsArray) {
    if (!Array.isArray(idsArray) || idsArray.length === 0) return { success: true, count: 0 };
    
    // 1. Batch delete from Firestore in chunks of up to 450 (Firestore batch limit is 500)
    const batchSize = 450;
    for (let i = 0; i < idsArray.length; i += batchSize) {
        const batch = db.batch();
        const chunk = idsArray.slice(i, i + batchSize);
        chunk.forEach(id => {
            if (id) {
                const ref = db.collection("videos").doc(id);
                batch.delete(ref);
            }
        });
        await batch.commit();
    }

    // 2. Delete from RTDB
    try {
        const rtdbRemovals = {};
        idsArray.forEach(id => {
            if (id) rtdbRemovals[`videos/${id}`] = null;
        });
        if (Object.keys(rtdbRemovals).length > 0) {
            await rtdb.ref().update(rtdbRemovals);
        }
    } catch (e) {}

    // 3. Update memory and local persistent storage
    const idSet = new Set(idsArray);
    if (_cache.videos) {
        _cache.videos = _cache.videos.filter(v => !idSet.has(v.id));
        saveToStorage('videos', _cache.videos);
    }
    invalidateCache('videos');

    if (typeof document !== 'undefined') {
        document.dispatchEvent(new CustomEvent('jtube:videosUpdated', { detail: _cache.videos || [] }));
    }

    return { success: true, count: idsArray.length };
}

// ===== CHANNEL FUNCTIONS (Instant Cache-First + Background Firestore Sync) =====

let _isFetchingChannels = false;
async function fetchChannelsFromFirestore() {
    if (_isFetchingChannels) return;
    _isFetchingChannels = true;
    try {
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 4000));
        const fetchPromise = db.collection("channels").get();
        const snapshot = await Promise.race([fetchPromise, timeoutPromise]);
        
        let freshChannels = {};
        snapshot.forEach(doc => {
            freshChannels[doc.id] = doc.data();
        });
        if (Object.keys(freshChannels).length > 0) {
            _cache.channels = freshChannels;
            _cache.channelsTimestamp = Date.now();
            saveToStorage('channels', freshChannels);
            if (typeof document !== 'undefined') {
                document.dispatchEvent(new CustomEvent('jtube:channelsUpdated', { detail: freshChannels }));
            }
        }
    } catch (err) {
        console.warn("Background Firestore channels fetch:", err.message || err);
    } finally {
        _isFetchingChannels = false;
    }
}

async function getChannels() {
    if (_cache.channels && Object.keys(_cache.channels).length > 0) {
        fetchChannelsFromFirestore();
        return _cache.channels;
    }
    const stored = loadFromStorage('channels', null);
    if (stored && Object.keys(stored).length > 0) {
        _cache.channels = stored;
        _cache.channelsTimestamp = Date.now();
        fetchChannelsFromFirestore();
        return stored;
    }
    if (initialChannels && Object.keys(initialChannels).length > 0) {
        _cache.channels = initialChannels;
        _cache.channelsTimestamp = Date.now();
        fetchChannelsFromFirestore();
        return initialChannels;
    }
    await fetchChannelsFromFirestore();
    return (_cache.channels && Object.keys(_cache.channels).length > 0) ? _cache.channels : initialChannels;
}

async function saveChannel(channelName, channelData) {
    await db.collection("channels").doc(channelName).set(channelData, { merge: true });
    try { rtdb.ref(`channels/${channelName}`).update(channelData); } catch (e) {}
    if (_cache.channels) {
        _cache.channels[channelName] = { ...(_cache.channels[channelName] || {}), ...channelData };
        saveToStorage('channels', _cache.channels);
    }
    invalidateCache('channels');
}

async function getChannel(channelName) {
    if (_cache.channels && _cache.channels[channelName]) {
        return _cache.channels[channelName];
    }
    const stored = loadFromStorage('channels', {});
    if (stored[channelName]) return stored[channelName];
    
    try {
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000));
        const doc = await Promise.race([db.collection("channels").doc(channelName).get(), timeoutPromise]);
        return doc && doc.exists ? doc.data() : null;
    } catch (err) {
        console.warn("Firestore channel lookup failed", err);
    }
    return null;
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

let _isFetchingCategories = false;
async function fetchCategoriesFromFirestore() {
    if (_isFetchingCategories) return;
    _isFetchingCategories = true;
    try {
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 4000));
        const fetchPromise = db.collection("categories").orderBy("order").get();
        const snapshot = await Promise.race([fetchPromise, timeoutPromise]);
        let categories = [];
        snapshot.forEach(doc => {
            categories.push({ id: doc.id, ...doc.data() });
        });
        if (categories.length > 0) {
            _cache.categories = categories;
            _cache.categoriesTimestamp = Date.now();
            saveToStorage('categories', categories);
            if (typeof document !== 'undefined') {
                document.dispatchEvent(new CustomEvent('jtube:categoriesUpdated', { detail: categories }));
            }
        }
    } catch (err) {
        console.warn("Background Firestore categories fetch:", err.message || err);
    } finally {
        _isFetchingCategories = false;
    }
}

async function getCategories() {
    if (_cache.categories && _cache.categories.length > 0) {
        fetchCategoriesFromFirestore();
        return _cache.categories;
    }
    const stored = loadFromStorage('categories', null);
    if (stored && stored.length > 0) {
        _cache.categories = stored;
        _cache.categoriesTimestamp = Date.now();
        fetchCategoriesFromFirestore();
        return stored;
    }
    if (defaultCats && defaultCats.length > 0) {
        _cache.categories = defaultCats;
        _cache.categoriesTimestamp = Date.now();
        fetchCategoriesFromFirestore();
        return defaultCats;
    }
    await fetchCategoriesFromFirestore();
    return (_cache.categories && _cache.categories.length > 0) ? _cache.categories : defaultCats;
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
async function autoSyncYouTubeChannels(force = false) {
    const apiKey = typeof ENV !== 'undefined' ? ENV.YOUTUBE_API_KEY : null;
    if (!apiKey) return;

    try {
        const channels = await getChannels();
        const now = Date.now();
        const SYNC_INTERVAL = 5 * 60 * 1000; // 5 minutes between background checks
        let hasUpdates = false;
        const allVideos = await getVideos(); // Fetch all once for fast lookup

        for (const [channelName, data] of Object.entries(channels)) {
            // Sync if channel has YouTube ID or playlist configured
            const shouldSync = force || (!data.lastSyncTime || (now - data.lastSyncTime > SYNC_INTERVAL));
            if ((data.ytChannelId || data.ytPlaylistId) && shouldSync) {
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

                // 2. Fetch new videos & shorts from Channel's uploads Playlist
                if (playlistId) {
                    try {
                        // Fetch latest 25 items so new videos and shorts are always caught
                        const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&maxResults=25&playlistId=${playlistId}&key=${apiKey}`;
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

                                // Format duration (including shorts <= 60 seconds)
                                const h = Math.floor(totalSeconds / 3600);
                                const m = Math.floor((totalSeconds % 3600) / 60);
                                const s = totalSeconds % 60;
                                const durationText = h > 0 
                                    ? `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}` 
                                    : `${m}:${s.toString().padStart(2, '0')}`;

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
                                    thumbnail: snippet.thumbnails?.maxres?.url || snippet.thumbnails?.high?.url || snippet.thumbnails?.medium?.url || snippet.thumbnails?.default?.url || "",
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
                                console.log(`Auto-synced ${newVideos.length} new videos & shorts for ${channelName}!`);
                                hasUpdates = true;
                                allVideos.push(...newVideos);
                            }
                        }
                    } catch (e) { console.warn("Error during auto-sync fetch for " + channelName, e); }
                }

                // 3. Sync stats for existing videos belonging to this channel
                const channelVideos = allVideos.filter(v => v.channel === channelName && v.id.startsWith("yt_"));
                if (channelVideos.length > 0) {
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
    // Start YouTube background sync 1.5 seconds after page load
    setTimeout(() => {
        autoSyncYouTubeChannels();
    }, 1500);

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
function parseDurationInSeconds(durationStr) {
    if (!durationStr) return 0;
    const parts = String(durationStr).trim().split(':').map(Number);
    if (parts.length === 3) return (parts[0] * 3600) + (parts[1] * 60) + (parts[2] || 0);
    if (parts.length === 2) return (parts[0] * 60) + (parts[1] || 0);
    if (parts.length === 1) return parts[0] || 0;
    return 0;
}

function isShortVideo(video) {
    if (!video) return false;
    if (video.isShort === true) return true;
    if (video.category && video.category.toLowerCase() === 'shorts') return true;
    if (video.videoUrl && /youtube\.com\/shorts\//i.test(video.videoUrl)) return true;
    if (video.title && /#shorts?\b/i.test(video.title)) return true;
    const secs = parseDurationInSeconds(video.duration);
    return secs > 0 && secs <= 120; // 2 minutes or less
}

async function getShortVideos() {
    const all = await getVideos();
    return all.filter(v => isShortVideo(v));
}

function getDurationBadgeClass(durationStr) {
    if (!durationStr) return '';
    const secs = parseDurationInSeconds(durationStr);
    if (secs > 0 && secs <= 120) return 'duration-short bg-red-600/90 text-white';
    const totalMinutes = Math.floor(secs / 60);
    if (totalMinutes < 5) return 'duration-short';
    if (totalMinutes >= 30) return 'duration-long';
    return 'duration-medium';
}

// ===== COMMENTS & INTERACTIONS HELPERS =====
async function getComments(videoId) {
    if (!videoId) return [];
    try {
        const video = await getVideoById(videoId);
        if (video && Array.isArray(video.comments)) {
            return video.comments;
        }
        // Direct Firestore fallback
        try {
            const doc = await db.collection("videos").doc(videoId).get();
            if (doc.exists && Array.isArray(doc.data().comments)) {
                return doc.data().comments;
            }
        } catch (e) {}
    } catch (err) {
        console.warn("getComments error:", err);
    }
    return [];
}

async function addComment(videoId, commentData) {
    if (!videoId || !commentData) return null;
    try {
        let video = await getVideoById(videoId);
        if (!video) {
            try {
                const doc = await db.collection("videos").doc(videoId).get();
                if (doc.exists) {
                    video = { id: doc.id, ...doc.data() };
                }
            } catch (e) {}
        }
        if (!video) return null;
        if (!Array.isArray(video.comments)) {
            video.comments = [];
        }

        const user = typeof currentUser !== 'undefined' && currentUser ? currentUser : (typeof getCurrentUser === 'function' ? getCurrentUser() : null);
        const username = commentData.username || commentData.userName || commentData.author || (user && (user.displayName || user.email.split('@')[0])) || "User";
        const email = commentData.email || (user ? user.email : "");
        const text = (commentData.text || "").trim();
        if (!text) return null;

        const newComment = {
            id: 'c_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
            username: username,
            userName: username,
            author: username,
            email: email,
            text: text,
            timestamp: commentData.timestamp || Date.now(),
            replies: commentData.replies || []
        };

        video.comments.unshift(newComment);
        video.commentsCount = video.comments.length;
        await saveVideo(video);
        return newComment;
    } catch (err) {
        console.error("addComment error:", err);
        throw err;
    }
}

async function likeVideo(videoId, userEmail) {
    if (!videoId) return 0;
    try {
        let video = await getVideoById(videoId);
        if (!video) return 0;

        const user = typeof currentUser !== 'undefined' && currentUser ? currentUser : (typeof getCurrentUser === 'function' ? getCurrentUser() : null);
        const email = userEmail || (user ? user.email : null);
        if (!Array.isArray(video.likedBy)) {
            video.likedBy = [];
        }

        if (email) {
            const idx = video.likedBy.indexOf(email);
            if (idx > -1) {
                video.likedBy.splice(idx, 1);
            } else {
                video.likedBy.push(email);
            }
            video.likes = video.likedBy.length;
        } else {
            video.likes = (video.likes || 0) + 1;
        }

        await saveVideo(video);
        return video.likes;
    } catch (err) {
        console.error("likeVideo error:", err);
        return 0;
    }
}

async function toggleSubscription(channelName, userEmail) {
    if (!channelName) return false;
    try {
        const channels = await getChannels();
        const chData = channels[channelName] || { subscribers: 0, subscribedBy: [] };
        if (!Array.isArray(chData.subscribedBy)) {
            chData.subscribedBy = [];
        }

        const user = typeof currentUser !== 'undefined' && currentUser ? currentUser : (typeof getCurrentUser === 'function' ? getCurrentUser() : null);
        const email = userEmail || (user ? user.email : null);
        if (!email) return false;

        const idx = chData.subscribedBy.indexOf(email);
        let isSubbed = false;
        if (idx > -1) {
            chData.subscribedBy.splice(idx, 1);
            isSubbed = false;
        } else {
            chData.subscribedBy.push(email);
            isSubbed = true;
        }
        chData.subscribers = chData.subscribedBy.length;

        await saveChannel(channelName, chData);
        return isSubbed;
    } catch (err) {
        console.error("toggleSubscription error:", err);
        return false;
    }
}

// Global Browser Exports
if (typeof window !== 'undefined') {
    window.getComments = getComments;
    window.addComment = addComment;
    window.likeVideo = likeVideo;
    window.toggleSubscription = toggleSubscription;
}