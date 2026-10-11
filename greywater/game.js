/* Greywater Light — render, input, UI. Canvas scene + DOM chrome. */
'use strict';
(function(){
if(!window.GW){ document.body.innerHTML='<p style="color:#fff">sim.js failed to load.</p>'; return; }

/* ================= boot / state ================= */
var cv=document.getElementById('scene'), ctx=cv.getContext('2d');
var W=0,H=0,DPR=1;
var SAVE_KEY='greywater-save-v1', ID_KEY='greywater-keeper-id';
var keeperId=null;
try{ keeperId=localStorage.getItem(ID_KEY); }catch(e){}
if(!keeperId){ keeperId='k'+Math.random().toString(36).slice(2,10); try{localStorage.setItem(ID_KEY,keeperId);}catch(e){} }

var st=null;
function freshState(){ return GW.newGame((Math.random()*1e9)|0); }
try{
  var raw=localStorage.getItem(SAVE_KEY);
  if(raw){ var parsed=JSON.parse(raw); st=GW.load(parsed.sim); }
}catch(e){ st=null; }
if(!st) st=freshState();
var saveT=0;
function save(){
  try{ localStorage.setItem(SAVE_KEY, JSON.stringify({sim:GW.save(st)})); }catch(e){}
}
document.addEventListener('visibilitychange',function(){ if(document.hidden) save(); });

/* ================= layout ================= */
var L={};
function layout(){
  DPR=Math.min(window.devicePixelRatio||1,2);
  W=window.innerWidth; H=window.innerHeight;
  cv.width=Math.round(W*DPR); cv.height=Math.round(H*DPR);
  cv.style.width=W+'px'; cv.style.height=H+'px';
  ctx.setTransform(DPR,0,0,DPR,0,0);
  L.horizonY=Math.round(H*0.46);
  L.seaH=H-L.horizonY;
  L.islandX=Math.round(W*0.68);
  L.islandBaseY=L.horizonY+L.seaH*0.40;
  L.islandPeakY=L.horizonY-H*0.062;
  L.lhH=Math.round(H*0.30);
  L.lhW=L.lhH*140/380;
  L.lhTop=L.islandPeakY+10-L.lhH;
  L.lampX=L.islandX;
  L.lampY=L.lhTop+L.lhH*0.045;
  L.narrows=L.narrows||null;
}
window.addEventListener('resize',layout);
layout();
function wx2sx(wx){ return (wx/1000)*(W+180)-90; }
function depthY(d){ return L.horizonY+14+Math.pow(d,1.3)*L.seaH*0.30; }

/* ================= helpers ================= */
function clamp(v,a,b){ return v<a?a:(v>b?b:v); }
function lerp(a,b,t){ return a+(b-a)*t; }
function smooth(a,b,x){ var t=clamp((x-a)/(b-a),0,1); return t*t*(3-2*t); }
function nightF(){ var t=st.tod; return Math.max(smooth(0.30,0.16,t), smooth(0.70,0.84,t)); }
function duskF(){ var t=st.tod; return Math.max(smooth(0.20,0.25,t)*(1-smooth(0.28,0.33,t)), smooth(0.68,0.73,t)*(1-smooth(0.77,0.83,t))); }
function timeLabel(){
  var t=st.tod;
  if(t<0.05||t>=0.95) return 'Midnight';
  if(t<0.20) return 'Night';
  if(t<0.30) return 'Dawn';
  if(t<0.45) return 'Morning';
  if(t<0.60) return 'Midday';
  if(t<0.72) return 'Afternoon';
  if(t<0.82) return 'Dusk';
  return 'Night';
}
var stars=[];
for(var si=0;si<90;si++) stars.push({x:Math.random(),y:Math.random()*0.42,tw:Math.random()*6.28,sz:Math.random()<0.85?1:2});
var clouds=[];
for(var ci=0;ci<6;ci++) clouds.push({x:Math.random(),y:0.06+Math.random()*0.26,s:0.6+Math.random()*0.9,v:4+Math.random()*7});

/* ================= DOM chrome ================= */
var hud=document.getElementById('hud');
var toastEl=document.getElementById('toast');
var sheetEl=document.getElementById('sheet');
var logEl=document.getElementById('logbook');
var titleEl=document.getElementById('title');

var GLYPHS={
  clear:'<svg viewBox="0 0 24 24" width="20" height="20"><circle cx="12" cy="12" r="5" fill="#f5c542"/><g stroke="#f5c542" stroke-width="2" stroke-linecap="round"><line x1="12" y1="2" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="2" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="22" y2="12"/><line x1="4.9" y1="4.9" x2="7" y2="7"/><line x1="17" y1="17" x2="19.1" y2="19.1"/><line x1="4.9" y1="19.1" x2="7" y2="17"/><line x1="17" y1="7" x2="19.1" y2="4.9"/></g></svg>',
  cloudy:'<svg viewBox="0 0 24 24" width="20" height="20"><path d="M7 18h10a4 4 0 0 0 0-8 6 6 0 0 0-11.5 1.5A3.5 3.5 0 0 0 7 18z" fill="#b9c4cc"/></svg>',
  rain:'<svg viewBox="0 0 24 24" width="20" height="20"><path d="M7 14h10a4 4 0 0 0 0-8 6 6 0 0 0-11.5 1.5A3.5 3.5 0 0 0 7 14z" fill="#9fb0bd"/><g stroke="#7fb2e5" stroke-width="2" stroke-linecap="round"><line x1="8" y1="17" x2="7" y2="21"/><line x1="12" y1="17" x2="11" y2="21"/><line x1="16" y1="17" x2="15" y2="21"/></g></svg>',
  storm:'<svg viewBox="0 0 24 24" width="20" height="20"><path d="M7 13h10a4 4 0 0 0 0-8 6 6 0 0 0-11.5 1.5A3.5 3.5 0 0 0 7 13z" fill="#7d8a96"/><path d="M12.5 13 9 18h4l-1 4 4.5-6.5h-4l1.5-2.5z" fill="#f5c542"/></svg>',
  fog:'<svg viewBox="0 0 24 24" width="20" height="20"><g stroke="#c3ccd4" stroke-width="2.4" stroke-linecap="round"><line x1="4" y1="9" x2="20" y2="9"/><line x1="6" y1="13" x2="18" y2="13"/><line x1="4" y1="17" x2="20" y2="17"/></g></svg>',
  book:'<svg viewBox="0 0 24 24" width="20" height="20"><path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4z" fill="none" stroke="#e8ddc4" stroke-width="2"/><path d="M5 4v13" stroke="#e8ddc4" stroke-width="2"/><line x1="9" y1="9" x2="15" y2="9" stroke="#e8ddc4" stroke-width="1.6"/></svg>',
  horn:'<svg viewBox="0 0 24 24" width="20" height="20"><path d="M4 10v4h3l5 4V6l-5 4H4z" fill="#e8ddc4"/><path d="M15 9a4 4 0 0 1 0 6M17.5 6.5a8 8 0 0 1 0 11" stroke="#e8ddc4" stroke-width="2" fill="none" stroke-linecap="round"/></svg>',
  mute:'<svg viewBox="0 0 24 24" width="20" height="20"><path d="M4 10v4h3l5 4V6l-5 4H4z" fill="#e8ddc4"/><line x1="16" y1="9" x2="21" y2="14" stroke="#e8ddc4" stroke-width="2" stroke-linecap="round"/></svg>'
};
function renderHUD(){
  var s=GW.SEASON_LABEL[GW.SEASONS[st.season]];
  var lampCls=st.lamp.lit?'on':'off';
  hud.innerHTML=
    '<div class="hud-left"><div class="hud-date">Day '+st.day+' &middot; '+s+'</div>'+
    '<div class="hud-time">'+timeLabel()+'</div></div>'+
    '<div class="hud-wx">'+GLYPHS[st.wx.cur]+'</div>'+
    '<div class="hud-right">'+
      '<div class="lampdot '+lampCls+'"></div>'+
      '<button class="hbtn" id="b-horn" aria-label="Sound the foghorn">'+GLYPHS.horn+'</button>'+
      '<button class="hbtn" id="b-book" aria-label="Open the logbook">'+GLYPHS.book+'</button>'+
      '<button class="hbtn" id="b-mute" aria-label="Mute">'+GLYPHS.mute+'</button>'+
    '</div>';
  document.getElementById('b-horn').onclick=function(e){ e.stopPropagation(); doHorn(); };
  document.getElementById('b-book').onclick=function(e){ e.stopPropagation(); openLog(); };
  document.getElementById('b-mute').onclick=function(e){ e.stopPropagation(); AU.toggleMute(); };
}
var toastT=null;
function toast(msg,ms){
  toastEl.textContent=msg; toastEl.classList.add('show');
  if(toastT) clearTimeout(toastT);
  toastT=setTimeout(function(){ toastEl.classList.remove('show'); },ms||2600);
}

/* ---- bottom sheets ---- */
function closeSheet(){ sheetEl.classList.remove('show'); sheetEl.innerHTML=''; }
function lampSheet(){
  var L2=st.lamp;
  var fuelPct=Math.round(L2.fuel), lensPct=Math.round(L2.lens);
  sheetEl.innerHTML=
    '<div class="grab"></div>'+
    '<div class="sheet-title">The Lamp</div>'+
    '<div class="meter"><div class="meter-label"><span>Oil</span><span>'+fuelPct+'%</span></div>'+
    '<div class="meter-bar"><div class="meter-fill oil" style="width:'+fuelPct+'%"></div></div></div>'+
    '<div class="meter"><div class="meter-label"><span>Lens</span><span>'+lensPct+'%</span></div>'+
    '<div class="meter-bar"><div class="meter-fill lens" style="width:'+lensPct+'%"></div></div></div>'+
    '<div class="sheet-sub">'+(L2.lit?'Burning bright. Ships can see you for miles.':'Dark. Light it at dusk \u2014 ships hail a lit tower.')+'</div>'+
    '<div class="btnrow">'+
      '<button class="btn primary" id="s-light">'+(L2.lit?'Dim the lamp':'Light the lamp')+'</button>'+
      '<button class="btn" id="s-polish">Polish lens</button>'+
    '</div>';
  sheetEl.classList.add('show');
  document.getElementById('s-light').onclick=function(){ AU.ensure(); var wasLit=st.lamp.lit; GW.toggleLamp(st); if(!wasLit&&st.lamp.lit){ tut.lamp=1; tutSave(); } renderHUD(); lampSheet(); save(); };
  document.getElementById('s-polish').onclick=function(){ AU.ensure(); GW.polishLens(st); AU.splash(); renderHUD(); lampSheet(); };
}
function shipSheet(sh){
  var T=GW.SHIPTYPES[sh.type]?GW.SHIPTYPES[sh.type].label:'boat';
  var ai=sh.ai||{};
  var name=ai.name||sh.name, story=ai.story||sh.story;
  var memline=(ai.returned&&ai.memory)?'<div class="sheet-story mem">'+escapeHtml(ai.memory)+'</div>':'';
  sheetEl.innerHTML=
    '<div class="grab"></div>'+
    '<div class="sheet-title">'+escapeHtml(name)+'</div>'+
    '<div class="sheet-sub">'+T+' &middot; out of '+escapeHtml(ai.origin||sh.origin)+', bound for '+escapeHtml(ai.dest||sh.dest)+'</div>'+
    '<div class="sheet-story">'+escapeHtml(story)+'</div>'+memline+
    (sh.state==='signal'&&!sh.answered
      ? '<div class="btnrow"><button class="btn primary" id="s-answer">Answer her signals</button></div>'
      : '<div class="sheet-sub">Cargo: '+escapeHtml(ai.cargo||sh.cargo)+'</div>');
  sheetEl.classList.add('show');
  var b=document.getElementById('s-answer');
  if(b) b.onclick=function(){ AU.ensure(); var s2=GW.greetShip(st,sh.id); if(s2){ AU.bell(); toast('Signals exchanged with '+s2.name+'.'); aiLog('greet',s2); } closeSheet(); renderHUD(); save(); };
}
function escapeHtml(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

/* ---- logbook ---- */
function openLog(){
  st.unread=0;
  var html='<div class="log-head"><div class="log-title">The Keeper\u2019s Log</div>'+
    '<button class="hbtn" id="log-close" aria-label="Close">&#10005;</button></div><div class="log-body">';
  var entries=st.logbook.slice().reverse();
  var lastDay=-1;
  entries.forEach(function(e){
    if(e.day!==lastDay){ html+='<div class="log-day">Day '+e.day+'</div>'; lastDay=e.day; }
    html+='<div class="log-entry"><span class="log-kind '+e.kind+'"></span><span>'+escapeHtml(e.text)+'</span></div>';
  });
  if(!entries.length) html+='<div class="log-entry">No entries yet.</div>';
  html+='</div>';
  logEl.innerHTML=html; logEl.classList.add('show');
  document.getElementById('log-close').onclick=function(){ logEl.classList.remove('show'); };
}

/* ---- guidance overlay button ---- */
var guideBtn=document.getElementById('guidebtn');
function updateGuideUI(){
  var g=st.guide;
  if(g&&g.phase==='answer'){
    guideBtn.classList.add('show');
    guideBtn.innerHTML='<div class="gpips">'+[0,1,2].map(function(i){ return '<span class="'+(i<g.round?'done':'')+'"></span>'; }).join('')+'</div><div class="glabel">FLASH THE LAMP</div>';
  }else guideBtn.classList.remove('show');
}
guideBtn.addEventListener('pointerdown',function(e){
  e.preventDefault(); AU.ensure();
  if(GW.answerSignal(st)){ AU.bell(); }
});

/* ---- horn ---- */
function doHorn(){
  AU.ensure();
  var r=GW.soundHorn(st);
  if(!r) return;
  AU.horn();
  renderHUD();
  if(r.answered){
    var song=st.whale.song;
    setTimeout(function(){ AU.whaleSong(song); },1400);
    aiLog('whale',null);
  }
}
/* ==== RENDER ==== */
var tG=0, beamAng=0;
var drops=[], flakes=[], fogBlobs=[];
for(var di=0;di<140;di++) drops.push({x:Math.random(),y:Math.random(),s:0.7+Math.random()*0.6});
for(var fi=0;fi<90;fi++) flakes.push({x:Math.random(),y:Math.random(),s:0.5+Math.random()*0.8,ph:Math.random()*6.28});
for(var bi=0;bi<6;bi++) fogBlobs.push({x:Math.random(),y:0.45+Math.random()*0.4,r:0.25+Math.random()*0.2,v:0.004+Math.random()*0.008});
var gulls=[];
for(var gi=0;gi<5;gi++) gulls.push({cx:0.3+Math.random()*0.4,cy:0.12+Math.random()*0.2,rx:0.08+Math.random()*0.1,ry:0.03+Math.random()*0.04,sp:0.25+Math.random()*0.3,ph:Math.random()*6.28});

function mixc(c1,c2,t){
  return [Math.round(lerp(c1[0],c2[0],t)),Math.round(lerp(c1[1],c2[1],t)),Math.round(lerp(c1[2],c2[2],t))];
}
function css(c,a){ return 'rgba('+c[0]+','+c[1]+','+c[2]+','+(a===undefined?1:a)+')'; }

function skyColors(){
  var nf=nightF(), df=duskF(), s=st.season, w=st.wx.cur;
  var dayT=[63,127,196], dayH=[188,217,234], duskT=[44,42,85], duskH=[232,112,90],
      nightT=[6,11,24], nightH=[16,28,51];
  if(s===3){ dayT=[70,110,160]; dayH=[200,220,230]; }
  if(s===2){ duskH=[235,130,70]; }
  var top=mixc(mixc(dayT,duskT,clamp(df,0,1)),nightT,clamp(nf,0,1));
  var hor=mixc(mixc(dayH,duskH,clamp(df,0,1)),nightH,clamp(nf,0,1));
  var dim = w==='storm'?0.5 : w==='rain'?0.72 : w==='cloudy'?0.85 : w==='fog'?0.9 : 1;
  if(w==='fog'){ top=mixc(top,[150,160,170],0.5); hor=mixc(hor,[170,178,186],0.6); }
  return {top:[top[0]*dim,top[1]*dim,top[2]*dim], hor:[hor[0]*dim,hor[1]*dim,hor[2]*dim], nf:nf, df:df};
}
function drawSky(sc){
  var g=ctx.createLinearGradient(0,0,0,L.horizonY);
  g.addColorStop(0,css(sc.top)); g.addColorStop(1,css(sc.hor));
  ctx.fillStyle=g; ctx.fillRect(0,0,W,L.horizonY+2);
  // stars
  if(sc.nf>0.03){
    for(var i=0;i<stars.length;i++){ var s=stars[i];
      var a=sc.nf*(0.35+0.65*Math.abs(Math.sin(tG*1.4+s.tw)));
      ctx.fillStyle='rgba(255,255,255,'+a.toFixed(2)+')';
      ctx.fillRect(s.x*W,s.y*H,s.sz,s.sz);
    }
    // moon
    var mx=W*0.8,my=H*0.11;
    var mg=ctx.createRadialGradient(mx,my,4,mx,my,54);
    mg.addColorStop(0,'rgba(235,240,250,'+(0.9*sc.nf)+')'); mg.addColorStop(0.25,'rgba(220,228,245,'+(0.5*sc.nf)+')'); mg.addColorStop(1,'rgba(220,228,245,0)');
    ctx.fillStyle=mg; ctx.beginPath(); ctx.arc(mx,my,54,0,7); ctx.fill();
    ctx.fillStyle='rgba(238,242,250,'+(0.95*sc.nf)+')'; ctx.beginPath(); ctx.arc(mx,my,15,0,7); ctx.fill();
    ctx.fillStyle='rgba(200,210,228,'+(0.5*sc.nf)+')';
    ctx.beginPath(); ctx.arc(mx-5,my-3,3.4,0,7); ctx.fill();
    ctx.beginPath(); ctx.arc(mx+4,my+5,2.4,0,7); ctx.fill();
  }
  // aurora (winter nights)
  if(st.season===3&&sc.nf>0.5){
    ctx.save(); ctx.globalCompositeOperation='lighter';
    for(var r2=0;r2<3;r2++){
      var ay=H*0.06+r2*H*0.05, amp=H*0.03;
      var ag=ctx.createLinearGradient(0,ay-amp,0,ay+amp*2.4);
      ag.addColorStop(0,'rgba(80,255,170,0)'); ag.addColorStop(0.5,'rgba(80,255,170,'+(0.10*sc.nf)+')'); ag.addColorStop(1,'rgba(120,140,255,0)');
      ctx.fillStyle=ag; ctx.beginPath();
      for(var ax=0;ax<=W;ax+=24){
        var yy=ay+Math.sin(ax*0.012+tG*0.7+r2*2)*amp;
        if(ax===0) ctx.moveTo(ax,yy); else ctx.lineTo(ax,yy);
      }
      for(var ax2=W;ax2>=0;ax2-=24){ ctx.lineTo(ax2, ay+amp*2.4+Math.sin(ax2*0.012+tG*0.7+r2*2)*amp*0.4); }
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }
  // sun
  var t=st.tod;
  if(t>0.24&&t<0.79){
    var fr=(t-0.25)/0.53, sx2=W*(0.12+0.76*fr), sy2=L.horizonY-Math.sin(fr*Math.PI)*H*0.36;
    var sa=(1-sc.nf)*clamp(1-Math.abs(fr-0.5)*1.4,0.25,1);
    if(sa>0.02){
      var sg=ctx.createRadialGradient(sx2,sy2,4,sx2,sy2,70);
      sg.addColorStop(0,'rgba(255,236,180,'+(0.9*sa)+')'); sg.addColorStop(0.3,'rgba(255,210,140,'+(0.45*sa)+')'); sg.addColorStop(1,'rgba(255,200,120,0)');
      ctx.fillStyle=sg; ctx.beginPath(); ctx.arc(sx2,sy2,70,0,7); ctx.fill();
      ctx.fillStyle='rgba(255,244,210,'+sa+')'; ctx.beginPath(); ctx.arc(sx2,sy2,17,0,7); ctx.fill();
    }
  }
  // clouds
  var w=st.wx.cur, nCl=w==='storm'?6:(w==='rain'?5:(w==='clear'?2:4));
  for(var ci2=0;ci2<clouds.length;ci2++){
    if(ci2>=nCl) continue;
    var c=clouds[ci2];
    c.x+=c.v*0.00004*(w==='storm'?3:1); if(c.x>1.25) c.x=-0.25;
    var cxp=c.x*W, cyp=c.y*H, cs2=c.s*(w==='storm'?95:72);
    var cc = w==='storm' ? mixc([88,94,108],[24,30,44],sc.nf)
           : w==='rain' ? mixc([150,160,172],[40,48,62],sc.nf)
           : mixc([240,244,248],[40,48,68],sc.nf);
    var ca=w==='clear'?0.5:0.8;
    // soft cluster of puffs instead of one slab
    for(var pu=0;pu<6;pu++){
      var px2=cxp+(pu-2.5)*cs2*0.44+Math.sin(pu*3.7+ci2*1.3)*cs2*0.18;
      var py2=cyp+Math.cos(pu*2.3+ci2)*cs2*0.13;
      var pr=cs2*(0.34+0.13*Math.sin(pu*1.9+ci2*2.1));
      var pg=ctx.createRadialGradient(px2,py2,2,px2,py2,pr);
      pg.addColorStop(0,css(cc,ca)); pg.addColorStop(1,css(cc,0));
      ctx.fillStyle=pg; ctx.beginPath(); ctx.arc(px2,py2,pr,0,7); ctx.fill();
    }
  }
}
function drawSeaBase(sc){
  var g=ctx.createLinearGradient(0,L.horizonY,0,H);
  var deep=sc.nf>0.5?[4,12,26]:[8,32,58];
  var mid_=mixc(sc.hor,deep,0.55);
  g.addColorStop(0,css(mixc(sc.hor,[200,220,235],0.25)));
  g.addColorStop(0.25,css(mid_));
  g.addColorStop(1,css(deep));
  ctx.fillStyle=g; ctx.fillRect(0,L.horizonY,W,L.seaH+2);
  // moon glitter
  if(sc.nf>0.4){
    var gx=W*0.8;
    for(var i=0;i<34;i++){
      var gy=L.horizonY+14+i*(L.seaH*0.7/34);
      var gw2=8+Math.sin(tG*2+i*1.7)*6+i*1.1;
      var a=sc.nf*0.28*Math.abs(Math.sin(tG*3+i*2.3));
      ctx.fillStyle='rgba(220,230,245,'+a.toFixed(3)+')';
      ctx.fillRect(gx-gw2/2+(Math.sin(tG+i)*4),gy,gw2,2);
    }
  }
}
function drawWaves(sc){
  var N=13, w=st.wx.cur;
  var wob=GW.waveAmp(st)*0.5;
  for(var i=0;i<N;i++){
    var f=i/(N-1);
    var y=L.horizonY+8+Math.pow(f,1.55)*L.seaH*0.9;
    var amp=(1.5+f*9)*(w==='storm'?1.8:1);
    ctx.strokeStyle='rgba(255,255,255,'+(0.03+f*0.09).toFixed(3)+')';
    ctx.lineWidth=1+f*1.8;
    ctx.beginPath();
    for(var px=0;px<=W;px+=16){
      var py=y+Math.sin(px*0.018+tG*(1.1+f*1.4)+i*1.3)*amp*0.45+GW.waveH(st,px*2.4)*0.35*(0.25+f);
      if(px===0) ctx.moveTo(px,py); else ctx.lineTo(px,py);
    }
    ctx.stroke();
    if(f>0.62){ // foam flecks on near bands
      ctx.fillStyle='rgba(255,255,255,'+(0.05+f*0.08).toFixed(3)+')';
      for(var fx2=0;fx2<W;fx2+=46){
        var fxp=fx2+((i*37)%46);
        var fyp=y+Math.sin(fxp*0.018+tG*(1.1+f*1.4)+i*1.3)*amp*0.45-3;
        ctx.beginPath(); ctx.ellipse(fxp,fyp,7+f*9,1.6+f,0,0,7); ctx.fill();
      }
    }
  }
}
function drawShip(sh,sc){
  var sx=wx2sx(sh.x), sy=depthY(sh.depth)+sh.bob*0.45;
  var scale=0.5+sh.depth*0.62;
  var spr=ART.ship(sh.type), iw=240*scale*0.85, ih=120*scale*0.85;
  ctx.save();
  ctx.translate(sx,sy); ctx.rotate(sh.pitch*0.55);
  var w=st.wx.cur;
  var alpha=(w==='fog'?0.55:1)*(sh.depth<0.35?0.8:1);
  ctx.globalAlpha=alpha;
  ctx.drawImage(spr,-iw/2,-ih+ih*0.28,iw,ih);
  // hull reflection
  ctx.globalAlpha=alpha*0.16;
  ctx.fillStyle='#0a1626';
  ctx.fillRect(-iw*0.32,ih*0.28,iw*0.64,ih*0.5);
  ctx.globalAlpha=alpha;
  // night lights + signal flashes
  var nf=sc.nf;
  if(nf>0.3){
    ctx.fillStyle='rgba(255,200,120,'+(0.85*nf)+')';
    for(var li=0;li<3;li++){ ctx.beginPath(); ctx.arc(-iw*0.22+li*iw*0.22,ih*0.05,2.2*scale,0,7); ctx.fill(); }
  }
  if(sh.state==='signal'){
    var on=Math.sin(tG*9)>0;
    ctx.fillStyle=on?'rgba(255,240,190,0.95)':'rgba(255,240,190,0.25)';
    ctx.beginPath(); ctx.arc(0,-ih*0.72,4.5*scale,0,7); ctx.fill();
    if(on){ var gg=ctx.createRadialGradient(0,-ih*0.72,1,0,-ih*0.72,26*scale);
      gg.addColorStop(0,'rgba(255,240,190,0.5)'); gg.addColorStop(1,'rgba(255,240,190,0)');
      ctx.fillStyle=gg; ctx.beginPath(); ctx.arc(0,-ih*0.72,26*scale,0,7); ctx.fill(); }
  }
  if(sh.state==='troubled'){
    var on2=Math.sin(tG*7+1)>0;
    ctx.fillStyle=on2?'rgba(255,120,90,0.95)':'rgba(255,120,90,0.3)';
    ctx.beginPath(); ctx.arc(0,-ih*0.72,5*scale,0,7); ctx.fill();
  }
  // steamer smoke
  if(sh.type==='steamer'){
    for(var pu=0;pu<3;pu++){
      var pt=((tG*0.5+pu/3)%1);
      ctx.fillStyle='rgba(210,210,215,'+(0.28*(1-pt))+')';
      ctx.beginPath(); ctx.arc(iw*0.08+pt*22*scale,-ih*0.72-pt*52*scale,7*scale*(0.6+pt),0,7); ctx.fill();
    }
  }
  ctx.restore();
  return {x:sx,y:sy,w:iw,h:ih};
}
var shipHits=[];
function drawRocks(){
  var rocks=GW.GUIDE_ROCKS;
  for(var i=0;i<rocks.length;i++){
    var sx=wx2sx(rocks[i]), sy=L.horizonY+L.seaH*0.30+GW.waveH(st,rocks[i])*0.4;
    ctx.drawImage(ART.rock(i%3),sx-46,sy-64,92,55);
    ctx.strokeStyle='rgba(255,255,255,'+(0.18+0.1*Math.sin(tG*2+i))+')';
    ctx.lineWidth=2;
    ctx.beginPath(); ctx.ellipse(sx,sy-4,44,9,0,0,7); ctx.stroke();
  }
}
function drawIsland(sc){
  var ix=L.islandX, baseY=L.islandBaseY, peakY=L.islandPeakY;
  // mound
  var g=ctx.createLinearGradient(0,peakY,0,baseY+60);
  var rockC=sc.nf>0.5?[38,44,54]:[74,82,92];
  g.addColorStop(0,css(mixc(rockC,[20,26,36],0.2))); g.addColorStop(1,css([22,28,38]));
  ctx.fillStyle=g;
  ctx.beginPath();
  ctx.moveTo(ix-190,baseY+70);
  ctx.quadraticCurveTo(ix-170,peakY+40,ix-90,peakY+18);
  ctx.quadraticCurveTo(ix-30,peakY-6,ix+30,peakY+2);
  ctx.quadraticCurveTo(ix+120,peakY+26,ix+170,baseY+40);
  ctx.quadraticCurveTo(ix+185,baseY+70,ix+190,baseY+70);
  ctx.closePath(); ctx.fill();
  // grass / snow cap
  var s=st.season;
  var capC=s===0?[96,128,80]:s===1?[74,110,66]:s===2?[150,120,70]:[214,222,230];
  if(sc.nf>0.4) capC=mixc(capC,[30,36,50],0.6);
  ctx.fillStyle=css(capC);
  ctx.beginPath();
  ctx.ellipse(ix-20,peakY+16,105,20,0.06,0,7);
  ctx.fill();
  // side rocks
  ctx.drawImage(ART.rock(1),ix-215,baseY-58,150,88);
  ctx.drawImage(ART.rock(2),ix+95,baseY-48,130,76);
  // cottage with a warm window
  var chx=ix-118, chy=baseY-46;
  ctx.fillStyle=sc.nf>0.5?'#2c2620':'#5a4c3e';
  ctx.fillRect(chx,chy,64,42);
  ctx.fillStyle=sc.nf>0.5?'#1c1814':'#3a2f26';
  ctx.beginPath(); ctx.moveTo(chx-8,chy); ctx.lineTo(chx+32,chy-26); ctx.lineTo(chx+72,chy); ctx.closePath(); ctx.fill();
  ctx.fillStyle='#241f19'; ctx.fillRect(chx+26,chy+18,14,24);
  if(sc.nf>0.25){
    ctx.fillStyle='rgba(255,190,110,'+(0.9*sc.nf+0.1)+')';
    ctx.fillRect(chx+10,chy+12,13,13);
    var wg=ctx.createRadialGradient(chx+16,chy+18,2,chx+16,chy+18,26);
    wg.addColorStop(0,'rgba(255,190,110,'+(0.35*sc.nf)+')'); wg.addColorStop(1,'rgba(255,190,110,0)');
    ctx.fillStyle=wg; ctx.beginPath(); ctx.arc(chx+16,chy+18,26,0,7); ctx.fill();
  }else{
    ctx.fillStyle='#20262e'; ctx.fillRect(chx+10,chy+12,13,13);
  }
  // rocks hugging the tower base so she sits IN the island
  ctx.drawImage(ART.rock(0),ix-L.lhW/2-40,L.islandPeakY-8,80,47);
  ctx.drawImage(ART.rock(2),ix+L.lhW/2-40,L.islandPeakY-4,80,47);
  // the lighthouse
  ctx.drawImage(ART.lighthouse(),ix-L.lhW/2,L.lhTop,L.lhW,L.lhH);
  // lamp glow
  if(st.lamp.lit&&sc.nf>0.15){
    var lg2=ctx.createRadialGradient(L.lampX,L.lampY,4,L.lampX,L.lampY,60);
    lg2.addColorStop(0,'rgba(255,220,150,'+(0.75*sc.nf)+')'); lg2.addColorStop(1,'rgba(255,220,150,0)');
    ctx.fillStyle=lg2; ctx.beginPath(); ctx.arc(L.lampX,L.lampY,60,0,7); ctx.fill();
  }
  // the cat
  drawCat(sc);
}
function drawCat(sc){
  var c=st.cat, pose=c.state==='sleep'?'loaf':'sit', spr=ART.cat(pose);
  var x,y,s;
  if(c.spot==='gallery'){ x=L.lampX-48; y=L.lampY+26; s=0.5; }
  else if(c.spot==='lamp'){ x=L.lampX-44; y=L.lampY+26; s=0.5; }
  else{ x=L.islandX+120; y=L.islandBaseY-46; s=0.85; }
  ctx.save();
  if(sc.nf>0.4){ ctx.globalAlpha=0.92; }
  ctx.drawImage(spr,x-45*s,y-80*s+8*s,90*s,80*s);
  ctx.restore();
}
function drawWhale(sc){
  var w=st.whale;
  if((w.state==='near'||w.state==='answering')&&w.surfT<2.6){
    var sx=wx2sx(w.x), sy=depthY(0.55)+GW.waveH(st,w.x)*0.45;
    var rise=smooth(2.6,1.4,w.surfT)*(1-smooth(0.5,0.1,w.surfT));
    ctx.save();
    ctx.globalAlpha=0.95;
    ctx.translate(sx,sy-6-14*rise); ctx.scale(w.dir,1);
    ctx.drawImage(ART.whale(),-75,-30,150,50);
    ctx.restore();
    if(w.surfT<1.9){ // spout
      for(var i=0;i<6;i++){
        var pt=1-w.surfT/1.9, px2=sx+8+Math.sin(i*2.1)*8*pt, py2=sy-44*pt-10;
        ctx.fillStyle='rgba(230,240,248,'+(0.5*(1-pt))+')';
        ctx.beginPath(); ctx.arc(px2,py2-14*rise,3+pt*7,0,7); ctx.fill();
      }
    }
  }
}
function drawBeam(sc){
  if(!st.lamp.lit) return;
  var vis=Math.max(sc.nf,sc.df*0.6);
  if(vis<0.2) return;
  var bm=GW.beam(st);
  beamAng+=0.016;
  ctx.save();
  ctx.globalCompositeOperation='lighter';
  for(var k=0;k<2;k++){
    var a=beamAng+k*Math.PI;
    var len=W*1.05, half=0.105+0.03*(1-bm);
    var bx=L.lampX+Math.cos(a)*len, by=L.lampY+Math.sin(a)*len*0.35;
    var g=ctx.createRadialGradient(L.lampX,L.lampY,10,L.lampX,L.lampY,len);
    g.addColorStop(0,'rgba(255,236,180,'+(0.60*vis*bm)+')');
    g.addColorStop(0.55,'rgba(255,236,180,'+(0.22*vis*bm)+')');
    g.addColorStop(1,'rgba(255,236,180,0)');
    ctx.fillStyle=g;
    ctx.beginPath();
    ctx.moveTo(L.lampX,L.lampY);
    ctx.arc(L.lampX,L.lampY,len,a-half,a+half);
    ctx.closePath(); ctx.fill();
  }
  // sea shimmer where the beam falls
  var shx=L.lampX+Math.cos(beamAng)*W*0.30;
  if(shx>0&&shx<W){
    var sg2=ctx.createLinearGradient(0,L.horizonY,0,H);
    sg2.addColorStop(0,'rgba(255,230,170,'+(0.12*vis*bm)+')'); sg2.addColorStop(1,'rgba(255,230,170,0)');
    ctx.fillStyle=sg2;
    ctx.fillRect(shx-26,L.horizonY+6,52,L.seaH*0.5);
  }
  ctx.restore();
}
function drawWeatherFX(sc){
  var w=st.wx.cur;
  if(w==='rain'||w==='storm'){
    ctx.strokeStyle=w==='storm'?'rgba(170,190,210,0.5)':'rgba(170,190,210,0.38)';
    ctx.lineWidth=w==='storm'?2:1.4;
    ctx.beginPath();
    var spd=(w==='storm'?1.6:1);
    for(var i=0;i<drops.length;i++){
      var d=drops[i];
      d.y+=0.028*d.s*spd; d.x+=0.004*spd;
      if(d.y>1){ d.y=-0.05; d.x=Math.random(); }
      var dx=d.x*W, dy=d.y*H;
      ctx.moveTo(dx,dy); ctx.lineTo(dx-7*spd,dy+20*d.s*spd);
    }
    ctx.stroke();
  }
  if(st.season===3&&(w==='rain'||w==='clear'||w==='cloudy')){
    ctx.fillStyle='rgba(240,246,252,0.85)';
    for(var f2=0;f2<flakes.length;f2++){
      var fl=flakes[f2];
      fl.y+=0.004*fl.s; fl.ph+=0.03;
      if(fl.y>1){ fl.y=-0.05; fl.x=Math.random(); }
      ctx.beginPath(); ctx.arc(fl.x*W+Math.sin(fl.ph)*14,fl.y*H,1.8*fl.s,0,7); ctx.fill();
    }
  }
  if(w==='fog'){
    for(var b2=0;b2<fogBlobs.length;b2++){
      var fb=fogBlobs[b2];
      fb.x+=fb.v*(0.4+0.6*Math.sin(tG*0.2+b2)); if(fb.x>1.3) fb.x=-0.3;
      var fx3=fb.x*W, fy3=fb.y*H, fr=fb.r*Math.max(W,H)*0.5;
      var fg=ctx.createRadialGradient(fx3,fy3,10,fx3,fy3,fr);
      fg.addColorStop(0,'rgba(190,198,208,0.20)'); fg.addColorStop(1,'rgba(190,198,208,0)');
      ctx.fillStyle=fg; ctx.beginPath(); ctx.arc(fx3,fy3,fr,0,7); ctx.fill();
    }
  }
}
function drawGulls(sc){
  var w=st.wx.cur;
  if(sc.nf>0.5||w==='storm') return;
  ctx.fillStyle='rgba(240,244,248,0.92)';
  for(var i=0;i<gulls.length;i++){
    var gl=gulls[i];
    var gx=(gl.cx+Math.sin(tG*gl.sp+gl.ph)*gl.rx)*W;
    var gy=(gl.cy+Math.cos(tG*gl.sp*0.7+gl.ph)*gl.ry)*H;
    var flap=0.55+0.45*Math.sin(tG*9+gl.ph*3);
    ctx.save(); ctx.translate(gx,gy); ctx.scale(0.8,flap*0.9);
    ctx.drawImage(ART.gull(),-35,-15,70,30);
    ctx.restore();
  }
}
function drawForeground(){
  var g1=ctx.createLinearGradient(0,H-140,0,H);
  g1.addColorStop(0,'rgba(10,14,22,0)'); g1.addColorStop(1,'rgba(10,14,22,0.85)');
  ctx.fillStyle=g1;
  ctx.beginPath(); ctx.ellipse(-30,H+30,150,110,0.3,0,7); ctx.fill();
  ctx.beginPath(); ctx.ellipse(W+30,H+40,170,120,-0.3,0,7); ctx.fill();
  // vignette
  var v=ctx.createRadialGradient(W/2,H/2,Math.min(W,H)*0.42,W/2,H/2,Math.max(W,H)*0.75);
  v.addColorStop(0,'rgba(0,0,8,0)'); v.addColorStop(1,'rgba(0,0,8,0.30)');
  ctx.fillStyle=v; ctx.fillRect(0,0,W,H);
}
function render(dt){
  tG+=dt;
  var sc=skyColors();
  drawSky(sc);
  drawSeaBase(sc);
  // ships far to near
  shipHits=[];
  var order=st.ships.slice().sort(function(a,b){return a.depth-b.depth;});
  for(var i=0;i<order.length;i++){ var hit=drawShip(order[i],sc); shipHits.push({id:order[i].id,x:hit.x,y:hit.y,w:hit.w,h:hit.h}); }
  drawRocks();
  drawIsland(sc);
  drawWhale(sc);
  drawWaves(sc);
  drawBeam(sc);
  drawWeatherFX(sc);
  drawGulls(sc);
  drawForeground();
}
/* ==== INPUT ==== */
var pdown=null;
cv.addEventListener('pointerdown',function(e){ pdown={x:e.clientX,y:e.clientY,t:Date.now()}; });
cv.addEventListener('pointerup',function(e){
  if(!pdown) return;
  var dx=e.clientX-pdown.x, dy=e.clientY-pdown.y;
  pdown=null;
  if(Math.hypot(dx,dy)>16) return;
  AU.ensure();
  handleTap(e.clientX,e.clientY);
});
function handleTap(x,y){
  // ships first (topmost)
  for(var i=shipHits.length-1;i>=0;i--){
    var h=shipHits[i];
    if(Math.abs(x-h.x)<h.w*0.62&&Math.abs(y-h.y)<h.h*0.9){
      for(var j=0;j<st.ships.length;j++) if(st.ships[j].id===h.id){ shipSheet(st.ships[j]); return; }
    }
  }
  // lighthouse
  if(x>L.islandX-L.lhW*0.75&&x<L.islandX+L.lhW*0.75&&y>L.lhTop-10&&y<L.islandPeakY+16){ lampSheet(); return; }
  closeSheet();
}

/* ==== FX drain (sim -> presentation) ==== */
function drainFx(){
  if(!st.fx.length) return;
  var evs=st.fx; st.fx=[];
  evs.forEach(function(ev){
    if(ev.k==='horn'){ AU.horn(); }
    else if(ev.k==='shipHail'){
      var sh=findShip(ev.d.id);
      if(sh){ toast(sh.name+' signals you \u2014 tap her to answer.'); aiShipStory(sh); }
    }
    else if(ev.k==='shipTrouble'){ var sh2=findShip(ev.d.id); toast((sh2?sh2.name+' is':'A ship is')+' standing into the narrows!'); }
    else if(ev.k==='guideFlash'){ /* guide button pulses via updateGuideUI */ }
    else if(ev.k==='guided'){ toast('She finds the channel \u2014 safe passage.'); aiLog('guided',ev.d); }
    else if(ev.k==='greeted'){ /* handled by sheet */ }
    else if(ev.k==='supplied'){ toast('The supply boat unloads oil and letters.'); }
    else if(ev.k==='lampOut'){ toast('The lamp is out of oil!'); }
    else if(ev.k==='whaleSong'){ /* triggered from doHorn with the song */ }
  });
}
function findShip(id){ for(var i=0;i<st.ships.length;i++) if(st.ships[i].id===id) return st.ships[i]; return null; }

/* ==== AI harbormaster (memory across sessions, silent local fallback) ==== */
var AI_URL='https://gamez-ai.chaoticutopia84.workers.dev';
function aiCall(kind,payload,cb){
  try{
    var ctl=new AbortController();
    var to=setTimeout(function(){ ctl.abort(); },9000);
    fetch(AI_URL+'/g',{method:'POST',headers:{'Content-Type':'application/json'},signal:ctl.signal,
      body:JSON.stringify({kind:kind,game:'greywater',ctx:Object.assign({keeper:keeperId},payload||{})})})
    .then(function(r){ clearTimeout(to); return r.json(); })
    .then(function(j){ if(j&&!j.error&&cb) cb(j); })
    .catch(function(){ clearTimeout(to); });
  }catch(e){}
}
function aiShipStory(sh){
  if(sh.ai||sh.type==='supply') return;
  aiCall('shipstory',{
    day:st.day, season:GW.SEASONS[st.season], weather:st.wx.cur, night:GW.isNight(st),
    localType:sh.type
  },function(j){
    var s2=findShip(sh.id); if(!s2||!j.ship) return;
    s2.ai=j.ship;
    if(j.ship.name&&j.ship.name!==s2.name) s2.name=j.ship.name; // the harbormaster names her
  });
}
/* aiLog: ask the harbormaster to write the logbook entry in a literary voice.
   The sim already logged a plain entry; we replace its text when AI answers. */
function aiLog(kind,extra){
  var idx=st.logbook.length-1;
  var ctxd={kind:kind,day:st.day,season:GW.SEASONS[st.season],weather:st.wx.cur,night:GW.isNight(st)};
  if(extra&&extra.id){ var sh=findShip(extra.id); if(sh) ctxd.ship={name:sh.name,type:sh.type,origin:sh.origin,dest:sh.dest,cargo:sh.cargo}; }
  if(kind==='whale') ctxd.whale={name:st.whale.name,visits:st.whale.visits};
  aiCall('logentry',ctxd,function(j){
    if(j&&j.text&&st.logbook[idx]){ st.logbook[idx].text=j.text; save(); }
  });
}

/* ==== tutorial ==== */
var TUT_KEY='greywater-tut';
var tut={};
try{ tut=JSON.parse(localStorage.getItem(TUT_KEY)||'{}'); }catch(e){}
function tutSave(){ try{localStorage.setItem(TUT_KEY,JSON.stringify(tut));}catch(e){} }
function tutorial(){
  if(!tut.lamp){ toast('Tap the lighthouse to tend the lamp.',4200); }
  else if(!tut.ship&&st.stats.greeted===0&&st.ships.some(function(s){return s.state==='signal';})){ toast('A ship signals you \u2014 tap her to answer.',4200); }
  else if(!tut.horn&&st.wx.cur==='fog'){ toast('Fog. The horn button is top-right.',4200); tut.horn=1; tutSave(); }
}

/* ==== main loop ==== */
var lastT=0, hudT=0, firstFrame=true;
function frame(ts){
  requestAnimationFrame(frame);
  var dt=Math.min((ts-lastT)/1000||0.016,0.1); lastT=ts;
  GW.step(st,dt);
  drainFx();
  render(dt);
  updateGuideUI();
  // ambient audio follows the world
  var w=st.wx.cur;
  AU.setWaves(w==='storm'?1:w==='rain'?0.6:w==='fog'?0.25:0.4);
  AU.setWind(w==='storm'?1:w==='rain'?0.4:0.12);
  AU.setHum(st.lamp.lit);
  hudT+=dt;
  if(hudT>1){ hudT=0; renderHUD(); tutorial(); }
  saveT+=dt;
  if(saveT>10){ saveT=0; save(); }
  if(firstFrame){ firstFrame=false; }
}

/* ==== title ==== */
var started=false;
document.getElementById('begin').addEventListener('click',function(){
  AU.ensure(); started=true;
  titleEl.classList.add('hide');
  setTimeout(function(){ titleEl.style.display='none'; },900);
  if(!tut.lamp){
    setTimeout(function(){ toast('Tap the lighthouse to tend the lamp.',4500); },1200);
  }
});

/* ==== boot ==== */
renderHUD();
requestAnimationFrame(frame);
// debug/testing hooks
window.GWDebug={ state:function(){return st;}, step:function(n){ for(var i=0;i<n;i++) GW.step(st,0.5); }, tap:handleTap, findShip:findShip, hits:function(){return shipHits;} };
})();
