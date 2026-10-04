# Neon Void — DEEP PASS (2026-10-04)

Identity: **electric, sharp, relentless**. Every choice below serves it.
Jimmy's bar: "looks like someone paid good money to make it."

## 1. Audit findings (full code read + baseline smoke CLEAN + screenshot)

**What's good:** twin-stick works, warped spring grid with ambient churn is a real
signature, additive neon shards, hit-stop, shake, kill chains, bombs, gravity wells,
geom/multiplier loop, leaderboard + silent AI briefing, haptics toggle,
reduce-motion honor, DPR cap, pooled particles. Jimmy's "pretty awesome" is earned.

**Bugs / rough edges found:**
1. No pause on `visibilitychange`/blur — sticks keep state, ship drifts on return.
2. No real keyboard control — desktop players get a crippled mouse fallback.
3. `banner()` hijacks the score HUD element for 1.6s (score display lies briefly).
4. `shadowBlur` stroked per-entity per-frame — the #1 perf risk on older iPhones.
5. `Math.random()` everywhere in sim — no determinism, no daily-seed mode possible.
6. Enemies pop in at edges with zero telegraph — deaths feel unfair at chaos levels.
7. No adaptation — gods and first-timers get identical pressure.
8. Audio is 8 thin beeps. No music, no intensity curve, no mute.
9. No dash/mobility expression — movement is just drift.
10. Bomb button sits under the aiming thumb's territory; no gesture alternative.
11. First-run onboarding is a text paragraph; the critical first 60 seconds is unguided.
12. Multiplier rises on KILL but help text says "grab geoms to raise multiplier" — the
    text lies, and the risk/reward of flying into danger to collect is missing.
13. No multiplier progress — players can't see the next × level approaching.
14. No safe-area insets — HUD can clash with the Dynamic Island/notch.
15. Deaths leave nothing — runs feel disposable.
16. Worker supports daily boards (`/daily`, `board` param) but the game never uses them.

## 2. WebGL / PixiJS evaluation — DECISION: NO (this pass)

Considered a contained PixiJS layer for real bloom + GPU particles. Rejected:
- The game's look is *dynamic vector line-art + additive glow* redrawn every frame —
  exactly what canvas 2D does well at this entity count (≤60 enemies, ≤~20 bullets).
- A WebGL migration means rewriting the entire render path plus texture management
  for art that is regenerated every frame — high risk, destabilizing, and the visible
  gain over baked-glow 2D at 390×844 is marginal.
- The actual perf cost (`shadowBlur` per entity) is eliminated by **baking glow into
  prerendered sprite atlases** — same look, ~10x cheaper, zero new dependencies.
- Revisit WebGL only if a future pass demands shader-grade effects (true bloom,
  distortion fields). Canvas 2D gets pushed hard instead: baked-glow atlas, additive
  layer, shockwave rings, nebula parallax, chromatic ship edge.

## 3. Enhancement plan

**Feel (electric/sharp/relentless):**
- Baked-glow sprite atlas: ship, 4 enemy types, dreadnought, bullet, geom prerendered
  once with glow baked in; per-frame = `drawImage` with rotation + additive blend.
  Kills per-frame `shadowBlur` entirely.
- Shockwave rings (pooled) on kills, bigger on elites/surges.
- Kill beep pitch rises with chain (240 + chain×45, capped); hit-stop + slow-dip kept.
- Engine trail particles while moving; dash trail burst.
- Screen flash: white on surge start, violet on elite spawn, red on damage (existing).
- Floaters: quantized font sizes (no per-frame font-string rebuild), capped count.
- Squash & stretch kept; spawn-pop kept; eased motion throughout.

**New systems:**
- **Void Dash** — double-tap left half (or Shift): 0.22s burst at 950px/s in move/aim
  direction, 0.35s i-frames, 2.2s cooldown with ring UI, 150ms input buffer, trail +
  sweep sound + haptic. The mobility expression the game was missing.
