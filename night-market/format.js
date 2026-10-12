// Night Market — format.js — number / time / rate formatting.
// Data-free, stateless, pure. No DOM, no game logic.
var NM = window.NM || {};

var FMT_SUFFIX = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc',
  'UDc', 'DDc', 'TDc', 'QaDc', 'QiDc', 'SxDc', 'SpDc', 'OcDc', 'NDc', 'Vg'];

// fmt(n, prec=2): 0..999 raw (floor ints, 2dp under 10 with fraction),
// then K/M/B/... suffixes, else 2.35e42 style.
function FMT_fmt(n, prec) {
  if (prec === undefined || prec === null) prec = 2;
  if (typeof n !== 'number' || isNaN(n)) return '0';
  if (!isFinite(n)) return n > 0 ? 'Infinity' : '-Infinity';
  var neg = n < 0;
  n = Math.abs(n);
  var out;
  if (n < 1000) {
    out = (n < 10 && n % 1 !== 0) ? n.toFixed(prec) : Math.floor(n).toString();
  } else {
    var tier = Math.floor(Math.log10(n) / 3);
    if (tier < FMT_SUFFIX.length) {
      out = (n / Math.pow(10, tier * 3)).toFixed(prec) + FMT_SUFFIX[tier];
    } else {
      out = n.toExponential(prec).replace('e+', 'e');
    }
  }
  return neg ? '-' + out : out;
}

// Abbreviated integer: never shows decimals.
function FMT_fmtInt(n) {
  if (typeof n !== 'number' || isNaN(n) || !isFinite(n)) return '0';
  return FMT_fmt(Math.floor(Math.abs(n)) * (n < 0 ? -1 : 1), 0);
}

// "45s" / "12m 5s" / "8h 12m" / "3d 2h" — top two units only.
function FMT_fmtTime(sec) {
  if (typeof sec !== 'number' || isNaN(sec)) return '0s';
  sec = Math.max(0, Math.floor(sec));
  if (sec < 60) return sec + 's';
  var m = Math.floor(sec / 60);
  var s = sec % 60;
  if (m < 60) return s ? m + 'm ' + s + 's' : m + 'm';
  var h = Math.floor(m / 60);
  m = m % 60;
  if (h < 24) return m ? h + 'h ' + m + 'm' : h + 'h';
  var d = Math.floor(h / 24);
  h = h % 24;
  return h ? d + 'd ' + h + 'h' : d + 'd';
}

function FMT_fmtRate(n) {
  return FMT_fmt(n) + '/s';
}

NM.format = {
  fmt: FMT_fmt,
  fmtInt: FMT_fmtInt,
  fmtTime: FMT_fmtTime,
  fmtRate: FMT_fmtRate
};
