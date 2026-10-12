/* Greywater Light — prerendered sprite art. Everything is drawn once
   to offscreen canvases; the game blits. No emojis, all hand-drawn. */
'use strict';
var ART=(function(){
var cache={};
function cv(w,h){
  var c=document.createElement('canvas'); c.width=Math.ceil(w*2); c.height=Math.ceil(h*2);
  var g=c.getContext('2d'); g.scale(2,2); g.lineJoin='round'; g.lineCap='round';
  return [c,g];
}
function rr(g,x,y,w,h,r){ g.beginPath(); g.moveTo(x+r,y); g.arcTo(x+w,y,x+w,y+h,r); g.arcTo(x+w,y+h,x,y+h,r); g.arcTo(x,y+h,x,y,r); g.arcTo(x,y,x+w,y,r); g.closePath(); }

/* ---------- the lighthouse (140 x 380 logical) ---------- */
function lighthouse(){
  if(cache.lighthouse) return cache.lighthouse;
  var W=140,H=380,c= cv(W,H),g=c[1];
  // stone foundation
  g.fillStyle='#5a5f66';
  g.beginPath(); g.moveTo(18,H); g.lineTo(24,H-46); g.lineTo(116,H-46); g.lineTo(122,H); g.closePath(); g.fill();
  g.strokeStyle='rgba(0,0,0,0.25)'; g.lineWidth=2;
  for(var i=0;i<3;i++){ g.beginPath(); g.moveTo(22+i*4,H-12-i*11); g.lineTo(118-i*4,H-12-i*11); g.stroke(); }
  // tower: tapered, white with red bands
  var topW=64,botW=96,tx=(W-topW)/2,bx=(W-botW)/2,ty=64,by=H-46;
  function band(y0,y1,col){
    var t0=(y0-ty)/(by-ty),t1=(y1-ty)/(by-ty);
    var w0=topW+(botW-topW)*t0, w1=topW+(botW-topW)*t1;
    g.fillStyle=col;
    g.beginPath();
    g.moveTo((W-w0)/2,y0); g.lineTo((W+w0)/2,y0);
    g.lineTo((W+w1)/2,y1); g.lineTo((W-w1)/2,y1);
    g.closePath(); g.fill();
  }
  band(ty,by,'#e9e4d8');
  band(120,168,'#a83a32'); band(216,264,'#a83a32');
  // shading: shadow right, light left
  var gr=g.createLinearGradient(0,0,W,0);
  gr.addColorStop(0,'rgba(255,255,255,0.28)'); gr.addColorStop(0.45,'rgba(255,255,255,0)');
  gr.addColorStop(0.75,'rgba(20,30,50,0.18)'); gr.addColorStop(1,'rgba(20,30,50,0.34)');
  g.fillStyle=gr;
  g.beginPath();
  g.moveTo(tx,ty); g.lineTo(tx+topW,ty); g.lineTo(bx+botW,by); g.lineTo(bx,by); g.closePath(); g.fill();
  // windows up the tower
  g.fillStyle='#2b3542';
  [[70,196],[70,248],[70,300]].forEach(function(p){
    var t=(p[1]-ty)/(by-ty), w=(topW+(botW-topW)*t);
    g.beginPath(); g.arc(W/2,p[1],Math.min(7,w*0.16),0,7); g.fill();
    g.fillStyle='rgba(140,180,210,0.5)';
    g.beginPath(); g.arc(W/2-1.5,p[1]-1.5,Math.min(4,w*0.09),0,7); g.fill();
    g.fillStyle='#2b3542';
  });
  // door
  g.fillStyle='#3a2e26';
  g.beginPath(); g.moveTo(W/2-13,by); g.lineTo(W/2-13,by-34);
  g.arc(W/2,by-34,13,Math.PI,0); g.lineTo(W/2+13,by); g.closePath(); g.fill();
  g.fillStyle='#c9a86a'; g.fillRect(W/2+6,by-20,3,3);
  // gallery platform + railing
  g.fillStyle='#3c4148'; g.fillRect(tx-12,ty-10,topW+24,10);
  g.strokeStyle='#22262c'; g.lineWidth=3;
  for(var rxi=0;rxi<=6;rxi++){ var rx=tx-10+rxi*(topW+20)/6; g.beginPath(); g.moveTo(rx,ty-10); g.lineTo(rx,ty-30); g.stroke(); }
  g.lineWidth=4; g.beginPath(); g.moveTo(tx-12,ty-30); g.lineTo(tx+topW+12,ty-30); g.stroke();
  // lamp room: glass + lamp
  var lw=topW-14;
  g.fillStyle='rgba(150,190,220,0.9)'; g.fillRect((W-lw)/2,ty-66,lw,36);
  g.fillStyle='#ffd98a';
  g.beginPath(); g.arc(W/2,ty-48,9,0,7); g.fill();
  g.fillStyle='#fff3d0'; g.beginPath(); g.arc(W/2,ty-48,4.5,0,7); g.fill();
  g.strokeStyle='#22262c'; g.lineWidth=3;
  g.strokeRect((W-lw)/2,ty-66,lw,36);
  g.beginPath(); g.moveTo(W/2,ty-66); g.lineTo(W/2,ty-30); g.stroke();
  // red dome roof
  g.fillStyle='#a83a32';
  g.beginPath(); g.arc(W/2,ty-66,26,Math.PI,0); g.closePath(); g.fill();
  g.fillStyle='#7e2a25'; g.beginPath(); g.arc(W/2,ty-66,26,Math.PI*1.15,Math.PI*1.85); g.fill();
  g.fillStyle='#2b2f36'; g.beginPath(); g.arc(W/2,ty-94,4,0,7); g.fill();
  g.fillRect(W/2-1.5,ty-104,3,10);
  // weathering: stone courses, rain stains, salt wear
  g.strokeStyle='rgba(90,85,75,0.35)'; g.lineWidth=1;
  for(var wy=ty+18;wy<by;wy+=22){
    var wt=(wy-ty)/(by-ty), ww=topW+(botW-topW)*wt;
    g.beginPath(); g.moveTo((W-ww)/2+2,wy); g.lineTo((W+ww)/2-2,wy); g.stroke();
  }
  g.fillStyle='rgba(70,75,80,0.18)';
  for(var si3=0;si3<5;si3++){ var sx3=W/2-24+si3*11;
    g.fillRect(sx3,ty-8,3,26+((si3*37)%18)); } // streaks under the gallery
  g.fillStyle='rgba(255,255,255,0.10)';
  g.fillRect(tx+4,ty+6,5,by-ty-12); // worn highlight edge
  cache.lighthouse=c[0]; return c[0];
}

/* ---------- ships (drawn as near-silhouettes with lit sails) ---------- */
function hull(g,x,y,w,h,col){
  g.fillStyle=col||'#1d2634';
  g.beginPath(); g.moveTo(x,y); g.lineTo(x+w,y); g.lineTo(x+w-14,y+h); g.lineTo(x+14,y+h); g.closePath(); g.fill();
  g.fillStyle='rgba(168,58,50,0.85)'; g.fillRect(x+10,y+h-5,w-20,4);
}
function mast(g,x,y,h){
  g.strokeStyle='#141a24'; g.lineWidth=4;
  g.beginPath(); g.moveTo(x,y); g.lineTo(x,y-h); g.stroke();
}
function sailT(g,x,y,w,h){
  g.fillStyle='#e6dcc6';
  g.beginPath(); g.moveTo(x,y); g.lineTo(x+w,y); g.lineTo(x+w*0.5,y+h); g.closePath(); g.fill();
  g.fillStyle='rgba(120,110,90,0.35)';
  g.beginPath(); g.moveTo(x+w*0.72,y); g.lineTo(x+w,y); g.lineTo(x+w*0.5,y+h); g.closePath(); g.fill();
}
function shipSprite(type){
  var key='ship_'+type; if(cache[key]) return cache[key];
  var W=240,H=120,c=cv(W,H),g=c[1];
  if(type==='schooner'){
    hull(g,60,78,120,20); mast(g,100,78,62); mast(g,145,78,56);
    sailT(g,104,20,52,56); sailT(g,93,20,-40,54); sailT(g,149,26,44,50);
  }else if(type==='clipper'){
    hull(g,40,80,160,22); mast(g,80,80,70); mast(g,120,80,78); mast(g,160,80,70);
    [[80,70],[120,78],[160,70]].forEach(function(m){
      for(var s=0;s<3;s++){ var sy=m[1]-8-s*16;
        g.fillStyle='#e6dcc6'; g.fillRect(m[0]-30,sy,60,13);
        g.fillStyle='rgba(120,110,90,0.3)'; g.fillRect(m[0]-30,sy+9,60,4);
      }
    });
  }else if(type==='steamer'){
    hull(g,50,76,140,24);
    g.fillStyle='#141a24'; g.fillRect(108,34,20,44);
    g.fillStyle='#a83a32'; g.fillRect(108,44,20,8);
    g.fillStyle='rgba(200,200,200,0.5)';
    [[118,26,14],[124,12,19],[132,-4,25]].forEach(function(p){ g.beginPath(); g.arc(p[0],p[1],p[2],0,7); g.fill(); });
    g.fillStyle='#2b3542'; g.fillRect(60,60,10,16);
  }else if(type==='smack'){
    hull(g,80,82,80,18); mast(g,120,82,52);
    sailT(g,124,34,44,46); sailT(g,116,34,-30,44);
    g.fillStyle='#3a4a5a'; g.fillRect(150,70,18,10);
  }else{ // supply
    hull(g,85,80,70,20,'#4a3b2c');
    g.fillStyle='#5d4c38'; g.fillRect(100,58,34,22);
    g.fillStyle='#6e5a42'; g.fillRect(136,66,22,14); g.fillRect(140,54,16,12);
    mast(g,150,80,30);
  }
  cache[key]=c[0]; return c[0];
}

/* ---------- rocks ---------- */
function rockSprite(v){
  var key='rock'+v; if(cache[key]) return cache[key];
  var W=220,H=130,c=cv(W,H),g=c[1];
  g.fillStyle='#4e565e';
  g.beginPath();
  if(v===0){ g.moveTo(10,130); g.lineTo(40,60); g.lineTo(90,30); g.lineTo(150,55); g.lineTo(200,95); g.lineTo(210,130); }
  else if(v===1){ g.moveTo(5,130); g.lineTo(60,70); g.lineTo(120,45); g.lineTo(175,80); g.lineTo(215,130); }
  else{ g.moveTo(15,130); g.lineTo(70,50); g.lineTo(130,60); g.lineTo(190,100); g.lineTo(205,130); }
  g.closePath(); g.fill();
  g.fillStyle='rgba(255,255,255,0.16)';
  g.beginPath();
  if(v===0){ g.moveTo(40,60); g.lineTo(90,30); g.lineTo(150,55); g.lineTo(130,70); g.lineTo(80,52); g.lineTo(50,75); }
  else if(v===1){ g.moveTo(60,70); g.lineTo(120,45); g.lineTo(175,80); g.lineTo(150,88); g.lineTo(105,62); }
  else{ g.moveTo(70,50); g.lineTo(130,60); g.lineTo(150,80); g.lineTo(100,72); }
  g.closePath(); g.fill();
  g.strokeStyle='rgba(0,0,0,0.3)'; g.lineWidth=2;
  for(var i=0;i<4;i++){ var x0=40+i*45; g.beginPath(); g.moveTo(x0,130); g.lineTo(x0+18,80-i*6); g.stroke(); }
  cache[key]=c[0]; return c[0];
}

/* ---------- the cat ---------- */
function catSprite(pose){
  var key='cat_'+pose; if(cache[key]) return cache[key];
  var W=90,H=80,c=cv(W,H),g=c[1];
  g.fillStyle='#2c313a';
  if(pose==='loaf'){
    g.beginPath(); g.ellipse(45,58,32,16,0,0,7); g.fill();
    g.beginPath(); g.arc(66,48,13,0,7); g.fill();
    g.beginPath(); g.moveTo(58,40); g.lineTo(61,30); g.lineTo(66,39); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(68,39); g.lineTo(73,30); g.lineTo(75,40); g.closePath(); g.fill();
    g.strokeStyle='#2c313a'; g.lineWidth=7;
    g.beginPath(); g.arc(30,62,16,0.4,2.4); g.stroke();
  }else{
    g.beginPath(); g.ellipse(45,60,20,22,0,0,7); g.fill();
    g.beginPath(); g.arc(45,26,14,0,7); g.fill();
    g.beginPath(); g.moveTo(34,18); g.lineTo(36,6); g.lineTo(43,15); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(47,15); g.lineTo(54,6); g.lineTo(56,18); g.closePath(); g.fill();
    g.strokeStyle='#2c313a'; g.lineWidth=7;
    g.beginPath(); g.arc(64,62,14,-0.6,1.4); g.stroke();
    g.fillStyle='#c9a86a';
    g.beginPath(); g.arc(40,24,2.2,0,7); g.fill();
    g.beginPath(); g.arc(50,24,2.2,0,7); g.fill();
  }
  cache[key]=c[0]; return c[0];
}

/* ---------- gull ---------- */
function gullSprite(){
  if(cache.gull) return cache.gull;
  var W=70,H=30,c=cv(W,H),g=c[1];
  g.fillStyle='#eef1f4';
  g.strokeStyle='#8a939c'; g.lineWidth=5;
  g.beginPath(); g.moveTo(35,18); g.quadraticCurveTo(15,4,4,10); g.stroke();
  g.beginPath(); g.moveTo(35,18); g.quadraticCurveTo(55,4,66,10); g.stroke();
  g.fillStyle='#eef1f4'; g.beginPath(); g.ellipse(35,18,10,5,0,0,7); g.fill();
  g.fillStyle='#3a4148'; g.beginPath(); g.arc(43,16,4,0,7); g.fill();
  g.fillStyle='#d88f2c'; g.beginPath(); g.moveTo(46,16); g.lineTo(51,17.5); g.lineTo(46,19); g.closePath(); g.fill();
  cache.gull=c[0]; return c[0];
}

/* ---------- whale back ---------- */
function whaleSprite(){
  if(cache.whale) return cache.whale;
  var W=150,H=50,c=cv(W,H),g=c[1];
  var gr=g.createLinearGradient(0,0,0,H);
  gr.addColorStop(0,'#3d4c5c'); gr.addColorStop(1,'#1d2634');
  g.fillStyle=gr;
  g.beginPath(); g.ellipse(75,48,68,34,0,Math.PI,0); g.fill();
  g.fillStyle='#2b3746';
  g.beginPath(); g.moveTo(120,20); g.quadraticCurveTo(140,8,146,18); g.quadraticCurveTo(134,22,128,28); g.closePath(); g.fill();
  cache.whale=c[0]; return c[0];
}

return {
  lighthouse:lighthouse, ship:shipSprite, rock:rockSprite,
  cat:catSprite, gull:gullSprite, whale:whaleSprite
};
})();
