/* Emberline — prerendered sprite art, seen from the cab looking down the track.
   Warm storybook style (earth tones, soft greens, golden light).
   Everything is drawn once to offscreen canvases; the game blits.
   No emojis, no per-frame allocation. */
'use strict';
var ART=(function(){
var cache={};
function cv(w,h){
  var c=document.createElement('canvas'); c.width=Math.ceil(w*2); c.height=Math.ceil(h*2);
  var g=c.getContext('2d'); g.scale(2,2); g.lineJoin='round'; g.lineCap='round';
  return [c,g];
}
function rr(g,x,y,w,h,r){ g.beginPath(); g.moveTo(x+r,y); g.arcTo(x+w,y,x+w,y+h,r); g.arcTo(x+w,y+h,x,y+h,r); g.arcTo(x,y+h,x,y,r); g.arcTo(x,y,x+w,y,r); g.closePath(); }

/* warm palette */
var P={
  stone:'#b9a98c', stoneD:'#8f7f63', stoneL:'#d3c5a8',
  slate:'#5d6572', slateL:'#78818f',
  wood:'#7a5a3c', woodD:'#5c422a', woodL:'#97714c',
  glow:'#ffca7a', glowHot:'#ffe9b8',
  cream:'#f3e7cd',
  green:'#7ba05b', greenD:'#5c7d43', greenL:'#9cc47a',
  pine:'#4e7a52', pineD:'#3a5f40',
  roofRed:'#a8452f', roofRedD:'#7e3323',
  sky:'#f7e8c8'
};

/* ---------- station house (200 x 140) ---------- */
function stationHouse(){
  if(cache.stationHouse) return cache.stationHouse;
  var W=200,H=140,c=cv(W,H),g=c[1];
  // main stone block
  g.fillStyle=P.stone; g.fillRect(30,64,140,76);
  g.fillStyle=P.stoneD;
  for(var cy=72;cy<134;cy+=14){ g.fillRect(30,cy,140,2); }
  for(var ci=0;ci<9;ci++){ g.fillRect(30+ci*16,64,2,76); }
  // slight front-angle shading: right edge darker, left lighter
  g.fillStyle='rgba(255,240,210,0.18)'; g.fillRect(30,64,22,76);
  g.fillStyle='rgba(60,40,20,0.16)'; g.fillRect(148,64,22,76);
  // pitched slate roof
  g.fillStyle=P.slate;
  g.beginPath(); g.moveTo(18,68); g.lineTo(100,22); g.lineTo(182,68); g.closePath(); g.fill();
  g.fillStyle=P.slateL;
  g.beginPath(); g.moveTo(18,68); g.lineTo(100,22); g.lineTo(100,68); g.closePath(); g.fill();
  g.strokeStyle='rgba(0,0,0,0.25)'; g.lineWidth=1;
  for(var rx=40;rx<170;rx+=15){ g.beginPath(); g.moveTo(rx,60); g.lineTo(rx+9,68); g.stroke(); }
  // chimney
  g.fillStyle='#8f7f63'; g.fillRect(132,18,16,34);
  g.fillStyle='#5c422a'; g.fillRect(129,14,22,6);
  // warm windows (two front, seen at slight angle)
  function win(wx,wy){
    g.fillStyle=P.woodD; g.fillRect(wx-2,wy-2,26,32);
    var gr=g.createRadialGradient(wx+11,wy+13,2,wx+11,wy+13,15);
    gr.addColorStop(0,P.glowHot); gr.addColorStop(1,P.glow);
    g.fillStyle=gr; g.fillRect(wx,wy,22,28);
    g.strokeStyle=P.woodD; g.lineWidth=2;
    g.beginPath(); g.moveTo(wx+11,wy); g.lineTo(wx+11,wy+28); g.stroke();
    g.beginPath(); g.moveTo(wx,wy+14); g.lineTo(wx+22,wy+14); g.stroke();
  }
  win(48,84); win(130,84);
  // door with warm transom
  g.fillStyle=P.woodD; g.fillRect(88,88,24,52);
  g.fillStyle=P.wood; g.fillRect(91,92,18,48);
  g.fillStyle=P.glow; g.fillRect(91,92,18,10);
  g.fillStyle='#3a2c1c'; g.beginPath(); g.arc(106,118,2.4,0,7); g.fill();
  // platform canopy: angled posts + awning
  g.fillStyle=P.woodD;
  g.fillRect(176,60,5,80); g.fillRect(14,60,5,80);
  g.fillStyle=P.roofRed;
  g.beginPath(); g.moveTo(8,62); g.lineTo(190,62); g.lineTo(178,46); g.lineTo(22,46); g.closePath(); g.fill();
  g.fillStyle=P.roofRedD;
  g.beginPath(); g.moveTo(8,62); g.lineTo(100,62); g.lineTo(100,46); g.lineTo(22,46); g.closePath(); g.fill();
  // hanging lantern
  g.strokeStyle=P.woodD; g.lineWidth=2;
  g.beginPath(); g.moveTo(100,62); g.lineTo(100,74); g.stroke();
  g.fillStyle=P.glow; g.beginPath(); g.arc(100,80,6,0,7); g.fill();
  g.fillStyle=P.glowHot; g.beginPath(); g.arc(100,79,3,0,7); g.fill();
  cache.stationHouse=c[0]; return c[0];
}

/* ---------- blank wooden sign (120 x 40) — game labels with canvas text ---------- */
function signBlank(){
  if(cache.signBlank) return cache.signBlank;
  var W=120,H=40,c=cv(W,H),g=c[1];
  g.fillStyle=P.woodD; g.fillRect(8,10,104,18);
  g.fillStyle=P.wood; g.fillRect(10,12,100,14);
  g.fillStyle=P.woodL;
  for(var i=0;i<5;i++){ g.fillRect(12+i*20,12,3,14); } // plank seams
  g.strokeStyle='#e8dcc0'; g.lineWidth=2; // light inner border for text area
  g.strokeRect(16,15,88,8);
  g.fillStyle='#3a2c1c';
  g.fillRect(14,6,8,24); g.fillRect(98,6,8,24); // posts
  g.fillStyle=P.stoneD;
  g.beginPath(); g.arc(18,8,6,0,7); g.fill();
  g.beginPath(); g.arc(102,8,6,0,7); g.fill();
  cache.signBlank=c[0]; return c[0];
}

/* ---------- telegraph pole (40 x 160) ---------- */
function telegraphPole(){
  if(cache.telegraphPole) return cache.telegraphPole;
  var W=40,H=160,c=cv(W,H),g=c[1];
  var gr=g.createLinearGradient(14,0,26,0);
  gr.addColorStop(0,P.woodL); gr.addColorStop(0.5,P.wood); gr.addColorStop(1,P.woodD);
  g.fillStyle=gr; g.fillRect(14,10,12,150);
  g.fillStyle=P.woodD; g.fillRect(14,10,12,4);
  // crossarm with slight perspective tilt
  g.fillStyle=P.woodD;
  g.beginPath(); g.moveTo(2,26); g.lineTo(38,22); g.lineTo(38,30); g.lineTo(2,34); g.closePath(); g.fill();
  g.fillStyle='#3a2c1c';
  g.fillRect(6,28,3,8); g.fillRect(31,25,3,8); // insulators
  // sagging wires from both ends
  g.strokeStyle='rgba(40,32,24,0.8)'; g.lineWidth=1.5;
  g.beginPath(); g.moveTo(0,30); g.quadraticCurveTo(-30,52,-60,34); g.stroke();
  g.beginPath(); g.moveTo(40,27); g.quadraticCurveTo(70,49,100,31); g.stroke();
  cache.telegraphPole=c[0]; return c[0];
}

/* ---------- trees ---------- */
function tree(){
  if(cache.tree) return cache.tree;
  var W=80,H=120,c=cv(W,H),g=c[1];
  g.fillStyle=P.woodD;
  g.beginPath(); g.moveTo(36,120); g.quadraticCurveTo(38,95,34,84); g.lineTo(46,84); g.quadraticCurveTo(42,95,44,120); g.closePath(); g.fill();
  g.strokeStyle=P.woodD; g.lineWidth=4;
  g.beginPath(); g.moveTo(40,95); g.quadraticCurveTo(28,80,24,66); g.stroke();
  g.beginPath(); g.moveTo(40,90); g.quadraticCurveTo(52,76,56,64); g.stroke();
  // soft painted canopy: layered blobs
  var blobs=[[40,44,26],[22,58,17],[58,58,17],[32,32,15],[50,30,15],[40,58,20]];
  blobs.forEach(function(b,i){
    g.fillStyle=i%2?P.green:P.greenL;
    g.beginPath(); g.arc(b[0],b[1],b[2],0,7); g.fill();
  });
  g.fillStyle='rgba(255,240,200,0.25)';
  g.beginPath(); g.arc(32,34,10,0,7); g.fill();
  g.fillStyle='rgba(40,70,30,0.25)';
  g.beginPath(); g.arc(52,58,12,0,7); g.fill();
  cache.tree=c[0]; return c[0];
}
function pine(){
  if(cache.pine) return cache.pine;
  var W=70,H=130,c=cv(W,H),g=c[1];
  g.fillStyle=P.woodD; g.fillRect(31,108,8,22);
  var layers=[[35,20,16],[35,46,22],[35,74,28],[35,102,33]];
  layers.forEach(function(L,i){
    g.fillStyle=i%2?P.pine:P.pineD;
    g.beginPath(); g.moveTo(35-L[2],L[1]+26); g.lineTo(35,L[1]); g.lineTo(35+L[2],L[1]+26); g.closePath(); g.fill();
  });
  g.fillStyle='rgba(255,240,200,0.18)';
  g.beginPath(); g.moveTo(35,20); g.lineTo(24,52); g.lineTo(35,60); g.closePath(); g.fill();
  cache.pine=c[0]; return c[0];
}

/* ---------- distant farmhouse (120 x 90) ---------- */
function cottage(){
  if(cache.cottage) return cache.cottage;
  var W=120,H=90,c=cv(W,H),g=c[1];
  // body: soft cream with angle shading
  g.fillStyle=P.cream; g.fillRect(24,44,72,46);
  g.fillStyle='rgba(160,130,90,0.25)'; g.fillRect(66,44,30,46);
  // red gambrel-ish pitched roof
  g.fillStyle=P.roofRed;
  g.beginPath(); g.moveTo(16,48); g.lineTo(60,18); g.lineTo(104,48); g.closePath(); g.fill();
  g.fillStyle=P.roofRedD;
  g.beginPath(); g.moveTo(60,18); g.lineTo(104,48); g.lineTo(60,48); g.closePath(); g.fill();
  // attic window + warm door + lit windows
  g.fillStyle=P.glow; g.fillRect(54,32,12,10);
  g.fillStyle=P.woodD; g.fillRect(52,30,16,14); g.fillStyle=P.glow; g.fillRect(55,33,10,8);
  g.fillStyle=P.glow; g.fillRect(32,56,14,14); g.fillRect(74,56,14,14);
  g.fillStyle=P.woodD;
  g.fillRect(54,60,12,30);
  g.fillStyle='rgba(255,220,150,0.7)'; g.fillRect(56,62,8,6);
  cache.cottage=c[0]; return c[0];
}

/* ---------- friends (60 x 60), simple charming silhouettes ---------- */
function friend(kind){
  var key='friend_'+kind; if(cache[key]) return cache[key];
  var W=60,H=60,c=cv(W,H),g=c[1];
  if(kind==='heron'){
    g.fillStyle='#8b9aa8'; // blue-grey wader
    g.fillRect(28,20,4,26);
    g.beginPath(); g.ellipse(30,16,9,6,0,0,7); g.fill();
    g.fillStyle='#aebdc9'; g.beginPath(); g.ellipse(30,14,9,4,0,0,7); g.fill();
    g.strokeStyle='#8b9aa8'; g.lineWidth=3;
    g.beginPath(); g.moveTo(37,14); g.quadraticCurveTo(48,8,46,2); g.stroke();
    g.fillStyle='#8b9aa8'; g.beginPath(); g.arc(47,2,4,0,7); g.fill();
    g.fillStyle='#e0a83c'; g.beginPath(); g.moveTo(50,2); g.lineTo(58,3.5); g.lineTo(50,5); g.closePath(); g.fill();
    g.fillStyle='#3a4652'; g.beginPath(); g.arc(48,1,1.2,0,7); g.fill();
  }else if(kind==='fox'){
    g.fillStyle='#c96f3a'; // russet fox
    g.beginPath(); g.ellipse(28,40,14,10,0,0,7); g.fill();
    g.beginPath(); g.arc(41,30,8,0,7); g.fill();
    g.beginPath(); g.moveTo(35,25); g.lineTo(36,16); g.lineTo(41,23); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(42,23); g.lineTo(47,16); g.lineTo(47,25); g.closePath(); g.fill();
    g.fillStyle='#f3e7cd'; g.beginPath(); g.ellipse(28,44,8,5,0,0,7); g.fill();
    g.strokeStyle='#c96f3a'; g.lineWidth=5;
    g.beginPath(); g.moveTo(15,42); g.quadraticCurveTo(4,48,8,56); g.stroke();
    g.fillStyle='#f3e7cd'; g.beginPath(); g.arc(8,56,3.5,0,7); g.fill();
    g.fillStyle='#3a2c1c'; g.beginPath(); g.arc(44,29,1.6,0,7); g.fill();
    g.beginPath(); g.moveTo(48,33); g.lineTo(51,34.5); g.lineTo(48,36); g.closePath(); g.fill();
  }else if(kind==='kids'){
    // two small waving figures
    function kid(x,col){
      g.fillStyle=col; g.beginPath(); g.arc(x,24,5,0,7); g.fill();
      g.fillStyle='#caa07a'; g.beginPath(); g.arc(x,24,4,0,7); g.fill();
      g.fillStyle=col; rr(g,x-5,30,10,16,3); g.fill();
      g.strokeStyle=col; g.lineWidth=3;
      g.beginPath(); g.moveTo(x+5,34); g.lineTo(x+12,24); g.stroke(); // waving arm
      g.beginPath(); g.moveTo(x-5,34); g.lineTo(x-9,42); g.stroke();
      g.beginPath(); g.moveTo(x+5,34); g.lineTo(x+9,42); g.stroke();
    }
    kid(20,'#7b8fc9'); kid(42,'#c97b8f');
  }else if(kind==='sheep'){
    g.fillStyle='#e9e2d2'; // woolly sheep
    [[22,34,9],[32,30,11],[42,34,9],[28,40,10],[38,40,10],[32,26,9]].forEach(function(b){
      g.beginPath(); g.arc(b[0],b[1],b[2],0,7); g.fill();
    });
    g.fillStyle='#5c5348'; g.beginPath(); g.ellipse(48,36,5,6,0.3,0,7); g.fill();
    g.fillStyle='#3a352e'; g.beginPath(); g.arc(50,34,1.3,0,7); g.fill();
    g.strokeStyle='#5c5348'; g.lineWidth=3;
    [[24,44],[32,45],[40,44]].forEach(function(l){ g.beginPath(); g.moveTo(l[0],l[1]); g.lineTo(l[0],54); g.stroke(); });
  }else if(kind==='elder'){
    // old-timer with cane and hat
    g.fillStyle='#4a5a78'; rr(g,20,30,20,20,6); g.fill();
    g.fillStyle='#caa07a'; g.beginPath(); g.arc(30,22,7,0,7); g.fill();
    g.fillStyle='#e8e0d0'; g.fillRect(23,17,14,4); // white hair
    g.fillStyle='#5c422a';
    g.beginPath(); g.moveTo(20,16); g.lineTo(40,16); g.lineTo(36,8); g.lineTo(24,8); g.closePath(); g.fill(); // hat
    g.strokeStyle='#7a5a3c'; g.lineWidth=3;
    g.beginPath(); g.moveTo(44,32); g.lineTo(48,54); g.stroke(); // cane
    g.strokeStyle='#4a5a78'; g.lineWidth=4;
    g.beginPath(); g.moveTo(25,50); g.lineTo(25,56); g.stroke();
    g.beginPath(); g.moveTo(35,50); g.lineTo(35,56); g.stroke();
  }else{ // 'deer'
    g.fillStyle='#a8763e'; // fawn
    g.beginPath(); g.ellipse(28,42,12,8,0,0,7); g.fill();
    g.strokeStyle='#a8763e'; g.lineWidth=4;
    g.beginPath(); g.moveTo(37,38); g.quadraticCurveTo(40,26,44,22); g.stroke();
    g.fillStyle='#a8763e'; g.beginPath(); g.arc(45,20,5,0,7); g.fill();
    g.strokeStyle='#6e4e26'; g.lineWidth=2;
    g.beginPath(); g.moveTo(43,15); g.lineTo(40,8); g.moveTo(44,15); g.lineTo(45,8); g.stroke();
    g.beginPath(); g.moveTo(41,12); g.lineTo(46,10); g.moveTo(46,12); g.lineTo(49,7); g.stroke(); // antler forks
    g.fillStyle='#f3e7cd';
    g.beginPath(); g.arc(24,40,1.6,0,7); g.fill(); g.beginPath(); g.arc(30,42,1.6,0,7); g.fill();
    g.beginPath(); g.arc(27,45,1.6,0,7); g.fill(); // spots
    g.fillStyle='#3a2c1c'; g.beginPath(); g.arc(47,19,1.4,0,7); g.fill();
    g.strokeStyle='#a8763e'; g.lineWidth=3;
    [[20,48],[28,49],[36,48]].forEach(function(l){ g.beginPath(); g.moveTo(l[0],l[1]); g.lineTo(l[0],56); g.stroke(); });
  }
  cache[key]=c[0]; return c[0];
}

/* ---------- soft smoke puff (40 x 40) ---------- */
function smokePuff(){
  if(cache.smokePuff) return cache.smokePuff;
  var W=40,H=40,c=cv(W,H),g=c[1];
  var gr=g.createRadialGradient(20,20,2,20,20,18);
  gr.addColorStop(0,'rgba(245,242,236,0.95)');
  gr.addColorStop(0.6,'rgba(232,228,220,0.55)');
  gr.addColorStop(1,'rgba(220,216,208,0)');
  g.fillStyle=gr; g.beginPath(); g.arc(20,20,19,0,7); g.fill();
  cache.smokePuff=c[0]; return c[0];
}

/* ---------- trackside signal lamp (30 x 60) — game tints the lamp ---------- */
function signalLamp(){
  if(cache.signalLamp) return cache.signalLamp;
  var W=30,H=60,c=cv(W,H),g=c[1];
  g.fillStyle='#3c3a36';
  g.fillRect(13,18,4,42);
  g.beginPath(); g.moveTo(8,60); g.lineTo(22,60); g.lineTo(18,50); g.lineTo(12,50); g.closePath(); g.fill();
  g.fillStyle='#232120';
  g.beginPath(); g.arc(15,12,9,0,7); g.fill();
  g.fillStyle='#8a857c'; g.beginPath(); g.arc(15,12,9,0,7); g.stroke();
  // lamp glass left bright white; the game tints via drawImage + globalCompositeOperation or overlay
  g.fillStyle='#fdfbf4'; g.beginPath(); g.arc(15,12,5.5,0,7); g.fill();
  g.fillStyle='rgba(255,255,255,0.9)'; g.beginPath(); g.arc(13.5,10.5,2,0,7); g.fill();
  cache.signalLamp=c[0]; return c[0];
}

return {
  stationHouse:stationHouse, signBlank:signBlank, telegraphPole:telegraphPole,
  tree:tree, pine:pine, cottage:cottage,
  friend:friend, smokePuff:smokePuff, signalLamp:signalLamp
};
})();
