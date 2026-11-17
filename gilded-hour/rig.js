/* rig.js — the resilient browser launcher for Gilded Hour drives.
 *
 * Why this exists (2026-11-10): the sandbox host is oversubscribed and
 * chrome-headless-shell intermittently dies at launch with SIGTRAP
 * (exit 133, "Trace/breakpoint trap", zero stderr) — the browser process
 * is trapped during early init before it can print anything. It is NOT
 * memory (1.1GB free during failures), not pids, not file handles, not
 * /dev/shm, not commit limits — every one of those was measured during
 * a dead window. The failure comes in windows: the same binary, flags
 * and code pass whole drives for an hour, then no launch succeeds for
 * several minutes, then windows reopen. No flag fixes a trap in early
 * init (the full lean set was tried). What fixes the WORKFLOW is a
 * launcher that survives a dead window: cheap attempts, full cleanup
 * between them, growing backoff, a bounded budget — so a drive that
 * starts in a dead window still runs when the window opens, instead of
 * an agent sleeping and guessing.
 *
 * Usage in a drive:
 *   const { launchBrowser } = require('./rig');
 *   const browser = await launchBrowser({ protocolTimeout: 600000 });
 * Throws only after the whole budget is spent; the caller reports the
 * rig as dead, which is then a measured fact, not a vibe.
 */
"use strict";
const puppeteer = require('/home/hatch/workspace/.shot/node_modules/puppeteer-core');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

/* GH_CHROME_PATH overrides the browser binary (2026-11-16: a
   full-Chrome build stands by as a workaround for the headless
   shell's SIGTRAP dead windows — a different binary walks a
   different early-init path) */
const CHROME = process.env.GH_CHROME_PATH || '/home/hatch/workspace/.shot/browsers/chrome-headless-shell/linux-156.0.8078.73/chrome-headless-shell-linux64/chrome-headless-shell';
const BASE_ARGS = ['--no-sandbox', '--allow-file-access-from-files', '--disable-dev-shm-usage', '--no-zygote', '--mute-audio', '--disable-extensions', '--disable-background-networking', '--no-first-run'];
/* backoff between attempts: the DELAYS sum to ≈ 7.5 minutes of
   waiting, but the direct loop no longer always spends all of
   it — launchBrowser caps standing wait + direct loop at one
   shared budget (TOTAL_BUDGET_MS below, ≈ 10 minutes), so the
   tail is truncated when the standing wait already burned part
   of the budget. With GH_RIG_DIRECT=1 (no standing wait) the
   loop can spend the full DELAYS sum as before. The original
   ~3.2-minute budget was tuned on Nov 10's windows; Nov 11's
   ran longer, so the tail stretches — a launch attempt is
   cheap, and giving up costs a whole drive while waiting costs
   only minutes. */
const DELAYS = [4000, 8000, 12000, 20000, 30000, 45000, 60000, 75000, 90000, 105000];
/* Shared total budget for one launchBrowser call: standing wait
   (default 5 minutes, see connectStanding) + direct loop
   together never exceed ≈ 10 minutes by default. Previously the
   two stacked to ~17 minutes (9-minute standing wait, then the
   full ~8-minute direct loop). Per-drive overrides still work:
   opts.standingWaitMs sets the standing wait (the total then
   becomes that wait + 5 minutes of direct loop), and
   opts.totalBudgetMs sets the total directly. */
const TOTAL_BUDGET_MS = 600000;
const DEFAULT_STANDING_WAIT_MS = 300000;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function tryLaunch(opts) {
  const args = BASE_ARGS.concat(opts.extraArgs || []);
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    args: args,
    protocolTimeout: opts.protocolTimeout || 300000,
    timeout: 60000,
  });
  /* a launch that "succeeds" into a half-dead browser is worse than a
     clean failure: prove the browser can open a page before returning */
  const page = await browser.newPage();
  await page.close();
  return browser;
}

/* ---------- the standing browser (2026-11-11) ----------
   browser-server.js keeps one Chrome alive all day; drives CONNECT
   to it instead of launching their own, so a dead launch window is
   absorbed by a background process instead of failing drives one by
   one. launchBrowser tries this path first and falls back to the
   direct launch loop below when no standing browser can be had —
   the old behaviour is the safety net, not the plan. Set
   GH_RIG_DIRECT=1 to skip the standing browser entirely.
   Isolation: a launched-per-drive browser always had a fresh
   profile; the standing one does not, so the wrapper hands every
   newPage() a fresh browser context (clean storage per page) and
   maps the drive's browser.close() to a disconnect — a drive must
   never kill the browser the next drive needs. */
const SERVER_JS = path.join(__dirname, 'browser-server.js');
const ENDPOINT_FILE = path.join(__dirname, '.browser-endpoint');
const SERVER_PID_FILE = path.join(__dirname, '.browser-server.pid');
const SERVER_LOCK = path.join(__dirname, '.browser-server.lock');
const SERVER_LOG = path.join(__dirname, 'browser-server.log');

