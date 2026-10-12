/* Night Market — render.js
 * Canvas diorama renderer. Reads state, NEVER mutates.
 * Plain script: var NM = window.NM || {}; NM.render = {...}
 * Design space: 390x844 CSS px, canvas fills container (cover-fit), DPR cap 2.
 * All static art pre-rendered at init/resize. Per frame: drawImage + pooled entities only.
 * No canvas text, no shadowBlur, no per-frame allocations in the hot path.
 * Encounter wanderer: when state.encounters.active is set, a hooded silhouette
 * with a paper lantern drifts the lane between the rows (position derived from
 * sim playTime, so it survives reloads); hitTest returns {kind:'visitor'}
 * within a 68px target, and visitorAnchor() gives its screen position. */
var NM = window.NM || {};
NM.render = (function () {
'use strict';

/* ================= constants ================= */
var R_DW = 390, R_DH = 844;          // design space, CSS px
var R_SS = 2;                        // sprite supersample (x design px)
var R_MAXDPR = 2;
var R_MAXCUST = 24, R_MAXPART = 120, R_MAXSKY = 10;

var C_NIGHT='#05070A', C_INDIGO='#1A2754', C_COBALT='#0A0FA0',
    C_ASPHALT='#262E3D', C_SLATE='#5E707E',
    C_AMBER='#EDD880', C_SHELL='#D8AB4E', C_TEMPLE='#CD7B42', C_TEMPLEHI='#D39D69',
    C_WINDOW='#F5C96B', C_INTERIOR='#EED7B0', C_SIGNRED='#D23226',
    C_PAPERRED='#6E0409', C_PAPERRIM='#93372F',
    C_PINK='#C87AA2', C_PINKCORE='#E14B7E', C_JADE='#489AB2', C_JADEGLOW='#8DBDE1',
    C_GOLD='#B97A2E', C_GOLDLT='#DABB8E', C_OUTLINE='#3A2438', C_WOODD='#5d3a20',
    C_STEAM0='#ECAC73', C_STEAM1='#907045', C_ORANGE='#E8823A';

/* stall visual defs: canopy type + palette + counter goods */
var R_STALLVIS = {
  noodle:   {canopy:'stripes',  c1:'#B97A2E', c2:'#5d3a20', goods:'bowls',    accent:'#D8AB4E', steam:1.4},
  tea:      {canopy:'umbrella', c1:'#D23226', c2:'#93372F', goods:'teapot',   accent:'#D23226', steam:1.0},
  dumpling: {canopy:'stripes',  c1:'#489AB2', c2:'#2a5a6e', goods:'baskets',  accent:'#8DBDE1', steam:1.6},
  skewer:   {canopy:'umbrella', c1:'#1A2754', c2:'#0A0FA0', goods:'skewers',  accent:'#E14B7E', steam:1.2},
  lantern:  {canopy:'sheet',    c1:'#EED7B0', c2:'#D8AB4E', goods:'lanterns', accent:'#EDD880', steam:0},
  tofu:     {canopy:'umbrella', c1:'#489AB2', c2:'#2a6e80', goods:'tofu',     accent:'#489AB2', steam:1.1},
  fan:      {canopy:'stripes',  c1:'#C87AA2', c2:'#7a3a5e', goods:'fans',     accent:'#C87AA2', steam:0},
  pearl:    {canopy:'sheet',    c1:'#dfe9f2', c2:'#8DBDE1', goods:'jars',     accent:'#8DBDE1', steam:0}
};

/* 8 plots: gentle two-row arc. row 0 = back, row 1 = front. */
var R_plots = [
  {id:'noodle',   x:52,  y:620, row:0, sc:0.85},
  {id:'tea',      x:141, y:612, row:0, sc:0.85},
  {id:'dumpling', x:230, y:612, row:0, sc:0.85},
  {id:'skewer',   x:319, y:620, row:0, sc:0.85},
  {id:'lantern',  x:48,  y:730, row:1, sc:1.0},
  {id:'tofu',     x:120, y:722, row:1, sc:1.0},
  {id:'fan',      x:270, y:722, row:1, sc:1.0},
  {id:'pearl',    x:346, y:730, row:1, sc:1.0}
];

/* ================= module state ================= */
var R_canvas=null, R_ctx=null, R_ready=false;
var R_dpr=1, R_cover={s:1, ox:0, oy:0};
var R_SKY=null, R_GRAIN=null;
var R_stallSpr={};            // id -> {cart:{cv,w,h}, truck:{cv,w,h}}
var R_lockedSpr=null;         // {cv,w,h}
var R_tillSpr=null, R_tillGlowSpr=null;
var R_till={x:195, y:672, sc:0.75};
var R_tillRect={x:161, y:622, w:68, h:56};
var R_gong={x:195, y:810};
var R_glowRed=[], R_glowAmb=[];   // 3 flicker frames each
var R_lanternPts=[];              // {x,y,r,amber,ph} baked lantern bodies in sky
var R_custWalk=[];                // 4 walk frames
var R_encSpr=null;                // encounter wanderer sprite
var R_encW=null;                  // {x,y,dir,kind} world pos of active encounter, or null
var R_scooterSpr=null, R_umbSpr=null, R_phoneSpr=null;
var R_coinSpr=null, R_steamSpr=[], R_fireflySpr=null, R_paperSpr=[];
var R_skyLanternSpr=[];           // [{w,h,f:[cv0,cv1]}, ...] near/mid/far
var R_lastT=0, R_lastDraw=0, R_lastActive=0, R_tSec=0;
var R_welT=0, R_welS=1, R_welActive=false;
var R_wasRush=false, R_wasGong=0;
var R_spawnAcc=0, R_tillAcc=0, R_ffAcc=0;
var R_steamAcc=[0,0,0,0,0,0,0,0];
var R_ownedN=0;
var R_ownedArr=[null,null,null,null,null,null,null,null];
var R_cOrder=[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23];

/* customer pool: enter(0)->browse(1)->buy(2)->exit(3); scooter flag */
var R_cust=[], R_custN=0;
/* particle pool: types 0 coin, 1 steam, 2 firefly, 3 ring(unused), 4 paper */
var R_part=[], R_partN=0;
/* sky lantern pool */
var R_skyL=[], R_skyN=0;

/* ================= utils ================= */
function R_rng32(a){
  return function(){
    a|=0; a=a+0x6D2B79F5|0;
    var t=Math.imul(a^a>>>15,1|a);
    t=t+Math.imul(t^t>>>7,61|t)^t;
    return ((t^t>>>14)>>>0)/4294967296;
  };
}
function R_clamp(v,a,b){ return v<a?a:(v>b?b:v); }
function R_mk(w,h,ss){
  var cv=document.createElement('canvas');
  cv.width=Math.max(1,Math.round(w*ss)); cv.height=Math.max(1,Math.round(h*ss));
  var g=cv.getContext('2d'); g.scale(ss,ss);
  return {cv:cv, g:g, w:w, h:h};
}
/* Night Market — pixel sprite library (PART 1 of render.js rebuild).
 * Flat section, no wrapper. Host provides: document, C_* palette consts.
 * Registry: R_SPR. All dims in ART pixels. R_PXB = CSS px per art pixel. */
var R_PXB = 2;
var R_PAL = {
  '.':null,
  'K':C_NIGHT, 'O':C_OUTLINE, 'I':C_INDIGO, 'A':C_ASPHALT, 'S':C_SLATE,
  'Y':C_AMBER, 'y':C_SHELL, 'T':C_TEMPLE, 't':C_TEMPLEHI,
  'W':C_WINDOW, 'w':C_INTERIOR, 'R':C_SIGNRED, 'r':C_PAPERRED,
  'G':C_GOLD, 'g':C_GOLDLT, 'P':C_PINK, 'J':C_JADE, 'j':C_JADEGLOW,
  'N':C_WOODD, 'D':'#26325e', 'B':null /* per-tier shirt, filled by builder */
};
function R_pxMake(rows, pal){
  pal = pal || R_PAL;
  var h = rows.length, w = rows[0].length, x, y, ch, col;
  var cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  var c2 = cv.getContext('2d');
  for(y=0;y<h;y++){ var row = rows[y];
    for(x=0;x<w;x++){ ch = row.charAt(x); col = pal[ch];
      if(col){ c2.fillStyle = col; c2.fillRect(x,y,1,1); } } }
  return {cv:cv, w:w, h:h};
}
var R_SPR = {};

/* ---------- vendor: one 12x16 bitizen body, per-tier shirt via palette swap.
 * H=hat(per-tier) S=skin O=eye B=shirt(per-tier) A=arm L=leg ---------- */
var R_VENDOR_ROWS = [
"....HHHH....",
"....HHHH....",
"....SSSS....",
"....SOSOS...",
"....SSSS....",
"...BBBBBB...",
"...BBBBBB...",
"..ABBBBBA...",
"..ABBBBBA...",
"...BBBBBB...",
"...BBBBBB...",
"....LLLL....",
"....L..L....",
"...LL..LL...",
"............",
"............"
];
/* apron variant: rows 5-9 get a 'P' apron block baked in (built per tier) */
var R_VENDOR_APRON = [5,6,7,8,9];
/* per-tier vendor colors: shirt(B), hat(H) */
var R_VENDOR_TIER = {
  noodle:  {B:'#8a6a3a', H:'#5d3a20'},
  tea:     {B:C_SIGNRED,  H:'#7a1210'},
  dumpling:{B:C_JADE,    H:C_INTERIOR},
  skewer:  {B:'#2a3a6e', H:C_SIGNRED},
  lantern: {B:C_TEMPLE,  H:C_GOLD},
  tofu:    {B:C_INTERIOR, H:C_JADE},
  fan:     {B:C_PINK,    H:C_OUTLINE},
  pearl:   {B:C_JADEGLOW,H:C_SLATE}
};
function R_buildVendor(id){
  var pal = {}, k;
  for(k in R_PAL) pal[k] = R_PAL[k];
  var tc = R_VENDOR_TIER[id] || R_VENDOR_TIER.noodle;
  pal['B'] = tc.B; pal['H'] = tc.H;
  var rows = R_VENDOR_ROWS.slice();
  if(id==='lantern' || id==='tofu' || id==='fan'){
    rows = rows.slice();
    for(var i=0;i<R_VENDOR_APRON.length;i++){
      var ri = R_VENDOR_APRON[i], rw = rows[ri];
      rows[ri] = rw.substring(0,4) + 'PPPP' + rw.substring(8);
    }
    pal['P'] = (id==='fan') ? C_GOLDLT : C_INTERIOR;
  }
  return R_pxMake(rows, pal);
}

/* ---------- customers: 12x22 dark silhouette, amber rim both sides, 2-frame legs ---------- */
var R_CUST_0 = [
".....KK.....",
"....KKKK....",
"....KYKKY...",
"....KKKK....",
".....KK.....",
"...KKKKKK...",
"..YKKKKKKY..",
"..YKKKKKKY..",
"..YKKKKKKY..",
"..YKKKKKKY..",
"...KKKKKK...",
"...KKKKKK...",
"....KKKK....",
"....KKKK....",
"...KKKKKK...",
"...KK..KK...",
"...KK..KK...",
"..KKK..KKK..",
"............",
"............",
"............",
"............"
];
var R_CUST_1 = [
".....KK.....",
"....KKKK....",
"....KYKKY...",
"....KKKK....",
".....KK.....",
"...KKKKKK...",
"..YKKKKKKY..",
"..YKKKKKKY..",
"..YKKKKKKY..",
"..YKKKKKKY..",
"...KKKKKK...",
"...KKKKKK...",
"....KKKK....",
"....KKKK....",
"....KKKK....",
".....KK.....",
".....KK.....",
".....KK.....",
"............",
"............",
"............",
"............"
];
/* ---------- visitors: 14x24 hooded figure + paper lantern ---------- */
var R_VISITOR_POET = [
".....OOOO.....",
"....OOOOOO....",
"....OKKKKO....",
"....OKKKKO....",
"...OOKKKKOO...",
"...OYKYYKYO...",
"...OYYYYYYO...",
"...OKYYYYKO...",
"...OOKKKKOO...",
"....OKKKKO....",
"....OKKKKO.Y..",
"....OKKKKOYYY.",
"....OKKKKOYY..",
"....OKKKKO.Y..",
"....OKKKKO....",
"....OKKKKO....",
"....OKKKKO....",
".....KKKK.....",
".....KKKK.....",
".....KK.K.....",
"....KKK.KK....",
"..............",
"..............",
".............."
];
var R_VISITOR_TOURIST = [
".....GGGG.....",
"....GGGGGG....",
"....GSSSSG....",
"....GSOSOG....",
"....GSSSSG....",
".....SSSS.....",
"...WWWWWWWW...",
"..WKWWWWWWKW..",
"..WKWWWWWWKW..",
"..WWKWWWKWWW..",
"...WWWWWWW....",
"....WWWWW..Y..",
"....WWWWW.YYY.",
"....KKKK..YY..",
"....KKKK...Y..",
"....KKKK......",
"....KKKK......",
".....KKK......",
".....KKK......",
".....KK.K.....",
"....KKK.KK....",
"..............",
"..............",
".............."
];
/* ---------- string lanterns: 10x12 crisp shell ---------- */
var R_LANT_RED = [
"...GGGG...",
"..GRRRRG..",
".GRYYYRG..",
".GRYYYRG..",
"GRYYYYYRG.",
"GRYYYYYRG.",
"GRYYYYYRG.",
".GRYYYRG..",
".GRRRRRG..",
"..GGGGGG..",
"....RR....",
"....RR...."
];
var R_LANT_AMBER = [
"...GGGG...",
"..GYYYYG..",
".GYWWYYG..",
".GYWWYYG..",
"GYYYYYYYG.",
"GYYYYYYYG.",
"GYYYYYYYG.",
".GYWWYYG..",
".GYYYYYG..",
"..GGGGGG..",
"....TT....",
"....TT...."
];
/* ---------- sky lanterns: 12x16, 2 flicker frames ---------- */
var R_SKYLANT_0 = [
".....GG.....",
"....GYYG....",
"...GYYYYG...",
"...GYYYYG...",
"..GYYYYYYG..",
"..GYYWWYYG..",
"..GYYWWYYG..",
"..GYYYYYYG..",
"..GYYYYYYG..",
"...GYYYYG...",
"...GYYYYG...",
"....GYYG....",
".....YY.....",
".....YY.....",
"............",
"............"
];
var R_SKYLANT_1 = [
".....GG.....",
"....GYYG....",
"...GYYYYG...",
"...GYYYYG...",
"..GYYYYYYG..",
"..GYWWWWYG..",
"..GYWWWWYG..",
"..GYYYYYYG..",
"..GYYYYYYG..",
"...GYYYYG...",
"...GYYYYG...",
"....GYYG....",
".....YY.....",
".....YY.....",
"............",
"............"
];

/* ---------- moon: 36x36 pixel disc, crater pixels, rim bottom-right ---------- */
var R_MOON = [
"....................................",
"....................................",
".............wwwwwwwww..............",
"..........wwwwwwwwwwwwwww...........",
"........wwwwwwwwwwwwwwwwwww.........",
".......wwwwwwyywwwwwwwwwwwww........",
"......wwwwyyyyyywwwwwwwwwwwww.......",
".....wwyyyyyyyyyywwyywwwwwwwww......",
"....wwyyyyyyyyyyywyyyyywwwwwwww.....",
"....wyyyyyyyyyyyyyyyyyyywwwwwww.....",
"...wwyyyyyyyyyyyyyyyyyyyyywwwwww....",
"...wyyyyyyyyyyyyyyyyyyyyyyywwwww....",
"...wyyyywwyyyyyyyyyyyyyyyyywwwww....",
"..wwyyyywwyyyyyyyywwyyyyyyyywwww....",
"..wwyyyywwyyyyyyywwwwyyyyyyywwww....",
"..wwyyyyyyyyyyyyywwwwwwyyyyywwww....",
"..wwyyyyyyyyyyyyyywwyyyyyyywwwww....",
"..wwyyyyyyyyyyyyyyyyyyyyyyywwwww....",
"..wwyyyyyyyyyyyywwyyyyyyyyywwwww....",
"..wwyyyyyyyyyyywwwwyyyyyyyywwwww....",
"...wyyyyyyyyyyywwwwwwyyyyywwwwwO....",
"...wyyyyyyyyyyyywwyyyyyyyywwwwwO....",
"...wwyyyyyyyyyyyyyyyyyyyywwwwwwO....",
"....wyyyyyyyyyyyyyyyyyyywwwwwwOO....",
"....wwyyyyyyyyyyyyyyyyywwwwwwwOO....",
".....wwyyyyyyyyyyyyyywwwwwwwwOOO....",
"......wwwwyyyyyyyywwwwwwwwwOOOO.....",
".......wwwwwwwwwwwwwwwwwOOOOO.......",
"........wwwwwwwwwwwwwOOOOOOO........",
"..........wwwwwwwOOOOOOOOO..........",
".............OOOOOOOOOO.............",
"....................................",
"....................................",
"....................................",
"....................................",
"...................................."
];
/* ---------- night-till: 34x26 lacquered coin box ---------- */
var R_TILL = [
"...................................",
"...................................",
"............GGGGGGGG...............",
"............GKKKKKKG...............",
"..........GGGGGGGGGGGG.............",
".........GKKKKKKKKKKKKG............",
".........GKGGGGGGGGGGKG............",
".........GKGKKKKKKKKGKG............",
".........GKGKGGGGGGKGKG............",
".........GKGKGKKKKGKGKG............",
".........GKGKGKGGKGKGKG............",
".........GKGKGKKKKGKGKG............",
".........GKGKGGGGGGKGKG............",
".........GKGKKKKKKKKGKG............",
".........GKGGGGGGGGGGKG............",
".........GKKKKKKKKKKKKG............",
".........GGGGGGGGGGGGGG............",
"..........g........g...............",
"..........g........g...............",
"...................................",
".....gGGg...............gGGg.......",
".....GggG...............GggG.......",
"...................................",
"...................................",
"...................................",
"..................................."
];
/* ---------- locked plot: 46x22 dashed rope + hanging lantern sign ---------- */
var R_PLOT = [
"..............................................",
"..GG..GG..GG..GG..GG..GG..GG..GG..GG..GG......",
".G..........................................G.",
"G.............................................",
"G..gg.........................................",
"G..gYg........................................",
"G..gYg........................................",
"G..gg.........................................",
"G.............................................",
"G.............................................",
"G.............................................",
"G.............................................",
".G..........................................G.",
"..GG..GG..GG..GG..GG..GG..GG..GG..GG..GG......",
"..............................................",
"..............................................",
"..............................................",
"..............................................",
"..............................................",
"..............................................",
"..............................................",
".............................................."
];
/* ---------- particles ---------- */
var R_COIN = [
".GGGG.",
"GgGGgG",
"GgGGgG",
"GgGGgG",
"GgGGgG",
".GGGG."
];
var R_STEAM_0 = [
"........",
"...ww...",
"..wwww..",
"..wwww..",
"...ww...",
"........",
"........",
"........"
];
var R_STEAM_1 = [
"........",
"..wwww..",
".wwwwww.",
".wwwwww.",
".wwwwww.",
"..wwww..",
"........",
"........"
];
var R_STEAM_2 = [
".w....w.",
"ww.ww.ww",
".wwwwww.",
"wwwwwwww",
".wwwwww.",
"ww.ww.ww",
".w....w.",
"........"
];
var R_FIREFLY = [
".YY.",
"YYYY",
"YYYY",
".YY."
];
var R_PAPER = [
"....RRR.....",
"...RRRRR....",
"...RRRRR....",
"...RRRRR....",
"....RRRRR...",
".....RRR....",
"............"
];
/* ---------- scooter: 34x22 delivery scooter ---------- */
var R_SCOOTER = [
"..................................",
"..................................",
"..............KKKK................",
".............KKKKKK...............",
".............KKKKKK...............",
"..............KKKK....KKKK........",
"........KKKKKKKKKKKKKKKKKKKK......",
".......KKKKKKKKKKKKKKKKKKKKKK.....",
".......KKKWWKKKKKKKKKKKKKKKKK.....",
"......KKKKKKKKKKKKKKKKKKKKKK......",
"......KKKKKKKKKKKKKKKKKKKKKK......",
".....KKKKKKKKKKKKKKKKKKKKKK.......",
".....KKK..KKKKKKKKKKK..KKK........",
"....KKK...KKKKKKKKK...KKK.........",
"....KK....KKKKKKKKK....KK.........",
"....KKK...KKKKKKKKK...KKK.........",
".....KKK..KKKKKKKKK..KKK..........",
"......KKKKKKKKKKKKKKKKK...........",
"..................................",
"..................................",
"..................................",
".................................."
];
/* ---------- umbrella: 22x10 red canopy ---------- */
var R_UMBRELLA = [
".........RR.........",
".......RRRRRR.......",
".....RRRRRRRRRR.....",
"...RRRRRRRRRRRRRR...",
".RRRRRRRRRRRRRRRRRR.",
"RRRRRRRRRRRRRRRRRRRR",
".........OO.........",
".........OO.........",
".........OO.........",
".........OO........."
];
/* ---------- phone: 6x8 ---------- */
var R_PHONE = [
".KKKK.",
"KWWWWK",
"KWWWWK",
"KWWWWK",
"KWWWWK",
"KWWWWK",
"KWWWWK",
".KKKK."
];
/* ---------- sign canyon: 195x110 strip (built in code, rows generated) ---------- */
/* built procedurally in R_buildPxSprites for window randomness (seeded) */
/* ---------- star: 2x2 ---------- */
var R_STAR = [
"ww",
"ww"
];

/* ---------- STALLS: 40x28 cart, 44x32 fancy. vy = counter-top art-px y ---------- */
/* noodle cart */
var R_STALL_NOODLE_CART = [
"..yyyyyyyyNNNNNNNNyyyyyyyyNNNNNNNNyyyy..",
"..yyyyyyyyNNNNNNNNyyyyyyyyNNNNNNNNyyyy..",
"..yyyyyyyyNNNNNNNNyyyyyyyyNNNNNNNNyyyy..",
"...GGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG...",
"...............RRRRRRRRRR...............",
"...............RggggggggR...............",
"...............RggggggggR...............",
"...............RRRRRRRRRR...............",
"...NN..............................NN...",
"...NN..............................NN...",
"...NN..............................NN...",
"...NN..............................NN...",
"...NN..............................NN...",
"...NN..............................NN...",
"...NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN...",
".............yyyyyyyyyyyyyy.............",
".............yYYYYYYYYYYYYy.............",
".............yyyyyyyyyyyyyy.............",
"...NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN...",
"...NGNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNGN...",
"...NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN...",
"...NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN...",
"...NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN...",
"...NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN...",
".......OOO...................OOO........",
"......OOKOO.................OOKOO.......",
".......OOO...................OOO........",
"........................................"
];
var R_STALL_NOODLE_FANCY = [
"..yyyyyyyyNNNNNNNNyyyyyyyyNNNNNNNNyyyyyyyy..",
"..yyyyyyyyNNNNNNNNyyyyyyyyNNNNNNNNyyyyyyyy..",
"..yyyyyyyyNNNNNNNNyyyyyyyyNNNNNNNNyyyyyyyy..",
"..yyyyyyyyNNNNNNNNyyyyyyyyNNNNNNNNyyyyyyyy..",
"...GGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG...",
"................RRRRRRRRRRRR................",
"................RggggggggggR................",
"................RggggggggggR................",
"................RRRRRRRRRRRR................",
"...NN..................................NN...",
"...NN..................................NN...",
"..YYY.................................NN....",
"..YYY.................................NN....",
"...NN..................................NN...",
"...NN..................................NN...",
"...NN..................................NN...",
"...NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN...",
".............yyyyyyyyyyyyyyyyyy.............",
".............yYYYYYYYYYYYYYYYYy.............",
".............yyyyyyyyyyyyyyyyyy.............",
".............yyyyyyyyyyyyyyyyyy.............",
"...NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN...",
"...NGNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNGN....",
"...NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN...",
"...NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN...",
"...NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN...",
"...NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN...",
"........OOO...................OOO...........",
".......OOKOO.................OOKOO..........",
"........OOO...................OOO...........",
"............................................",
"............................................"
];
/* tea cart: red umbrella canopy */
var R_STALL_TEA_CART = [
"....................RRRR....................",
".................RRRRRRRRRR.................",
"...............RRRRRRRRRRRRRR...............",
".............RRRRRRRRRRRRRRRRRR.............",
"..............rRRRRRRRRRRRRRRr..............",
"................RRRRRRRRRRRR................",
"................RggggggggggR................",
"................RggggggggggR................",
"...NN..................................NN...",
"...NN..................................NN...",
"...NN..................................NN...",
"...NN..................................NN...",
"...NN..................................NN...",
"...NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN...",
".............WW..WW..WW.....................",
"............TTTTTTTTTTTT....................",
".............TTTTTTTTTT.....................",
"...NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN...",
"....NGNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNGN.....",
"...NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN...",
"...NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN...",
"...NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN...",
".........OOO...................OOO..........",
"........OOKOO.................OOKOO.........",
".........OOO...................OOO..........",
"............................................"
];
var R_STALL_TEA_FANCY = [
"......................RRRRRR......................",
"...................RRRRRRRRRRRR...................",
".................RRRRRRRRRRRRRRRR.................",
"...............RRRRRRRRRRRRRRRRRRRR...............",
"................rRRRRRRRRRRRRRRRRr................",
"..................RRRRRRRRRRRRRR..................",
"..................RggggggggggggR..................",
"..................RggggggggggggR..................",
"...NN......................................NN.....",
"...NN......................................NN.....",
"..YYY.....................................NN......",
"..YYY.....................................NN......",
"...NN......................................NN.....",
"...NN......................................NN.....",
"...NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN.....",
"..............WW..WW..WW..WW......................",
".............TTTTTTTTTTTTTTTT.....................",
"..............TTTTTTTTTTTTTT......................",
"..............WW..WW..WW..WW......................",
"...NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN.....",
"....NGNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNGN......",
"...NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN.....",
"...NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN.....",
"...NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN.....",
".........OOO.....................OOO..............",
"........OOKOO...................OOKOO.............",
".........OOO.....................OOO..............",
"..................................................",
".................................................."
];
/* dumpling cart: teal striped awning, bamboo steamers */
var R_STALL_DUMPLING_CART = [
"..JJJJJJJJjjjjjjjjJJJJJJJJjjjjjjjjJJJJ..",
"..JJJJJJJJjjjjjjjjJJJJJJJJjjjjjjjjJJJJ..",
"..JJJJJJJJjjjjjjjjJJJJJJJJjjjjjjjjJJJJ..",
"...GGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG...",
"...............RRRRRRRRRR...............",
"...............RggggggggR...............",
"...............RggggggggR...............",
"...............RRRRRRRRRR...............",
"...NN..............................NN...",
"...NN..............................NN...",
"...NN..............................NN...",
"...NN..............................NN...",
"...NN..............................NN...",
"...NN..............................NN...",
"...NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN...",
".............yyyyyyyyyyyyyy.............",
"............yWWyWWyWWyWWyWy.............",
".............yyyyyyyyyyyyyy.............",
"...NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN...",
"...NGNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNGN...",
"...NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN...",
"...NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN...",
"...NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN...",
"...NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN...",
".......OOO...................OOO........",
"......OOKOO.................OOKOO.......",
".......OOO...................OOO........",
"........................................"
];
var R_STALL_DUMPLING_FANCY = [
"..JJJJJJJJjjjjjjjjJJJJJJJJjjjjjjjjJJJJJJJJ..",
"..JJJJJJJJjjjjjjjjJJJJJJJJjjjjjjjjJJJJJJJJ..",
"..JJJJJJJJjjjjjjjjJJJJJJJJjjjjjjjjJJJJJJJJ..",
"..JJJJJJJJjjjjjjjjJJJJJJJJjjjjjjjjJJJJJJJJ..",
"...GGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG...",
"................RRRRRRRRRRRR................",
"................RggggggggggR................",
"................RggggggggggR................",
"................RRRRRRRRRRRR................",
"...NN..................................NN...",
"...NN..................................NN...",
"..YYY.................................NN....",
"..YYY.................................NN....",
"...NN..................................NN...",
"...NN..................................NN...",
"...NN..................................NN...",
"...NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN...",
".............yyyyyyyyyyyyyyyyyy.............",
"............yWWyWWyWWyWWyWWyWy..............",
".............yyyyyyyyyyyyyyyyyy.............",
".............yyyyyyyyyyyyyyyyyy.............",
"...NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN...",
"...NGNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNGN....",
"...NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN...",
"...NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN...",
"...NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN...",
"...NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN...",
"........OOO...................OOO...........",
".......OOKOO.................OOKOO..........",
"........OOO...................OOO...........",
"............................................",
"............................................"
];
/* skewer cart: dark-blue umbrella, grill + flame pixels */
var R_STALL_SKEWER_CART = [
"....................IIII....................",
".................IIIIIIIIII.................",
"...............IIIIIIIIIIIIII...............",
".............IIIIIIIIIIIIIIIIII.............",
"..............iIIIIIIIIIIIIIIi..............",
"................IIIIIIIIIIII................",
"................RggggggggggR................",
"................RggggggggggR................",
"...NN..................................NN...",
"...NN..................................NN...",
"...NN..................................NN...",
"...NN..................................NN...",
"...NN..................................NN...",
"...NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN...",
"............T.T.T.T.T.T.T.T.................",
"...........yyyyyyyyyyyyyyyyy................",
"...........yYYyYYyYYyYYyYYyy................",
"...NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN...",
"....NGNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNGN.....",
"...NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN...",
"...NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN...",
"...NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN...",
".........OOO...................OOO..........",
"........OOKOO.................OOKOO.........",
".........OOO...................OOO..........",
"............................................"
];
var R_STALL_SKEWER_FANCY = [
"......................IIIIII......................",
"...................IIIIIIIIIIII...................",
".................IIIIIIIIIIIIIIII.................",
"...............IIIIIIIIIIIIIIIIIIII...............",
"................iIIIIIIIIIIIIIIIIi................",
"..................IIIIIIIIIIIIII..................",
"..................RggggggggggggR..................",
"..................RggggggggggggR..................",
"...NN......................................NN.....",
"...NN......................................NN.....",
"..YYY.....................................NN......",
"..YYY.....................................NN......",
"...NN......................................NN.....",
"...NN......................................NN.....",
"...NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN.....",
"..............T.T.T.T.T.T.T.T.T...................",
".............yyyyyyyyyyyyyyyyyyy..................",
"..............yYYyYYyYYyYYyYYyYYyy................",
".............yyyyyyyyyyyyyyyyyyy..................",
"...NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN.....",
"....NGNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNGN......",
"...NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN.....",
"...NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN.....",
"...NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN.....",
".........OOO.....................OOO..............",
"........OOKOO...................OOKOO.............",
".........OOO.....................OOO..............",
"..................................................",
".................................................."
];

/* lantern cart: glowing white sheet canopy, hanging mini-lanterns as goods */
var R_STALL_LANTERN_CART = [
"..wwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww..",
"...wYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYw...",
"..wwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww..",
"...GGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG...",
"...............RRRRRRRRRR...............",
"...............RggggggggR...............",
"...............RggggggggR...............",
"...............RRRRRRRRRR...............",
"...NN..............................NN...",
"...NN..............................NN...",
"...NN..............................NN...",
"...NN..............................NN...",
"...NN..............................NN...",
"...NN..............................NN...",
"...NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN...",
"..........RYR..RYR..RYR.................",
"..........RYYYR.RYYYR.RYYYR.............",
"..........RYR..RYR..RYR.................",
"...NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN...",
"...NGNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNGN...",
"...NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN...",
"...NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN...",
"...NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN...",
"...NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN...",
".......OOO...................OOO........",
"......OOKOO.................OOKOO.......",
".......OOO...................OOO........",
"........................................"
];
var R_STALL_LANTERN_FANCY = [
"..wwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww..",
"...wYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYw...",
"...wYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYw...",
"..wwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww..",
"...GGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG...",
"................RRRRRRRRRRRR................",
"................RggggggggggR................",
"................RggggggggggR................",
"................RRRRRRRRRRRR................",
"...NN..................................NN...",
"...NN..................................NN...",
"..YYY.................................NN....",
"..YYY.................................NN....",
"...NN..................................NN...",
"...NN..................................NN...",
"...NN..................................NN...",
"...NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN...",
"..........RYR..RYR..RYR..RYR................",
"..........RYYYR.RYYYR.RYYYR.RYYYR...........",
"..........RYR..RYR..RYR..RYR................",
"..........RYR..RYR..RYR..RYR................",
"...NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN...",
"...NGNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNGN....",
"...NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN...",
"...NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN...",
"...NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN...",
"...NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN...",
"........OOO...................OOO...........",
".......OOKOO.................OOKOO..........",
"........OOO...................OOO...........",
"............................................",
"............................................"
];
/* tofu cart: teal umbrella, white tofu blocks */
var R_STALL_TOFU_CART = [
"....................JJJJ....................",
".................JJJJJJJJJJ.................",
"...............JJJJJJJJJJJJJJ...............",
".............JJJJJJJJJJJJJJJJJJ.............",
"..............jJJJJJJJJJJJJJJj..............",
"................JJJJJJJJJJJJ................",
"................RggggggggggR................",
"................RggggggggggR................",
"...NN..................................NN...",
"...NN..................................NN...",
"...NN..................................NN...",
"...NN..................................NN...",
"...NN..................................NN...",
"...NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN...",
"............wwww..wwww..wwww................",
"............wwww..wwww..wwww................",
"............wwww..wwww..wwww................",
"...NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN...",
"....NGNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNGN.....",
"...NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN...",
"...NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN...",
"...NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN...",
".........OOO...................OOO..........",
"........OOKOO.................OOKOO.........",
".........OOO...................OOO..........",
"............................................"
];
var R_STALL_TOFU_FANCY = [
"......................JJJJJJ......................",
"...................JJJJJJJJJJJJ...................",
".................JJJJJJJJJJJJJJJJ.................",
"...............JJJJJJJJJJJJJJJJJJJJ...............",
"................jJJJJJJJJJJJJJJJJj................",
"..................JJJJJJJJJJJJJJ..................",
"..................RggggggggggggR..................",
"..................RggggggggggggR..................",
"...NN......................................NN.....",
"...NN......................................NN.....",
"..YYY.....................................NN......",
"..YYY.....................................NN......",
"...NN......................................NN.....",
"...NN......................................NN.....",
"...NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN.....",
".............wwww..wwww..wwww..wwww...............",
".............wwww..wwww..wwww..wwww...............",
".............wwww..wwww..wwww..wwww...............",
".............wwww..wwww..wwww..wwww...............",
"...NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN.....",
"....NGNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNGN......",
"...NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN.....",
"...NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN.....",
"...NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN.....",
".........OOO.....................OOO..............",
"........OOKOO...................OOKOO.............",
".........OOO.....................OOO..............",
"..................................................",
".................................................."
];
/* fan cart: pink striped awning, paper fans on a rack */
var R_STALL_FAN_CART = [
"..PPPPPPPPppppppppPPPPPPPPppppppppPPPP..",
"..PPPPPPPPppppppppPPPPPPPPppppppppPPPP..",
"..PPPPPPPPppppppppPPPPPPPPppppppppPPPP..",
"...GGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG...",
"...............RRRRRRRRRR...............",
"...............RggggggggR...............",
"...............RggggggggR...............",
"...............RRRRRRRRRR...............",
"...NN..............................NN...",
"...NN..............................NN...",
"...NN..............................NN...",
"...NN..............................NN...",
"...NN..............................NN...",
"...NN..............................NN...",
"...NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN...",
"..........PpP..PpP..PpP.................",
".........PpPpP.PpPpP.PpPpP..............",
"..........PpP..PpP..PpP.................",
"...NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN...",
"...NGNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNGN...",
"...NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN...",
"...NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN...",
"...NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN...",
"...NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN...",
".......OOO...................OOO........",
"......OOKOO.................OOKOO.......",
".......OOO...................OOO........",
"........................................"
];
var R_STALL_FAN_FANCY = [
"..PPPPPPPPppppppppPPPPPPPPppppppppPPPPPPPP..",
"..PPPPPPPPppppppppPPPPPPPPppppppppPPPPPPPP..",
"..PPPPPPPPppppppppPPPPPPPPppppppppPPPPPPPP..",
"..PPPPPPPPppppppppPPPPPPPPppppppppPPPPPPPP..",
"...GGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG...",
"................RRRRRRRRRRRR................",
"................RggggggggggR................",
"................RggggggggggR................",
"................RRRRRRRRRRRR................",
"...NN..................................NN...",
"...NN..................................NN...",
"..YYY.................................NN....",
"..YYY.................................NN....",
"...NN..................................NN...",
"...NN..................................NN...",
"...NN..................................NN...",
"...NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN...",
"..........PpP..PpP..PpP..PpP................",
".........PpPpP.PpPpP.PpPpP.PpPpP............",
"..........PpP..PpP..PpP..PpP................",
"..........PpP..PpP..PpP..PpP................",
"...NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN...",
"...NGNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNGN....",
"...NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN...",
"...NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN...",
"...NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN...",
"...NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN...",
"........OOO...................OOO...........",
".......OOKOO.................OOKOO..........",
"........OOO...................OOO...........",
"............................................",
"............................................"
];
/* pearl cart: pale sheet canopy, glowing jars */
var R_STALL_PEARL_CART = [
"..wwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww..",
"...wjJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJw...",
"..wwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww..",
"...GGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG...",
"...............RRRRRRRRRR...............",
"...............RggggggggR...............",
"...............RggggggggR...............",
"...............RRRRRRRRRR...............",
"...NN..............................NN...",
"...NN..............................NN...",
"...NN..............................NN...",
"...NN..............................NN...",
"...NN..............................NN...",
"...NN..............................NN...",
"...NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN...",
"..........jJj..jJj..jJj.................",
"..........jWj..jWj..jWj.................",
"..........jJj..jJj..jJj.................",
"...NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN...",
"...NGNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNGN...",
"...NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN...",
"...NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN...",
"...NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN...",
"...NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN...",
".......OOO...................OOO........",
"......OOKOO.................OOKOO.......",
".......OOO...................OOO........",
"........................................"
];
var R_STALL_PEARL_FANCY = [
"..wwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww..",
"...wjJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJw...",
"...wjJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJJw...",
"..wwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww..",
"...GGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG...",
"................RRRRRRRRRRRR................",
"................RggggggggggR................",
"................RggggggggggR................",
"................RRRRRRRRRRRR................",
"...NN..................................NN...",
"...NN..................................NN...",
"..YYY.................................NN....",
"..YYY.................................NN....",
"...NN..................................NN...",
"...NN..................................NN...",
"...NN..................................NN...",
"...NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN...",
"..........jJj..jJj..jJj..jJj................",
"..........jWj..jWj..jWj..jWj................",
"..........jJj..jJj..jJj..jJj................",
"..........jJj..jJj..jJj..jJj................",
"...NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN...",
"...NGNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNGN....",
"...NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN...",
"...NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN...",
"...NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN...",
"...NNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN...",
"........OOO...................OOO...........",
".......OOKOO.................OOKOO..........",
"........OOO...................OOO...........",
"............................................",
"............................................"
];

/* ---------- assembly ---------- */
var R_STALL_IDS = ['noodle','tea','dumpling','skewer','lantern','tofu','fan','pearl'];
var R_STALL_ROWS = {
  noodle:  {cart:R_STALL_NOODLE_CART,  fancy:R_STALL_NOODLE_FANCY,  vy:14},
  tea:     {cart:R_STALL_TEA_CART,     fancy:R_STALL_TEA_FANCY,     vy:14},
  dumpling:{cart:R_STALL_DUMPLING_CART,fancy:R_STALL_DUMPLING_FANCY,vy:14},
  skewer:  {cart:R_STALL_SKEWER_CART,  fancy:R_STALL_SKEWER_FANCY,  vy:14},
  lantern: {cart:R_STALL_LANTERN_CART, fancy:R_STALL_LANTERN_FANCY,vy:14},
  tofu:    {cart:R_STALL_TOFU_CART,    fancy:R_STALL_TOFU_FANCY,    vy:14},
  fan:     {cart:R_STALL_FAN_CART,     fancy:R_STALL_FAN_FANCY,     vy:14},
  pearl:   {cart:R_STALL_PEARL_CART,   fancy:R_STALL_PEARL_FANCY,   vy:14}
};
/* sign canyon: 195x110 strip, seeded windows/signboards */
function R_buildCanyon(){
  var W=195, H=110, r, seed=4242;
  function rnd(){ seed=(seed*1664525+1013904223)|0; return ((seed>>>9)%1000)/1000; }
  var rows=[], y, x;
  for(y=0;y<H;y++){ var s=''; for(x=0;x<W;x++) s+='.'; rows.push(s); }
  function rect(x0,y0,w,h,ch){
    for(var yy=y0;yy<y0+h&&yy<H;yy++) for(var xx=x0;xx<x0+w&&xx<W;xx++){
      if(xx>=0&&yy>=0) rows[yy]=rows[yy].substring(0,xx)+ch+rows[yy].substring(xx+1);
    }
  }
  var bx=0;
  while(bx<W){
    var bw=22+Math.floor(rnd()*26), bh=40+Math.floor(rnd()*55), by=H-bh;
    rect(bx,by,bw,bh,'D');
    rect(bx,by,bw,2,'K');
    var wy=by+5;
    while(wy<by+bh-5){
      var wx=bx+3;
      while(wx<bx+bw-4){
        if(rnd()<0.38){ rect(wx,wy,2,3, rnd()<0.8?'W':'J'); }
        wx+=5;
      }
      wy+=7;
    }
    if(rnd()<0.55){
      var sw=6+Math.floor(rnd()*6), sh=14+Math.floor(rnd()*20);
      var sx=bx+2+Math.floor(rnd()*Math.max(1,bw-sw-4)), sy=by+4;
      rect(sx,sy,sw,sh,'R');
      for(var gy=sy+2;gy<sy+sh-2;gy+=3) rect(sx+1,gy,sw-2,1,'g');
    }
    bx+=bw+3+Math.floor(rnd()*8);
  }
  return R_pxMake(rows);
}
function R_buildPxSprites(){
  var i, id, def;
  R_SPR.stall = {};
  for(i=0;i<R_STALL_IDS.length;i++){
    id = R_STALL_IDS[i]; def = R_STALL_ROWS[id];
    var c = R_pxMake(def.cart), f = R_pxMake(def.fancy);
    c.vy = def.vy; f.vy = def.vy;
    R_SPR.stall[id] = {cart:c, fancy:f};
  }
  R_SPR.vendor = {};
  for(i=0;i<R_STALL_IDS.length;i++){
    id = R_STALL_IDS[i];
    R_SPR.vendor[id] = R_buildVendor(id);
  }
  R_SPR.custWalk = [R_pxMake(R_CUST_0), R_pxMake(R_CUST_1)];
  R_SPR.visitor_poet = R_pxMake(R_VISITOR_POET);
  R_SPR.visitor_tourist = R_pxMake(R_VISITOR_TOURIST);
  R_SPR.lanternR = R_pxMake(R_LANT_RED);
  R_SPR.lanternA = R_pxMake(R_LANT_AMBER);
  R_SPR.skylan = [R_pxMake(R_SKYLANT_0), R_pxMake(R_SKYLANT_1)];
  R_SPR.moon = R_pxMake(R_MOON);
  R_SPR.till = R_pxMake(R_TILL);
  R_SPR.plot = R_pxMake(R_PLOT);
  R_SPR.coin = R_pxMake(R_COIN);
  R_SPR.steam = [R_pxMake(R_STEAM_0), R_pxMake(R_STEAM_1), R_pxMake(R_STEAM_2)];
  R_SPR.firefly = R_pxMake(R_FIREFLY);
  R_SPR.paper = R_pxMake(R_PAPER);
  R_SPR.scooter = R_pxMake(R_SCOOTER);
  R_SPR.umbrella = R_pxMake(R_UMBRELLA);
  R_SPR.phone = R_pxMake(R_PHONE);
  R_SPR.canyon = R_buildCanyon();
  R_SPR.star = R_pxMake(R_STAR);
}
function R_paintTillGlow(){
  var mc=R_mk(110,92,R_SS), g=mc.g;
  var hg=g.createRadialGradient(55,52,4,55,52,52);
  hg.addColorStop(0,'rgba(237,216,128,0.75)');
  hg.addColorStop(0.45,'rgba(216,171,78,0.30)');
  hg.addColorStop(1,'rgba(216,171,78,0)');
  g.fillStyle=hg; g.fillRect(0,0,110,92);
  var r=R_rng32(77), i;
  g.fillStyle=C_AMBER;
  for(i=0;i<7;i++){
    g.globalAlpha=0.5+r()*0.5;
    g.fillRect(20+r()*70, 8+r()*50, 1.6, 1.6);
  }
  g.globalAlpha=1;
  return mc;
}

/* lantern glow flicker frames (additive, drawn with 'lighter') */
function R_paintGlowFrames(){
  var i, f;
  R_glowRed=[]; R_glowAmb=[];
  for(f=0;f<3;f++){
    var rad=30+f*5;
    var mr=R_mk(76,76,R_SS), g=mr.g;
    var hg=g.createRadialGradient(38,38,2,38,38,rad);
    hg.addColorStop(0,'rgba(255,120,90,0.60)');
    hg.addColorStop(0.5,'rgba(210,50,38,0.30)');
    hg.addColorStop(1,'rgba(210,50,38,0)');
    g.fillStyle=hg; g.fillRect(0,0,76,76);
    R_glowRed.push(mr);
    var ma=R_mk(76,76,R_SS), ga=ma.g;
    var ha=ga.createRadialGradient(38,38,2,38,38,rad);
    ha.addColorStop(0,'rgba(237,216,128,0.62)');
    ha.addColorStop(0.5,'rgba(216,171,78,0.30)');
    ha.addColorStop(1,'rgba(216,171,78,0)');
    ga.fillStyle=ha; ga.fillRect(0,0,76,76);
    R_glowAmb.push(ma);
  }
}
function R_paintGrain(){
  var cv=document.createElement('canvas');
  cv.width=R_DW; cv.height=R_DH;
  var g=cv.getContext('2d');
  var img=g.createImageData(R_DW,R_DH), d=img.data;
  var r=R_rng32(60606), i, n=d.length/4, v;
  for(i=0;i<n;i++){
    v=200+Math.floor(r()*24);
    d[i*4]=v; d[i*4+1]=v-8; d[i*4+2]=v-18;
    d[i*4+3]=9+Math.floor(r()*6);   /* ~4-6% alpha */
  }
  g.putImageData(img,0,0);
  R_GRAIN=cv;
}

/* ================= PIXEL ADAPTATION =================
 * Quantize helper + build/draw functions for the pixel-art diorama.
 * Engine (pools, spawn/update, hit-testing) is reused verbatim below. */
function R_q(x){ return Math.round(x/R_PXB)*R_PXB; }

function R_buildAll(){
  R_buildPxSprites();
  var i, id;
  R_stallSpr={};
  for(i=0;i<R_STALL_IDS.length;i++){
    id=R_STALL_IDS[i];
    R_stallSpr[id]={cart:R_SPR.stall[id].cart, truck:R_SPR.stall[id].fancy};
  }
  R_SKY=R_paintSkyPx();
  R_lockedSpr=R_SPR.plot;
  for(i=0;i<R_plots.length;i++) R_plotDims(R_plots[i],1);
  R_tillSpr=R_SPR.till;
  R_tillGlowSpr=R_paintTillGlow();
  R_paintGlowFrames();
  R_coinSpr=R_SPR.coin;
  R_steamSpr=R_SPR.steam;
  R_fireflySpr=R_SPR.firefly;
  R_paperSpr=[R_SPR.paper];
  R_custWalk=R_SPR.custWalk;
  R_scooterSpr=R_SPR.scooter;
  R_umbSpr=R_SPR.umbrella;
  R_phoneSpr=R_SPR.phone;
  var sl={w:R_SPR.skylan[0].w*R_PXB, h:R_SPR.skylan[0].h*R_PXB, f:R_SPR.skylan};
  R_skyLanternSpr=[sl,sl,sl];
  R_paintGrain();
}

/* pixel sky: gradient + pixel stars + pixel moon + canyon strip.
 * Lantern bodies are drawn per-frame (sway); poles/wires baked. */
function R_paintSkyPx(){
  var mc=R_mk(R_DW,R_DH,2), g=mc.g, r=R_rng32(20261012), i;
  var HORIZON=520;
  var sky=g.createLinearGradient(0,0,0,HORIZON);
  sky.addColorStop(0,C_NIGHT); sky.addColorStop(0.5,'#070b14');
  sky.addColorStop(0.78,'#0d1740'); sky.addColorStop(1,C_INDIGO);
  g.fillStyle=sky; g.fillRect(0,0,R_DW,HORIZON);
  var band=g.createRadialGradient(195,250,10, 195,250,300);
  band.addColorStop(0,'rgba(10,15,160,0.85)');
  band.addColorStop(0.55,'rgba(10,15,160,0.38)');
  band.addColorStop(1,'rgba(10,15,160,0)');
  g.fillStyle=band; g.fillRect(0,60,R_DW,420);

  g.imageSmoothingEnabled=false;
  /* pixel stars: crisp 2x2 blocks (design coords; canvas pre-scales 2x) */
  var st=R_SPR.star;
  for(i=0;i<92;i++){
    var sx=r()*R_DW, sy=r()*330;
    if(sx>270&&sx<364&&sy>84&&sy<178) continue;
    g.globalAlpha=0.12+r()*0.5;
    g.drawImage(st.cv, Math.round(sx), Math.round(sy), 2, 2);
  }
  g.globalAlpha=1;
  /* moon halo, then crisp pixel moon */
  var mx=317, my=131;
  var mh=g.createRadialGradient(mx,my,14,mx,my,86);
  mh.addColorStop(0,'rgba(238,215,176,0.30)');
  mh.addColorStop(0.55,'rgba(238,215,176,0.10)');
  mh.addColorStop(1,'rgba(238,215,176,0)');
  g.fillStyle=mh; g.fillRect(mx-86,my-86,172,172);
  var mn=R_SPR.moon;
  g.drawImage(mn.cv,mx-36,my-36,72,72);
  /* sign canyon strip: 195x110 art -> 390x220 css, foot at horizon */
  var cn=R_SPR.canyon;
  g.drawImage(cn.cv, 0, HORIZON-220, 390, 220);
  /* warm ground haze where canyon meets street */
  var hz=g.createLinearGradient(0,HORIZON-40,0,HORIZON+30);
  hz.addColorStop(0,'rgba(216,171,78,0)'); hz.addColorStop(0.7,'rgba(216,171,78,0.10)');
  hz.addColorStop(1,'rgba(216,171,78,0)');
  g.fillStyle=hz; g.fillRect(0,HORIZON-40,R_DW,70);

  /* --- lantern poles + wires (bodies drawn per-frame for sway) --- */
  var poles=[28,140,252,364];
  R_lanternPts.length=0;
  g.strokeStyle='#241a20'; g.lineWidth=5; g.lineCap='round';
  var pi, t, qx, qy;
  for(pi=0;pi<poles.length;pi++){
    g.beginPath(); g.moveTo(poles[pi],HORIZON+40); g.lineTo(poles[pi],418); g.stroke();
    g.fillStyle=C_AMBER; g.globalAlpha=0.8;
    g.beginPath(); g.arc(poles[pi],414,3,0,Math.PI*2); g.fill();
    g.globalAlpha=1;
  }
  var lr=R_rng32(4242);
  for(pi=0;pi<poles.length-1;pi++){
    var x0=poles[pi], x1=poles[pi+1], y0=424, sag=30+lr()*10;
    g.strokeStyle=C_OUTLINE; g.lineWidth=2;
    g.beginPath(); g.moveTo(x0,y0);
    g.quadraticCurveTo((x0+x1)/2, y0+sag*2, x1,y0); g.stroke();
    var nL=4+Math.floor(lr()*2), i2;
    for(i2=0;i2<nL;i2++){
      t=0.14+(0.72*i2)/(nL-1);
      var mt=1-t;
      qx=mt*mt*x0+2*mt*t*(x0+x1)/2+t*t*x1;
      qy=mt*mt*y0+2*mt*t*(y0+sag*2)+t*t*y0;
      var drop=9+lr()*5, lanR=10+lr()*4;
      var amber=lr()<0.3;
      g.strokeStyle=C_OUTLINE; g.lineWidth=1.5;
      g.beginPath(); g.moveTo(qx,qy); g.lineTo(qx,qy+drop); g.stroke();
      var ly2=qy+drop+lanR;
      R_lanternPts.push({x:qx,y:ly2,r:lanR,amber:amber,ph:Math.floor(lr()*3)});
      var lsm=g.createLinearGradient(0,HORIZON,0,HORIZON+170);
      lsm.addColorStop(0,amber?C_AMBER:C_SIGNRED); lsm.addColorStop(1,'rgba(0,0,0,0)');
      g.save(); g.globalAlpha=0.10; g.fillStyle=lsm;
      g.fillRect(qx-lanR*1.6,HORIZON,lanR*3.2,170); g.restore();
    }
  }

  /* --- wet asphalt ground --- */
  var gr=g.createLinearGradient(0,HORIZON,0,R_DH);
  gr.addColorStop(0,'#2b3444'); gr.addColorStop(0.25,C_ASPHALT);
  gr.addColorStop(1,'#1c2230');
  g.fillStyle=gr; g.fillRect(0,HORIZON,R_DW,R_DH-HORIZON);
  for(i=0;i<26;i++){
    var px2=r()*R_DW, py2=HORIZON+r()*(R_DH-HORIZON), pr2=24+r()*70;
    var pg=g.createRadialGradient(px2,py2,2,px2,py2,pr2);
    pg.addColorStop(0,'rgba(94,112,126,0.16)'); pg.addColorStop(1,'rgba(94,112,126,0)');
    g.fillStyle=pg; g.fillRect(px2-pr2,py2-pr2,pr2*2,pr2*2);
  }
  function paintLine(ly3,dash){
    g.save();
    g.strokeStyle='rgba(207,216,227,0.20)'; g.lineWidth=3;
    g.setLineDash(dash||[]);
    g.beginPath(); g.moveTo(14,ly3); g.lineTo(R_DW-14,ly3); g.stroke();
    g.setLineDash([]);
    g.strokeStyle='rgba(238,215,176,0.30)'; g.lineWidth=2;
    var hx3;
    for(hx3=0;hx3<R_lanternPts.length;hx3+=2){
      var lx3=R_lanternPts[hx3].x;
      g.beginPath(); g.moveTo(lx3-16,ly3); g.lineTo(lx3+16,ly3); g.stroke();
    }
    g.restore();
  }
  paintLine(668,[26,18]); paintLine(792,[]);

  var tsm=g.createLinearGradient(0,660,0,800);
  tsm.addColorStop(0,'rgba(237,216,128,0.22)'); tsm.addColorStop(1,'rgba(237,216,128,0)');
  g.fillStyle=tsm; g.fillRect(148,660,94,140);

  var vg=g.createRadialGradient(195,430,180, 195,430,560);
  vg.addColorStop(0,'rgba(5,7,10,0)'); vg.addColorStop(1,'rgba(5,7,10,0.44)');
  g.fillStyle=vg; g.fillRect(0,0,R_DW,R_DH);
  return mc;
}

function R_drawStall(g,p,tier){
  var w,h;
  if(tier===0){
    var L=R_lockedSpr; w=L.w*R_PXB*p.sc; h=L.h*R_PXB*p.sc;
    g.drawImage(L.cv,R_q(p.x-w/2),R_q(p.y-h+4),w,h);
    return;
  }
  var S=(tier===2)?R_stallSpr[p.id].truck:R_stallSpr[p.id].cart;
  w=S.w*R_PXB*p.sc; h=S.h*R_PXB*p.sc;
  /* vendor behind the counter, 2-step bob */
  var V=R_SPR.vendor[p.id];
  if(V){
    var vw=V.w*R_PXB*p.sc, vh=V.h*R_PXB*p.sc;
    var bob=(Math.floor(R_tSec*2+p.x*0.13)%2)? -R_PXB*p.sc : 0;
    var feetY=p.y-h+S.vy*R_PXB*p.sc;
    g.drawImage(V.cv, R_q(p.x-vw/2), R_q(feetY-vh+bob), vw, vh);
  }
  g.drawImage(S.cv,R_q(p.x-w/2),R_q(p.y-h),w,h);
}

function R_drawCustomer(g,p){
  var sc=p.scale;
  if(p.scooter){
    var S2=R_scooterSpr, sw=S2.w*R_PXB*sc*1.15, sh=S2.h*R_PXB*sc*1.15;
    var bob0=Math.abs(Math.sin(p.phase))*2;
    g.drawImage(S2.cv, R_q(p.x-sw/2), R_q(p.y-bob0-sh), sw, sh);
    return;
  }
  var spr=R_custWalk[p.pose&1];
  var walking=(p.state===0||p.state===3);
  var bob2=walking?Math.abs(Math.sin(p.phase))*2.4*sc:Math.sin(R_tSec*5+p.phase)*1.2*sc;
  var hop=(p.state===2)?-7*Math.sin(Math.PI*(1-Math.max(0,p.t)/0.6))*sc:0;
  var w=spr.w*R_PXB*sc, h=spr.h*R_PXB*sc;
  var dx=R_q(p.x-w/2), dy=R_q(p.y-R_q(bob2)+hop-h);
  if(p.dir<0){ g.drawImage(spr.cv, dx+w, dy, -w, h); }
  else { g.drawImage(spr.cv, dx, dy, w, h); }
  if(p.umb){
    var uw=R_umbSpr.w*R_PXB*sc, uh=R_umbSpr.h*R_PXB*sc;
    g.drawImage(R_umbSpr.cv, R_q(p.x-uw/2), R_q(p.y-h-uh+10*sc), uw, uh);
  }
  if(p.phone){
    var pw2=R_phoneSpr.w*R_PXB*sc, ph2=R_phoneSpr.h*R_PXB*sc;
    g.drawImage(R_phoneSpr.cv, R_q(p.x+p.dir*8*sc-pw2/2), R_q(p.y-30*sc), pw2, ph2);
  }
}

function R_drawEncounter(g,encW){
  var bob=R_q(Math.sin(R_tSec*2.1+1.3)*3);
  var x=R_q(encW.x), y=R_q(encW.y+bob);
  var rp=(R_tSec*0.55)%1;
  g.save();
  g.globalAlpha=(1-rp)*0.38; g.strokeStyle=C_AMBER; g.lineWidth=2;
  g.beginPath(); g.ellipse(x,y+2,16+rp*26,7+rp*10,0,0,Math.PI*2); g.stroke();
  g.restore();
  var S=(encW.kind==='tourist')?R_SPR.visitor_tourist:R_SPR.visitor_poet;
  var sc=1.4, w=S.w*R_PXB*sc, h=S.h*R_PXB*sc;
  var lx=x+encW.dir*20*sc, ly=y-h+22*R_PXB*sc;
  var fi=((Math.floor(R_tSec*7))%3+3)%3;
  var fr=R_glowAmb[(fi+((encW.kind==='poet')?0:1))%3];
  var gz=74;
  g.save(); g.globalCompositeOperation='lighter'; g.globalAlpha=0.9;
  g.drawImage(fr.cv,lx-gz/2,ly-gz/2,gz,gz);
  g.restore();
  var dx=R_q(x-w/2), dy=R_q(y-h);
  if(encW.dir<0){ g.drawImage(S.cv, dx+w, dy, -w, h); }
  else { g.drawImage(S.cv, dx, dy, w, h); }
}

function R_drawParticles(g){
  var i,p,a,spr,sz;
  for(i=0;i<R_partN;i++){
    p=R_part[i];
    a=p.life/p.max;
    if(p.type===0){
      sz=p.size*2.4;
      g.save();
      g.translate(R_q(p.x),R_q(p.y)); g.rotate(p.rot);
      g.globalAlpha=Math.min(1,a*1.6);
      g.drawImage(R_coinSpr.cv,-sz/2,-sz/2,sz,sz);
      g.restore();
    } else if(p.type===1){
      spr=R_steamSpr[p.spr%3];
      sz=p.size*1.1;
      g.save();
      g.globalAlpha=0.16*a;
      g.drawImage(spr.cv,R_q(p.x-sz/2),R_q(p.y-sz/2),sz,sz);
      g.restore();
    } else if(p.type===2){
      var blink=0.25+0.75*Math.abs(Math.sin(R_tSec*3+p.aux));
      g.save();
      g.globalAlpha=blink*Math.min(1,a*2);
      g.drawImage(R_fireflySpr.cv,R_q(p.x-4),R_q(p.y-4),8,8);
      g.restore();
    } else if(p.type===4){
      spr=R_paperSpr[0];
      g.save();
      g.translate(R_q(p.x),R_q(p.y)); g.rotate(p.rot);
      g.globalAlpha=Math.min(1,a*1.4);
      g.drawImage(spr.cv,-6,-8,12,16);
      g.restore();
    }
  }
  g.globalAlpha=1;
}

function R_frame(nowMs,view){
  if(!R_ready) return;
  view=view||{};
  if(nowMs-R_lastDraw<33) return;
  var dt=R_clamp((nowMs-R_lastT)/1000,0.001,0.25);
  var state=view.state||{};
  var stalls=state.stalls||{};
  R_lastStalls=stalls;
  var rush=!!view.rush;

  var encW=R_encWorld(state);
  R_encW=encW;
  var active=(R_custN>0)||(R_partN>0)||view.tillGlow||
             ((view.gongPulse||0)>0)||view.mode==='welcome'||(R_wasRush!==rush)||!!encW;
  if(active) R_lastActive=nowMs;
  var idle=(nowMs-R_lastActive>5000)&&view.mode!=='welcome';
  if(idle&&(nowMs-R_lastDraw<250)) return;
  R_lastDraw=nowMs; R_lastT=nowMs; R_tSec=nowMs/1000;

  if(rush&&!R_wasRush){
    var k;
    for(k=0;k<22;k++){
      R_spawnPart(4,60+Math.random()*270,470+Math.random()*70,
        Math.random()*120-60,-60-Math.random()*120,1.6+Math.random()*1.2,5);
    }
    for(k=0;k<R_skyL.length;k++){
      var sl=R_skyL[k];
      if(!sl.active){
        sl.active=true;
        sl.x=80+Math.random()*230; sl.y=560+Math.random()*40;
        sl.vy=-(10+Math.random()*6);
        break;
      }
    }
  }
  R_wasRush=rush;

  if(view.mode==='welcome'){ R_welT+=dt; R_welActive=true; }
  else { R_welT=0; R_welActive=false; }
  R_welS=1+Math.min(0.08,R_welT*0.010);

  R_updateSkyLanterns(dt);
  if(!idle){
    R_rebuildOwned(stalls);
    R_ambient(dt,view,stalls);
    R_updateCustomers(dt,view);
    R_updateParticles(dt);
  }

  var g=R_ctx, i, p, tier;
  for(i=0;i<R_plots.length;i++){
    p=R_plots[i];
    tier=R_tierOf(stalls,p.id);
    p.tier=tier;
    R_plotDims(p,tier);
  }

  var ds=R_dpr*R_cover.s;
  g.setTransform(ds,0,0,ds,R_dpr*R_cover.ox,R_dpr*R_cover.oy);
  g.imageSmoothingEnabled=false;
  if(R_welActive){
    g.translate(195,700); g.scale(R_welS,R_welS); g.translate(-195,-700);
  }
  g.drawImage(R_SKY.cv,0,0,R_DW,R_DH);

  for(i=0;i<R_skyL.length;i++){
    p=R_skyL[i];
    if(!p.active) continue;
    var lsp=R_skyLanternSpr[p.cls];
    var lf=lsp.f[Math.floor(R_tSec*6+p.ph)%2];
    g.drawImage(lf.cv,R_q(p.x-lsp.w/2),R_q(p.y-lsp.h/2),lsp.w,lsp.h);
  }

  for(i=0;i<R_plots.length;i++){
    p=R_plots[i];
    if(p.row===0) R_drawStall(g,p,p.tier);
  }
  var n0=R_sortLane(0,R_cOrder), k2;
  for(k2=0;k2<n0;k2++) R_drawCustomer(g,R_cust[R_cOrder[k2]]);
  for(i=0;i<R_plots.length;i++){
    p=R_plots[i];
    if(p.row===1) R_drawStall(g,p,p.tier);
  }
  var n1=R_sortLane(1,R_cOrder2);
  for(k2=0;k2<n1;k2++) R_drawCustomer(g,R_cust[R_cOrder2[k2]]);
  if(encW) R_drawEncounter(g,encW);

  /* crisp pixel lantern bodies (sway) + smooth additive glow */
  var fi=((Math.floor(nowMs/140))%3+3)%3;
  g.globalCompositeOperation='lighter';
  for(i=0;i<R_lanternPts.length;i++){
    var lp=R_lanternPts[i];
    var gset=lp.amber?R_glowAmb:R_glowRed;
    var fr=gset[(fi+lp.ph)%3];
    var gz=lp.r*5.4;
    g.drawImage(fr.cv,lp.x-gz/2,lp.y-gz/2,gz,gz);
  }
  g.globalCompositeOperation='source-over';
  for(i=0;i<R_lanternPts.length;i++){
    var lp2=R_lanternPts[i];
    var LS=lp2.amber?R_SPR.lanternA:R_SPR.lanternR;
    var lw=LS.w*R_PXB, lh=LS.h*R_PXB;
    var swx=Math.round(Math.sin(R_tSec*1.3+lp2.ph*2.1))*R_PXB;
    g.drawImage(LS.cv, R_q(lp2.x-lw/2+swx), R_q(lp2.y-lh/2), lw, lh);
  }

  /* night-till */
  var tw=R_tillSpr.w*R_PXB, th=R_tillSpr.h*R_PXB;
  g.drawImage(R_tillSpr.cv,R_q(R_till.x-tw/2),R_q(R_till.y-th),tw,th);
  if(view.tillGlow){
    var pulse=0.55+0.45*Math.sin(R_tSec*5);
    g.save(); g.globalAlpha=pulse;
    g.drawImage(R_tillGlowSpr.cv,R_till.x-55,R_till.y-80,110,92);
    g.restore();
  }

  R_drawParticles(g);

  var gp=view.gongPulse||0;
  if(gp>0){
    var rr2=24+gp*230, ra=(1-gp)*0.55;
    g.save();
    g.globalAlpha=ra; g.strokeStyle=C_AMBER; g.lineWidth=1+3*(1-gp);
    g.beginPath(); g.arc(R_gong.x,R_gong.y,rr2,0,Math.PI*2); g.stroke();
    g.globalAlpha=ra*0.6; g.lineWidth=1.5;
    g.beginPath(); g.arc(R_gong.x,R_gong.y,rr2*0.72,0,Math.PI*2); g.stroke();
    g.restore();
  }

  if(rush){
    g.fillStyle='rgba(232,130,58,0.07)';
    g.fillRect(0,0,R_DW,R_DH);
  }

  if(view.mode==='welcome'){
    g.setTransform(R_dpr,0,0,R_dpr,0,0);
    g.fillStyle='rgba(5,7,10,0.5)';
    g.fillRect(0,0,R_canvas.width/R_dpr,R_canvas.height/R_dpr);
  }

  g.setTransform(R_dpr,0,0,R_dpr,0,0);
  g.drawImage(R_GRAIN,0,0,R_canvas.width/R_dpr,R_canvas.height/R_dpr);
}
var R_cOrder2=[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23];
var R_lastStalls=null;
function R_initPools(){
  var i;
  if(!R_cust.length){
    for(i=0;i<R_MAXCUST;i++){
      R_cust.push({x:0,y:0,vx:0,dir:1,lane:0,state:0,t:0,pose:0,phase:0,
        speed:40,scale:1,umb:false,phone:false,targetX:0,scooter:false,active:false});
    }
  }
  if(!R_part.length){
    for(i=0;i<R_MAXPART;i++){
      R_part.push({type:0,x:0,y:0,vx:0,vy:0,life:0,max:1,size:4,rot:0,vr:0,
        aux:0,spr:0,active:false});
    }
  }
  if(!R_skyL.length){
    var r=R_rng32(9182), k;
    for(i=0;i<R_MAXSKY;i++){
      /* irregular loose clusters at varied altitudes */
      var cluster=Math.floor(r()*3);
      var cx2=70+cluster*120+(r()*60-30);
      R_skyL.push({x:R_clamp(cx2+r()*40-20,10,380),
        y:r()*560+40, vy:-(7+r()*9), vx:(r()*8-4), ph:r()*6.28,
        cls:Math.floor(r()*3), active:i<8});
    }
    R_skyN=8;
  }
}

function R_init(canvas){
  R_canvas=canvas;
  R_ctx=canvas.getContext('2d');
  R_initPools();
  R_resize();
  R_ready=true;
  R_lastT=performance.now(); R_lastDraw=0; R_lastActive=R_lastT;
}

function R_resize(){
  if(!R_canvas) return;
  var cw=R_canvas.clientWidth, ch=R_canvas.clientHeight;
  if(!cw||!ch) return;
  R_dpr=Math.min(R_MAXDPR, window.devicePixelRatio||1);
  var changed=(Math.abs(R_canvas.width-Math.round(cw*R_dpr))>2);
  R_canvas.width=Math.round(cw*R_dpr);
  R_canvas.height=Math.round(ch*R_dpr);
  R_ctx.imageSmoothingEnabled=false;
  /* cover-fit the 390x844 design space */
  var s=Math.max(cw/R_DW, ch/R_DH);
  R_cover.s=s; R_cover.ox=(cw-R_DW*s)/2; R_cover.oy=(ch-R_DH*s)/2;
  if(changed||!R_SKY) R_buildAll();
}

function R_tierOf(stalls,id){
  var n=(stalls&&stalls[id])||0;
  if(n<=0) return 0;
  return n>=25?2:1;
}
function R_rebuildOwned(stalls){
  var i, n=0;
  for(i=0;i<R_plots.length;i++){
    var p=R_plots[i];
    if(((stalls&&stalls[p.id])||0)>0){ R_ownedArr[n]=p; n++; }
  }
  R_ownedN=n;
}
/* plot hit dims follow the current tier sprite */
function R_plotDims(p,tier){
  var spr=(tier===2)?R_stallSpr[p.id].truck:R_stallSpr[p.id].cart;
  p.hw=spr.w*R_PXB*p.sc/2; p.hh=spr.w>0?spr.h*R_PXB*p.sc:60;
  p.sw=spr.w*R_PXB*p.sc; p.sh=spr.h*R_PXB*p.sc;
}

function R_spawnCustomer(rush,cps){
  if(R_custN>=R_MAXCUST) return;
  var r=Math.random, i;
  var p=null;
  for(i=0;i<R_MAXCUST;i++){ if(!R_cust[i].active){ p=R_cust[i]; break; } }
  if(!p) return;
  var fromLeft=r()<0.5;
  var isScooter=r()<0.07;
  var lane=(R_ownedN>0&&r()<0.45)?1:0;
  p.active=true; p.scooter=isScooter;
  p.dir=fromLeft?1:-1;
  p.x=fromLeft?-30:R_DW+30;
  p.y=isScooter?600:(lane?748+r()*36:638+r()*52);
  p.lane=lane;
  var base=isScooter?230+r()*70:38+r()*26;
  p.speed=base*(rush?1.6:1)*(0.9+r()*0.2);
  p.vx=p.dir*p.speed;
  p.scale=(lane?1.02:0.9)*(0.92+r()*0.16);
  p.phase=r()*6.28;
  p.umb=!isScooter&&r()<0.14;
  p.phone=!isScooter&&r()<0.18;
  if(isScooter){
    p.state=3; p.t=1e9; p.targetX=fromLeft?R_DW+60:-60;
  } else {
    p.state=0; p.t=0;
    if(R_ownedN>0&&r()<0.72){
      var tp=R_ownedArr[Math.floor(r()*R_ownedN)];
      p.targetX=tp.x+(r()*36-18);
      p.lane=(tp.row===1)?1:0;
      p.y=p.lane?748+r()*36:638+r()*52;
    } else {
      p.targetX=fromLeft?R_DW+40:-40;
    }
  }
  p.pose=Math.floor(r()*4);
  R_custN++;
}

function R_updateCustomers(dt,view){
  var i, p;
  for(i=R_custN-1;i>=0;i--){
    p=R_cust[i];
    if(!p.active) continue;
    p.phase+=dt*(p.scooter?2:7);
    if(p.scooter){
      p.x+=p.vx*dt;
      if((p.dir>0&&p.x>R_DW+70)||(p.dir<0&&p.x<-70)){ p.active=false; }
      continue;
    }
    if(p.state===0){ /* enter: walk to target */
      p.x+=p.vx*dt;
      var d=p.targetX-p.x;
      if((p.dir>0&&d<=2)||(p.dir<0&&d>=-2)){
        p.state=1; p.t=1.4+Math.random()*2.2; p.pose=0;
      } else if(Math.abs(d)<140&&Math.sign(d)!==p.dir&&Math.abs(d)>4){
        p.dir=Math.sign(d); p.vx=p.dir*p.speed;
      }
    } else if(p.state===1){ /* browse: mid-motion pause, small drift */
      p.t-=dt;
      p.x+=p.dir*6*dt;
      if(p.t<=0){
        if(Math.random()<0.55){ p.state=2; p.t=0.6; }
        else { p.state=3; p.dir=(p.x<R_DW/2?-1:1); p.vx=p.dir*p.speed; }
      }
    } else if(p.state===2){ /* buy: hop + coin pop */
      p.t-=dt;
      if(p.t<=0){
        var k;
        for(k=0;k<3;k++) R_spawnPart(0,p.x+(Math.random()*16-8),p.y-46,
          Math.random()*90-45,-120-Math.random()*60,0.7+Math.random()*0.3,5);
        p.state=3; p.dir=(p.x<R_DW/2?-1:1); p.vx=p.dir*p.speed;
      }
    } else { /* exit */
      p.x+=p.vx*dt;
      if((p.dir>0&&p.x>R_DW+40)||(p.dir<0&&p.x<-40)){ p.active=false; }
    }
  }
  /* compact: swap-and-pop inactive */
  var w=0;
  for(i=0;i<R_custN;i++){
    if(R_cust[i].active){ if(i!==w){ var tmp=R_cust[w]; R_cust[w]=R_cust[i]; R_cust[i]=tmp; } w++; }
  }
  R_custN=w;
}

function R_spawnPart(type,x,y,vx,vy,life,size){
  if(R_partN>=R_MAXPART) return;
  var p=R_part[R_partN];
  p.type=type; p.x=x; p.y=y; p.vx=vx; p.vy=vy;
  p.life=life; p.max=life; p.size=size;
  p.rot=Math.random()*6.28; p.vr=(Math.random()*6-3);
  p.aux=Math.random()*6.28; p.spr=Math.floor(Math.random()*3);
  p.active=true;
  R_partN++;
}

function R_updateParticles(dt){
  var i, p;
  for(i=R_partN-1;i>=0;i--){
    p=R_part[i];
    p.life-=dt;
    if(p.life<=0){ p.active=false; continue; }
    if(p.type===0){            /* coin: gravity arc */
      p.vy+=900*dt; p.x+=p.vx*dt; p.y+=p.vy*dt; p.rot+=p.vr*dt;
    } else if(p.type===1){     /* steam: rise, expand */
      p.y+=p.vy*dt; p.x+=p.vx*dt+Math.sin(R_tSec*3+p.aux)*14*dt;
    } else if(p.type===2){     /* firefly: wander + blink */
      p.x+=Math.sin(R_tSec*1.7+p.aux)*22*dt;
      p.y+=Math.cos(R_tSec*2.3+p.aux*1.7)*16*dt;
    } else if(p.type===4){     /* paper bits: flutter down */
      p.vy+=260*dt; p.vy=Math.min(p.vy,90);
      p.x+=p.vx*dt+Math.sin(R_tSec*6+p.aux)*30*dt;
      p.y+=p.vy*dt; p.rot+=p.vr*dt;
    }
  }
  var w=0;
  for(i=0;i<R_partN;i++){
    if(R_part[i].active){ if(i!==w){ var tmp=R_part[w]; R_part[w]=R_part[i]; R_part[i]=tmp; } w++; }
  }
  R_partN=w;
}

function R_updateSkyLanterns(dt){
  var i, p;
  for(i=0;i<R_skyL.length;i++){
    p=R_skyL[i];
    if(!p.active) continue;
    p.y+=p.vy*dt;
    p.x+=(Math.sin(R_tSec*0.4+p.ph)*9+p.vx)*dt;
    if(p.y<-60){
      p.y=R_DH+30+Math.random()*60;
      p.x=20+Math.random()*(R_DW-40);
      p.vy=-(7+Math.random()*9);
    }
  }
}

/* ambient spawners — module-scope accumulators, zero alloc */
function R_ambient(dt,view,stalls){
  var cps=(view.state&&view.state.rates&&view.state.rates.coinsPerSec)||0;
  var rush=!!view.rush;
  /* customers */
  var rate=(0.28+Math.min(1.5,cps/28))*(rush?1.9:1);
  R_spawnAcc+=dt*rate;
  while(R_spawnAcc>=1){ R_spawnAcc-=1; R_spawnCustomer(rush,cps); }
  /* steam from hot-food stalls */
  var i;
  for(i=0;i<R_plots.length;i++){
    var pl=R_plots[i], vis=R_STALLVIS[pl.id];
    if(!vis.steam||!((stalls&&stalls[pl.id])||0)) continue;
    var tier=R_tierOf(stalls,pl.id);
    R_steamAcc[i]+=dt*vis.steam*(tier===2?1.8:1);
    while(R_steamAcc[i]>=1){
      R_steamAcc[i]-=1;
      var spr=(tier===2?R_stallSpr[pl.id].truck:R_stallSpr[pl.id].cart);
      R_spawnPart(1, pl.x+(Math.random()*20-10)*pl.sc,
        pl.y-spr.h*R_PXB*pl.sc+16, Math.random()*8-4, -(26+Math.random()*14),
        2.2+Math.random(), 10+Math.random()*5);
    }
  }
  /* fireflies over the ground */
  var ff=0, k;
  for(k=0;k<R_partN;k++){ if(R_part[k].type===2) ff++; }
  if(ff<8){
    R_ffAcc+=dt;
    while(R_ffAcc>0.9&&ff<8){
      R_ffAcc-=0.9; ff++;
      R_spawnPart(2, 30+Math.random()*(R_DW-60), 560+Math.random()*240,
        0,0, 6+Math.random()*6, 4);
    }
  } else R_ffAcc=0;
  /* till coin pops while claimable */
  if(view.tillGlow){
    R_tillAcc+=dt;
    while(R_tillAcc>0.42){
      R_tillAcc-=0.42;
      R_spawnPart(0, R_till.x+(Math.random()*40-20), R_till.y-52,
        Math.random()*80-40, -140-Math.random()*60, 0.9, 6);
    }
  } else R_tillAcc=0;
}

/* encounter world position: derived from sim time so it survives reloads.
 * active={kind,expiresAt}; wanders 25s across the lane between the rows. */
function R_encWorld(state){
  var enc=state&&state.encounters&&state.encounters.active;
  if(!enc) return null;
  var pt=(state.stats&&state.stats.playTime)||0;
  var span=25, start=enc.expiresAt-span;
  var prog=(pt-start)/span;
  prog=prog<0?0:(prog>1?1:prog);
  var dir=(enc.kind==='tourist')?-1:1;      /* poet drifts in from the left */
  var x0=-52, x1=R_DW+52;
  var x=dir>0?x0+(x1-x0)*prog:x1-(x1-x0)*prog;
  return {x:x, y:672, dir:dir, kind:enc.kind};
}

function R_sortLane(lane,order){
  var n=0,i,j,p;
  for(i=0;i<R_custN;i++){ if(R_cust[i].lane===lane){ order[n]=i; n++; } }
  for(i=1;i<n;i++){
    var key=order[i], ky=R_cust[key].y;
    j=i-1;
    while(j>=0&&R_cust[order[j]].y>ky){ order[j+1]=order[j]; j--; }
    order[j+1]=key;
  }
  return n;
}
/* ================= hit testing / anchors ================= */
function R_inPlot(p,wx,wy){
  return wx>=p.x-p.hw&&wx<=p.x+p.hw&&wy>=p.y-p.hh&&wy<=p.y;
}
function R_hitTest(x,y){
  if(!R_ready) return null;
  var wx=(x-R_cover.ox)/R_cover.s, wy=(y-R_cover.oy)/R_cover.s;
  if(R_welActive&&R_welS>1.001){
    wx=(wx-195)/R_welS+195; wy=(wy-700)/R_welS+700;
  }
  /* encounter wanderer: generous 68px touch target, checked first */
  if(R_encW){
    var edx=wx-R_encW.x, edy=wy-(R_encW.y-32);
    if(edx*edx+edy*edy<=34*34) return {kind:'visitor'};
  }
  var t=R_tillRect;
  if(wx>=t.x&&wx<=t.x+t.w&&wy>=t.y&&wy<=t.y+t.h) return {kind:'till'};
  var i,p;
  for(i=0;i<R_plots.length;i++){
    p=R_plots[i];
    if(p.row!==1) continue;
    if(R_inPlot(p,wx,wy)) return {kind:'stall',id:p.id};
  }
  for(i=0;i<R_plots.length;i++){
    p=R_plots[i];
    if(p.row!==0) continue;
    if(R_inPlot(p,wx,wy)) return {kind:'stall',id:p.id};
  }
  return null;
}
function R_stallAnchor(id){
  if(!R_ready) return null;
  var i,p=null;
  for(i=0;i<R_plots.length;i++){ if(R_plots[i].id===id){ p=R_plots[i]; break; } }
  if(!p||!R_stallSpr[id]) return null;
  var tier=R_tierOf(R_lastStalls,p.id);
  var S=(tier===2)?R_stallSpr[p.id].truck:R_stallSpr[p.id].cart;
  var wx=p.x, wy=p.y-S.h*R_PXB*p.sc-12;
  return {x:R_cover.ox+wx*R_cover.s, y:R_cover.oy+wy*R_cover.s};
}
/* screen-space (canvas CSS px) anchor for the encounter wanderer, or null */
function R_visitorAnchor(){
  if(!R_ready||!R_encW) return null;
  var wx=R_encW.x, wy=R_encW.y-32;
  if(R_welActive&&R_welS>1.001){
    wx=(wx-195)*R_welS+195; wy=(wy-700)*R_welS+700;
  }
  return {x:R_cover.ox+wx*R_cover.s, y:R_cover.oy+wy*R_cover.s};
}

/* ================= public API ================= */
window.__render_debug={
  entityCounts:function(){ return {customers:R_custN, particles:R_partN}; }
};

return {
  init:R_init,
  resize:R_resize,
  frame:R_frame,
  hitTest:R_hitTest,
  stallAnchor:R_stallAnchor,
  visitorAnchor:R_visitorAnchor,
  plots:R_plots,
  cover:R_cover
};
})();
