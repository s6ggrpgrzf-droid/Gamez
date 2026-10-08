# Word Well — Build Spec (2026-10-08 rebuild)

2026-10-08: Jimmy asked for Words With Friends instead of the word ladder.
Rebuilt as a WWF-style crossword tile game. Same name, same ink-and-parchment
well identity. Old ladder files (ladder.js, words.js, tests/test-ladder.js)
were deleted.

## Rules (WWF ruleset)
- 15x15 board, WWF premium layout: TW 8, DW 17 (incl. center star), TL 12, DL 24.
- 104-tile bag (A9 B2 C2 D5 E13 F2 G3 H4 I8 J1 K1 L4 M2 N5 O8 P2 Q1 R6 S5 T7 U4 V2 W2 X1 Y2 Z1, 2 blanks).
- Values: 1:AEIORST 2:DLNU 3:GHY 4:BCFMPW 5:KV 8:X 10:JQZ, blank 0.
- 7-tile rack; first word must cover the center star; premiums apply to newly
  placed tiles only; +35 bingo for all 7 tiles in one turn.
- Turn options: play, swap (needs 7+ tiles in bag, loses turn), pass.
- Game ends on empty rack + empty bag (leftover values subtracted from the
  holder, added to the finisher) or 6 consecutive scoreless turns.

## Dictionary
- ENABLE2K (public domain), 172,705 words of length 2-15, uppercase.
- Shipped as dict-1.js..dict-6.js: gzip+base64 chunks (~100KB each, pushed solo).
- At load: concat, atob, DecompressionStream('gzip'), build a flattened trie
  (~6.6MB, ~376k nodes). Graceful message if DecompressionStream is missing.

## Modes
- Solo vs the Well Warden: easy / medium / hard bot (Solo-Challenge style).
- Pass & Play: 2 humans, one phone.
- Daily Well: date-seeded bag, human vs medium bot, score posts to the
  gamez-arcade "word-well" daily board (cap 100) + localStorage streak.

## Boosts (earned by playing, localStorage)
- Radar: highlights the best legal placement. Hindsight: after your move,
  shows the best move you missed. Swap+: swap without losing your turn.
  Tile pile: remaining tile counts.

## Files
- wwf.js — pure engine (seeded mulberry32, no DOM). node-testable.
- game.js — UI/controller. audio.js — WebAudio sfx (tile clacks).
- dict-*.js — dictionary chunks. index.html / style.css / sw.js (word-well-v2).
- tests/test-wwf.js — 78 headless assertions.

## Workflow notes
- Push via github push_files; ?v= cache-bust on every JS/CSS push.
- Hub card lives in ~/workspace/gamez/index.html + hub.js ("word-well").
