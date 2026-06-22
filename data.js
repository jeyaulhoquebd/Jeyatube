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
    TTL: 30000 // 30 seconds cache TTL
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

// ===== VIDEO FUNCTIONS (Firestore-only, cached) =====

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
    await db.collection("videos").doc(video.id).set(video);
    await rtdb.ref(`videos/${video.id}`).set(video); // RTDB Sync
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
    await db.collection("videos").doc(id).delete();
    await rtdb.ref(`videos/${id}`).remove(); // RTDB Sync
    invalidateCache('videos');
}

// ===== CHANNEL FUNCTIONS =====

async function getChannels() {
    if (isCacheValid('channels')) return _cache.channels;
    
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
    await db.collection("channels").doc(channelName).set(channelData, { merge: true });
    invalidateCache('channels');
}

async function getChannel(channelName) {
    // Try cache first
    if (isCacheValid('channels') && _cache.channels[channelName]) {
        return _cache.channels[channelName];
    }
    const doc = await db.collection("channels").doc(channelName).get();
    return doc.exists ? doc.data() : null;
}

async function getVideosByChannel(channelName) {
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

initializeDatabase();