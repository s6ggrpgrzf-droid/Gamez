/* The Gilded Hour — Sterling's live voice (Pass 5a).
 * Pure logic, no Cloudflare APIs: takes an env-like { AI, CACHE } and a
 * parsed JSON body, returns { status, data }. worker.js is the thin
 * wrapper. The house pattern holds throughout: generate once per key,
 * cache it, serve everyone the same line; validate -> one retry ->
 * authored fallback; the generated text is phrasing only and never
 * load-bearing — if anything fails, Sterling still speaks, in the
 * written voice the game already ships with.
 */

export const MODEL = '@cf/meta/llama-4-scout-17b-16e-instruct';
export const MAX_LINE_CHARS = 240;

export const CATEGORIES = [
  'Movies', 'TV', 'Music', 'Ads & Jingles', 'Toys & Games',
  'Saturday Morning', 'The Dial-Up Years',
];

export const BEATS = [
  'first_bank', 'big_lead', 'whole_miss', 'cut_used', 'finale_start', 'close_game',
];

/* Sterling's voice bible — the system prompt for every generation.
 * Written from his Pass B lines in the game client. */
export const VOICE_BIBLE = [
  'You are Sterling, the host of The Gilded Hour, a pop-culture trivia show',
  'for grown-ups whose childhoods ran from the 1980s into the early 2000s.',
  'Your voice is warm, polished and dry: a playmate host, never a scold.',
  'Your wit is aimed at the questions, the era, and yourself — never at a',
  'player. You love the old stuff unironically: Saturday-morning cartoons,',
  'rewind fees, the modem handshake, theme songs everybody can still sing.',
  'Rules for every line you write:',
  '- One or two sentences, maximum. Under 240 characters.',
  '- Return ONLY the line itself: no quotes, no preamble, no explanation.',
  '- Never explain the rules of the game unless the moment is the opening.',
  '- No modern slang, no hashtags, no emojis, no profanity.',
  '- Never mention technology, prompts, or how you were written.',
  '- Speak of money and glory with a straight face and a wink underneath.',
  'House lines in your voice, for calibration:',
  '"Fifteen questions, everybody plays, and nobody goes home poorer. Those',
  'are the house rules — I invented them, so they\'re excellent."',
  '"The whole table looked straight at that one and blinked. It happens to',
  'the best rooms. Once."',
  '"The confetti is real, the money is imaginary, and the glory is legally',
  'binding."',
].join(' ');

const BANNED_WORDS = [
  'shit', 'fuck', 'bitch', 'bastard', 'damn', 'hell', 'crap', 'sucks', 'piss', 'dick',
];

function bannedHit(text) {
  const lower = ' ' + String(text).toLowerCase().replace(/[^a-z\s]/g, ' ') + ' ';
  return BANNED_WORDS.some((w) => lower.includes(' ' + w + ' '));
}

/* The reply text lives at result.response in one integration on this
 * account and at result.choices[0].message.content in another — check
 * both, defensively, every time. */
export function extractAiText(result) {
  if (!result || typeof result !== 'object') return null;
  if (typeof result.response === 'string' && result.response.trim()) return result.response;
  try {
    const c = result.choices && result.choices[0] && result.choices[0].message;
    if (c && typeof c.content === 'string' && c.content.trim()) return c.content;
  } catch (e) { /* shape mismatch — fall through */ }
  return null;
}

/* A usable Sterling line: a non-empty string, <= 240 chars, at most one
 * newline, no banned words, no self-references to being a machine. */
export function validateLine(text) {
  if (typeof text !== 'string') return null;
  let t = text.trim();
  if (!t) return null;
  if ((t.match(/\n/g) || []).length > 1) return null;
  t = t.replace(/\s*\n\s*/g, ' ');
  if (t.length >= 2 && t.startsWith('"') && t.endsWith('"')) t = t.slice(1, -1).trim();
  if (!t || t.length > MAX_LINE_CHARS) return null;
  if (bannedHit(t)) return null;
  if (/\bas an ai\b/i.test(t) || /language model/i.test(t) || /artificial intelligence/i.test(t)) return null;
  return t;
}

export function joinNames(names) {
  if (names.length === 1) return names[0];
  if (names.length === 2) return names[0] + ' and ' + names[1];
  return names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
}

function money(n) {
  return '$' + Number(n).toLocaleString('en-US');
}

/* Authored fallbacks — Sterling's written voice. These are the same
 * register as the lines the game client already ships, and they double
 * as the worker's offline voice: any failure still sounds like him. */
