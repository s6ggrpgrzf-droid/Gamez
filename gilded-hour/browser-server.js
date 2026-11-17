/* browser-server.js — the standing browser.
   One Chrome, launched once, kept alive by this supervisor, shared
   by every drive through rig.js's connect path. Built 2026-11-11
   after a day of dead launch windows: the host intermittently kills
   Chrome during startup, so launching per drive made every drive
   a dice roll. This process absorbs that problem in the background
   — it launches when a window opens, health-checks what it launched,
   and relaunches on death, forever, without anyone waiting on it.
   It writes the connection endpoint to .browser-endpoint; rig.js
   reads it. Single instance: if a healthy endpoint already answers,
   a second copy exits quietly.
   Sandbox note: file writes from spawned processes are refused
   intermittently here (EPERM — the same flakiness that killed the
   day's shell-redirected batches, and this server's first version
   crashed on its pid write). Every write below is retried and
   tolerated: a refused endpoint write is retried in the health
   loop rather than allowed to kill the browser it describes. */
"use strict";
const fs = require('fs');
const path = require('path');
const puppeteer = require('/home/hatch/workspace/.shot/node_modules/puppeteer-core');

const DIR = __dirname;
/* GH_CHROME_PATH overrides the browser binary, same lever and same
   default as rig.js (a full-Chrome build stands by as a workaround
   for the headless shell's SIGTRAP dead windows) */
const CHROME = process.env.GH_CHROME_PATH || '/home/hatch/workspace/.shot/browsers/chrome-headless-shell/linux-156.0.8078.73/chrome-headless-shell-linux64/chrome-headless-shell';
const ENDPOINT_FILE = path.join(DIR, '.browser-endpoint');
const PID_FILE = path.join(DIR, '.browser-server.pid');
const PROFILE_DIR = path.join(DIR, '.browser-profile');
const ARGS = ['--no-sandbox', '--allow-file-access-from-files', '--disable-dev-shm-usage', '--no-zygote', '--mute-audio', '--disable-extensions', '--disable-background-networking', '--no-first-run', '--enable-unsafe-swiftshader'];

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function log(msg) { try { console.log(new Date().toISOString() + ' [browser-server] ' + msg); } catch (e) {} }

async function writeFileSafe(file, data) {
  for (let i = 0; i < 5; i++) {
    try { fs.writeFileSync(file, data); return true; }
    catch (e) { if (i < 4) await sleep(1000); }
  }
  return false;
}
function unlinkSafe(file) { try { fs.unlinkSync(file); } catch (e) {} }

/* Page proof: open and close a real page (about:blank). A
   half-dead browser can still answer version() while being
   unable to render — version() alone is not a health proof. */
async function pageProof(browser, timeoutMs) {
  await Promise.race([
    (async () => {
      const page = await browser.newPage();
      await page.close();
    })(),
    sleep(timeoutMs).then(() => { throw new Error('page proof timeout'); })
  ]);
}

async function endpointAnswers() {
  let b = null;
  try {
    const ep = JSON.parse(fs.readFileSync(ENDPOINT_FILE, 'utf8'));
    if (!ep || !ep.wsEndpoint) return false;
    b = await puppeteer.connect({ browserWSEndpoint: ep.wsEndpoint, protocolTimeout: 8000 });
    await pageProof(b, 10000);
    await b.disconnect();
    return true;
  } catch (e) {
    try { if (b) await b.disconnect(); } catch (e2) {}
    return false;
  }
}

async function launchOnce() {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    args: ARGS,
    userDataDir: PROFILE_DIR,
    protocolTimeout: 240000,
    defaultViewport: null,
  });
  /* prove the launch with a real page, like the rig does */
  const page = await browser.newPage();
  await page.goto('about:blank');
  await page.close();
  return browser;
}

async function supervise() {
  if (await endpointAnswers()) { log('a healthy standing browser already answers — exiting'); return; }
  await writeFileSafe(PID_FILE, String(process.pid));
  let backoffIdx = 0;
  const BACKOFF = [5000, 10000, 20000, 30000, 45000, 60000];
  for (;;) {
    let browser = null;
    try {
      browser = await launchOnce();
    } catch (e) {
      const wait = BACKOFF[Math.min(backoffIdx++, BACKOFF.length - 1)];
      log('launch failed (' + String(e.message).split('\n')[0] + ') — retrying in ' + (wait / 1000) + 's');
      await sleep(wait);
      continue;
    }
    backoffIdx = 0;
    const ep = { wsEndpoint: browser.wsEndpoint(), pid: browser.process() ? browser.process().pid : null, startedAt: new Date().toISOString() };
    let epWritten = await writeFileSafe(ENDPOINT_FILE, JSON.stringify(ep, null, 2));
    log('standing browser up: ' + ep.wsEndpoint + ' (chrome pid ' + ep.pid + ')' + (epWritten ? '' : ' — endpoint write refused, retrying in the health loop'));
    /* health watch — until the browser dies or disconnects.
       Every cycle (20s) runs the page proof, not just version():
       opening/closing one about:blank page is cheap (a few ms on
       a healthy browser) and it is the only probe that catches a
       half-dead browser that answers version() but cannot render,
       so the slower-cadence alternative was not needed. */
    let dead = false;
    browser.on('disconnected', () => { dead = true; });
    while (!dead) {
      await sleep(20000);
      if (!epWritten) epWritten = await writeFileSafe(ENDPOINT_FILE, JSON.stringify(ep, null, 2));
      try { await pageProof(browser, 10000); }
      catch (e) { dead = true; }
    }
    log('standing browser died — relaunching');
    unlinkSafe(ENDPOINT_FILE);
    try { await browser.close(); } catch (e) {}
    await sleep(2000);
  }
}

process.on('SIGTERM', () => { unlinkSafe(ENDPOINT_FILE); process.exit(0); });
supervise().catch(e => { log('supervisor crashed: ' + e.message); process.exit(1); });
