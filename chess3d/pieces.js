'use strict';
/* Drawn Staunton-style pieces — original vector shapes in a 45x45 box.
   Palettes come from gradient defs in index.html (gradW ivory, gradB ebony, gradG brass).
   Every piece stands on a turned base over a green baize pad. */
const PIECES = (() => {
  const base = '<path class="bd" d="M10.2 38.6c0-1.8 2.2-2.7 12.3-2.7s12.3.9 12.3 2.7-2.2 2.7-12.3 2.7-12.3-.9-12.3-2.7Z"/>' +
    '<path class="bd" d="M13.8 36.1c0-1.5 1.9-2.3 8.7-2.3s8.7.8 8.7 2.3-1.9 2.2-8.7 2.2-8.7-.7-8.7-2.2Z"/>' +
    '<ellipse cx="22.5" cy="42.6" rx="13.4" ry="1.7" fill="#17351f"/>';
  const body = (inner) => '<svg viewBox="0 0 45 45" aria-hidden="true">' + inner + base + '</svg>';
  const P = {
    p: body('<circle class="bd" cx="22.5" cy="14.6" r="5.4"/>' +
      '<ellipse cx="20.6" cy="12.4" rx="1.7" ry="1.1" fill="rgba(255,255,255,.4)"/>' +
      '<path class="bd" d="M16.2 33.8c0-5.4 2.2-9.3 6.3-9.3s6.3 3.9 6.3 9.3Z"/>' +
      '<path class="bd" d="M15.6 24.2c0-1.7 3.1-2.6 6.9-2.6s6.9.9 6.9 2.6-3.1 2.5-6.9 2.5-6.9-.8-6.9-2.5Z"/>'),
    r: body('<path class="bd" d="M13.8 8.2h4.6v3h3.2v-3h2.8v3h3.2v-3h4.6l-.6 7.4H14.4Z"/>' +
      '<path class="bd" d="M15.6 20.6 14.4 33.8h16.2l-1.2-13.2Z"/>' +
      '<path class="bd" d="M14.2 20.4c0-1.8 3.7-2.7 8.3-2.7s8.3.9 8.3 2.7-3.7 2.6-8.3 2.6-8.3-.8-8.3-2.6Z"/>'),
    n: body('<path class="bd" d="M13.8 36.4v-5.2c0-3.1 2-5.2 6-6.2l-4.3-5.6c-2-2.7-1.2-6.9 1.9-9L18.6 4l3.4 3.8 3.9-2.5c1.4 3.4 2.2 6.6 2.2 10.2v8.9c3.2 1 5.1 3 5.1 6v5.2Z"/>' +
      '<path class="dt" d="M16.4 19.2c1.3-1.5 3.2-2.1 5.2-1.8" fill="none" stroke-width="1.3" stroke-linecap="round"/>' +
      '<circle cx="20.6" cy="11.3" r="1.15" class="dtf"/>' +
      '<circle cx="16.9" cy="15.6" r=".85" class="dtf"/>'),
    b: body('<circle class="bd" cx="22.5" cy="4.9" r="2"/>' +
      '<path class="bd" d="M22.5 6.6c4.3 4.6 6.9 8.9 6.9 13.2 0 4.4-2.9 7-6.9 7s-6.9-2.6-6.9-7c0-4.3 2.6-8.6 6.9-13.2Z"/>' +
      '<path class="dt" d="M19.8 12.6l5.6 6.2" stroke-width="1.5" stroke-linecap="round" fill="none"/>' +
      '<path class="bd" d="M17.2 33.8c0-3.9 2-6.7 5.3-6.7s5.3 2.8 5.3 6.7Z"/>' +
      '<path class="bd" d="M15.4 27.6c0-1.7 3.2-2.6 7.1-2.6s7.1.9 7.1 2.6-3.2 2.5-7.1 2.5-7.1-.8-7.1-2.5Z"/>'),
    q: body('<circle class="bd" cx="10.2" cy="11.6" r="1.8"/><circle class="bd" cx="16.4" cy="9.4" r="1.8"/><circle class="bd" cx="22.5" cy="8.4" r="1.9"/><circle class="bd" cx="28.6" cy="9.4" r="1.8"/><circle class="bd" cx="34.8" cy="11.6" r="1.8"/>' +
      '<path class="bd" d="M10.6 13.4 14 24.6l4.4-8.8 4.1 7.2 4.1-7.2 4.4 8.8 3.4-11.2-2.3 13.4c-.3 1.9-4.3 3.1-9.6 3.1s-9.3-1.2-9.6-3.1Z"/>' +
      '<path class="bd" d="M14.8 33.8c0-3.4 3.4-5.3 7.7-5.3s7.7 1.9 7.7 5.3Z"/>'),
    k: body('<path class="bd" d="M21.3 3.2h2.4v2.9h2.9v2.4h-2.9v2.9h-2.4V8.5H18.4V6.1h2.9Z"/>' +
      '<path class="bd" d="M12.8 26.6 14.2 14l4.4 4.9L22.5 13l3.9 5.9L30.8 14l1.4 12.6c.3 2.2-4 3.6-9.7 3.6s-10-1.4-9.7-3.6Z"/>' +
      '<path class="bd" d="M14.8 33.8c0-3.4 3.4-5.3 7.7-5.3s7.7 1.9 7.7 5.3Z"/>')
  };
  return P;
})();
if (typeof module !== 'undefined' && module.exports) module.exports = PIECES;
