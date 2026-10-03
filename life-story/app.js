/* Life Story v3 "Rebirth" — UI wiring. LifeSim (life.js) holds all game logic.
   Defensive build: every v3 sim entry point is feature-detected, so this UI
   works with both the v2 sim (no dossier/karma/daily) and the v3 sim. */
(function () {
  'use strict';

  var AI_BASE = 'https://life-story-ai.chaoticutopia84.workers.dev';
  var ARCADE_BASE = 'https://gamez-arcade.chaoticutopia84.workers.dev';

  var S = null;
  var currentTab = 'act';
  var $ = function (id) { return document.getElementById(id); };

  /* ---------- tiny utils ---------- */
  function clamp01(v) { v = Math.round(v); return v < 0 ? 0 : v > 100 ? 100 : v; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function shuffle(rng, arr) {
    var a = arr.slice(), i, j, t;
    for (i = a.length - 1; i > 0; i--) {
      j = Math.floor(rng() * (i + 1)); t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function trunc(s, n) { s = String(s); return s.length > n ? s.slice(0, n - 1) + '…' : s; }

  /* ---------- legacy + fate + mute (localStorage) ---------- */
  function legacy() {
    try { return JSON.parse(localStorage.getItem('lifestory') || '{}'); }
    catch (e) { return {}; }
  }
  function saveLegacy(patch) {
    var L = legacy();
    for (var k in patch) L[k] = patch[k];
    try { localStorage.setItem('lifestory', JSON.stringify(L)); } catch (e) {}
  }
  function getFate() {
    try { return parseInt(localStorage.getItem('lifestory_fate') || '0', 10) || 0; }
    catch (e) { return 0; }
  }
  function setFate(n) {
    try { localStorage.setItem('lifestory_fate', String(Math.max(0, n | 0))); } catch (e) {}
  }
  function addFate(n) { setFate(getFate() + n); }
  var muted = false;
  try { muted = localStorage.getItem('lifestory_mute') === '1'; } catch (e) {}

  function recordDeath() {
    var L = legacy();
    var ribbons = L.ribbons || [];
    var isNew = ribbons.indexOf(S.ribbon.t) < 0;
    if (isNew) ribbons.push(S.ribbon.t);
    saveLegacy({
      lives: (L.lives || 0) + 1,
      best: Math.max(L.best || 0, LifeSim.netWorth(S)),
      ribbons: ribbons,
      wins: (L.wins || 0) + (S.won ? 1 : 0)
    });
    if (isNew) addFate(1);   // new ribbon, +1 fate
    if (S.won) addFate(2);   // scenario win, +2 fate
  }

  /* ---------- toast + confetti (kept) ---------- */
  var toastT = null;
  function toast(msg) {
    var t = $('toast');
    if (!t) return;
    t.textContent = trunc(msg, 140);
    t.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(function () { t.classList.remove('show'); }, 2200);
  }
  function confetti() {
    var c = $('confetti');
    if (!c || !c.getContext) return;
    var ctx = c.getContext('2d');
    c.width = window.innerWidth; c.height = window.innerHeight;
    c.classList.remove('hidden');
    var colors = ['#ffd166', '#7c5cff', '#4dd0a6', '#ff6b9d', '#2ea8ff'];
    var parts = [];
    for (var i = 0; i < 140; i++) parts.push({
      x: Math.random() * c.width, y: -20 - Math.random() * c.height * 0.4,
      w: 6 + Math.random() * 6, h: 8 + Math.random() * 8,
      vy: 2 + Math.random() * 3.5, vx: -1.5 + Math.random() * 3,
      r: Math.random() * Math.PI, vr: -0.12 + Math.random() * 0.24,
      col: colors[i % colors.length]
    });
    var t = 0;
    (function tick() {
      ctx.clearRect(0, 0, c.width, c.height);
      parts.forEach(function (p) {
        p.x += p.vx; p.y += p.vy; p.r += p.vr;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r);
        ctx.fillStyle = p.col; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      });
      if (++t < 200) requestAnimationFrame(tick);
      else c.classList.add('hidden');
    })();
  }

  /* ---------- tiny WebAudio SFX ---------- */
  var AC = null;
  function audio() {
    if (muted) return null;
    try {
      if (!AC) {
        var Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return null;
        AC = new Ctx();
      }
      if (AC.state === 'suspended') AC.resume();
      return AC;
    } catch (e) { return null; }
  }
  function tone(freq, delay, dur, type, vol, slideTo) {
    var ac = audio();
    if (!ac) return;
    try {
      var o = ac.createOscillator(), g = ac.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(freq, ac.currentTime + delay);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, ac.currentTime + delay + dur);
      g.gain.setValueAtTime(vol || 0.1, ac.currentTime + delay);
      g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + delay + dur);
      o.connect(g); g.connect(ac.destination);
      o.start(ac.currentTime + delay); o.stop(ac.currentTime + delay + dur + 0.02);
    } catch (e) {}
  }
  function sfx(name) {
    if (muted) return;
    try {
      if (name === 'click') tone(520, 0, 0.06, 'square', 0.06);
      else if (name === 'up') { tone(660, 0, 0.07, 'sine', 0.09); tone(880, 0.07, 0.09, 'sine', 0.09); }
      else if (name === 'down') { tone(440, 0, 0.07, 'sine', 0.09); tone(330, 0.07, 0.1, 'sine', 0.09); }
      else if (name === 'coin') { tone(988, 0, 0.08, 'sine', 0.1); tone(1319, 0.08, 0.14, 'sine', 0.1); }
      else if (name === 'death') { tone(220, 0, 0.9, 'triangle', 0.12, 55); tone(110, 0.1, 1.0, 'sine', 0.08, 40); }
    } catch (e) {}
  }

  /* ---------- canvas avatar (replaces emoji #avatar) ---------- */
  var SKINS = ['#f6d3b8', '#eec39e', '#d9a066', '#a0683c', '#6b4226'];
  function ensureAvatarCanvas() {
    var av = $('avatar');
    if (!av) return;
    if (av.tagName.toLowerCase() === 'canvas') return;
    if (!av.parentNode) return;
    var cv = document.createElement('canvas');
    cv.id = 'avatar'; cv.width = 96; cv.height = 96;
    cv.className = av.className;
    av.parentNode.replaceChild(cv, av);
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function drawAvatar() {
    var cv = $('avatar');
    if (!cv || !cv.getContext || !S) return;
    var ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, 96, 96);
    var skin = S.skin || SKINS[1];
    if (S.jail > 0) { // orange jumpsuit behind the face
      ctx.fillStyle = '#e8722a'; roundRect(ctx, 10, 58, 76, 34, 10); ctx.fill();
      ctx.fillStyle = '#c85a1a'; ctx.fillRect(44, 58, 8, 34);
      ctx.fillStyle = '#f4f4f4'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('INMATE', 48, 78);
    }
    ctx.fillStyle = skin; // ears then face
    ctx.beginPath(); ctx.arc(18, 44, 5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(78, 44, 5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(48, 44, 30, 0, Math.PI * 2); ctx.fill();
    var hc = S.age >= 60 ? '#cfcfcf' : '#4a3220'; // hair: gray at 60+
    if (S.age < 3) { // baby wisps
      ctx.strokeStyle = hc; ctx.lineWidth = 3; ctx.lineCap = 'round';
      [[40, 14], [48, 10], [56, 14]].forEach(function (p) {
        ctx.beginPath(); ctx.moveTo(p[0], p[1] + 8);
        ctx.quadraticCurveTo(p[0], p[1], p[0] + 3, p[1] - 4); ctx.stroke();
      });
    } else if (S.age >= 80) { // bald-ish: side wisps
      ctx.strokeStyle = hc; ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(48, 40, 30, Math.PI * 1.12, Math.PI * 1.45); ctx.stroke();
      ctx.beginPath(); ctx.arc(48, 40, 30, Math.PI * 1.55, Math.PI * 1.88); ctx.stroke();
    } else { // hair cap
      ctx.fillStyle = hc;
      ctx.beginPath(); ctx.arc(48, 40, 31, Math.PI, Math.PI * 2); ctx.fill();
      ctx.fillRect(17, 32, 10, 16); ctx.fillRect(69, 32, 10, 16);
      if (S.gender === 'F') { ctx.fillRect(13, 38, 9, 28); ctx.fillRect(74, 38, 9, 28); }
    }
    if (S.fame >= 40) { // celebrity sunglasses
      ctx.fillStyle = '#1c1c22'; roundRect(ctx, 26, 33, 44, 14, 7); ctx.fill();
      ctx.fillStyle = '#3a3a44'; ctx.fillRect(46, 38, 4, 5);
      ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillRect(30, 35, 14, 3);
    } else {
      ctx.fillStyle = '#26221f';
      ctx.beginPath(); ctx.arc(38, 42, 3.6, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(58, 42, 3.6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(39.2, 40.8, 1.2, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(59.2, 40.8, 1.2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,120,120,.35)'; // cheeks
    ctx.beginPath(); ctx.arc(32, 52, 5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(64, 52, 5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#5b2b2b'; ctx.lineWidth = 3; ctx.lineCap = 'round'; // mouth by happiness
    ctx.beginPath();
    if (S.happy >= 60) ctx.arc(48, 55, 10, Math.PI * 0.15, Math.PI * 0.85);
    else if (S.happy >= 35) { ctx.moveTo(40, 60); ctx.lineTo(56, 60); }
    else ctx.arc(48, 69, 10, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();
    if (S.age >= 75) { // wrinkles
      ctx.strokeStyle = 'rgba(90,60,40,.5)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(36, 26); ctx.quadraticCurveTo(48, 22, 60, 26); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(30, 57); ctx.lineTo(24, 59); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(66, 57); ctx.lineTo(72, 59); ctx.stroke();
    }
  }

  /* ---------- dossier data (fallback if sim lacks genDossier) ---------- */
  var PARENT_JOBS = ['bus driver', 'diner cook', 'school janitor', 'retail clerk', 'plumber', 'nurse',
    'taxi driver', 'librarian', 'factory worker', 'dog groomer', 'substitute teacher', 'mail carrier',
    'landscaper', 'waitress', 'security guard', 'hairdresser', 'mechanic', 'baker', 'cashier',
    'piano tuner', 'locksmith', 'florist', 'carpenter', 'accountant'];
  var CONCEPTIONS = [
    'You were conceived during a power outage. Your parents call you their "little blackout baby."',
    'Your parents won a cruise. Nine months later, they won you. The cruise line sent a fruit basket.',
    'You were conceived on a dare. Everyone involved has agreed never to speak of it again.',
    'Your parents met at a wedding, danced twice, and here you are. The DJ takes partial credit.',
    'A broken condom and a leap year. The math never worked out, but neither did the alternatives.',
    'You were planned, scheduled, and color-coded in a spreadsheet. Your mother still has the spreadsheet.',
    'Your father sneezed during a romantic moment and your mother laughed for nine months. Then you arrived.',
    'Conceived in the back of a pickup truck during a thunderstorm. Your birth certificate just says "rural."',
    'Your parents were trying for a tax deduction. You were born on December 28th. It worked.',
    'A romantic candlelit dinner, one thing led to another, and now there are college funds to discuss.'
  ];
  var SIGNS = [
    { name: 'Aries', stat: 'happy', joke: 'charges headfirst into everything, including walls' },
    { name: 'Taurus', stat: 'health', joke: 'stubborn enough to outlive the sun' },
    { name: 'Gemini', stat: 'smarts', joke: 'two personalities, both judgmental' },
    { name: 'Cancer', stat: 'happy', joke: 'cries at commercials, weaponizes it' },
    { name: 'Leo', stat: 'looks', joke: 'main-character energy, no understudy' },
    { name: 'Virgo', stat: 'smarts', joke: 'alphabetizes the spice rack, judges yours' },
    { name: 'Libra', stat: 'looks', joke: 'cannot pick a restaurant, looks great trying' },
    { name: 'Scorpio', stat: 'health', joke: 'intense. Suspiciously intense about brunch' },
    { name: 'Sagittarius', stat: 'happy', joke: 'already planning to leave this conversation' },
    { name: 'Capricorn', stat: 'smarts', joke: 'had a 401(k) at age six' },
    { name: 'Aquarius', stat: 'looks', joke: 'weird on purpose, somehow pulls it off' },
    { name: 'Pisces', stat: 'health', joke: 'daydreams through meetings, thrives anyway' }
  ];
  var M_FIRST = ['James', 'Marcus', 'Tommy', 'Eddie', 'Ray', 'Cole', 'Hank', 'Lou', 'Milo', 'Otis', 'Sam', 'Wade', 'Zeke', 'Abe', 'Finn'];
  var F_FIRST = ['Ruby', 'June', 'Pearl', 'Dottie', 'Mabel', 'Hazel', 'Ivy', 'Lena', 'Nora', 'Opal', 'Sadie', 'Tess', 'Vera', 'Willa', 'Ada'];
  var LASTS = ['Calloway', 'Hargrove', 'Pruitt', 'Delacroix', 'Fenwick', 'Marlowe', 'Quimby', 'Thackeray', 'Underwood', 'Vexley', 'Wexford', 'Yardley', 'Zamora', 'Blackwood', 'Crimson'];
  var APP_COUNTRIES = [
    { c: 'USA', cities: ['New York', 'Los Angeles', 'Chicago', 'Miami', 'Austin'] },
    { c: 'UK', cities: ['London', 'Manchester', 'Bristol'] },
    { c: 'Canada', cities: ['Toronto', 'Vancouver', 'Montreal'] },
    { c: 'Australia', cities: ['Sydney', 'Melbourne', 'Brisbane'] },
    { c: 'Mexico', cities: ['Mexico City', 'Guadalajara'] },
    { c: 'Spain', cities: ['Madrid', 'Barcelona'] },
    { c: 'France', cities: ['Paris', 'Lyon'] },
    { c: 'Italy', cities: ['Rome', 'Milan', 'Naples'] }
  ];
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function pickR(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }
  function fallbackDossier() {
    var rng = Math.random;
    var gM = rng() < 0.5;
    var sibN = Math.floor(rng() * 4), sibs = [];
    for (var i = 0; i < sibN; i++) {
      var sg = rng() < 0.5;
      sibs.push(pickR(rng, sg ? M_FIRST : F_FIRST) + ' (' + (1 + Math.floor(rng() * 12)) + ')');
    }
    var sign = pickR(rng, SIGNS);
    var wt = pickR(rng, ['struggling', 'comfortable', 'well-off']);
    var wealthFlavor = { struggling: 'Ramen is a food group.', comfortable: 'Bills get paid. Mostly on time.', 'well-off': 'The thermostat stays where it is.' }[wt];
    return {
      father: { name: pickR(rng, M_FIRST) + ' ' + pickR(rng, LASTS), job: pickR(rng, PARENT_JOBS) },
      mother: { name: pickR(rng, F_FIRST) + ' ' + pickR(rng, LASTS), job: pickR(rng, PARENT_JOBS) },
      dob: pickR(rng, MONTHS) + ' ' + (1 + Math.floor(rng() * 28)),
      sign: { name: sign.name, joke: sign.joke, bonus: { stat: sign.stat, amt: 3 } },
      conception: pickR(rng, CONCEPTIONS),
      siblings: sibs,
      wealth: wt + ' — ' + wealthFlavor,
      gender: gM ? 'M' : 'F'
    };
  }

  /* ---------- dossier screen state ---------- */
  var dossier = null, dossierMods = null, dossierScenario = 'classic';
  var dossierCountryIdx = -1, dossierName = null, pendingDaily = false, inheritPending = null;

  function openDossier(scenarioId, dailyFlag, nameOverride) {
    dossierScenario = scenarioId || 'classic';
    pendingDaily = !!dailyFlag;
    dossier = (typeof LifeSim.genDossier === 'function') ? LifeSim.genDossier() : fallbackDossier();
    dossierMods = { happy: 0, health: 0, smarts: 0, looks: 0 };
    dossierCountryIdx = -1; dossierName = null;
    renderDossier();
    $('start').classList.add('hidden');
    $('dossier').classList.remove('hidden');
    var dz = $('dossier'); if (dz) dz.scrollTop = 0;
  }
  function renderDossier() {
    if (!dossier) return;
    var fate = getFate();
    function setT(id, txt) { var el = $(id); if (el) el.textContent = txt; }
    setT('d-father', '👨 ' + dossier.father.name + ' — ' + dossier.father.job);
    setT('d-mother', '👩 ' + dossier.mother.name + ' — ' + dossier.mother.job);
    var signTxt = dossier.sign ? dossier.sign.name : '?';
    setT('d-dob', dossier.dob + ' · ' + signTxt);
    setT('d-conception', dossier.conception);
    var sibTxt = (dossier.siblings && dossier.siblings.length) ? dossier.siblings.join(', ') : 'none. All the attention. All the blame.';
    setT('d-siblings', '🧒 ' + sibTxt);
    setT('d-wealth', '💼 Family: ' + dossier.wealth);
    var ccLabel = dossierCountryIdx < 0 ? '🎲 Random' : '🌍 ' + APP_COUNTRIES[dossierCountryIdx % APP_COUNTRIES.length].c;
    setT('d-country', ccLabel);
    var sg = $('d-sign');
    if (sg) {
      sg.textContent = '✦ ' + signTxt;
      sg.title = (dossier.sign && dossier.sign.joke) || '';
    }
    setT('dossier-fate', '✨ ' + fate + ' Fate Points — the universe takes bribes');
    var emoji = { happy: '😊', health: '❤️', smarts: '🧠', looks: '✨' };
    var labels = { happy: 'Happy', health: 'Health', smarts: 'Smarts', looks: 'Looks' };
    Array.prototype.forEach.call(document.querySelectorAll('.fate-btn[data-fate]'), function (b) {
      var kind = b.getAttribute('data-fate');
      var cost = parseInt(b.getAttribute('data-cost') || '0', 10) || 0;
      if (labels[kind]) {
        var mod = dossierMods[kind] || 0;
        b.innerHTML = emoji[kind] + ' ' + labels[kind] + ' +10' + (mod ? ' <b>(+' + mod + ')</b>' : '') +
          '<span class="fate-cost">' + cost + '✨</span>';
      } else if (kind === 'country') {
        b.innerHTML = ccLabel + '<span class="fate-cost">' + cost + '✨</span>';
      } else if (kind === 'name') {
        b.innerHTML = '🎲 Reroll name' + (dossierName ? ': <b>' + esc(dossierName) + '</b>' : '') + '<span class="fate-cost">free</span>';
      }
      b.onclick = function () { spendFate(kind, cost); };
    });
    var bb = $('begin-life-btn');
    if (bb && !bb.onclick) bb.onclick = function () { sfx('click'); beginLife(); };
    var bk = $('dossier-back');
    if (bk && !bk.onclick) bk.onclick = function () { sfx('click'); $('dossier').classList.add('hidden'); showStart(); };
  }
  function spendFate(kind, cost) {
    if (getFate() < cost) { toast('✨ Not enough Fate Points. Die more interestingly.'); return; }
    if (kind === 'country') {
      addFate(-cost);
      dossierCountryIdx = (dossierCountryIdx + 1) % APP_COUNTRIES.length;
      sfx('click'); renderDossier(); return;
    }
    if (kind === 'name') {
      var g = (dossier && dossier.gender) || (Math.random() < 0.5 ? 'M' : 'F');
      dossierName = pickR(Math.random, g === 'M' ? M_FIRST : F_FIRST) + ' ' + pickR(Math.random, LASTS);
      sfx('click'); renderDossier(); return;
    }
    addFate(-cost);
    dossierMods[kind] = (dossierMods[kind] || 0) + 10;
    sfx('coin'); renderDossier();
  }

  function polyfillV3(s) {
    if (s.karma === undefined) s.karma = 50;
    if (s.secondChance === undefined) s.secondChance = true;
    if (s.prayedYear === undefined) s.prayedYear = -1;
    if (!s.dailyFlags) s.dailyFlags = {};
    if (!s.skin) s.skin = pickR(Math.random, SKINS);
    if (s.karmaRevealed === undefined) s.karmaRevealed = false;
  }
  function beginLife() {
    var isV3 = (typeof LifeSim.genDossier === 'function');
    S = LifeSim.newLife(dossierScenario, inheritPending, dossier);
    inheritPending = null;
    lifeToken++;
    if (typeof S.skin === 'undefined') polyfillV3(S); // v2 sim: app owns the v3 fields
    else { // v3 sim: still guarantee app-side flags
      if (S.secondChance === undefined) S.secondChance = true;
      if (S.prayedYear === undefined) S.prayedYear = -1;
      if (!S.dailyFlags) S.dailyFlags = {};
      if (S.karmaRevealed === undefined) S.karmaRevealed = false;
    }
    if (!isV3 && dossier) { // v2 sim ignores the dossier param: apply its bonuses here
      var b = dossier.sign && dossier.sign.bonus; // v3 newLife applies the sign bonus itself
      if (b && b.stat && S[b.stat] !== undefined) S[b.stat] = clamp01(S[b.stat] + (b.amt || 3));
    }
    if (dossier) { // fate-bought stat boosts are app-side on either sim (the sim never sees them)
      var st;
      for (st in dossierMods) if (S[st] !== undefined) S[st] = clamp01(S[st] + dossierMods[st]);
    }
    if (dossierCountryIdx >= 0) { // explicit country choice wins on either sim
      var cc = APP_COUNTRIES[dossierCountryIdx % APP_COUNTRIES.length];
      S.country = cc.c; S.city = pickR(Math.random, cc.cities);
    }
    if (dossierName) S.name = dossierName;
    S.birthYear = new Date().getFullYear();
    snap = null; eventQueue.length = 0; modalOpen = false; aiInFlight = false;
    prevStats = {};
    try { prevWorth = LifeSim.netWorth(S); } catch (e) { prevWorth = 0; }
    var doDaily = pendingDaily; pendingDaily = false;
    $('dossier').classList.add('hidden');
    $('start').classList.add('hidden');
    $('death').classList.add('hidden');
    $('sheet').classList.add('hidden');
    render();
    var j = $('journal'); if (j) j.scrollTop = 0;
    if (doDaily) setupDaily();
  }

  /* ---------- render ---------- */
  function stage(age) {
    if (age < 3) return 'Baby';
    if (age < 13) return 'Kid';
    if (age < 18) return 'Teen';
    if (age < 30) return 'Young adult';
    if (age < 60) return 'Adult';
    if (age < 80) return 'Senior';
    return 'Elder';
  }
  var prevStats = {};
  var prevWorth = 0;

  function revealKarmaRow() {
    var ks = $('karma-stat');
    if (ks) ks.classList.toggle('revealed', !!(S && S.karmaRevealed));
  }
  function statSfx(key, v) {
    if (v === undefined || v === null) return;
    if (prevStats[key] !== undefined && prevStats[key] !== v) sfx(v > prevStats[key] ? 'up' : 'down');
    prevStats[key] = v;
  }
  function render() {
    if (!S) return;
    revealKarmaRow();
    drawAvatar();
    $('pname').textContent = S.name;
    var extra = '';
    if (S.jail > 0) extra += ' · 🔒 ' + S.jail + 'y left';
    if (S.studying) extra += ' · 🎓 studying';
    if (S.fame >= 20) extra += ' · ⭐' + S.fame;
    if (S.followers >= 1000) extra += ' · 📱' + LifeSim.fmtN(S.followers);
    $('page').textContent = stage(S.age) + ' · Age ' + S.age + ' · ' + S.city + extra;
    $('pmoney').textContent = LifeSim.fmt(LifeSim.netWorth(S));
    [['happy', 'b-happy'], ['health', 'b-health'], ['smarts', 'b-smarts'], ['looks', 'b-looks']].forEach(function (pair) {
      var bar = $(pair[1]), num = $(pair[1] + '-n'), v = S[pair[0]];
      if (!bar) return;
      bar.style.width = v + '%';
      if (num) num.textContent = v;
      if (prevStats[pair[0]] !== undefined && prevStats[pair[0]] !== v) {
        bar.classList.remove('up', 'down');
        void bar.offsetWidth;
        bar.classList.add(v > prevStats[pair[0]] ? 'up' : 'down');
      }
      statSfx(pair[0], v);
    });
    var kr = $('b-karma'), krn = $('b-karma-n'), kre = $('b-karma-e');
    if (kr) {
      var rev = !!S.karmaRevealed && typeof S.karma === 'number';
      kr.style.width = (rev ? S.karma : 0) + '%';
      if (krn) krn.textContent = rev ? S.karma : '?';
      if (kre) kre.textContent = rev ? '🪞' : '❓';
      statSfx('karma', rev ? S.karma : undefined);
    }
    var w = 0;
    try { w = LifeSim.netWorth(S); } catch (e) {}
    if (prevWorth > 0 && w - prevWorth >= 20000) sfx('coin');
    prevWorth = w;
    var j = $('journal');
    if (j) {
      j.innerHTML = S.log.map(function (e) {
        return '<div class="entry"><span class="ag">Age ' + e.age + '</span>' + esc(e.text) + '</div>';
      }).join('');
    }
    if (aiInFlight) showFateNote(true);
    renderDailyBanner();
    updateAgeBtn();
    var scb = $('second-chance-btn');
    if (scb) scb.disabled = !(S && S.alive && !modalOpen && snap && S.secondChance !== false);
  }

  /* ---------- action sheet (tabs) ---------- */
  function btn(label, sub, fn, disabledReason) {
    var b = document.createElement('button');
    b.className = 'act';
    var showSub = disabledReason || sub;
    b.innerHTML = '<span>' + label + (showSub ? '<small>' + showSub + '</small>' : '') + '</span><span class="go">›</span>';
    if (disabledReason) { b.disabled = true; }
    else b.onclick = function () {
      if (modalOpen) return;
      var r = fn();
      if (r && r.ok === false) toast(r.msg);
      doCheckDaily();
      render();
      if (!S.alive) showDeath();
      else openSheet(currentTab);
    };
    return b;
  }
  function sect(t) { var d = document.createElement('div'); d.className = 'sect'; d.textContent = t; return d; }
  function info(t) { var d = document.createElement('div'); d.className = 'act'; d.style.opacity = '.8'; d.innerHTML = '<span>' + t + '</span>'; return d; }
  var TITLES = { act: '🎯 Life', love: '💕 Love', job: '💼 Career', assets: '🏠 Assets', crime: '🕶️ Crime' };

  function ensurePrayModal() {
    if ($('pray-modal')) return;
    var m = document.createElement('div');
    m.id = 'pray-modal'; m.className = 'overlay hidden';
    m.innerHTML = '<div class="panel"><div class="grab"></div>' +
      '<h2>🙏 Pray to Pip</h2><p class="tag">The great Pip hears all. Allegedly.</p>' +
      '<div id="pray-choices"></div>' +
      '<button id="pray-x" class="ghost-btn">Never mind</button></div>';
    document.body.appendChild(m);
    $('pray-x').onclick = function () { $('pray-modal').classList.add('hidden'); };
    m.addEventListener('click', function (e) { if (e.target === m) m.classList.add('hidden'); });
  }
  function openPraySheet() {
    ensurePrayModal();
    var box = $('pray-choices');
    box.innerHTML = '';
    [['health', '❤️ Health', 'Patch me up, big guy'], ['wealth', '💰 Wealth', 'Pip provides'], ['love', '💕 Love', 'Send a cutie']].forEach(function (p) {
      var b = document.createElement('button');
      b.className = 'act';
      b.innerHTML = '<span>' + p[1] + '<small>' + p[2] + '</small></span><span class="go">›</span>';
      b.onclick = function () { doPray(p[0]); };
      box.appendChild(b);
    });
    $('pray-modal').classList.remove('hidden');
  }
  function doPray(blessing) {
    $('pray-modal').classList.add('hidden');
    if (typeof LifeSim.actions.pray !== 'function') {
      toast('🙏 Pip is on lunch break. (Prayer arrives in the next update.)');
      return;
    }
    var n0 = S.log.length;
    try { LifeSim.actions.pray(S, blessing); } catch (e) {}
    S.prayedYear = S.age;
    doCheckDaily();
    render();
    if (S.log.length > n0) toast(S.log[0].text);
    if (!S.alive) showDeath();
    else openSheet('act');
  }

  function openSheet(tab) {
    currentTab = tab;
    document.querySelectorAll('#tabs button').forEach(function (b) {
      b.classList.toggle('on', b.dataset.tab === tab);
    });
    $('sheet-title').textContent = TITLES[tab];
    var body = $('sheet-body');
    body.innerHTML = '';
    var acts = LifeSim.actions;
    var add = function (el) { body.appendChild(el); };
    var locked = S.jail > 0;

    if (tab === 'act') {
      if (locked) {
        add(sect('Prison life'));
        add(btn('🕳️ Bribe a guard', '$5,000 · 40% odds', function () { return acts.escape(S, 'bribe'); }));
        add(btn('🥄 Dig a tunnel', '35% odds · +1y if caught', function () { return acts.escape(S, 'tunnel'); }));
        add(btn('🔥 Start a riot', '25% odds · +3y if caught', function () { return acts.escape(S, 'riot'); }));
        add(btn('📚 Prison book club', 'Free. Surprisingly good.', function () { return acts.meditate(S); }));
        $('sheet').classList.remove('hidden');
        return;
      }
      add(sect('Mind & body'));
      add(btn('📖 Study hard', 'Smarts up, fun down', function () { return acts.study(S); }));
      add(btn('🏋️ Hit the gym', 'Health & looks up', function () { return acts.gym(S); }));
      add(btn('📚 Library', 'Quiet smarts boost', function () { return acts.library(S); }));
      add(btn('🩺 See a doctor', '$200 · Health boost', function () { return acts.doctor(S); }));
      add(btn('🧘 Meditate', 'Happiness up', function () { return acts.meditate(S); }));
      add(btn('🙏 Pray to Pip', S.prayedYear === S.age ? 'Pip heard you already' : 'Once a year · big guy upstairs',
        function () { openPraySheet(); return { ok: true }; },
        S.prayedYear === S.age ? 'Come back next year' : null));
      add(btn('🪞 Reflect', S.karmaRevealed ? 'Karma: ' + (typeof S.karma === 'number' ? S.karma : '?') : 'Contemplate your karma', function () {
        if (typeof acts.reflect !== 'function') return { ok: false, msg: '🪞 Reflection arrives in the next update.' };
        var n0 = S.log.length;
        try { acts.reflect(S); } catch (e) {}
        S.karmaRevealed = true;
        render();
        if (S.log.length > n0) toast(S.log[0].text);
        else toast('🪞 Karma revealed: ' + S.karma);
        return { ok: true };
      }, S.age < 12 ? '12+' : null));
      add(sect('Look sharp'));
      add(btn('💇 Salon visit', '$150 · Looks up', function () { return acts.salon(S); }));
      add(btn('✨ Plastic surgery', '$8,000 · risky', function () { return acts.surgery(S); }, S.age < 18 ? '18+' : null));
      add(sect('Spotlight'));
      var canPlatform = typeof acts.postSocial === 'function' && acts.postSocial.length >= 2;
      if (canPlatform) {
        [['🐦 Chirp', 'chirp', 'Hot takes · controversy engine'],
         ['📸 GlamGram', 'glam', 'Thirst traps scale with looks'],
         ['🎵 TokTick', 'tok', 'Viral lottery · 12% moonshot']].forEach(function (p) {
          add(btn(p[0] + ' post', (S.followers ? LifeSim.fmtN(S.followers) + ' followers' : 'Build your following') + ' · ' + p[2],
            function () { return acts.postSocial(S, p[1]); }, S.age < 13 ? '13+' : null));
        });
      } else {
        add(btn('📱 Post on social media', (S.followers ? LifeSim.fmtN(S.followers) + ' followers' : 'Build your following'), function () { return acts.postSocial(S); }, S.age < 13 ? '13+' : null));
      }
      add(btn('🎤 Do an interview', 'Needs 20 fame', function () { return acts.interview(S); }, S.fame < 20 ? 'Get famous first' : null));
      add(sect('Treat yourself'));
      add(btn('🎰 Lottery ticket', '$10 · dream big', function () { return acts.lottery(S); }, S.age < 18 ? '18+' : null));
      add(btn('🏝️ Vacation', '$3,000 · big happiness', function () { return acts.vacation(S); }, S.age < 18 ? '18+' : null));
      add(sect('Money moves'));
      add(btn('📈 Invest $10K in stocks', S.stocks ? 'Holding ' + LifeSim.fmt(S.stocks) : 'High risk, high reward', function () { return acts.buyStocks(S, 10000); }, S.age < 18 ? '18+' : null));
      if (S.stocks >= 1) add(btn('📉 Cash out stocks', 'Sell for ' + LifeSim.fmt(S.stocks), function () { return acts.sellStocks(S); }));
      add(btn('🏪 Buy a business', S.business ? 'Own: ' + S.business.name : '$200,000', function () { return acts.buyBusiness(S); }, S.business ? 'Already own one' : S.age < 18 ? '18+' : null));
      if (S.business) add(btn('💼 Sell ' + S.business.name, 'Worth ' + LifeSim.fmt(S.business.value), function () { return acts.sellBusiness(S); }));
      add(btn('🕊️ Donate $10K', 'Given: ' + LifeSim.fmt(S.donated), function () { return acts.donate(S, 10000); }, S.age < 18 ? '18+' : null));
      add(btn('📜 Write your will', S.willWritten ? 'Done. Very responsible.' : 'For the kids', function () { return acts.writeWill(S); }, S.willWritten ? 'Done' : S.age < 18 ? '18+' : null));
      add(sect('Education · ' + LifeSim.EDU_NAMES[S.edu]));
      add(btn('🎓 University', '$40,000 · 4 years', function () { return acts.goUniversity(S); }, S.edu >= 2 ? 'Done' : S.age < 18 ? '18+' : null));
      add(btn('🎓 Graduate school', '$60,000 · 2 years', function () { return acts.goGrad(S); }, S.edu >= 3 ? 'Done' : S.edu < 2 ? 'Need university' : null));
    }
    if (tab === 'love') {
      if (locked) { add(info('🔒 Love can wait. You\'re in prison.')); }
      else if (!S.partner) {
        add(btn('💘 Find love', 'Looks help. Obviously.', function () { return acts.findLove(S); }, S.age < 18 ? '18+' : null));
      } else {
        var p = S.partner;
        add(sect((p.married ? 'Married to ' : 'Dating ') + p.name + ' · ❤️' + p.affection));
        if (!p.married) add(btn('💍 Propose', '$5,000 wedding', function () { return acts.propose(S); }));
        else add(btn('👶 Have a baby', 'The ultimate legacy', function () { return acts.haveBaby(S); }, S.age > 50 ? 'Too late' : null));
        add(btn('🌹 Date night', 'Affection up', function () { return acts.dateNight(S); }));
        add(btn(p.married ? '⚖️ Divorce' : '💔 Break up', p.married ? 'Lose half your money. Ouch.' : 'It\'s not you...', function () { return acts.breakup(S); }));
      }
      if (S.kids.length) {
        add(sect('Kids (' + S.kids.length + ')'));
        S.kids.forEach(function (k) {
          add(info('👶 ' + k.name + ' · age ' + k.age));
        });
      }
    }
    if (tab === 'job') {
      if (locked) { add(info('🔒 No career moves from a cell.')); }
      else if (S.job) {
        var jdef = LifeSim.JOBS.filter(function (x) { return x.t === S.job.t; })[0];
        add(sect(S.job.t + ' · ' + LifeSim.fmt(S.job.sal) + '/yr · perf ' + S.job.perf + (jdef.fame ? ' · ⭐' + S.fame : '')));
        add(btn('💪 Work hard', 'Performance up, mood down', function () { return acts.workHard(S); }));
        add(btn('💰 Ask for a raise', 'Needs good performance', function () { return acts.askRaise(S); }));
        add(btn('🚪 Quit', 'Walk out like a legend', function () { return acts.quitJob(S); }));
      } else {
        add(sect('Openings · ⭐ = fame career'));
        acts.jobList(S).forEach(function (j) {
          add(btn('💼 ' + j.t + (j.fame ? ' ⭐' : ''), LifeSim.fmt(j.sal) + '/yr' + (j.lock ? ' · 🔒 ' + j.lock : ''), function () { return acts.applyJob(S, j.i); }, j.lock || null));
        });
      }
    }
    if (tab === 'assets') {
      if (locked) { add(info('🔒 Your assets are fine. You are not.')); }
      else {
        add(sect('Buy property'));
        LifeSim.HOUSES.forEach(function (h, i) {
          add(btn('🏠 ' + h.t, LifeSim.fmt(h.price), function () { return acts.buyHouse(S, i); }, S.money < h.price ? 'Can\'t afford' : null));
        });
        add(sect('Buy a car'));
        LifeSim.CARS.forEach(function (c, i) {
          add(btn('🚗 ' + c.t, LifeSim.fmt(c.price), function () { return acts.buyCar(S, i); }, S.money < c.price ? 'Can\'t afford' : null));
        });
      }
      if (S.houses.length) {
        add(sect('Your homes · tap to sell'));
        S.houses.forEach(function (h, i) {
          add(btn('🏠 ' + h.t, 'Worth ' + LifeSim.fmt(h.value), function () { return acts.sellHouse(S, i); }));
        });
      }
      if (S.cars.length) {
        add(sect('Your cars · tap to sell'));
        S.cars.forEach(function (c, i) {
          add(btn('🚗 ' + c.t, 'Worth ' + LifeSim.fmt(c.value), function () { return acts.sellCar(S, i); }));
        });
      }
    }
    if (tab === 'crime') {
      if (locked) {
        add(sect('Break out'));
        add(btn('🕳️ Bribe a guard', '$5,000 · 40% odds', function () { return acts.escape(S, 'bribe'); }));
        add(btn('🥄 Dig a tunnel', '35% odds · +1y if caught', function () { return acts.escape(S, 'tunnel'); }));
        add(btn('🔥 Start a riot', '25% odds · +3y if caught', function () { return acts.escape(S, 'riot'); }));
      } else {
        add(sect('High risk, high reward'));
        LifeSim.CRIMES.forEach(function (c, i) {
          add(btn('🕶️ ' + c.t, 'Up to ' + LifeSim.fmt(c.reward) + ' · ' + c.jail + 'y if caught', function () { return acts.crime(S, i); }, S.age < 14 ? '14+' : null));
        });
      }
      if (S.jailTotal > 0 || S.crimes > 0) add(sect('Rap sheet: ' + S.crimes + ' crimes · ' + S.jailTotal + 'y served' + (S.escaped ? ' · ' + S.escaped + ' escapes' : '')));
    }
    $('sheet').classList.remove('hidden');
  }

  /* ---------- event modal + queue + AI ---------- */
  var eventQueue = [];
  var modalOpen = false;
  var aiInFlight = false;
  var lifeToken = 0;

  function ensureEventModal() {
    if ($('event-modal')) {
      if (!$('em-title')) { // teammate shell without innards: fill it
        $('event-modal').innerHTML = '<div class="panel sheet-up"><div class="grab"></div><h2 id="em-title"></h2><p id="em-text"></p><div id="em-choices"></div></div>';
      }
      return;
    }
    var m = document.createElement('div');
    m.id = 'event-modal'; m.className = 'overlay hidden';
    m.innerHTML = '<div class="panel sheet-up"><div class="grab"></div><h2 id="em-title"></h2><p id="em-text"></p><div id="em-choices"></div></div>';
    document.body.appendChild(m);
  }
  function updateAgeBtn() {
    var b = $('age-btn');
    if (b) b.disabled = modalOpen;
  }
  function openEventModal(ev) {
    ensureEventModal();
    modalOpen = true;
    updateAgeBtn();
    var title = ev.title || 'Something happened';
    var em = $('em-emoji');
    var m = title.match(/^(\S+)\s+([\s\S]+)$/);
    if (em && m) { em.textContent = m[1]; $('em-title').textContent = m[2]; }
    else { if (em) em.textContent = '🎲'; $('em-title').textContent = title; }
    $('em-text').textContent = ev.text || '';
    var box = $('em-choices');
    box.innerHTML = '';
    var chs = ev.choices || [];
    chs.forEach(function (c, i) {
      var b = document.createElement('button');
      b.className = 'act choice' + ((chs.length === 3 && i === chs.length - 1) ? ' choice-chaos' : '');
      b.textContent = c.label;
      b.onclick = function () { resolveModal(c.fn); };
      box.appendChild(b);
    });
    $('event-modal').classList.remove('hidden');
  }
  function resolveModal(fn) {
    if (!S) return;
    var n0 = S.log.length, line = null;
    try { line = fn(); } catch (e) { line = null; }
    // sim run() returns the journal line; if it didn't log it, log it here
    if (typeof line === 'string' && line && S.log.length === n0) {
      S.log.unshift({ age: S.age, text: line });
      if (S.log.length > 250) S.log.length = 250;
    }
    modalOpen = false;
    $('event-modal').classList.add('hidden');
    doCheckDaily();
    render();
    if (!S.alive) { eventQueue.length = 0; hideFateNote(); showDeath(); return; }
    processQueue();
  }
  function processQueue() {
    updateAgeBtn();
    if (modalOpen || !S || !S.alive) return;
    var it = eventQueue.shift();
    if (it) openEventModal(it);
  }
  function showFateNote(on) {
    var n = $('fate-note');
    if (n) n.classList.toggle('show', !!on);
  }
  function hideFateNote() { aiInFlight = false; showFateNote(false); }

  function localModalItem(ev) {
    var text;
    try { text = (typeof ev.text === 'function') ? ev.text(S) : ev.text; }
    catch (e) { text = 'Something happened. The details are hazy.'; }
    var ch = (ev.choices || []).map(function (c) {
      return {
        label: c.label,
        fn: function () { return c.run(S); }
      };
    });
    return { title: ev.title, text: text, choices: ch };
  }
  function handlePendingEvent() {
    var ev = S.pendingEvent;
    if (!ev || typeof ev !== 'object') return;
    S.pendingEvent = null; // consumed by the UI
    var item = localModalItem(ev);
    var canAI = (typeof LifeSim.aiState === 'function') && (typeof LifeSim.applyAiChoice === 'function');
    if (canAI && Math.random() < 0.35) fetchAiEvent(item);
    else { eventQueue.push(item); processQueue(); }
  }
  function validateAiEvent(d) {
    if (!d || typeof d.text !== 'string' || !d.text.trim()) return null;
    if (!Array.isArray(d.choices) || d.choices.length < 2 || d.choices.length > 3) return null;
    var keys = ['happy', 'health', 'smarts', 'looks', 'money', 'fame'];
    var choices = [];
    for (var i = 0; i < d.choices.length; i++) {
      var c = d.choices[i];
      if (!c || typeof c.label !== 'string' || !c.label.trim()) return null;
      var clean = { label: c.label.trim() };
      keys.forEach(function (k) {
        var v = c[k];
        if (typeof v !== 'number' || !isFinite(v)) v = 0;
        clean[k] = k === 'money' ? Math.max(-1000000, Math.min(1000000, v)) : Math.max(-100, Math.min(100, v));
      });
      choices.push(clean);
    }
    return { text: d.text.trim(), choices: choices };
  }
  function fetchAiEvent(fallbackItem) {
    var tok = lifeToken;
    aiInFlight = true;
    showFateNote(true);
    var ctrl = null;
    try { ctrl = new AbortController(); } catch (e) {}
    var to = setTimeout(function () { try { ctrl && ctrl.abort(); } catch (e) {} }, 6000);
    function finish(aiItem) {
      clearTimeout(to);
      if (tok !== lifeToken) return; // life changed underneath us
      aiInFlight = false;
      showFateNote(false);
      if (!S || !S.alive) return;
      eventQueue.push(aiItem || fallbackItem);
      processQueue();
    }
    var state = null;
    try { state = LifeSim.aiState(S); } catch (e) { finish(null); return; }
    try {
      fetch(AI_BASE + '/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: state }),
        signal: ctrl ? ctrl.signal : undefined
      })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          var v = validateAiEvent(d);
          if (!v) { finish(null); return; }
          var ev = { text: v.text, choices: v.choices };
          finish({
            title: '✨ Fate intervenes',
            text: v.text,
            choices: v.choices.map(function (c, i) {
              return {
                label: c.label,
                fn: (function (idx) {
                  return function () { return LifeSim.applyAiChoice(S, ev, idx); };
                })(i)
              };
            })
          });
        })
        .catch(function () { finish(null); });
    } catch (e) { finish(null); }
  }

  /* ---------- daily mode ---------- */
  var dailyExpanded = false;
  var DAILY_FB = [
    { id: 'worth250k', text: '💰 Be worth $250K', check: function (s) { return LifeSim.netWorth(s) >= 250000; } },
    { id: 'fame50', text: '⭐ Reach 50 fame', check: function (s) { return s.fame >= 50; } },
    { id: 'kids2', text: '👶 Have 2 kids', check: function (s) { return s.kids.length >= 2; } },
    { id: 'married', text: '💍 Get married', check: function (s) { return !!(s.partner && s.partner.married); } },
    { id: 'age70', text: '🎂 Reach age 70', check: function (s) { return s.age >= 70; } },
    { id: 'karma80', text: '😇 Reach 80 karma', check: function (s) { return (s.karma || 50) >= 80; } },
    { id: 'crimes3', text: '🕶️ Commit 3 crimes', check: function (s) { return s.crimes >= 3; } },
    { id: 'house', text: '🏠 Own a house', check: function (s) { return s.houses.length > 0; } }
  ];
  function ymd(d) {
    var m = d.getMonth() + 1, day = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' + m : m) + '-' + (day < 10 ? '0' + day : day);
  }
  function genDailyObjs(seed) {
    if (typeof LifeSim.genDaily === 'function') {
      try {
        var g = LifeSim.genDaily(seed);
        if (g && g.objs && g.objs.length) {
          return g.objs.slice(0, 4).map(function (o) {
            var t = o.text;
            if (typeof t === 'function') { try { t = t(); } catch (e) { t = o.id; } }
            return { id: o.id, text: String(t), job: o.job };
          });
        }
      } catch (e) {}
    }
    var rng = mulberry32(seed);
    return shuffle(rng, DAILY_FB).slice(0, 4).map(function (o) { return { id: o.id, text: o.text }; });
  }
  function setupDaily() {
    var tok = lifeToken;
    var d = new Date();
    var datestr = ymd(d);
    arcadeFetch('/daily?game=life-story', null, function (err, res) {
      if (tok !== lifeToken || !S) return;
      var seed;
      if (!err && res && typeof res.seed === 'number') seed = res.seed;
      else { // offline: deterministic local seed from the date
        var n = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
        seed = Math.floor(mulberry32(n)() * 1000000000);
      }
      S.daily = { date: datestr, objs: genDailyObjs(seed), done: [false, false, false, false], seed: seed };
      if (!S.dailyFlags) S.dailyFlags = {};
      render();
      toast('📅 Daily Life · ' + datestr + ' — finish 4 objectives, earn a mystery crate!');
    });
  }
  function dailyDoneCount() {
    if (!S || !S.daily || !S.daily.done) return 0;
    var n = 0;
    S.daily.done.forEach(function (x) { if (x) n++; });
    return n;
  }
  function localCheckDaily() {
    if (!S || !S.daily) return 0;
    var n = 0;
    S.daily.objs.forEach(function (o, i) {
      if (S.daily.done[i]) return;
      var def = null;
      DAILY_FB.forEach(function (f) { if (f.id === o.id) def = f; });
      if (def) {
        var ok = false;
        try { ok = !!def.check(S); } catch (e) {}
        if (ok) {
          S.daily.done[i] = true; n++;
          S.log.unshift({ age: S.age, text: '📅 Daily objective complete: ' + o.text });
        }
      }
    });
    return n;
  }
  function doCheckDaily() {
    if (!S || !S.daily) return 0;
    var n = 0;
    if (typeof LifeSim.checkDaily === 'function') {
      try { n = LifeSim.checkDaily(S) || 0; } catch (e) { n = 0; }
    } else n = localCheckDaily();
    if (n > 0) toast('📅 Daily objective complete! (' + dailyDoneCount() + '/4)');
    return n;
  }
  function renderDailyBanner() {
    var b = $('daily-banner');
    if (!b) return;
    if (!S || !S.daily) { b.classList.add('hidden'); return; }
    b.classList.remove('hidden');
    var p = $('daily-progress');
    if (p) p.textContent = '📅 Daily: ' + dailyDoneCount() + '/4';
    var ul = $('daily-objs');
    if (ul) ul.innerHTML = S.daily.objs.map(function (o, i) {
      return '<li class="' + (S.daily.done[i] ? 'done' : '') + '">' + (S.daily.done[i] ? '✅ ' : '○ ') + esc(o.text) + '</li>';
    }).join('');
  }

  function ensureCrateModal() {
    if ($('crate-modal')) return;
    var m = document.createElement('div');
    m.id = 'crate-modal'; m.className = 'overlay hidden';
    m.innerHTML = '<div class="panel"><div class="grab"></div>' +
      '<h2>📅 Daily complete!</h2><p class="tag">All four objectives. The universe owes you. Pick a mystery crate:</p>' +
      '<div id="crate-grid"></div></div>';
    document.body.appendChild(m);
  }
  function openCrateModal(done) {
    ensureCrateModal();
    var crates = [];
    try { crates = LifeSim.rollCrates() || []; } catch (e) { crates = []; }
    if (!crates.length) { done(); return; }
    var grid = $('crate-grid');
    grid.innerHTML = '';
    crates.slice(0, 4).forEach(function (c, i) {
      var b = document.createElement('button');
      b.className = 'crate';
      b.textContent = c.label || ('🎁 Crate ' + (i + 1));
      b.onclick = function () {
        var line = null;
        try { line = LifeSim.applyCrate(S, i); } catch (e) {}
        if (c.reward === 'fate4') { addFate(4); toast('✨ +4 Fate Points! Spend them on your next baby.'); }
        else if (typeof line === 'string' && line) toast(line);
        sfx('coin');
        $('crate-modal').classList.add('hidden');
        render();
        done();
      };
      grid.appendChild(b);
    });
    $('crate-modal').classList.remove('hidden');
  }

  /* ---------- death: tombstone + AI obituary + boards ---------- */
  function karmaVerdictText(k) {
    if (typeof LifeSim.karmaVerdict === 'function') {
      try { return LifeSim.karmaVerdict(S); } catch (e) {}
    }
    if (k >= 85) return 'Saintly';
    if (k >= 65) return 'Decent soul';
    if (k >= 45) return 'Morally beige';
    if (k >= 25) return 'Shady';
    return 'Certified menace';
  }
  function localObitText() {
    if (typeof LifeSim.localObit === 'function') {
      try { return LifeSim.localObit(S); } catch (e) {}
    }
    var cause = S.deathCause ? S.deathCause.charAt(0).toUpperCase() + S.deathCause.slice(1) : 'mysterious circumstances';
    return 'Here lies ' + S.name + ', who lived ' + S.age + ' years, died of ' + cause.toLowerCase() +
      ', and left behind ' + LifeSim.fmt(LifeSim.netWorth(S)) + ' and ' + S.kids.length + ' kids who will fight over it.';
  }
  function ensureDeathExtras() {
    var jb = $('d-journal-btn');
    if (jb && !jb.onclick) jb.onclick = function () {
      var w = $('d-journal');
      if (!w) return;
      var open = w.classList.toggle('open');
      jb.textContent = open ? '📖 Hide journal' : '📖 Read journal';
      if (open) {
        w.innerHTML = S.log.map(function (e) {
          return '<div class="entry"><span class="ag">Age ' + e.age + '</span>' + esc(e.text) + '</div>';
        }).join('');
      }
    };
  }
  function showDeath() {
    if (!S) return;
    recordDeath();
    sfx('death');
    ensureDeathExtras();
    var by = S.birthYear || (new Date().getFullYear() - S.age);
    var dd = $('d-dates');
    if (dd) dd.textContent = '🪦 ' + by + ' – ' + (by + S.age) + ' · lived ' + S.age + ' years';
    $('d-emoji').textContent = '🪦';
    $('d-name').textContent = S.name;
    $('d-cause').textContent = S.deathCause ? S.deathCause.charAt(0).toUpperCase() + S.deathCause.slice(1) + '.' : '';
    var ob = $('d-obit');
    if (ob) ob.textContent = localObitText();
    fetchAiObit();
    var banner = S.won ? '<div class="winbanner">🏆 SCENARIO COMPLETE!</div>' : '';
    $('d-ribbon-e').textContent = S.ribbon.e;
    $('d-ribbon-t').textContent = S.ribbon.t;
    $('d-ribbon-d').innerHTML = banner + S.ribbon.d;
    var kv = $('d-karma');
    if (kv) kv.textContent = '⚖️ Karma verdict: ' + karmaVerdictText(typeof S.karma === 'number' ? S.karma : 50);
    var tb = null;
    if (typeof LifeSim.tombstone === 'function') { try { tb = LifeSim.tombstone(S); } catch (e) {} }
    var worth = 0;
    try { worth = LifeSim.netWorth(S); } catch (e) {}
    var career = S.job ? S.job.t : '—';
    var edu = LifeSim.EDU_NAMES[S.edu] || '—';
    if (tb) {
      $('d-stats').innerHTML =
        '<div><span>Final age</span><b>' + tb.age + '</b></div>' +
        '<div><span>Net worth</span><b>' + LifeSim.fmt(tb.worth) + '</b></div>' +
        '<div><span>Career</span><b>' + esc(tb.career) + '</b></div>' +
        '<div><span>Education</span><b>' + esc(tb.edu) + '</b></div>' +
        '<div><span>Kids</span><b>' + tb.kids + '</b></div>' +
        '<div><span>Lovers</span><b>' + tb.lovers + '</b></div>' +
        '<div><span>Crimes</span><b>' + tb.crimes + '</b></div>' +
        '<div><span>Prison</span><b>' + tb.prison + 'y</b></div>' +
        '<div><span>Happiness</span><b>' + tb.happy + '</b></div>';
    } else {
      $('d-stats').innerHTML =
        '<div><span>Final age</span><b>' + S.age + '</b></div>' +
        '<div><span>Net worth</span><b>' + LifeSim.fmt(worth) + '</b></div>' +
        '<div><span>Career</span><b>' + esc(career) + '</b></div>' +
        '<div><span>Education</span><b>' + esc(edu) + '</b></div>' +
        '<div><span>Kids</span><b>' + S.kids.length + '</b></div>' +
        '<div><span>Lovers</span><b>' + S.partnersTotal + '</b></div>' +
        '<div><span>Crimes</span><b>' + S.crimes + '</b></div>' +
        '<div><span>Prison</span><b>' + S.jailTotal + 'y</b></div>' +
        (S.fame >= 20 ? '<div><span>Fame</span><b>⭐' + S.fame + '</b></div>' : '') +
        (S.followers >= 1000 ? '<div><span>Followers</span><b>' + LifeSim.fmtN(S.followers) + '</b></div>' : '');
    }
    var dj = $('d-journal'), djb = $('d-journal-btn');
    if (dj) { dj.classList.remove('open'); dj.innerHTML = ''; }
    if (djb) djb.textContent = '📖 Read journal';
    var canKid = S.kids.length > 0 && worth > 0;
    $('child-btn').classList.toggle('hidden', !canKid);
    $('death').classList.remove('hidden');
    arcadeLifeComplete(worth);
    dailyDeathFlow();
    if (S.won) setTimeout(confetti, 350);
  }
  function fetchAiObit() {
    var tok = lifeToken;
    var ob = $('d-obit');
    if (!ob || !S) return;
    var highlights = S.log.filter(function (e) { return e.text && e.text.length > 12; })
      .slice(0, 5).map(function (e) { return e.text; });
    var ctrl = null;
    try { ctrl = new AbortController(); } catch (e) {}
    var to = setTimeout(function () { try { ctrl && ctrl.abort(); } catch (e) {} }, 10000);
    try {
      fetch(AI_BASE + '/obituary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: S.name, age: S.age, cause: S.deathCause,
          ribbon: (S.ribbon && S.ribbon.t) || '', highlights: highlights
        }),
        signal: ctrl ? ctrl.signal : undefined
      })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          clearTimeout(to);
          if (tok !== lifeToken) return;
          if (d && typeof d.text === 'string' && d.text.trim()) ob.textContent = '✨ ' + d.text.trim();
        })
        .catch(function () { clearTimeout(to); });
    } catch (e) { clearTimeout(to); }
  }
  function dailyDeathFlow() {
    var box = $('arc-lb-daily');
    if (box) box.innerHTML = '';
    if (!S || !S.daily) return;
    var allDone = S.daily.done.every(function (x) { return x; });
    var canCrate = allDone &&
      typeof LifeSim.rollCrates === 'function' && typeof LifeSim.applyCrate === 'function';
    if (canCrate) openCrateModal(postDailyScore);
    else postDailyScore();
  }
  function postDailyScore() {
    if (!S || !S.daily) return;
    var box = $('arc-lb-daily');
    var date = S.daily.date;
    var worth = 0;
    try { worth = Math.floor(LifeSim.netWorth(S)); } catch (e) {}
    var name = 'anon';
    try { name = (localStorage.getItem('arcade_name') || '').trim() || 'anon'; } catch (e) {}
    function show(top) {
      if (!box) return;
      box.innerHTML = '<div class="arc-lb-title">📅 DAILY — ' + esc(date) + '</div>' +
        arcadeBoardHtml(top, name, function (v) { return LifeSim.fmt(v); });
    }
    if (box) box.innerHTML = '<div class="arc-lb-empty">📅 posting daily score…</div>';
    arcadeFetch('/score', { game: 'life-story', board: 'daily-' + date, name: name, score: worth }, function (err, res) {
      if (res && res.top) show(res.top);
      else arcadeFetch('/scores?game=life-story&board=daily-' + date, null, function (e2, d2) {
        show(d2 && d2.top ? d2.top : null);
      });
    });
  }

  /* ---------- start screen ---------- */
  function ensureStartExtras() {
    var db = $('daily-life-btn');
    if (db && !db.onclick) db.onclick = function () { sfx('click'); openDossier('classic', true); };
  }
  function updateFateLine() {
    var f = $('start-fate');
    if (f) f.textContent = '✨ ' + getFate() + ' Fate Points';
  }
  function buildScenarios() {
    var wrap = $('scenario-pick');
    if (!wrap) return;
    wrap.innerHTML = '';
    LifeSim.SCENARIOS.forEach(function (sc) {
      var b = document.createElement('button');
      b.className = 'scen';
      b.innerHTML = '<b>' + esc(sc.name) + '</b><small>' + esc(sc.desc) + '</small>';
      b.onclick = function () { sfx('click'); openDossier(sc.id); };
      wrap.appendChild(b);
    });
  }
  function showLegacy() {
    var L = legacy();
    var el = $('legacy');
    if (!el) return;
    el.innerHTML = L.lives
      ? '🪦 ' + L.lives + ' lives · 🏆 ' + (L.wins || 0) + ' scenarios beaten<br>💰 best: ' + LifeSim.fmt(L.best || 0) + ' · 🎗️ ribbons: ' + (L.ribbons || []).length
      : 'No lives lived yet. Make the first one count.';
  }
  function showStart() {
    ensureStartExtras();
    updateFateLine();
    showLegacy();
    $('dossier').classList.add('hidden');
    $('death').classList.add('hidden');
    $('start').classList.remove('hidden');
  }

  /* ---------- header extras: second chance + mute ---------- */
  function ensureHeaderExtras() {
    var scb = $('second-chance-btn');
    if (scb && !scb.onclick) scb.onclick = function () {
      if (!S || !S.alive || modalOpen || !snap || S.secondChance === false) return;
      var restored = null;
      try { restored = JSON.parse(snap); } catch (e) { return; }
      S = restored;
      S.secondChance = false;
      snap = null;
      S.log.unshift({ age: S.age, text: '⏪ Pip rewound a year. Nobody noticed. Probably.' });
      if (S.log.length > 250) S.log.length = 250;
      eventQueue.length = 0;
      hideFateNote();
      prevStats = {};
      try { prevWorth = LifeSim.netWorth(S); } catch (e) { prevWorth = 0; }
      render();
      toast('⏪ A year, undone.');
    };
    var mb = $('mute-btn');
    if (mb && !mb.onclick) {
      mb.textContent = muted ? '🔇' : '🔊';
      mb.onclick = function () {
        muted = !muted;
        try { localStorage.setItem('lifestory_mute', muted ? '1' : '0'); } catch (e) {}
        mb.textContent = muted ? '🔇' : '🔊';
        if (!muted) sfx('click');
      };
    }
  }

  /* ---------- wiring ---------- */
  var snap = null;
  function ageTap() {
    if (!S || !S.alive || modalOpen) return;
    sfx('click');
    try { snap = JSON.stringify(S); } catch (e) { snap = null; } // snapshot before every ageUp
    LifeSim.ageUp(S);
    doCheckDaily();
    render();
    var j = $('journal'); if (j) j.scrollTop = 0;
    if (!S.alive) { eventQueue.length = 0; hideFateNote(); showDeath(); return; }
    handlePendingEvent();
  }

  /* ---------- arcade (kept + daily) ---------- */
  function arcadeFetch(path, body, cb) {
    var done = false, timer = null;
    function fin(e, d) { if (!done) { done = true; if (timer) clearTimeout(timer); cb(e, d); } }
    timer = setTimeout(function () { fin(new Error('timeout')); }, 12000);
    try {
      fetch(ARCADE_BASE + path, body ?
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {})
        .then(function (r) { return r.json(); })
        .then(function (d) { fin(null, d); })
        .catch(function (e) { fin(e); });
    } catch (e) { fin(e); }
  }
  function arcadeBoardHtml(top, hl, fmt) {
    if (!top || !top.length) return '<div class="arc-lb-empty">No fortunes yet — be the first!</div>';
    var medals = ['🥇', '🥈', '🥉'];
    return top.slice(0, 3).map(function (e, i) {
      return '<div class="arc-lb-row' + (e.name === hl ? ' me' : '') + '"><span>' +
        (medals[i] || (i + 1) + '.') + ' ' + esc(e.name) + '</span><b>' + fmt(e.score) + '</b></div>';
    }).join('');
  }
  function arcadeLifeComplete(worth) {
    var box = $('arc-lb');
    if (!box || !ARCADE_BASE || !(worth > 0)) { if (box) box.innerHTML = ''; return; }
    worth = Math.floor(worth);
    var fmt = function (v) { return LifeSim.fmt(v); };
    box.innerHTML = '<div class="arc-lb-empty">🏆 loading fortunes…</div>';
    var name = '';
    try { name = (localStorage.getItem('arcade_name') || '').trim(); } catch (e) {}
    function go(n) {
      box.innerHTML = '<div class="arc-lb-empty">🏆 sending…</div>';
      arcadeFetch('/score', { game: 'life-story', name: n, score: worth }, function (err, res) {
        function done(top, rank) {
          var r = rank > 0 ? '<div class="arc-lb-rank">GLOBAL #' + rank + ' RICHEST!</div>' : '';
          box.innerHTML = r + '<div class="arc-lb-title">💰 RICHEST LIVES</div>' + arcadeBoardHtml(top, n, fmt);
        }
        if (res && res.top) done(res.top, res.rank);
        else arcadeFetch('/scores?game=life-story', null, function (e2, d2) {
          done(d2 && d2.top ? d2.top : null, 0);
        });
      });
    }
    if (name) { go(name); return; }
    box.innerHTML = '<div class="arc-lb-form"><input id="arc-lb-name" maxlength="12" placeholder="YOUR NAME" autocomplete="off">' +
      '<button id="arc-lb-go" class="ghost-btn">SAVE</button></div>';
    var goBtn = $('arc-lb-go');
    if (goBtn) goBtn.onclick = function () {
      var v = $('arc-lb-name').value.trim().slice(0, 12);
      if (!v) return;
      try { localStorage.setItem('arcade_name', v); } catch (e) {}
      go(v);
    };
  }

  /* ---------- init ---------- */
  $('age-btn').onclick = ageTap;
  document.querySelectorAll('#tabs button').forEach(function (b) {
    b.onclick = function () { if (S && S.alive && !modalOpen) openSheet(b.dataset.tab); };
  });
  function closeSheet() {
    $('sheet').classList.add('hidden');
    document.querySelectorAll('#tabs button').forEach(function (b) { b.classList.remove('on'); });
  }
  $('sheet-x').onclick = closeSheet;
  $('sheet').addEventListener('click', function (e) { if (e.target === $('sheet')) closeSheet(); });
  $('again-btn').onclick = function () { showStart(); };
  $('child-btn').onclick = function () {
    var kidName = S.kids[0].name;
    var money = LifeSim.netWorth(S);
    inheritPending = { money: money };
    openDossier(S.scenario, false, kidName); // the heir keeps their name; reroll stays optional
  };

  // AudioContext must be created/resumed on a user gesture
  document.addEventListener('pointerdown', function () { audio(); }, { once: true });

  ensureAvatarCanvas();
  ensureHeaderExtras();
  ensureEventModal();
  ensureStartExtras();
  buildScenarios();
  showStart();
})();
