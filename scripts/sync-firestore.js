#!/usr/bin/env node
'use strict';
/**
 * JTube YouTube → Firestore sync (runs on GitHub Actions every 30 minutes, or by hand).
 *
 *   FIREBASE_SERVICE_ACCOUNT   service-account JSON (or a path to the JSON file)
 *   YOUTUBE_API_KEY            YouTube Data API v3 key
 *   FIREBASE_PROJECT_ID        default "jeyatube"
 *   YOUTUBE_QUOTA_LIMIT        API units to use per day (default 9000 of Google's 10,000)
 *   DAILY_WRITE_LIMIT          Firestore writes per day (default 18000; free tier is 20,000)
 *   MAX_RUN_SECONDS            stop a run after this many seconds (default 540)
 *
 * What it does each run:
 *   1. new uploads of every channel (RSS, with Data API fallback)  → videos/{id}
 *   2. continues importing ALL older videos/Shorts/lives (UULF/UUSH/UULV playlists)
 *   3. channel info (daily), playlists (daily, rotating), view counts (every 6 h)
 *   4. public/stats, public/channels and sync/state for the admin studio
 */
const fs = require('fs');
const { FirestoreRest } = require('../lib/firestore-rest');
const { DEFAULT_CHANNELS, PLAYLIST_KINDS, formatDuration, isoDurationToSeconds, safeText, decodeHtml, bestThumb } = require('../lib/catalog');

const API = 'https://www.googleapis.com/youtube/v3';
const env = (k, d) => (process.env[k] !== undefined && process.env[k] !== '' ? process.env[k] : d);
const PROJECT = env('FIREBASE_PROJECT_ID', 'jeyatube');
const YT_KEY = env('YOUTUBE_API_KEY', '');
const QUOTA_LIMIT = parseInt(env('YOUTUBE_QUOTA_LIMIT', '9000'), 10);
const DAILY_WRITES = parseInt(env('DAILY_WRITE_LIMIT', '18000'), 10);
const MAX_RUN_MS = parseInt(env('MAX_RUN_SECONDS', '540'), 10) * 1000;
const API_FALLBACK_MS = 30 * 60 * 1000;
const started = Date.now();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

function loadServiceAccount() {
  const raw = env('FIREBASE_SERVICE_ACCOUNT', '');
  if (!raw) return null;
  try { return JSON.parse(raw.trim().startsWith('{') ? raw : fs.readFileSync(raw, 'utf8')); }
  catch (e) { throw new Error('FIREBASE_SERVICE_ACCOUNT is not valid JSON'); }
}

const db = new FirestoreRest({ projectId: PROJECT, serviceAccount: loadServiceAccount() });

// ---------------- state & budgets ----------------
let state;
const quotaDay = () => new Date(Date.now() - 8 * 3600 * 1000).toISOString().slice(0, 10); // YouTube resets at Pacific midnight
const utcDay = () => new Date().toISOString().slice(0, 10);                               // Firestore free tier resets at Pacific midnight too; close enough
function quotaLeft() {
  if (state.quota.day !== quotaDay()) state.quota = { day: quotaDay(), used: 0 };
  return QUOTA_LIMIT - state.quota.used;
}
function writesLeft() {
  if (state.writes.day !== utcDay()) state.writes = { day: utcDay(), count: 0 };
  return DAILY_WRITES - state.writes.count;
}
const timeLeft = () => MAX_RUN_MS - (Date.now() - started);

