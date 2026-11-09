# 🎬 JTube

JTube হলো একটা কিউরেটেড ভিডিও প্ল্যাটফর্ম: প্রোগ্রামিং, বিজ্ঞান, AI, ইসলাম, শিক্ষা, মোটিভেশন আর পডকাস্টের বাছাই করা YouTube চ্যানেলগুলোর **সব ভিডিও আর Shorts** এক জায়গায় দেখা যায়।

- ফ্রন্টএন্ড: Vanilla JS + Tailwind CSS (CDN)
- ব্যাকএন্ড: Node.js + Express (`server.js`)

---

## ✨ কী কী করে

- **পুরো লাইব্রেরি সিঙ্ক:** প্রতিটা চ্যানেলের আগের সব ভিডিও, Shorts আর পুরনো লাইভ সার্ভার নিজে থেকে ইমপোর্ট করে।
  - YouTube Data API-র `UULF` / `UUSH` / `UULV` প্লেলিস্ট ব্যবহার করা হয়, তাই কোনটা Short আর কোনটা ভিডিও সেটা YouTube যেভাবে ভাগ করে ঠিক সেভাবেই ভাগ হয়।
- **নতুন আপলোড কয়েক মিনিটেই চলে আসে:**
  - প্রতি ৫ মিনিটে RSS চেক করা হয় (ফ্রি)।
  - `PUBLIC_BASE_URL` দিলে YouTube WebSub পুশ চালু হয়, তখন আপলোডের সাথে সাথেই চলে আসে।
  - খোলা পেজগুলো প্রতি মিনিটে নিজে থেকে নতুন ভিডিও দেখায়।
- **ক্যাটালগ ডিস্কে সেভ থাকে** (`data/`), তাই সার্ভার রিস্টার্ট দিলেও ভিডিও হারায় না।
- **পেজ-বাই-পেজ লোড:** হোম, চ্যানেল, Shorts আর সার্চ পুরো লাইব্রেরি থেকে অল্প অল্প করে লোড হয়। হাজার হাজার ভিডিও থাকলেও পেজ ভারী হয় না।
- **এডমিন স্টুডিও (`admin.html`):**
  - চ্যানেল যোগ করা যায় লিংক, @handle বা ID দিয়ে।
  - চ্যানেলের ক্যাটাগরি বদলানো, চ্যানেল মুছে ফেলা, পুরো চ্যানেল আবার ইমপোর্ট করা যায়।
  - সিঙ্কের অগ্রগতি আর দৈনিক API কোটা দেখা যায়।
  - ভিডিও যোগ বা লুকানো যায়।

- **কমিউনিটি গ্রুপ চ্যাট (`group.html`):** সার্ভারে সেভ হওয়া আসল চ্যাট, তাই সবাই সবার মেসেজ দেখতে পায়।
  - সার্ভারে অ্যাকাউন্ট, রিপ্লাই, লাইক আর ভিডিও শেয়ার করা যায়।
  - `/ask` লিখে প্রশ্ন করলে JAsk AI উত্তর দেয়।
  - মেম্বার লিস্টে কে অনলাইন আছে দেখা যায়।
- **প্লেলিস্ট (`playlists.html`):** প্রতিটা চ্যানেলের আসল YouTube প্লেলিস্ট সার্ভার রেখে দেয়। সার্চ, চ্যানেল ফিল্টার, Play all আর Shuffle করা যায়।

## 🔐 সিকিউরিটি

- **এডমিন লগইন (Firebase):**
  - Firebase Authentication-এর UID `4biDan5sHsZgfN33920XYQoNkH22` অ্যাকাউন্টটাই এডমিন।
  - `admin.html`-এ ওই অ্যাকাউন্টের ইমেইল-পাসওয়ার্ড দিয়ে লগইন করতে হয়।
  - ব্রাউজার Firebase-এ লগইন করে। সার্ভার Google-এর পাবলিক কী দিয়ে টোকেন যাচাই করে, তারপর UID মিললে তবেই এডমিন সেশন দেয়।
  - আরও এডমিন যোগ করতে `.env`-এ `ADMIN_FIREBASE_UIDS` দিন (কমা দিয়ে আলাদা করে)।
  - Firebase Console → Authentication-এ Email/Password চালু থাকতে হবে।
  - `npm run reset-admin`-এর পাসওয়ার্ড লগইন ব্যাকআপ হিসেবে কাজ করে।

