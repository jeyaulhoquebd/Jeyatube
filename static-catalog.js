/**
 * JTube static catalog reader.
 *
 * The video library is a set of plain JSON files in /catalog (built by scripts/build-catalog.js),
 * so the site works on any static host (Cloudflare Pages…) with no server and no database.
 *
 *   catalog/meta.json       totals, categories, channels, monthly shard list
 *   catalog/v/YYYY-MM.json  every video / Short of that month (compact records, newest first)
 *   catalog/popular.json    the most viewed videos
 *   catalog/id/<hex>.json   videoId → month (deep links)
 *   catalog/playlists.json  playlists with their videos
 *
 * Month files are fetched lazily, newest first, and cached — a page only downloads what it shows.
 * Exposes window.StaticCatalog.
 */
(function () {
    'use strict';
    var BASE = (typeof ENV !== 'undefined' && ENV.CATALOG_BASE) || 'catalog/';
    var SC = window.StaticCatalog = { available: null, meta: null };

    function getJson(rel) {
        return fetch(BASE + rel, { cache: 'no-cache', headers: { Accept: 'application/json' } }).then(function (r) {
            // Hosts with an "index.html fallback" answer 200 text/html for missing files — treat that as missing
            if (!r.ok || (r.headers.get('content-type') || '').indexOf('json') === -1) throw new Error('missing ' + rel);
            return r.json();
        });
    }

    // ---------------------------------------------------------------- meta
    var metaPromise = null;
    function loadMeta() {
        if (!metaPromise) {
            metaPromise = getJson('meta.json').then(function (m) {
                m.chById = {};
                m.channels.forEach(function (c) { m.chById[c.ytChannelId] = c; });
                SC.meta = m; SC.available = true;
                return m;
            }).catch(function () { SC.available = false; return null; });
        }
        return metaPromise;
    }
    SC.load = loadMeta;

    // ---------------------------------------------------------------- records
    function ago(ts) { return typeof timeAgo === 'function' ? timeAgo(ts) : ''; }

    function hydrate(r, meta, fallbackChannel) {
        var ch = (meta.chById[r.u] || fallbackChannel || {});
        var isShort = Boolean(r.k);
        var id = r.i;
        return {
            id: 'yt_' + id, videoId: id, title: r.t, channel: ch.name || 'YouTube', channelId: r.u || ch.ytChannelId || '',
            category: ch.category || 'General', views: r.v || 0, likes: r.l || 0, baseLikes: r.l || 0, comments: [],
            duration: r.d || '', timestamp: r.p || 0, time: r.p ? ago(r.p) : '',
            thumbnail: 'https://i.ytimg.com/vi/' + id + '/hqdefault.jpg', description: r.x || '',
            isShort: isShort, isReel: isShort, isLive: Boolean(r.g), contentType: isShort ? 'reel' : 'video',
            videoUrl: (isShort ? 'https://www.youtube.com/shorts/' : 'https://www.youtube.com/watch?v=') + id,
            source: 'catalog'
        };
    }

    var shardCache = {}; // file -> Promise<array>
    function loadShard(f) {
        if (!shardCache[f]) shardCache[f] = getJson(f === 'popular' ? 'popular.json' : 'v/' + f + '.json').catch(function (e) { delete shardCache[f]; throw e; });
        return shardCache[f];
    }

    // ---------------------------------------------------------------- queries
    var queries = {}; // key -> { matches, order, idx, done, seen }

    function tokens(q) {
        return String(q || '').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(function (w) { return w.length >= 1; }).slice(0, 8);
    }

    function clean(v) { return String(v == null ? '' : v); }

    SC.page = async function (params) {
        var meta = await loadMeta();
        if (!meta) return null;
        var p = Object.assign({ type: 'all', sort: 'latest', page: 1, limit: 24 }, params || {});
        var limit = Math.min(100, Math.max(1, parseInt(p.limit, 10) || 24));
        var pageNo = Math.max(1, parseInt(p.page, 10) || 1);
        var toks = tokens(p.q);
        var since = Number(p.since) || 0;

        var allowed = null;
        if (p.channel) {
            allowed = {};
            meta.channels.forEach(function (c) { if (c.name === p.channel) allowed[c.ytChannelId] = 1; });
        } else if (p.category) {
            allowed = {};
            var cat = clean(p.category).toLowerCase();
            meta.channels.forEach(function (c) { if (clean(c.category).toLowerCase() === cat) allowed[c.ytChannelId] = 1; });
        }

        var key = JSON.stringify([p.type, p.category || '', p.channel || '', toks.join(' '), p.sort, since]);
        var st = queries[key];
        if (!st) {
            var order = [];
            var shardList = meta.shards.map(function (s) { return s; });
            if (p.sort === 'oldest') shardList.reverse();
            var shardOrder = shardList.filter(function (s) {
                if (since && s.f < new Date(since).toISOString().slice(0, 7)) return false;
                if (p.type === 'short' && !s.s) return false;
                if (p.type === 'video' && s.n - s.s <= 0) return false;
                if (allowed && !s.c.some(function (u) { return allowed[u]; })) return false;
                return true;
            }).map(function (s) { return s.f; });
            if (toks.length && shardOrder.length > 48) shardOrder = shardOrder.slice(0, 48); // typos must not download the whole library
            if (p.sort === 'popular' && !toks.length) order = ['popular'];
            else if (p.sort === 'popular') order = ['popular'].concat(shardOrder);
            else order = shardOrder;
            st = queries[key] = { matches: [], order: order, idx: 0, done: false, seen: {}, oldest: p.sort === 'oldest' };
        }

        function matches(r) {
            if (p.type === 'short' && !r.k) return false;
            if (p.type === 'video' && r.k) return false;
            if (allowed && !allowed[r.u]) return false;
            if (since && !(r.p > since)) return false;
            if (toks.length) {
                var ch = meta.chById[r.u];
                var hay = (r.t + ' ' + (ch ? ch.name : '') + ' ' + (ch ? ch.category : '')).toLowerCase();
                for (var i = 0; i < toks.length; i++) if (hay.indexOf(toks[i]) === -1) return false;
            }
            return true;
        }

        var need = pageNo * limit + 1;
        while (st.matches.length < need && !st.done) {
            if (st.idx >= st.order.length) { st.done = true; break; }
            var f = st.order[st.idx++];
            if (st.order[st.idx]) loadShard(st.order[st.idx]).catch(function () {}); // prefetch next
            var arr;
            try { arr = await loadShard(f); } catch (e) { continue; }
            if (st.oldest) arr = arr.slice().reverse();
            for (var j = 0; j < arr.length; j++) {
                var r = arr[j];
                if (st.seen[r.i] || !matches(r)) continue;
                st.seen[r.i] = 1;
                st.matches.push(r);
            }
        }

        var slice = st.matches.slice((pageNo - 1) * limit, pageNo * limit);
        var known = null;
        if (!toks.length && !since) {
            if (!allowed) known = p.type === 'short' ? meta.shorts : p.type === 'video' ? meta.videos : meta.total;
            else if (p.type === 'all') known = p.channel ? ((meta.channels.filter(function (c) { return c.name === p.channel; })[0] || {}).videosInCatalog) : (meta.categories[p.category] || meta.categories[Object.keys(meta.categories).filter(function (k) { return k.toLowerCase() === clean(p.category).toLowerCase(); })[0]]);
            if (p.sort === 'popular') known = Math.min(known || 3000, st.matches.length + (st.done ? 0 : 1));
        }
        var total = st.done ? st.matches.length : Math.max(st.matches.length, known || 0);
        return {
            items: slice.map(function (r) { return hydrate(r, meta); }),
            total: total, page: pageNo, limit: limit,
            hasMore: st.matches.length > pageNo * limit || !st.done
        };
    };

    // ---------------------------------------------------------------- single video
    SC.video = async function (id) {
        var meta = await loadMeta();
        if (!meta) return null;
        var vid = String(id || '').replace(/^yt_/, '');
        if (!/^[\w-]{6,20}$/.test(vid)) return null;
        var month = null;
        try {
            var bucket = await getJson('id/' + vid.charCodeAt(0).toString(16) + '.json');
            month = bucket[vid];
        } catch (e) { /* try the newest shards instead */ }
        var tryShards = month ? [month] : meta.shards.slice(0, 3).map(function (s) { return s.f; });
        for (var i = 0; i < tryShards.length; i++) {
            try {
                var arr = await loadShard(tryShards[i]);
                for (var j = 0; j < arr.length; j++) if (arr[j].i === vid) return hydrate(arr[j], meta);
            } catch (e) { /* next */ }
        }
        return null;
    };

    // ---------------------------------------------------------------- stats / channels
    SC.stats = async function () {
        var m = await loadMeta();
        return m ? { total: m.total, videos: m.videos, shorts: m.shorts, views: m.views, categories: m.categories, channels: m.channels.length, updatedAt: m.updatedAt, backfill: m.backfill } : null;
    };
    SC.channels = async function () { var m = await loadMeta(); return m ? m.channels : null; };

    // ---------------------------------------------------------------- playlists
    var plPromise = null;
    function loadPlaylists() {
        if (!plPromise) plPromise = getJson('playlists.json').then(function (d) { return d.items || []; }).catch(function () { return null; });
        return plPromise;
    }
    SC.playlists = async function (params) {
        var meta = await loadMeta();
        var all = await loadPlaylists();
        if (!meta || !all) return null;
        var p = Object.assign({ page: 1, limit: 24 }, params || {});
        var toks = tokens(p.q);
        var list = all.filter(function (x) {
            if (!x.publicCount && !(x.videos || []).length) return false;
            if (p.channel && x.channel !== p.channel) return false;
            if (toks.length) { var hay = (x.title + ' ' + x.channel).toLowerCase(); for (var i = 0; i < toks.length; i++) if (hay.indexOf(toks[i]) === -1) return false; }
            return true;
        }).sort(function (a, b) { return (b.publishedAt || 0) - (a.publishedAt || 0); });
        var limit = Math.min(60, parseInt(p.limit, 10) || 24), pg = Math.max(1, parseInt(p.page, 10) || 1);
        var slice = list.slice((pg - 1) * limit, pg * limit).map(function (x) {
            return { id: x.id, title: x.title, thumbnail: x.thumbnail, itemCount: x.publicCount || x.itemCount, channel: x.channel, channelId: x.channelId, category: x.category };
        });
        return { items: slice, total: list.length, page: pg, hasMore: pg * limit < list.length };
    };
    SC.playlist = async function (id) {
        var meta = await loadMeta();
        var all = await loadPlaylists();
        if (!meta || !all) return null;
        var x = all.filter(function (y) { return y.id === id; })[0];
        if (!x) return null;
        var fb = meta.chById[x.channelId];
        return {
            playlist: { id: x.id, title: x.title, thumbnail: x.thumbnail, itemCount: x.publicCount || x.itemCount, channel: x.channel, channelId: x.channelId },
            items: (x.videos || []).map(function (r) { return hydrate(r, meta, fb); })
        };
    };

    // start loading the small index right away
    loadMeta();
})();
