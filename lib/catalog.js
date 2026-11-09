'use strict';
/**
 * JTube video catalog + YouTube sync engine.
 *
 * - Backfills EVERY public upload of each featured channel through the
 *   YouTube Data API, using the channel's hidden playlists:
 *     UULF<id> = long-form videos, UUSH<id> = Shorts, UULV<id> = past lives.
 *   Shorts are therefore classified exactly the way YouTube classifies them.
 * - Picks up new uploads quickly:
 *     1. WebSub push from YouTube (instant, when PUBLIC_BASE_URL is set)
 *     2. free RSS polling every SYNC_INTERVAL_MINUTES
 *     3. Data API polling as a fallback when RSS is unreachable
 * - Persists everything to DATA_DIR so a restart never loses the catalog.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const API = 'https://www.googleapis.com/youtube/v3';
const DESC_LIMIT = 600;

const DEFAULT_CHANNELS = [
  ['Stanford Online', 'UCBa5G_ESCn8Yd4vw5U-gIcg', 'Programming'],
  ['CS50', 'UCcabW7890RKJzL968QWEykA', 'Programming'],
  ['CodeWithHarry', 'UCeVMnSShP_Iviwkknt83cww', 'Programming'],
  ['Programming Hero Bangladesh', 'UCZ34f0PHL-TC8vD31hVPZuw', 'Programming'],
  ['Bro Code', 'UC4SVo0Ue36XCfOyb5Lh1viQ', 'Programming'],
  ['Phitron', 'UCjKb3rI-O-sAc64yXscpCDQ', 'Programming'],
  ['CPS Academy', 'UC3S_jVMwhUrF6jjkFCQvyuA', 'Programming'],
  ['Hablu Programmer', 'UCpGQisjfG8w-E21cG4ScEOA', 'Programming'],
  ['Ali Hossain', 'UCnbAAJ1l1AvmfaH2TVdH18Q', 'Programming'],
  ['Mark Rober', 'UCY1kMZp36IQSyNx_9h4mpCg', 'Science'],
  ['David Bombal', 'UCP7WmQ_U4GB3K51Od9QvM0w', 'AI & ML'],
  ['AI Frontier', 'UC6CGPM_qMkmtJY5_bd4rK2w', 'AI & ML'],
  ['MIT OpenCourseWare', 'UCEBb1b_L6zDS3xTUrIALZOw', 'Education'],
  ['IIT Madras - B.S. Degree Programme', 'UCvKzzGO37oT83K0FwnUucxw', 'Education'],
  ['Towards Eternity', 'UCPubBVDCzu7IWWnitlkEsNw', 'Islam'],
  ['Alokito Ummah', 'UCFRd_Id8mRnpjn-Cgm75fSA', 'Islam'],
  ['تلاوات ياسر الدوسري إمام الحرم المكي', 'UClncV9OLPto_MinRzGfjr2g', 'Islam'],
  ['Qari Sabah Muhtadi Abid [Premium]', 'UCY0tyW-tjT_-gGfxdagsmiw', 'Islam'],
  ['Sabit International', 'UCGmpReKFeVJjviXDp9knOpA', 'Motivation'],
  ['Make First Million - Badar Munir', 'UCVzgTh8i9W-UtengLs-xytA', 'Motivation'],
  ['Raj Shamani', 'UCzwCEE_PchiBULMnAJqhGVg', 'Podcasts'],
  ['Perspective Podcast Clips', 'UCLx4XRxWzq3jLYqNfIGs15Q', 'Podcasts'],
  ['Dipro Prattoy', 'UC_gzNUehJ7BS84seL2_e2FQ', 'Education'],
  ['Inception BD', 'UCLakvfuaLwTC-KPVCccQXAA', 'Education'],
  ['উৎকর্ষ', 'UCT9YVvhcV1SCSAk1aIP0f0A', 'Education'],
  ['Asadudzaman Joy', 'UCiQwtqIAlphixACg_4ADeWA', 'Education'],
  ['Tech Minds', 'UC9a8Z6Sp6eb2s3O79pX5Zvg', 'AI & ML'],
  ['Heritage & Science', 'UCDE92JmI7T5C8fQwj2eNbhA', 'Science'],
  ['Fahim Abdullah', 'UCzRXuZ2TLCtVywE676SYIVg', 'Education'],
  ['Abir Chowdhury', 'UCaSJJoUiIAiD03pk4O426rQ', 'Motivation']
].map(([name, ytChannelId, category]) => ({ name, ytChannelId, category }));

const PLAYLIST_KINDS = [
  { prefix: 'UULF', kind: 'video' },
  { prefix: 'UUSH', kind: 'short' },
  { prefix: 'UULV', kind: 'live' }
];

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function decodeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

// Neutralise characters that could break out of HTML text or attributes when the
// front-end renders titles with innerHTML. Visually near-identical replacements are used.
function safeText(str) {
  return String(str == null ? '' : str)
    .replace(/</g, '\uFF1C').replace(/>/g, '\uFF1E')
    .replace(/"/g, '\u201D').replace(/'/g, '\u2019').replace(/`/g, '\u2018');
}

function isoDurationToSeconds(iso) {
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso || '');
  if (!m) return 0;
  return (+m[1] || 0) * 86400 + (+m[2] || 0) * 3600 + (+m[3] || 0) * 60 + (+m[4] || 0);
}

function formatDuration(sec) {
  if (!sec) return '0:00';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

function timeAgo(ts) {
  const sec = Math.floor((Date.now() - ts) / 1000);
  if (sec < 60) return 'Just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} minute${min === 1 ? '' : 's'} ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? '' : 's'} ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day} day${day === 1 ? '' : 's'} ago`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo} month${mo === 1 ? '' : 's'} ago`;
  const yr = Math.floor(day / 365);
  return `${yr} year${yr === 1 ? '' : 's'} ago`;
}

function bestThumb(thumbs, videoId) {
  const t = thumbs || {};
  return (t.maxres || t.standard || t.high || t.medium || t.default || {}).url ||
    `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

class Catalog {
  constructor({ dataDir, apiKey, log = console, quotaLimit = 9000, syncIntervalMinutes = 5, apiFallbackMinutes = 20, publicBaseUrl = '', websubSecret = '' }) {
    this.dataDir = dataDir;
    this.apiKey = apiKey || '';
    this.log = log;
    this.quotaLimit = quotaLimit;
    this.syncIntervalMs = Math.max(1, syncIntervalMinutes) * 60 * 1000;
    this.apiFallbackMs = Math.max(5, apiFallbackMinutes) * 60 * 1000;
    this.publicBaseUrl = (publicBaseUrl || '').replace(/\/+$/, '');
    this.websubSecret = websubSecret || '';

    this.videos = new Map();     // id -> record
    this.sorted = [];            // records sorted newest first (visible only)
    this.dirty = false;
    this.hidden = new Set();     // ids removed by admin
    this.channels = [];          // featured channels config
    this.state = { channels: {}, quota: { day: '', used: 0 }, lastIncremental: 0, lastBackfillStep: 0 };
    this.listeners = new Set();
    this.busy = { backfill: false, incremental: false };
    this.timers = [];
    this.lastError = null;
    this.playlists = { updatedAt: 0, items: [] };
    this.playlistItemCache = new Map(); // playlistId -> { at, items }

    fs.mkdirSync(this.dataDir, { recursive: true });
    this._load();
  }

  // ---------- persistence ----------
  _file(name) { return path.join(this.dataDir, name); }

  _readJson(name, fallback) {
    try { return JSON.parse(fs.readFileSync(this._file(name), 'utf8')); } catch { return fallback; }
  }

  _writeJson(name, data) {
    const tmp = this._file(name + '.tmp');
    fs.writeFileSync(tmp, JSON.stringify(data));
    fs.renameSync(tmp, this._file(name));
  }

  _load() {
    const vids = this._readJson('catalog.json', []);
    if (Array.isArray(vids)) vids.forEach(v => {
      if (!v || !v.id) return;
      ['title', 'channel', 'category', 'description', 'playlist'].forEach(k => { if (typeof v[k] === 'string') v[k] = safeText(v[k]); });
      this.videos.set(v.id, v);
    });
    this.hidden = new Set(this._readJson('hidden.json', []));
    const ch = this._readJson('channels.json', null);
    this.channels = Array.isArray(ch) && ch.length ? ch : DEFAULT_CHANNELS.map(c => ({ ...c }));
    this.state = Object.assign(this.state, this._readJson('sync-state.json', {}));
    this.state.channels = this.state.channels || {};
    const pl = this._readJson('playlists.json', null);
    if (pl && Array.isArray(pl.items)) this.playlists = pl;
    this._rebuild();
    this.log.log(`[Catalog] Loaded ${this.videos.size} videos, ${this.channels.length} channels from disk.`);
  }

  save(force = false) {
    if (!this.dirty && !force) return;
    try {
      this._writeJson('catalog.json', Array.from(this.videos.values()));
      this._writeJson('sync-state.json', this.state);
      this._writeJson('channels.json', this.channels);
      this._writeJson('hidden.json', Array.from(this.hidden));
      this.dirty = false;
    } catch (e) {
      this.log.warn('[Catalog] Save failed:', e.message);
    }
  }

  _rebuild() {
    const channelNames = new Set(this.channels.map(c => c.name));
    this.sorted = Array.from(this.videos.values())
      .filter(v => !this.hidden.has(v.id) && (v.source === 'admin' || channelNames.has(v.channel)))
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    this.sorted.forEach(v => {
      Object.defineProperty(v, '_s', { value: `${v.title} ${v.channel} ${v.category}`.toLowerCase(), enumerable: false, configurable: true, writable: true });
    });
  }

  onNewVideos(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  _upsert(records) {
    const fresh = [];
    for (const r of records) {
      if (!r || !r.id) continue;
      const prev = this.videos.get(r.id);
      if (!prev) fresh.push(r);
      this.videos.set(r.id, prev ? { ...prev, ...r } : r);
    }
    if (records.length) { this.dirty = true; this._rebuild(); }
    if (fresh.length) this.listeners.forEach(fn => { try { fn(fresh); } catch (e) { /* ignore */ } });
    return fresh;
  }

  // ---------- quota-aware YouTube API ----------
  _quotaDay() {
    // YouTube quota resets at midnight Pacific time
    return new Date(Date.now() - 8 * 3600 * 1000).toISOString().slice(0, 10);
  }

  quotaLeft() {
    const day = this._quotaDay();
    if (this.state.quota.day !== day) this.state.quota = { day, used: 0 };
    return this.quotaLimit - this.state.quota.used;
  }

  async api(resource, params, cost = 1) {
    if (!this.apiKey) throw new Error('YOUTUBE_API_KEY is not configured on the server');
    if (this.quotaLeft() < cost) throw new Error('Daily YouTube quota budget reached; resuming after reset');
    const qs = new URLSearchParams({ ...params, key: this.apiKey });
    this.state.quota.used += cost;
    this.dirty = true;
    const res = await fetch(`${API}/${resource}?${qs}`, { signal: AbortSignal.timeout(20000) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const reason = body.error && body.error.errors && body.error.errors[0] && body.error.errors[0].reason;
      const err = new Error((body.error && body.error.message) || `YouTube API HTTP ${res.status}`);
      err.status = res.status; err.reason = reason;
      if (reason === 'quotaExceeded' || reason === 'dailyLimitExceeded') this.state.quota.used = this.quotaLimit;
      throw err;
    }
    return body;
  }

  // ---------- record building ----------
  _channelFor(ytChannelId, fallbackName) {
    return this.channels.find(c => c.ytChannelId === ytChannelId) || this.channels.find(c => c.name === fallbackName) || null;
  }

  _buildRecord(item, kindHint) {
    const sn = item.snippet || {};
    const cd = item.contentDetails || {};
    const st = item.statistics || {};
    const videoId = item.id;
    const ch = this._channelFor(sn.channelId, sn.channelTitle);
    const seconds = isoDurationToSeconds(cd.duration);
    const isShort = kindHint === 'short' || (kindHint == null && seconds > 0 && seconds <= 60);
    const timestamp = sn.publishedAt ? Date.parse(sn.publishedAt) : Date.now();
    const views = parseInt(st.viewCount || '0', 10);
    const likes = parseInt(st.likeCount || '0', 10);
    return {
      id: 'yt_' + videoId,
      videoId,
      title: safeText(decodeHtml(sn.title || 'Untitled')),
      channel: safeText(ch ? ch.name : (sn.channelTitle || 'YouTube')),
      channelId: sn.channelId || (ch && ch.ytChannelId) || '',
      category: (ch && ch.category) || 'General',
      views,
      likes,
      baseLikes: likes,
      comments: [],
      duration: formatDuration(seconds),
      seconds,
      timestamp,
      time: timeAgo(timestamp),
      thumbnail: bestThumb(sn.thumbnails, videoId),
      description: safeText((sn.description || '').slice(0, DESC_LIMIT)),
      isShort,
      isReel: isShort,
      isLive: kindHint === 'live' || sn.liveBroadcastContent === 'live',
      contentType: isShort ? 'reel' : 'video',
      videoUrl: isShort ? `https://www.youtube.com/shorts/${videoId}` : `https://www.youtube.com/watch?v=${videoId}`,
      source: 'catalog'
    };
  }

  async _fetchVideoDetails(ids) {
    const out = [];
    for (let i = 0; i < ids.length; i += 50) {
      const batch = ids.slice(i, i + 50);
      const data = await this.api('videos', { part: 'snippet,contentDetails,statistics', id: batch.join(','), maxResults: '50' });
      out.push(...(data.items || []).filter(it => it.snippet && it.snippet.liveBroadcastContent !== 'upcoming'));
    }
    return out;
  }

  /** Decide Short vs video for brand-new uploads (≤3 min need a check). */
  async _classifyKinds(items) {
    const kinds = new Map();
    for (const it of items) {
      const sec = isoDurationToSeconds(it.contentDetails && it.contentDetails.duration);
      if (it.snippet && it.snippet.liveBroadcastContent === 'live') { kinds.set(it.id, 'live'); continue; }
      if (sec === 0 || sec > 180) { kinds.set(it.id, 'video'); continue; }
      try {
        const chId = it.snippet.channelId;
        const r = await this.api('playlistItems', { part: 'id', playlistId: 'UUSH' + chId.slice(2), videoId: it.id, maxResults: '1' });
        kinds.set(it.id, (r.items || []).length ? 'short' : 'video');
      } catch {
        kinds.set(it.id, sec <= 60 ? 'short' : 'video');
      }
    }
    return kinds;
  }

  /** Ingest specific YouTube video ids (used by RSS, WebSub, API polling). */
  async ingestIds(ids, kindHints = new Map()) {
    const missing = [...new Set(ids)].filter(id => !this.videos.has('yt_' + id));
    if (!missing.length) return [];
    const items = await this._fetchVideoDetails(missing);
    const valid = items.filter(it => this._channelFor(it.snippet.channelId, it.snippet.channelTitle));
    const needCheck = valid.filter(it => !kindHints.has(it.id));
    const kinds = needCheck.length ? await this._classifyKinds(needCheck) : new Map();
    const records = valid.map(it => this._buildRecord(it, kindHints.get(it.id) || kinds.get(it.id) || null));
    const fresh = this._upsert(records);
    if (fresh.length) {
      this.log.log(`[Catalog] +${fresh.length} new upload(s): ${fresh.slice(0, 3).map(v => v.title).join(' | ')}`);
      this.save();
    }
    return fresh;
  }

  // ---------- full backfill ----------
  _chState(ch) {
    const s = this.state.channels[ch.ytChannelId] || (this.state.channels[ch.ytChannelId] = { playlists: {} });
    s.playlists = s.playlists || {};
    return s;
  }

  backfillProgress() {
    let done = 0, total = 0;
    for (const ch of this.channels) {
      const s = this._chState(ch);
      for (const p of PLAYLIST_KINDS) { total++; if (s.playlists[p.prefix] && s.playlists[p.prefix].done) done++; }
    }
    return { done, total, complete: total > 0 && done === total };
  }

  /** Fetch one page (50 videos) for the next unfinished playlist. Returns false when nothing is left. */
  async _backfillStep() {
    for (const ch of this.channels) {
      const s = this._chState(ch);
      for (const p of PLAYLIST_KINDS) {
        const ps = s.playlists[p.prefix] || (s.playlists[p.prefix] = { done: false, pageToken: '', fetched: 0 });
        if (ps.done) continue;
        const playlistId = p.prefix + ch.ytChannelId.slice(2);
        let page;
        try {
          page = await this.api('playlistItems', { part: 'contentDetails', playlistId, maxResults: '50', ...(ps.pageToken ? { pageToken: ps.pageToken } : {}) });
        } catch (e) {
          if (e.status === 404) { ps.done = true; ps.empty = true; this.dirty = true; return true; }
          throw e;
        }
        const ids = (page.items || []).map(i => i.contentDetails && i.contentDetails.videoId).filter(Boolean);
        if (ids.length) {
          const items = await this._fetchVideoDetails(ids);
          this._upsert(items.map(it => this._buildRecord(it, p.kind)));
        }
        ps.fetched += ids.length;
        ps.pageToken = page.nextPageToken || '';
        ps.done = !page.nextPageToken;
        ps.updatedAt = Date.now();
        this.dirty = true;
        return true;
      }
    }
    return false;
  }

  async runBackfill() {
    if (this.busy.backfill || !this.apiKey) return;
    this.busy.backfill = true;
    let steps = 0;
    try {
      while (this.quotaLeft() > 200) {
        const more = await this._backfillStep();
        if (!more) break;
        steps++;
        if (steps % 10 === 0) this.save();
        await sleep(150);
      }
      if (steps) this.log.log(`[Catalog] Backfill: ${steps} page(s) fetched, ${this.videos.size} videos in catalog.`);
    } catch (e) {
      this.lastError = e.message;
      this.log.warn('[Catalog] Backfill paused:', e.message);
    } finally {
      this.busy.backfill = false;
      this.state.lastBackfillStep = Date.now();
      this.save();
    }
  }

  // ---------- incremental: RSS (free) + API fallback ----------
  async _rss(ch) {
    const res = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${ch.ytChannelId}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 JTubeSync/1.0' },
      signal: AbortSignal.timeout(10000)
    });
    if (!res.ok) throw new Error('RSS HTTP ' + res.status);
    const xml = await res.text();
    return xml.split('<entry>').slice(1).map(e => {
      const id = (e.match(/<yt:videoId>(.*?)<\/yt:videoId>/) || [])[1];
      const link = (e.match(/<link rel="alternate" href="([^"]+)"/) || [])[1] || '';
      return id ? { id, short: link.includes('/shorts/') } : null;
    }).filter(Boolean);
  }

  async runIncremental() {
    if (this.busy.incremental) return { status: 'busy' };
    this.busy.incremental = true;
    const found = [];
    try {
      for (const ch of this.channels) {
        const s = this._chState(ch);
        let entries = null;
        try { entries = await this._rss(ch); s.rssOk = true; } catch { s.rssOk = false; }

        if (entries) {
          const newOnes = entries.filter(e => !this.videos.has('yt_' + e.id));
          if (newOnes.length && this.apiKey) {
            const hints = new Map(newOnes.filter(e => e.short).map(e => [e.id, 'short']));
            found.push(...await this.ingestIds(newOnes.map(e => e.id), hints).catch(err => { this.log.warn('[Catalog] ingest', err.message); return []; }));
          }
        } else if (this.apiKey && Date.now() - (s.lastApiPoll || 0) > this.apiFallbackMs) {
          // RSS unreachable: poll newest uploads via Data API (3 units per channel)
          s.lastApiPoll = Date.now();
          for (const p of PLAYLIST_KINDS) {
            try {
              const page = await this.api('playlistItems', { part: 'contentDetails', playlistId: p.prefix + ch.ytChannelId.slice(2), maxResults: p.kind === 'live' ? '5' : '15' });
              const ids = (page.items || []).map(i => i.contentDetails.videoId).filter(id => !this.videos.has('yt_' + id));
              if (ids.length) found.push(...await this.ingestIds(ids, new Map(ids.map(id => [id, p.kind]))));
            } catch (e) {
              if (e.status !== 404) { this.lastError = e.message; break; }
            }
          }
        }
        s.lastCheck = Date.now();
      }
      this.state.lastIncremental = Date.now();
      this.dirty = true;
      return { status: 'complete', newVideos: found.length };
    } finally {
      this.busy.incremental = false;
      this.save();
    }
  }

  /** Refresh view/like counts for the newest videos (cheap: 1 unit per 50). */
  async refreshStats(limit = 500) {
    if (!this.apiKey) return;
    const ids = this.sorted.filter(v => v.source === 'catalog').slice(0, limit).map(v => v.videoId);
    try {
      for (let i = 0; i < ids.length; i += 50) {
        const data = await this.api('videos', { part: 'statistics', id: ids.slice(i, i + 50).join(','), maxResults: '50' });
        for (const it of data.items || []) {
          const v = this.videos.get('yt_' + it.id);
          if (!v) continue;
          v.views = parseInt(it.statistics.viewCount || v.views || 0, 10);
          v.likes = v.baseLikes = parseInt(it.statistics.likeCount || v.likes || 0, 10);
        }
      }
      this.sorted.forEach(v => { v.time = timeAgo(v.timestamp); });
      this.dirty = true;
      this.save();
    } catch (e) {
      this.log.warn('[Catalog] Stats refresh skipped:', e.message);
    }
  }

  /** Channel avatars, banners and subscriber counts (1 unit for up to 50 channels). */
  async refreshChannelInfo() {
    if (!this.apiKey || !this.channels.length) return;
    try {
      for (let i = 0; i < this.channels.length; i += 50) {
        const batch = this.channels.slice(i, i + 50);
        const data = await this.api('channels', { part: 'snippet,statistics,brandingSettings', id: batch.map(c => c.ytChannelId).join(','), maxResults: '50' });
        for (const it of data.items || []) {
          const ch = this.channels.find(c => c.ytChannelId === it.id);
          if (!ch) continue;
          ch.avatarUrl = bestThumb(it.snippet.thumbnails, '');
          ch.coverUrl = (it.brandingSettings && it.brandingSettings.image && it.brandingSettings.image.bannerExternalUrl) ? it.brandingSettings.image.bannerExternalUrl + '=w2120-fcrop64=1,00005a57ffffa5a8-k-c0xffffffff-no-nd-rj' : (ch.coverUrl || '');
          ch.subscribers = parseInt(it.statistics.subscriberCount || '0', 10);
          ch.totalVideos = parseInt(it.statistics.videoCount || '0', 10);
          ch.description = safeText((it.snippet.description || '').slice(0, 500));
          ch.handle = safeText(it.snippet.customUrl || '');
        }
      }
      this.dirty = true;
      this.save();
    } catch (e) {
      this.log.warn('[Catalog] Channel info refresh skipped:', e.message);
    }
  }

  // ---------- playlists ----------
  /** Each channel's public playlists (1 API unit per channel, refreshed daily). */
  async refreshPlaylists(force = false) {
    if (!this.apiKey) return;
    if (!force && Date.now() - (this.playlists.updatedAt || 0) < 24 * 3600 * 1000 && this.playlists.items.length) return;
    const items = [];
    try {
      for (const ch of this.channels) {
        const d = await this.api('playlists', { part: 'snippet,contentDetails', channelId: ch.ytChannelId, maxResults: '50' });
        for (const p of d.items || []) {
          const count = (p.contentDetails && p.contentDetails.itemCount) || 0;
          if (!count) continue;
          items.push({
            id: p.id,
            title: safeText(decodeHtml(p.snippet.title || 'Playlist')),
            description: safeText((p.snippet.description || '').slice(0, 300)),
            thumbnail: bestThumb(p.snippet.thumbnails, ''),
            itemCount: count,
            channel: ch.name,
            channelId: ch.ytChannelId,
            category: ch.category,
            publishedAt: p.snippet.publishedAt ? Date.parse(p.snippet.publishedAt) : 0
          });
        }
        await sleep(100);
      }
      this.playlists = { updatedAt: Date.now(), items };
      this._writeJson('playlists.json', this.playlists);
    } catch (e) {
      this.log.warn('[Catalog] Playlist refresh skipped:', e.message);
    }
  }

  queryPlaylists({ channel = '', category = '', q = '', page = 1, limit = 24 } = {}) {
    const names = new Set(this.channels.map(c => c.name));
    let list = this.playlists.items.filter(p => names.has(p.channel));
    if (channel) list = list.filter(p => p.channel === channel);
    if (category) list = list.filter(p => (p.category || '').toLowerCase() === category.toLowerCase());
    if (q) { const t = q.toLowerCase(); list = list.filter(p => `${p.title} ${p.channel}`.toLowerCase().includes(t)); }
    list = [...list].sort((a, b) => (b.publishedAt || 0) - (a.publishedAt || 0));
    const size = Math.min(60, Math.max(1, limit | 0));
    const pg = Math.max(1, page | 0);
    return { items: list.slice((pg - 1) * size, pg * size), total: list.length, page: pg, hasMore: pg * size < list.length };
  }

  /** Videos of one playlist (only playlists of featured channels; cached for 6 hours). */
  async playlistVideos(playlistId) {
    const meta = this.playlists.items.find(p => p.id === playlistId);
    if (!meta) return null;
    const cached = this.playlistItemCache.get(playlistId);
    if (cached && Date.now() - cached.at < 6 * 3600 * 1000) return { playlist: meta, items: cached.items };
    const ids = [];
    let token = '';
    for (let i = 0; i < 4; i++) {
      const d = await this.api('playlistItems', { part: 'contentDetails', playlistId, maxResults: '50', ...(token ? { pageToken: token } : {}) });
      (d.items || []).forEach(it => it.contentDetails && ids.push(it.contentDetails.videoId));
      token = d.nextPageToken;
      if (!token) break;
    }
    const missing = ids.filter(id => !this.videos.has('yt_' + id));
    if (missing.length) {
      const details = await this._fetchVideoDetails(missing.slice(0, 200));
      this._upsert(details.filter(it => this._channelFor(it.snippet.channelId, it.snippet.channelTitle)).map(it => this._buildRecord(it, null)));
    }
    const items = ids.map(id => this.get('yt_' + id)).filter(Boolean).map(v => ({ ...v, time: timeAgo(v.timestamp) }));
    if (this.playlistItemCache.size > 300) this.playlistItemCache.clear();
    this.playlistItemCache.set(playlistId, { at: Date.now(), items });
    return { playlist: meta, items };
  }

  // ---------- WebSub (instant push from YouTube) ----------
  websubCallbackUrl() { return this.publicBaseUrl ? `${this.publicBaseUrl}/api/websub/youtube` : ''; }

  async websubSubscribeAll() {
    const callback = this.websubCallbackUrl();
    if (!callback) return;
    for (const ch of this.channels) {
      const body = new URLSearchParams({
        'hub.callback': callback,
        'hub.topic': `https://www.youtube.com/xml/feeds/videos.xml?channel_id=${ch.ytChannelId}`,
        'hub.verify': 'async',
        'hub.mode': 'subscribe',
        'hub.lease_seconds': String(5 * 24 * 3600),
        ...(this.websubSecret ? { 'hub.secret': this.websubSecret } : {})
      });
      try {
        await fetch('https://pubsubhubbub.appspot.com/subscribe', { method: 'POST', body, signal: AbortSignal.timeout(10000) });
      } catch (e) {
        this.log.warn('[WebSub] subscribe failed for', ch.name, e.message);
      }
    }
    this.log.log(`[WebSub] Subscription requests sent for ${this.channels.length} channels.`);
  }

  websubVerify(query) {
    const topic = String(query['hub.topic'] || '');
    const m = /channel_id=(UC[\w-]{22})/.exec(topic);
    if (!m || !this.channels.some(c => c.ytChannelId === m[1])) return null;
    return String(query['hub.challenge'] || '');
  }

  async websubNotify(rawBody, signatureHeader) {
    if (this.websubSecret) {
      const expected = 'sha1=' + crypto.createHmac('sha1', this.websubSecret).update(rawBody).digest('hex');
      const got = String(signatureHeader || '');
      if (got.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(got), Buffer.from(expected))) return false;
    }
    const xml = rawBody.toString('utf8');
    const ids = [...xml.matchAll(/<yt:videoId>([\w-]{11})<\/yt:videoId>/g)].map(m => m[1]);
    if (ids.length) await this.ingestIds(ids).catch(e => this.log.warn('[WebSub] ingest', e.message));
    return true;
  }

  // ---------- scheduling ----------
  start() {
    const every = (ms, fn) => this.timers.push(setInterval(() => fn().catch(e => this.log.warn(e.message)), ms));
    setTimeout(async () => {
      await this.refreshChannelInfo();
      await this.runIncremental().catch(e => this.log.warn('[Catalog] incremental', e.message));
      this.runBackfill();
      this.websubSubscribeAll();
      setTimeout(() => this.refreshPlaylists(), 60 * 1000);
    }, 1000);
    every(this.syncIntervalMs, () => this.runIncremental());
    every(30 * 60 * 1000, () => this.runBackfill());          // resumes after quota reset
    every(6 * 3600 * 1000, () => this.refreshStats());
    every(24 * 3600 * 1000, () => this.refreshChannelInfo());
    every(6 * 3600 * 1000, () => this.refreshPlaylists());
    every(4 * 24 * 3600 * 1000, () => this.websubSubscribeAll());
    every(60 * 1000, async () => this.save());
  }

  stop() { this.timers.forEach(clearInterval); this.save(true); }

  // ---------- admin operations ----------
  addChannel({ name, ytChannelId, category }) {
    if (!/^UC[\w-]{22}$/.test(ytChannelId || '')) throw new Error('Invalid YouTube channel ID (must start with UC and be 24 characters)');
    const clean = safeText(String(name || '').trim().slice(0, 100));
    if (!clean) throw new Error('Channel name is required');
    if (this.channels.some(c => c.ytChannelId === ytChannelId)) throw new Error('Channel already exists');
    const ch = { name: clean, ytChannelId, category: safeText(String(category || 'General').trim().slice(0, 50)) };
    this.channels.push(ch);
    this.dirty = true;
    this._rebuild();
    this.save();
    this.refreshChannelInfo();
    this.runBackfill();
    return ch;
  }

  updateChannel(ytChannelId, patch) {
    const ch = this.channels.find(c => c.ytChannelId === ytChannelId);
    if (!ch) throw new Error('Channel not found');
    const oldName = ch.name;
    if (patch.category) ch.category = safeText(String(patch.category).trim().slice(0, 50));
    if (patch.name) ch.name = safeText(String(patch.name).trim().slice(0, 100));
    for (const v of this.videos.values()) {
      if (v.channelId === ytChannelId || v.channel === oldName) { v.channel = ch.name; v.category = ch.category; }
    }
    this.dirty = true; this._rebuild(); this.save();
    return ch;
  }

  removeChannel(ytChannelId) {
    const idx = this.channels.findIndex(c => c.ytChannelId === ytChannelId);
    if (idx < 0) throw new Error('Channel not found');
    const [removed] = this.channels.splice(idx, 1);
    for (const [id, v] of this.videos) if (v.channelId === ytChannelId) this.videos.delete(id);
    delete this.state.channels[ytChannelId];
    this.dirty = true; this._rebuild(); this.save();
    return removed;
  }

  resyncChannel(ytChannelId) {
    const ch = this.channels.find(c => c.ytChannelId === ytChannelId);
    if (!ch) throw new Error('Channel not found');
    this.state.channels[ytChannelId] = { playlists: {} };
    this.dirty = true;
    this.runBackfill();
    return ch;
  }

  addCustomVideo(v) {
    const ytId = (String(v.videoUrl || '').match(/(?:youtu\.be\/|v=|shorts\/|embed\/)([\w-]{11})/) || [])[1];
    const id = ytId ? 'yt_' + ytId : 'adm_' + crypto.randomBytes(6).toString('hex');
    const isShort = Boolean(v.isShort || v.isReel || /\/shorts\//.test(v.videoUrl || ''));
    const ts = Number(v.timestamp) || Date.now();
    const rec = {
      id, videoId: ytId || '',
      title: safeText(String(v.title || 'Untitled').slice(0, 200)),
      channel: safeText(String(v.channel || 'JTube').slice(0, 100)),
      channelId: '',
      category: safeText(String(v.category || 'General').slice(0, 50)),
      views: Math.max(0, parseInt(v.views, 10) || 0),
      likes: 0, baseLikes: 0, comments: [],
      duration: String(v.duration || '0:00').slice(0, 12),
      timestamp: ts, time: timeAgo(ts),
      thumbnail: /^https:\/\//.test(v.thumbnail || '') ? String(v.thumbnail).slice(0, 500) : (ytId ? `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg` : ''),
      description: safeText(String(v.description || '').slice(0, 2000)),
      playlist: safeText(String(v.playlist || '').slice(0, 100)),
      isShort, isReel: isShort, contentType: isShort ? 'reel' : 'video',
      videoUrl: /^https:\/\//.test(v.videoUrl || '') ? String(v.videoUrl).slice(0, 500) : '',
      source: 'admin'
    };
    this.hidden.delete(id);
    this._upsert([rec]);
    this.save();
    return rec;
  }

  hideVideos(ids) {
    let n = 0;
    for (const id of ids) {
      if (typeof id !== 'string' || id.length > 64) continue;
      const v = this.videos.get(id);
      if (v && v.source === 'admin') this.videos.delete(id); else this.hidden.add(id);
      n++;
    }
    this.dirty = true; this._rebuild(); this.save();
    return n;
  }

  // ---------- queries ----------
  get(id) {
    const v = this.videos.get(id);
    return v && !this.hidden.has(id) ? v : null;
  }

  query({ type = 'all', category = '', channel = '', q = '', sort = 'latest', page = 1, limit = 24, since = 0 } = {}) {
    let list = this.sorted;
    if (type === 'short') list = list.filter(v => v.isShort);
    else if (type === 'video') list = list.filter(v => !v.isShort);
    if (category) { const c = category.toLowerCase(); list = list.filter(v => (v.category || '').toLowerCase() === c); }
    if (channel) list = list.filter(v => v.channel === channel);
    if (since) list = list.filter(v => (v.timestamp || 0) > since);
    if (q) {
      const terms = q.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 8);
      list = list.filter(v => terms.every(t => v._s.includes(t)));
    }
    if (sort === 'popular') list = [...list].sort((a, b) => (b.views || 0) - (a.views || 0));
    else if (sort === 'oldest') list = [...list].reverse();
    const total = list.length;
    const size = Math.min(100, Math.max(1, limit | 0));
    const p = Math.max(1, page | 0);
    const items = list.slice((p - 1) * size, p * size).map(v => ({ ...v, time: timeAgo(v.timestamp) }));
    return { items, total, page: p, limit: size, hasMore: p * size < total };
  }

  stats() {
    let shorts = 0, views = 0;
    const cats = {};
    this.sorted.forEach(v => {
      cats[v.category] = (cats[v.category] || 0) + 1;
      if (v.isShort) shorts++;
      views += v.views || 0;
    });
    const bf = this.backfillProgress();
    return {
      total: this.sorted.length,
      videos: this.sorted.length - shorts,
      shorts,
      views,
      categories: cats,
      channels: this.channels.length,
      lastIncremental: this.state.lastIncremental || 0,
      backfill: bf,
      newest: this.sorted[0] ? this.sorted[0].timestamp : 0
    };
  }

  publicChannels() {
    const counts = {};
    this.sorted.forEach(v => { counts[v.channel] = (counts[v.channel] || 0) + 1; });
    return this.channels.map(c => ({
      name: c.name, ytChannelId: c.ytChannelId, category: c.category,
      avatarUrl: c.avatarUrl || '', coverUrl: c.coverUrl || '', subscribers: c.subscribers || 0,
      totalVideos: c.totalVideos || 0, handle: c.handle || '', description: c.description || '',
      videosInCatalog: counts[c.name] || 0
    }));
  }

  adminStatus() {
    return {
      ...this.stats(),
      quota: { day: this.state.quota.day, used: this.state.quota.used, limit: this.quotaLimit },
      busy: this.busy,
      lastError: this.lastError,
      apiKeyConfigured: Boolean(this.apiKey),
      websub: Boolean(this.websubCallbackUrl()),
      syncIntervalMinutes: Math.round(this.syncIntervalMs / 60000),
      channels: this.publicChannels().map(c => {
        const s = this.state.channels[c.ytChannelId] || { playlists: {} };
        const pl = s.playlists || {};
        return {
          ...c,
          lastCheck: s.lastCheck || 0,
          rssOk: s.rssOk !== false,
          backfillDone: PLAYLIST_KINDS.every(p => pl[p.prefix] && pl[p.prefix].done),
          fetched: PLAYLIST_KINDS.reduce((n, p) => n + ((pl[p.prefix] && pl[p.prefix].fetched) || 0), 0)
        };
      })
    };
  }
}

module.exports = { Catalog, DEFAULT_CHANNELS, PLAYLIST_KINDS, timeAgo, formatDuration, isoDurationToSeconds, safeText, decodeHtml, bestThumb };