- **গোপন কী শুধু সার্ভারে থাকে:** YouTube, Groq, Gemini আর Telegram-এর কী `.env`-এ রাখা হয়। ব্রাউজারে কোনো কী যায় না। `env.js`-এ শুধু পাবলিক কনফিগ থাকে।
- **এডমিন লগইন সার্ভার যাচাই করে:**
  - পাসওয়ার্ড scrypt দিয়ে হ্যাশ করা থাকে।
  - সেশন রাখা হয় HMAC-signed `HttpOnly; SameSite=Strict` কুকিতে।
  - ৫ বার ভুল পাসওয়ার্ড দিলে লগইন সাময়িক বন্ধ হয়ে যায়।
- **সব এডমিন API সেশন ছাড়া বন্ধ:** সেশন না থাকলে `401` আসে। অন্য সাইট থেকে আসা POST রিকোয়েস্ট (CSRF) আটকানো হয়।
- **সিকিউরিটি হেডার আর রেট লিমিট:**
  - CSP, `X-Frame-Options`, `nosniff`, HSTS (https-এ) হেডার দেওয়া আছে।
  - AI, ফর্ম আর লগইনে রেট লিমিট আছে।
- **শুধু অনুমোদিত ফাইল সার্ভ হয়:** `server.js`, `lib/`, `data/`, `.env`, `package.json` কখনো ব্রাউজারে যায় না।
- **XSS সুরক্ষা:** ভিডিওর টাইটেল/ডেসক্রিপশন, কমেন্ট, চ্যাট আর AI-এর উত্তর ব্রাউজারে দেখানোর আগে escape বা neutralize করা হয়।
- **ভিউয়ার অ্যাকাউন্ট সার্ভারে থাকে:**
  - পাসওয়ার্ড scrypt দিয়ে হ্যাশ করা থাকে, সেশন রাখা হয় HttpOnly কুকিতে।
  - বারবার ভুল পাসওয়ার্ড দিলে লগইন সাময়িক বন্ধ হয়, সাইনআপেও রেট লিমিট আছে।
  - পুরনো শুধু-ব্রাউজারের অ্যাকাউন্ট প্রথমবার লগইনের সময় নিজে থেকে সার্ভারে চলে যায়।
- **গ্রুপ চ্যাটের সুরক্ষা:**
  - শুধু লগইন করা মেম্বাররা লিখতে পারে।
  - স্প্যাম ঠেকাতে খুব দ্রুত মেসেজ, একই মেসেজ বারবার আর বেশি লিংক দেওয়া বন্ধ।
  - গালাগালি নিজে থেকে ব্লক হয়।
  - ৩ জন রিপোর্ট করলে মেসেজ লুকিয়ে যায়।
  - এডমিন যেকোনো মেসেজ মুছতে আর মেম্বার সাসপেন্ড করতে পারে (এডমিন স্টুডিও → Community)।
  - কারো ইমেইল অন্য মেম্বাররা কখনো দেখতে পায় না।

> ⚠️ আগের `env.js` ফাইলে আসল API কী, Telegram বট টোকেন আর Groq কী git-এ commit করা ছিল। git history থেকে এগুলো এখনো দেখা যায়। তাই এগুলো **অবশ্যই বাতিল (revoke) করে নতুন কী বানাতে হবে**:
> - YouTube API key: Google Cloud Console → Credentials
> - Telegram bot token: @BotFather → `/revoke`
> - Groq API key: console.groq.com → API Keys
>
> নতুন কী গুলো শুধু সার্ভারের `.env`-এ রাখুন।

---

## ☁️ Cloudflare Pages-এ চালানো (`grtu.pages.dev`) — প্রস্তাবিত

সাইটটা পুরোপুরি স্ট্যাটিক ফাইল হিসেবে চলে, কোনো সার্ভার বা ডেটাবেস লাগে না।

- **ভিডিও, Shorts আর প্লেলিস্ট:** `catalog/` ফোল্ডারে JSON ফাইল হিসেবে থাকে। পেজ খুললে শুধু যতটুকু দরকার ততটুকু ফাইল নামে।
- **নতুন ভিডিও:** একটা GitHub Action প্রতি ৩ ঘণ্টায় সব চ্যানেলে নতুন আপলোড খোঁজে। পেলে `catalog/` আপডেট করে commit করে, আর Cloudflare Pages নিজে থেকে সাইট আবার deploy করে।
- **লগইন আর গ্রুপ চ্যাট:** Firebase Authentication আর Firestore দিয়ে চলে। Cloudflare-এ নিজের ডেটাবেস নেই, তাই এই দুটোর জন্য Firebase লাগে। ভিডিওর জন্য Firebase লাগে না।
- **এডমিন:** Firebase UID `4biDan5sHsZgfN33920XYQoNkH22`।

