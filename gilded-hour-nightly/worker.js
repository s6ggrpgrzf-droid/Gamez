/* The Gilded Hour — tonight's special question (Pass 5a).
 * Thin Worker wrapper around logic.js: routing, CORS, the date
 * default (today in America/Chicago), JSON out. All behaviour lives
 * in logic.js and is covered by test/test-nightly.js. Deploy:
 * `dist/worker.js` is the single-file build (dashboard paste), or
 * point wrangler / Workers Builds here.
 */
import { handleTonight, todayInChicago, isValidDateStr } from './logic.js';

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { ...cors(), 'Content-Type': 'application/json' },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors() });
    }
    if (url.pathname === '/health' || url.pathname === '/') {
      if (request.method !== 'GET') return json({ error: 'Method not allowed.' }, 405);
      return new Response('gilded-hour-nightly ok', {
        status: 200,
        headers: { ...cors(), 'Content-Type': 'text/plain' },
      });
    }
    if (url.pathname === '/tonight') {
      if (request.method !== 'GET') return json({ error: 'Method not allowed.' }, 405);
      const date = url.searchParams.get('date') || todayInChicago();
      if (!isValidDateStr(date)) return json({ error: 'date must be YYYY-MM-DD.' }, 400);
      const { status, data } = await handleTonight(env, date);
      return json(data, status);
    }
    return json({ error: 'Not found.' }, 404);
  },
};
