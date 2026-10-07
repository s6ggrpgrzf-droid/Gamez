/* UNFOLD rooms — data, art, puzzle chains. No game logic here beyond step setup. */
(function () {
  'use strict';

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hashStr(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  /* ============ shared SVG bits ============ */
  var SHADOW = '<ellipse cx="200" cy="508" rx="120" ry="20" fill="#000" opacity="0.45"/>';
  function tableWood() {
    return '<rect x="0" y="440" width="400" height="180" fill="url(#woodG)"/>' +
      '<rect x="0" y="440" width="400" height="6" fill="#fff" opacity="0.05"/>' +
      '<path d="M0 500 H400 M0 560 H400" stroke="#000" opacity="0.18" stroke-width="2"/>';
  }
  function defsWood() {
    return '<linearGradient id="woodG" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#7a5638"/><stop offset="1" stop-color="#4a3120"/></linearGradient>';
  }
  function haloRect(x, y, w, h, r) {
    return '<rect class="hot-halo" x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="' + (r || 12) + '"/>';
  }

  var WORDS = {
    STAR: ['Silent night above the sea,', 'Tides are humming low to me,', 'And the sky begins to part,', 'Radiant, you find my heart.'],
    MOON: ['Morning hides her silver face,', 'Only stars can find her place,', 'Over rooftops, soft and soon,', 'Night will wake the sleepy moon.'],
    SONG: ['Softly through the evening air,', 'Notes are drifting everywhere,', 'Golden threads of sweet delight,', 'Gather stars into the night.'],
    BELL: ['Beneath the velvet, still and deep,', 'Echoes of the dreams we keep,', 'Listen close and you will tell —', 'Love is ringing like a bell.'],
    SNOW: ['Silent feathers fill the air,', 'Night is weaving crystal fair,', 'Over rooftops, soft and slow,', 'Whispers fall as winter snow.'],
    WISH: ['When the clock strikes twelve at night,', 'In the moon\u2019s soft silver light,', 'Secrets that the dreamers keep,', 'Hide them in a wish so deep.']
  };
  var WORDLIST = Object.keys(WORDS);
  var XYLO_COLORS = ['#e0574f', '#ef9b3f', '#f2cf5b', '#57c7b2', '#9a7fe0'];
  var NOTE_NAMES = ['C', 'D', 'E', 'G', 'A'];

  /* ================================================================
     ROOM 1 — THE LUNCHBOX
  ================================================================ */
  var LUNCHBOX_DEFAULT = { code: [4, 0, 7] };

  function lunchboxArt(state, V) {
    var code = V.code.join('');
    var s = '<defs>' + defsWood() +
      '<linearGradient id="lbBody" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#e0574a"/><stop offset=".55" stop-color="#c0392b"/><stop offset="1" stop-color="#8e2318"/></linearGradient>' +
      '<linearGradient id="lbLid" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#ef6a5c"/><stop offset="1" stop-color="#c0392b"/></linearGradient>' +
      '<linearGradient id="brass" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#f6d47c"/><stop offset="1" stop-color="#b98a2e"/></linearGradient>' +
      '</defs>';
    s += tableWood() + SHADOW;
    // body
    s += '<g id="lb-body"><rect x="105" y="270" width="190" height="160" rx="20" fill="url(#lbBody)" stroke="#5e140d" stroke-width="2"/>' +
      '<rect x="105" y="270" width="190" height="160" rx="20" fill="none" stroke="#fff" opacity="0.14" stroke-width="2"/>' +
      '<rect x="118" y="282" width="164" height="10" rx="5" fill="#fff" opacity="0.12"/></g>';
    // lid (closed in state 0, open afterwards)
    if (state === 0) {
      s += '<g id="lb-lid"><rect x="105" y="236" width="190" height="52" rx="16" fill="url(#lbLid)" stroke="#5e140d" stroke-width="2"/>' +
        '<rect x="118" y="243" width="164" height="8" rx="4" fill="#fff" opacity="0.16"/></g>';
      // handle
      s += '<g id="lb-handle"><path id="handle-arc" d="M155 238 Q200 178 245 238" fill="none" stroke="#3a3a3f" stroke-width="11" stroke-linecap="round"/>' +
        '<circle cx="155" cy="240" r="7" fill="#222"/><circle cx="245" cy="240" r="7" fill="#222"/></g>';
      // latch plate
      s += '<rect x="188" y="288" width="24" height="46" rx="6" fill="url(#brass)" stroke="#7a5c14" stroke-width="1.5"/>' +
        '<circle cx="200" cy="302" r="4" fill="#5e140d"/>';
      // apple sticker
      s += '<g><rect x="228" y="352" width="52" height="58" rx="10" fill="#f7f3e8" opacity="0.95"/>' +
        '<circle cx="254" cy="372" r="12" fill="#d94f3d"/><path d="M254 360 q3 -8 10 -10" stroke="#3f7a3f" stroke-width="3" fill="none"/>' +
        '<text x="254" y="400" text-anchor="middle" font-size="11" font-weight="700" fill="#5e140d">No. ' + code + '</text></g>';
      // hidden key under handle
      s += '<g id="lb-key" opacity="0"><g data-hot="underkey">' + haloRect(178, 208, 44, 30, 10) +
        '<g transform="translate(200,222)"><circle r="7" fill="none" stroke="url(#brass)" stroke-width="5"/>' +
        '<rect x="-2.5" y="6" width="5" height="20" rx="2" fill="url(#brass)"/>' +
        '<rect x="-2.5" y="18" width="9" height="4" rx="2" fill="url(#brass)"/></g></g></g>';
      s += '<g data-hot="handle">' + haloRect(140, 170, 120, 76, 20) +
        '<rect x="140" y="170" width="120" height="76" fill="#fff" opacity="0"/></g>';
    } else {
      // lid swung open — trapezoid in fake perspective, hinged at the back edge
      s += '<g id="lb-lid">' +
        '<path d="M112 260 L288 260 L260 156 L140 156 Z" fill="url(#lbLid)" stroke="#5e140d" stroke-width="2"/>' +
        '<path d="M140 156 L260 156 L254 172 L146 172 Z" fill="#fff" opacity="0.10"/>' +
        '<path d="M112 260 L288 260 L284 248 L116 248 Z" fill="#000" opacity="0.18"/></g>';
      // open mouth (dark opening at top of body)
      s += '<rect x="118" y="258" width="164" height="30" rx="12" fill="#2a0f0a"/>';
      if (state === 1) {
        // combo lock mounted on the lid's inner face
        s += '<g data-hot="lock">' + haloRect(142, 168, 116, 72, 14) +
          '<rect x="142" y="168" width="116" height="72" rx="14" fill="#2b2b30" stroke="url(#brass)" stroke-width="2.5"/>' +
          [0, 1, 2].map(function (i) {
            return '<rect x="' + (154 + i * 34) + '" y="180" width="26" height="34" rx="6" fill="#100d10" stroke="#555" stroke-width="1"/>' +
              '<text x="' + (167 + i * 34) + '" y="206" text-anchor="middle" font-size="22" font-weight="700" fill="#f6d47c">0</text>';
          }).join('') +
          '<text x="200" y="234" text-anchor="middle" font-size="10" fill="#a89f91">tap the lock</text></g>';
        s += '<g opacity="0.9"><rect x="238" y="352" width="52" height="58" rx="10" fill="#f7f3e8"/>' +
          '<circle cx="264" cy="372" r="12" fill="#d94f3d"/>' +
          '<text x="264" y="400" text-anchor="middle" font-size="11" font-weight="700" fill="#5e140d">No. ' + code + '</text></g>';
      }
      if (state === 2) {
        // sandwich container nestled in the open box, tile cover
        s += '<text x="200" y="140" text-anchor="middle" font-size="11" fill="#f5f1e8" opacity="0.8">slide the cover</text>';
        s += '<g data-hot="container">' + haloRect(122, 296, 156, 118, 16) +
          '<rect x="122" y="296" width="156" height="118" rx="16" fill="#f2e8d8" opacity="0.30" stroke="#fff" stroke-width="2"/>';
        for (var r = 0; r < 3; r++) for (var c = 0; c < 3; c++) {
          s += '<rect x="' + (134 + c * 46) + '" y="' + (308 + r * 34) + '" width="40" height="28" rx="7" fill="#d9c9a8" stroke="#8a6f4d" stroke-width="1.5"/>';
        }
        s += '</g>';
      }
      if (state === 3) {
        // brass key rising from the box
        s += '<g data-hot="brasskey">' + haloRect(158, 290, 84, 80, 14) +
          '<g transform="translate(200,330) scale(1.6)"><circle r="7" fill="none" stroke="url(#brass)" stroke-width="5"/>' +
          '<rect x="-2.5" y="6" width="5" height="20" rx="2" fill="url(#brass)"/>' +
          '<rect x="-2.5" y="18" width="9" height="4" rx="2" fill="url(#brass)"/>' +
          '<rect x="-2.5" y="24" width="9" height="4" rx="2" fill="url(#brass)"/></g>' +
          '<ellipse cx="200" cy="330" rx="44" ry="36" fill="none" stroke="#f6d47c" opacity="0.5" class="pulse"/></g>';
      }
      if (state === 4) {
        // core treasure box
        s += '<g data-hot="corebox">' + haloRect(130, 296, 140, 118, 16) +
          '<rect x="130" y="316" width="140" height="90" rx="12" fill="#3a2c1c" stroke="url(#brass)" stroke-width="3"/>' +
          '<rect x="130" y="316" width="140" height="26" rx="12" fill="#4a3826" stroke="url(#brass)" stroke-width="2"/>' +
          '<circle cx="200" cy="364" r="9" fill="#100c08" stroke="url(#brass)" stroke-width="3"/>' +
          '<rect x="196" y="364" width="8" height="14" rx="3" fill="#100c08"/>' +
          '<text x="200" y="300" text-anchor="middle" font-size="11" fill="#f5f1e8" opacity="0.8">the heart of the lunchbox</text></g>';
      }
    }
    // latch hotspot (state 0, after key found)
    if (state === 0) {
      s += '<g data-hot="latch">' + haloRect(176, 282, 48, 58, 10) +
        '<rect x="176" y="282" width="48" height="58" fill="#fff" opacity="0"/></g>';
    }
    return '<svg viewBox="0 0 400 620" preserveAspectRatio="xMidYMid slice">' + s + '</svg>';
  }

  function lunchboxThumb() {
    return '<svg viewBox="0 0 80 80"><rect x="14" y="30" width="52" height="34" rx="8" fill="#c0392b"/>' +
      '<rect x="14" y="24" width="52" height="14" rx="6" fill="#e0574a"/>' +
      '<path d="M30 26 Q40 12 50 26" stroke="#3a3a3f" stroke-width="5" fill="none" stroke-linecap="round"/></svg>';
  }

  function lunchboxRoom(V) {
    var steps = [
      {
        id: 'find-key', kind: 'find', name: 'The Stuck Latch',
        hints: ['The handle looks loose. Give it a tap.', 'Something small is taped under the handle — lift it first.', 'Tap the HANDLE, then tap the little key hiding underneath.'],
        scene: function () { return lunchboxArt(0, V); },
        setup: function (api) {
          var lifted = false, gotKey = false;
          api.hot('handle', function () {
            if (lifted) return;
            lifted = true; Sfx.flip();
            api.addClass('#handle-arc', 'lid-open');
            var ha = document.querySelector('#handle-arc');
            if (ha) ha.style.transform = 'rotate(-32deg)';
            api.show('#lb-key');
            api.say('The handle lifts… something glints underneath.');
          });
          api.hot('underkey', function () {
            if (!lifted || gotKey) return;
            gotKey = true; Sfx.pickup();
            api.collect({ id: 'small-key', name: 'Little key', icon: '🗝️' });
            api.hide('#lb-key');
            api.say('A little brass key. The latch is begging for it.');
          });
          api.use('small-key', 'latch', function () {
            Sfx.unlock();
            api.take('small-key');
            api.say('Click! The lid springs open.');
            setTimeout(function () { api.next(); }, 650);
          });
          api.hot('latch', function () {
            if (!api.has('small-key')) { api.say('Stuck fast. There must be a key somewhere…'); Sfx.soft(); }
          });
        }
      },
      {
        id: 'combo', kind: 'code', name: 'The Apple Code',
        hints: ['The sticker says "No." something. Locks love numbers.', 'Look at the apple sticker on the side: No. ' + V.code.join('') + '… interesting.', 'Set the wheels to ' + V.code.join('–') + '.'],
        scene: function () { return lunchboxArt(1, V); },
        setup: function (api) {
          api.hot('lock', function () {
            Sfx.tap();
            api.code({
              digits: 3, answer: V.code, title: 'Brass combination lock',
              sub: 'Tap each wheel to turn it.',
              onSolve: function () {
                Sfx.unlock(); api.say('The lid sighs open. A sandwich container… with a sliding cover?');
                setTimeout(function () { api.next(); }, 800);
              }
            });
          });
        }
      },
      {
        id: 'slide', kind: 'slide', name: 'The Sliding Cover',
        hints: ['Tap a tile next to the empty space to slide it.', 'Work the tiles into order, 1 to 8.', 'Open the tile puzzle and slide them home.'],
        scene: function () { return lunchboxArt(2, V); },
        setup: function (api) {
          api.hot('container', function () {
            Sfx.tap();
            api.slide({
              title: 'Sandwich container', sub: 'Slide the tiles into order.',
              onSolve: function () {
                Sfx.chime(); api.say('The cover clicks aside. A tiny brass key!');
                setTimeout(function () { api.next(); }, 800);
              }
            });
          });
        }
      },
      {
        id: 'core', kind: 'find', name: 'The Heart of the Lunchbox',
        hints: ['The brass key wants the little treasure box.', 'Select the brass key, then tap the ornate box.', 'Tap the BRASS KEY in your tray, then the treasure box.'],
        scene: function () { return lunchboxArt(3, V); },
        setup: function (api) {
          var got = false;
          api.hot('brasskey', function () {
            if (got) return; got = true; Sfx.pickup();
            api.collect({ id: 'brass-key', name: 'Brass key', icon: '🔑' });
            api.say('The last piece. Open the heart.');
            setTimeout(function () { api.next(); }, 700);
          });
        }
      },
      {
        id: 'heart', kind: 'use', name: 'Unfold',
        hints: [''],
        scene: function () { return lunchboxArt(4, V); },
        setup: function (api) {
          api.use('brass-key', 'corebox', function () {
            api.done();
          });
          api.hot('corebox', function () {
            api.say('Locked. It wants the brass key.');
            Sfx.soft();
          });
        }
      }
    ];
    return {
      id: 'lunchbox', title: 'The Lunchbox', sub: 'A red lunchbox on a kitchen table',
      theme: { spot: 'rgba(232,150,75,.22)', accent: '#e8b34b' },
      vars: V, steps: steps,
      diorama: {
        title: 'PICNIC, UNFOLDED',
        svg: '<svg viewBox="0 0 400 340">' +
          '<defs>' +
          '<linearGradient id="skyG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6fbfe8"/><stop offset="1" stop-color="#f6d9a8"/></linearGradient>' +
          '<linearGradient id="grassG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6fae5a"/><stop offset="1" stop-color="#3f7a3f"/></linearGradient>' +
          '<pattern id="gingham" width="26" height="26" patternUnits="userSpaceOnUse">' +
          '<rect width="26" height="26" fill="#c0574f"/>' +
          '<rect width="13" height="13" fill="#f2e8d8" opacity="0.55"/>' +
          '<rect x="13" y="13" width="13" height="13" fill="#f2e8d8" opacity="0.55"/></pattern>' +
          '</defs>' +
          '<g class="d-layer"><rect x="0" y="0" width="400" height="340" fill="url(#skyG)"/>' +
          '<g class="pulse"><circle cx="320" cy="58" r="30" fill="#ffd76a"/><circle cx="320" cy="58" r="46" fill="#ffd76a" opacity="0.28"/></g>' +
          '<g class="driftx" fill="#ffffff" opacity="0.85"><ellipse cx="88" cy="66" rx="28" ry="13"/><ellipse cx="110" cy="60" rx="20" ry="11"/><ellipse cx="68" cy="60" rx="18" ry="10"/></g>' +
          '<g class="driftx" style="animation-delay:-4s" fill="#ffffff" opacity="0.7"><ellipse cx="240" cy="108" rx="22" ry="10"/><ellipse cx="258" cy="103" rx="15" ry="8"/></g>' +
          '<g class="sway"><g transform="translate(76,148)">' +
          '<path d="M0,26 Q-12,58 -34,88" stroke="#ffffff" stroke-width="2" fill="none" opacity="0.7"/>' +
          '<path d="M0,-26 L20,0 L0,26 L-20,0 Z" fill="#e88bb0" stroke="#fff" stroke-width="2"/>' +
          '<path d="M0,-26 L0,26 M-20,0 L20,0" stroke="#a34a68" stroke-width="1.5"/>' +
          '<path d="M-6,34 l6,8 6,-8 M-11,46 l6,8 6,-8" stroke="#f6d47c" stroke-width="3" fill="none"/></g></g></g>' +
          '<g class="d-layer"><path d="M0,252 Q100,226 200,246 T400,236 L400,340 L0,340 Z" fill="url(#grassG)"/>' +
          '<g stroke="#2f6b34" stroke-width="2.5" fill="none" stroke-linecap="round">' +
          '<path d="M52,300 l3,-11 l3,11 l3,-9 l3,9"/><path d="M140,316 l3,-11 l3,11 l3,-9 l3,9"/>' +
          '<path d="M330,306 l3,-11 l3,11 l3,-9 l3,9"/><path d="M250,322 l3,-11 l3,11 l3,-9 l3,9"/></g>' +
          '<g><circle cx="100" cy="292" r="4" fill="#fff"/><circle cx="100" cy="292" r="1.8" fill="#f6d47c"/>' +
          '<circle cx="300" cy="322" r="4" fill="#ffd9e8"/><circle cx="300" cy="322" r="1.8" fill="#f6d47c"/>' +
          '<circle cx="200" cy="310" r="4" fill="#fff"/><circle cx="200" cy="310" r="1.8" fill="#e88bb0"/></g></g>' +
          '<g class="d-layer"><path d="M62,238 L338,238 L358,318 L42,318 Z" fill="url(#gingham)" stroke="#8f3a34" stroke-width="2.5"/>' +
          '<path d="M74,248 L326,248 L340,308 L60,308 Z" fill="none" stroke="#f2e8d8" stroke-width="1.5" opacity="0.6"/></g>' +
          '<g class="d-layer"><rect x="148" y="108" width="112" height="60" rx="9" fill="#a93226" stroke="#5e140d" stroke-width="2"/>' +
          '<rect x="148" y="168" width="112" height="62" rx="11" fill="#c0392b" stroke="#5e140d" stroke-width="2"/>' +
          '<rect x="188" y="100" width="36" height="10" rx="5" fill="#5e140d"/>' +
          '<rect x="160" y="182" width="88" height="7" rx="3.5" fill="#fff" opacity="0.14"/></g>' +
          '<g class="d-layer"><ellipse cx="112" cy="292" rx="34" ry="10" fill="#f5f1e8"/>' +
          '<path d="M94,290 l13,-19 l13,19 z" fill="#e8c96a" stroke="#b98a2e" stroke-width="1.5"/>' +
          '<path d="M114,290 l13,-19 l13,19 z" fill="#d9a84e" stroke="#b98a2e" stroke-width="1.5"/>' +
          '<circle cx="292" cy="284" r="14" fill="#d94f3d"/><path d="M292,270 q3,-9 11,-11" stroke="#3f7a3f" stroke-width="4" fill="none"/>' +
          '<ellipse cx="303" cy="262" rx="6" ry="3.5" fill="#4a9a4a" transform="rotate(-24 303 262)"/>' +
          '<rect x="252" y="256" width="26" height="36" rx="4" fill="#57c7b2" stroke="#2a7a6e" stroke-width="2"/>' +
          '<rect x="252" y="256" width="26" height="8" rx="4" fill="#e88bb0"/>' +
          '<line x1="265" y1="256" x2="274" y2="240" stroke="#e88bb0" stroke-width="4" stroke-linecap="round"/>' +
          '<g class="floaty"><ellipse cx="122" cy="82" rx="7" ry="4.5" fill="#e88bb0" transform="rotate(-30 122 82)"/>' +
          '<ellipse cx="132" cy="82" rx="7" ry="4.5" fill="#f2a8c4" transform="rotate(30 132 82)"/>' +
          '<line x1="127" y1="78" x2="127" y2="88" stroke="#5e3a4a" stroke-width="2"/></g>' +
          '<g class="floaty" style="animation-delay:-2s"><ellipse cx="316" cy="150" rx="6" ry="4" fill="#9a7fe0" transform="rotate(-30 316 150)"/>' +
          '<ellipse cx="325" cy="150" rx="6" ry="4" fill="#b89ff0" transform="rotate(30 325 150)"/>' +
          '<line x1="320.5" y1="146" x2="320.5" y2="155" stroke="#4a3a6a" stroke-width="2"/></g></g>' +
          '</svg>'
      }
    };
  }

  /* ================================================================
     ROOM 2 — THE TOOLBOX
  ================================================================ */
  var TOOLBOX_DEFAULT = { code: [2, 8, 4, 6] };

  function toolboxArt(state, V) {
    var code = V.code.join('');
    var s = '<defs>' +
      '<linearGradient id="steel" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#7d8ea3"/><stop offset=".5" stop-color="#5a6b7d"/><stop offset="1" stop-color="#3d4a58"/></linearGradient>' +
      '<linearGradient id="steelD" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#5a6b7d"/><stop offset="1" stop-color="#2c3640"/></linearGradient>' +
      '<linearGradient id="beam" x1="0" y1="0" x2="1" y2="0">' +
      '<stop offset="0" stop-color="#fff6d8" stop-opacity="0.85"/><stop offset="1" stop-color="#fff6d8" stop-opacity="0"/></linearGradient>' +
      '<linearGradient id="benchG" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#5c4a36"/><stop offset="1" stop-color="#33291d"/></linearGradient>' +
      '</defs>';
    s += '<rect x="0" y="440" width="400" height="180" fill="url(#benchG)"/>' +
      '<rect x="0" y="440" width="400" height="6" fill="#fff" opacity="0.05"/>' + SHADOW;
    // toolbox body
    s += '<rect x="90" y="280" width="220" height="150" rx="14" fill="url(#steel)" stroke="#232c34" stroke-width="2"/>' +
      '<rect x="102" y="292" width="196" height="8" rx="4" fill="#fff" opacity="0.18"/>' +
      '<rect x="90" y="330" width="220" height="4" fill="#232c34" opacity="0.6"/>';
    // latches
    s += '<rect x="130" y="322" width="26" height="34" rx="5" fill="url(#steelD)" stroke="#1c232b" stroke-width="1.5"/>' +
      '<rect x="244" y="322" width="26" height="34" rx="5" fill="url(#steelD)" stroke="#1c232b" stroke-width="1.5"/>';
    // top handle
    s += '<rect x="160" y="252" width="80" height="16" rx="8" fill="#2c3640"/>';
    // side pocket
    s += '<g id="tb-pocket"><rect x="286" y="360" width="52" height="56" rx="8" fill="url(#steelD)" stroke="#1c232b" stroke-width="1.5"/>' +
      '<path d="M286 368 h52" stroke="#1c232b" stroke-width="2"/></g>';
    // flashlight (dead or fixed)
    var flCol = state >= 1 && arguments[2] ? '#ffd76a' : '#8a97a5';
    s += '<g id="tb-flash"><rect x="40" y="470" width="90" height="26" rx="13" fill="#3a434d" stroke="#1c232b" stroke-width="2"/>' +
      '<rect x="118" y="464" width="26" height="38" rx="8" fill="#4a5560" stroke="#1c232b" stroke-width="2"/>' +
      '<circle cx="144" cy="483" r="10" fill="' + flCol + '" opacity="0.9"/></g>';

    if (state === 0) {
      s += '<g data-hot="pocket">' + haloRect(280, 352, 64, 70, 12) +
        '<rect x="280" y="352" width="64" height="70" fill="#fff" opacity="0"/></g>';
      s += '<g data-hot="flashlight">' + haloRect(30, 456, 124, 52, 14) +
        '<rect x="30" y="456" width="124" height="52" fill="#fff" opacity="0"/></g>';
    }
    if (state === 1) {
      // beam when on is toggled via class; tray hotspot
      s += '<g id="tb-beam" opacity="0"><polygon points="144,483 330,420 330,546" fill="url(#beam)"/></g>';
      s += '<g data-hot="flashlight2">' + haloRect(30, 456, 124, 52, 14) +
        '<rect x="30" y="456" width="124" height="52" fill="#fff" opacity="0"/></g>';
      s += '<g data-hot="tray">' + haloRect(120, 250, 160, 60, 12) +
        '<rect x="130" y="258" width="140" height="34" rx="8" fill="url(#steelD)" stroke="#9fb2c5" stroke-width="1.5"/>' +
        '<text x="200" y="248" text-anchor="middle" font-size="11" fill="#f5f1e8" opacity="0.75">lift the tray</text></g>';
      s += '<g id="tb-uv" opacity="0"><g data-hot="uvcode">' + haloRect(130, 300, 140, 40, 10) +
        '<text x="200" y="330" text-anchor="middle" font-size="30" font-weight="700" fill="#c9a7f5" class="glow-pulse" letter-spacing="6">' + code + '</text></g></g>';
    }
    if (state === 2) {
      // drawer with padlock
      s += '<rect x="130" y="300" width="140" height="110" rx="10" fill="#2c3640" stroke="#1c232b" stroke-width="2"/>';
      s += '<g data-hot="padlock">' + haloRect(160, 320, 80, 66, 12) +
        '<rect x="172" y="344" width="56" height="42" rx="8" fill="url(#brass)" stroke="#7a5c14" stroke-width="2"/>' +
        '<path d="M184 344 v-12 a16 16 0 0 1 32 0 v12" fill="none" stroke="#c9a7f5" stroke-width="7"/>' +
        '<text x="200" y="316" text-anchor="middle" font-size="11" fill="#f5f1e8" opacity="0.75">4-digit padlock</text></g>';
    }
    if (state === 3) {
      // open drawer: screws + note + screwdrivers
      s += '<rect x="110" y="290" width="180" height="130" rx="10" fill="#222b33" stroke="#1c232b" stroke-width="2"/>';
      // note
      s += '<g><rect x="122" y="300" width="86" height="52" rx="6" fill="#f2e8d0" transform="rotate(-4 165 326)"/>' +
        '<text x="165" y="320" text-anchor="middle" font-size="9" fill="#4a3b28" transform="rotate(-4 165 326)">only the star</text>' +
        '<text x="165" y="333" text-anchor="middle" font-size="9" fill="#4a3b28" transform="rotate(-4 165 326)">keeps it together</text></g>';
      // 3 screws
      var screws = [['phillips', 230, 315], ['flat', 262, 315], ['star', 246, 352]];
      screws.forEach(function (sc) {
        var kind = sc[0], sx = sc[1], sy = sc[2];
        var sw = kind === 'star' ? 2.4 : 3;
        var slotPaths = kind === 'phillips'
          ? '<path d="M-7 0 h14 M0 -7 v14"/>'
          : kind === 'flat' ? '<path d="M-8 0 h16"/>'
          : '<path d="M0 -8 v16 M-7 -4 l14 8 M7 -4 l-14 8"/>';
        s += '<g data-hot="screw-' + kind + '">' + haloRect(sx - 20, sy - 20, 40, 40, 20) +
          '<circle cx="' + sx + '" cy="' + sy + '" r="15" fill="#9fb2c5" stroke="#5a6b7d" stroke-width="2"/>' +
          '<g transform="translate(' + sx + ',' + sy + ')" stroke="#222" stroke-width="' + sw + '" fill="none">' +
          slotPaths + '</g></g>';
      });
      // screwdrivers to collect
      s += '<g data-hot="drivers">' + haloRect(120, 366, 110, 44, 10) +
        '<g><rect x="126" y="376" width="30" height="10" rx="5" fill="#c0392b"/><rect x="126" y="392" width="30" height="10" rx="5" fill="#3f7a3f"/><rect x="166" y="376" width="30" height="10" rx="5" fill="#e8b34b"/>' +
        '<text x="175" y="368" text-anchor="middle" font-size="10" fill="#f5f1e8" opacity="0.75">drivers</text></g></g>';
      s += '<g id="tb-panel" opacity="0.25"><rect x="216" y="386" width="64" height="24" rx="6" fill="#1c232b"/></g>';
    }
    if (state === 4) {
      s += '<rect x="110" y="290" width="180" height="130" rx="10" fill="#222b33" stroke="#1c232b" stroke-width="2"/>';
      s += '<g data-hot="latchkey">' + haloRect(160, 320, 80, 60, 12) +
        '<g transform="translate(200,350)"><circle r="8" fill="none" stroke="#c9a7f5" stroke-width="5"/>' +
        '<rect x="-3" y="7" width="6" height="24" rx="3" fill="#c9a7f5"/>' +
        '<rect x="-3" y="20" width="11" height="5" rx="2" fill="#c9a7f5"/></g>' +
        '<ellipse cx="200" cy="350" rx="42" ry="30" fill="none" stroke="#c9a7f5" opacity="0.5" class="pulse"/></g>';
      s += '<g data-hot="mainlatch">' + haloRect(120, 250, 160, 50, 10) +
        '<rect x="130" y="322" width="26" height="34" rx="5" fill="url(#steelD)" stroke="#e8b34b" stroke-width="2"/>' +
        '<text x="200" y="248" text-anchor="middle" font-size="11" fill="#f5f1e8" opacity="0.75">the main latch</text></g>';
    }
    return '<svg viewBox="0 0 400 620" preserveAspectRatio="xMidYMid slice">' + s + '</svg>';
  }

  function toolboxThumb() {
    return '<svg viewBox="0 0 80 80"><rect x="12" y="32" width="56" height="30" rx="6" fill="#5a6b7d"/>' +
      '<rect x="30" y="24" width="20" height="10" rx="5" fill="#2c3640"/>' +
      '<rect x="20" y="38" width="10" height="14" rx="3" fill="#3d4a58"/></svg>';
  }

  function toolboxRoom(V) {
    function flashFixed() { return toolboxArt(1, V, true); }
    var steps = [
      {
        id: 'batteries', kind: 'combine', name: 'Dead Flashlight',
        hints: ['The flashlight is dead. Toolboxes have side pockets for a reason.', 'Tap the side pocket — something rattles in there.', 'Tap the SIDE POCKET for batteries, then use them on the flashlight.'],
        scene: function () { return toolboxArt(0, V); },
        setup: function (api) {
          var got = false;
          api.hot('pocket', function () {
            if (got) return; got = true; Sfx.pickup();
            api.collect({ id: 'batteries', name: 'Batteries', icon: '🔋' });
            api.say('AA batteries. The flashlight might live again.');
          });
          api.use('batteries', 'flashlight', function () {
            Sfx.place();
            api.take('batteries');
            api.collect({ id: 'flashlight', name: 'Flashlight', icon: '🔦' });
            api.say('Fresh batteries. It flickers on!');
            setTimeout(function () { api.next(); }, 700);
          });
          api.hot('flashlight', function () {
            if (!api.has('batteries')) { api.say('Dead. It needs batteries.'); Sfx.soft(); }
          });
        }
      },
      {
        id: 'uv', kind: 'reveal', name: 'Under the Tray',
        hints: ['Tap the flashlight to switch it on, then lift the tray.', 'Something is written under the tray — but only light will show it.', 'Tap the FLASHLIGHT, then the TRAY, then the glowing spot underneath.'],
        scene: function () { return flashFixed(); },
        setup: function (api) {
          var on = false, lifted = false;
          api.hot('flashlight2', function () {
            on = !on; Sfx.tap();
            var b = document.querySelector('#tb-beam');
            if (b) b.setAttribute('opacity', on ? '1' : '0');
            api.say(on ? 'Click. Let there be light.' : 'Click. Dark again.');
          });
          api.hot('tray', function () {
            if (lifted) return; lifted = true; Sfx.flip();
            var trayEl = document.querySelector('[data-hot="tray"]');
            if (trayEl) {
              trayEl.style.transition = 'transform .7s cubic-bezier(.34,1.56,.64,1), opacity .6s';
              trayEl.style.transform = 'translateY(-46px)';
              trayEl.style.opacity = '0.2';
            }
            api.say('The tray lifts out. Shine the light underneath…');
          });
          api.hot('uvcode', function () {
            if (!on) { api.say('Too dark to see. The flashlight might help.'); Sfx.soft(); return; }
            if (!lifted) { api.say('Lift the tray first.'); return; }
            Sfx.chime();
            api.show('#tb-uv');
            api.say('Glowing digits: ' + V.code.join('–') + '. Written in UV ink!');
            setTimeout(function () { api.next(); }, 1400);
          });
        }
      },
      {
        id: 'padlock', kind: 'code', name: 'The Inner Drawer',
        hints: ['A 4-digit padlock. Those glowing digits were a code…', 'The UV writing under the tray: ' + V.code.join('') + '.', 'Tap the padlock and enter ' + V.code.join('–') + '.'],
        scene: function () { return toolboxArt(2, V); },
        setup: function (api) {
          api.hot('padlock', function () {
            Sfx.tap();
            api.code({
              digits: 4, answer: V.code, title: 'Padlock', sub: 'Tap each wheel to turn it.',
              onSolve: function () {
                Sfx.unlock(); api.say('The drawer slides open…');
                setTimeout(function () { api.next(); }, 800);
              }
            });
          });
        }
      },
      {
        id: 'screws', kind: 'choice', name: 'Only the Star',
        hints: ['The note says only the star keeps it together.', 'Grab the screwdrivers, pick the star one.', 'Tap the DRIVERS, select the ⭐ driver, then tap the STAR screw.'],
        scene: function () { return toolboxArt(3, V); },
        setup: function (api) {
          var got = false;
          api.hot('drivers', function () {
            if (got) return; got = true; Sfx.pickup();
            api.collect({ id: 'drv-phillips', name: 'Phillips', icon: '🪛' });
            api.collect({ id: 'drv-flat', name: 'Flathead', icon: '🔧' });
            api.collect({ id: 'drv-star', name: 'Star', icon: '⭐' });
            api.say('Three drivers. The note knows which one.');
          });
          ['phillips', 'flat'].forEach(function (k) {
            api.use('drv-' + k, 'screw-' + k, function () {
              Sfx.soft();
              var el = document.querySelector('[data-hot="screw-' + k + '"]');
              if (el) { el.classList.add('shake'); setTimeout(function () { el.classList.remove('shake'); }, 450); }
              api.say('Wrong head — it just spins. The note said "only the star".');
            });
          });
          api.use('drv-star', 'screw-star', function () {
            Sfx.unlock();
            var p = document.querySelector('#tb-panel');
            if (p) p.setAttribute('opacity', '0');
            api.say('The star screw turns… a hidden panel!');
            setTimeout(function () { api.next(); }, 900);
          });
          ['phillips', 'flat', 'star'].forEach(function (k) {
            api.hot('screw-' + k, function () {
              if (!api.has('drv-star')) { api.say('Screwed tight. You\u2019ll need a driver.'); Sfx.soft(); }
              else api.say('Pick the right driver first — tap it in your tray.');
            });
          });
        }
      },
      {
        id: 'finale', kind: 'use', name: 'Unfold',
        hints: [''],
        scene: function () { return toolboxArt(4, V); },
        setup: function (api) {
          var got = false;
          api.hot('latchkey', function () {
            if (got) return; got = true; Sfx.pickup();
            api.collect({ id: 'latch-key', name: 'Latch key', icon: '🗝️' });
            api.say('The key to the whole box.');
          });
          api.use('latch-key', 'mainlatch', function () { api.done(); });
          api.hot('mainlatch', function () { api.say('Locked. The hidden panel had a key…'); Sfx.soft(); });
        }
      }
    ];
    return {
      id: 'toolbox', title: 'The Toolbox', sub: 'A steel toolbox on a workbench',
      theme: { spot: 'rgba(120,160,200,.20)', accent: '#7fb2d9' },
      vars: V, steps: steps,
      diorama: {
        title: 'WORKSHOP, UNFOLDED',
        svg: '<svg viewBox="0 0 400 340">' +
          '<defs>' +
          '<linearGradient id="wallG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3d3542"/><stop offset="1" stop-color="#241f28"/></linearGradient>' +
          '<linearGradient id="woodG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7a5f45"/><stop offset="1" stop-color="#4a3826"/></linearGradient>' +
          '<linearGradient id="coneG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe9a8" stop-opacity="0.5"/><stop offset="1" stop-color="#ffe9a8" stop-opacity="0"/></linearGradient>' +
          '<pattern id="pegH" width="17" height="17" patternUnits="userSpaceOnUse"><circle cx="8.5" cy="8.5" r="2.2" fill="#241a12"/></pattern>' +
          '</defs>' +
          '<g class="d-layer"><rect x="0" y="0" width="400" height="340" fill="url(#wallG)"/>' +
          '<rect x="36" y="36" width="182" height="132" rx="8" fill="#4a3b2c" stroke="#2e2318" stroke-width="2.5"/>' +
          '<rect x="36" y="36" width="182" height="132" rx="8" fill="url(#pegH)"/>' +
          '<g fill="#241a12" opacity="0.9">' +
          '<rect x="58" y="56" width="10" height="52" rx="4" transform="rotate(18 63 82)"/><rect x="48" y="50" width="30" height="14" rx="4" transform="rotate(18 63 57)"/>' +
          '<path d="M108,52 L150,96 L142,104 L100,60 Z"/><circle cx="98" cy="56" r="9"/>' +
          '<rect x="168" y="58" width="9" height="56" rx="4"/><path d="M168,114 l4.5,12 l4.5,-12 z"/>' +
          '<rect x="66" y="118" width="52" height="10" rx="5"/><circle cx="126" cy="123" r="8" fill="none" stroke="#241a12" stroke-width="5"/></g></g>' +
          '<g class="d-layer"><g class="sway"><line x1="300" y1="0" x2="300" y2="42" stroke="#111" stroke-width="5"/>' +
          '<path d="M282,42 L318,42 L334,76 L266,76 Z" fill="#2c2c32" stroke="#111" stroke-width="2"/>' +
          '<polygon points="288,80 312,80 362,244 238,244" fill="url(#coneG)"/>' +
          '<circle cx="300" cy="82" r="10" fill="#ffd76a" class="flicker"/>' +
          '<circle cx="300" cy="82" r="17" fill="#ffd76a" opacity="0.25" class="flicker"/></g></g>' +
          '<g class="d-layer"><rect x="28" y="242" width="344" height="24" rx="5" fill="url(#woodG)" stroke="#2e2318" stroke-width="2"/>' +
          '<rect x="28" y="266" width="344" height="54" fill="#3a2c1e"/>' +
          '<rect x="28" y="266" width="344" height="5" fill="#fff" opacity="0.05"/>' +
          '<g><rect x="66" y="216" width="56" height="26" rx="4" fill="#5a6b7d" stroke="#232c34" stroke-width="2"/>' +
          '<rect x="60" y="200" width="14" height="24" rx="3" fill="#7d8ea3" stroke="#232c34" stroke-width="2"/>' +
          '<rect x="114" y="200" width="14" height="24" rx="3" fill="#7d8ea3" stroke="#232c34" stroke-width="2"/>' +
          '<line x1="60" y1="212" x2="30" y2="212" stroke="#9fb2c5" stroke-width="5" stroke-linecap="round"/>' +
          '<circle cx="28" cy="212" r="6" fill="#5a6b7d" stroke="#232c34" stroke-width="2"/></g></g>' +
          '<g class="d-layer"><rect x="196" y="206" width="148" height="62" rx="9" fill="#7d8ea3" stroke="#232c34" stroke-width="2.5"/>' +
          '<rect x="196" y="268" width="148" height="66" rx="11" fill="#5a6b7d" stroke="#232c34" stroke-width="2.5"/>' +
          '<rect x="208" y="280" width="124" height="7" rx="3.5" fill="#fff" opacity="0.16"/>' +
          '<rect x="236" y="150" width="11" height="60" rx="5" fill="#8a5a34" transform="rotate(12 241 180)"/>' +
          '<rect x="230" y="140" width="26" height="16" rx="5" fill="#5a6b7d" stroke="#232c34" stroke-width="2" transform="rotate(12 243 148)"/>' +
          '<rect x="282" y="158" width="10" height="52" rx="5" fill="#9fb2c5" transform="rotate(-10 287 184)"/>' +
          '<circle cx="289" cy="156" r="9" fill="none" stroke="#9fb2c5" stroke-width="6" transform="rotate(-10 289 156)"/>' +
          '<rect x="312" y="164" width="9" height="46" rx="4.5" fill="#c0392b" transform="rotate(6 316 187)"/></g>' +
          '<g class="d-layer"><g stroke="#c9a86a" stroke-width="2.5" fill="none" stroke-linecap="round">' +
          '<path d="M150,300 q10,-8 20,0 q-10,8 -20,0"/><path d="M170,312 q8,-6 16,0 q-8,6 -16,0"/></g>' +
          '<g stroke="#8a97a5" stroke-width="2.5" stroke-linecap="round">' +
          '<line x1="120" y1="306" x2="132" y2="306"/><line x1="352" y1="300" x2="364" y2="300"/><line x1="340" y1="316" x2="352" y2="316"/></g>' +
          '<g fill="#ffe9a8" opacity="0.75">' +
          '<circle cx="278" cy="150" r="2.4" class="floaty"/><circle cx="322" cy="190" r="2" class="floaty" style="animation-delay:-1.4s"/>' +
          '<circle cx="296" cy="220" r="2.6" class="floaty" style="animation-delay:-2.6s"/></g></g>' +
          '</svg>'
      }
    };
  }

  /* ================================================================
     ROOM 3 — THE MUSIC BOX
  ================================================================ */
  var MUSICBOX_DEFAULT = { melody: [0, 2, 4, 3], word: 'STAR' };

  function musicboxArt(state, V) {
    var word = V.word;
    var s = '<defs>' +
      '<linearGradient id="woodD" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#5a3d28"/><stop offset="1" stop-color="#2e1d12"/></linearGradient>' +
      '<linearGradient id="gold" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#f6d47c"/><stop offset="1" stop-color="#b98a2e"/></linearGradient>' +
      '<linearGradient id="velvet" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#4a3670"/><stop offset="1" stop-color="#241a3d"/></linearGradient>' +
      '</defs>';
    // velvet drape
    s += '<rect x="0" y="400" width="400" height="220" fill="url(#velvet)"/>' +
      '<path d="M0 400 Q100 430 200 405 Q300 385 400 410 L400 620 L0 620 Z" fill="#31234f" opacity="0.7"/>' +
      '<path d="M0 470 Q130 500 260 475 Q340 462 400 480" stroke="#1c1330" stroke-width="14" fill="none" opacity="0.5"/>';
    s += '<ellipse cx="200" cy="470" rx="130" ry="18" fill="#000" opacity="0.4"/>';
    // box body
    s += '<rect x="105" y="300" width="190" height="140" rx="12" fill="url(#woodD)" stroke="url(#gold)" stroke-width="3"/>' +
      '<rect x="117" y="312" width="166" height="8" rx="4" fill="#fff" opacity="0.08"/>' +
      '<rect x="105" y="300" width="190" height="44" rx="12" fill="#3d2817" stroke="url(#gold)" stroke-width="2"/>';
    // gold corner trim
    [[105, 300], [295, 300], [105, 440], [295, 440]].forEach(function (p) {
      s += '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="6" fill="url(#gold)"/>';
    });

    if (state === 0) {
      // keyhole
      s += '<g><circle cx="200" cy="392" r="10" fill="#120c08" stroke="url(#gold)" stroke-width="3"/>' +
        '<rect x="196" y="392" width="8" height="16" rx="3" fill="#120c08"/></g>';
      // velvet lining hotspot (edge of drape near box)
      s += '<g data-hot="velvet">' + haloRect(96, 420, 208, 60, 16) +
        '<rect x="96" y="420" width="208" height="60" fill="#fff" opacity="0"/>' +
        '<text x="200" y="412" text-anchor="middle" font-size="11" fill="#f5f1e8" opacity="0.7">the velvet looks… lumpy</text></g>';
      s += '<g id="mb-keyhide" opacity="0"><g data-hot="windkey">' + haloRect(160, 428, 80, 40, 12) +
        '<g transform="translate(200,448)"><circle r="9" fill="none" stroke="url(#gold)" stroke-width="6"/>' +
        '<rect x="-3" y="8" width="6" height="24" rx="3" fill="url(#gold)"/>' +
        '<rect x="-3" y="24" width="12" height="5" rx="2" fill="url(#gold)"/></g>' +
        '<ellipse cx="200" cy="448" rx="42" ry="24" fill="none" stroke="#f6d47c" opacity="0.5" class="pulse"/></g></g>';
      s += '<g data-hot="keyhole">' + haloRect(180, 372, 40, 52, 12) +
        '<rect x="180" y="372" width="40" height="52" fill="#fff" opacity="0"/></g>';
    }
    if (state >= 1) {
      // lid ajar
      s += '<g transform="translate(200,300) rotate(-14) translate(-200,-300)" opacity="0.95">' +
        '<rect x="105" y="252" width="190" height="44" rx="12" fill="#3d2817" stroke="url(#gold)" stroke-width="2"/></g>';
    }
    if (state === 1 || state === 2) {
      // xylophone — pulled out, standing on the velvet in front of the box
      s += '<g id="mb-xylo">';
      for (var i = 0; i < 5; i++) {
        var h = 92 - i * 12, bx = 93 + i * 43, by = 566 - h;
        s += '<g data-hot="xylo-' + i + '">' + haloRect(bx - 5, by - 8, 44, h + 18, 10) +
          '<rect id="xyb-' + i + '" x="' + bx + '" y="' + by + '" width="34" height="' + h + '" rx="8" fill="' + XYLO_COLORS[i] + '" stroke="#00000055" stroke-width="1.5"/>' +
          '<circle cx="' + (bx + 17) + '" cy="' + (by + 9) + '" r="3.5" fill="#fff" opacity="0.5"/></g>';
      }
      s += '</g>';
      s += '<g data-hot="replay">' + haloRect(155, 576, 90, 36, 18) +
        '<rect x="155" y="576" width="90" height="36" rx="18" fill="#ffffff14" stroke="#ffffff30"/>' +
        '<text x="200" y="599" text-anchor="middle" font-size="14" fill="#f5f1e8">⟳ replay</text></g>';
      // melody dots (show progress) — on the box face
      s += '<g id="mb-dots">' + [0, 1, 2, 3].map(function (i) {
        return '<circle id="mdot-' + i + '" cx="' + (168 + i * 22) + '" cy="352" r="8" fill="#ffffff18" stroke="#ffffff40"/>';
      }).join('') + '</g>';
    }
    if (state === 3) {
      // drawer open with wheels + verse plaque
      s += '<rect x="130" y="380" width="140" height="70" rx="10" fill="#241a10" stroke="url(#gold)" stroke-width="2"/>';
      s += '<g data-hot="wheels">' + haloRect(140, 388, 120, 54, 10);
      for (var w = 0; w < 4; w++) {
        s += '<rect x="' + (148 + w * 30) + '" y="394" width="24" height="40" rx="6" fill="#100d10" stroke="#8a7648"/>' +
          '<text x="' + (160 + w * 30) + '" y="421" text-anchor="middle" font-size="20" font-weight="700" fill="#f6d47c">A</text>';
      }
      s += '</g>';
      s += '<g data-hot="verse">' + haloRect(120, 470, 160, 60, 12) +
        '<rect x="120" y="470" width="160" height="60" rx="10" fill="#f2e8d0" opacity="0.92"/>' +
        '<text x="200" y="494" text-anchor="middle" font-size="12" fill="#4a3b28" font-style="italic">an engraved verse…</text>' +
        '<text x="200" y="512" text-anchor="middle" font-size="11" fill="#4a3b28">tap to read</text></g>';
    }
    if (state === 4) {
      // dancer on base, heart lock
      s += '<ellipse cx="200" cy="420" rx="60" ry="12" fill="url(#gold)" opacity="0.85"/>';
      s += '<g data-hot="dancer" id="mb-dancer">' + haloRect(160, 280, 80, 140, 20) +
        '<g transform="translate(200,350)">' +
        '<path d="M0 -58 c8 -6 14 2 8 10 l-6 18 14 26 -6 4 -12 -24 -12 24 -6 -4 14 -26 z" fill="#f2e8f2"/>' +
        '<circle cx="0" cy="-66" r="9" fill="#f2d8c8"/>' +
        '<path d="M-14 -30 Q0 -44 14 -30 L10 -8 Q0 -16 -10 -8 Z" fill="#e88bb0" opacity="0.9"/></g></g>';
      s += '<g id="mb-heartkey" opacity="0"><g data-hot="heartkey">' + haloRect(170, 400, 60, 40, 12) +
        '<g transform="translate(200,420) scale(0.9)"><path d="M0 8 C-14 -4 -8 -18 0 -10 C8 -18 14 -4 0 8" fill="none" stroke="#e88bb0" stroke-width="6"/>' +
        '<rect x="-3" y="6" width="6" height="22" rx="3" fill="#e88bb0"/></g></g></g>';
      s += '<g data-hot="heartlock">' + haloRect(120, 470, 160, 60, 12) +
        '<rect x="150" y="478" width="100" height="44" rx="12" fill="#ffffff10" stroke="#e88bb0" stroke-width="2"/>' +
        '<path d="M200 488 c-8 -7 -5 -14 0 -10 c5 -4 8 3 0 10" fill="none" stroke="#e88bb0" stroke-width="3"/>' +
        '<text x="200" y="562" text-anchor="middle" font-size="11" fill="#f5f1e8" opacity="0.7">a heart-shaped lock</text></g>';
    }
    return '<svg viewBox="0 0 400 620" preserveAspectRatio="xMidYMid slice">' + s + '</svg>';
  }

  function musicboxThumb() {
    return '<svg viewBox="0 0 80 80"><rect x="16" y="34" width="48" height="28" rx="6" fill="#5a3d28" stroke="#e8b34b" stroke-width="2"/>' +
      '<rect x="16" y="28" width="48" height="12" rx="6" fill="#3d2817" stroke="#e8b34b" stroke-width="2"/>' +
      '<circle cx="40" cy="48" r="5" fill="#e8b34b"/></svg>';
  }

  function musicboxRoom(V) {
    var mel = V.melody, word = V.word;
    var steps = [
      {
        id: 'velvet', kind: 'find', name: 'The Lumpy Velvet',
        hints: ['Something is hidden in the velvet drape.', 'Tap the velvet near the box — it lifts.', 'Tap the VELVET, then take the winding key.'],
        scene: function () { return musicboxArt(0, V); },
        setup: function (api) {
          var lifted = false, got = false;
          api.hot('velvet', function () {
            if (lifted) return; lifted = true; Sfx.flip();
            api.show('#mb-keyhide');
            api.say('A false bottom… with a winding key!');
          });
          api.hot('windkey', function () {
            if (!lifted || got) return; got = true; Sfx.pickup();
            api.collect({ id: 'wind-key', name: 'Winding key', icon: '🗝️' });
            api.hide('#mb-keyhide');
            api.say('It wants the keyhole.');
          });
          api.use('wind-key', 'keyhole', function () {
            Sfx.unlock();
            api.say('The box shivers awake…');
            setTimeout(function () { api.next(); }, 700);
          });
          api.hot('keyhole', function () {
            if (!api.has('wind-key')) { api.say('A tiny keyhole. The key is hiding nearby.'); Sfx.soft(); }
          });
        }
      },
      {
        id: 'melody', kind: 'pattern', name: 'The Waking Melody',
        hints: [''],
        scene: function () { return musicboxArt(1, V); },
        setup: function (api) {
          // auto-play the melody once, lighting the dots
          var played = false;
          function play() {
            if (played) return; played = true;
            mel.forEach(function (n, i) {
              setTimeout(function () {
                Sfx.note(n);
                var d = document.querySelector('#mdot-' + i);
                if (d) { d.setAttribute('fill', XYLO_COLORS[n]); }
              }, 600 + i * 450);
            });
            setTimeout(function () { api.next(); }, 600 + mel.length * 450 + 600);
          }
          setTimeout(play, 700);
          api.hot('replay', function () { played = false; play(); });
        }
      },
      {
        id: 'xylo', kind: 'pattern', name: 'Play It Back',
        hints: ['Tap the colored bars in the same order you heard.', 'Listen again with ⟳ replay if you need it.', 'The order was: ' + mel.map(function (n) { return NOTE_NAMES[n]; }).join(' – ') + '.'],
        scene: function () { return musicboxArt(2, V); },
        setup: function (api) {
          var pos = 0;
          function reset(msg) {
            pos = 0;
            for (var i = 0; i < 4; i++) { var d = document.querySelector('#mdot-' + i); if (d) d.setAttribute('fill', '#ffffff18'); }
            if (msg) { api.say(msg); Sfx.soft(); }
          }
          for (var i = 0; i < 5; i++) (function (n) {
            api.hot('xylo-' + n, function () {
              Sfx.xylo(n);
              var bar = document.querySelector('#xyb-' + n);
              if (bar) { bar.style.transform = 'scaleY(0.92)'; setTimeout(function () { bar.style.transform = ''; }, 160); }
              if (n === mel[pos]) {
                var d = document.querySelector('#mdot-' + pos);
                if (d) d.setAttribute('fill', XYLO_COLORS[n]);
                pos++;
                if (pos === mel.length) {
                  Sfx.chime();
                  api.say('The drawer sighs open…');
                  setTimeout(function () { api.next(); }, 900);
                }
              } else reset('Not quite — listen once more.');
            });
          })(i);
          api.hot('replay', function () {
            Sfx.melody(mel);
            api.say('Listen…');
          });
        }
      },
      {
        id: 'cipher', kind: 'cipher', name: 'The Engraved Verse',
        hints: ['The first letters of each line spell the word.', 'Read the verse: ' + word.split('').join('-') + '…', 'Tap the wheels and set them to ' + word + '.'],
        scene: function () { return musicboxArt(3, V); },
        setup: function (api) {
          api.hot('verse', function () {
            Sfx.tap();
            api.verse(WORDS[word], 'Engraved inside the lid');
          });
          api.hot('wheels', function () {
            Sfx.tap();
            api.letters({
              count: word.length, answer: word, title: 'Letter wheels', sub: 'Tap each wheel to turn it.',
              onSolve: function () {
                Sfx.unlock(); api.say('The dancer\u2019s base clicks free.');
                setTimeout(function () { api.next(); }, 800);
              }
            });
          });
        }
      },
      {
        id: 'finale', kind: 'use', name: 'Unfold',
        hints: [''],
        scene: function () { return musicboxArt(4, V); },
        setup: function (api) {
          var lifted = false, got = false;
          api.hot('dancer', function () {
            if (lifted) return; lifted = true; Sfx.flip();
            var d = document.querySelector('#mb-dancer');
            if (d) d.style.transform = 'translateY(-46px)';
            api.show('#mb-heartkey');
            api.say('Under the dancer — a heart-shaped key.');
          });
          api.hot('heartkey', function () {
            if (!lifted || got) return; got = true; Sfx.pickup();
            api.collect({ id: 'heart-key', name: 'Heart key', icon: '💝' });
            api.hide('#mb-heartkey');
            api.say('For the heart-shaped lock.');
          });
          api.use('heart-key', 'heartlock', function () { api.done(); });
          api.hot('heartlock', function () { api.say('Locked with love. The dancer hides the key.'); Sfx.soft(); });
        }
      }
    ];
    return {
      id: 'musicbox', title: 'The Music Box', sub: 'An antique box in moonlight',
      theme: { spot: 'rgba(150,170,230,.20)', accent: '#9a7fe0' },
      vars: V, steps: steps,
      diorama: {
        title: 'BALLROOM, UNFOLDED',
        svg: '<svg viewBox="0 0 400 340">' +
          '<defs>' +
          '<linearGradient id="floorG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5a4028"/><stop offset="1" stop-color="#241a12"/></linearGradient>' +
          '<linearGradient id="beamC" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#cfe0ff" stop-opacity="0.4"/><stop offset="1" stop-color="#cfe0ff" stop-opacity="0"/></linearGradient>' +
          '</defs>' +
          '<g class="d-layer"><rect x="0" y="0" width="400" height="340" fill="#12101e"/>' +
          '<circle cx="312" cy="56" r="28" fill="#e8ecff"/><circle cx="312" cy="56" r="44" fill="#e8ecff" opacity="0.22"/>' +
          '<circle cx="303" cy="48" r="5" fill="#d4d9f2" opacity="0.7"/><circle cx="320" cy="64" r="3.5" fill="#d4d9f2" opacity="0.7"/>' +
          '<g fill="#fff"><circle cx="80" cy="46" r="2.5" class="twinkle"/><circle cx="150" cy="86" r="2" class="twinkle" style="animation-delay:-1s"/>' +
          '<circle cx="228" cy="38" r="2.5" class="twinkle" style="animation-delay:-2s"/><circle cx="60" cy="140" r="2" class="twinkle" style="animation-delay:-.5s"/>' +
          '<circle cx="190" cy="120" r="1.8" class="twinkle" style="animation-delay:-1.6s"/><circle cx="260" cy="150" r="2.2" class="twinkle" style="animation-delay:-2.4s"/></g></g>' +
          '<g class="d-layer"><path d="M56,252 L56,128 A42,42 0 0 1 140,128 L140,252 Z" fill="#1d1a2e" stroke="#4a4066" stroke-width="3"/>' +
          '<path d="M98,86 L98,252" stroke="#4a4066" stroke-width="2.5"/>' +
          '<polygon points="66,140 130,140 172,272 34,272" fill="url(#beamC)"/>' +
          '<path d="M260,252 L260,128 A42,42 0 0 1 344,128 L344,252 Z" fill="#1d1a2e" stroke="#4a4066" stroke-width="3"/>' +
          '<path d="M302,86 L302,252" stroke="#4a4066" stroke-width="2.5"/>' +
          '<polygon points="270,140 334,140 366,272 238,272" fill="url(#beamC)" opacity="0.7"/></g>' +
          '<g class="d-layer"><g class="sway"><line x1="200" y1="0" x2="200" y2="46" stroke="#8a6f2e" stroke-width="4"/>' +
          '<circle cx="200" cy="60" r="46" fill="#f6d47c" opacity="0.12"/>' +
          '<ellipse cx="200" cy="72" rx="36" ry="11" fill="none" stroke="#b98a2e" stroke-width="5"/>' +
          '<g fill="#ffe9a8"><rect x="168" y="52" width="7" height="14" rx="3"/><rect x="186" y="58" width="7" height="14" rx="3"/>' +
          '<rect x="207" y="58" width="7" height="14" rx="3"/><rect x="225" y="52" width="7" height="14" rx="3"/></g>' +
          '<g fill="#ffb347" class="flicker"><path d="M171.5,52 c-3,-5 3,-9 0,-13 c3,4 -3,8 0,13"/>' +
          '<path d="M189.5,58 c-3,-5 3,-9 0,-13 c3,4 -3,8 0,13"/>' +
          '<path d="M210.5,58 c-3,-5 3,-9 0,-13 c3,4 -3,8 0,13"/>' +
          '<path d="M228.5,52 c-3,-5 3,-9 0,-13 c3,4 -3,8 0,13"/></g>' +
          '<g fill="#cfe8ff" opacity="0.85"><path d="M200,86 l6,9 -6,9 -6,-9 z"/><path d="M176,84 l5,7 -5,7 -5,-7 z"/><path d="M224,84 l5,7 -5,7 -5,-7 z"/></g></g></g>' +
          '<g class="d-layer"><rect x="40" y="252" width="320" height="72" rx="8" fill="url(#floorG)"/>' +
          '<polygon points="40,252 200,252 120,324 40,324" fill="#fff" opacity="0.06"/>' +
          '<polygon points="360,252 280,252 340,324 360,324" fill="#cfe0ff" opacity="0.05"/>' +
          '<ellipse cx="200" cy="292" rx="30" ry="7" fill="#f2d8c8" opacity="0.22"/>' +
          '<ellipse cx="200" cy="292" rx="44" ry="10" fill="#e8b34b" opacity="0.12"/></g>' +
          '<g class="d-layer"><g transform="translate(200,196)"><g class="twirl">' +
          '<path d="M0,-34 C22,-14 32,8 36,32 C16,42 -16,42 -36,32 C-32,8 -22,-14 0,-34 Z" fill="#f2e8f2"/>' +
          '<path d="M0,-34 C12,-20 18,-6 20,8" stroke="#d8c8dc" stroke-width="2" fill="none"/>' +
          '<path d="M0,-34 C-12,-20 -18,-6 -20,8" stroke="#d8c8dc" stroke-width="2" fill="none"/>' +
          '<path d="M-4,-32 C-14,-28 -22,-22 -28,-14" stroke="#f2d8c8" stroke-width="6" stroke-linecap="round" fill="none"/>' +
          '<path d="M4,-32 C14,-28 22,-22 28,-14" stroke="#f2d8c8" stroke-width="6" stroke-linecap="round" fill="none"/>' +
          '<rect x="-7" y="-52" width="14" height="22" rx="7" fill="#e8b8d0"/>' +
          '<circle cx="0" cy="-60" r="9" fill="#f2d8c8"/><circle cx="0" cy="-63" r="4.5" fill="#8a5a44"/></g>' +
          '<ellipse cx="0" cy="56" rx="36" ry="8" fill="#e8b34b" opacity="0.35"/></g>' +
          '<text x="118" y="150" font-size="22" fill="#9a7fe0" class="rise">♪</text>' +
          '<text x="272" y="180" font-size="18" fill="#57c7b2" class="rise" style="animation-delay:-1.7s">♫</text>' +
          '<text x="182" y="120" font-size="16" fill="#e8b34b" class="rise" style="animation-delay:-3.2s">♪</text></g>' +
          '</svg>'
      }
    };
  }

  /* ============ daily ============ */
  function dailyVars(dateStr) {
    var rng = mulberry32(hashStr('unfold-daily-' + dateStr));
    var pick = Math.floor(rng() * 3);
    function digits(n) { var d = []; for (var i = 0; i < n; i++) d.push(Math.floor(rng() * 10)); return d; }
    function melody() { var m = []; for (var i = 0; i < 4; i++) m.push(Math.floor(rng() * 5)); return m; }
    if (pick === 0) return { template: 'lunchbox', V: { code: digits(3) } };
    if (pick === 1) return { template: 'toolbox', V: { code: digits(4) } };
    return { template: 'musicbox', V: { melody: melody(), word: WORDLIST[Math.floor(rng() * WORDLIST.length)] } };
  }

  var BUILDERS = { lunchbox: lunchboxRoom, toolbox: toolboxRoom, musicbox: musicboxRoom };
  var META = {
    lunchbox: { title: 'The Lunchbox', sub: 'A red lunchbox on a kitchen table', thumb: lunchboxThumb },
    toolbox: { title: 'The Toolbox', sub: 'A steel toolbox on a workbench', thumb: toolboxThumb },
    musicbox: { title: 'The Music Box', sub: 'An antique box in moonlight', thumb: musicboxThumb }
  };
  var DEFAULTS = { lunchbox: LUNCHBOX_DEFAULT, toolbox: TOOLBOX_DEFAULT, musicbox: MUSICBOX_DEFAULT };

  window.Rooms = {
    all: Object.keys(META).map(function (id) {
      return { id: id, title: META[id].title, sub: META[id].sub, thumb: META[id].thumb };
    }),
    get: function (id) {
      var def = BUILDERS[id](JSON.parse(JSON.stringify(DEFAULTS[id])));
      def.meta = META[id];
      return def;
    },
    daily: function (dateStr) {
      var dv = dailyVars(dateStr);
      var def = BUILDERS[dv.template](dv.V);
      def.meta = META[dv.template];
      def.isDaily = true;
      def.dailyLabel = dateStr;
      return def;
    },
    /* Build a room def from an AI skin (see unfold-roomwright worker).
     * The skin picks one of the 3 renderable templates; we reuse that
     * template's art + puzzle logic and inject the AI's story skin:
     * title/premise, codes/word/melody, and per-step clues + hint tiers.
     * Returns null on anything unexpected — caller falls back to seeded. */
    buildFromSkin: function (skin) {
      try {
        if (!skin || !BUILDERS[skin.template] || !skin.skinId) return null;
        var tpl = skin.template;
        var V = JSON.parse(JSON.stringify(DEFAULTS[tpl]));
        if (tpl === 'lunchbox' || tpl === 'toolbox') {
          var need = tpl === 'lunchbox' ? 3 : 4;
          if (!Array.isArray(skin.code) || skin.code.length !== need) return null;
          V.code = skin.code.slice();
        } else if (tpl === 'musicbox') {
          if (typeof skin.word === 'string' && /^[A-Z]{3,6}$/.test(skin.word) &&
              Array.isArray(skin.verse) && skin.verse.length === skin.word.length &&
              skin.verse.every(function (l, i) {
                return typeof l === 'string' && l.trim() &&
                  l.trim().charAt(0).toUpperCase() === skin.word.charAt(i);
              })) {
            V.word = skin.word;
            WORDS[V.word] = skin.verse.slice(); // AI verse for the engraved-verse modal
          }
          if (Array.isArray(skin.melody) && skin.melody.length === 4 &&
              skin.melody.every(function (n) { return Number.isInteger(n) && n >= 0 && n <= 4; })) {
            V.melody = skin.melody.slice();
          }
        }
        var def = BUILDERS[tpl](V);
        def.id = 'ai-' + String(skin.skinId).replace(/[^a-zA-Z0-9-]/g, '').slice(0, 40);
        def.title = String(skin.title || META[tpl].title).slice(0, 60);
        def.sub = String(skin.premise || META[tpl].sub).slice(0, 140);
        def.meta = META[tpl];
        def.ai = true;
        def.aiSkin = skin;
        if (skin.spot) def.theme = { spot: String(skin.spot).slice(0, 40), accent: def.theme.accent };
        if (Array.isArray(skin.steps)) {
          for (var i = 0; i < def.steps.length && i < skin.steps.length; i++) {
            var ss = skin.steps[i] || {};
            if (Array.isArray(ss.hint) && ss.hint.length === 3 &&
                ss.hint.every(function (h) { return typeof h === 'string' && h.trim().length > 0; })) {
              def.steps[i].hints = ss.hint.map(function (h) { return h.slice(0, 300); });
            }
            if (typeof ss.clue === 'string' && ss.clue.trim()) def.steps[i].intro = ss.clue.slice(0, 200);
            if (typeof ss.title === 'string' && ss.title.trim()) def.steps[i].name = ss.title.slice(0, 60);
            if (typeof ss.kind === 'string' && ss.kind) def.steps[i].kind = ss.kind;
          }
        }
        return def;
      } catch (e) { return null; }
    },
    aiDaily: function (dateStr, skin) {
      var def = window.Rooms.buildFromSkin(skin);
      if (!def) return null;
      def.isDaily = true;
      def.dailyLabel = dateStr;
      return def;
    },
    aiRandom: function (skin) {
      var def = window.Rooms.buildFromSkin(skin);
      if (!def) return null;
      def.isDaily = false;
      return def;
    }
  };
})();
