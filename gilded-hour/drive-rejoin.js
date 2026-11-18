/* drive-rejoin.js — Pass 7 (Online room finished), the pad half.
   Two stub-server scenarios:
   A) THE DEAD-END, FIXED: the room answers this pad's first
      rejoin hello with 'Seat is taken.' (its earlier connection
      still holds the seat). The old pad toasted and sat on
      'Finding your podium' forever. The fixed pad closes and
      re-hellos until it lands — here the second hello is
      welcomed into the lobby.
   B) THE ROSTER LINE: the lobby snapshot seats Ana (ready),
      Bo (this pad) and Cy — the roster under the hero names
      the OTHERS with their ready ticks, never the pad's own
      player; a solo lobby reads the first-here line instead.
   The server half (the rebind itself) is proven in
   gilded-hour-server/test/test-rejoin.js. */
const { launchBrowser } = require('./rig');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const url = 'file:///home/hatch/workspace/gilded-hour/index.html';
let fails = 0;
function check(name, ok, detail) { console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' | ' + detail : '')); if (!ok) fails++; }
function watch(page, errors) { page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); }); }

function stubScript(mode) {
  return (mode) => {
    localStorage.setItem('gh_player', JSON.stringify({ code: 'TEST', reclaimToken: 'tok-bo', name: 'Bo' }));
    window.__hellos = 0;
    window.WebSocket = class FakeWS {
      constructor(u) { this.url = u; this.readyState = 1; setTimeout(() => { if (this.onopen) this.onopen(); }, 20); }
      send(data) {
        let m = {};
        try { m = JSON.parse(data); } catch (e) {}
        const deliver = obj => setTimeout(() => { if (this.onmessage) this.onmessage({ data: JSON.stringify(obj) }); }, 30);
        const P = (seat, name, ready) => ({ seat, name, score: 0, cutTwo: true, connected: true, ready, avatar: seat });
        const lobby = (players) => ({ t: 'state', state: {
          code: 'TEST', phase: 'lobby', role: 'player', seat: 1, showSeq: 1,
          players, question: null, bet: null, lastReveal: null,
          yourPick: null, yourNum: null, yourBet: null, declared: {},
        } });
        if (m.t === 'hello' && m.role === 'player') {
          window.__hellos++;
          if (mode === 'taken' && window.__hellos === 1) { deliver({ t: 'error', msg: 'Seat is taken.' }); return; }
          deliver({ t: 'welcome', role: 'player', code: 'TEST', seat: 1, reclaimToken: 'tok-bo' });
          if (mode === 'solo') deliver(lobby([null, P(1, 'Bo', false), null, null]));
          else deliver(lobby([P(0, 'Ana', true), P(1, 'Bo', false), P(2, 'Cy', false), null]));
        }
      }
      close() { this.readyState = 3; setTimeout(() => { if (this.onclose) this.onclose(); }, 10); }
    };
  };
}

async function joinAsBo(page) {
  await page.goto(url, { waitUntil: 'load', timeout: 60000 });
  await sleep(500);
  await page.tap('.mode-tab[data-mode="join"]');
  await sleep(150);
  await page.click('#joinBoxes .code-box');
  await page.keyboard.type('TEST', { delay: 30 });
  await page.type('#joinName', 'Bo');
  await page.tap('#btnJoinRoom');
}

(async () => {
  const browser = await launchBrowser();
  try {
    /* ---- A: Seat-is-taken is retried, not a dead end ---- */
    const errorsA = [];
    const padA = await browser.newPage();
    watch(padA, errorsA);
    await padA.setViewport({ width: 390, height: 844 });
    await padA.evaluateOnNewDocument(stubScript(), 'taken');
    await joinAsBo(padA);
    let landed = null;
    for (let i = 0; i < 50 && !landed; i++) {
      landed = await padA.evaluate(() => {
        const w = document.getElementById('jpPhaseWord');
        return w && w.textContent === 'IN THE LOBBY' ? { hellos: window.__hellos } : null;
      });
      if (!landed) await sleep(250);
    }
    check('A: the pad retried the refused rejoin and reached the lobby', !!landed, landed ? 'hellos=' + landed.hellos : 'stuck');
    check('A: exactly one retry was needed', !!landed && landed.hellos === 2, landed ? 'hellos=' + landed.hellos : '');

    /* ---- B: the roster line ---- */
    const roster = await padA.evaluate(() => {
      const r = document.querySelector('.jp-roster');
      return r ? r.textContent.replace(/\s+/g, ' ').trim() : null;
    });
    check('B: the roster names the other players', !!roster && roster.includes('Ana') && roster.includes('Cy'), JSON.stringify(roster));
    check('B: Ana wears her ready tick, Cy does not', !!roster && /Ana\s*✓/.test(roster) && !/Cy\s*✓/.test(roster), JSON.stringify(roster));
    check('B: the roster never lists the pad\'s own player', !!roster && !roster.includes('Bo'), JSON.stringify(roster));
    await padA.screenshot({ path: 'shots/pad-lobby-roster.png' });
    await padA.close();

    /* ---- B2: a solo lobby reads the first-here line ---- */
    const errorsB = [];
    const padB = await browser.newPage();
    watch(padB, errorsB);
    await padB.setViewport({ width: 390, height: 844 });
    await padB.evaluateOnNewDocument(stubScript(), 'solo');
    await joinAsBo(padB);
    let solo = null;
    for (let i = 0; i < 40 && !solo; i++) {
      solo = await padB.evaluate(() => {
        const r = document.querySelector('.jp-roster-wait');
        return r ? r.textContent : null;
      });
      if (!solo) await sleep(250);
    }
    check('B2: a solo lobby reads the first-here line', !!solo && /first here/.test(solo), JSON.stringify(solo));
    await padB.close();

    check('No console/page errors', errorsA.length + errorsB.length === 0, errorsA.concat(errorsB).join(' ; ').slice(0, 200));
  } finally { await browser.close(); }
  console.log('DRIVE-REJOIN DONE — ' + (fails ? fails + ' FAILURES' : 'all checks passed'));
  process.exitCode = fails ? 1 : 0;
})();
