'use strict';
/* Drawn Staunton-style pieces — original vector shapes in a 45x45 box.
   Palettes come from gradient defs in index.html (gradW ivory, gradB ebony, gradG brass).
   Every piece stands on a turned base over an antique-gold disc. */
const PIECES = (() => {
  const base = '<path class="bd" d="M10.2 38.6c0-1.8 2.2-2.7 12.3-2.7s12.3.9 12.3 2.7-2.2 2.7-12.3 2.7-12.3-.9-12.3-2.7Z"/>' +
    '<path class="bd" d="M13.8 36.1c0-1.5 1.9-2.3 8.7-2.3s8.7.8 8.7 2.3-1.9 2.2-8.7 2.2-8.7-.7-8.7-2.2Z"/>' +
    '<ellipse cx="22.5" cy="42.6" rx="13.4" ry="1.7" fill="#5c4718"/>';
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

/* The Court — figurative set drawn for the lacquer board: robed people for the
   court, a warder for the rook, foot soldiers for pawns, and a horse rearing
   back for the knight. Same 45x45 box, same base, same paint classes. */
const COURT = (() => {
  const base = '<path class="bd" d="M10.2 38.6c0-1.8 2.2-2.7 12.3-2.7s12.3.9 12.3 2.7-2.2 2.7-12.3 2.7-12.3-.9-12.3-2.7Z"/>' +
    '<path class="bd" d="M13.8 36.1c0-1.5 1.9-2.3 8.7-2.3s8.7.8 8.7 2.3-1.9 2.2-8.7 2.2-8.7-.7-8.7-2.2Z"/>' +
    '<ellipse cx="22.5" cy="42.6" rx="13.4" ry="1.7" fill="#5c4718"/>';
  const body = (inner) => '<svg viewBox="0 0 45 45" aria-hidden="true">' + inner + base + '</svg>';
  const C = {
    p: body('<path class="bd" d="M16.9 12.2a5.6 5.6 0 0 1 11.2 0Z"/>' +
      '<path class="dt" d="M15.9 12.4h13.2" fill="none" stroke-width="1.2"/>' +
      '<circle class="bd" cx="22.5" cy="15.2" r="2.9"/>' +
      '<path class="bd" d="M17.6 19.4 15.2 36h14.6l-2.4-16.6c-1.5-1.3-8.3-1.3-9.8 0Z"/>' +
      '<path class="bd" d="M31.4 2.8 33.2 8h-3.6Z"/>' +
      '<path class="dt" d="M31.4 8v27" fill="none" stroke-width="1.5" stroke-linecap="round"/>' +
      '<circle class="bd" cx="14.8" cy="25.4" r="4.7"/>' +
      '<circle class="dtf" cx="14.8" cy="25.4" r="1.5"/>'),
    r: body('<path class="bd" d="M16.2 11.4 22.5 3.4l6.3 8Z"/>' +
      '<path class="dt" d="M22.5 11.4v4.4" fill="none" stroke-width="1.3"/>' +
      '<path class="bd" d="M17.4 11.4h10.2l-.8 4.8H18.2Z"/>' +
      '<path class="bd" d="M16.8 19.6 14.8 36h15.4l-2-16.4c-1.6-1.2-9.8-1.2-11.4 0Z"/>' +
      '<path class="bd" d="M15.3 19.2h14.4v7.6c0 4.6-3.4 8-7.2 9.4-3.8-1.4-7.2-4.8-7.2-9.4Z"/>' +
      '<path class="dtf" d="M21.2 21.4h2.6v3h3v2.6h-3v4.4h-2.6V27h-3v-2.6h3Z"/>'),
    n: body('<ellipse class="bd" cx="24" cy="16" rx="10.5" ry="6.4" transform="rotate(-38 24 16)"/>' +
      '<circle class="bd" cx="30.5" cy="22.5" r="5.6"/>' +
      '<ellipse class="bd" cx="14.5" cy="9.5" rx="7" ry="4.1" transform="rotate(-52 14.5 9.5)"/>' +
      '<ellipse class="bd" cx="9.6" cy="5.4" rx="5.2" ry="3" transform="rotate(-28 9.6 5.4)"/>' +
      '<ellipse class="bd" cx="5.6" cy="7.8" rx="3" ry="2" transform="rotate(-20 5.6 7.8)"/>' +
      '<path class="bd" d="M11.5 2.4 13.4.4l.5 3.2Z"/><path class="bd" d="M15 3.2 17.2 1.8l0 3.2Z"/>' +
      '<path class="bd" d="M21 2.6 17.8 5.4l3.2.8-3.6 3.2 3.4.9-3.4 3.8-2.2-2.9c.8-3.9 2.6-6.6 5.8-8.6Z"/>' +
      '<circle class="dtf" cx="10.2" cy="4.8" r="1.05"/>' +
      '<path class="bd" d="M13.5 15.5c-3 1.5-4 4-2.5 6.5l2.4-1.2c-1-1.8-.4-3.4 1.6-4.4Z"/>' +
      '<path class="bd" d="M16.8 17.6c-2.6 1.9-2.9 4.4-1.2 6.4l2.1-1.6c-1.2-1.6-1-3.2.6-4.4Z"/>' +
      '<path class="bd" d="M31 24l3.5 5.5-.5 6.5h-2.8l.2-5.5-2.6-4.5Z"/>' +
      '<path class="bd" d="M27.5 25.5l2.3 5-.4 5.5h-2.6l.2-6-2-3.2Z"/>' +
      '<path class="bd" d="M33.8 18.5c3.7 3.5 4.5 10 2.4 17.5h-2.8c1.4-6.5.6-12-1.8-15.5Z"/>' +
      '<path class="dtf" d="M19.8 10.6l7.7 3.4-1.7 5.3-7.2-3Z"/>'),
    b: body('<path class="bd" d="M16.8 13 22.5 2.6 28.2 13l-1 3H17.8Z"/>' +
      '<path class="dtf" d="M21.4 7.6h2.2v1.8h1.8v2.2H23.6v1.8h-2.2V11.6H19.6V9.4h1.8Z"/>' +
      '<circle class="bd" cx="22.5" cy="18.6" r="2.9"/>' +
      '<path class="bd" d="M17.2 22.8 14.8 36h15.4l-2.4-13.2c-1.5-1.3-9.1-1.3-10.6 0Z"/>' +
      '<path class="dt" d="M33.6 34V13.5c0-2.4-1.8-3.8-3.6-3.4" fill="none" stroke-width="1.6" stroke-linecap="round"/>' +
      '<path class="bd" d="M11.6 22.6h5.6v7h-5.6Z"/>' +
      '<path class="dt" d="M14.4 24.2v3.8M12.6 26.1h3.6" fill="none" stroke-width="1.1"/>'),
    q: body('<path class="bd" d="M16.8 10l1.6-3.2 2.1 2.4 2-3.2 2 3.2 2.1-2.4 1.6 3.2-.4 2H17.2Z"/>' +
      '<circle class="dtf" cx="22.5" cy="10.8" r="1.3"/>' +
      '<path class="bd" d="M17.6 12.4c.2 3-.4 5.6-1.6 8.2l2.2 1c1.1-3 1.4-6.2 1-9.2ZM27.4 12.4c-.2 3 .4 5.6 1.6 8.2l-2.2 1c-1.1-3-1.4-6.2-1-9.2Z"/>' +
      '<circle class="bd" cx="22.5" cy="15.2" r="3.1"/>' +
      '<path class="bd" d="M17.4 20.4c-2.2 4.4-3.9 9.6-4.8 15.6h19.8c-.9-6-2.6-11.2-4.8-15.6-1.4-1.4-8.8-1.4-10.2 0Z"/>' +
      '<path class="dt" d="M18.4 23.6c1.3 1.5 2.7 2.2 4.1 2.2s2.8-.7 4.1-2.2" fill="none" stroke-width="1.2" stroke-linecap="round"/>' +
      '<circle class="dtf" cx="22.5" cy="26.6" r="1.1"/>'),
    k: body('<path class="dtf" d="M21.6 0h1.8v1.8h1.8V3.6H23.4V5.4h-1.8V3.6H19.8V1.8h1.8Z"/>' +
      '<path class="bd" d="M14.6 10.4 16.2 5.4l2.6 3.2 1.9-3.4 1.8 3.4 1.9-3.4 1.9 3.4 2.6-3.2 1.6 5-.6 2.4H15.2Z"/>' +
      '<circle class="bd" cx="22.5" cy="15.8" r="3.4"/>' +
      '<circle class="bd" cx="33" cy="14.6" r="3.1"/>' +
      '<path class="dtf" d="M32.1 9.4h1.8v1.7h1.7v1.8h-1.7v1.7h-1.8v-1.7h-1.7V11.1h1.7Z"/>' +
      '<path class="bd" d="M29.4 16.8l2-1.8 1.2 1-1.4 2.2Z"/>' +
      '<path class="bd" d="M15.8 20.2 12.8 36h19.4l-3-15.8-2.9-2.2c-2.2.9-5.4.9-7.6 0Z"/>' +
      '<path class="dt" d="M22.5 22v11.6" fill="none" stroke-width="1.1"/>')
  };
  return C;
})();

/* Starfall — original space-opera set for the lacquer board: star-troopers,
   a shield tower, a mech-steed knight, a cloaked oracle, a star-captain
   queen and an emperor king. Genre-evoked only; every figure is ours.
   Same 45x45 box, same base, same paint classes. Palettes swap to
   gradS/gradV under body.set-star in style.css. */
const STARFALL = (() => {
  const base = '<path class="bd" d="M10.2 38.6c0-1.8 2.2-2.7 12.3-2.7s12.3.9 12.3 2.7-2.2 2.7-12.3 2.7-12.3-.9-12.3-2.7Z"/>' +
    '<path class="bd" d="M13.8 36.1c0-1.5 1.9-2.3 8.7-2.3s8.7.8 8.7 2.3-1.9 2.2-8.7 2.2-8.7-.7-8.7-2.2Z"/>' +
    '<ellipse cx="22.5" cy="42.6" rx="13.4" ry="1.7" fill="#5c4718"/>';
  const body = (inner) => '<svg viewBox="0 0 45 45" aria-hidden="true">' + inner + base + '</svg>';
  const S = {
    p: body('<path class="bd" d="M16.6 12.4a5.9 5.9 0 0 1 11.8 0Z"/>' +
      '<path class="dtf" d="M18.2 11.4h8.6v1.7h-8.6Z"/>' +
      '<circle class="bd" cx="22.5" cy="15.4" r="2.8"/>' +
      '<circle class="bd" cx="16.6" cy="20.8" r="1.9"/><circle class="bd" cx="28.4" cy="20.8" r="1.9"/>' +
      '<path class="bd" d="M17.8 19.4 15.4 36h14.2l-2.4-16.6c-1.5-1.2-7.9-1.2-9.4 0Z"/>' +
      '<path class="dt" d="M18.8 27.6h7.4" fill="none" stroke-width="1.1"/>' +
      '<circle class="dtf" cx="22.5" cy="23.8" r="1.2"/>'),
    r: body('<path class="bd" d="M14 13.5V6.8h4.4v2.7h3.1V6.8h3.1v2.7h3.1V6.8H32v6.7Z"/>' +
      '<path class="dt" d="M29.8 6.8V3.4" fill="none" stroke-width="1.3" stroke-linecap="round"/>' +
      '<circle class="dtf" cx="29.8" cy="2.4" r=".95"/>' +
      '<path class="bd" d="M15.8 17.6c0-1.6 3-2.5 6.7-2.5s6.7.9 6.7 2.5-3 2.4-6.7 2.4-6.7-.8-6.7-2.4Z"/>' +
      '<path class="bd" d="M16.6 17.8 15.2 36h14.6l-1.4-18.2Z"/>' +
      '<path class="dtf" d="M18.4 21.6h8.2v1.8h-8.2Z"/>' +
      '<path class="bd" d="M15 24.5l-3.2 4.6h3.6Z"/><path class="bd" d="M30 24.5l3.2 4.6h-3.6Z"/>'),
    n: body('<ellipse class="bd" cx="24" cy="16" rx="10.5" ry="6.4" transform="rotate(-38 24 16)"/>' +
      '<circle class="bd" cx="30.5" cy="22.5" r="5.6"/>' +
      '<ellipse class="bd" cx="14.5" cy="9.5" rx="7" ry="4.1" transform="rotate(-52 14.5 9.5)"/>' +
      '<ellipse class="bd" cx="9.6" cy="5.4" rx="5.2" ry="3" transform="rotate(-28 9.6 5.4)"/>' +
      '<ellipse class="bd" cx="5.6" cy="7.8" rx="3" ry="2" transform="rotate(-20 5.6 7.8)"/>' +
      '<path class="bd" d="M11.5 2.4 13.4.4l.5 3.2Z"/><path class="bd" d="M15 3.2 17.2 1.8l0 3.2Z"/>' +
      '<path class="bd" d="M21.5 2.2 18.6 5.6l3 .4-3.2 3.4 3.2.6-3 4-2.4-2.7c.7-4 2.4-6.9 5.3-9.1Z"/>' +
      '<circle class="dtf" cx="10.2" cy="4.8" r="1.05"/>' +
      '<path class="dt" d="M17.5 13.5l5.5 3.2" fill="none" stroke-width="1.1"/>' +
      '<path class="bd" d="M13.5 15.5c-3 1.5-4 4-2.5 6.5l2.4-1.2c-1-1.8-.4-3.4 1.6-4.4Z"/>' +
      '<path class="bd" d="M16.8 17.6c-2.6 1.9-2.9 4.4-1.2 6.4l2.1-1.6c-1.2-1.6-1-3.2.6-4.4Z"/>' +
      '<path class="bd" d="M31 24l3.5 5.5-.5 6.5h-2.8l.2-5.5-2.6-4.5Z"/>' +
      '<path class="bd" d="M27.5 25.5l2.3 5-.4 5.5h-2.6l.2-6-2-3.2Z"/>' +
      '<path class="bd" d="M33.8 18.5c3.7 3.5 4.5 10 2.4 17.5h-2.8c1.4-6.5.6-12-1.8-15.5Z"/>' +
      '<path class="dtf" d="M19.8 10.6l7.7 3.4-1.7 5.3-7.2-3Z"/>'),
    b: body('<path class="dt" d="M33.4 34V12.5" fill="none" stroke-width="1.6" stroke-linecap="round"/>' +
      '<circle class="bd" cx="33.4" cy="9.8" r="2.7"/>' +
      '<circle class="dtf" cx="33.4" cy="9.8" r="1.2"/>' +
      '<path class="bd" d="M22.5 2.8c4.6 3.8 7.2 7.6 7.2 12.4H15.3c0-4.8 2.6-8.6 7.2-12.4Z"/>' +
      '<circle class="dtf" cx="20.2" cy="12.8" r=".9"/><circle class="dtf" cx="24.8" cy="12.8" r=".9"/>' +
      '<path class="bd" d="M17 16.8 13.8 36h17.4L28 16.8c-1.6-1.2-9.4-1.2-11 0Z"/>' +
      '<path class="dt" d="M22.5 20.5v12.5" fill="none" stroke-width="1.1"/>' +
      '<circle class="bd" cx="22.5" cy="21.4" r="1.6"/>'),
    q: body('<circle class="dtf" cx="11" cy="10.6" r="1.15"/><circle class="dtf" cx="16.6" cy="8.2" r="1.15"/><circle class="dtf" cx="22.5" cy="7.2" r="1.3"/><circle class="dtf" cx="28.4" cy="8.2" r="1.15"/><circle class="dtf" cx="34" cy="10.6" r="1.15"/>' +
      '<path class="bd" d="M11.4 12.8h22.2l-1.4 3.4H12.8Z"/>' +
      '<circle class="bd" cx="22.5" cy="15.6" r="3"/>' +
      '<path class="bd" d="M17.8 13.2c.2 3-.4 5.4-1.5 7.8l2.1 1c1-2.9 1.3-5.9.9-8.8ZM27.2 13.2c-.2 3 .4 5.4 1.5 7.8l-2.1 1c-1-2.9-1.3-5.9-.9-8.8Z"/>' +
      '<path class="dt" d="M34 33.5V16.8" fill="none" stroke-width="1.5" stroke-linecap="round"/>' +
      '<circle class="bd" cx="34" cy="13.8" r="2.7"/>' +
      '<ellipse class="dt" cx="34" cy="13.8" rx="4.8" ry="1.5" transform="rotate(-18 34 13.8)" fill="none" stroke-width="1.1"/>' +
      '<path class="bd" d="M17.4 20.4c-2.4 4.6-4.2 9.8-5.2 15.6h21.6c-1-5.8-2.8-11-5.2-15.6-1.4-1.4-9.8-1.4-11.2 0Z"/>' +
      '<path class="dt" d="M18.4 23.6c1.3 1.5 2.7 2.2 4.1 2.2s2.8-.7 4.1-2.2" fill="none" stroke-width="1.2" stroke-linecap="round"/>' +
      '<circle class="dtf" cx="22.5" cy="26.6" r="1.1"/>'),
    k: body('<circle class="dtf" cx="22.5" cy="1.9" r="1"/>' +
      '<path class="bd" d="M14.8 11.5 16.5 4.6l3.5 3.9 2.5-5.1 2.5 5.1 3.5-3.9 1.7 6.9-.8 2.7H15.6Z"/>' +
      '<circle class="bd" cx="22.5" cy="16.6" r="3.3"/>' +
      '<path class="bd" d="M15.6 20.4 12.6 36h19.8l-3-15.6-2.9-2.3c-2.5 1-5.5 1-8 0Z"/>' +
      '<path class="dt" d="M22.5 21.5V34" fill="none" stroke-width="1.1"/>' +
      '<circle class="dtf" cx="22.5" cy="25.6" r="1.7"/>' +
      '<ellipse class="dt" cx="22.5" cy="25.6" rx="3.6" ry="1.3" transform="rotate(-18 22.5 25.6)" fill="none" stroke-width="1"/>')
  };
  return S;
})();
const PIECE_SETS = { staunton: PIECES, court: COURT, starfall: STARFALL };

if (typeof module !== 'undefined' && module.exports) module.exports = PIECES;
