/* Starlight Drums — Pass 1: the drum and the beat.
 * One song, two drums, notes falling as star-trails into converging rings.
 * The song runs on the audio clock; the canvas only follows it.
 * Sim (chart/judgment/scoring) lives in sim.js, sound in audio.js. */
(function () {
'use strict';
var SIM = window.SD_SIM, AU = window.SD_AUDIO;
var $ = function (id) { return document.getElementById(id); };

/* logical stage */
var LW = 420, LH = 740;
var DRUM_Y = 618, DRUM_R = 63;
var DRUM_X = [112, 308];
var TRAVEL = 1.75;                       // seconds a note falls
var GOOD_EARLY_S = SIM.GOOD_MS / 1000;
var GOOD_LATE_S = SIM.GOOD_LATE_MS / 1000;
var SONG_SEED = 20261021;                // Pass 1 has one song, and it is this one
var BEST_KEY = 'sd-best-v1';

var cv = $('cv'), ctx = cv.getContext('2d');
var dpr = 1, scale = 1, ox = 0, oy = 0, vw = 0, vh = 0;
var skyCv = null;

var scene = 'title';                     // title | play | done
var paused = false;
var chart = null, score = null, t0audio = 0;
var mode = 'synth';                      // 'track' when the real song plays
var wantStart = false;                   // a start tap waiting on the track load
var trackFaded = false;
var trackLoadT0 = 0;
/* Pass 3 — the habit: a small library, a daily pick, an endless rotation */
var LIB = window.SD_SONGS || [];
var playKind = 'daily';                  // 'daily' | 'free'
var dailyIdx = 0, selIdx = 0, freeIdxMem = 0, playedIdx = 0;
var playedSong = null;
var figure = null;                       // the constellation hidden in the chart
var linkA = [];                          // per-link animated brightness
var chorusWin = [];                      // [[t0, t1], ...] answering-sky windows
var barEnergies = [], barLenS = 2.05, energyNow = 0;
var shimmerAt = -9999, figPulseAt = -9999;
var ceremonyT0 = 0;
var missIdx = 0, loIdx = 0;
var drumHitAt = [-9999, -9999], drumHitStr = [0, 0];
var pops = [null, null];                 // per-drum judgment pop {kind, t0}
var flights = [];                        // stars flying home {note, fx, fy, t0, bright}
var missAnims = [];                      // stars dimming out {note, t0}
var lastProg = -1, lastStreak = -1;

/* ---- sprites (pre-rendered once; the frame loop never allocates) --------- */
function makeStarSprite(core, mid) {
  var c = document.createElement('canvas'); c.width = c.height = 96;
  var g = c.getContext('2d');
  var rg = g.createRadialGradient(48, 48, 2, 48, 48, 48);
  rg.addColorStop(0, mid); rg.addColorStop(0.35, mid.replace('0.55', '0.18')); rg.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = rg; g.fillRect(0, 0, 96, 96);
  g.fillStyle = core;
  g.beginPath();
  g.moveTo(48, 14); g.quadraticCurveTo(52, 44, 82, 48); g.quadraticCurveTo(52, 52, 48, 86);
  g.quadraticCurveTo(44, 52, 14, 48); g.quadraticCurveTo(44, 44, 48, 14);
  g.fill();
  g.fillStyle = '#ffffff';
  g.beginPath(); g.arc(48, 48, 5.5, 0, 6.2832); g.fill();
  return c;
}
var SPR = [
  makeStarSprite('#ffd98a', 'rgba(242,160,7,0.55)'),   // low drum gold
  makeStarSprite('#cfeaff', 'rgba(120,190,255,0.55)')  // high drum ice
];
/* pure radial glows for the drum halos (the star sprite's points read as fins) */
function makeGlowSprite(rgba) {
  var c = document.createElement('canvas'); c.width = c.height = 128;
  var g = c.getContext('2d');
  var rg = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  rg.addColorStop(0, rgba); rg.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = rg; g.fillRect(0, 0, 128, 128);
  return c;
}
var GLOW = [makeGlowSprite('rgba(242,160,7,0.5)'), makeGlowSprite('rgba(120,190,255,0.5)')];
function makePopSprite(text, color) {
  var c = document.createElement('canvas'); c.width = 300; c.height = 84;
  var g = c.getContext('2d');
  g.font = '800 40px Inter, system-ui, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = 'rgba(0,0,0,0.45)'; g.shadowBlur = 10;
  g.fillStyle = color; g.fillText(text, 150, 44);
  return c;
}
var POP_SPR = {
  perfect: makePopSprite('PERFECT', '#ffd968'),
  good: makePopSprite('GOOD', '#dfe8ff'),
  miss: makePopSprite('MISS', '#8d97b8')
};
/* spark pool */
var sparks = [];
for (var si = 0; si < 160; si++) sparks.push({ on: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, spr: 0, size: 10 });
function spawnSparks(x, y, spr, n, speed) {
  var done = 0;
  for (var i = 0; i < sparks.length && done < n; i++) {
    var p = sparks[i];
    if (p.on) continue;
    var a = Math.random() * 6.2832, v = (0.3 + Math.random() * 0.7) * speed;
    p.on = true; p.x = x; p.y = y;
    p.vx = Math.cos(a) * v; p.vy = Math.sin(a) * v - 30;
    p.max = 0.45 + Math.random() * 0.4; p.life = p.max;
    p.spr = spr; p.size = 7 + Math.random() * 9;
    done++;
  }
}
/* shockwave pool */
var waves = [];
for (var wi = 0; wi < 10; wi++) waves.push({ on: false, x: 0, y: 0, t0: 0, col: '' });
function spawnWave(x, y, col) {
  for (var i = 0; i < waves.length; i++) {
    if (!waves[i].on) { waves[i].on = true; waves[i].x = x; waves[i].y = y; waves[i].t0 = performance.now(); waves[i].col = col; return; }
  }
}

/* ---- sky (pre-rendered per resize) --------------------------------------- */
function buildSky() {
  skyCv = document.createElement('canvas');
  skyCv.width = Math.max(2, Math.floor(vw * dpr)); skyCv.height = Math.max(2, Math.floor(vh * dpr));
  var g = skyCv.getContext('2d');
  g.scale(dpr, dpr);
  var grad = g.createLinearGradient(0, 0, 0, vh);
  grad.addColorStop(0, '#05081a'); grad.addColorStop(0.45, '#0c1332');
  grad.addColorStop(0.78, '#1d1a45'); grad.addColorStop(1, '#2e2149');
  g.fillStyle = grad; g.fillRect(0, 0, vw, vh);
  var warm = g.createRadialGradient(vw / 2, vh * 0.92, 10, vw / 2, vh * 0.92, vw * 0.75);
  warm.addColorStop(0, 'rgba(242,160,7,0.13)'); warm.addColorStop(1, 'rgba(242,160,7,0)');
  g.fillStyle = warm; g.fillRect(0, 0, vw, vh);
  var rng = SIM.mulberry32(7);
  for (var i = 0; i < 120; i++) {
    var x = rng() * vw, y = rng() * vh * 0.72, r = 0.5 + rng() * 1.3;
    g.globalAlpha = 0.18 + rng() * 0.5;
    g.fillStyle = rng() < 0.12 ? '#ffd98a' : '#e8eeff';
    g.beginPath(); g.arc(x, y, r, 0, 6.2832); g.fill();
  }
  g.globalAlpha = 1;
  // a small moon, top right of the stage
  var mx = ox + LW * scale * 0.86, my = oy + LH * scale * 0.075, mr = 17 * scale;
  g.fillStyle = '#f4ecd2';
  g.beginPath(); g.arc(mx, my, mr, 0, 6.2832); g.fill();
  g.fillStyle = '#0a0f2c';
  g.beginPath(); g.arc(mx + mr * 0.42, my - mr * 0.3, mr * 0.86, 0, 6.2832); g.fill();
}
/* twinkling ambient stars (stage space, fixed seeds) */
var twinkles = [];
(function () {
  var rng = SIM.mulberry32(99);
  for (var i = 0; i < 16; i++) {
    twinkles.push({ x: 14 + rng() * (LW - 28), y: 16 + rng() * 330, ph: rng() * 6.28, sp: 0.6 + rng() * 1.4, spr: rng() < 0.5 ? 0 : 1 });
  }
})();

function fit() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  vw = window.innerWidth; vh = window.innerHeight;
  cv.width = Math.floor(vw * dpr); cv.height = Math.floor(vh * dpr);
  cv.style.width = vw + 'px'; cv.style.height = vh + 'px';
  scale = Math.min(vw / LW, vh / LH);
  ox = (vw - LW * scale) / 2; oy = (vh - LH * scale) / 2;
  buildSky();
}
window.addEventListener('resize', fit);

/* ---- best ---------------------------------------------------------------- */
function readBest() {
  try { return JSON.parse(localStorage.getItem(BEST_KEY) || 'null'); } catch (e) { return null; }
}

/* ---- records: daily results, per-song bests, the streak ------------------- */
var REC_KEY = 'sd-records-v1';
function todayStr() {
  var d = new Date();
  function p(n) { return (n < 10 ? '0' : '') + n; }
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}
function dateShift(str, days) {
  var d = new Date(str + 'T12:00:00');
  d.setDate(d.getDate() + days);
  function p(n) { return (n < 10 ? '0' : '') + n; }
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}
function readRecords() {
  var r = null;
  try { r = JSON.parse(localStorage.getItem(REC_KEY) || 'null'); } catch (e) {}
  if (!r || typeof r !== 'object') r = {};
  if (!r.daily) r.daily = {};
  if (!r.songs) r.songs = {};
  if (!r.streak) r.streak = { last: '', count: 0 };
  return r;
}
function saveRecords(r) {
  try { localStorage.setItem(REC_KEY, JSON.stringify(r)); } catch (e) {}
}
function currentSong() { return LIB.length ? LIB[selIdx] : null; }

/* ---- the shared arcade board (same worker + name as the other games) ------ */
var ARCADE = 'https://gamez-arcade.chaoticutopia84.workers.dev';
function arcadeFetch(path, body, cb) {
  var done = false, timer = null;
  function fin(e, d) { if (!done) { done = true; if (timer) clearTimeout(timer); cb(e, d); } }
  timer = setTimeout(function () { fin(new Error('timeout')); }, 12000);
  try {
    fetch(ARCADE + path, body ?
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {})
      .then(function (r) { return r.json(); })
      .then(function (d) { fin(null, d); })
      .catch(function (e) { fin(e); });
  } catch (e) { fin(e); }
}
function escHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function renderBoard(top, rank, me, pct) {
  var box = $('arcBox');
  box.style.display = 'block';
  var h = '<div class="arc-title">TODAY\'S SKY — THE BOARD</div>';
  if (rank > 0) h += '<div class="arc-rank">YOU\'RE #' + rank + ' TODAY</div>';
  if (top && top.length) {
    h += top.slice(0, 5).map(function (e, i) {
      return '<div class="arc-row' + (e.name === me ? ' me' : '') + '"><span>' + (i + 1) + '. ' +
        escHtml(e.name) + '</span><b>' + (e.score / 10).toFixed(1) + '%</b></div>';
    }).join('');
  } else {
    h += '<div class="arc-empty">The board is out of reach — your ' + pct.toFixed(1) + '% still stands.</div>';
  }
  box.innerHTML = h;
}
function submitDaily(g) {
  var box = $('arcBox');
  if (!box) return;
  var board = 'daily-' + todayStr();
  var sc = Math.round(g.pct * 10);
  var name = '';
  try { name = (localStorage.getItem('arcade_name') || '').trim(); } catch (e) {}
  function go(n) {
    box.style.display = 'block';
    box.innerHTML = '<div class="arc-empty">Sending your sky…</div>';
    arcadeFetch('/score', { game: 'starlight-drums', board: board, name: n, score: sc }, function (err, res) {
      if (res && res.top) renderBoard(res.top, res.rank, n, g.pct);
      else arcadeFetch('/scores?game=starlight-drums&board=' + encodeURIComponent(board), null, function (e2, d2) {
        renderBoard(d2 && d2.top, 0, n, g.pct);
      });
    });
  }
  if (name) { go(name); return; }
  box.style.display = 'block';
  box.innerHTML = '<div class="arc-title">TODAY\'S SKY — THE BOARD</div>' +
    '<div class="arc-form"><input id="arcName" maxlength="12" placeholder="YOUR NAME" autocomplete="off">' +
    '<button id="arcGo" type="button">JOIN</button></div>';
  $('arcGo').addEventListener('click', function () {
    var v = $('arcName').value.trim().slice(0, 12);
    if (!v) return;
    try { localStorage.setItem('arcade_name', v); } catch (e) {}
    go(v);
  });
}
function recordResult(g) {
  var rec = readRecords();
  var pct = Math.round(g.pct * 10) / 10;
  var sid = playedSong ? playedSong.id : 'synth';
  var fl = figureLitCount();
  if (!rec.songs[sid] || pct > rec.songs[sid].pct) {
    rec.songs[sid] = { pct: pct, letter: g.letter, fig: fl };
  }
  if (playKind === 'daily') {
    var td = todayStr();
    if (!rec.daily[td] || pct > rec.daily[td].pct) {
      rec.daily[td] = { pct: pct, letter: g.letter, fig: fl, song: sid };
    }
    if (rec.streak.last !== td) {
      rec.streak.count = (rec.streak.last === dateShift(td, -1)) ? rec.streak.count + 1 : 1;
      rec.streak.last = td;
    }
  }
  saveRecords(rec);
}
function showTitle() {
  scene = 'title';
  $('titleScr').classList.add('show');
  $('doneScr').classList.remove('show');
  $('pauseScr').classList.remove('show');
  $('pauseBtn').style.display = 'none';
  setStreak(-1);
  refreshTitle();
}
function refreshTitle() {
  var md = $('mDaily'), mf = $('mFree');
  if (md && mf) {
    md.classList.toggle('on', playKind === 'daily');
    mf.classList.toggle('on', playKind === 'free');
  }
  var s = currentSong();
  var rec = readRecords();
  var td = todayStr();
  var info;
  if (playKind === 'daily') {
    var done = rec.daily[td];
    info = 'Today · “' + (s ? s.title : 'the house song') + '”' +
      (done ? ' · cleared — ' + done.letter + ' · ' + done.pct.toFixed(1) + '%' : ' · one sky for everyone');
  } else {
    info = 'Endless · “' + (s ? s.title : 'the house song') + '” is up';
  }
  $('modeInfo').textContent = info;
  var bl = $('bestLine');
  if (rec.streak.count >= 2 && rec.streak.last >= dateShift(td, -1)) {
    bl.style.display = 'inline-block';
    bl.textContent = 'DAY STREAK · ' + rec.streak.count;
  } else {
    var b = readBest();
    if (b) {
      bl.style.display = 'inline-block';
      bl.textContent = 'BEST · ' + b.letter + ' · ' + b.pct.toFixed(1) + '% OF THE SKY LIT';
    } else bl.style.display = 'none';
  }
}
function setKind(k) {
  playKind = k;
  selIdx = (k === 'daily') ? dailyIdx : freeIdxMem;
  var s = currentSong();
  if (s && AU.trackState(s.url) === 'idle') { trackLoadT0 = performance.now(); AU.loadTrack(s.url); }
  refreshTitle();
}

/* ---- song flow ------------------------------------------------------------- */
function startSong() {
  AU.unlock();
  var song = currentSong();
  playedSong = song; playedIdx = selIdx;
  var ts = song ? AU.trackState(song.url) : 'failed';
  if (song && ts === 'idle') { trackLoadT0 = performance.now(); AU.loadTrack(song.url); ts = 'loading'; }
  if (song && ts === 'loading' && performance.now() - trackLoadT0 < 6000) { wantStart = true; return; }
  wantStart = false;
  score = SIM.createScore();
  missIdx = 0; loIdx = 0;
  flights.length = 0; missAnims.length = 0;
  pops[0] = pops[1] = null;
  drumHitAt[0] = drumHitAt[1] = -9999;
  trackFaded = false;
  $('titleScr').classList.remove('show');
  $('doneScr').classList.remove('show');
  $('pauseBtn').style.display = '';
  scene = 'play'; paused = false;
  t0audio = AU.now() + 0.45;
  var seed = SONG_SEED;
  var useTrack = (ts === 'ready' && !!song);
  if (useTrack) {
    var notes = song.notes.map(function (n) { return { t: n.t, drum: n.drum, state: 0 }; });
    SIM.assignStars(notes, (song.segStart * 1000) | 0);
    chart = { bpm: song.bpm, duration: song.duration, notes: notes, bed: [] };
    useTrack = AU.setTrack(song.url, t0audio, song.segStart, song.duration);
  }
  if (useTrack) {
    mode = 'track';
  } else {
    mode = 'synth';
    seed = song ? SIM.hashStr(song.id + ':' + playKind + ':' + (playKind === 'daily' ? todayStr() : ''))
                : SONG_SEED;
    chart = SIM.makeChart(seed);
    AU.setBed(chart, t0audio);
  }
  // the constellation hidden in this chart, and the song's energy shape
  figure = SIM.makeFigure(chart.notes, mode === 'track' ? (song.segStart * 1000 | 0) : seed);
  for (var fk = 0; fk < figure.idxs.length; fk++) {
    var fnote = chart.notes[figure.idxs[fk]];
    fnote.sx = figure.pts[fk][0]; fnote.sy = figure.pts[fk][1]; fnote.fig = fk;
  }
  linkA = figure.links.map(function () { return 0; });
  if (mode === 'track') {
    chorusWin = song.chorus || [];
    barEnergies = song.bars || [];
    barLenS = song.barLen || 2.05;
  } else {
    chorusWin = [[0.30, 0.46], [0.68, 0.86]].map(function (w) {
      return [w[0] * chart.duration, w[1] * chart.duration];
    });
    barLenS = SIM.BAR; barEnergies = [];
    var nb = Math.ceil(chart.duration / barLenS), mx = 1;
    for (var bi = 0; bi < nb; bi++) {
      var c = 0;
      for (var ni = 0; ni < chart.notes.length; ni++) {
        if (chart.notes[ni].t >= bi * barLenS && chart.notes[ni].t < (bi + 1) * barLenS) c++;
      }
      barEnergies.push(c); if (c > mx) mx = c;
    }
    barEnergies = barEnergies.map(function (c) { return c / mx; });
  }
  energyNow = 0; shimmerAt = -9999; figPulseAt = -9999;
  lastProg = -1; setStreak(0);
  // warm the next rotation song quietly so Endless never waits on a download
  if (LIB.length > 1) {
    var nx = LIB[(playedIdx + 1) % LIB.length];
    if (nx && AU.trackState(nx.url) === 'idle') AU.loadTrack(nx.url);
  }
}
/* The perceptual clock: the audio clock shifted by the output latency the
 * device reports, so the beat as HEARD is the beat that is drawn and graded. */
function songNow() { return AU.now() - t0audio - AU.latency(); }

/* The song ends; the sky gets its moment before the grade does.
 * Ceremony first (the figure sweeps alight), then results. */
function finishSong() {
  AU.stopBed();
  AU.stopTrack();
  $('progFill').style.width = '100%';
  scene = 'ceremony';
  ceremonyT0 = performance.now();
  $('pauseBtn').style.display = 'none';
  setStreak(-1);
}
function figureLitCount() {
  if (!figure || !chart) return 0;
  var c = 0;
  for (var i = 0; i < figure.idxs.length; i++) {
    if (chart.notes[figure.idxs[i]].state === 1) c++;
  }
  return c;
}
function showResults() {
  var g = SIM.gradeFor(score, chart.notes.length);
  var prev = readBest();
  var isBest = !prev || g.pct > prev.pct;
  if (isBest) {
    try { localStorage.setItem(BEST_KEY, JSON.stringify({ pct: Math.round(g.pct * 10) / 10, letter: g.letter, maxStreak: score.maxStreak })); } catch (e) {}
  }
  scene = 'done';
  $('pauseBtn').style.display = 'none';
  setStreak(-1);
  $('gradeLetter').textContent = g.letter;
  $('newBest').style.display = isBest ? 'inline-block' : 'none';
  $('stPerfect').textContent = score.perfect;
  $('stGood').textContent = score.good;
  $('stMiss').textContent = score.miss;
  $('stStreak').textContent = score.maxStreak;
  var fl = figureLitCount();
  $('stFigName').textContent = 'Constellation — ' + (figure ? figure.name : '');
  $('stFigure').textContent = fl + ' of ' + (figure ? figure.idxs.length : 0) + (figure && fl === figure.idxs.length ? ' · complete' : '');
  recordResult(g);
  if (playKind === 'daily') submitDaily(g);
  else { var ab = $('arcBox'); if (ab) { ab.style.display = 'none'; ab.innerHTML = ''; } }
  $('doneScr').classList.add('show');
  // count the sky up
  var el = $('gradePct'), t0 = performance.now(), target = g.pct;
  (function count() {
    var k = Math.min(1, (performance.now() - t0) / 900);
    var e = 1 - Math.pow(1 - k, 3);
    el.textContent = (target * e).toFixed(1) + '% of the sky lit';
    if (k < 1 && scene === 'done') requestAnimationFrame(count);
  })();
}

function doPause() {
  if (scene !== 'play' || paused) return;
  paused = true;
  AU.suspend();
  $('pauseScr').classList.add('show');
}
function doResume() {
  if (!paused) return;
  paused = false;
  $('pauseScr').classList.remove('show');
  AU.resume();
}

/* ---- input ----------------------------------------------------------------- */
function toLogical(e) {
  return { x: (e.clientX - ox) / scale, y: (e.clientY - oy) / scale };
}
function tapDrum(drum, str) {
  var now = performance.now();
  drumHitAt[drum] = now; drumHitStr[drum] = str == null ? 1 : str;
  spawnWave(DRUM_X[drum], DRUM_Y, drum === 0 ? '242,160,7' : '140,200,255');
}
function onDown(e) {
  if (e.target.closest && e.target.closest('button')) return;
  e.preventDefault();
  if (scene === 'title') { startSong(); return; }
  if (scene !== 'play' || paused) return;
  var p = toLogical(e);
  var drum = p.x < LW / 2 ? 0 : 1;
  /* judge the touch at the moment it happened, not when this handler got to
   * run: the event's own timestamp walks back the handler delay, and the
   * perceptual clock shifts for the speaker's output latency. */
  var ageMs = e.timeStamp ? Math.max(0, performance.now() - e.timeStamp) : 0;
  var now = songNow() - ageMs / 1000;
  // nearest open note on this drum inside the good window
  while (loIdx < chart.notes.length && chart.notes[loIdx].t < now - GOOD_EARLY_S - 0.001) loIdx++;
  var best = null, bestAbs = 1e9;
  for (var i = loIdx; i < chart.notes.length; i++) {
    var n = chart.notes[i];
    if (n.t > now + GOOD_LATE_S) break;
    if (n.state !== 0 || n.drum !== drum) continue;
    var a = Math.abs(now - n.t);
    if (a < bestAbs) { bestAbs = a; best = n; }
  }
  if (!best) { tapDrum(drum, 0.4); AU.emptyTap(drum); return; }
  var res = SIM.judge((now - best.t) * 1000);
  best.state = 1;
  SIM.applyJudge(score, res);
  best.lit = res === 'perfect' ? 1 : 0.55;
  tapDrum(drum, 1);
  AU.hit(drum, res, score.streak);
  if (res === 'perfect' && inChorus(now)) {
    AU.answer(score.streak);                 // the sky hums your line back
    shimmerAt = performance.now();
    figPulseAt = performance.now();
  }
  pops[drum] = { kind: res, t0: performance.now() };
  best.inFlight = true;
  flights.push({ note: best, fx: DRUM_X[drum], fy: DRUM_Y, t0: performance.now(), bright: best.lit });
  if (res === 'perfect') spawnSparks(DRUM_X[drum], DRUM_Y - 20, drum, 10, 130);
  setStreak(score.streak);
}
$('stage').addEventListener('pointerdown', onDown);

function inChorus(now) {
  for (var i = 0; i < chorusWin.length; i++) {
    if (now >= chorusWin[i][0] && now <= chorusWin[i][1]) return true;
  }
  return false;
}

/* streak HUD (DOM, updated on change only) */
function setStreak(v) {
  if (v === lastStreak) return;
  lastStreak = v;
  var el = $('streak');
  if (v >= 2) {
    el.textContent = '×' + v;
    el.style.opacity = '1';
    el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
  } else el.style.opacity = '0';
}

/* corner buttons */
function syncSndBtn() { $('sndBtn').classList.toggle('off', !AU.soundOn()); }
$('sndBtn').addEventListener('click', function (e) {
  e.stopPropagation();
  AU.unlock(); AU.setSound(!AU.soundOn()); syncSndBtn();
  if (AU.soundOn()) AU.pulse();
});
$('pauseBtn').addEventListener('click', function (e) { e.stopPropagation(); doPause(); });
$('resumeBtn').addEventListener('click', function () { doResume(); });
$('quitBtn').addEventListener('click', function () {
  AU.resume(); AU.stopBed(); AU.stopTrack(); $('pauseScr').classList.remove('show'); paused = false; showTitle();
});
$('againBtn').addEventListener('click', function () { selIdx = playedIdx; startSong(); });
$('nextBtn').addEventListener('click', function () {
  if (LIB.length) {
    selIdx = (playedIdx + 1) % LIB.length;
    freeIdxMem = selIdx;
    playKind = 'free';
  }
  startSong();
});
$('homeBtn').addEventListener('click', function () { showTitle(); });
$('mDaily').addEventListener('click', function () { setKind('daily'); });
$('mFree').addEventListener('click', function () { setKind('free'); });
document.addEventListener('visibilitychange', function () { if (document.hidden) doPause(); });

/* ---- per-frame update ------------------------------------------------------- */
function processMisses(now) {
  while (missIdx < chart.notes.length) {
    var n = chart.notes[missIdx];
    if (n.t >= now - GOOD_LATE_S) break;
    if (n.state === 0) {
      n.state = 2; n.lit = 0;
      SIM.applyJudge(score, 'miss');
      pops[n.drum] = { kind: 'miss', t0: performance.now() };
      missAnims.push({ note: n, t0: performance.now() });
      setStreak(0);
    }
    missIdx++;
  }
}

function drawDrum(d, tNow) {
  var x = DRUM_X[d];
  var hk = (tNow - drumHitAt[d]) / 170;
  var sq = hk < 1 ? Math.sin(Math.min(1, Math.max(0, hk)) * Math.PI) * drumHitStr[d] : 0;
  // halo
  ctx.save();
  ctx.globalAlpha = 0.16 + 0.3 * sq;
  var hs = 250 + 40 * sq;
  ctx.drawImage(GLOW[d], x - hs / 2, DRUM_Y - hs / 2, hs, hs);
  ctx.restore();
  // head
  ctx.save();
  ctx.translate(x, DRUM_Y);
  ctx.scale(1 + 0.05 * sq, 1 - 0.1 * sq);
  var rg = ctx.createRadialGradient(-14, -18, 6, 0, 0, DRUM_R);
  if (d === 0) { rg.addColorStop(0, '#ffe1a1'); rg.addColorStop(0.65, '#f7b733'); rg.addColorStop(1, '#c47b12'); }
  else { rg.addColorStop(0, '#ffffff'); rg.addColorStop(0.65, '#bfe0ff'); rg.addColorStop(1, '#6fa8cf'); }
  ctx.fillStyle = rg;
  ctx.beginPath(); ctx.arc(0, 0, DRUM_R, 0, 6.2832); ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = d === 0 ? '#7c4c0d' : '#3d6a8c';
  ctx.beginPath(); ctx.arc(0, 0, DRUM_R - 2.5, 0, 6.2832); ctx.stroke();
  ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(20,16,40,0.28)';
  ctx.beginPath(); ctx.arc(0, 0, DRUM_R * 0.76, 0, 6.2832); ctx.stroke();
  ctx.restore();
}

function draw(tNow) {
  // sky (device space)
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(skyCv, 0, 0);
  // stage space
  ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * ox, dpr * oy);

  // the sky breathes with the song: bar energy drives the lane glow
  if (scene === 'play' && chart && barEnergies.length) {
    var bIdx = Math.max(0, Math.min(barEnergies.length - 1, Math.floor(songNow() / barLenS)));
    energyNow += ((barEnergies[bIdx] || 0) - energyNow) * 0.045;
  }
  // lane light trails
  var laneA = 0.08 + 0.13 * energyNow;
  for (var d = 0; d < 2; d++) {
    var lg = ctx.createLinearGradient(0, 30, 0, DRUM_Y);
    lg.addColorStop(0, 'rgba(160,180,255,0)');
    lg.addColorStop(1, d === 0 ? 'rgba(242,160,7,' + laneA + ')' : 'rgba(140,200,255,' + laneA + ')');
    ctx.fillStyle = lg;
    ctx.fillRect(DRUM_X[d] - 52, 30, 104, DRUM_Y - 30);
  }
  // twinkles
  for (var ti = 0; ti < twinkles.length; ti++) {
    var tw = twinkles[ti];
    var ta = 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(tNow / 1000 * tw.sp + tw.ph));
    ctx.save(); ctx.globalAlpha = ta;
    var ts = 15 + 5 * Math.sin(tNow / 1000 * tw.sp + tw.ph);
    ctx.drawImage(SPR[tw.spr], tw.x - ts / 2, tw.y - ts / 2, ts, ts);
    ctx.restore();
  }

  var now = scene === 'play' ? songNow() : -99;

  // ceremony sweep position (shared by the figure stars and their threads)
  var sweepPosD = -99;
  if (scene === 'ceremony' && figure) sweepPosD = ((tNow - ceremonyT0) / 1400) * (figure.links.length + 4) - 2;

  if (chart) {
    // lit stars resting in the sky + stars in flight
    var i, n;
    for (i = 0; i < chart.notes.length; i++) {
      n = chart.notes[i];
      if (n.state !== 1 || n.inFlight) continue;
      var hx = n.sx * LW, hy = n.sy * LH;
      var pulse = 1 + 0.1 * Math.sin(tNow / 480 + n.id);
      var sz = (26 + 10 * n.lit) * pulse;
      if (n.fig != null) {
        var fp = 1 + 0.22 * Math.max(0, 1 - (tNow - figPulseAt) / 600);
        if (sweepPosD > -90) fp += 0.3 * Math.max(0, 1 - Math.abs(n.fig - (sweepPosD * 20 / 25)) / 3);
        sz *= 1.55 * fp;
      }
      ctx.save();
      // hierarchy: figure stars burn full; the scatter stays a backdrop,
      // and steps further back during the ceremony so the figure owns it
      ctx.globalAlpha = n.fig != null ? (0.35 + 0.65 * n.lit)
        : (0.22 + 0.38 * n.lit) * (scene === 'ceremony' ? 0.45 : 1);
      ctx.drawImage(SPR[n.drum], hx - sz / 2, hy - sz / 2, sz, sz);
      ctx.restore();
    }
    for (i = flights.length - 1; i >= 0; i--) {
      var f = flights[i];
      var fk = (tNow - f.t0) / 480;
      if (fk >= 1) { f.note.inFlight = false; flights.splice(i, 1); continue; }
      f.note.inFlight = true;
      var fe = 1 - Math.pow(1 - fk, 3);
      var fx = f.fx + (f.note.sx * LW - f.fx) * fe;
      var fy = f.fy + (f.note.sy * LH - f.fy) * fe - Math.sin(fe * Math.PI) * 42;
      var fs = 30 + 8 * Math.sin(fe * Math.PI);
      ctx.save(); ctx.globalAlpha = 0.5 + 0.5 * f.bright;
      ctx.drawImage(SPR[f.note.drum], fx - fs / 2, fy - fs / 2, fs, fs);
      ctx.restore();
    }
    // dimming misses
    for (i = missAnims.length - 1; i >= 0; i--) {
      var ma = missAnims[i], mk = (tNow - ma.t0) / 550;
      if (mk >= 1) { missAnims.splice(i, 1); continue; }
      ctx.save(); ctx.globalAlpha = 0.5 * (1 - mk);
      var my = DRUM_Y + mk * 74;
      ctx.drawImage(SPR[ma.note.drum], DRUM_X[ma.note.drum] - 13, my - 13, 26, 26);
      ctx.restore();
    }
  }

  // the constellation's threads, drawn OVER the scatter so they read: a link
  // wakes when both its stars are lit, and only whispers when one end is lit.
  if (chart && figure) {
    var shim = Math.max(0, 1 - (tNow - shimmerAt) / 1200);
    for (var li = 0; li < figure.links.length; li++) {
      var la2 = figure.links[li];
      var na2 = chart.notes[figure.idxs[la2[0]]], nb3 = chart.notes[figure.idxs[la2[1]]];
      var bothLit = na2.state === 1 && nb3.state === 1;
      var oneLit = na2.state === 1 || nb3.state === 1;
      var target = bothLit ? 0.8 + 0.2 * shim : (oneLit ? 0.08 : 0);
      if (sweepPosD > -90) target += Math.max(0, 1 - Math.abs(li - sweepPosD) / 2.5) * 0.55 * (bothLit ? 1 : 0.25);
      linkA[li] += (Math.min(1, target) - linkA[li]) * 0.09;
      if (linkA[li] < 0.004) continue;
      var x1 = na2.sx * LW, y1 = na2.sy * LH, x2 = nb3.sx * LW, y2 = nb3.sy * LH;
      ctx.save();
      ctx.lineCap = 'round';
      ctx.globalAlpha = linkA[li] * 0.5; ctx.lineWidth = 5.5; ctx.strokeStyle = '#ffe9b0';
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      ctx.globalAlpha = linkA[li]; ctx.lineWidth = 2; ctx.strokeStyle = '#eef2ff';
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      ctx.restore();
    }
    if (scene === 'ceremony') {
      var rk = (tNow - ceremonyT0 - 850) / 750;
      if (rk > 0 && rk < 1) {
        ctx.save(); ctx.globalAlpha = (1 - rk) * 0.55; ctx.lineWidth = 2.5; ctx.strokeStyle = '#ffd968';
        ctx.beginPath(); ctx.arc(0.36 * LW, 0.21 * LH, 26 + rk * 270, 0, 6.2832); ctx.stroke(); ctx.restore();
      }
    }
  }

  // falling notes + converging rings
  if (scene === 'play' && chart) {
    for (var i2 = 0; i2 < chart.notes.length; i2++) {
      var nn = chart.notes[i2];
      if (nn.state !== 0) continue;
      var p = 1 - (nn.t - now) / TRAVEL;
      if (p < 0 || p > 1.12) continue;
      var nx = DRUM_X[nn.drum];
      var ny = -30 + (DRUM_Y + 30) * Math.min(p, 1);
      // trail
      for (var tr = 1; tr <= 3; tr++) {
        ctx.save(); ctx.globalAlpha = 0.16 - tr * 0.04;
        var tsy = ny - tr * 17, tss = 27 - tr * 4;
        ctx.drawImage(SPR[nn.drum], nx - tss / 2, tsy - tss / 2, tss, tss);
        ctx.restore();
      }
      ctx.save();
      ctx.drawImage(SPR[nn.drum], nx - 17, ny - 17, 34, 34);
      // converging ring: meets the rim exactly on the beat
      var rr = DRUM_R + Math.max(0, 1 - p) * 128;
      ctx.globalAlpha = 0.28 + 0.5 * Math.min(1, p);
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = nn.drum === 0 ? '#ffd98a' : '#bfe0ff';
      ctx.beginPath(); ctx.arc(nx, DRUM_Y, rr, 0, 6.2832); ctx.stroke();
      ctx.restore();
    }
  }

  drawDrum(0, tNow);
  drawDrum(1, tNow);

  // shockwaves
  for (var w = 0; w < waves.length; w++) {
    var wv = waves[w];
    if (!wv.on) continue;
    var wk = (tNow - wv.t0) / 420;
    if (wk >= 1) { wv.on = false; continue; }
    var we = 1 - Math.pow(1 - wk, 2);
    ctx.save();
    ctx.globalAlpha = 0.5 * (1 - wk);
    ctx.lineWidth = 3.5 * (1 - wk) + 0.8;
    ctx.strokeStyle = 'rgba(' + wv.col + ',1)';
    ctx.beginPath(); ctx.arc(wv.x, wv.y, DRUM_R + we * 92, 0, 6.2832); ctx.stroke();
    ctx.restore();
  }
  // sparks
  var dtS = 1 / 60;
  for (var s2 = 0; s2 < sparks.length; s2++) {
    var sp = sparks[s2];
    if (!sp.on) continue;
    sp.life -= dtS;
    if (sp.life <= 0) { sp.on = false; continue; }
    sp.x += sp.vx * dtS; sp.y += sp.vy * dtS; sp.vy += 190 * dtS;
    ctx.save(); ctx.globalAlpha = Math.max(0, sp.life / sp.max) * 0.9;
    ctx.drawImage(SPR[sp.spr], sp.x - sp.size / 2, sp.y - sp.size / 2, sp.size, sp.size);
    ctx.restore();
  }
  // judgment pops
  for (var pd = 0; pd < 2; pd++) {
    var pop = pops[pd];
    if (!pop) continue;
    var pk2 = (tNow - pop.t0) / 560;
    if (pk2 >= 1) { pops[pd] = null; continue; }
    var sprP = POP_SPR[pop.kind];
    var pw = 168, ph = 47;
    ctx.save();
    ctx.globalAlpha = pk2 < 0.7 ? 1 : 1 - (pk2 - 0.7) / 0.3;
    var py = DRUM_Y - 118 - pk2 * 30;
    ctx.drawImage(sprP, DRUM_X[pd] - pw / 2, py - ph / 2, pw, ph);
    ctx.restore();
  }
}