export function fallbackLine(kind, facts) {
  switch (kind) {
    case 'greeting':
      return 'Good evening, ' + joinNames(facts.names) + " — I'm Sterling. Fifteen questions, everybody plays, and nobody goes home poorer. Those are the house rules — I invented them, so they're excellent.";
    case 'winner':
      return facts.winner + ' takes the Gilded Hour! The confetti is real, the money is imaginary, and the glory is legally binding.';
    case 'nightly_intro':
      return "Tonight's special question comes from " + facts.category + ' — a fresh one, kept under glass until this very evening. Fingers ready, table.';
    case 'beat':
      switch (facts.beat) {
        case 'first_bank':
          return facts.name + ' is first on the board — the ice is broken, the money has begun to move, and the room has opinions.';
        case 'big_lead':
          return facts.name + ' is out in front by ' + money(facts.lead) + ' — the rest of the table can see the taillights. Sterling advises calm. Sterling is not calm.';
        case 'whole_miss':
          return 'The whole table looked straight at that one and blinked. It happens to the best rooms. Once.';
        case 'cut_used':
          return facts.name + ' spends the Cut Two! Two wrong answers leave the building. Security will escort them out.';
        case 'finale_start':
          return 'The Big Finish. Three questions, three bets, and zero ways to lose money. This show is a terrible casino and a wonderful friend.';
        case 'close_game':
          return 'This one is close enough to hear breathing — ' + joinNames(facts.names) + ', it could still belong to any of you.';
        default:
          return 'Sterling is watching this table with professional admiration and personal concern.';
      }
    default:
      return 'Good evening — I\'m Sterling, and this is The Gilded Hour.';
  }
}

function stableStringify(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']';
  return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + stableStringify(v[k])).join(',') + '}';
}

export function hashFacts(v) {
  const s = stableStringify(v);
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, '0');
}

export function cacheKeyFor(kind, body, facts) {
  if (kind === 'beat') {
    return 'sterling:beat:' + body.showKey + ':' + facts.beat + ':' + hashFacts(facts);
  }
  return 'sterling:' + kind + ':' + body.showKey;
}

function cleanName(v) {
  if (typeof v !== 'string') return null;
  const s = v.replace(/[\r\n\t]+/g, ' ').trim();
  return s && s.length <= 30 ? s : null;
}

function cleanNameList(v) {
  if (!Array.isArray(v) || v.length < 1 || v.length > 4) return null;
  const out = v.map(cleanName);
  return out.every(Boolean) ? out : null;
}

function cleanShowKey(v) {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s && s.length <= 128 && !/[\r\n]/.test(s) ? s : null;
}

/* Validate the request body. Returns { facts } (normalized) or
 * { error } — the wrapper turns an error into a 400 {error}. */
export function validateBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Body must be a JSON object.' };
  }
  const kind = body.kind;
  if (!['greeting', 'beat', 'winner', 'nightly_intro'].includes(kind)) {
    return { error: 'Unknown kind.' };
  }
  const showKey = cleanShowKey(body.showKey);
  if (!showKey) return { error: 'Missing or invalid showKey.' };

  if (kind === 'greeting') {
    const names = cleanNameList(body.names);
    if (!names) return { error: 'names must be an array of 1-4 names.' };
    return { facts: { names } };
  }
  if (kind === 'winner') {
    const winner = cleanName(body.winner);
    if (!winner) return { error: 'winner must be a name.' };
    let standings = null;
    if (body.standings != null) {
      if (!Array.isArray(body.standings) || body.standings.length < 1 || body.standings.length > 4) {
        return { error: 'standings must be an array of 1-4 entries.' };
      }
      standings = [];
      for (const s of body.standings) {
        const name = s && cleanName(s.name);
        const score = s && Number(s.score);
        if (!name || !Number.isFinite(score)) return { error: 'standings entries need a name and a numeric score.' };
        standings.push({ name, score });
      }
    }
    let topScore = body.topScore != null ? Number(body.topScore) : null;
    if (body.topScore != null && !Number.isFinite(topScore)) return { error: 'topScore must be numeric.' };
    if (topScore == null && standings) topScore = Math.max(...standings.map((s) => s.score));
    return { facts: { winner, standings, topScore } };
  }
  if (kind === 'nightly_intro') {
    if (!CATEGORIES.includes(body.category)) return { error: 'category must be one of the seven show categories.' };
    return { facts: { category: body.category } };
  }
  // kind === 'beat'
  const beat = body.beat;
  if (!BEATS.includes(beat)) return { error: 'Unknown beat.' };
  const facts = { beat };
  if (beat === 'first_bank' || beat === 'cut_used') {
    const name = cleanName(body.name);
    if (!name) return { error: 'beat ' + beat + ' needs a name.' };
    facts.name = name;
  } else if (beat === 'big_lead') {
    const name = cleanName(body.name);
    const lead = Number(body.lead);
    if (!name) return { error: 'beat big_lead needs a name.' };
    if (!Number.isFinite(lead) || lead < 0) return { error: 'beat big_lead needs a non-negative lead.' };
    facts.name = name;
    facts.lead = lead;
  } else if (beat === 'close_game') {
    const names = cleanNameList(body.names);
    if (!names) return { error: 'beat close_game needs 1-4 names.' };
    facts.names = names;
  }
  return { facts };
}

