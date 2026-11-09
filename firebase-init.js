/**
 * Connects JTube to its Firebase project (config in env.js) and starts Google Analytics.
 * Uses the modular Firebase SDK in a separately named app, so it never interferes with
 * the site's own data layer (data.js). Respects the browser's "Do Not Track" setting.
 */
(function () {
    var cfg = (typeof ENV !== 'undefined' && ENV.FIREBASE_CONFIG) || null;
    if (!cfg || !cfg.apiKey || location.protocol === 'file:') return;

    var VERSION = '10.14.1';
    var base = 'https://www.gstatic.com/firebasejs/' + VERSION + '/';
    var dnt = navigator.doNotTrack === '1' || window.doNotTrack === '1' || navigator.globalPrivacyControl === true;

    window.JTubeFirebase = { ready: null, app: null, analytics: null };
    window.jtubeTrack = function () {}; // no-op until analytics is ready

    window.JTubeFirebase.ready = Promise.all([
        import(base + 'firebase-app.js'),
        dnt ? Promise.resolve(null) : import(base + 'firebase-analytics.js')
    ]).then(async function (mods) {
        var appMod = mods[0], an = mods[1];
        var app = appMod.getApps().find(function (a) { return a.name === 'jtube'; }) || appMod.initializeApp(cfg, 'jtube');
        window.JTubeFirebase.app = app;
        if (an && cfg.measurementId && await an.isSupported()) {
            var analytics = an.getAnalytics(app);
            window.JTubeFirebase.analytics = analytics;
            window.jtubeTrack = function (name, params) {
                try { an.logEvent(analytics, String(name).slice(0, 40), params || {}); } catch (e) {}
            };
        }
        return app;
    }).catch(function () { return null; });
})();
