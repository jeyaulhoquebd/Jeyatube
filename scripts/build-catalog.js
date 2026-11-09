#!/usr/bin/env node
'use strict';
/**
 * JTube static catalog builder.
 *
 * Builds the video library as plain JSON files in ./catalog so the whole site can be hosted
 * on any static host (Cloudflare Pages, GitHub Pages, Firebase Hosting…) with no server or
 * database. A GitHub Action runs this every few hours and commits the changes; the static host
 * then redeploys automatically.
 *
 * Output (all under ./catalog):
 *   meta.json            totals, categories, channels (avatar, subscribers…), list of monthly shards
 *   v/YYYY-MM.json       every video/Short published in that month (compact records, newest first)
 *   popular.json         the 3,000 most viewed videos
 *   id/<hex>.json        videoId → month, for deep links to old videos
 *   playlists.json       the channels' public playlists with their videos
 *   channels.json        the connected channels (edit this file to add/remove channels)
 *   state.json           import progress (so a long import continues where it stopped)
 *
 * Environment:
 *   YOUTUBE_API_KEY            required
 *   RUN_QUOTA                  YouTube API units to use per run (default 1000; 8 runs/day = 8,000 of 10,000)
 *   MAX_RUN_SECONDS            stop after this long (default 600)
 *   PLAYLIST_REFRESH_DAYS      default 7
 *   CATALOG_DIR                output folder (default ./catalog)
 *   FIREBASE_SERVICE_ACCOUNT   optional: also read channel list / hidden videos that the admin
 *                              saved in the admin studio (Firestore config/channels, hidden_videos)
 */
const fs = require('fs');
const path = require('path');
const { FirestoreRest } = require('../lib/firestore-rest');
const { DEFAULT_CHANNELS, PLAYLIST_KINDS, formatDuration, isoDurationToSeconds, safeText, decodeHtml, bestThumb } = require('../lib/catalog');

const env = (k, d) => (process.env[k] !== undefined && process.env[k] !== '' ? process.env[k] : d);
const DIR = path.resolve(env('CATALOG_DIR', path.join(__dirname, '..', 'catalog')));
const KEY = env('YOUTUBE_API_KEY', '');
const RUN_QUOTA = parseInt(env('RUN_QUOTA', '1000'), 10);
const MAX_MS = parseInt(env('MAX_RUN_SECONDS', '600'), 10) * 1000;
const PLAYLIST_DAYS = parseFloat(env('PLAYLIST_REFRESH_DAYS', '7'));
const started = Date.now();
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const timeLeft = () => MAX_MS - (Date.now() - started);
const API = 'https://www.googleapis.com/youtube/v3';

