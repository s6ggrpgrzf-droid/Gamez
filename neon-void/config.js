/* Neon Void — tuning config.
 * IDENTITY: electric, sharp, relentless. Every number here serves it.
 * Change feel here, not in gameplay code. */
'use strict';
window.NV_CONFIG = {
  identity: 'electric, sharp, relentless',

  player: {
    speed: 340, accel: 10, radius: 10,
    fireInterval: 0.09, bulletSpeed: 700, fireKick: 1
  },
  dash: {
    enabled: true, speed: 950, time: 0.22, iframes: 0.35,
    cooldown: 2.2, bufferMs: 150, doubleTapMs: 280
  },
  spawn: {
    baseInterval: 1.4, intervalPerDiff: 0.09, minInterval: 0.25,
    batchPerDiff: 4, maxEnemies: 60, edgeMargin: 20, safeDist: 180,
    riftTelegraph: 0.8
  },
  surge: {
    every: 80, warn: 4, duration: 10, spawnMul: 2, speedMul: 1.25, firstAt: 50
  },
  elite: {
    every: 50, firstAt: 40, hp: 4, radius: 26, score: 500, geoms: 5
  },
  well: {
    firstAt: 8, intervalMin: 14, intervalMax: 24, max: 2,
    pullRadius: 300, pullForce: 260, collapseAt: 25
  },
  geoms: {
    perMult: 25, maxMult: 150, magnetRadius: 110, magnetForce: 420,
    collectRadius: 20, pickupScore: 10, life: 6, salvageScore: 25
  },
  combat: {
    killChainWindow: 0.7, chainMarks: [3, 5, 8],
    chainLabels: { 3: 'TRIPLE KILL', 5: 'RAMPAGE', 8: 'VOID FRENZY' }
  },
  lives: { start: 3, bombs: 3, invuln: 2, respawnInvuln: 3 },

  fx: {
    shakeCap: 26, shakeDecay: 110,
    hitStopKill: 60, hitStopDeath: 70, hitStopBomb: 80,
    slowmoKill: 0.3, slowmoDeath: 0.6, slowmoLastLife: 0.9, slowmoBomb: 0.4,
    flashTime: 0.15, poolN: 420,
    particleScaleLow: 0.5
  },
  haptics: {
    select: [10], light: [20], medium: [30],
    success: [10, 40, 10], warning: [20, 60, 20],
    error: [40, 80, 40, 40, 80, 40]
  },
  audio: {
    bpm: 140, masterGain: 0.5, maxVoices: 16,
    killBase: 240, killChainStep: 45, killChainCap: 900,
    arpMult: 8
  },
  perf: {
    frameBudgetMs: 26, sampleFrames: 90, dprCap: 2
  },
  difficulty: {
    window: 30, kpmHigh: 25, kpmLow: 8,
    minMul: 0.75, maxMul: 1.5, deathCooldown: 12
  },
  remembers: { max: 40, salvageRadius: 30, minRunSecs: 15, salvageScore: 25 },

  enemies: {
    wanderer: { color: '#c060ff', score: 25, r: 12 },
    seeker:   { color: '#40e0ff', score: 50, r: 10 },
    weaver:   { color: '#ff60c0', score: 100, r: 11 },
    spinner:  { color: '#ffb040', score: 100, r: 13 }
  }
};
