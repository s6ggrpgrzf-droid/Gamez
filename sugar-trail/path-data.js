/* Sugar Trail — painted-stone board data.
 * The boards are paintings whose trails ARE the spaces: a winding chain
 * of colored candy stones painted in gouache. These samples were traced
 * stone-by-stone off each painting: [y, cx, stoneWidth] in image
 * fractions, start -> castle. buildSpaces() lays the 134 game spaces
 * along the chain by arc length; each space inherits the painted stone
 * size where it sits, and pawns are sized from that (PAWN_FRACTION of
 * the stone) so a traveler always stands ON its stone, never over it.
 * Pure math, node-testable. */
'use strict';

const PAWN_FRACTION = 0.48;

const BOARDS = {
  portrait: {
    imgW: 1120, imgH: 2240, file: 'board-portrait.jpg?v=20261101c', parts: 7, prefix: 'p', startXY: [0.978, 0.048],
    samples: [
      [0.969, 0.115, 0.210], [0.946, 0.315, 0.185], [0.930, 0.485, 0.165],
      [0.909, 0.635, 0.150], [0.885, 0.735, 0.135], [0.859, 0.795, 0.120],
      [0.811, 0.755, 0.155], [0.784, 0.635, 0.135], [0.759, 0.545, 0.115],
      [0.735, 0.475, 0.105], [0.716, 0.440, 0.095], [0.697, 0.435, 0.090],
      [0.678, 0.445, 0.085], [0.662, 0.475, 0.080], [0.647, 0.515, 0.075],
      [0.635, 0.560, 0.070], [0.624, 0.605, 0.065], [0.615, 0.645, 0.060],
      [0.605, 0.680, 0.058], [0.597, 0.715, 0.055], [0.589, 0.750, 0.050],
      [0.578, 0.745, 0.095], [0.560, 0.685, 0.055], [0.550, 0.640, 0.050],
      [0.538, 0.605, 0.048], [0.526, 0.575, 0.045], [0.516, 0.550, 0.042],
      [0.503, 0.565, 0.040], [0.493, 0.600, 0.038], [0.482, 0.625, 0.036],
      [0.472, 0.655, 0.034], [0.460, 0.675, 0.032], [0.448, 0.665, 0.030],
      [0.438, 0.630, 0.028], [0.428, 0.585, 0.027], [0.417, 0.560, 0.026],
      [0.407, 0.575, 0.024], [0.396, 0.555, 0.023], [0.389, 0.515, 0.022],
      [0.378, 0.525, 0.030], [0.369, 0.475, 0.020], [0.360, 0.440, 0.019],
      [0.350, 0.375, 0.018], [0.349, 0.345, 0.022], [0.339, 0.360, 0.020],
      [0.331, 0.395, 0.019], [0.324, 0.430, 0.018], [0.316, 0.465, 0.017],
      [0.308, 0.490, 0.016], [0.299, 0.505, 0.016], [0.290, 0.525, 0.015],
      [0.281, 0.550, 0.015], [0.273, 0.565, 0.014], [0.264, 0.575, 0.014],
      [0.255, 0.585, 0.013], [0.246, 0.590, 0.013], [0.238, 0.595, 0.012],
      [0.229, 0.600, 0.012], [0.220, 0.605, 0.012], [0.211, 0.615, 0.011],
      [0.204, 0.625, 0.011], [0.195, 0.630, 0.011], [0.188, 0.625, 0.010],
      [0.179, 0.615, 0.010], [0.170, 0.605, 0.010], [0.161, 0.600, 0.010],
      [0.153, 0.595, 0.010], [0.143, 0.585, 0.010], [0.135, 0.565, 0.012],
      [0.118, 0.546, 0.016],
    ],
  },
  wide: {
    imgW: 2240, imgH: 1120, file: 'board-wide.jpg?v=20261101c', parts: 7, prefix: 'w', startXY: [0.962, 0.150],
    samples: [
      [0.945, 0.245, 0.150], [0.885, 0.375, 0.125], [0.855, 0.460, 0.105],
      [0.835, 0.555, 0.095], [0.815, 0.635, 0.085], [0.775, 0.700, 0.075],
      [0.725, 0.725, 0.065], [0.685, 0.705, 0.058], [0.655, 0.665, 0.052],
      [0.635, 0.615, 0.048], [0.615, 0.575, 0.044], [0.590, 0.545, 0.040],
      [0.565, 0.520, 0.037], [0.545, 0.485, 0.034], [0.530, 0.455, 0.031],
      [0.505, 0.435, 0.028], [0.475, 0.455, 0.026], [0.455, 0.510, 0.023],
      [0.430, 0.520, 0.021], [0.400, 0.500, 0.019], [0.370, 0.580, 0.017],
      [0.355, 0.660, 0.016], [0.345, 0.745, 0.015], [0.315, 0.800, 0.013],
      [0.285, 0.845, 0.012], [0.250, 0.865, 0.011], [0.205, 0.867, 0.010],
    ],
  },
};

function catmull(pts, per) {
  const out = [], P = [pts[0], ...pts, pts[pts.length - 1]];
  for (let s = 0; s < P.length - 3; s++) for (let k = 0; k < per; k++) {
    const t = k / per, t2 = t * t, t3 = t2 * t;
    const f = i => 0.5 * ((2 * P[s + 1][i]) + (-P[s][i] + P[s + 2][i]) * t + (2 * P[s][i] - 5 * P[s + 1][i] + 4 * P[s + 2][i] - P[s + 3][i]) * t2 + (-P[s][i] + 3 * P[s + 1][i] - 3 * P[s + 2][i] + P[s + 3][i]) * t3);
    out.push([f(0), f(1), f(2)]);
  }
  out.push(pts[pts.length - 1].slice());
  return out;
}

function buildStones(board) {
  const raw = board.samples.map(([y, cx, w]) => [cx * board.imgW, y * board.imgH, w * board.imgW]);
  const dense = catmull(raw, 40);
  const cum = [0];
  for (let i = 1; i < dense.length; i++) cum.push(cum[i - 1] + Math.hypot(dense[i][0] - dense[i - 1][0], dense[i][1] - dense[i - 1][1]));
  const total = cum[cum.length - 1], spacing = total / 133;
  const stones = [];
  for (let k = 0; k < 134; k++) {
    const target = k * spacing;
    let j = 0; while (j < cum.length - 2 && cum[j + 1] < target) j++;
    const f = (target - cum[j]) / Math.max(cum[j + 1] - cum[j], 0.001);
    const x = dense[j][0] + (dense[j + 1][0] - dense[j][0]) * f;
    const y = dense[j][1] + (dense[j + 1][1] - dense[j][1]) * f;
    const w = dense[j][2] + (dense[j + 1][2] - dense[j][2]) * f;
    stones.push({ i: k, x, y, widthPx: w, dia: w, ratio: PAWN_FRACTION });
  }
  // the party gathers at the trail mouth, just before the first stone —
  // so the opening hop always travels, even onto a same-colour first stone
  const start = board.startXY
    ? { x: board.startXY[1] * board.imgW, y: board.startXY[0] * board.imgH, widthPx: stones[0].widthPx, dia: stones[0].dia }
    : { x: stones[0].x, y: stones[0].y, widthPx: stones[0].widthPx, dia: stones[0].dia };
  return { stones, spacing, total, start };
}

const PD = { BOARDS, buildStones, catmull, PAWN_FRACTION };
if (typeof module !== 'undefined' && module.exports) module.exports = PD;
if (typeof window !== 'undefined') window.PD = PD;
