// Public client configuration ONLY.
// Never put API keys for paid/private services, bot tokens or passwords in this file — it is downloaded by every visitor.
// Secrets (YOUTUBE_API_KEY, GROQ_API_KEY, TELEGRAM_BOT_TOKEN, ...) live in the server's environment (.env).
//
// The Firebase web config below is public by design (Firebase docs: it only identifies the project).
// Data is protected by firestore.rules / database.rules.json, and the key should be restricted
// to your domains in Google Cloud Console → APIs & Services → Credentials.
const ENV = Object.freeze({
    API_BASE: '',
    FIREBASE_CONFIG: Object.freeze({
        apiKey: "AIzaSyBgLd_OmawpDrDxOkm8msclKUqoI5nPZMw",
        authDomain: "jeyatube.firebaseapp.com",
        databaseURL: "https://jeyatube-default-rtdb.firebaseio.com",
        projectId: "jeyatube",
        storageBucket: "jeyatube.firebasestorage.app",
        messagingSenderId: "89347367792",
        appId: "1:89347367792:web:cd7233e0aacc4e93fea5b5",
        measurementId: "G-8X0ZJVHE84"
    })
});
