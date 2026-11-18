/* drive-solo.js — the 1–4 ruling (2026-11-17): online has no
   two-player floor. A room with ONE phone in it is a playable
   room. Host-side gates, proven against a stubbed room:
     A) the lobby with one player in: the greeting counts one,
        START THE SHOW stands ENABLED (it used to sit disabled
        until a second phone joined), and the status line reads
        READY 0 / 1. Tapping START deals the show.
     B) the auto-start: when that one phone says READY, Sterling
        starts the show himself — no second phone, no START tap.
   The rematch half of the ruling (one player still connected
   rematches; nobody connected scatters) is drive-rematch's
   ONE LEFT and SCATTERED sections. */
const { launchBrowser } = require('./rig');
const fs = require('fs');
const http = require('http');
const path = require('path');
const ROOT = '/home/hatch/workspace/gilded-hour';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0;
function check(name, ok, detail) { console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' | ' + detail : '')); if (!ok) fails++; }

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(p, (err, data) => {
    if (err) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' });
    res.end(data);
  });
});

function soloStubInit() {
  const okj = obj => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(obj) });
  window.__sent = [];
  window.__robinReady = false;
  window.fetch = function (u) {
    const url = String(u);
    if (url.indexOf('gilded-hour-rooms') >= 0) return okj({ code: 'TEST', hostToken: 'tok' });
    if (url.indexOf('gilded-hour-sterling') >= 0) return okj({ line: 'LIVE LINE' });
    if (url.indexOf('gilded-hour-nightly') >= 0) return okj({ question: null, intro: null });
    return Promise.reject(new Error('offline in solo drive'));
  };
  const playersArr = () => [
    { seat: 0, name: 'Robin', score: 0, cutTwo: true, connected: true, ready: window.__robinReady, avatar: 0 },
    null, null, null,
  ];
  const state = (phase, extra) => Object.assign({
    code: 'TEST', phase, role: 'host', seat: null, showSeq: 1,
    players: playersArr(), question: null, bet: null, lastReveal: null, intermission: null,
  }, extra || {});
  window.WebSocket = class FakeWS {
    constructor(u) { this.url = u; this.readyState = 1; setTimeout(() => { if (this.onopen) this.onopen(); }, 20); }
    send(data) {
      let m = {};
      try { m = JSON.parse(data); } catch (e) {}
      window.__sent.push(m);
      const deliver = (obj, ms) => setTimeout(() => { if (this.onmessage) this.onmessage({ data: JSON.stringify(obj) }); }, ms == null ? 30 : ms);
      window.__deliver = deliver;
      if (m.t === 'hello' && m.role === 'host') {
        deliver({ t: 'welcome', role: 'host', code: 'TEST' });
        deliver({ t: 'state', state: state('lobby') });
      }
    }
    close() { this.readyState = 3; }
  };
  window.__stubReady = () => { window.__robinReady = true; if (window.__deliver) window.__deliver({ t: 'state', state: state('lobby') }); };
}

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const httpUrl = 'http://127.0.0.1:' + server.address().port + '/index.html';
  const browser = await launchBrowser({ protocolTimeout: 240000 });
  const errors = [];
  const watch = p => {
    p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    p.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  };

  async function hostPage() {
    const p = await browser.newPage();
    watch(p);
    await p.evaluateOnNewDocument(soloStubInit);
    await p.setViewport({ width: 844, height: 390 });
    await p.goto(httpUrl, { waitUntil: 'load', timeout: 60000 });
    await sleep(400);
    await p.tap('.mode-tab[data-mode="host"]');
    await sleep(200);
    await p.tap('#btnCreateRoom');
    await p.waitForSelector('#ogStart', { timeout: 15000 });
    await sleep(400);
    return p;
  }
  const started = p => p.evaluate(() => !!(window.__online && window.__online.OG && window.__online.OG.started));

  /* ---- A: one player in — the button stands enabled ---- */
  const a = await hostPage();
  const aLobby = await a.evaluate(() => ({
    startDisabled: document.getElementById('ogStart').disabled,
    status: (document.getElementById('ogLobbyStatus') || {}).textContent || '',
    stage: document.getElementById('stage').innerText.replace(/\s+/g, ' '),
  }));
  check('A: the lobby counts the one player in', aLobby.stage.includes('1 player is in.'), aLobby.stage.slice(0, 120));
  check('A: START THE SHOW stands enabled for a room of one', aLobby.startDisabled === false);
  check('A: the status line reads READY 0 / 1', aLobby.status === 'READY 0 / 1 — Sterling starts it when every phone is ready.', aLobby.status);
  await a.tap('#ogStart');
  let aStarted = false;
  try { await a.waitForFunction(() => !!(window.__online && window.__online.OG && window.__online.OG.started), { timeout: 10000 }); aStarted = true; } catch (e) {}
  check('A: tapping START deals the show for the room of one', aStarted);
  let aIntro = false;
  try { await a.waitForSelector('#ogRoundGo', { timeout: 15000 }); aIntro = true; } catch (e) {}
  check('A: the Round 1 intro paints (the show is underway)', aIntro);
  await a.close();

  /* ---- B: one phone says READY — Sterling starts it himself ---- */
  const b = await hostPage();
  await sleep(1200);
  check('B: no start while the one phone is not ready', !(await started(b)));
  await b.evaluate(() => window.__stubReady());
  let bStarted = false;
  try { await b.waitForFunction(() => !!(window.__online && window.__online.OG && window.__online.OG.started), { timeout: 10000 }); bStarted = true; } catch (e) {}
  check('B: the one ready phone starts the show — no second phone, no START tap', bStarted);
  let bIntro = false;
  try { await b.waitForSelector('#ogRoundGo', { timeout: 15000 }); bIntro = true; } catch (e) {}
  check('B: the Round 1 intro paints (the show is underway)', bIntro);
  await b.close();

  check('No console/page errors on any page', errors.length === 0, errors.slice(0, 3).join(' ;; '));
  console.log(fails === 0 ? 'DRIVE-SOLO: ALL PASS' : 'DRIVE-SOLO: ' + fails + ' FAILURES');
  await browser.close();
  server.close();
  process.exit(fails === 0 ? 0 : 1);
})().catch(e => { console.error('DRIVE-SOLO CRASH:', e.message); process.exit(2); });