### Cloudflare Pages সেটিং
Cloudflare Dashboard → Workers & Pages → আপনার প্রজেক্ট → Settings → Builds:

| সেটিং | মান |
|---|---|
| Production branch | `main` |
| Framework preset | None |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Environment variable | `NODE_VERSION` = `20` |

প্রতিবার `main`-এ নতুন commit গেলেই Cloudflare নিজে deploy করে।

### একবারের সেটআপ
1. **Firebase Console → Authentication → Settings → Authorized domains:** `grtu.pages.dev` যোগ করুন। না করলে ওই সাইটে লগইন কাজ করবে না।
2. **Firebase Console → Authentication → Sign-in method:** Email/Password আর Google চালু রাখুন।
3. **চ্যাটের নিয়ম আপলোড:** কম্পিউটার থেকে একবার চালান: `firebase deploy --only firestore`
4. **GitHub Secret:** Repository → Settings → Secrets and variables → Actions → New repository secret → নাম `YOUTUBE_API_KEY`, মান আপনার নতুন YouTube Data API v3 key।
5. **প্রথম আপডেট চালান:** GitHub → Actions → **Update video catalog** → Run workflow। এরপর এটা প্রতি ৩ ঘণ্টায় নিজে চলবে।

### জেনে রাখুন
- **Cloudflare Pages ফ্রি প্ল্যানে মাসে ৫০০টা build।** ৩ ঘণ্টার আপডেটে দিনে সর্বোচ্চ ৮টা, মানে মাসে প্রায় ২৪০টা। আপডেটে নতুন ভিডিও না থাকলে কিছুই commit হয় না, তাই build-ও হয় না।
- **এডমিন প্যানেল থেকে চ্যানেল যোগ/বাদ দিলে** সেটা Firestore-এ সেভ হয়। পরের আপডেটে কাজে লাগাতে GitHub Secret-এ `FIREBASE_SERVICE_ACCOUNT` (Firebase Console → Project settings → Service accounts → Generate new private key থেকে পাওয়া JSON) দিতে হবে। না দিলে `catalog/channels.json` ফাইলে সরাসরি চ্যানেল যোগ করুন।
- **নিজে থেকে ভিডিও আপলোড** (এডমিন → Upload New Video) স্ট্যাটিক সাইটে দেখা যাবে না। সব ভিডিও YouTube চ্যানেল থেকে আসে।

## 🚀 চালানোর নিয়ম (Node সার্ভার)

```bash
npm install
cp .env.example .env        # তারপর .env-এ নিজের মানগুলো বসান
npm run hash-password -- "আপনার-লম্বা-পাসওয়ার্ড"   # আউটপুট ADMIN_PASSWORD_HASH-এ বসান
npm start                   # http://localhost:3000
```

- `.env`-এ এডমিন সেট না করলে প্রথমবার চালানোর সময় সার্ভার একটা র‍্যান্ডম এডমিন পাসওয়ার্ড বানিয়ে **লগে একবার দেখায়** আর সেটা `data/admin.json`-এ রাখে। এই অবস্থায় এডমিন ইমেইল হয় `admin@jtube.com`।
- **এডমিন লগইন ভুলে গেলে** সার্ভারে নিচের কমান্ড চালান। এটা নতুন পাসওয়ার্ড বানিয়ে দেখায়। শেষে নতুন ইমেইল দিলে ইমেইলও বদলে যায়।
  ```bash
  npm run reset-admin
  ```
  ```bash
  npm run reset-admin -- you@example.com
  ```
  তারপর সার্ভার রিস্টার্ট দিন। `.env`-এ `ADMIN_EMAIL` আর `ADMIN_PASSWORD_HASH` থাকলে সেটাই আগে কাজ করবে, তখন `.env` থেকে বদলাতে হবে।
- প্রথমবার চালানোর পর পুরো লাইব্রেরি (প্রায় ৪৪,০০০ আইটেম) ইমপোর্ট হতে YouTube API কোটা অনুযায়ী এক থেকে কয়েক দিন লাগতে পারে। Google-এর ডিফল্ট কোটা দিনে ১০,০০০ ইউনিট।
  - নতুন আপলোড এর মধ্যেই আসতে থাকে।
  - কোটা শেষ হলে পরের দিন যেখানে থেমেছিল সেখান থেকে আবার শুরু হয়।