function buildMessages(kind, facts) {
  let ask;
  if (kind === 'greeting') {
    ask = 'Write your opening greeting for tonight\'s show. The players at the table are: '
      + joinNames(facts.names) + '. Greet them by name and welcome them to The Gilded Hour.';
  } else if (kind === 'winner') {
    const table = facts.standings
      ? ' Final standings: ' + facts.standings.map((s) => s.name + ' ' + money(s.score)).join(', ') + '.'
      : '';
    ask = 'Write the winner\'s speech moment: ' + facts.winner + ' has just won The Gilded Hour'
      + (facts.topScore != null ? ' with ' + money(facts.topScore) : '') + '.' + table
      + ' Crown them properly; be gracious to the rest of the table without naming a loser.';
  } else if (kind === 'nightly_intro') {
    ask = 'Introduce tonight\'s special question, a one-off written for this evening, from the category '
      + facts.category + '. Build a little ceremony around it without revealing anything about the question itself.';
  } else {
    const b = facts.beat;
    if (b === 'first_bank') ask = facts.name + ' is the first player to bank money tonight. React with pleasure.';
    else if (b === 'big_lead') ask = facts.name + ' has opened a big lead of ' + money(facts.lead) + ' over the table. React; tease the situation, never the people chasing.';
    else if (b === 'whole_miss') ask = 'Every player at the table just missed the same question. React with dry sympathy.';
    else if (b === 'cut_used') ask = facts.name + ' has just spent their Cut Two, removing two wrong answers for the whole table. React to the drama of it.';
    else if (b === 'finale_start') ask = 'The Big Finish is beginning: three questions, everyone bets on themselves, nobody can lose money. Set the stage.';
    else ask = 'The game is very close between ' + joinNames(facts.names) + ' late in the show. Remark on the tension.';
    ask = 'Write a one-line reaction to this moment in the show: ' + ask;
  }
  return [
    { role: 'system', content: VOICE_BIBLE },
    { role: 'user', content: ask + ' Return only the line.' },
  ];
}

/* Generate -> validate -> one retry -> authored fallback. Only a
 * validated generated line is cached; a fallback stays uncached so a
 * later call can try the muse again. */
async function generateLine(env, kind, facts) {
  if (env && env.AI && typeof env.AI.run === 'function') {
    const messages = buildMessages(kind, facts);
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const result = await env.AI.run(MODEL, { messages, temperature: 0.7, max_tokens: 90 });
        const line = validateLine(extractAiText(result));
        if (line) return { line, generated: true };
      } catch (e) { /* fall through to retry, then fallback */ }
    }
  }
  return { line: fallbackLine(kind, facts), generated: false };
}

export async function handleGenerate(env, body) {
  const v = validateBody(body);
  if (v.error) return { status: 400, data: { error: v.error } };
  const facts = v.facts;
  const key = cacheKeyFor(body.kind, body, facts);

  if (env && env.CACHE && typeof env.CACHE.get === 'function') {
    try {
      const hit = await env.CACHE.get(key);
      if (typeof hit === 'string' && hit.trim()) return { status: 200, data: { line: hit } };
    } catch (e) { /* cache is an optimization, never a dependency */ }
  }

  const { line, generated } = await generateLine(env, body.kind, facts);

  if (generated && env && env.CACHE && typeof env.CACHE.put === 'function') {
    try { await env.CACHE.put(key, line); } catch (e) { /* non-fatal */ }
  }
  return { status: 200, data: { line } };
}