var lastFrame = 0;
function frame(tNow) {
  requestAnimationFrame(frame);
  var dt = Math.min(0.1, (tNow - lastFrame) / 1000 || 0.016);
  lastFrame = tNow;
  if (scene === 'play' && !paused && chart) {
    var now = songNow();
    processMisses(now);
    if (mode === 'track' && !trackFaded && now > chart.duration - 1.6) {
      trackFaded = true; AU.fadeTrack(1.8);
    }
    var pr = Math.max(0, Math.min(1, now / chart.duration));
    if (Math.abs(pr - lastProg) > 0.004) {
      lastProg = pr;
      $('progFill').style.width = (pr * 100).toFixed(1) + '%';
    }
    if (now > chart.duration + 1.1) { finishSong(); }
  }
  if (scene === 'ceremony' && tNow - ceremonyT0 > 1750) { showResults(); }
  draw(tNow);
}

fit();
dailyIdx = LIB.length ? SIM.pickDaily(todayStr(), LIB.length) : 0;
selIdx = dailyIdx; freeIdxMem = dailyIdx;
showTitle();
syncSndBtn();
requestAnimationFrame(frame);

/* Title tick: keep the credit line honest about the selected song's load
 * state, and release a waiting start tap the moment its song lands (or give
 * up waiting after 6s and let the house band cover). */