function serverAlive() {
  try {
    const pid = parseInt(fs.readFileSync(SERVER_PID_FILE, 'utf8'), 10);
    if (pid) { process.kill(pid, 0); return true; }
  } catch (e) {}
  /* the pid file's write can be refused (EPERM) while the server
     itself runs fine — fall back to scanning /proc, which only
     reads. Without this, every drive would spawn a duplicate
     supervisor whenever the pid write lost its dice roll. */
  try {
    for (const d of fs.readdirSync('/proc')) {
      if (!/^\d+$/.test(d)) continue;
      try {
        const cmd = fs.readFileSync('/proc/' + d + '/cmdline', 'utf8');
        if (cmd.indexOf('browser-server.js') >= 0) return true;
      } catch (e) {}
    }
  } catch (e) {}
  return false;
}
function ensureServer() {
  if (serverAlive()) return;
  try { fs.mkdirSync(SERVER_LOCK); }
  catch (e) {
    /* someone is already spawning it — unless the lock went stale */
    try {
      if (Date.now() - fs.statSync(SERVER_LOCK).mtimeMs < 30000) return;
      fs.rmdirSync(SERVER_LOCK); fs.mkdirSync(SERVER_LOCK);
    } catch (e2) { return; }
  }
  try {
    if (serverAlive()) return;
    const fd = fs.openSync(SERVER_LOG, 'a');
    const child = spawn(process.execPath, [SERVER_JS], { detached: true, stdio: ['ignore', fd, fd] });
    child.unref();
    if (!optsQuietGlobal) console.log('[rig] standing-browser supervisor spawned (log: browser-server.log)');
  } catch (e) { /* the direct-launch fallback covers a failed spawn */ }
  try { fs.rmdirSync(SERVER_LOCK); } catch (e) {}
}
let optsQuietGlobal = false;

function wrapStanding(real) {
  return new Proxy(real, {
    get(t, prop) {
      if (prop === '_isStanding') return true;
      if (prop === 'newPage') return async function () {
        const ctx = await t.createBrowserContext();
        const page = await ctx.newPage();
        const origClose = page.close.bind(page);
        page.close = async function () {
          try { return await origClose(); }
          finally { try { await ctx.close(); } catch (e) {} }
        };
        return page;
      };
      if (prop === 'close' || prop === 'disconnect') return async function () {
        try { await t.disconnect(); } catch (e) {}
      };
      const v = t[prop];
      return typeof v === 'function' ? v.bind(t) : v;
    }
  });
}

async function connectStanding(opts) {
  const deadline = Date.now() + (opts.standingWaitMs || DEFAULT_STANDING_WAIT_MS);
  let lastEnsure = 0;
  while (Date.now() < deadline) {
    if (Date.now() - lastEnsure > 15000) { ensureServer(); lastEnsure = Date.now(); }
    let real = null;
    try {
      const ep = JSON.parse(fs.readFileSync(ENDPOINT_FILE, 'utf8'));
      if (ep && ep.wsEndpoint) {
        real = await puppeteer.connect({ browserWSEndpoint: ep.wsEndpoint, protocolTimeout: opts.protocolTimeout || 240000 });
        /* page proof, same standard as tryLaunch: a half-dead
           browser can answer version() but not open a page, so
           version() alone must not pass this probe */
        await Promise.race([
          (async () => {
            const page = await real.newPage();
            await page.close();
          })(),
          sleep(8000).then(() => { throw new Error('probe timeout'); })
        ]);
        if (!opts.quiet) console.log('[rig] connected to the standing browser');
        return wrapStanding(real);
      }
    } catch (e) {
      try { if (real) await real.disconnect(); } catch (e2) {}
      /* endpoint stale or browser mid-relaunch — keep waiting */
    }
    await sleep(2000);
  }
  return null;
}

async function launchBrowser(opts) {
  opts = opts || {};
  optsQuietGlobal = !!opts.quiet;
  const startedAt = Date.now();
  /* one shared budget across both paths (see TOTAL_BUDGET_MS):
     time spent waiting on the standing browser comes out of the
     same ≈ 10 minutes the direct loop may spend */
  const totalBudgetMs = opts.totalBudgetMs || (typeof opts.standingWaitMs === 'number' ? opts.standingWaitMs + (TOTAL_BUDGET_MS - DEFAULT_STANDING_WAIT_MS) : TOTAL_BUDGET_MS);
  let attempts = 0;
  if (!process.env.GH_RIG_DIRECT) {
    const standingOpts = Object.assign({}, opts, {
      standingWaitMs: Math.min(typeof opts.standingWaitMs === 'number' ? opts.standingWaitMs : DEFAULT_STANDING_WAIT_MS, totalBudgetMs)
    });
    const standing = await connectStanding(standingOpts).catch(() => null);
    if (standing) return standing;
    if (!opts.quiet) console.log('[rig] no standing browser after the wait — falling back to a direct launch');
  }
  let lastErr = null;
  for (let attempt = 0; attempt <= DELAYS.length; attempt++) {
    if (attempt > 0 && Date.now() - startedAt >= totalBudgetMs) break;
    attempts = attempt + 1;
    try {
      const browser = await tryLaunch(opts);
      if (attempt > 0 && !opts.quiet) console.log('[rig] launched on attempt ' + (attempt + 1));
      return browser;
    } catch (e) {
      lastErr = e;
      if (attempt < DELAYS.length) {
        const remainingMs = totalBudgetMs - (Date.now() - startedAt);
        if (remainingMs <= 0) break;
        const waitMs = Math.min(DELAYS[attempt], remainingMs);
        if (!opts.quiet) console.log('[rig] launch attempt ' + (attempt + 1) + ' failed (' + String(e.message).split('\n')[0] + ') — retrying in ' + (waitMs / 1000) + 's');
        await sleep(waitMs);
      }
    }
  }
  throw new Error('[rig] browser did not launch after ' + attempts + ' attempts over ~' + Math.round(totalBudgetMs / 60000) + ' minutes — the rig window is closed. Last error: ' + (lastErr && lastErr.message.split('\n')[0]));
}

module.exports = { launchBrowser, connectStanding, ensureServer, CHROME, BASE_ARGS };