async function yt(resource, params, cost = 1) {
  if (!YT_KEY) throw new Error('YOUTUBE_API_KEY is not set');
  if (quotaLeft() < cost) throw Object.assign(new Error('Daily YouTube quota budget reached'), { quota: true });
  state.quota.used += cost;
  const res = await fetch(`${API}/${resource}?${new URLSearchParams({ ...params, key: YT_KEY })}`, { signal: AbortSignal.timeout(30000) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const reason = body.error && body.error.errors && body.error.errors[0] && body.error.errors[0].reason;
    if (reason === 'quotaExceeded' || reason === 'dailyLimitExceeded') { state.quota.used = QUOTA_LIMIT; throw Object.assign(new Error('YouTube quota exceeded'), { quota: true }); }
    throw Object.assign(new Error((body.error && body.error.message) || `YouTube HTTP ${res.status}`), { status: res.status });
  }
  return body;
}

async function write(ops) {
  if (!ops.length) return;
  await db.commit(ops);
  state.writes.count += ops.length;
}

// ---------------- records ----------------
function keywords(...texts) {
  const words = new Set();
  texts.join(' ').toLowerCase().split(/[^\p{L}\p{N}]+/u).forEach(w => { if (w.length >= 2 && w.length <= 30) words.add(w); });
  return Array.from(words).slice(0, 60);
}

function buildRecord(item, kind, ch) {
  const sn = item.snippet || {}, cd = item.contentDetails || {}, st = item.statistics || {};
  const seconds = isoDurationToSeconds(cd.duration);
  const isShort = kind === 'short' || (kind == null && seconds > 0 && seconds <= 60);
  const timestamp = sn.publishedAt ? Date.parse(sn.publishedAt) : Date.now();
  const likes = parseInt(st.likeCount || '0', 10);
  const title = safeText(decodeHtml(sn.title || 'Untitled'));
  return {
    id: 'yt_' + item.id, videoId: item.id, title,
    channel: ch.name, channelId: ch.ytChannelId, category: ch.category || 'General',
    views: parseInt(st.viewCount || '0', 10), likes, baseLikes: likes,
    duration: formatDuration(seconds), seconds, timestamp,
    thumbnail: bestThumb(sn.thumbnails, item.id),
    description: safeText((sn.description || '').slice(0, 600)),
    isShort, isReel: isShort, isLive: kind === 'live', contentType: isShort ? 'reel' : 'video',
    videoUrl: isShort ? `https://www.youtube.com/shorts/${item.id}` : `https://www.youtube.com/watch?v=${item.id}`,
    keywords: keywords(title, ch.name, ch.category || ''),
    source: 'catalog', updatedAt: Date.now()
  };
}

async function details(ids) {
  const out = [];
  for (let i = 0; i < ids.length; i += 50) {
    const d = await yt('videos', { part: 'snippet,contentDetails,statistics', id: ids.slice(i, i + 50).join(','), maxResults: '50' });
    out.push(...(d.items || []).filter(it => it.snippet && it.snippet.liveBroadcastContent !== 'upcoming'));
  }
  return out;
}

async function classify(items, hints) {
  const kinds = new Map();
  for (const it of items) {
    if (hints.has(it.id)) { kinds.set(it.id, hints.get(it.id)); continue; }
    const sec = isoDurationToSeconds(it.contentDetails && it.contentDetails.duration);
    if (it.snippet.liveBroadcastContent === 'live') { kinds.set(it.id, 'live'); continue; }
    if (sec === 0 || sec > 180) { kinds.set(it.id, 'video'); continue; }
    try {
      const r = await yt('playlistItems', { part: 'id', playlistId: 'UUSH' + it.snippet.channelId.slice(2), videoId: it.id, maxResults: '1' });
      kinds.set(it.id, (r.items || []).length ? 'short' : 'video');
    } catch (e) {
      if (e.quota) throw e;
      kinds.set(it.id, sec <= 60 ? 'short' : 'video');
    }
  }
  return kinds;
}

/** Fetch + store the given YouTube ids for a channel; skips ids already stored or hidden. */
async function ingest(ch, ids, hints = new Map()) {
  ids = [...new Set(ids)].filter(id => !hidden.has('yt_' + id));
  if (!ids.length) return 0;
  const have = await db.existing('videos', ids.map(id => 'yt_' + id));
  const missing = ids.filter(id => !have.has('yt_' + id));
  if (!missing.length || writesLeft() < missing.length) return 0;
  const items = (await details(missing)).filter(it => it.snippet.channelId === ch.ytChannelId);
  const kinds = await classify(items, hints);
  await write(items.map(it => ({ path: `videos/yt_${it.id}`, data: buildRecord(it, kinds.get(it.id), ch) })));
  return items.length;
}

// ---------------- steps ----------------
async function rss(ch) {
  const res = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${ch.ytChannelId}`, { headers: { 'User-Agent': 'Mozilla/5.0 JTubeSync/1.0' }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error('RSS HTTP ' + res.status);
  const xml = await res.text();
  return xml.split('<entry>').slice(1).map(e => {
    const id = (e.match(/<yt:videoId>(.*?)<\/yt:videoId>/) || [])[1];
    const link = (e.match(/<link rel="alternate" href="([^"]+)"/) || [])[1] || '';
    return id ? { id, short: link.includes('/shorts/') } : null;
  }).filter(Boolean);
}

function chState(ch) {
  const s = state.channels[ch.ytChannelId] || (state.channels[ch.ytChannelId] = {});
  s.playlists = s.playlists || {};
  s.recent = s.recent || [];
  return s;
}

async function incremental(channels) {
  let added = 0;
  for (const ch of channels) {
    if (timeLeft() < 60000) break;
    const s = chState(ch);
    try {
      let entries = null;
      try { entries = await rss(ch); s.rssOk = true; } catch { s.rssOk = false; }
      if (entries) {
        const fresh = entries.filter(e => !s.recent.includes(e.id));
        if (fresh.length) added += await ingest(ch, fresh.map(e => e.id), new Map(fresh.filter(e => e.short).map(e => [e.id, 'short'])));
        s.recent = entries.map(e => e.id).concat(s.recent).filter((v, i, a) => a.indexOf(v) === i).slice(0, 80);
      } else if (Date.now() - (s.lastApiPoll || 0) > API_FALLBACK_MS) {
        s.lastApiPoll = Date.now();
        for (const p of PLAYLIST_KINDS) {
          try {
            const page = await yt('playlistItems', { part: 'contentDetails', playlistId: p.prefix + ch.ytChannelId.slice(2), maxResults: p.kind === 'live' ? '5' : '15' });
            const ids = (page.items || []).map(i => i.contentDetails.videoId).filter(id => !s.recent.includes(id));
            if (ids.length) added += await ingest(ch, ids, new Map(ids.map(id => [id, p.kind])));
            s.recent = ids.concat(s.recent).slice(0, 80);
          } catch (e) { if (e.quota) throw e; if (e.status !== 404) throw e; }
        }
      }
      s.lastCheck = Date.now();
    } catch (e) {
      if (e.quota) throw e;
      log('incremental', ch.name, e.message);
    }
  }
  state.lastIncremental = Date.now();
  return added;
}

async function backfill(channels) {
  let pages = 0, added = 0;
  outer:
  for (const ch of channels) {
    const s = chState(ch);
    for (const p of PLAYLIST_KINDS) {
      const ps = s.playlists[p.prefix] || (s.playlists[p.prefix] = { done: false, pageToken: '', fetched: 0 });
      while (!ps.done) {
        if (quotaLeft() < 300 || writesLeft() < 120 || timeLeft() < 90000) break outer;
        let page;
        try {
          page = await yt('playlistItems', { part: 'contentDetails', playlistId: p.prefix + ch.ytChannelId.slice(2), maxResults: '50', ...(ps.pageToken ? { pageToken: ps.pageToken } : {}) });
        } catch (e) {
          if (e.status === 404) { ps.done = true; ps.empty = true; break; }
          throw e;
        }
        const ids = (page.items || []).map(i => i.contentDetails && i.contentDetails.videoId).filter(Boolean);
        added += await ingest(ch, ids, new Map(ids.map(id => [id, p.kind])));
        ps.fetched += ids.length;
        ps.pageToken = page.nextPageToken || '';
        ps.done = !page.nextPageToken;
        pages++;
        if (pages % 10 === 0) await saveState();
      }
    }
  }
  return { pages, added };
}

async function channelInfo(channels) {
  if (Date.now() - (state.lastChannelInfo || 0) < 24 * 3600 * 1000 && !state.forceChannelInfo) return;
  const info = {};
  for (let i = 0; i < channels.length; i += 50) {
    const d = await yt('channels', { part: 'snippet,statistics,brandingSettings', id: channels.slice(i, i + 50).map(c => c.ytChannelId).join(','), maxResults: '50' });
    (d.items || []).forEach(it => { info[it.id] = it; });
  }
  state.channelInfo = {};
  for (const ch of channels) {
    const it = info[ch.ytChannelId];
    if (!it) continue;
    const banner = it.brandingSettings && it.brandingSettings.image && it.brandingSettings.image.bannerExternalUrl;
    state.channelInfo[ch.ytChannelId] = {
      avatarUrl: bestThumb(it.snippet.thumbnails, ''),
      coverUrl: banner ? banner + '=w2120-fcrop64=1,00005a57ffffa5a8-k-c0xffffffff-no-nd-rj' : '',
      subscribers: parseInt(it.statistics.subscriberCount || '0', 10),
      totalVideos: parseInt(it.statistics.videoCount || '0', 10),
      handle: safeText(it.snippet.customUrl || ''),
      description: safeText((it.snippet.description || '').slice(0, 500))
    };
  }
  state.lastChannelInfo = Date.now();
  state.forceChannelInfo = false;
}

async function refreshViews() {
  if (Date.now() - (state.lastViews || 0) < 6 * 3600 * 1000 || writesLeft() < 300) return;
  // newest videos of each channel (ids we know from RSS)
  const ids = Object.values(state.channels).flatMap(s => (s.recent || []).slice(0, 8)).filter(id => !hidden.has('yt_' + id)).slice(0, 250);
  const have = await db.existing('videos', ids.map(id => 'yt_' + id));
  const known = ids.filter(id => have.has('yt_' + id));
  const chById = new Map(currentChannels.map(c => [c.ytChannelId, c]));
  const items = await details(known);
  const ops = [];
  for (const it of items) {
    const ch = chById.get(it.snippet.channelId);
    if (!ch) continue;
    // keep the stored Short/video classification
    const doc = await db.get(`videos/yt_${it.id}`);
    const kind = doc && doc.isShort ? 'short' : (doc && doc.isLive ? 'live' : 'video');
    ops.push({ path: `videos/yt_${it.id}`, data: buildRecord(it, kind, ch) });
  }
  await write(ops);
  state.lastViews = Date.now();
}

async function playlists(channels) {
  if (writesLeft() < 300 || quotaLeft() < 400) return;
  const due = Date.now() - (state.lastPlaylists || 0) > 24 * 3600 * 1000;
  if (!due && !state.playlistQueue?.length) return;
  if (due) {
    const queue = [];
    for (const ch of channels) {
      let token = '';
      for (let i = 0; i < 4; i++) {
        const d = await yt('playlists', { part: 'snippet,contentDetails', channelId: ch.ytChannelId, maxResults: '50', ...(token ? { pageToken: token } : {}) });
        for (const p of d.items || []) {
          const count = (p.contentDetails && p.contentDetails.itemCount) || 0;
          if (!count) continue;
          const title = safeText(decodeHtml(p.snippet.title || 'Playlist'));
          queue.push({
            id: p.id, title, description: safeText((p.snippet.description || '').slice(0, 300)),
            thumbnail: bestThumb(p.snippet.thumbnails, ''), itemCount: count,
            channel: ch.name, channelId: ch.ytChannelId, category: ch.category || 'General',
            publishedAt: p.snippet.publishedAt ? Date.parse(p.snippet.publishedAt) : 0,
            keywords: keywords(title, ch.name)
          });
        }
        token = d.nextPageToken;
        if (!token) break;
      }
    }
    state.playlistQueue = queue;
    state.lastPlaylists = Date.now();
  }
  // Fill in the video ids for up to 120 playlists per run (rotating)
  const ops = [];
  while (state.playlistQueue.length && ops.length < 120 && quotaLeft() > 400 && timeLeft() > 60000) {
    const p = state.playlistQueue.shift();
    const ids = [];
    let token = '';
    for (let i = 0; i < 4; i++) {
      try {
        const d = await yt('playlistItems', { part: 'contentDetails,status', playlistId: p.id, maxResults: '50', ...(token ? { pageToken: token } : {}) });
        (d.items || []).forEach(it => { if (it.status && it.status.privacyStatus === 'public') ids.push(it.contentDetails.videoId); });
        token = d.nextPageToken;
        if (!token) break;
      } catch (e) { if (e.quota) throw e; break; }
    }
    ops.push({ path: `playlists/${p.id}`, data: { ...p, videoIds: ids.map(id => 'yt_' + id), publicCount: ids.length, updatedAt: Date.now() } });
  }
  await write(ops);
}

async function removeChannels(channels) {
  const keep = new Set(channels.map(c => c.ytChannelId));
  for (const id of Object.keys(state.channels)) {
    if (keep.has(id)) continue;
    while (writesLeft() > 500 && timeLeft() > 60000) {
      const ids = await db.idsWhere('videos', 'channelId', id, 400);
      if (!ids.length) { delete state.channels[id]; break; }
      await write(ids.map(v => ({ path: `videos/${v}`, delete: true })));
    }
  }
}

async function stats(channels) {
  const total = await db.count('videos');
  const shorts = await db.count('videos', [['isShort', true]]);
  const categories = {};
  for (const cat of [...new Set(channels.map(c => c.category || 'General'))]) categories[cat] = await db.count('videos', [['category', cat]]);
  const perChannel = {};
  if (Date.now() - (state.lastChannelCounts || 0) > 3 * 3600 * 1000) {
    for (const ch of channels) perChannel[ch.ytChannelId] = await db.count('videos', [['channelId', ch.ytChannelId]]);
    state.channelCounts = perChannel;
    state.lastChannelCounts = Date.now();
  }
  await write([
    { path: 'public/stats', data: { total, shorts, videos: total - shorts, categories, updatedAt: Date.now(), lastIncremental: state.lastIncremental || 0 } },
    { path: 'public/channels', data: { updatedAt: Date.now(), list: channels.map(ch => ({
      name: ch.name, ytChannelId: ch.ytChannelId, category: ch.category || 'General',
      ...(state.channelInfo && state.channelInfo[ch.ytChannelId] || {}),
      videosInCatalog: (state.channelCounts || {})[ch.ytChannelId] || 0
    })) } }
  ]);
}

async function saveState() {
  const total = currentChannels.length * PLAYLIST_KINDS.length;
  let done = 0;
  const channels = {};
  for (const ch of currentChannels) {
    const s = chState(ch);
    const doneHere = PLAYLIST_KINDS.filter(p => s.playlists[p.prefix] && s.playlists[p.prefix].done).length;
    done += doneHere;
    channels[ch.ytChannelId] = { ...s, backfillDone: doneHere === PLAYLIST_KINDS.length, fetched: PLAYLIST_KINDS.reduce((n, p) => n + ((s.playlists[p.prefix] || {}).fetched || 0), 0) };
  }
  state.channels = channels;
  state.backfill = { done, total, complete: done === total };
  state.quotaLimit = QUOTA_LIMIT;
  state.writeLimit = DAILY_WRITES;
  await db.commit([{ path: 'sync/state', data: state }]);
}

// ---------------- main ----------------
let hidden = new Set();
let currentChannels = [];

(async () => {
  state = (await db.get('sync/state')) || {};
  state.quota = state.quota || { day: quotaDay(), used: 0 };
  state.writes = state.writes || { day: utcDay(), count: 0 };
  state.channels = state.channels || {};
  state.lastError = '';

  const cfg = await db.get('config/channels');
  currentChannels = (cfg && Array.isArray(cfg.list) && cfg.list.length ? cfg.list : DEFAULT_CHANNELS)
    .filter(c => c && /^UC[\w-]{22}$/.test(c.ytChannelId || '') && c.name);
  if (!cfg) await write([{ path: 'config/channels', data: { list: currentChannels.map(c => ({ name: c.name, ytChannelId: c.ytChannelId, category: c.category })), updatedAt: Date.now() } }]);

  // Admin requested a full re-import of some channels
  const resync = currentChannels.filter(c => c.resync);
  if (resync.length) {
    resync.forEach(c => { state.channels[c.ytChannelId] = { recent: [] }; delete c.resync; });
    state.forceChannelInfo = true;
    await write([{ path: 'config/channels', data: { list: currentChannels, updatedAt: Date.now() } }]);
  }
  hidden = new Set(await db.listIds('hidden_videos'));

  try {
    await removeChannels(currentChannels);
    await channelInfo(currentChannels);
    const added = await incremental(currentChannels);
    log(`new uploads: ${added}`);
    await refreshViews();
    await playlists(currentChannels);
    const bf = await backfill(currentChannels);
    log(`backfill: ${bf.pages} page(s), ${bf.added} new`);
  } catch (e) {
    state.lastError = e.message;
    log('stopped:', e.message);
  }
  await stats(currentChannels);
  state.lastRun = Date.now();
  await saveState();
  log(`done — quota ${state.quota.used}/${QUOTA_LIMIT}, writes today ${state.writes.count}/${DAILY_WRITES}, firestore reads ${db.reads}`);
})().catch(e => { console.error('Sync failed:', e.message); process.exit(1); });