if (LIB.length) {
  trackLoadT0 = performance.now();
  AU.loadTrack(currentSong().url);
  setInterval(function () {
    if (scene !== 'title') return;
    var s = currentSong();
    var el = $('songCredit');
    if (s && el) {
      var ts = AU.trackState(s.url);
      el.style.display = 'block';
      el.textContent = ts === 'ready' ? s.credit
        : ts === 'failed' ? 'The house band covers tonight — the track couldn’t load.'
        : 'Loading “' + s.title + '”…';
    }
    if (wantStart) {
      var ts2 = s ? AU.trackState(s.url) : 'failed';
      if (ts2 !== 'loading' || performance.now() - trackLoadT0 > 6000) startSong();
    }
  }, 450);
}

/* debug seam for harnesses (mirrors the Pdawg pattern) */
if (window.__SD_DEBUG) {
  window.__SD = {
    start: startSong, scene: function () { return scene; },
    mode: function () { return mode; },
    playKind: function () { return playKind; },
    songId: function () { return playedSong ? playedSong.id : (currentSong() ? currentSong().id : null); },
    selIdx: function () { return selIdx; },
    dailyIdx: function () { return dailyIdx; },
    setKind: function (k) { setKind(k); },
    next: function () { $('nextBtn').click(); },
    records: function () { return readRecords(); },
    figLit: function () { return figureLitCount(); },
    inChorusNow: function () { return scene === 'play' && inChorus(songNow()); },
    trackState: function () { var s = currentSong(); return s ? AU.trackState(s.url) : 'none'; },
    latency: function () { return AU.latency(); },
    chart: function () { return chart; }, score: function () { return score; },
    now: function () { return scene === 'play' ? songNow() : -1; },
    tap: function (drum) { /* synthetic hit on a drum, judged at the current clock */
      var fake = { target: { closest: function () { return null; } }, preventDefault: function () {},
                   clientX: ox + DRUM_X[drum] * scale, clientY: oy + DRUM_Y * scale };
      onDown(fake);
    }
  };
}
})();