- **Double-tap right half = bomb** (button stays too).
- **Spawn rifts** — every enemy emerges from a pulsing rift 0.8s after it appears.
  Telegraphs = fair deaths at high chaos.
- **DREADNOUGHT elite** — every ~50s: hp 4, slow, banner + violet flash, drops
  5 geoms, 500×mult. Mid-run event.
- **VOID SURGE** — every ~80s: 4s warning (banner, riser, grid pulses red), then 10s
  of 2× spawn + 1.25× enemy speed, red vignette pulse, hat layer in music.
- **THE VOID REMEMBERS** *(unrequested original touch)* — every death leaves a wreck
  marker (glowing cracked-ship glyph) persisted in localStorage (max 40). Next runs
  fly through your graveyard; flying within 30px salvages it (+25×mult, "SALVAGED").
  Deaths become treasure. Menu shows "the void remembers N of your ships."
- **Daily Void mode** — seeded RNG (mulberry32) for all sim randomness; daily seed
  from worker `/daily` (fallback: local date hash); submits to `daily-YYYY-MM-DD`
  board; menu gets QUICK RUN + DAILY VOID buttons. Same void worldwide, once a day.
- **Adaptive difficulty** — rolling kills/min + recent deaths nudge spawn intensity
  ×0.75–×1.5 to keep pressure in the band. Gentle, honest, documented.
- **Multiplier on COLLECTION** — geoms raise × when collected (25 per level), matching
  the help text; forces the relentless fly-into-danger loop. HUD shows progress bar.

**Input:**
- Input buffer for dash (150ms); generous double-tap windows (280ms).
- Optimistic: dash starts on the input frame.
- Keyboard: WASD move, arrows aim+fire, Space bomb, Shift dash, P pause, M mute.
- **Tilt-to-steer option** (default off): replaces left stick, right thumb still aims;
  iOS permission requested from the menu toggle; deadzone + smoothing.
- First-run hint overlay (animated thumbs) until first move+fire or 8s, first 2 runs.

**Audio:**
- Rewrite audio.js: master/music/sfx buses, voice cap 16, mute persisted.
- Procedural step-sequencer: 140 BPM A-minor bass; arp layer at mult≥8; noise hats
  during surge; intensity follows mult + enemy count. Beat pops the × readout.
- Game reads fully silent: every cue has a visual twin; mute toggle in menu + M.

**Mobile UI:**
- 44px targets everywhere (menu buttons, bomb, pause, toggles).
- Safe-area insets via `env()`; `visualViewport` resize handling.
- ≤2 taps to gameplay preserved (menu → mode button).
- Dedicated #banner element (score HUD never lies again).
- Pause button (⏸, top-right, 44px) + `visibilitychange` auto-pause + stick reset.
- Colorblind-safe: danger = red flash + shape (✖ iconography on rifts) + text,
  never color alone.

**Haptics:** named vocabulary — select[10], light[20], medium[30],
success[10,40,10], warning[20,60,20], error[40,80,40,40,80,40]; toggle persists;
iOS-safe (no-op where unsupported).

**AI:** briefing ctx gains {mode, run#, best} for variety; new silent 'debrief'
on game over ({score, time, kills, mode}) with local fallbacks. Leaderboard wiring
kept, extended with board param.

**Tuning:** all numbers → `config.js` (`window.NV_CONFIG`), identity comment on top.

**Perf:** adaptive tier — rolling frame avg >26ms over 90 frames → PERF_LOW (halve
particles, kill churn micro-impacts + nebula drift); auto-restore. Zero per-frame
allocation in hot loops; spatial reasoning unnecessary at this entity count
(bullet×enemy ≤ ~1200 squared-distance checks/frame worst case — fine).

## 4. Test plan
`node --check` on all files → headless determinism test (mulberry32 + seeded spawn
sanity) → smoke.js CLEAN on exact push files → push via github push_files (diff
remote first) → curl live files, diff byte-identical → note for parent: live-browser
play-through (subagent cannot drive a live browser).
