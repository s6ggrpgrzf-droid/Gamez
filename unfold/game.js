/* UNFOLD engine — scenes, inventory, hints, modals, unfold cinematic. */
(function () {
  'use strict';

  function $(s, root) { return (root || document).querySelector(s); }
  function $$(s, root) { return Array.prototype.slice.call((root || document).querySelectorAll(s)); }
  function fmtTime(sec) {
    sec = Math.floor(sec);
    return Math.floor(sec / 60) + ':' + ('0' + (sec % 60)).slice(-2);
  }
  function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }
  function yesterdayStr() {
    var d = new Date(); d.setDate(d.getDate() - 1);
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }

  /* ---------- AI workers (Cloudflare) ----------
   * >>> Jimmy: after deploying unfold-roomwright + unfold-gamemaster in the
   * >>> Cloudflare dashboard, replace REPLACE_ME below with your workers.dev
   * >>> subdomain (the part before .workers.dev, same for both workers).
   * >>> Until then AI stays completely off and the game plays 100% offline.
   * >>> The game NEVER depends on these workers — every AI call has a
   * >>> silent local fallback. */
  var WORKERS_SUBDOMAIN = 'chaoticutopia84';
  var AI = {
    on: WORKERS_SUBDOMAIN !== 'REPLACE_ME',
    forcedBase: null, // test hook: __unfold.AI.forcedBase = 'http://127.0.0.1:PORT'
    base: function (kind) {
      if (this.forcedBase) return this.forcedBase + '/' + kind;
      if (!this.on) return null;
      return 'https://unfold-' + kind + '.' + WORKERS_SUBDOMAIN + '.workers.dev';
    }
  };
  /* fetch with timeout that NEVER throws — resolves null on any failure */
  function aiFetch(url, opts, ms) {
    return new Promise(function (resolve) {
      var done = false;
      var timer = setTimeout(function () { if (!done) { done = true; resolve(null); } }, ms || 8000);
      (opts = opts || {}).headers = opts.headers || {};
      fetch(url, opts).then(function (r) {
        if (done) return;
        done = true; clearTimeout(timer);
        if (!r.ok) { resolve(null); return; }
        r.json().then(function (j) { resolve(j); }, function () { resolve(null); });
      }, function () { if (!done) { done = true; clearTimeout(timer); resolve(null); } });
    });
  }

  /* ---------- storage ---------- */
  var store = {
    KEY: 'unfold-v1',
    data: null,
    load: function () {
      try { this.data = JSON.parse(localStorage.getItem(this.KEY)) || {}; }
      catch (e) { this.data = {}; }
      this.data.rooms = this.data.rooms || {};
      this.data.settings = this.data.settings || { mute: false, haptics: true };
      this.data.daily = this.data.daily || { last: '', streak: 0 };
      return this.data;
    },
    save: function () { try { localStorage.setItem(this.KEY, JSON.stringify(this.data)); } catch (e) {} }
  };

  /* ---------- game state ---------- */
  var G = {
    room: null, stepIdx: 0, step: null,
    inv: [], selected: null,
    taps: {}, uses: {},          // hotspot handlers for current step
    tappedLog: [], lastAct: Date.now(), // for the AI gamemaster's context
    hintTier: 0, hintReadyAt: 0, hintsUsed: 0,
    t0: 0, elapsed: 0, timerId: null, paused: false,
    idleTimer: null,
    isDaily: false
  };

  /* ---------- audio + haptics ---------- */
  function buzz(ms) {
    if (store.data.settings.haptics) Sfx.buzz(ms);
  }
  function syncToggles() {
    $('#mute-btn').textContent = store.data.settings.mute ? '🔇' : '🔊';
    $('#mute-btn').classList.toggle('off', store.data.settings.mute);
    $('#haptic-btn').classList.toggle('off', !store.data.settings.haptics);
    Sfx.setMuted(store.data.settings.mute);
  }

  /* ---------- scenes ---------- */
  function showScene(name) {
    ['menu', 'play', 'win'].forEach(function (n) {
      $('#scene-' + n).classList.toggle('hidden', n !== name);
    });
  }

  /* ---------- AI daily room ---------- */
  var dailyDef = null; // the room def behind the daily card (seeded or AI)
  var AI_SKIN_KEY = 'unfold-ai-skin';
  function aiSkinCache() {
    try { return JSON.parse(localStorage.getItem(AI_SKIN_KEY) || 'null'); } catch (e) { return null; }
  }
  function paintDailyCard() {
    var dc = $('#daily-card');
    var today = todayStr();
    var d = store.data;
    var dailyDone = d.rooms['daily-' + today] && d.rooms['daily-' + today].done;
    try {
      var dr = dailyDef || Rooms.daily(today);
      dailyDef = dr;
      $('#daily-title').textContent = dr.title + ' — daily';
      var sub;
      if (dailyDone) sub = 'Solved today. Come back tomorrow.';
      else if (dr.ai) sub = '✨ dreamed up fresh by the Roomwright';
      else sub = 'A fresh unfold, same for everyone.';
      $('#daily-sub').textContent = sub;
      dc.hidden = false;
      dc.onclick = function () { Sfx.resume(); Sfx.tap(); startRoom(dailyDef, true); };
      dc.style.opacity = dailyDone ? 0.55 : 1;
    } catch (e) { dc.hidden = true; }
  }
  function maybeFetchAIDaily() {
    if (!AI.on && !AI.forcedBase) return;
    var today = todayStr();
    var cached = aiSkinCache();
    if (cached && cached.date === today && cached.skin) {
      var def = Rooms.aiDaily(today, cached.skin);
      if (def) { dailyDef = def; paintDailyCard(); return; }
    }
    var base = AI.base('roomwright');
    if (!base) return;
    aiFetch(base + '/daily?date=' + encodeURIComponent(today), null, 8000).then(function (skin) {
      if (!skin || !skin.template) return; // silent: keep seeded daily
      var def2 = Rooms.aiDaily(today, skin);
      if (!def2) return;
      try { localStorage.setItem(AI_SKIN_KEY, JSON.stringify({ date: today, skin: skin })); } catch (e) {}
      // don't yank the card mid-play; only repaint the menu
      if (!$('#scene-menu').classList.contains('hidden')) {
        dailyDef = def2; paintDailyCard();
      } else dailyDef = def2;
    });
  }

  /* ---------- menu ---------- */
  function renderMenu() {
    var d = store.data;
    // streak
    var st = d.daily.streak;
    $('#streak-pill').hidden = !(st > 0);
    $('#streak-n').textContent = st;
    // daily card (seeded instantly; AI swaps in when it arrives)
    dailyDef = null;
    paintDailyCard();
    maybeFetchAIDaily();
    // room list
    var list = $('#room-list'); list.innerHTML = '';
    Rooms.all.forEach(function (meta) {
      var prog = d.rooms[meta.id] || {};
      var card = document.createElement('button');
      card.className = 'card room-card';
      card.innerHTML =
        '<div class="room-thumb">' + meta.thumb() + '</div>' +
        '<div class="room-meta"><div class="room-name">' + meta.title + '</div>' +
        '<div class="room-desc">' + meta.sub + '</div>' +
        (prog.done ? '<div class="room-done">✓ unfolded</div><div class="room-best">best ' + fmtTime(prog.best) + ' · ' + prog.hints + ' hints</div>' : '') +
        '</div><div class="card-cta">→</div>';
      card.onclick = function () { Sfx.resume(); Sfx.tap(); startRoom(Rooms.get(meta.id), false); };
      list.appendChild(card);
    });
    syncToggles();
  }

  /* ---------- AI shuffle: dream up a room on demand ---------- */
  var shuffling = false;
  $('#ai-shuffle').addEventListener('click', function () {
    if (shuffling) return;
    Sfx.resume(); Sfx.tap();
    var base = AI.base('roomwright');
    if (!base) {
      // AI not deployed: deal a random classic instead
      var ids = Rooms.all.map(function (m) { return m.id; });
      startRoom(Rooms.get(ids[Math.floor(Math.random() * ids.length)]), false);
      return;
    }
    shuffling = true;
    $('#shuffle-sub').textContent = '✨ dreaming…';
    aiFetch(base + '/random', null, 8000).then(function (skin) {
      shuffling = false;
      $('#shuffle-sub').textContent = 'A brand-new room, dreamed up on the spot.';
      var def = skin && Rooms.aiRandom(skin);
      if (def) { startRoom(def, false); return; }
      toast('The muse is quiet — here\u2019s a classic instead.');
      var ids2 = Rooms.all.map(function (m) { return m.id; });
      startRoom(Rooms.get(ids2[Math.floor(Math.random() * ids2.length)]), false);
    });
  });

  /* ---------- play ---------- */
  function startRoom(roomDef, isDaily) {
    G.room = roomDef; G.isDaily = !!isDaily;
    G.inv = []; G.selected = null;
    G.hintsUsed = 0;
    G.elapsed = 0; G.t0 = Date.now();
    G.stepIdx = -1;
    $('#room-title').textContent = roomDef.title + (isDaily ? ' · daily' : '');
    $('#spot').style.setProperty('--spot', roomDef.theme.spot);
    renderInv();
    showScene('play');
    startTimer();
    nextStep();
  }

  function startTimer() {
    stopTimer();
    G.timerId = setInterval(function () {
      if (!G.paused) {
        G.elapsed = (Date.now() - G.t0) / 1000;
        $('#timer').textContent = fmtTime(G.elapsed);
      }
    }, 500);
  }
  function stopTimer() { if (G.timerId) clearInterval(G.timerId); G.timerId = null; }

  function renderDots() {
    var n = G.room.steps.length, el = $('#step-dots');
    el.innerHTML = '';
    for (var i = 0; i < n; i++) {
      var d = document.createElement('i');
      if (i < G.stepIdx) d.className = 'done';
      else if (i === G.stepIdx) d.className = 'now';
      el.appendChild(d);
    }
  }

  function nextStep() {
    G.stepIdx++;
    if (G.stepIdx >= G.room.steps.length) { done(); return; }
    loadStep(G.stepIdx);
  }

  function loadStep(i) {
    var step = G.room.steps[i];
    G.step = step; G.taps = {}; G.uses = {};
    G.tappedLog = []; G.lastAct = Date.now();
    G.hintTier = 0; G.hintReadyAt = 0;
    hideHint();
    var art = $('#stage-art');
    art.classList.remove('swap'); void art.offsetWidth;
    art.innerHTML = step.scene(G.room.vars);
    art.classList.remove('hint-glow');
    art.classList.add('swap');
    renderDots();
    step.setup(api);
    if (step.intro) say(step.intro, 5200); // AI room flavor text
    armIdleGlow();
  }

  function armIdleGlow() {
    if (G.idleTimer) clearTimeout(G.idleTimer);
    G.idleTimer = setTimeout(function () {
      var art = $('#stage-art');
      if (art) art.classList.add('hint-glow');
    }, 10000);
  }
  function pokeIdle() {
    var art = $('#stage-art');
    if (art) art.classList.remove('hint-glow');
    armIdleGlow();
  }

  /* ---------- 3D stage tilt + dynamic light ---------- */
  (function initTilt() {
    var stage = $('#stage'), tilt = $('#stage-tilt');
    if (!stage || !tilt) return;
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;
    var dragging = false, moved = false, sx = 0, sy = 0, raf = 0;
    function setTilt(rx, ry) {
      rx = Math.max(-8, Math.min(8, rx));
      ry = Math.max(-8, Math.min(8, ry));
      tilt.style.setProperty('--rx', rx.toFixed(2) + 'deg');
      tilt.style.setProperty('--ry', ry.toFixed(2) + 'deg');
      /* light stays fixed in the room: highlight drifts opposite the tilt */
      stage.style.setProperty('--lx', (50 - ry * 2.4).toFixed(1) + '%');
      stage.style.setProperty('--ly', (46 - rx * 2.4).toFixed(1) + '%');
    }
    stage.addEventListener('pointerdown', function (e) {
      if (e.target.closest('[data-hot]') || e.target.closest('button')) return;
      dragging = true; moved = false; sx = e.clientX; sy = e.clientY;
    });
    window.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      var dx = e.clientX - sx, dy = e.clientY - sy;
      if (!moved && Math.abs(dx) + Math.abs(dy) < 12) return;
      if (!moved) { moved = true; tilt.classList.add('dragging'); }
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(function () { setTilt(-dy * 0.05, dx * 0.05); });
    });
    function end() {
      if (!dragging) return;
      dragging = false;
      tilt.classList.remove('dragging');
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      if (moved) {
        tilt.classList.add('snapping');
        setTilt(0, 0);
        setTimeout(function () { tilt.classList.remove('snapping'); }, 650);
      }
    }
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  })();

  /* ---------- hotspots ---------- */
  $('#stage-art').addEventListener('pointerdown', function (e) {
    Sfx.resume();
    var g = e.target.closest('[data-hot]');
    if (!g) return;
    e.preventDefault();
    pokeIdle();
    var id = g.getAttribute('data-hot');
    G.lastAct = Date.now();
    G.tappedLog.push(id);
    if (G.tappedLog.length > 30) G.tappedLog.shift();
    var use = G.uses[id];
    if (use) {
      if (G.selected === use.item) { use.fn(); return; }
      if (hasItem(use.item)) { selectItem(use.item); use.fn(); return; }
    }
    var fn = G.taps[id];
    if (fn) { Sfx.tap(); fn(); }
  });

  /* ---------- inventory ---------- */
  function renderInv() {
    var bar = $('#inventory');
    bar.hidden = G.inv.length === 0;
    bar.innerHTML = '';
    G.inv.forEach(function (it) {
      var b = document.createElement('button');
      b.className = 'inv-item' + (G.selected === it.id ? ' sel' : '');
      b.innerHTML = '<span class="ic">' + it.icon + '</span><small>' + it.name + '</small>';
      b.onclick = function (e) {
        e.stopPropagation(); Sfx.resume(); Sfx.tap();
        selectItem(G.selected === it.id ? null : it.id);
      };
      bar.appendChild(b);
    });
  }
  function selectItem(id) { G.selected = id; renderInv(); }
  function hasItem(id) { return G.inv.some(function (i) { return i.id === id; }); }
  function collect(it) {
    if (!hasItem(it.id)) { G.inv.push(it); buzz(12); }
    renderInv();
    toast('Got the ' + it.name + ' ' + it.icon);
  }
  function take(id) {
    G.inv = G.inv.filter(function (i) { return i.id !== id; });
    if (G.selected === id) G.selected = null;
    renderInv();
  }

  /* ---------- say / toast ---------- */
  var sayTimer = null;
  function say(text, ms) {
    var el = $('#say');
    el.textContent = text; el.classList.remove('hidden');
    if (sayTimer) clearTimeout(sayTimer);
    sayTimer = setTimeout(function () { el.classList.add('hidden'); }, ms || 3600);
  }
  var toastTimer = null;
  function toast(text) {
    var el = $('#toast');
    el.textContent = text; el.classList.remove('hidden');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.add('hidden'); }, 2200);
  }

  /* ---------- hints ---------- */
  var TIERS = ['Nudge', 'Hint', 'Answer'];
  /* Ask the gamemaster worker for a contextual hint. Resolves the hint
   * text, or null when AI is off/unreachable — caller falls back silently. */
  function aiHint(tier) {
    var base = AI.base('gamemaster');
    if (!base || !G.step) return Promise.resolve(null);
    var body = {
      roomTitle: G.room ? G.room.title : '',
      stepKind: G.step.kind || 'puzzle',
      stepTitle: G.step.name || '',
      clue: G.step.intro || '',
      inventory: G.inv.map(function (it) { return it.name; }),
      tapped: G.tappedLog.slice(-12),
      idleSec: Math.round((Date.now() - G.lastAct) / 1000),
      hintsUsed: G.hintsUsed,
      tier: tier,
      prewritten: G.step.hints
    };
    return aiFetch(base + '/hint', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    }, 8000).then(function (j) {
      if (j && typeof j.hint === 'string' && j.hint.trim()) return j.hint.trim().slice(0, 400);
      return null;
    });
  }
  function showHint() {
    var step = G.step;
    if (!step || !step.hints || !step.hints[0]) return;
    Sfx.resume(); Sfx.tap();
    var now = Date.now();
    if (G.hintTier > 0 && now < G.hintReadyAt) {
      var s = Math.ceil((G.hintReadyAt - now) / 1000);
      $('#hint-text').textContent = 'Breathe… the next hint unlocks in ' + s + 's.';
      $('#hint-panel').classList.remove('hidden');
      return;
    }
    G.hintsUsed++;
    var tier = Math.min(G.hintTier, 2);
    $('#hint-tier').textContent = '💡 ' + TIERS[tier];
    $('#hint-more').style.display = G.hintTier < 2 ? '' : 'none';
    $('#hint-panel').classList.remove('hidden');
    var fallback = step.hints[tier];
    if (AI.on || AI.forcedBase) {
      $('#hint-text').textContent = '✨ consulting the gamemaster…';
      aiHint(tier).then(function (t) {
        // only paint if the panel is still open on this step/tier
        if (G.step === step && !$('#hint-panel').classList.contains('hidden')) {
          $('#hint-text').textContent = t || fallback;
        }
      });
    } else {
      $('#hint-text').textContent = fallback;
    }
  }
  function hideHint() { $('#hint-panel').classList.add('hidden'); }
  $('#hint-btn').addEventListener('click', function (e) { e.stopPropagation(); showHint(); });
  $('#hint-close').addEventListener('click', function (e) { e.stopPropagation(); hideHint(); });
  $('#hint-more').addEventListener('click', function (e) {
    e.stopPropagation();
    if (G.hintTier < 2) {
      G.hintTier++;
      G.hintReadyAt = Date.now() + 10000;
      showHint();
    }
  });

  /* ---------- modals ---------- */
  function openModal(html) {
    var layer = $('#modal-layer');
    layer.innerHTML = '<div class="modal">' + html + '</div>';
    layer.classList.remove('hidden');
    return layer.firstChild;
  }
  function closeModal() { $('#modal-layer').classList.add('hidden'); $('#modal-layer').innerHTML = ''; }
  $('#modal-layer').addEventListener('pointerdown', function (e) {
    if (e.target.id === 'modal-layer') closeModal();
  });

  function codeModal(cfg) {
    var vals = [];
    for (var i = 0; i < cfg.digits; i++) vals.push(0);
    var m = openModal('<h3>' + cfg.title + '</h3><div class="sub">' + cfg.sub + '</div>' +
      '<div class="wheels">' + vals.map(function (_, i) {
        return '<div class="wheel" data-w="' + i + '">0</div>';
      }).join('') + '</div>' +
      '<button class="btn ghost small" id="m-cancel">Put it down</button>');
    var locked = false;
    m.addEventListener('pointerdown', function (e) {
      var w = e.target.closest('.wheel');
      if (!w || locked) return;
      e.stopPropagation(); Sfx.resume(); Sfx.tick();
      var i = +w.getAttribute('data-w');
      vals[i] = (vals[i] + 1) % 10;
      w.textContent = vals[i];
      w.classList.remove('shake'); w.classList.remove('spin'); void w.offsetWidth; w.classList.add('spin');
      var ok = vals.every(function (v, j) { return v === cfg.answer[j]; });
      if (ok) {
        locked = true;
        m.classList.add('solving');
        $$('.wheel', m).forEach(function (x) { x.classList.add('locked'); });
        Sfx.unlock(); buzz(25);
        setTimeout(function () { closeModal(); cfg.onSolve(); }, 650);
      }
    });
    m.querySelector('#m-cancel').onclick = function () { Sfx.tap(); closeModal(); };
  }

  function slideModal(cfg) {
    // solvable shuffle via random walks from solved
    var tiles = [1, 2, 3, 4, 5, 6, 7, 8, 0];
    var empty = 8;
    function neighbors(i) {
      var r = Math.floor(i / 3), c = i % 3, out = [];
      if (r > 0) out.push(i - 3); if (r < 2) out.push(i + 3);
      if (c > 0) out.push(i - 1); if (c < 2) out.push(i + 1);
      return out;
    }
    for (var k = 0; k < 120; k++) {
      var ns = neighbors(empty), t = ns[Math.floor(Math.random() * ns.length)];
      tiles[empty] = tiles[t]; tiles[t] = 0; empty = t;
    }
    if (tiles.every(function (v, i) { return v === [1, 2, 3, 4, 5, 6, 7, 8, 0][i]; })) {
      tiles[8] = 8; tiles[7] = 0; empty = 7;
    }
    var m = openModal('<h3>' + cfg.title + '</h3><div class="sub">' + cfg.sub + '</div>' +
      '<div class="tiles" id="tiles"></div>' +
      '<button class="btn ghost small" id="m-cancel">Put it down</button>');
    var box = m.querySelector('#tiles');
    function draw() {
      box.innerHTML = '';
      tiles.forEach(function (v, i) {
        var t = document.createElement('div');
        t.className = 'tile' + (v === 0 ? ' empty' : '');
        t.textContent = v === 0 ? '' : v;
        if (v !== 0) t.setAttribute('data-i', i);
        box.appendChild(t);
      });
    }
    function solved() {
      return tiles.every(function (v, i) { return v === [1, 2, 3, 4, 5, 6, 7, 8, 0][i]; });
    }
    var done = false;
    box.addEventListener('pointerdown', function (e) {
      var t = e.target.closest('.tile');
      if (!t || done || !t.hasAttribute('data-i')) return;
      e.stopPropagation(); Sfx.resume();
      var i = +t.getAttribute('data-i');
      if (neighbors(i).indexOf(empty) >= 0) {
        tiles[empty] = tiles[i]; tiles[i] = 0; empty = i;
        Sfx.slide(); draw();
        if (solved()) {
          done = true;
          m.classList.add('solving');
          $$('.tile', box).forEach(function (x) { if (!x.classList.contains('empty')) x.classList.add('right'); });
          Sfx.unlock(); buzz(25);
          setTimeout(function () { closeModal(); cfg.onSolve(); }, 700);
        }
      } else {
        t.classList.add('shake'); setTimeout(function () { t.classList.remove('shake'); }, 450);
        Sfx.soft();
      }
    });
    m.querySelector('#m-cancel').onclick = function () { Sfx.tap(); closeModal(); };
    draw();
  }

  function lettersModal(cfg) {
    var vals = [];
    for (var i = 0; i < cfg.count; i++) vals.push(0);
    var ABC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    var m = openModal('<h3>' + cfg.title + '</h3><div class="sub">' + cfg.sub + '</div>' +
      '<div class="wheels">' + vals.map(function (_, i) {
        return '<div class="wheel" data-w="' + i + '">A</div>';
      }).join('') + '</div>' +
      '<button class="btn ghost small" id="m-cancel">Put it down</button>');
    var locked = false;
    m.addEventListener('pointerdown', function (e) {
      var w = e.target.closest('.wheel');
      if (!w || locked) return;
      e.stopPropagation(); Sfx.resume(); Sfx.tick();
      var i = +w.getAttribute('data-w');
      vals[i] = (vals[i] + 1) % 26;
      w.textContent = ABC[vals[i]];
      w.classList.remove('spin'); void w.offsetWidth; w.classList.add('spin');
      var word = vals.map(function (v) { return ABC[v]; }).join('');
      if (word === cfg.answer) {
        locked = true;
        m.classList.add('solving');
        $$('.wheel', m).forEach(function (x) { x.classList.add('locked'); });
        Sfx.unlock(); buzz(25);
        setTimeout(function () { closeModal(); cfg.onSolve(); }, 650);
      }
    });
    m.querySelector('#m-cancel').onclick = function () { Sfx.tap(); closeModal(); };
  }

  function verseModal(lines, title) {
    var m = openModal('<h3>' + title + '</h3><div class="sub">read carefully…</div>' +
      '<div style="text-align:left;font-family:Georgia,serif;font-style:italic;line-height:2;font-size:16px;color:#e8dfc8">' +
      lines.map(function (l) {
        return '<div><b style="color:#f6d47c;font-style:normal">' + l.charAt(0) + '</b>' + l.slice(1) + '</div>';
      }).join('') + '</div><br>' +
      '<button class="btn small" id="m-cancel">Close</button>');
    m.querySelector('#m-cancel').onclick = function () { Sfx.tap(); closeModal(); };
  }

  /* the api handed to room steps */
  var api = {
    get V() { return G.room.vars; },
    hot: function (id, fn) { G.taps[id] = fn; },
    use: function (itemId, hotId, fn) { G.uses[hotId] = { item: itemId, fn: fn }; },
    collect: collect, take: take,
    has: hasItem,
    sel: function () { return G.selected; },
    code: codeModal, slide: slideModal, letters: lettersModal, verse: verseModal,
    next: function () { Sfx.chime(); buzz(20); setTimeout(nextStep, 350); },
    say: say,
    show: function (sel) { var el = $(sel); if (el) el.setAttribute('opacity', '1'); },
    hide: function (sel) { var el = $(sel); if (el) el.setAttribute('opacity', '0'); },
    addClass: function (sel, cls) { var el = $(sel); if (el) el.classList.add(cls); },
    done: function () { done(); }
  };
  /* ---------- unfold + win ---------- */
  function done() {
    stopTimer();
    if (G.idleTimer) clearTimeout(G.idleTimer);
    hideHint(); closeModal();
    $('#toast').classList.add('hidden'); // no leftover toasts over the payoff
    var room = G.room;
    // record progress
    var key = G.isDaily ? 'daily-' + todayStr() : room.id;
    var rec = store.data.rooms[key] || {};
    var secs = Math.round(G.elapsed);
    var isBest = !rec.done || secs < rec.best;
    rec.done = true;
    rec.best = isBest ? secs : rec.best;
    rec.hints = Math.min(rec.hints == null ? 99 : rec.hints, G.hintsUsed);
    store.data.rooms[key] = rec;
    var streakMsg = '';
    if (G.isDaily) {
      var dd = store.data.daily;
      if (dd.last !== todayStr()) {
        dd.streak = (dd.last === yesterdayStr()) ? dd.streak + 1 : 1;
        dd.last = todayStr();
        streakMsg = dd.streak;
      } else streakMsg = dd.streak;
      store.save();
    } else store.save();

    // cinematic: bloom + staggered layers, then SAVOR, then the sheet
    showScene('win');
    var sceneWin = $('#scene-win');
    sceneWin.classList.remove('savor', 'card-in');
    $('#win-card').classList.add('hidden');
    $('#bloom').classList.remove('go'); void $('#bloom').offsetWidth;
    $('#diorama').classList.remove('go'); void $('#diorama').offsetWidth;
    $('#diorama').innerHTML = room.diorama.svg;
    // stagger layers
    $$('#diorama .d-layer').forEach(function (l, i) { l.style.animationDelay = (0.15 + i * 0.28) + 's'; });
    $('#unfold-title').textContent = room.diorama.title;
    $('#unfold-title').classList.remove('go'); void $('#unfold-title').offsetWidth;
    $('#bloom').classList.add('go');
    $('#diorama').classList.add('go');
    $('#unfold-title').classList.add('go');
    burst(46);
    Sfx.unfold(); buzz([30, 60, 30]);

    // savor: layers settled — slow drift, golden settling sparkles
    setTimeout(function () {
      sceneWin.classList.add('savor');
      burst(22, true);
    }, 2600);

    // the stats sheet slides up as a bottom sheet — diorama stays the hero
    setTimeout(function () {
      $('#win-room').textContent = room.title + (G.isDaily ? ' · daily' : '');
      $('#win-time').textContent = fmtTime(secs);
      $('#win-hints').textContent = G.hintsUsed;
      $('#win-best').textContent = isBest ? 'NEW!' : fmtTime(rec.best);
      if (G.isDaily && streakMsg) {
        $('#win-streak').hidden = false;
        $('#win-streak-n').textContent = streakMsg;
      } else $('#win-streak').hidden = true;
      sceneWin.classList.add('card-in');
      $('#win-card').classList.remove('hidden');
      Sfx.resolve();
    }, 5000);
  }

  function burst(n, golden) {
    var box = $('#particles'); box.innerHTML = '';
    var colors = golden
      ? ['#f6d47c', '#ffe9a8', '#fff8e8', '#e8b34b']
      : ['#f6d47c', '#e8b34b', '#fff8e8', '#e88bb0', '#57c7b2'];
    n = n || 46;
    for (var i = 0; i < n; i++) {
      var p = document.createElement('div');
      p.className = 'pt';
      var ang = Math.random() * Math.PI * 2, dist = 90 + Math.random() * 190;
      p.style.setProperty('--dx', Math.cos(ang) * dist + 'px');
      p.style.setProperty('--dy', Math.sin(ang) * dist + 'px');
      p.style.background = colors[i % colors.length];
      p.style.boxShadow = '0 0 8px ' + colors[i % colors.length];
      p.style.animationDelay = (Math.random() * 0.35) + 's';
      var sz = 4 + Math.random() * 6;
      p.style.width = sz + 'px'; p.style.height = sz + 'px';
      box.appendChild(p);
    }
  }

  $('#more-btn').addEventListener('click', function () {
    Sfx.tap();
    $('#win-card').classList.add('hidden');
    // random unplayed room, else daily, else random
    var ids = Rooms.all.map(function (m) { return m.id; });
    var unplayed = ids.filter(function (id) { return !(store.data.rooms[id] && store.data.rooms[id].done); });
    var pick = unplayed.length ? unplayed[Math.floor(Math.random() * unplayed.length)] : ids[Math.floor(Math.random() * ids.length)];
    startRoom(Rooms.get(pick), false);
  });
  $('#rooms-btn').addEventListener('click', function () {
    Sfx.tap();
    $('#win-card').classList.add('hidden');
    renderMenu(); showScene('menu');
  });
  $('#back-btn').addEventListener('click', function () {
    Sfx.tap(); stopTimer();
    if (G.idleTimer) clearTimeout(G.idleTimer);
    hideHint(); closeModal();
    renderMenu(); showScene('menu');
  });

  /* ---------- global wiring ---------- */
  $('#mute-btn').addEventListener('click', function (e) {
    e.stopPropagation(); Sfx.resume();
    store.data.settings.mute = !store.data.settings.mute;
    store.save(); syncToggles(); Sfx.tap();
  });
  $('#haptic-btn').addEventListener('click', function (e) {
    e.stopPropagation(); Sfx.resume();
    store.data.settings.haptics = !store.data.settings.haptics;
    store.save(); syncToggles(); Sfx.tap(); buzz(15);
  });
  document.addEventListener('pointerdown', function () { Sfx.resume(); }, { once: true });

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      G.paused = true;
      if (G.scene === 'play') G.t0 = Date.now(); // freeze elapsed accounting
    } else {
      if (G.scene === 'play') { G.t0 = Date.now() - G.elapsed * 1000; }
      G.paused = false;
    }
  });

  /* test hook */
  window.__unfold = {
    G: G, api: api, store: store, AI: AI,
    startRoom: startRoom, nextStep: nextStep, loadStep: loadStep,
    done: done, todayStr: todayStr,
    aiFetch: aiFetch, paintDailyCard: paintDailyCard, maybeFetchAIDaily: maybeFetchAIDaily
  };
  // track current scene for pause logic
  var _showScene = showScene;
  showScene = function (name) { G.scene = name; _showScene(name); };

  /* boot */
  store.load();
  Sfx.setMuted(store.data.settings.mute);
  renderMenu();
  showScene('menu');
})();
