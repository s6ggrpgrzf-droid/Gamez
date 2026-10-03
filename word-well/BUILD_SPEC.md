# Word Well — Build Spec (2026-10-03)

Jimmy picked option 3: a daily word puzzle for the Gamez arcade. Ninth game.

## The game

**Word Well**: a daily word ladder (Lewis Carroll's "Doublets", 1877). Each day the whole
world gets the same puzzle: climb from START to END, changing exactly one letter per rung,
every rung a real word. You have a limited length of **rope** — run out before reaching
the bottom and you fall.

### Ingredients (Jimmy's synthesis method)
- **Word ladder** (Carroll 1877, "word golf" per Nabokov): the core mechanic.
- **Wordle**: one puzzle per day worldwide, streaks, shareable results.
- **Waffle**: efficiency star ratings — the perfect-score chase.
- **Golf**: par scoring. Par = shortest ladder; beat it for 3 stars.

### Rules
- 4-letter words only. Daily puzzle: START → END with par 4–7 (seeded by date, same worldwide).
- **Rope** = par + 3. Each new rung costs 1 rope.
- A guess must: be in the word list, differ by exactly ONE letter from the previous rung,
  not be a repeat of an earlier rung.
- Changed letter is highlighted gold on the new rung.
- **Win**: reach END. Stars: steps == par → ★★★, par+1 → ★★☆, else ★☆☆.
- **Lose**: rope hits 0 before reaching END ("The rope ran out").
- **Hint** ("Drop a pebble"): reveals a correct next rung (one step on a shortest path from
  the current word), costs 1 rope.
- Practice mode: random ladder, same rules, no streak, unlimited.
- Streaks: consecutive daily solves, localStorage. Daily state persists per date.

### Daily generation (deterministic, worldwide)
- Seed = YYYY-MM-DD → mulberry32.
- Pick START from WW_GIANT (seeded), BFS, collect words at distance 4–7, seeded pick END.
- Par = BFS distance. Guaranteed solvable. Verify: same date → same puzzle across runs.

### Meta / retention
- Streak counter + longest streak.
- Share text: `🪢 Word Well 2026-10-04 — COLD → WARM · 5 rungs (par 4) ★★☆ · 🔥 streak 3`
  (clipboard copy, no emoji-grid needed).
- Arcade backend: post `100 - steps` to the daily board `daily-YYYY-MM-DD` (higher = better,
  mirrors maze-trace's inverted-time trick). Game id: `word-well`.
- AI (invisible, via gamez-ai worker): new kind `well` — "Write a playful one-line theme
  for a word ladder from {start} to {end} (max 12 words)". Shown on the daily intro card.
  Silent local fallback ("Today's descent: {start} → {end}"). **No AI branding anywhere.**
  (Worker update needed: add `well` kind to gamez-ai prompts.)

### Look & feel — "ink & parchment"
- Warm parchment background, ink-brown serif type (Carroll 1877, not neon).
- The well: rungs are stone ledges descending down a well shaft; new rungs drop in with
  animation. Rope meter hangs at the side, visibly shortening.
- On-screen QWERTY keyboard (Wordle-style, big touch targets) + physical keyboard support.
- WebAudio: soft thunk per rung, splash on fail, chime on win. AudioContext on gesture.
- Unrequested creative touch (required): the well has **water at the bottom** — winning
  drops your final word in with a ripple and a random "deep thought" fortune
  (e.g. "The well says: …"). Fortunes are hand-written, wry, Pip-flavored.

### Architecture
- `ladder.js` — PURE logic, no DOM: graph build, BFS, `dailyPuzzle(dateStr)`,
  `validateGuess(word, prevRung, usedSet)`, `hintPath(from, to)`, scoring. Testable in node.
- `words.js` — already written (WW_ANSWERS 1100, WW_GUESSES 7254, WW_GIANT 874).
- `game.js` — UI/controller. `index.html`, `style.css`.
- Seeded PRNG mulberry32 (copy the pattern from other games). No Math.random in logic.
- Mobile-first; keyboard must not break on iPhone (use input-less custom keyboard,
  no focus stealing).

### Tests (headless, must pass before push)
- BFS: known pairs (CAT→DOG = 3: CAT COT DOT DOG) correct distance.
- Daily determinism: same date → identical puzzle, 20 sampled dates all solvable, par in 4–7.
- Validation: rejects non-words, 2-letter changes, repeats; accepts valid 1-letter changes.
- Rope/scoring: stars correct at par/par+1/par+2; loss at rope 0.
- Hint: returns a word 1 step closer to END along a shortest path.

### Verification
- Real-Chromium play: menu → daily card → type a full ladder → win screen with stars →
  share copies text → streak increments → practice mode → hint → lose path (spend rope).
- No console errors. Push to s6ggrpgrzf-droid/Gamez `word-well/`, verify live on Pages.
- Add `word-well` to the hub index (check how other games are listed).
- Bump gamez-ai worker with the `well` kind (dashboard), verify endpoint live.