let used = 0;
const quotaLeft = () => RUN_QUOTA - used;
async function yt(resource, params, cost = 1) {
  if (!KEY) throw new Error('YOUTUBE_API_KEY is not set');
  if (quotaLeft() < cost) throw Object.assign(new Error('Run quota budget reached'), { quota: true });
  used += cost;
  const res = await fetch(`${API}/${resource}?${new URLSearchParams({ ...params, key: KEY })}`, { signal: AbortSignal.timeout(30000) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const reason = body.error && body.error.errors && body.error.errors[0] && body.error.errors[0].reason;
    if (reason === 'quotaExceeded' || reason === 'dailyLimitExceeded') throw Object.assign(new Error('YouTube daily quota exceeded'), { quota: true });
    throw Object.assign(new Error((body.error && body.error.message) || `YouTube HTTP ${res.status}`), { status: res.status });
  }
  return body;
}

// ---------------------------------------------------------------- files
const file = rel => path.join(DIR, rel);
function readJson(rel, fallback) { try { return JSON.parse(fs.readFileSync(file(rel), 'utf8')); } catch { return fallback; } }
function writeIfChanged(rel, text) {
  fs.mkdirSync(path.dirname(file(rel)), { recursive: true });
  let old = null;
  try { old = fs.readFileSync(file(rel), 'utf8'); } catch { /* new file */ }
  if (old === text) return false;
  fs.writeFileSync(file(rel), text);
  return true;
}

// ---------------------------------------------------------------- records (compact)
// i videoId · t title · u channelId · v views · l likes · d duration · p published (ms) · k 1=Short · g 1=live · x description
const month = ts => new Date(ts).toISOString().slice(0, 7);
const oneLine = s => String(s || '').replace(/\s+/g, ' ').trim();

function compact(item, kind, channelId) {
  const sn = item.snippet || {}, cd = item.contentDetails || {}, st = item.statistics || {};
  const seconds = isoDurationToSeconds(cd.duration);
  const isShort = kind === 'short' || (kind == null && seconds > 0 && seconds <= 60);
  const r = {
    i: item.id,
    t: safeText(decodeHtml(sn.title || 'Untitled')),
    u: channelId,
    v: parseInt(st.viewCount || '0', 10),
    l: parseInt(st.likeCount || '0', 10),
    d: formatDuration(seconds),
    p: sn.publishedAt ? Date.parse(sn.publishedAt) : Date.now(),
    k: isShort ? 1 : 0,
    x: safeText(oneLine(decodeHtml(sn.description)).slice(0, 140))
  };
  if (kind === 'live' || sn.liveBroadcastContent === 'live') r.g = 1;
  return r;
}

// ---------------------------------------------------------------- load existing
const videos = new Map();           // videoId -> record
let channels = [];
let state = {};
let hidden = new Set();

function loadShards() {
  let dir;
  try { dir = fs.readdirSync(file('v')); } catch { return; }
  for (const f of dir) {
    if (!f.endsWith('.json')) continue;
    try { JSON.parse(fs.readFileSync(file('v/' + f), 'utf8')).forEach(r => videos.set(r.i, r)); } catch (e) { log('bad shard', f, e.message); }
  }
}

async function loadChannelConfig() {
  let list = readJson('channels.json', null);
  if (!Array.isArray(list) || !list.length) list = DEFAULT_CHANNELS.map(c => ({ name: c.name, ytChannelId: c.ytChannelId, category: c.category }));
  const raw = env('FIREBASE_SERVICE_ACCOUNT', '');
  if (raw) {
    try {
      const sa = JSON.parse(raw.trim().startsWith('{') ? raw : fs.readFileSync(raw, 'utf8'));
      const db = new FirestoreRest({ projectId: env('FIREBASE_PROJECT_ID', 'jeyatube'), serviceAccount: sa });
      const cfg = await db.get('config/channels');
      if (cfg && Array.isArray(cfg.list) && cfg.list.length) list = cfg.list;
      hidden = new Set(await db.listIds('hidden_videos'));
      log(`read admin settings from Firestore: ${list.length} channels, ${hidden.size} hidden videos`);
    } catch (e) { log('Firestore admin settings skipped:', e.message); }
  }
  channels = list.filter(c => c && /^UC[\w-]{22}$/.test(c.ytChannelId || '') && c.name)
    .map(c => ({ name: safeText(String(c.name).slice(0, 100)), ytChannelId: c.ytChannelId, category: safeText(String(c.category || 'General').slice(0, 50)), resync: Boolean(c.resync) }));
}

// ---------------------------------------------------------------- YouTube steps
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
    } catch (e) { if (e.quota) throw e; kinds.set(it.id, sec <= 60 ? 'short' : 'video'); }
  }
  return kinds;
}

async function ingest(ch, ids, hints = new Map()) {
  ids = [...new Set(ids)].filter(id => !hidden.has(id) && !videos.has(id));
  if (!ids.length) return 0;
  const items = (await details(ids)).filter(it => it.snippet.channelId === ch.ytChannelId);
  const kinds = await classify(items, hints);
  items.forEach(it => videos.set(it.id, compact(it, kinds.get(it.id), ch.ytChannelId)));
  return items.length;
}

