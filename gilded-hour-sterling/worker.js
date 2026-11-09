/* The Gilded Hour — Sterling's live voice (Pass 5a).
 * Thin Worker wrapper around logic.js: routing, CORS, body-size cap,
 * JSON in/out. All behaviour lives in logic.js and is covered by
 * test/test-sterling.js. Deploy: `dist/worker.js` is the single-file
 * build (dashboard paste), or point wrangler / Workers Builds here.
 */
import { handleGenerate } from './logic.js';

const MAX_BODY_CHARS = 8192;

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
      return new Response('gilded-hour-sterling ok', {
        status: 200,
        headers: { ...cors(), 'Content-Type': 'text/plain' },
      });
    }
    if (url.pathname === '/g') {
      if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
      const text = await request.text();
      if (text.length > MAX_BODY_CHARS) return json({ error: 'Request too large.' }, 400);
      let body;
      try { body = JSON.parse(text); } catch (e) { return json({ error: 'Body must be valid JSON.' }, 400); }
      const { status, data } = await handleGenerate(env, body);
      return json(data, status);
    }
    return json({ error: 'Not found.' }, 404);
  },
};
