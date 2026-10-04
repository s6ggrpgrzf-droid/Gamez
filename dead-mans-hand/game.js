/* Dead Man's Hand — rendering + input. Reads DMH engine state, never mutates
 * it except through engine calls. DOM cards, canvas monster portraits.
 */
(function () {
'use strict';

/* ---------------- helpers ---------------- */
function $(id) { return document.getElementById(id); }
function readJSON(k) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
function writeJSON(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
var REDUCED = (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

function todayStr() {
  var d = new Date(), p = function (x) { return (x < 10 ? '0' : '') + x; };
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

/* ---------------- network (all fail-silent) ---------------- */
var ARCADE = 'https://gamez-arcade.chaoticutopia84.workers.dev';
var AI_URL = 'https://gamez-ai.chaoticutopia84.workers.dev/g';

function arcadeFetch(path, body, cb, timeoutMs) {
  var done = false;
  var timer = setTimeout(function () { fin(new Error('timeout')); }, timeoutMs || 10000);
  function fin(e, d) { if (done) return; done = true; clearTimeout(timer); cb(e, d); }
  try {
    fetch(ARCADE + path, body ?
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {})
      .then(function (r) { return r.json(); })
      .then(function (d) { fin(null, d); })
      .catch(function (e) { fin(e); });
  } catch (e) { fin(e); }
}

function aiPost(body, cb) {
  var done = false;
  var timer = setTimeout(function () { fin(null); }, 7000);
  function fin(t) { if (done) return; done = true; clearTimeout(timer); cb(t); }
  try {
    fetch(AI_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json(); })
      .then(function (d) { fin(d && d.text ? String(d.text).slice(0, 90) : null); })
      .catch(function () { fin(null); });
  } catch (e) { fin(null); }
}

/* ---------------- game state ---------------- */
var G = {
  st: null,           // DMH engine state
  mode: 'quick',      // 'quick' | 'daily'
  counted: true,      // daily first attempt counts; practice replays don't
  date: null, seed: 0,
  dailyInfo: null,
  tutorial: false,
  coachStep: 0, coachShown: {},
  busy: false         // input lock during animations
};
window.__dmh = G;

function show(id) {
  ['screen-menu', 'screen-game'].forEach(function (s) { $(s).classList.toggle('hidden', s !== id); });
}

/* ---------------- menu ---------------- */
function refreshMenu() {
  var best = readJSON('dmh_best_v1');
  $('menu-best').textContent = best ? ('BEST ' + best.score.toLocaleString() + ' · ' + best.rooms + '/5 ROOMS') : 'No descents yet. The crypt waits.';
  var att = G.dailyInfo ? readJSON('dmh_daily_ATTEMPT_' + G.dailyInfo.date) : null;
  if (att) {
    $('btn-daily').textContent = 'REPLAY CRYPT (PRACTICE)';
    $('daily-sub').textContent = G.dailyInfo.date + ' · scored ' + att.score + ' · practice won\'t count';
  } else {
    $('btn-daily').textContent = 'DAILY CRYPT';
    $('daily-sub').textContent = (G.dailyInfo ? G.dailyInfo.date : todayStr()) + ' · one crypt, worldwide';
  }
  $('btn-mute').textContent = AU.isMuted() ? '🔇' : '🔊';
}

function fetchDaily(cb) {
  arcadeFetch('/daily?game=dead-mans-hand', null, function (err, d) {
    var ds = todayStr();
    var s = (d && d.seed != null) ? (d.seed >>> 0) : DMH.dailySeed(ds);
    G.dailyInfo = { date: (d && d.date) || ds, seed: s };
    refreshMenu();
    if (cb) cb();
  }, 9000);
}

/* ---------------- run lifecycle ---------------- */
function startRun(mode) {
  var tutorial = false, seed;
  if (mode === 'daily') {
    seed = G.dailyInfo ? G.dailyInfo.seed : DMH.dailySeed(todayStr());
    var att = readJSON('dmh_daily_ATTEMPT_' + (G.dailyInfo ? G.dailyInfo.date : todayStr()));
    G.counted = !att;
  } else {
    var seen = readJSON('dmh_seen_v1');
    if (!seen) { tutorial = true; seed = DMH.TUTORIAL_SEED; }
    else seed = (Math.random() * 4294967296) >>> 0;
    G.counted = false;
  }
  G.mode = mode; G.tutorial = tutorial; G.coachStep = 0; G.coachShown = {}; G.busy = false;
  G.st = DMH.newRun(seed, { mode: mode === 'daily' ? 'daily' : 'quick', tutorial: tutorial });
  show('screen-game');
  $('boon-overlay').classList.add('hidden');
  $('over-overlay').classList.add('hidden');
  startRoomUI();
  if (tutorial) coach(0);
}

function startRoomUI() {
  var st = G.st;
  renderTop(); renderHand(true); renderPreview();
  drawMonster(st.monster.id, false);
  tauntFor(st.monster, st.room);
}

function tauntFor(monster, room) {
  var el = $('taunt');
  var fb = DMH.TAUNT_FALLBACKS[Math.floor(Math.random() * DMH.TAUNT_FALLBACKS.length)];
  el.textContent = '\u201C' + fb + '\u201D';
  // silent flavor: worker kind may not exist yet — fallback stands
  aiPost({ kind: 'crypt', game: 'dead-mans-hand', ctx: { monster: monster.name, room: room } }, function (t) {
    if (t && !G.st.over) el.textContent = '\u201C' + t + '\u201D';
  });
}

/* ---------------- rendering ---------------- */
function renderTop() {
  var st = G.st;
  $('room-label').textContent = 'ROOM ' + st.room + '/5' + (G.mode === 'daily' ? ' · DAILY' : '');
  $('mon-name').textContent = st.monster.name;
  var frac = Math.max(0, st.hp / st.maxHp);
  $('hpbar').firstElementChild.style.width = (frac * 100).toFixed(1) + '%';
  $('hp-num').textContent = st.hp + ' / ' + st.maxHp;
  $('pill-hands').textContent = st.handsLeft + ' HANDS';
  $('pill-disc').textContent = st.discardsLeft + ' DISC';
  $('pill-score').textContent = st.score;
}

function cardHTML(c) {
  var r = DMH.rankLabel(c.r), s = DMH.SUITS[c.s], red = DMH.isRed(c.s) ? ' red' : '';
  return '<div class="rk">' + r + '</div><div class="st">' + s + '</div>' +
    '<div class="pip">' + s + '</div><div class="br">' + r + '</div>';
}

function renderHand(dealAnim) {
  var st = G.st, box = $('hand');
  box.innerHTML = '';
  var n = st.hand.length, mid = (n - 1) / 2;
  st.hand.forEach(function (c, i) {
    var d = document.createElement('div');
    d.className = 'card' + (DMH.isRed(c.s) ? ' red' : '') + (st.selected.indexOf(i) >= 0 ? ' sel' : '') + (dealAnim ? ' deal-in' : '');
    d.innerHTML = cardHTML(c);
    var rot = (i - mid) * 3.5, lift = Math.abs(i - mid) * 3;
    d.style.transform = 'rotate(' + rot.toFixed(1) + 'deg) translateY(' + lift.toFixed(1) + 'px)';
    if (dealAnim) d.style.animationDelay = (i * 35) + 'ms';
    d.setAttribute('role', 'button');
    d.setAttribute('aria-label', DMH.rankLabel(c.r) + ' of ' + DMH.SUIT_NAMES[c.s]);
    (function (idx) { d.addEventListener('click', function () { onCardTap(idx); }); })(i);
    box.appendChild(d);
  });
  var disBtn = $('btn-discard');
  disBtn.textContent = 'DISCARD (' + st.discardsLeft + ')';
  disBtn.disabled = st.discardsLeft <= 0;
}

function renderPreview() {
  var st = G.st, el = $('preview'), btn = $('btn-play');
  var pv = DMH.preview(st);
  if (pv) {
    el.classList.remove('dim');
    var dmh = isDMHSelected(st);
    el.innerHTML = esc(pv.title) + ' — <span class="dmg">' + pv.dmg + ' dmg</span>' +
      (dmh ? ' <span class="dmg">🃏 DEAD MAN\'S HAND</span>' : '');
    btn.disabled = false;
    if (G.tutorial && !G.coachShown.tip2) { G.coachShown.tip2 = 1; coach(1); }
  } else {
    el.classList.add('dim');
    var n = st.selected.length;
    el.textContent = n === 0 ? 'Tap 5 cards' : 'Select ' + (5 - n) + ' more card' + (5 - n === 1 ? '' : 's');
    btn.disabled = true;
  }
}

function isDMHSelected(st) {
  if (st.selected.length !== 5) return false;
  return DMH.isDeadMansHand(st.selected.map(function (i) { return st.hand[i]; }));
}

/* ---------------- input ---------------- */
function onCardTap(i) {
  if (G.busy || !G.st || G.st.phase !== 'room' || G.st.over) return;
  AU.init();
  var r = DMH.select(G.st, i);
  if (!r.ok) return;
  if (r.selected) { AU.tick(); } else { AU.untick(); }
  renderHand(false); renderPreview();
  // tutorial tip 3: weak preview + discards available
  if (G.tutorial && !G.coachShown.tip3 && G.st.discardsLeft > 0 && G.st.handsLeft > 1) {
    var pv = DMH.preview(G.st);
    if (pv && pv.dmg < 40) { G.coachShown.tip3 = 1; coach(2); }
  }
}

function coach(n) {
  var tips = [
    'Tap 5 cards to build a poker hand.',
    'Pairs beat high cards — press PLAY HAND.',
    'Weak hand? Select cards, hit DISCARD to redraw.'
  ];
  var el = $('coach');
  el.textContent = tips[n];
  el.classList.remove('hidden');
  clearTimeout(coach._t);
  coach._t = setTimeout(function () { el.classList.add('hidden'); }, 4200);
}

function vibrate(pat) {
  try { if (navigator.vibrate && !REDUCED) navigator.vibrate(pat); } catch (e) {}
}

function dmgFloat(dmg, big) {
  var layer = $('dmg-layer');
  var d = document.createElement('div');
  d.className = 'dmg-float' + (big ? ' big' : '');
  d.textContent = '-' + dmg;
  d.style.left = (30 + Math.random() * 40) + '%';
  d.style.top = '30%';
  layer.appendChild(d);
  setTimeout(function () { d.remove(); }, 1100);
}

function banner(text) {
  var b = $('banner');
  b.textContent = text;
  b.classList.remove('hidden');
  // restart animation
  b.style.animation = 'none'; void b.offsetWidth; b.style.animation = '';
  clearTimeout(banner._t);
  banner._t = setTimeout(function () { b.classList.add('hidden'); }, 1700);
}

function onPlay() {
  var st = G.st;
  if (G.busy || !DMH.canPlay(st)) return;
  AU.init();
  G.busy = true;
  var pv = DMH.preview(st);
  var selIdx = st.selected.slice();
  var cardEls = Array.prototype.slice.call($('hand').children);
  var flying = selIdx.map(function (i) { return cardEls[i]; }).filter(Boolean);

  function resolve() {
    var res = DMH.play(st);
    AU.thud(res.dmg);
    var big = res.ev.rank >= 7 || res.dmg >= 120;
    vibrate(big ? [30, 50, 30] : 25);
    if (res.deadMans) {
      banner("DEAD MAN'S HAND · +50");
      AU.deadBell();
      vibrate([60, 60, 60]);
    }
    dmgFloat(res.dmg, big);
    drawMonster(st.monster.id, true);
    if (big && !REDUCED) {
      var app = $('app');
      app.classList.remove('shake'); void app.offsetWidth; app.classList.add('shake');
    }
    renderTop();
    setTimeout(function () {
      if (res.killed) onKill(res);
      else if (res.runOver) onRunOver(false);
      else { renderHand(false); renderPreview(); G.busy = false; }
    }, REDUCED ? 60 : 450);
  }

  if (!REDUCED && flying.length) {
    var arena = $('arena').getBoundingClientRect();
    var done = 0;
    flying.forEach(function (elc, k) {
      var r = elc.getBoundingClientRect();
      var dx = arena.left + arena.width / 2 - (r.left + r.width / 2);
      var dy = arena.top + arena.height / 2 - (r.top + r.height / 2);
      var an = elc.animate([
        { transform: elc.style.transform, opacity: 1 },
        { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(.4) rotate(20deg)', opacity: 0.2 }
      ], { duration: 320 + k * 40, easing: 'ease-in', fill: 'forwards' });
      an.onfinish = function () { if (++done === flying.length) { renderHand(false); resolve(); } };
    });
    setTimeout(function () { if (G.busy) { renderHand(false); resolve(); } }, 1200); // safety
  } else {
    renderHand(false);
    resolve();
  }
}

function onDiscard() {
  var st = G.st;
  if (G.busy || !st || st.phase !== 'room' || st.over) return;
  AU.init();
  var r = DMH.discard(st);
  if (!r.ok) { if (r.reason === 'select-first') coachHint('Select cards first, then DISCARD.'); return; }
  AU.whoosh();
  renderHand(true); renderPreview(); renderTop();
}

var _hintT = null;
function coachHint(t) {
  var el = $('coach');
  el.textContent = t; el.classList.remove('hidden');
  clearTimeout(_hintT); _hintT = setTimeout(function () { el.classList.add('hidden'); }, 2500);
}

function onKill(res) {
  var st = G.st;
  var kl = DMH.KILL_LINES[Math.floor(Math.random() * DMH.KILL_LINES.length)];
  $('taunt').textContent = '\u201C' + kl + '\u201D';
  renderTop();
  if (st.phase === 'over' && st.won) { onRunOver(true); return; }
  // boon picker
  var box = $('boon-choices');
  box.innerHTML = '';
  st.boonOffer.forEach(function (b, i) {
    var d = document.createElement('div');
    d.className = 'boon'; d.setAttribute('role', 'button'); d.setAttribute('tabindex', '0');
    d.innerHTML = '<b>' + esc(b.name.toUpperCase()) + '</b><span>' + esc(b.desc) + '</span>';
    (function (idx) {
      d.addEventListener('click', function () {
        AU.init(); AU.chime();
        var r = DMH.chooseBoon(st, idx);
        if (r.ok) {
          $('boon-overlay').classList.add('hidden');
          startRoomUI();
        }
        G.busy = false;
      });
    })(i);
    box.appendChild(d);
  });
  $('boon-overlay').classList.remove('hidden');
  G.busy = false;
}

function onRunOver(won) {
  var st = G.st;
  G.busy = false;
  if (won) { AU.fanfare(); winCascade(); } else { AU.sting(); }
  var best = readJSON('dmh_best_v1');
  if (!best || st.score > best.score) {
    best = { score: st.score, rooms: st.roomsCleared };
    writeJSON('dmh_best_v1', best);
  }
  writeJSON('dmh_progress_v1', { best: best.score, rooms: Math.max(best.rooms, st.roomsCleared) });
  if (!readJSON('dmh_seen_v1')) writeJSON('dmh_seen_v1', { v: 1 });

  $('over-title').textContent = won ? 'THE CRYPT IS YOURS' : 'THE HOUSE COLLECTS';
  $('over-sub').textContent = won ?
    'Five rooms cleared. Old Scratch sends his regards.' :
    ('Fell in room ' + st.room + ' to ' + st.monster.name + '. The dark keeps your chips.');
  $('over-score').textContent = st.score.toLocaleString();
  $('over-best').textContent = 'BEST ' + best.score.toLocaleString();
  show('screen-game');
  $('over-overlay').classList.remove('hidden');

  var lb = $('arc-lb');
  lb.innerHTML = '';
  if (G.mode === 'daily' && G.counted && G.dailyInfo) {
    var date = G.dailyInfo.date, board = 'daily-' + date;
    var name = '';
    try { name = (localStorage.getItem('arcade_name') || '').trim(); } catch (e) {}
    writeJSON('dmh_daily_ATTEMPT_' + date, { score: st.score });
    G.counted = false;
    var score = Math.max(1, Math.min(st.score, 99999));
    var go = function (n) {
      lb.innerHTML = '<div class="arc-lb-empty">sending…</div>';
      arcadeFetch('/score', { game: 'dead-mans-hand', board: board, name: n, score: score }, function (err, res) {
        if (res && res.top) renderBoard(res.top, res.rank, n);
        else arcadeFetch('/scores?game=dead-mans-hand&board=' + encodeURIComponent(board), null, function (e2, d2) {
          renderBoard(d2 && d2.top, 0, n);
        });
      }, 12000);
    };
    if (name) go(name);
    else {
      lb.innerHTML = '<div class="arc-lb-title">DAILY CRYPT BOARD</div><div class="arc-lb-form">' +
        '<input id="arc-lb-name" maxlength="12" placeholder="YOUR NAME" autocomplete="off">' +
        '<button id="arc-lb-go" class="btn" type="button" style="flex:0 0 auto">SAVE</button></div>';
      $('arc-lb-go').addEventListener('click', function () {
        var v = $('arc-lb-name').value.trim().slice(0, 12);
        if (!v) return;
        try { localStorage.setItem('arcade_name', v); } catch (e) {}
        go(v);
      });
    }
  }
}

function renderBoard(top, rank, me) {
  var lb = $('arc-lb'), h = '';
  if (rank > 0) h += '<div class="arc-lb-rank">GLOBAL #' + rank + '!</div>';
  h += '<div class="arc-lb-title">DAILY CRYPT — TOP 5</div>';
  if (top && top.length) {
    var medals = ['🥇', '🥈', '🥉'];
    h += top.slice(0, 5).map(function (e, i) {
      return '<div class="arc-lb-row' + (e.name === me ? ' me' : '') + '"><span>' +
        (medals[i] || (i + 1) + '.') + ' ' + esc(e.name) + '</span><b>' + Number(e.score).toLocaleString() + '</b></div>';
    }).join('');
  } else {
    h += '<div class="arc-lb-empty">Leaderboard offline — the crypt remembers anyway.</div>';
  }
  lb.innerHTML = h;
}

function winCascade() {
  if (REDUCED) return;
  var layer = $('dmg-layer');
  var suits = ['♠', '♥', '♦', '♣'];
  for (var i = 0; i < 24; i++) {
    (function (k) {
      setTimeout(function () {
        var d = document.createElement('div');
        d.className = 'dmg-float';
        d.style.fontSize = '26px';
        d.style.color = k % 2 ? '#c9a227' : '#f2ecdd';
        d.textContent = suits[k % 4];
        d.style.left = (5 + Math.random() * 85) + '%';
        d.style.top = (10 + Math.random() * 30) + '%';
        layer.appendChild(d);
        setTimeout(function () { d.remove(); }, 1100);
      }, k * 70);
    })(i);
  }
}

/* ---------------- monster portraits (canvas, bold shapes) ---------------- */
var MON = $('monster');
function setupCanvas() {
  var dpr = Math.min(2, window.devicePixelRatio || 1);
  MON.width = 240 * dpr; MON.height = 240 * dpr;
  MON.style.aspectRatio = '1';
}

function drawMonster(id, hitFlash) {
  var dpr = Math.min(2, window.devicePixelRatio || 1);
  var x = MON.getContext('2d');
  x.setTransform(dpr, 0, 0, dpr, 0, 0);
  x.clearRect(0, 0, 240, 240);
  // backdrop glow (soft vignette, not a solid box)
  var g = x.createRadialGradient(120, 118, 8, 120, 118, 105);
  g.addColorStop(0, 'rgba(164,22,26,0.20)');
  g.addColorStop(0.7, 'rgba(164,22,26,0.08)');
  g.addColorStop(1, 'rgba(164,22,26,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 240, 240);
  // stone arch
  x.strokeStyle = '#2c352a'; x.lineWidth = 10;
  x.beginPath(); x.arc(120, 128, 96, Math.PI, 0); x.stroke();
  x.beginPath(); x.moveTo(24, 128); x.lineTo(24, 220); x.moveTo(216, 128); x.lineTo(216, 220); x.stroke();

  var D = DRAW[id] || DRAW.skeleton;
  D(x);

  if (hitFlash && !REDUCED) {
    x.fillStyle = 'rgba(230,57,70,0.28)';
    x.fillRect(0, 0, 240, 240);
  }
}

var DRAW = {
  skeleton: function (x) {
    x.fillStyle = '#e8e0cc';
    x.beginPath(); x.arc(120, 105, 52, 0, 7); x.fill();           // cranium
    x.fillRect(88, 130, 64, 34);                                  // jaw block
    x.fillStyle = '#0a0d08';
    x.beginPath(); x.arc(100, 100, 13, 0, 7); x.fill();           // eyes
    x.beginPath(); x.arc(140, 100, 13, 0, 7); x.fill();
    x.beginPath(); x.moveTo(120, 116); x.lineTo(112, 132); x.lineTo(128, 132); x.fill(); // nose
    x.fillRect(94, 148, 8, 14); x.fillRect(108, 148, 8, 14); x.fillRect(122, 148, 8, 14); x.fillRect(136, 148, 8, 14); // teeth gaps
    x.strokeStyle = '#b9ac8d'; x.lineWidth = 3;
    x.beginPath(); x.moveTo(84, 78); x.lineTo(104, 92); x.stroke(); // crack
  },
  bat: function (x) {
    x.fillStyle = '#1c1026';
    x.beginPath(); x.moveTo(120, 110); x.quadraticCurveTo(60, 60, 18, 120); x.quadraticCurveTo(60, 105, 78, 140); x.quadraticCurveTo(95, 120, 120, 135); x.fill(); // left wing
    x.beginPath(); x.moveTo(120, 110); x.quadraticCurveTo(180, 60, 222, 120); x.quadraticCurveTo(180, 105, 162, 140); x.quadraticCurveTo(145, 120, 120, 135); x.fill(); // right wing
    x.fillStyle = '#2b1a3d';
    x.beginPath(); x.ellipse(120, 140, 26, 34, 0, 0, 7); x.fill(); // body
    x.beginPath(); x.moveTo(102, 118); x.lineTo(96, 92); x.lineTo(112, 108); x.fill(); // ears
    x.beginPath(); x.moveTo(138, 118); x.lineTo(144, 92); x.lineTo(128, 108); x.fill();
    x.fillStyle = '#e63946';
    x.beginPath(); x.arc(110, 132, 6, 0, 7); x.fill();            // eyes
    x.beginPath(); x.arc(130, 132, 6, 0, 7); x.fill();
    x.fillStyle = '#e8e0cc';
    x.beginPath(); x.moveTo(110, 152); x.lineTo(114, 164); x.lineTo(118, 152); x.fill(); // fangs
    x.beginPath(); x.moveTo(122, 152); x.lineTo(126, 164); x.lineTo(130, 152); x.fill();
  },
  keeper: function (x) {
    x.fillStyle = '#14100c';
    x.beginPath(); x.moveTo(120, 40); x.quadraticCurveTo(190, 60, 185, 200); x.lineTo(55, 200); x.quadraticCurveTo(50, 60, 120, 40); x.fill(); // cloak
    x.fillStyle = '#050403';
    x.beginPath(); x.ellipse(120, 108, 40, 46, 0, 0, 7); x.fill(); // hood shadow
    x.fillStyle = '#ffd166';
    x.beginPath(); x.arc(104, 104, 7, 0, 7); x.fill();             // eyes
    x.beginPath(); x.arc(136, 104, 7, 0, 7); x.fill();
    x.strokeStyle = '#c9a227'; x.lineWidth = 3;                   // lantern glow
    x.beginPath(); x.arc(120, 176, 14, 0, 7); x.stroke();
    x.fillStyle = 'rgba(201,162,39,0.5)';
    x.beginPath(); x.arc(120, 176, 8, 0, 7); x.fill();
  },
  ghoul: function (x) {
    x.fillStyle = '#7d8f5a';
    x.beginPath(); x.ellipse(120, 120, 54, 62, 0, 0, 7); x.fill(); // face
    x.fillStyle = '#2e3a1c';
    x.beginPath(); x.ellipse(100, 108, 12, 16, -0.2, 0, 7); x.fill(); // eyes
    x.beginPath(); x.ellipse(140, 108, 12, 16, 0.2, 0, 7); x.fill();
    x.fillStyle = '#101408';
    x.beginPath(); x.ellipse(120, 152, 26, 18, 0, 0, 7); x.fill(); // maw
    x.fillStyle = '#e8e0cc';
    for (var i = 0; i < 5; i++) { x.fillRect(100 + i * 9, 140, 6, 10); x.fillRect(100 + i * 9, 156, 6, 10); } // teeth
    x.strokeStyle = '#5c6b42'; x.lineWidth = 6;                   // claws
    x.beginPath(); x.moveTo(52, 170); x.lineTo(30, 200); x.moveTo(60, 180); x.lineTo(42, 214); x.stroke();
    x.beginPath(); x.moveTo(188, 170); x.lineTo(210, 200); x.moveTo(180, 180); x.lineTo(198, 214); x.stroke();
  },
  wraith: function (x) {
    x.strokeStyle = 'rgba(200,210,220,0.55)'; x.lineWidth = 9; x.lineCap = 'round';
    for (var i = 0; i < 4; i++) {                                 // wisps
      x.beginPath();
      x.moveTo(120, 200);
      x.bezierCurveTo(80 + i * 26, 160, 160 - i * 26, 120, 120, 60);
      x.stroke();
    }
    x.fillStyle = 'rgba(226,232,238,0.92)';
    x.beginPath(); x.ellipse(120, 105, 38, 48, 0, 0, 7); x.fill(); // pale face
    x.fillStyle = '#0a0d12';
    x.beginPath(); x.ellipse(105, 100, 9, 14, 0, 0, 7); x.fill();  // hollow eyes
    x.beginPath(); x.ellipse(135, 100, 9, 14, 0, 0, 7); x.fill();
    x.beginPath(); x.ellipse(120, 138, 10, 14, 0, 0, 7); x.fill(); // wail mouth
  },
  demon: function (x) {
    x.fillStyle = '#7d1015';
    x.beginPath(); x.moveTo(78, 70); x.lineTo(52, 18); x.lineTo(100, 52); x.fill(); // horns
    x.beginPath(); x.moveTo(162, 70); x.lineTo(188, 18); x.lineTo(140, 52); x.fill();
    x.beginPath(); x.ellipse(120, 125, 56, 60, 0, 0, 7); x.fill(); // face
    x.fillStyle = '#ffd166';
    x.beginPath(); x.moveTo(88, 112); x.lineTo(108, 118); x.lineTo(88, 126); x.fill(); // slanted eyes
    x.beginPath(); x.moveTo(152, 112); x.lineTo(132, 118); x.lineTo(152, 126); x.fill();
    x.fillStyle = '#2b0508';
    x.beginPath(); x.moveTo(84, 158); x.quadraticCurveTo(120, 186, 156, 158); x.quadraticCurveTo(120, 168, 84, 158); x.fill(); // grin
    x.fillStyle = '#e8e0cc';
    x.beginPath(); x.moveTo(100, 162); x.lineTo(106, 176); x.lineTo(112, 163); x.fill(); // fangs
    x.beginPath(); x.moveTo(128, 163); x.lineTo(134, 176); x.lineTo(140, 162); x.fill();
  }
};

/* ---------------- rankings sheet ---------------- */
function buildRankList() {
  var ol = $('rank-list');
  ol.innerHTML = '';
  var order = [9, 8, 7, 6, 5, 4, 3, 2, 1, 0];
  order.forEach(function (r) {
    var li = document.createElement('li');
    li.innerHTML = '<b>' + DMH.RANK_NAMES[r] + '</b> — base ' + DMH.RANK_BASE[r];
    ol.appendChild(li);
  });
}

/* ---------------- wiring ---------------- */
function wire() {
  $('btn-quick').addEventListener('click', function () { AU.init(); AU.click(); startRun('quick'); });
  $('btn-daily').addEventListener('click', function () { AU.init(); AU.click(); startRun('daily'); });
  $('btn-help').addEventListener('click', function () { AU.init(); AU.click(); $('help-sheet').classList.remove('hidden'); });
  $('btn-close-help').addEventListener('click', function () { AU.click(); $('help-sheet').classList.add('hidden'); });
  $('btn-mute').addEventListener('click', function () {
    AU.init(); AU.setMuted(!AU.isMuted());
    $('btn-mute').textContent = AU.isMuted() ? '🔇' : '🔊';
  });
  $('btn-play').addEventListener('click', onPlay);
  $('btn-discard').addEventListener('click', onDiscard);
  $('btn-rank').addEventListener('click', function () { AU.click(); $('help-sheet').classList.remove('hidden'); });
  $('btn-again').addEventListener('click', function () { AU.click(); startRun(G.mode); });
  $('btn-menu').addEventListener('click', function () { AU.click(); show('screen-menu'); refreshMenu(); });

  // audio unlock on first gesture anywhere
  var unlock = function () { AU.init(); };
  document.addEventListener('pointerdown', unlock, { once: true });

  buildRankList();
  setupCanvas();
  window.addEventListener('resize', setupCanvas);
  show('screen-menu');
  refreshMenu();
  fetchDaily();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
else wire();

})();
