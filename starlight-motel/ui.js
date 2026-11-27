/*UI-BEGIN*/
const app = document.getElementById('app');
const SAVE_KEY = 'starlight_motel_v1';
const WD = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
let G = null;
let draft = null;
let uiView = 'desk', uiPhase = null;
let uiFlash = null, uiCashPrev = null, uiKnockKey = null;

/* ---------- sound: a small synthesized evening, off until asked ---------- */
const audio = { ctx: null, master: null, music: null, on: (() => { try { return localStorage.getItem('starlight_sound') === 'on'; } catch(e){ return false; } })() };
function ensureAudio(){
  try {
    if (!audio.ctx){
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      audio.ctx = new AC();
      audio.master = audio.ctx.createGain();
      audio.master.gain.value = 0.85;
      audio.master.connect(audio.ctx.destination);
    }
    if (audio.ctx.state === 'suspended') audio.ctx.resume();
  } catch(e){}
}
function tone(f, delay, dur, type, vol, slide){
  if (!audio.ctx) return;
  const ctx = audio.ctx, t = ctx.currentTime + (delay || 0);
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type || 'sine'; o.frequency.setValueAtTime(f, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  o.connect(g); g.connect(audio.master); o.start(t); o.stop(t + dur + 0.05);
}
function noiseBurst(delay, dur, vol, freq){
  if (!audio.ctx) return;
  const ctx = audio.ctx, t = ctx.currentTime + (delay || 0);
  const len = Math.max(1, (dur * ctx.sampleRate) | 0);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource(); src.buffer = buf;
  const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = freq || 900;
  const g = ctx.createGain(); g.gain.value = vol;
  src.connect(fl); fl.connect(g); g.connect(audio.master); src.start(t);
}
function sfx(name){
  if (!audio.on) return;
  try {
    ensureAudio(); if (!audio.ctx) return;
    switch (name){
      case 'tick':  tone(1150, 0, 0.05, 'sine', 0.045); break;
      case 'stamp': noiseBurst(0, 0.07, 0.20, 700); tone(150, 0, 0.09, 'sine', 0.15, 70); break;
      case 'assign': tone(392, 0, 0.10, 'sine', 0.09); tone(587, 0.07, 0.15, 'sine', 0.09); noiseBurst(0, 0.04, 0.05, 2200); break;
      case 'knock': tone(110, 0, 0.10, 'sine', 0.22, 60); tone(110, 0.19, 0.11, 'sine', 0.19, 60); break;
      case 'coin':  tone(988, 0, 0.07, 'triangle', 0.09); tone(1319, 0.06, 0.13, 'triangle', 0.09); break;
      case 'page':  noiseBurst(0, 0.16, 0.06, 1400); break;
      case 'deny':  tone(196, 0, 0.15, 'sine', 0.09, 147); break;
    }
  } catch(e){}
}
function startMusic(){
  if (!audio.ctx || audio.music) return;
  const ctx = audio.ctx;
  const g = ctx.createGain(); g.gain.value = 0; g.connect(audio.master);
  g.gain.linearRampToValueAtTime(0.05, ctx.currentTime + 2.5);
  const chords = [[220, 261.6, 329.6], [174.6, 220, 261.6], [196, 246.9, 293.7], [164.8, 196, 246.9]];
  let idx = 0;
  const playChord = () => {
    if (!audio.music) return;
    const t = ctx.currentTime;
    for (const f of chords[idx % chords.length]){
      const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
      const og = ctx.createGain();
      og.gain.setValueAtTime(0, t);
      og.gain.linearRampToValueAtTime(0.5, t + 1.3);
      og.gain.linearRampToValueAtTime(0, t + 4.4);
      const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 700;
      o.connect(og); og.connect(fl); fl.connect(g); o.start(t); o.stop(t + 4.6);
    }
    idx++;
  };
  audio.music = { gain: g, iv: null };
  playChord();
  audio.music.iv = setInterval(playChord, 4400);
}
function stopMusic(){
  if (!audio.music) return;
  clearInterval(audio.music.iv);
  const m = audio.music; audio.music = null;
  try { m.gain.gain.linearRampToValueAtTime(0, audio.ctx.currentTime + 0.4); setTimeout(() => { try { m.gain.disconnect(); } catch(e){} }, 650); } catch(e){}
}
function toggleSound(){
  audio.on = !audio.on;
  try { localStorage.setItem('starlight_sound', audio.on ? 'on' : 'off'); } catch(e){}
  if (audio.on){ ensureAudio(); startMusic(); sfx('assign'); }
  else stopMusic();
  render();
}
document.addEventListener('pointerdown', () => { if (audio.on && !audio.music){ ensureAudio(); startMusic(); } });

/* ---------- the coach: four cards across nights 1–2, then never again ---------- */
const COACH_KEY = 'starlight_coach_v1';
let coach = (() => { try { return JSON.parse(localStorage.getItem(COACH_KEY)) || { step: 0, done: false }; } catch(e){ return { step: 0, done: false }; } })();
function saveCoach(){ try { localStorage.setItem(COACH_KEY, JSON.stringify(coach)); } catch(e){} }
const COACH_STEPS = [
  { phase:'morning', night:1, title:'First — the rate', btn:'Next',
    text:'This card is what the highway sees. The forecast under it is a range, not a promise — the road has moods, and the forecast tells you which one is driving tonight. Price for the road you hear, not the one you hope for.' },
  { phase:'morning', night:1, title:'Then — the cleaning', btn:'Next',
    text:'You hold 300 minutes of housekeeping against every dirty room. A deep clean earns its reviews; a quick clean sells tonight and charges you tomorrow. When the morning is set, open the desk.' },
  { phase:'arrivals', night:1, title:'Working the desk', btn:'Next',
    text:'Tap a guest card, and every door tells you its character — the big tub, the soft bed, the thin walls. Guests say what they are hoping for, and the door that fits them glows brass. The line loses patience as it waits, and the end doors, 1 and 8, are the quiet ones.' },
  { phase:'morning', night:2, title:'The morning after', btn:'Got it',
    text:'The register tells you what the night earned and what it cost. The guest book remembers everyone, the corkboard keeps what they wrote, and the catalog is where a good week turns into a better motel.' }
];
function coachCard(){
  if (coach.done || !G) return '';
  const s = COACH_STEPS[coach.step];
  if (!s){ coach.done = true; saveCoach(); return ''; }
  if (s.phase !== G.phase || s.night !== G.night) return '';
  return `<div class="paper coach"><div class="reg-title">Keeping the Starlight — ${coach.step + 1} of ${COACH_STEPS.length}</div>
    <div class="inc-head">${s.title}</div>
    <div class="inc-text" style="font-style:normal;opacity:.9">${s.text}</div>
    <div class="inq-stamps"><button class="stamp" id="coach-next">${s.btn}</button><button class="stamp skip" id="coach-skip">Skip the tour</button></div></div>`;
}
function wireCoach(){
  const nx = document.getElementById('coach-next');
  if (nx) nx.onclick = () => { coach.step++; if (coach.step >= COACH_STEPS.length) coach.done = true; saveCoach(); sfx('page'); render(); };
  const sk = document.getElementById('coach-skip');
  if (sk) sk.onclick = () => { coach.done = true; saveCoach(); sfx('page'); render(); };
}

/* ---------- small instruments ---------- */
function sparkSVG(values, w, h){
  if (!values || values.length < 2) return '';
  const min = Math.min.apply(null, values), max = Math.max.apply(null, values), span = (max - min) || 1;
  const pts = values.map((v, i) => (i / (values.length - 1) * (w - 4) + 2).toFixed(1) + ',' + (h - 3 - (v - min) / span * (h - 6)).toFixed(1)).join(' ');
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="#2F6F6A" stroke-width="1.6"/></svg>`;
}
function animateCash(el, from, to){
  const t0 = performance.now(), dur = 550;
  const stepFn = t => {
    const p = Math.min(1, (t - t0) / dur);
    el.textContent = money(from + (to - from) * (1 - Math.pow(1 - p, 3)));
    if (p < 1) requestAnimationFrame(stepFn);
  };
  requestAnimationFrame(stepFn);
}
function afterRender(){
  const sb = document.getElementById('btn-sound');
  if (sb) sb.onclick = () => toggleSound();
  const el = document.querySelector('.db-cash');
  if (el && G){
    const now = Math.round(G.cash);
    if (uiCashPrev !== null && uiCashPrev !== now) animateCash(el, uiCashPrev, now);
    uiCashPrev = now;
  }
  if (G && G.phase === 'arrivals' && G.incident && !G.incident.resolved){
    const key = G.night + ':' + G.incident.roomId;
    if (uiKnockKey !== key){ uiKnockKey = key; sfx('knock'); }
  }
}

function stars(r){ const f = Math.max(0, Math.min(5, Math.round(r))); return '★★★★★'.slice(0, f) + '☆☆☆☆☆'.slice(0, 5 - f); }
function money(n){ return (n < 0 ? '−$' : '$') + Math.abs(Math.round(n)).toLocaleString('en-US'); }
const SUMMER_WORDS = ['One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];
function summerWord(n){ return SUMMER_WORDS[n - 1] || ('' + n); }
const TIER_NAMES = { legend: 'Starlight Legend', saved: 'Season Saved', scraped: 'Scraped By', bank: 'The Bank Took the Sign' };
function ledgerRow(l){
  return `<div class="led"><span>Summer ${summerWord(l.season)} — ${esc(TIER_NAMES[l.tier] || l.tier || 'A summer kept')}</span><b>${money(l.cash)} · ${l.rating}★ · ${l.occ}% full</b></div>`;
}
function esc(s){ return String(s).replace(/[&<>"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c])); }
const TONIGHT_KEY = 'starlight_tonight_v1';
const TONIGHT_BEST_KEY = 'starlight_tonight_best_v1';
let tonightMode = false;
function save(){ try { localStorage.setItem(tonightMode ? TONIGHT_KEY : SAVE_KEY, JSON.stringify(G)); } catch(e){} }
/* the daily seed: the local calendar date, hashed — the same motel for
 * everyone who opens Tonight Only today, and the same shared-season seed */
function dailySeed(){
  const d = new Date();
  const s = 'starlight-' + d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  let h = 2166136261;
  for (let i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function todayLabel(){
  return new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}
function loadSave(){ try { const s = localStorage.getItem(SAVE_KEY); return s ? JSON.parse(s) : null; } catch(e){ return null; } }

/* ---------- the scene ---------- */
const STAR = '0,-36 8.5,-11.7 34.2,-11.1 13.7,4.5 21.2,29.1 0,14.4 -21.2,29.1 -13.7,4.5 -34.2,-11.1 -8.5,-11.7';
const SPIKE = '0,-36 8.5,-11.7 -8.5,-11.7';

function signSVG(){
  const occ = G ? G.rooms.filter(r => r.state === 'occupied').length : 0;
  const full = !!(G && occ >= G.rooms.length);
  const rating = G ? G.rating : 3.4;
  const weak = rating < 3.2 ? 'sign-weak2' : rating < 3.7 ? 'sign-weak1' : '';
  return `<div class="signwrap ${weak}">
    <div class="sign-glow"></div>
    <svg viewBox="0 0 160 302" role="img" aria-label="Starlight Motel sign">
      <rect x="76" y="198" width="8" height="104" fill="#2A1E15"/>
      <rect x="58" y="214" width="44" height="6" fill="#2A1E15"/>
      <rect x="14" y="8" width="132" height="192" rx="14" fill="#1E4340" stroke="#C6A45E" stroke-width="2"/>
      <g transform="translate(80,58)">
        <polygon class="n-halo" points="${STAR}"/>
        <polygon class="n-tube" points="${STAR}"/>
        <polygon class="n-core" points="${STAR}" transform="scale(0.55)"/>
        <polygon class="n-tube tube-top" points="${SPIKE}" fill="none"/>
      </g>
      <text class="n-script" x="80" y="130" text-anchor="middle" font-size="31">Starlight</text>
      <text class="n-motel" x="83" y="158" text-anchor="middle" font-size="16" letter-spacing="6">MOTEL</text>
      <rect x="36" y="166" width="88" height="1.5" fill="#C6A45E" opacity="0.6"/>
      <rect x="28" y="174" width="104" height="19" rx="9.5" fill="#141210" stroke="rgba(198,164,94,.5)"/>
      <text class="n-vac" x="80" y="187.5" text-anchor="middle" font-size="10.5" letter-spacing="2.5" fill="${full ? '#C63A2A' : '#79A96F'}">${full ? 'NO VACANCY' : 'VACANCY'}</text>
    </svg>
  </div>`;
}

function unitHTML(r, phase, opts){
  let cls = 'unit';
  if (uiFlash === r.id) cls += ' just-in';
  if (opts && opts.want && r.quirk === opts.want && r.state === 'ready') cls += ' wantmatch';
  if (opts && opts.wantRoom && r.id === opts.wantRoom && r.state === 'ready') cls += ' wantmatch';
  if (r.state === 'occupied') cls += ' occ';
  else if (r.state === 'dirty') cls += (phase === 'arrivals' ? ' dark' : ' dirty');
  if (phase === 'arrivals' && draft && r.state === 'ready' && (draft.sel || draft.moving)) cls += ' pickable';
  return `<button class="${cls}" data-room="${r.id}" aria-label="Room ${r.id}">
    <span class="u-opening"></span>
    <span class="u-in"><span class="u-window"></span><span class="u-door"><span class="u-num">${r.id}</span><span class="u-knob"></span></span></span>
    ${opts && opts.labels && r.quirk && SIM.QUIRKS[r.quirk] ? `<span class="u-quirk">${SIM.QUIRKS[r.quirk].short}</span>` : ''}
  </button>`;
}

function sceneHTML(sky, rooms, phase, opts){
  let units;
  if (rooms.length > 8){
    const row = rs => `<div class="units wing">${rs.map(r => unitHTML(r, phase, opts)).join('')}</div>`;
    units = row(rooms.slice(0, 8)) + row(rooms.slice(8));
  } else {
    units = `<div class="units">${rooms.map(r => unitHTML(r, phase, opts)).join('')}</div>`;
  }
  return `<div id="scene" class="${sky}">
    <div class="moon"></div>
    ${phase === 'arrivals' ? '<div class="headlights"></div>' : ''}
    ${signSVG()}
    <div class="building">
      <div class="roofline">STARLIGHT</div>
      <div class="awning"></div>
      <div class="wall">${units}</div>
      <div class="walkway"></div>
    </div>
    <div class="court"></div>
    ${courtCars(phase, rooms)}
    <div class="pool"></div>
  </div>`;
}

// The court fills with the night's cars — a dusty row of them under the
// walkway, so the motel reads occupied before a single card is read.
// Morning shows last night's count (the register remembers who stayed).
const CAR_COLORS = ['#9C5A44', '#6E8296', '#D6C096', '#7E9068', '#8A6A50', '#5C6C7E'];
function courtCars(phase, rooms){
  let n = rooms.filter(r => r.state === 'occupied').length;
  if (phase === 'morning' && typeof G !== 'undefined' && G && G.lastReport) n = G.lastReport.occupied;
  n = Math.min(n, 6);
  if (!n) return '';
  const night = (typeof G !== 'undefined' && G && G.night) || 1;
  const spots = [3, 15.5, 28, 60, 72.5, 85];
  let out = '';
  for (let i = 0; i < n; i++){
    const c = CAR_COLORS[(night * 3 + i * 2) % CAR_COLORS.length];
    out += `<div class="car" style="left:${spots[i]}%;--car:${c}"><i></i></div>`;
  }
  return out;
}

function deskbarHTML(){
  const occ = G.rooms.filter(r => r.state === 'occupied').length;
  return `<div class="deskbar">
    <span class="db-night">Night ${G.night} · ${WD[SIM.dowOf(G.night)]}</span>
    <span><span class="db-stars">${stars(G.rating)}</span> <span class="db-rating">${G.rating.toFixed(1)}</span></span>
    <span class="db-house">${occ}/${G.rooms.length} in house</span>
    ${G.credit > 0 ? `<span class="db-house" style="color:#E8A37A">Credit ${money(G.credit)}</span>` : ''}
    <span class="db-cash ${G.cash < 0 ? 'neg' : ''}">${money(G.cash)}</span>
    <button class="sndbtn" id="btn-sound">${audio.on ? 'Sound on' : 'Sound off'}</button>
  </div>`;
}
function deskOpen(panel){ return `<div id="desk">${G ? deskbarHTML() : ''}<div id="panel">${panel}</div></div>`; }

/* ---------- draft (morning decisions) ---------- */
function initDraft(){
  const cleans = {};
  let used = 0;
  const pool0 = SIM.housekeepingPool(G, false);
  for (const r of G.rooms) if (r.state === 'dirty') {
    let lvl = r.dirt >= 70 ? 'deep' : 'standard';
    if (used + SIM.cleanMinutes(G, lvl) > pool0) lvl = 'quick';
    if (used + SIM.cleanMinutes(G, lvl) > pool0) lvl = 'skip';
    cleans[r.id] = lvl; used += SIM.cleanMinutes(G, lvl);
  }
  draft = { rate: Math.round(55 + G.rating * 7), cleans, extraCleaner: false, sel: null, inquiryDecision: null, moving: false, handyman: false };
}
function draftMinutes(){
  let m = 0;
  for (const id in draft.cleans) m += SIM.cleanMinutes(G, draft.cleans[id]);
  return m;
}
function applyDraftToPlan(){
  // The sim's contract is a map {roomId: level} — draft.cleans already is one.
  SIM.planDay(G, { rate: draft.rate, cleans: draft.cleans, extraCleaner: draft.extraCleaner, inquiryDecision: draft.inquiryDecision, handyman: draft.handyman });
}

/* ---------- screens ---------- */
function renderTitle(){
  const sv = loadSave();
  const fake = Array.from({ length: 8 }, (_, i) => ({ id: i + 1, state: 'occupied' }));
  app.innerHTML = sceneHTML('sky-desk', fake, 'title') + deskOpen(`
    <div class="paper titlecard">
      <div class="reg-title">The Starlight Motel · Est. 1962 · The Old Highway</div>
      <p class="pitch">Eight rooms, one neon star, and a highway that decides whether tonight you eat. Set the rate, spend your cleaning minutes where they count, and work the desk — every guest remembers, and some of them write it down.</p>
      ${sv ? `<button class="btn btn-primary" id="btn-continue">Continue — ${sv.season > 1 ? `Summer ${summerWord(sv.season)} · ` : ''}Night ${sv.night}</button>` : ''}
      <button class="btn btn-walnut" id="btn-new">New season</button>
      <button class="btn btn-walnut" id="btn-shared">Shared season — today's seed</button>
      <button class="btn btn-walnut" id="btn-tonight">Tonight only — one night</button>
      <div class="fine">Shared season: everyone who opens one today starts the same summer. Tonight only: one night at a standing motel — night 43, the Suites just opened — the same house for the whole world today, ${todayLabel()}. One sitting; your season is never touched.${tonightBestLine()}</div>
      ${sv && sv.ledger && sv.ledger.length ? `<div class="reg-title" style="margin-top:16px">The Keeper's Ledger</div>${sv.ledger.map(ledgerRow).join('')}` : ''}
      <div class="fine">A season is 84 nights · autosaves on this device</div>
    </div>`);
  const nb = document.getElementById('btn-new');
  if (nb) nb.onclick = () => {
    if (sv && !confirm('Start a new season? The current one is wiped.')) return;
    G = SIM.createGame((Date.now() % 900000) + 1000, typeof CONTENT !== 'undefined' ? CONTENT : null);
    draft = null; save(); render();
  };
  const cb = document.getElementById('btn-continue');
  if (cb) cb.onclick = () => { G = sv; draft = null; render(); };
  const shb = document.getElementById('btn-shared');
  if (shb) shb.onclick = () => {
    if (sv && !confirm('Start the shared season? The current season is wiped.')) return;
    tonightMode = false;
    G = SIM.createGame(dailySeed(), typeof CONTENT !== 'undefined' ? CONTENT : null);
    draft = null; save(); render();
  };
  const tnb = document.getElementById('btn-tonight');
  if (tnb) tnb.onclick = () => {
    tonightMode = true;
    G = SIM.buildTonight(dailySeed(), typeof CONTENT !== 'undefined' ? CONTENT : null);
    draft = null; save(); render();
  };
}
function tonightBestLine(){
  try {
    const b = JSON.parse(localStorage.getItem(TONIGHT_BEST_KEY) || 'null');
    if (!b) return '';
    return ` Best night on this device: ${money(b.profit)} (${b.date}).`;
  } catch(e){ return ''; }
}

function reportHTML(){
  const rep = G.lastReport;
  if (!rep) return '';
  const c = rep.costs;
  const row = (label, v, cls) => `<div class="led ${cls || ''}"><span>${label}</span><b>${money(v)}</b></div>`;
  const co = rep.checkouts.map(x => {
    const cls = x.score >= 80 ? 'hi' : x.score >= 60 ? 'mid' : 'lo';
    return `<div class="co"><b>${esc(x.name)}</b> <span class="segtag">${SIM.SEGMENTS[x.segment].label}</span> <span class="cst ${cls}">${stars(x.stars)}</span> <span class="score">score ${x.score}</span></div>`;
  }).join('');
  const reviews = rep.checkouts.filter(x => x.review);
  const rev = reviews.map(x => `
    <div class="commentcard ${x.review.stars <= 2 ? 'bad' : ''}">
      <div class="cc-head"><span class="cc-stars cst ${x.review.stars >= 4 ? 'hi' : x.review.stars === 3 ? 'mid' : 'lo'}">${stars(x.review.stars)}</span> ${esc(x.name)}</div>
      <blockquote>“${esc(x.review.text)}”</blockquote>
    </div>`).join('');
  return `<div class="paper register">
    <div class="reg-tab">NIGHT AUDIT</div>
    <div class="reg-title">The Register</div>
    <div class="reg-head">Last night — ${esc(rep.dow)}</div>
    <div class="reg-sub">${rep.occupied}/${G.rooms.length} rooms filled · rating now ${rep.ratingAfter.toFixed(1)}★</div>
    ${row('Room revenue', rep.revenue)}
    ${row('Mortgage', -c.mortgage, 'out')}
    ${row('Utilities', -c.utilities, 'out')}
    ${row('Housekeeping', -c.housekeeping, 'out')}
    ${c.insurance ? row('Insurance &amp; county tax', -c.insurance, 'out') : ''}
    ${row('Laundry &amp; supplies', -(c.laundry + c.supplies), 'out')}
    ${c.breakfast ? row('Breakfast nook', -c.breakfast, 'out') : ''}
    ${c.handyman ? row('Handyman', -c.handyman, 'out') : ''}
    ${c.interest ? row('Credit interest', -c.interest, 'out') : ''}
    <div class="led total"><span>Night's result</span><b>${money(rep.profit)}</b></div>
    ${rep.creditDrawn ? `<div class="led"><span>Credit line drawn overnight</span><b>${money(rep.creditDrawn)}</b></div>` : ''}
    ${G.cashHistory && G.cashHistory.length > 1 ? `<div class="sparkrow"><span>The till, night by night</span>${sparkSVG(G.cashHistory, 210, 34)}</div>` : ''}
    ${rep.checkouts.length ? `<div class="reg-title" style="margin-top:14px">Checked out</div>${co}` : ''}
    ${reviews.length ? `<div class="reg-title" style="margin-top:14px">Comment cards</div>${rev}` : ''}
  </div>`;
}

function renderMorning(){
  if (!draft) initDraft();
  const dirty = G.rooms.filter(r => r.state === 'dirty');
  const used = draftMinutes();
  const pool = SIM.housekeepingPool(G, draft.extraCleaner);
  const fc = SIM.forecast(G, draft.rate);
  const PLURALS = { trucker:'truckers', family:'families', crew:'work crews', longstay:'long-stays', tourist:'Route 66 tourists' };
  const segNames = Object.entries(fc.bySeg).sort((a, b) => b[1] - a[1])
    .filter(([, v]) => v >= 0.25).slice(0, 2).map(([k]) => PLURALS[k]).join(' and ');
  const fcLo = fc.lo, fcHi = fc.hi;
  const moodLine = fc.moodHint === 'busy' ? 'The highway sounds busy tonight.'
                 : fc.moodHint === 'quiet' ? 'The road sounds quiet tonight — thin traffic, thinner wallets.'
                 : 'An ordinary road tonight.';
  const evidence = G.lastReport
    ? ` Last night: ${G.lastReport.occupied} of ${G.rooms.length} doors filled, ${money(G.lastReport.roomRevenue)} in room rent.`
    : ' First night: the register is blank, and the road is the road.';
  const inHouse = G.rooms.filter(r => r.state === 'occupied').length;
  const ready = G.rooms.filter(r => r.state === 'ready').length;

  const inqCard = G.inquiry ? `<div class="paper inquiry">
      <div class="reg-title">A note by the phone — block inquiry</div>
      <div class="inq-text">${esc(G.inquiry.text)}</div>
      <div class="inq-terms">${G.inquiry.rooms} room${G.inquiry.rooms > 1 ? 's' : ''} · ${G.inquiry.nights} nights · $${G.inquiry.ratePer}/room/night · $${G.inquiry.rooms * G.inquiry.nights * G.inquiry.ratePer} all told if they stay</div>
      <div class="inq-stamps">
        <button class="stamp ${draft.inquiryDecision === 'accept' ? 'on' : ''}" data-inq="accept">Accept</button>
        <button class="stamp skip ${draft.inquiryDecision === 'decline' ? 'on' : ''}" data-inq="decline">Decline</button>
      </div>
      <div class="hk-note">No answer by desk time, and they book elsewhere.</div>
    </div>` : '';

  const cal = SIM.calendarEntry(G, G.night);
  const nxt = SIM.nextCalendar(G, G.night);
  const seasonCard = `<div class="paper seasoncard">
      <div class="reg-title">The Season${G.season > 1 ? ` — Summer ${summerWord(G.season)}` : ''} · Night ${G.night} of ${SIM.SEASON_NIGHTS}</div>
      <div class="meter seasonmeter"><i style="width:${Math.round(G.night / SIM.SEASON_NIGHTS * 100)}%"></i></div>
      <div class="season-line">${cal ? `<b>${esc(cal.name)}</b> — ${esc(cal.note)}` : 'A clear stretch of highway. Nothing on the calendar but the weather.'}</div>
      ${nxt ? `<div class="season-next">Coming night ${nxt.from}${nxt.to > nxt.from ? '–' + nxt.to : ''}: ${esc(nxt.name)} — in ${nxt.from - G.night} night${nxt.from - G.night === 1 ? '' : 's'}.</div>` : ''}
      <div class="season-goal">Season Saved asks <b>$10,000 and 3.5★</b> by Night 84. ${G.credit > 0 ? `Credit line: <b>${money(G.credit)}</b> of $8,000 drawn.` : 'The $8,000 credit line sits untouched in its envelope.'}</div>
      <div class="deskrow" style="margin-top:10px"><button class="btn btn-ghost dk" id="btn-calendar">The season calendar</button><button class="btn btn-ghost dk" id="btn-catalog">Supply catalog &amp; bank</button></div>
    </div>`;

  const inspCard = (G.lastInspection && G.lastInspection.night === G.night) ? `<div class="paper inspection ${G.lastInspection.outcome}">
      <div class="reg-title">The Inspector — This Morning</div>
      <div class="inq-text">${esc(G.lastInspection.text)}</div>
    </div>` : '';

  const bankCard = (G.bankLetter && G.bankLetter.night === G.night) ? `<div class="paper inspection fine">
      <div class="reg-title">The Bank Writes</div>
      <div class="inq-text">Your line stood at ${money(G.bankLetter.credit)} at settlement — past the $4,000 mark where the rate steps up: 0.25% a night on the first $4,000, 0.5% to $6,000, and 0.75% on everything past that. And one term in plain ink: a night whose bills beat the cash and the line together is the night the Starlight is theirs. They were polite about it. Banks are, the first time.</div>
    </div>` : '';

  const standCard = (G.standing && G.standing.night === G.night) ? `<div class="paper inspection cert">
      <div class="reg-title">The Standing at Halfway</div>
      <div class="inq-text">Night 42 of 84 is behind you. Cash ${money(G.standing.cash)}, the sign at ${G.standing.rating}★, ${G.standing.occ}% of the doors filled so far. Hold this exact pace and the summer ends near ${money(G.standing.proj)} — ${esc(G.standing.pace)}, if the stars hold. They never quite hold: the second half is the louder half, with the Starling Suites open across the highway and the fair at the end of it.</div>
    </div>` : '';

  const fobRows = dirty.map(r => `
    <div class="fobrow">
      <div class="fob"><span>${r.id}</span></div>
      <div class="fobtag">Room ${r.id} · dirt ${Math.round(r.dirt)}% · condition ${Math.round(r.condition)}</div>
      <div class="stamps">
        ${['deep','standard','quick','skip'].map(lv => `<button class="stamp ${lv === 'skip' ? 'skip' : ''} ${draft.cleans[r.id] === lv ? 'on' : ''}" data-clean="${r.id}:${lv}">${lv === 'standard' ? 'Standard' : lv} ${SIM.CLEAN_LEVELS[lv].min ? SIM.CLEAN_LEVELS[lv].min + 'm' : ''}</button>`).join('')}
      </div>
    </div>`).join('');

  app.innerHTML = sceneHTML('sky-dawn', G.rooms, 'morning') + deskOpen(`
    ${coachCard()}
    ${reportHTML()}
    ${inspCard}
    ${bankCard}
    ${standCard}
    ${seasonCard}
    ${inqCard}
    <div class="paper ratecard">
      <div class="reg-title">Tonight's rate — the card in the office window</div>
      <div class="rc-top">
        <button class="stepbtn" id="rate-down" aria-label="Lower rate">−</button>
        <div class="rate-big">$${draft.rate}</div>
        <button class="stepbtn" id="rate-up" aria-label="Raise rate">+</button>
      </div>
      <div class="forecast">Expect <b>~${fcLo}–${fcHi} parties</b> tonight${segNames ? ` — mostly ${esc(segNames)}` : ''}. ${moodLine}</div>
      <div class="rc-note">${inHouse} room${inHouse === 1 ? '' : 's'} already in house · ${ready} ready to sell.${evidence}</div>
    </div>
    <div class="paper">
      <div class="reg-title">Housekeeping — ${used} of ${pool} minutes</div>
      <div class="meter ${used > pool ? 'over' : ''}"><i style="width:${Math.min(100, pool ? used / pool * 100 : 0)}%"></i></div>
      ${dirty.length ? fobRows : '<div class="fobtag" style="padding:8px 0">Every room is ready. A quiet morning.</div>'}
      <label class="chk" id="btn-extra"><span class="box">${draft.extraCleaner ? '✓' : ''}</span> Call in a second cleaner (+150 min, $55)</label>
      <div class="hk-note">A room you skip stays dark tonight. A quick clean sells — and the guest can tell.</div>
    </div>
    <div class="deskrow"><button class="btn btn-ghost" id="btn-book">The guest book</button><button class="btn btn-ghost" id="btn-wall">The corkboard</button></div>
    <div class="actionbar"><button class="btn btn-primary" id="btn-open">Open the desk →</button></div>
    <div class="center"><button class="btn btn-ghost" id="btn-quit">Save &amp; back to title</button></div>`);

  document.getElementById('rate-down').onclick = () => { draft.rate = Math.max(35, draft.rate - 5); sfx('tick'); render(); };
  document.getElementById('rate-up').onclick = () => { draft.rate = Math.min(180, draft.rate + 5); sfx('tick'); render(); };
  document.getElementById('btn-extra').onclick = () => { draft.extraCleaner = !draft.extraCleaner; sfx('tick'); render(); };
  document.querySelectorAll('[data-clean]').forEach(b => b.onclick = () => {
    const [id, lv] = b.dataset.clean.split(':');
    draft.cleans[id] = lv; sfx('stamp'); render();
  });
  document.getElementById('btn-open').onclick = () => {
    if (draftMinutes() > pool) { alert('Housekeeping is over the minutes you have. Deep-clean fewer rooms, or call in the second cleaner.'); return; }
    applyDraftToPlan(); draft.sel = null; sfx('page'); save(); render();
  };
  document.getElementById('btn-quit').onclick = () => { save(); G = null; draft = null; render(); };
  document.querySelectorAll('[data-inq]').forEach(b => b.onclick = () => { draft.inquiryDecision = b.dataset.inq; sfx('stamp'); render(); });
  wireCoach();
  document.getElementById('btn-calendar').onclick = () => { uiView = 'calendar'; sfx('page'); render(); };
  document.getElementById('btn-catalog').onclick = () => { uiView = 'catalog'; sfx('page'); render(); };
  wireDeskRow();
}

function renderCalendar(){
  const rows = (G.calendar || SIM.CALENDAR).map(e => {
    let status, cls = '';
    if (G.night > e.to){ status = 'Done'; cls = 'done'; }
    else if (G.night >= e.from){ status = e.from === e.to ? 'Today' : 'On now'; cls = 'now'; }
    else status = `In ${e.from - G.night} night${e.from - G.night === 1 ? '' : 's'}`;
    return `<div class="calrow ${cls}"><span class="cal-when">Night${e.to > e.from ? 's' : ''} ${e.from}${e.to > e.from ? '–' + e.to : ''}</span>
      <span class="cal-main"><b>${esc(e.name)}</b><span class="cal-note">${esc(e.note)}</span></span>
      <span class="cal-status">${status}</span></div>`;
  }).join('');
  app.innerHTML = sceneHTML(G.phase === 'arrivals' ? 'sky-desk' : 'sky-dawn', G.rooms, G.phase) + deskOpen(`
    <div class="paper register">
      <div class="reg-title">The Season Calendar${G.season > 1 ? ` — Summer ${summerWord(G.season)}` : ''}</div>
      <div class="reg-head">Everything coming is written down.</div>
      <div class="reg-sub">Nothing on this page ambushes you. Set the rate, the cleaning, and the building around it.</div>
      ${rows}
    </div>
    <div class="center"><button class="btn btn-ghost" id="btn-back">Back to the desk</button></div>`);
  document.getElementById('btn-back').onclick = () => { uiView = 'desk'; render(); };
}

// Pass B: the catalog does its own arithmetic in the open. Cash estimates use
// last night's register at the keeper's recent pace; where an item pays in
// something other than cash, the line says so instead of dressing it up.
function paybackNote(id, cost){
  const rep = G.lastReport;
  // Floored: after a dead night the register reads zero, and a zero pace would
  // leave the line blank under the item — the one thing it must never do.
  const occN = Math.max(3, rep ? rep.occupied : Math.round(G.rooms.length * 0.65));
  const rev = Math.max(occN * 60, rep ? rep.roomRevenue : occN * 82);
  const left = SIM.SEASON_NIGHTS - G.night + 1;
  let gain = null, truth = '';
  if (id === 'website') gain = rev * 0.08;
  else if (id === 'sign') gain = rev * 0.12;
  else if (id === 'vending') gain = 1.6 * occN;
  else if (id === 'laundry') gain = 2.1 * occN * 0.6 + 4;
  else if (id === 'wifi') gain = rev * 0.02;
  else if (id === 'pool') gain = rev * 0.035;
  else if (id === 'expansion') gain = (occN / G.rooms.length) * 125;
  else if (id === 'security') truth = 'Pays in calm, not cash — about a third fewer knocks at the desk.';
  else if (id === 'mattress') truth = 'Pays in stars, not cash — one morning of work, and every bed judges newer all season.';
  else if (id === 'deepclean') truth = 'Pays in mornings, not cash — deep cleans take a third less time, so more care fits before the desk.';
  else if (id === 'ac') truth = 'Pays in July and in repairs — heat waves stop biting, and the rooms wear half as fast.';
  else if (id === 'breakfast') truth = 'Pays in families — they forgive $10 more of rate and write kinder cards, against $3.80 a room-night to run.';
  if (gain !== null && gain > 0){
    const nights = Math.max(1, Math.ceil(cost / gain));
    if (nights <= left) return `At your recent pace, pays for itself in about ${nights} nights.`;
    return `At your recent pace it would take about ${nights} nights — the season has ${left} left. Buy it for the stars, not the till.`;
  }
  return truth;
}
function renderCatalog(){
  SIM.ensureSeason(G);
  const owned = id => G.upgrades.includes(id);
  const items = SIM.UPGRADES.map(u => `
    <div class="shoprow">
      <div class="shop-main"><div class="shop-name">${esc(u.name)} ${owned(u.id) ? '<span class="ownedtag">Yours</span>' : ''}</div>
      <div class="shop-blurb">${esc(u.blurb)}</div>${owned(u.id) ? '' : `<div class="payback">${paybackNote(u.id, u.cost)}</div>`}</div>
      ${owned(u.id) ? '' : `<button class="stamp" data-buy="${u.id}">Buy — $${u.cost.toLocaleString('en-US')}</button>`}
    </div>`).join('');
  const ex = SIM.EXPANSIONS[G.expansions];
  const repairStamps = G.rooms.filter(r => r.condition < 100).map(r =>
    `<button class="stamp" data-repair="${r.id}">R${r.id} · ${Math.round(r.condition)}</button>`).join('');
  const renovateStamps = G.rooms.filter(r => r.tier !== 'renovated').map(r =>
    `<button class="stamp" data-renovate="${r.id}">R${r.id}${r.tier === 'renovated' ? '' : ''}</button>`).join('');
  app.innerHTML = sceneHTML('sky-dawn', G.rooms, 'morning') + deskOpen(`
    <div class="paper register">
      <div class="reg-title">The Supply Catalog — &amp; the Bank Envelope</div>
      <div class="reg-head">Order in the morning; it is yours by the desk.</div>
      <div class="reg-sub">Cash in the till: <b>${money(G.cash)}</b> · Credit drawn: <b>${money(G.credit)}</b> of $8,000, at 0.25% a night on the first $4,000 and 0.5% past it. Anything cash cannot cover draws on the line by itself.</div>
      ${items}
      <div class="reg-title" style="margin-top:16px">Build</div>
      ${ex ? `<div class="shoprow"><div class="shop-main"><div class="shop-name">${esc(ex.name)}</div>
        <div class="shop-blurb">Two more doors on the court, condition 90, ready tonight. New-wing rooms let for $8 over the card rate. The mortgage rises $16 a night, and housekeeping gains a hand (+40 minutes a day).${G.night < ex.unlock ? ` The crew can start on night ${ex.unlock}.` : ''}</div>
        <div class="payback">${paybackNote('expansion', ex.cost)}</div></div>
        ${G.night >= ex.unlock ? `<button class="stamp" data-expand="1">Build — $${ex.cost.toLocaleString('en-US')}</button>` : `<span class="ownedtag">Night ${ex.unlock}</span>`}</div>`
      : '<div class="fobtag" style="padding:6px 0">Sixteen rooms. The whole court is built.</div>'}
      <div class="reg-title" style="margin-top:16px">Room work</div>
      <div class="shop-blurb">Repair — $40 a room, condition +25. Renovate — $950 a room, condition back to 100, lets for $7 over the card rate, and the room reads renovated (+8 when guests judge it).</div>
      <div class="stamps" style="margin-top:8px">${repairStamps || '<span class="fobtag">Every room is sound.</span>'}</div>
      <div class="stamps" style="margin-top:8px">${renovateStamps || '<span class="fobtag">Every room renovated.</span>'}</div>
      <div class="reg-title" style="margin-top:16px">The bank envelope</div>
      <div class="stamps">
        <button class="stamp" data-credit="500">Draw $500</button>
        <button class="stamp" data-credit="1000">Draw $1,000</button>
        <button class="stamp" data-credit="-500">Repay $500</button>
        <button class="stamp" data-credit="repayAll">Repay all</button>
      </div>
      <div class="reg-title" style="margin-top:16px">Tonight</div>
      <div class="shoprow"><div class="shop-main"><div class="shop-name">Handyman on rounds</div>
      <div class="shop-blurb">$60 tonight. He walks the court and tightens what rattles (+1 condition everywhere), and knocks at the desk get rarer.</div></div>
      <button class="stamp ${draft && draft.handyman ? 'on' : ''}" data-handyman="1">${draft && draft.handyman ? 'Booked' : 'Book him'}</button></div>
    </div>
    <div class="center"><button class="btn btn-ghost" id="btn-back">Back to the desk</button></div>`);
  document.querySelectorAll('[data-buy]').forEach(b => b.onclick = () => { const r = SIM.purchase(G, b.dataset.buy); if (r.error) alert(r.error); else sfx('coin'); save(); render(); });
  const eb = document.querySelector('[data-expand]');
  if (eb) eb.onclick = () => { const r = SIM.purchaseExpansion(G); if (r.error) alert(r.error); else sfx('coin'); save(); render(); };
  document.querySelectorAll('[data-repair]').forEach(b => b.onclick = () => { const r = SIM.roomWork(G, 'repair', Number(b.dataset.repair)); if (r.error) alert(r.error); else sfx('coin'); save(); render(); });
  document.querySelectorAll('[data-renovate]').forEach(b => b.onclick = () => { const r = SIM.roomWork(G, 'renovate', Number(b.dataset.renovate)); if (r.error) alert(r.error); else sfx('coin'); save(); render(); });
  document.querySelectorAll('[data-credit]').forEach(b => b.onclick = () => { const v = b.dataset.credit; const r = SIM.adjustCredit(G, v === 'repayAll' ? 'repayAll' : Number(v)); if (r.error) alert(r.error); else sfx('coin'); save(); render(); });
  const hb = document.querySelector('[data-handyman]');
  if (hb) hb.onclick = () => { if (draft){ draft.handyman = !draft.handyman; } render(); };
  document.getElementById('btn-back').onclick = () => { uiView = 'desk'; render(); };
}

function wireDeskRow(){
  const bb = document.getElementById('btn-book');
  if (bb) bb.onclick = () => { uiView = 'book'; sfx('page'); render(); };
  const bw = document.getElementById('btn-wall');
  if (bw) bw.onclick = () => { uiView = 'wall'; sfx('page'); render(); };
}

function renderBook(){
  const rows = (G.guestBook || []).slice().sort((a, b) => b.lastNight - a.lastNight).map(e => `
    <div class="bookrow"><span class="b-name">${esc(e.name)}</span> <span class="segtag">${SIM.SEGMENTS[e.segment].label}</span>${e.trait ? ` <span class="traittag">${SIM.TRAITS[e.trait].label}</span>` : ''}
    <span class="b-meta">${e.visits} stay${e.visits > 1 ? 's' : ''} · last night ${e.lastNight} · ${stars(e.lastStars)}</span></div>`).join('');
  app.innerHTML = sceneHTML(G.phase === 'arrivals' ? 'sky-desk' : 'sky-dawn', G.rooms, G.phase) + deskOpen(`
    <div class="paper register">
      <div class="reg-title">The Guest Book</div>
      <div class="reg-head">Every name that ever signed in.</div>
      <div class="reg-sub">Regulars come back on their own — if their last stay earned it. One bad night strikes a name out.</div>
      ${rows || '<div class="fobtag" style="padding:8px 0">No one has stayed yet. The book is all blank pages and good intentions.</div>'}
    </div>
    <div class="center"><button class="btn btn-ghost" id="btn-back">Back to the desk</button></div>`);
  document.getElementById('btn-back').onclick = () => { uiView = 'desk'; render(); };
}

function renderWall(){
  const wall = (G.reviewWall || []).slice().reverse();
  const cards = wall.map(r => `
    <div class="commentcard ${r.stars <= 2 ? 'bad' : ''}">
      <div class="cc-head"><span class="cc-stars cst ${r.stars >= 4 ? 'hi' : r.stars === 3 ? 'mid' : 'lo'}">${stars(r.stars)}</span> ${esc(r.name)} <span style="font-family:'IBM Plex Mono',monospace;font-size:11px;opacity:.6">night ${r.night}</span></div>
      <blockquote>“${esc(r.text)}”</blockquote>
    </div>`).join('');
  app.innerHTML = sceneHTML(G.phase === 'arrivals' ? 'sky-desk' : 'sky-dawn', G.rooms, G.phase) + deskOpen(`
    <div class="corkboard">
      <div class="cb-head">The corkboard — ${wall.length} card${wall.length === 1 ? '' : 's'} · ${G.rating.toFixed(1)}★ overall</div>
      ${cards || '<div class="cb-empty">No cards yet. The board by the office door is bare cork, waiting.</div>'}
    </div>
    <div class="center"><button class="btn btn-ghost" id="btn-back">Back to the desk</button></div>`);
  document.getElementById('btn-back').onclick = () => { uiView = 'desk'; render(); };
}

function incidentHTML(){
  const inc = G.incident;
  if (!inc) return '';
  const room = G.rooms.find(r => r.id === inc.roomId);
  if (!room || !room.guest) return '';
  const k = SIM.INCIDENTS[inc.kind];
  const guest = room.guest;
  if (inc.resolved){
    const said = { fix: 'You sent the tools up. It hums like it should now.', comp: 'You took the night off their bill.', ride: 'You let it ride. They will remember that it rode.', move: 'You moved them to a fresh room.' }[inc.resolved];
    return `<div class="paper incident"><div class="reg-title">A knock at the desk — seen to</div>
      <div class="inc-head">${esc(guest.name)} — Room ${inc.roomId}: ${esc(k.label)}</div>
      <div class="inc-done">${said}</div></div>`;
  }
  return `<div class="paper incident">
    <div class="reg-title">A knock at the desk</div>
    <div class="inc-head">${esc(guest.name)} — Room ${inc.roomId}: ${esc(k.label)}</div>
    <div class="inc-text">${esc(inc.variant && k.text2 ? k.text2 : k.text)}</div>
    <div class="inc-note">A fresh room is the best apology there is. A comped guest won't post the savage review. Fixing costs $28 and a shrug from the toolbox.</div>
    ${draft && draft.moving ? '<div class="inc-done"><b>Tap a ready door</b> — the brass-outlined ones — to move them there.</div>' : ''}
    <div class="inc-stamps">
      <button class="stamp" data-inc="fix">Fix it tonight — $28</button>
      <button class="stamp ${draft && draft.moving ? 'on' : ''}" data-inc="move">Move them</button>
      <button class="stamp" data-inc="comp">Comp the night — $${guest.ratePaid}</button>
      <button class="stamp skip" data-inc="ride">Let it ride</button>
    </div></div>`;
}

function renderArrivals(){
  if (!draft) draft = { rate: G.rate, cleans: {}, extraCleaner: false, sel: null, inquiryDecision: null, moving: false, handyman: false };
  const q = G.queue;
  const cards = q.map((a, i) => `
    <div class="guest ${draft && draft.sel === a.id ? 'sel' : ''}" style="animation-delay:${Math.min(i * 45, 270)}ms" data-guest="${a.id}">
      <div class="g-name">${esc(a.name)} <span class="segtag">${SIM.SEGMENTS[a.segment].label}</span>${a.trait ? ` <span class="traittag">${SIM.TRAITS[a.trait].label}</span>` : ''}${a.returning ? ` <span class="rettag">Back again · stay #${a.visits}</span>` : ''}${a.inquiry ? ` <span class="blocktag">Block booking</span>` : ''}</div>
      <div class="g-sub">${a.nights} night${a.nights > 1 ? 's' : ''} · $${a.ratePaid}/night</div>
      ${a.line ? `<div class="g-line">“${esc(a.line)}”</div>` : ''}
      ${a.trait ? `<div class="g-hint">${SIM.TRAITS[a.trait].hint}</div>` : ''}
      ${a.want && SIM.QUIRKS[a.want] && SIM.QUIRKS[a.want].ask ? `<div class="wanttag">Hoping for ${SIM.QUIRKS[a.want].ask}.</div>` : ''}
      ${a.wantRoom ? `<div class="wanttag roomtag">Phoned ahead — asked for Room ${a.wantRoom}, theirs from last time.</div>` : ''}
      ${draft && draft.sel === a.id ? `<span class="turnaway" data-turn="${a.id}">turn away</span>` : ''}
    </div>`).join('');
  const selArrival = draft && draft.sel ? G.queue.find(a => a.id === draft.sel) : null;
  app.innerHTML = sceneHTML('sky-desk', G.rooms, 'arrivals', { labels: !!selArrival, want: selArrival ? selArrival.want : null, wantRoom: selArrival ? selArrival.wantRoom : null }) + deskOpen(`
    <div class="desk-h">Evening — the desk</div>
    ${coachCard()}
    <div class="desk-note">Rate tonight: <b>$${G.rate}</b>. ${q.length} part${q.length === 1 ? 'y' : 'ies'} waiting. Tap a guest card, then tap a door with a brass outline. End doors — 1 and 8 — are the quiet ones, and the line's patience runs out fast.</div>
    ${incidentHTML()}
    ${cards || '<div class="desk-note">The lot is quiet. Everyone who is coming is here.</div>'}
    <div class="deskrow"><button class="btn btn-ghost" id="btn-book">The guest book</button><button class="btn btn-ghost" id="btn-wall">The corkboard</button></div>
    <div class="actionbar"><button class="btn btn-walnut" id="btn-close">Close the desk — nightfall</button></div>`);

  const sc = document.getElementById('scene');
  if (sc) sc.classList.add('desk-sticky');
  document.querySelectorAll('[data-guest]').forEach(el => el.onclick = e => {
    if (e.target.dataset.turn) return;
    draft.sel = draft.sel === Number(el.dataset.guest) ? null : Number(el.dataset.guest);
    sfx('tick'); render();
  });
  document.querySelectorAll('[data-turn]').forEach(el => el.onclick = e => {
    e.stopPropagation();
    SIM.turnAway(G, Number(el.dataset.turn)); draft.sel = null; sfx('deny'); save(); render();
  });
  document.querySelectorAll('[data-inc]').forEach(el => el.onclick = () => {
    const act = el.dataset.inc;
    if (act === 'move'){ draft.moving = !draft.moving; sfx('tick'); render(); return; }
    SIM.resolveIncident(G, act); draft.moving = false;
    sfx(act === 'comp' ? 'coin' : act === 'ride' ? 'deny' : 'stamp');
    save(); render();
  });
  document.querySelectorAll('[data-room]').forEach(el => el.onclick = () => {
    const room = G.rooms.find(r => r.id === Number(el.dataset.room));
    if (!room || room.state !== 'ready') return;
    if (draft.moving){
      const res = SIM.resolveIncident(G, 'move', room.id);
      if (!res.error){ draft.moving = false; sfx('assign'); }
      save(); render(); return;
    }
    if (!draft.sel) return;
    SIM.assignRoom(G, draft.sel, room.id); draft.sel = null;
    uiFlash = room.id; setTimeout(() => { uiFlash = null; }, 950);
    sfx('assign'); save(); render();
  });
  wireDeskRow();
  wireCoach();
  document.getElementById('btn-close').onclick = () => {
    sfx('page');
    const finish = () => { SIM.closeDesk(G); draft = null; save(); render(); };
    const scene = document.getElementById('scene');
    const lit = Array.from(document.querySelectorAll('.unit.occ'));
    if (scene && lit.length){
      scene.classList.remove('sky-desk'); scene.classList.add('sky-night');
      lit.forEach((u, i) => { u.style.animationDelay = (i * 150) + 'ms'; u.classList.add('lights-out'); });
      setTimeout(finish, 480 + lit.length * 150);
    } else finish();
  };
}

function renderOver(){
  if (G.over === 'season' && G.ending){
    const e = G.ending;
    const best = (G.reviewWall || []).filter(r => r.stars === 5).slice(-1)[0];
    const worst = (G.reviewWall || []).filter(r => r.stars === 1).slice(-1)[0];
    const fav = (G.guestBook || []).slice().sort((a, b) => b.visits - a.visits)[0];
    const trophies = (e.trophies || []).map(t => `<div class="trophy"><span class="trophy-star">★</span><span><b>${esc(t.name)}</b> — ${esc(t.text)}</span></div>`).join('');
    const cardFor = r => `<div class="commentcard ${r.stars <= 2 ? 'bad' : ''}">
      <div class="cc-head"><span class="cc-stars cst ${r.stars >= 4 ? 'hi' : 'lo'}">${stars(r.stars)}</span> ${esc(r.name)}</div>
      <blockquote>“${esc(r.text)}”</blockquote></div>`;
    app.innerHTML = sceneHTML('sky-night', G.rooms, 'over') + deskOpen(`
    <div class="paper register">
      <div class="reg-tab">SEASON'S END</div>
      <div class="reg-title">The Register — Final Page</div>
      <div class="reg-head">${esc(e.title)}</div>
      <p style="font-family:'Source Serif 4',serif;font-size:15.5px;line-height:1.55">${esc(e.text)}</p>
      <div class="stats-mono">
        Final cash&nbsp;&nbsp;${money(G.cash)}${G.credit > 0 ? ` · credit still out ${money(G.credit)}` : ''}<br>
        Final rating&nbsp;&nbsp;${G.rating.toFixed(1)}★<br>
        Room-nights sold&nbsp;&nbsp;${G.stats.roomNights || 0} · full houses&nbsp;&nbsp;${G.stats.fullHouses || 0}<br>
        Occupancy&nbsp;&nbsp;${G.stats.possibleRoomNights ? Math.round((G.stats.roomNights || 0) / G.stats.possibleRoomNights * 100) : 0}% of the season's doors<br>
        Guests hosted&nbsp;&nbsp;${G.stats.guests} · reviews left&nbsp;&nbsp;${G.stats.reviews}<br>
        Rooms by summer's end&nbsp;&nbsp;${G.rooms.length} · catalog bought&nbsp;&nbsp;${(G.upgrades || []).length} of ${SIM.UPGRADES.length}
      </div>
      ${G.cashHistory && G.cashHistory.length > 1 ? `<div class="sparkrow"><span>The till, night by night</span>${sparkSVG(G.cashHistory, 260, 40)}</div>` : ''}
      ${trophies ? `<div class="reg-title" style="margin-top:14px">Trophies</div>${trophies}` : ''}
      ${best ? `<div class="reg-title" style="margin-top:14px">The kindest card</div>${cardFor(best)}` : ''}
      ${worst ? `<div class="reg-title" style="margin-top:14px">The one that stung</div>${cardFor(worst)}` : ''}
      ${fav ? `<div class="reg-sub" style="margin-top:12px">The book's most faithful name: ${esc(fav.name)} — ${fav.visits} stay${fav.visits === 1 ? '' : 's'}.</div>` : ''}
      ${(G.ledger && G.ledger.length) ? `<div class="reg-title" style="margin-top:14px">From the Keeper's Ledger</div>${G.ledger.map(ledgerRow).join('')}` : ''}
    </div>
    <button class="btn btn-primary" id="btn-next-season">Open the next summer</button>
    <button class="btn btn-walnut" id="btn-new2">Close the book — start fresh</button>`);
    document.getElementById('btn-next-season').onclick = () => { G = SIM.startNextSeason(G, typeof CONTENT !== 'undefined' ? CONTENT : null); draft = null; save(); render(); };
    document.getElementById('btn-new2').onclick = () => { localStorage.removeItem(SAVE_KEY); G = null; draft = null; render(); };
    return;
  }
  app.innerHTML = sceneHTML('sky-night', G.rooms, 'over') + deskOpen(`
    <div class="paper register">
      <div class="reg-title">The Register — Final Page</div>
      <div class="reg-head">The bank took the Starlight.</div>
      <p style="font-family:'Source Serif 4',serif;font-size:15.5px;line-height:1.55">The sign still buzzes for a night or two after. Somebody else will stand in this court at dusk and see what you saw. What you built — and what the reviews said — stays in the book.</p>
      <div class="stats-mono">
        Nights run&nbsp;&nbsp;${G.stats.nights}<br>
        Guests hosted&nbsp;&nbsp;${G.stats.guests}<br>
        Room revenue taken&nbsp;&nbsp;${money(G.stats.revenue)}<br>
        Reviews left&nbsp;&nbsp;${G.stats.reviews}<br>
        Final rating&nbsp;&nbsp;${G.rating.toFixed(1)}★
      </div>
    </div>
    <button class="btn btn-primary" id="btn-new2">Start over</button>`);
  document.getElementById('btn-new2').onclick = () => { localStorage.removeItem(SAVE_KEY); G = null; draft = null; render(); };
}

function renderTonightCard(){
  const rep = G.lastReport;
  const profit = rep.profit; // the report carries profit; costs have no .total field
  const fives = rep.checkouts.filter(x => x.stars === 5).length;
  const dateStr = todayLabel();
  let bestLine = '';
  try {
    let best = JSON.parse(localStorage.getItem(TONIGHT_BEST_KEY) || 'null');
    if (!best || best.date !== dateStr || profit > best.profit){
      best = { date: dateStr, profit };
      localStorage.setItem(TONIGHT_BEST_KEY, JSON.stringify(best));
    }
    bestLine = best.profit === profit && best.date === dateStr
      ? `That is the best tonight this device has kept.` : `Best tonight on this device: ${money(best.profit)}.`;
  } catch(e){}
  const co = rep.checkouts.map(x => {
    const cls = x.score >= 80 ? 'hi' : x.score >= 60 ? 'mid' : 'lo';
    return `<div class="co"><b>${esc(x.name)}</b> <span class="segtag">${SIM.SEGMENTS[x.segment].label}</span> <span class="cst ${cls}">${stars(x.stars)}</span> <span class="score">score ${x.score}</span></div>`;
  }).join('');
  app.innerHTML = sceneHTML('sky-morning', G.rooms, 'morning') + deskOpen(`
    <div class="paper">
      <div class="reg-title">Tonight at the Starlight · ${dateStr}</div>
      <h2 class="reg-h">The night, graded</h2>
      <p class="note">Night 43 — ten rooms, the Starling Suites open across the highway, and the same house the whole world got today. One night is all it ever was.</p>
      <div class="led"><span>Rooms filled</span><b>${rep.occupied} of ${G.rooms.length}</b></div>
      <div class="led"><span>Room revenue</span><b>${money(rep.revenue)}</b></div>
      <div class="led"><span>The night's costs</span><b>${money(rep.profit - rep.revenue)}</b></div>
      <div class="led total"><span>The night's result</span><b>${money(profit)}</b></div>
      <div class="led"><span>The star</span><b>${G.tonight.ratingBefore.toFixed(1)}★ → ${G.rating.toFixed(1)}★</b></div>
      ${fives ? `<div class="led"><span>Five-star goodbyes</span><b>${fives}</b></div>` : ''}
      ${co ? `<div class="reg-title" style="margin-top:12px">Who slept, and what they said with their stars</div>${co}` : '<p class="note">Nobody checked out this morning.</p>'}
      <p class="note">${bestLine} Come back tomorrow — the road deals a different house.</p>
    </div>
    <button class="btn btn-primary" id="btn-again">Run it back — same house, same night</button>
    <button class="btn btn-walnut" id="btn-ttitle">Back to the title</button>`);
  document.getElementById('btn-again').onclick = () => {
    G = SIM.buildTonight(dailySeed(), typeof CONTENT !== 'undefined' ? CONTENT : null);
    draft = null; save(); render();
  };
  document.getElementById('btn-ttitle').onclick = () => { tonightMode = false; G = null; draft = null; render(); };
}

function render(){
  if (!G) renderTitle();
  else if (tonightMode && G.lastReport && G.tonight && G.lastReport.night === G.tonight.night) renderTonightCard();
  else if (G.over) renderOver();
  else {
    if (uiPhase !== G.phase){ uiView = 'desk'; uiPhase = G.phase; }
    if (uiView === 'book') renderBook();
    else if (uiView === 'wall') renderWall();
    else if (uiView === 'calendar') renderCalendar();
    else if (uiView === 'catalog') renderCatalog();
    else if (G.phase === 'arrivals') renderArrivals();
    else renderMorning();
  }
  afterRender();
}
render();
/*UI-END*/
