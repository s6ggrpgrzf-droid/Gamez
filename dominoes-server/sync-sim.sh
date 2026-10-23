#!/bin/bash
# Extract the sim block from the game and convert its footer to ESM.
set -e
cd "$(dirname "$0")"
python3 - <<'PYEOF'
import re
html = open('/home/hatch/workspace/gamez/dominoes/index.html').read()
m = re.search(r'<script id="sim">(.*?)</script>', html, re.S)
sim = m.group(1)
old_footer = """const api = {
  mulberry32, rngNext, newSet, newGame, dealRound, playTile, drawTile, knock,
  nextRound, legalMoves, canPlay, exposed, aiChoose, pips, handPips, tileKey,
  snapshot, restore, scoreMove,
};
if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof window !== 'undefined') window.DomSim = api;"""
assert old_footer in sim, "sim footer changed - update sync-sim.sh"
sim = sim.replace(old_footer, "const api = {\n  mulberry32, rngNext, newSet, newGame, dealRound, playTile, drawTile, knock,\n  nextRound, legalMoves, canPlay, exposed, aiChoose, pips, handPips, tileKey,\n  snapshot, restore, scoreMove,\n};\nexport default api;")
open('sim.js', 'w').write(sim)
print('sim.js synced:', len(sim), 'bytes')
PYEOF