async function rss(ch) {
  const res = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${ch.ytChannelId}`, { headers: { 'User-Agent': 'Mozilla/5.0 JTubeCatalog/1.0' }, signal: AbortSignal.timeout(15000) });
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

async function incremental() {
  let added = 0;
  for (const ch of channels) {
    if (timeLeft() < 60000) break;
    const s = chState(ch);
    try {
      let entries = null;
      try { entries = await rss(ch); } catch { /* use the API instead */ }
      if (entries) {
        const fresh = entries.filter(e => !videos.has(e.id));
        if (fresh.length) added += await ingest(ch, fresh.map(e => e.id), new Map(fresh.filter(e => e.short).map(e => [e.id, 'short'])));
      } else {
        for (const p of PLAYLIST_KINDS) {
          try {
            const page = await yt('playlistItems', { part: 'contentDetails', playlistId: p.prefix + ch.ytChannelId.slice(2), maxResults: p.kind === 'live' ? '5' : '15' });
            const ids = (page.items || []).map(i => i.contentDetails.videoId);
            added += await ingest(ch, ids, new Map(ids.map(id => [id, p.kind])));
          } catch (e) { if (e.quota) throw e; if (e.status !== 404) throw e; }
        }
      }
    } catch (e) { if (e.quota) throw e; log('new uploads', ch.name, e.message); }
  }
  return added;
}

async function backfill() {
  let pages = 0, added = 0;
  outer:
  for (const ch of channels) {
    const s = chState(ch);
    for (const p of PLAYLIST_KINDS) {
      const ps = s.playlists[p.prefix] || (s.playlists[p.prefix] = { done: false, pageToken: '', fetched: 0 });
      while (!ps.done) {
        if (quotaLeft() < 120 || timeLeft() < 60000) break outer;
        let page;
        try {
          page = await yt('playlistItems', { part: 'contentDetails', playlistId: p.prefix + ch.ytChannelId.slice(2), maxResults: '50', ...(ps.pageToken ? { pageToken: ps.pageToken } : {}) });
        } catch (e) {
          if (e.status === 404) { ps.done = true; break; }
          throw e;
        }
        const ids = (page.items || []).map(i => i.contentDetails && i.contentDetails.videoId).filter(Boolean);
        added += await ingest(ch, ids, new Map(ids.map(id => [id, p.kind])));
        ps.fetched += ids.length;
        ps.pageToken = page.nextPageToken || '';
        ps.done = !page.nextPageToken;
        pages++;
        if (pages % 25 === 0) { writeOutputs(); log(`  …${videos.size} videos so far`); }
      }
    }
  }
  return { pages, added };
}

async function channelInfo() {
  if (Date.now() - (state.lastChannelInfo || 0) < 24 * 3600 * 1000 && Object.keys(state.channelInfo || {}).length >= channels.length) return;
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
      description: safeText(oneLine(it.snippet.description).slice(0, 400))
    };
  }
  state.lastChannelInfo = Date.now();
}

async function refreshViews() {
  if (Date.now() - (state.lastViews || 0) < 24 * 3600 * 1000) return;
  const newest = [...videos.values()].sort((a, b) => b.p - a.p).slice(0, 600).map(r => r.i);
  for (let i = 0; i < newest.length; i += 50) {
    const d = await yt('videos', { part: 'statistics', id: newest.slice(i, i + 50).join(','), maxResults: '50' });
    for (const it of d.items || []) {
      const r = videos.get(it.id);
      if (!r) continue;
      r.v = parseInt(it.statistics.viewCount || r.v || 0, 10);
      r.l = parseInt(it.statistics.likeCount || r.l || 0, 10);
    }
  }
  state.lastViews = Date.now();
}

async function playlists() {
  const due = Date.now() - (state.lastPlaylists || 0) > PLAYLIST_DAYS * 24 * 3600 * 1000;
  if (!due || quotaLeft() < 1500 || timeLeft() < 120000) return;
  const out = [];
  for (const ch of channels) {
    const metas = [];
    let token = '';
    for (let i = 0; i < 4; i++) {
      const d = await yt('playlists', { part: 'snippet,contentDetails', channelId: ch.ytChannelId, maxResults: '50', ...(token ? { pageToken: token } : {}) });
      metas.push(...(d.items || []).filter(p => p.contentDetails && p.contentDetails.itemCount));
      token = d.nextPageToken;
      if (!token) break;
    }
    for (const p of metas) {
      if (quotaLeft() < 60 || timeLeft() < 30000) { log('playlists: stopped early (budget)'); return finishPlaylists(out, false); }
      const items = [];
      let t = '';
      for (let i = 0; i < 4; i++) {
        const d = await yt('playlistItems', { part: 'snippet,status', playlistId: p.id, maxResults: '50', ...(t ? { pageToken: t } : {}) });
        (d.items || []).forEach(it => {
          if (!it.status || it.status.privacyStatus !== 'public') return;
          const id = it.snippet && it.snippet.resourceId && it.snippet.resourceId.videoId;
          if (!id) return;
          const known = videos.get(id);
          items.push(known ? { ...known, x: undefined } : { i: id, t: safeText(decodeHtml((it.snippet.title) || '')), u: it.snippet.videoOwnerChannelId || ch.ytChannelId });
        });
        t = d.nextPageToken;
        if (!t) break;
      }
      out.push({
        id: p.id, title: safeText(decodeHtml(p.snippet.title || 'Playlist')), thumbnail: bestThumb(p.snippet.thumbnails, ''),
        itemCount: p.contentDetails.itemCount, publicCount: items.length, channel: ch.name, channelId: ch.ytChannelId,
        category: ch.category, publishedAt: p.snippet.publishedAt ? Date.parse(p.snippet.publishedAt) : 0, videos: items
      });
    }
  }
  finishPlaylists(out, true);
}
function finishPlaylists(items, complete) {
  if (!items.length) return;
  state.playlistsData = items;
  if (complete) state.lastPlaylists = Date.now();
}

// ---------------------------------------------------------------- output
function writeOutputs() {
  const names = new Map(channels.map(c => [c.ytChannelId, c]));
  // drop removed channels / hidden videos
  for (const [id, r] of videos) if (!names.has(r.u) || hidden.has(id)) videos.delete(id);

  const byMonth = new Map();
  for (const r of videos.values()) {
    const m = month(r.p);
    (byMonth.get(m) || byMonth.set(m, []).get(m)).push(r);
  }
  const months = [...byMonth.keys()].sort().reverse();
  const keep = new Set();
  const shards = [];
  let views = 0, shorts = 0;
  const categories = {};
  const perChannel = {};
  const buckets = {};
  for (const m of months) {
    const arr = byMonth.get(m).sort((a, b) => b.p - a.p);
    writeIfChanged(`v/${m}.json`, JSON.stringify(arr));
    keep.add(`${m}.json`);
    const chIds = new Set();
    let sh = 0;
    for (const r of arr) {
      chIds.add(r.u);
      if (r.k) sh++;
      views += r.v || 0;
      const cat = names.get(r.u).category;
      categories[cat] = (categories[cat] || 0) + 1;
      perChannel[r.u] = (perChannel[r.u] || 0) + 1;
      const b = r.i.charCodeAt(0).toString(16);
      (buckets[b] || (buckets[b] = {}))[r.i] = m;
    }
    shorts += sh;
    shards.push({ f: m, n: arr.length, s: sh, c: [...chIds] });
  }
  try { for (const f of fs.readdirSync(file('v'))) if (!keep.has(f)) fs.unlinkSync(file('v/' + f)); } catch { /* none */ }

  // id → month buckets
  const keepBuckets = new Set();
  for (const [b, map] of Object.entries(buckets)) { writeIfChanged(`id/${b}.json`, JSON.stringify(map)); keepBuckets.add(b + '.json'); }
  try { for (const f of fs.readdirSync(file('id'))) if (!keepBuckets.has(f)) fs.unlinkSync(file('id/' + f)); } catch { /* none */ }

  // most viewed
  const popular = [...videos.values()].sort((a, b) => (b.v || 0) - (a.v || 0)).slice(0, 3000);
  writeIfChanged('popular.json', JSON.stringify(popular));

  // playlists
  if (state.playlistsData) {
    const pl = state.playlistsData.filter(p => names.has(p.channelId));
    writeIfChanged('playlists.json', JSON.stringify({ items: pl }));
  }

  // channels + meta
  writeIfChanged('channels.json', JSON.stringify(channels.map(c => ({ name: c.name, ytChannelId: c.ytChannelId, category: c.category })), null, 1) + '\n');
  let done = 0;
  for (const ch of channels) { const s = state.channels[ch.ytChannelId] || {}; for (const p of PLAYLIST_KINDS) if (s.playlists && s.playlists[p.prefix] && s.playlists[p.prefix].done) done++; }
  const metaCore = {
    version: 1,
    total: videos.size, videos: videos.size - shorts, shorts, views, categories,
    backfill: { done, total: channels.length * PLAYLIST_KINDS.length, complete: done === channels.length * PLAYLIST_KINDS.length },
    channels: channels.map(c => ({ name: c.name, ytChannelId: c.ytChannelId, category: c.category, ...(state.channelInfo && state.channelInfo[c.ytChannelId] || {}), videosInCatalog: perChannel[c.ytChannelId] || 0 })),
    shards
  };
  const old = readJson('meta.json', {});
  const { updatedAt: _u, ...oldCore } = old;
  if (JSON.stringify(oldCore) !== JSON.stringify(metaCore)) writeIfChanged('meta.json', JSON.stringify({ ...metaCore, updatedAt: Date.now() }));
  const { playlistsData, ...stateOut } = state;
  writeIfChanged('state.json', JSON.stringify(stateOut));
}

// ---------------------------------------------------------------- main
(async () => {
  fs.mkdirSync(DIR, { recursive: true });
  state = readJson('state.json', {});
  state.channels = state.channels || {};
  loadShards();
  const pl = readJson('playlists.json', null);
  if (pl && Array.isArray(pl.items)) state.playlistsData = pl.items;
  await loadChannelConfig();
  log(`loaded ${videos.size} videos, ${channels.length} channels`);

  channels.filter(c => c.resync).forEach(c => { state.channels[c.ytChannelId] = {}; });
  const live = new Set(channels.map(c => c.ytChannelId));
  Object.keys(state.channels).forEach(id => { if (!live.has(id)) delete state.channels[id]; });

  let error = '';
  try {
    await channelInfo();
    log(`new uploads: ${await incremental()}`);
    await refreshViews();
    const bf = await backfill();
    log(`backfill: ${bf.pages} page(s), ${bf.added} new`);
    await playlists();
  } catch (e) {
    error = e.message;
    log('stopped:', e.message);
  }
  writeOutputs();
  log(`done — ${videos.size} videos, ${used}/${RUN_QUOTA} API units${error ? ', ' + error : ''}`);
})().catch(e => { console.error('Catalog build failed:', e.message); process.exit(1); });
