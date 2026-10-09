/* Pdawg Puzzles — AI Studio client (talks to the jigsaw-ai Cloudflare worker). */
(function () {
'use strict';

var AI_BASE = 'https://jigsaw-ai.chaoticutopia84.workers.dev';

var THEMES = [
  'Dragon\'s hoard', 'Owl & aurora', 'Coral reef',
  'Balloon fields', 'Castle', 'Arctic fox',
  'Candy village', 'Mountain train', 'Safari sunset',
  'Dane meadow', 'Pumpkin patch', 'Space station'
];
var THEME_PROMPTS = [
  'dragon curled around a treasure hoard in a crystal cavern',
  'snowy owl perched on a pine branch under northern lights',
  'vibrant coral reef with sea turtles, clownfish and sun rays through water',
  'hot air balloons drifting over patchwork countryside fields',
  'medieval castle tournament with knights, banners and horses',
  'arctic fox family in falling snow among icebergs',
  'whimsical candy village with lollipop trees and gumdrop houses',
  'vintage train crossing a mountain viaduct with eagles soaring',
  'safari sunset with elephants, giraffes and acacia trees',
  'great dane dogs playing in a wildflower meadow',
  'halloween pumpkin patch with friendly ghosts and a full moon',
  'space station orbiting a ringed planet with astronaut spacewalk'
];

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

/* fetch with a hard timeout: a stalled connection must fail visibly instead
 * of hanging the UI's spinner forever (seen on a real phone: "Painting your
 * puzzle…" stuck for 30+ minutes). Aborted/timed-out fetches throw. */
function fetchTimeout(url, opts, ms) {
  var ctrl;
  try { ctrl = new AbortController(); } catch (e) { return fetch(url, opts); }
  var t = setTimeout(function () { try { ctrl.abort(); } catch (e) {} }, ms);
  var o = {};
  for (var k in (opts || {})) o[k] = opts[k];
  o.signal = ctrl.signal;
  return fetch(url, o).then(function (r) { clearTimeout(t); return r; },
    function (e) { clearTimeout(t); throw e; });
}

async function pollReady(key, onTick) {
  for (var i = 0; i < 40; i++) {           // ~2 min max
    await sleep(3000);
    try {
      var r = await fetchTimeout(AI_BASE + '/status?key=' + encodeURIComponent(key), null, 12000);
      var d = await r.json();
      if (d && d.status === 'ready' && d.url) return d.url;
      if (onTick) onTick(i);
    } catch (e) { /* keep polling */ if (onTick) onTick(i); }
  }
  return null;
}

async function fetchImage(url) {
  var r = await fetchTimeout(AI_BASE + url, null, 30000);
  if (!r.ok) return null;
  return await r.blob();
}

var AI = {
  THEMES: THEMES,
  base: AI_BASE,

  /* Generate from a prompt. Resolves to an image Blob, or null on failure. */
  generate: async function (prompt, onTick) {
    try {
      var r = await fetchTimeout(AI_BASE + '/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt })
      }, 30000);
      if (r.status === 429) return { error: 'hourly' };
      var d = await r.json();
      if (!d || !d.key) return null;
      var url = d.url;
      if (!url) {
        url = await pollReady(d.key, onTick);
        if (!url) return null;
      }
      var blob = await fetchImage(url);
      return blob || null;
    } catch (e) { return null; }
  },

  themePrompt: function (i) { return THEME_PROMPTS[i] || THEME_PROMPTS[0]; },

  /* Today's (or a given date's) global daily image. Null if unavailable. */
  daily: async function (dateStr) {
    try {
      var r = await fetchTimeout(AI_BASE + '/daily?date=' + encodeURIComponent(dateStr || ''), null, 20000);
      var d = await r.json();
      if (!d || !d.key) return null;
      var url = d.url;
      if (!url) { url = await pollReady(d.key); if (!url) return null; }
      var blob = await fetchImage(url);
      return blob ? { blob: blob, theme: d.theme } : null;
    } catch (e) { return null; }
  }
};

window.PDAWG_AI = AI;
})();