- `DATA_DIR` একটা স্থায়ী ডিস্কে রাখুন। Cloud Run-এর মতো ephemeral হোস্টিংয়ে ভলিউম মাউন্ট করতে হবে, নাহলে রিস্টার্টের পর ইমপোর্ট আবার শুরু থেকে হবে।
- শুধু Firebase Hosting (স্ট্যাটিক) দিয়ে চালালে সার্ভারের ফিচারগুলো কাজ করবে না: পুরো সিঙ্ক, এডমিন লগইন আর AI। সেক্ষেত্রে সাইট `seed-data.js`-এর ভিডিও দেখায়।

## 📂 ফাইল স্ট্রাকচার

| ফাইল | কাজ |
|---|---|
| `server.js` | Express সার্ভার, API রুট, স্ট্যাটিক ফাইল allow-list |
| `lib/catalog.js` | YouTube সিঙ্ক ইঞ্জিন: ব্যাকফিল, RSS, WebSub, কোটা, ডিস্কে সেভ, কুয়েরি |
| `lib/security.js` | এডমিন অথ, সেশন, রেট লিমিট, CSRF, সিকিউরিটি হেডার |
| `lib/community.js` | ভিউয়ার অ্যাকাউন্ট আর গ্রুপ চ্যাট: মডারেশন, রিপোর্ট, সাসপেন্ড |
| `firebase-init.js` | Firebase Auth (লগইন), Firestore (গ্রুপ চ্যাট) আর এডমিন টুল |
| `scripts/build-catalog.js`, `.github/workflows/catalog-sync.yml` | YouTube থেকে `catalog/` ফাইল বানায় (GitHub Action, প্রতি ৩ ঘণ্টায়) |
| `static-catalog.js` | ব্রাউজারে `catalog/` ফাইল পড়ে ভিডিও, সার্চ আর প্লেলিস্ট দেখায় |
| `scripts/build-pages.js`, `_headers` | Cloudflare Pages-এর জন্য `dist/` ফোল্ডার আর সিকিউরিটি হেডার |
| `firestore.rules`, `firestore.indexes.json` | Firestore সিকিউরিটি রুলস আর ইনডেক্স |
| `scripts/reset-admin.js` | এডমিন লগইন ভুলে গেলে নতুন পাসওয়ার্ড বানায় |
| `scripts/hash-password.js` | এডমিন পাসওয়ার্ড হ্যাশ বানায় |
| `scripts/check.js` | সব JS ফাইলের সিনট্যাক্স চেক (`npm run lint`) |
| `data.js` | ফ্রন্টএন্ড ডেটা লেয়ার (সার্ভার ক্যাটালগ + লোকাল স্টোর) |
| `index.*`, `watch.*`, `shorts.*`, `channel.*` … | পেজ আর তার স্ক্রিপ্ট |
| `admin.html`, `admin.js` | এডমিন স্টুডিও |

## 🔌 মূল API

| মেথড | পাথ | কাজ |
|---|---|---|
| GET | `/api/videos?type=all\|video\|short&category=&channel=&q=&sort=latest\|popular&page=&limit=` | ক্যাটালগ পেজ |
| GET | `/api/videos/:id` | একটা ভিডিও |
| GET | `/api/catalog/stats` | মোট ভিডিও, Shorts আর ক্যাটাগরির সংখ্যা |
| GET | `/api/channels/featured` | চ্যানেল তালিকা (অ্যাভাটার আর সাবস্ক্রাইবার সহ) |
| POST | `/api/jask/chat` | JAsk AI (Groq কী সার্ভারে থাকে) |
| GET | `/api/playlists` · `/api/playlists/:id` | চ্যানেলের প্লেলিস্ট আর তার ভিডিও |
| POST | `/api/auth/register` · `/login` · `/logout` · GET `/api/auth/me` | ভিউয়ার অ্যাকাউন্ট |
| GET/POST/DELETE | `/api/group/messages[/:id[/like\|/report]]`, GET `/api/group/members` | গ্রুপ চ্যাট |
| POST | `/api/admin/login` · `/logout` · GET `/api/admin/me` | এডমিন সেশন |
| GET/POST/PATCH/DELETE | `/api/admin/status`, `/api/admin/sync`, `/api/admin/channels[/:id[/resync]]`, `/api/admin/videos[/delete]` | এডমিন (লগইন লাগবে) |
