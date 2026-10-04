/* PondAI client — Moss & Stone phase 7.
 * Intelligent content (koi names, proverbs, daily visitor, journal lines)
 * with silent local fallbacks for everything. The game NEVER waits on the
 * network: every method resolves, falling back to the curated banks in
 * pond-ai-banks.js on any failure (offline, timeout, bad JSON, worker down).
 * No AI branding, no user-visible loading states.
 *
 * Usage:
 *   PondAI.configure('https://pond-ai.chaoticutopia84.workers.dev');
 *   PondAI.nameFor('tancho','bold').then(function(r){ /* r.name, r.meaning, r.ai *\/ });
 *   PondAI.prefetchNames(6);            // fill the name pool at boot
 *   var n = PondAI.takeName();           // instant, may be null
 */
'use strict';

(function (global) {
  var DEFAULT_BASE = 'https://pond-ai.chaoticutopia84.workers.dev';
  var TIMEOUT_MS = 2500;
  var CACHE_KEY = 'pond-ai-cache-v1';
  var CACHE_TTL = 7 * 86400000;
  var POOL_KEY = 'pond-ai-namepool-v1';

  // Journal event kinds worth upgrading with worker content (warm, quiet voice).
  var AI_EVENTS = { hatch: 1, juvenile: 1, adult: 1, breed: 1, egg: 1, heron: 1, frog: 1, ascension: 1 };

  var base = DEFAULT_BASE;
  var memCache = {};
  var namePool = [];

  function banks() {
    return (typeof POND_AI_BANKS !== 'undefined') ? POND_AI_BANKS : null;
  }

  /* ---------- tiny helpers ---------- */

  function qs(params) {
    var parts = [];
    for (var k in params) {
      if (params[k] == null) continue;
      parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(String(params[k])));
    }
    return parts.length ? '?' + parts.join('&') : '';
  }

  // deterministic pick from an array by string key (for daily visitor fallback)
  function hashStr(s) {
    var h = 2166136261;
    s = String(s);
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  function pickSeeded(arr, key) {
    if (!arr || !arr.length) return null;
    return arr[hashStr(key) % arr.length];
  }
  function pickRandom(arr) {
    if (!arr || !arr.length) return null;
    return arr[(Math.random() * arr.length) | 0];
  }

  function cleanStr(v, maxLen) {
    if (typeof v !== 'string') return null;
    v = v.replace(/[<>&"']/g, '').trim();
    if (!v || v.length > (maxLen || 280)) return null;
    return v;
  }

  /* ---------- caches ---------- */

  function lsGet() {
    try {
      var raw = localStorage.getItem(CACHE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) { return {}; }
  }
  function lsSet(obj) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(obj)); } catch (e) {}
  }
  function cacheGet(key) {
    var now = Date.now();
    var m = memCache[key];
    if (m && now - m.at < CACHE_TTL) return m.value;
    var all = lsGet();
    var e = all[key];
    if (e && now - e.at < CACHE_TTL) {
      memCache[key] = e;
      return e.value;
    }
    return undefined;
  }
  function cacheSet(key, value) {
    var e = { value: value, at: Date.now() };
    memCache[key] = e;
    var all = lsGet();
    all[key] = e;
    // keep the cache small
    var keys = Object.keys(all);
    if (keys.length > 120) {
      keys.sort(function (a, b) { return all[a].at - all[b].at; });
      for (var i = 0; i < keys.length - 120; i++) delete all[keys[i]];
    }
    lsSet(all);
  }

  /* ---------- fetch with timeout, never rejects ---------- */

  function fetchJson(path) {
    var url = base + path;
    return new Promise(function (resolve) {
      var done = false;
      var ctrl = null;
      var timer = setTimeout(function () {
        try { if (ctrl) ctrl.abort(); } catch (e) {}
        finish(null);
      }, TIMEOUT_MS);
      function finish(v) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(v);
      }
      try {
        var opts = {};
        if (typeof AbortController !== 'undefined') {
          ctrl = new AbortController();
          opts.signal = ctrl.signal;
        }
        fetch(url, opts).then(function (r) {
          if (!r || !r.ok) { finish(null); return null; }
          return r.json();
        }).then(function (j) {
          finish(j && typeof j === 'object' ? j : null);
        }).catch(function () { finish(null); });
      } catch (e) { finish(null); }
    });
  }

  // GET with cache: cached value (worker or bank) wins, else network, else bank.
  function cachedGet(cacheKey, path, validate, fallbackFn) {
    var hit = cacheGet(cacheKey);
    if (hit !== undefined) return Promise.resolve(hit);
    return fetchJson(path).then(function (j) {
      var v = j ? validate(j) : null;
      if (v) {
        v.ai = true;
        cacheSet(cacheKey, v);
        return v;
      }
      var f = fallbackFn();
      f.ai = false;
      return f;
    });
  }

  /* ---------- bank fallbacks ---------- */

  function bankNames(personality) {
    var b = banks();
    if (!b) return [];
    if (!personality) return b.names;
    var out = [];
    for (var i = 0; i < b.names.length; i++) {
      if (b.names[i].p.indexOf(personality) >= 0) out.push(b.names[i]);
    }
    return out.length ? out : b.names;
  }

  function fallbackName(pattern, personality) {
    var e = pickRandom(bankNames(personality)) || { n: 'Koi', m: 'carp' };
    return { name: e.n, meaning: e.m };
  }

  function fallbackProverb(mood) {
    var b = banks();
    if (!b) return { text: 'Still water holds the whole sky.' };
    var pool = [];
    for (var i = 0; i < b.proverbs.length; i++) {
      var p = b.proverbs[i];
      if (!mood || !p.mood.length || p.mood.indexOf(mood) >= 0) pool.push(p);
    }
    var e = pickRandom(pool.length ? pool : b.proverbs);
    return { text: e ? e.t : 'Still water holds the whole sky.' };
  }

  function fallbackVisitor(seed) {
    var b = banks();
    var v = (b && pickSeeded(b.visitors, seed || 'x')) || { id: 'quiet', note: '' };
    return { visitor: v.id, note: v.note };
  }

  function fillSlots(tpl, vars) {
    var s = String(tpl);
    if (vars) {
      for (var k in vars) {
        s = s.split('{' + k + '}').join(String(vars[k] == null ? '' : vars[k]));
      }
    }
    return s;
  }

  function fallbackJournal(event, vars) {
    var b = banks();
    var arr = (b && b.journal && b.journal[event]) || null;
    var tpl = pickRandom(arr) || 'The pond kept its own quiet time.';
    return { text: fillSlots(tpl, vars) };
  }

  /* ---------- public API ---------- */

  var api = {
    AI_EVENTS: AI_EVENTS,

    configure: function (url) {
      if (typeof url === 'string' && url) base = url.replace(/\/+$/, '');
    },
    base: function () { return base; },

    // {name, meaning, ai} — always resolves
    nameFor: function (pattern, personality) {
      var path = '/name' + qs({ pattern: pattern, personality: personality });
      var key = 'name|' + (pattern || '') + '|' + (personality || '');
      return cachedGet(key, path,
        function (j) {
          var n = cleanStr(j.name, 24);
          var m = cleanStr(j.meaning, 80);
          return n ? { name: n, meaning: m || '' } : null;
        },
        function () { return fallbackName(pattern, personality); });
    },

    // {text, ai}
    proverb: function (mood) {
      var path = '/proverb' + qs({ mood: mood });
      var key = 'proverb|' + (mood || '');
      return cachedGet(key, path,
        function (j) {
          var t = cleanStr(j.text, 160);
          return t ? { text: t } : null;
        },
        function () { return fallbackProverb(mood); });
    },

    // {visitor, note, ai} — deterministic per seed
    dailyVisitor: function (dateSeed) {
      var seed = dateSeed || new Date().toISOString().slice(0, 10);
      var path = '/visitor' + qs({ seed: seed });
      var key = 'visitor|' + seed;
      return cachedGet(key, path,
        function (j) {
          var v = cleanStr(j.visitor, 24);
          if (!v) return null;
          return { visitor: v, note: cleanStr(j.note, 200) || '' };
        },
        function () { return fallbackVisitor(seed); });
    },

    // {text, ai} — richer journal line for an event
    journal: function (event, vars) {
      if (!AI_EVENTS[event]) return Promise.resolve({ text: '', ai: false });
      var path = '/journal' + qs(Object.assign({ event: event }, vars || {}));
      var key = 'journal|' + event + '|' + hashStr(JSON.stringify(vars || {}));
      return cachedGet(key, path,
        function (j) {
          var t = cleanStr(j.text, 280);
          return t ? { text: t } : null;
        },
        function () { return fallbackJournal(event, vars); });
    },

    // Fire-and-forget name pool: fills at boot, takeName() is instant.
    prefetchNames: function (n, personality) {
      n = n || 6;
      var self = this;
      var cached = null;
      try { cached = JSON.parse(localStorage.getItem(POOL_KEY) || 'null'); } catch (e) {}
      if (cached && cached.length) namePool = cached.slice(0, 12);
      var need = Math.max(0, n - namePool.length);
      var chain = Promise.resolve();
      for (var i = 0; i < need; i++) {
        chain = chain.then(function () {
          return self.nameFor(null, personality).then(function (r) {
            if (r && r.name && namePool.indexOf(r.name) < 0) {
              namePool.push(r.name);
              if (namePool.length > 12) namePool.shift();
              try { localStorage.setItem(POOL_KEY, JSON.stringify(namePool)); } catch (e) {}
            }
          });
        });
      }
      return chain;
    },
    takeName: function () {
      if (!namePool.length) {
        try {
          var c = JSON.parse(localStorage.getItem(POOL_KEY) || 'null');
          if (c && c.length) namePool = c.slice(0, 12);
        } catch (e) {}
      }
      var n = namePool.length ? namePool.shift() : null;
      try { localStorage.setItem(POOL_KEY, JSON.stringify(namePool)); } catch (e) {}
      return n;
    },
    poolSize: function () { return namePool.length; },
  };

  global.PondAI = api;
})(typeof window !== 'undefined' ? window : globalThis);
