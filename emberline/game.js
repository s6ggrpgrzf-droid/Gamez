/* Emberline — render + input + cab chrome. The world through the window, brass below. */
'use strict';
(function(){
/* ---------- dom ---------- */
var cv=document.getElementById('scene'), ctx=cv.getContext('2d');
var titleEl=document.getElementById('title'), toastEl=document.getElementById('toast');
var leverTrack=document.getElementById('lever-track'), leverHandle=document.getElementById('lever-handle');
var speedNum=document.getElementById('speed-num'), winStation=document.getElementById('win-station');
var gCoal=document.getElementById('g-coal'), gWater=document.getElementById('g-water'), gLamp=document.getElementById('g-lamp');
var ttEl=document.getElementById('timetable'), ticketsEl=document.getElementById('tickets'), cablogEl=document.getElementById('cablog');
var sumEl=document.getElementById('summary');

/* ---------- layout ---------- */
var W=0,H=0,DPR=1, horizonY=0;
function layout(){
  DPR=Math.min(window.devicePixelRatio||1,2);
  var r=cv.parentElement.getBoundingClientRect();
  W=Math.max(200,r.width); H=Math.max(200,r.height);
  cv.width=Math.round(W*DPR); cv.height=Math.round(H*DPR);
  ctx.setTransform(DPR,0,0,DPR,0,0);
  horizonY=Math.round(H*0.42);
}
window.addEventListener('resize',layout);

/* ---------- helpers ---------- */
function css(c,a){ return a==null?('rgb('+c[0]+','+c[1]+','+c[2]+')'):('rgba('+c[0]+','+c[1]+','+c[2]+','+a+')'); }
function mixc(a,b,t){ return [Math.round(a[0]+(b[0]-a[0])*t),Math.round(a[1]+(b[1]-a[1])*t),Math.round(a[2]+(b[2]-a[2])*t)]; }
function clamp(v,a,b){ return v<a?a:(v>b?b:v); }

/* sky colors by time of day */
function skyColors(st){
  var t=st.tod, nf=(t<0.24||t>0.79)?1:0;
  // smooth night factor
  if(t>=0.20&&t<0.24) nf=1-(t-0.20)/0.04;
  if(t>0.79&&t<=0.83) nf=(t-0.79)/0.04;
  var day={top:[105,165,205],hor:[235,215,180]};
  var dusk={top:[70,80,130],hor:[245,170,120]};
  var night={top:[8,12,28],hor:[30,36,60]};
  var top,hor, duskF=0;
  if(t>0.24&&t<0.32){ var f=(t-0.24)/0.08; top=mixc(dusk.top,day.top,f); hor=mixc(dusk.hor,day.hor,f); duskF=1-f; }
  else if(t>=0.32&&t<=0.68){ top=day.top; hor=day.hor; }
  else if(t>0.68&&t<0.79){ var f2=(t-0.68)/0.11; top=mixc(day.top,dusk.top,f2); hor=mixc(day.hor,dusk.hor,f2); duskF=f2; }
  else { top=night.top; hor=night.hor; }
  if(nf>0){ top=mixc(top,night.top,nf); hor=mixc(hor,night.hor,nf); }
  return {top:top,hor:hor,nf:nf,duskF:duskF};
}

/* seeded decor */
var R=(function(){ var s=12345; return function(){ s=(s*1664525+1013904223)|0; return ((s>>>9)&0x7fffff)/0x7fffff; }; })();
var hillsA=[],hillsB=[],clouds=[];
for(var i=0;i<40;i++) hillsA.push(R());
for(var j=0;j<40;j++) hillsB.push(R());
for(var k=0;k<7;k++) clouds.push({x:R(),y:0.06+R()*0.22,s:0.5+R()*0.9,v:0.004+R()*0.006});

/* perspective: world dist ahead -> screen. True perspective falloff. */
function proj(dist){
  var s=130/(130+Math.max(0,dist)); // 1 at train -> 0 at infinity
  var t=1-s;
  return { t:1-t, y:horizonY+t*(H-horizonY), s:s };
}

/* ---------- draw ---------- */
var tG=0;
function drawSky(st,sc){
  var g=ctx.createLinearGradient(0,0,0,horizonY);
  g.addColorStop(0,css(sc.top)); g.addColorStop(1,css(sc.hor));
  ctx.fillStyle=g; ctx.fillRect(0,0,W,horizonY+2);
  // sun / moon
  var t=st.tod;
  if(t>0.24&&t<0.79){
    var fr=(t-0.25)/0.54, sx=W*(0.15+0.7*fr), sy=horizonY-Math.sin(fr*Math.PI)*H*0.34;
    var sa=(1-sc.nf)*0.9;
    var sg=ctx.createRadialGradient(sx,sy,4,sx,sy,60);
    sg.addColorStop(0,'rgba(255,240,200,'+sa+')'); sg.addColorStop(1,'rgba(255,240,200,0)');
    ctx.fillStyle=sg; ctx.beginPath(); ctx.arc(sx,sy,60,0,7); ctx.fill();
    ctx.fillStyle='rgba(255,246,220,'+sa+')'; ctx.beginPath(); ctx.arc(sx,sy,15,0,7); ctx.fill();
  } else if(sc.nf>0.3){
    var mx=W*0.78,my=H*0.10;
    var mg=ctx.createRadialGradient(mx,my,4,mx,my,44);
    mg.addColorStop(0,'rgba(230,238,250,'+(0.85*sc.nf)+')'); mg.addColorStop(1,'rgba(230,238,250,0)');
    ctx.fillStyle=mg; ctx.beginPath(); ctx.arc(mx,my,44,0,7); ctx.fill();
    ctx.fillStyle='rgba(235,240,250,'+(0.9*sc.nf)+')'; ctx.beginPath(); ctx.arc(mx,my,13,0,7); ctx.fill();
  }
  // stars
  if(sc.nf>0.05){
    ctx.fillStyle='#fff';
    for(var i=0;i<40;i++){
      var sx2=(i*97.3)%W, sy2=(i*57.7)%(horizonY-10);
      ctx.globalAlpha=sc.nf*(0.3+0.7*Math.abs(Math.sin(tG*1.2+i)));
      ctx.fillRect(sx2,sy2,1.6,1.6);
    }
    ctx.globalAlpha=1;
  }
  // clouds (soft puffs, drifting)
  var nCl=4;
  for(var c=0;c<clouds.length&&c<nCl;c++){
    var cl=clouds[c];
    cl.x+=cl.v*0.016; if(cl.x>1.3) cl.x=-0.3;
    var cx=cl.x*W, cy=cl.y*H, cs=70*cl.s;
    var cc=mixc([245,244,240],[50,58,80],sc.nf);
    for(var p=0;p<5;p++){
      var px=cx+(p-2)*cs*0.42, py=cy+Math.sin(p*2.1+c)*cs*0.12, pr=cs*(0.32+0.1*Math.sin(p*1.7+c));
      var pg=ctx.createRadialGradient(px,py,2,px,py,pr);
      pg.addColorStop(0,css(cc,0.55)); pg.addColorStop(1,css(cc,0));
      ctx.fillStyle=pg; ctx.beginPath(); ctx.arc(px,py,pr,0,7); ctx.fill();
    }
  }
}
function drawHills(st,sc){
  var tx=st.train.x;
  // far layer (slow parallax)
  drawRidge(tx*0.04, horizonY-6, H*0.10, [mixc([110,140,110],[24,32,48],sc.nf)], 0.9);
  // near layer
  drawRidge(tx*0.12+500, horizonY-2, H*0.16, [mixc([84,112,84],[18,26,40],sc.nf)], 1.7);
  // ground fill below horizon
  var g=ctx.createLinearGradient(0,horizonY,0,H);
  var gc=mixc([96,128,88],[14,20,32],sc.nf);
  g.addColorStop(0,css(mixc(gc,[200,210,190],0.15))); g.addColorStop(1,css(mixc(gc,[0,0,0],0.25)));
  ctx.fillStyle=g; ctx.fillRect(0,horizonY,W,H-horizonY);
}
function drawRidge(off, baseY, amp, col, freq){
  ctx.fillStyle=css(col[0]);
  ctx.beginPath(); ctx.moveTo(0,baseY+2);
  for(var x=0;x<=W;x+=24){
    var h=Math.sin((x+off)*0.008*freq)*amp*0.5+Math.sin((x+off)*0.021*freq+2)*amp*0.3;
    ctx.lineTo(x, baseY-h);
  }
  ctx.lineTo(W,baseY+2); ctx.closePath(); ctx.fill();
}
function drawTrack(st,sc){
  var vpx=W/2;
  // ballast bed
  ctx.fillStyle=css(mixc([110,100,88],[30,28,26],sc.nf));
  ctx.beginPath();
  ctx.moveTo(vpx-90,H); ctx.lineTo(vpx-7,horizonY); ctx.lineTo(vpx+7,horizonY); ctx.lineTo(vpx+90,H);
  ctx.closePath(); ctx.fill();
  // sleepers: world-anchored so they stream past
  var spacing=46, phase=(st.train.x%spacing);
  for(var d=8;d<1600;d+=spacing){
    var wd=d-phase; if(wd<4) continue;
    var pr=proj(wd), sw=64*pr.s;
    ctx.fillStyle=css(mixc([92,74,58],[26,22,20],sc.nf), 0.9);
    ctx.fillRect(vpx-sw/2, pr.y-2*pr.s, sw, 4*pr.s+1);
  }
  // rails
  ctx.strokeStyle=css(mixc([170,175,185],[90,95,110],sc.nf));
  ctx.lineWidth=3;
  ctx.beginPath(); ctx.moveTo(vpx-26,H); ctx.lineTo(vpx-3,horizonY); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(vpx+26,H); ctx.lineTo(vpx+3,horizonY); ctx.stroke();
  ctx.strokeStyle='rgba(255,255,255,0.25)'; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(vpx-26,H); ctx.lineTo(vpx-3,horizonY); ctx.stroke();
}
/* telegraph poles streaming past */
function drawPoles(st,sc){
  var spacing=260, phase=(st.train.x%spacing);
  for(var d=60;d<1800;d+=spacing){
    var wd=d-phase; if(wd<10) continue;
    var pr=proj(wd);
    var px=W/2+120*pr.s, ph=150*pr.s;
    if(typeof ART!=='undefined'&&ART.telegraphPole){
      ctx.drawImage(ART.telegraphPole(), px-20*pr.s, pr.y-ph, 40*pr.s, ph);
    } else {
      ctx.fillStyle=css(mixc([80,64,48],[24,20,18],sc.nf));
      ctx.fillRect(px-2*pr.s, pr.y-ph, 4*pr.s, ph);
    }
  }
}
function drawStation(st,sc,sn){
  var dist=sn.x-st.train.x;
  if(dist<10||dist>2400) return; // behind the cab or beyond sight
  var pr=proj(Math.max(0,dist));
  var bx=W/2+sn.side*160*pr.s, by=pr.y;
  var s=pr.s;
  // platform
  ctx.fillStyle=css(mixc([130,120,108],[36,34,32],sc.nf));
  var pw=340*s, ph2=26*s;
  ctx.fillRect(bx-pw/2, by-ph2, pw, ph2);
  ctx.fillStyle=css(mixc([100,92,82],[26,24,22],sc.nf));
  ctx.fillRect(bx-pw/2, by-ph2, pw, 5*s);
  // house
  if(typeof ART!=='undefined'&&ART.stationHouse){
    var hw=200*s, hh=140*s;
    ctx.drawImage(ART.stationHouse(), bx-hw/2, by-ph2-hh+6*s, hw, hh);
  }
  // name sign
  ctx.fillStyle='#3a2c1c';
  var sw2=110*s, sh2=22*s;
  ctx.fillRect(bx-sw2/2, by-ph2-64*s, sw2, sh2);
  ctx.fillStyle='#f2e8d5'; ctx.font=Math.max(8,Math.round(13*s))+'px Georgia'; ctx.textAlign='center';
  if(s>0.25) ctx.fillText(sn.name, bx, by-ph2-64*s+15*s);
  // lamp glow at night
  if(sc.nf>0.4){
    var lg=ctx.createRadialGradient(bx,by-ph2-40*s,4,bx,by-ph2-40*s,60*s);
    lg.addColorStop(0,'rgba(255,200,120,'+(0.5*sc.nf)+')'); lg.addColorStop(1,'rgba(255,200,120,0)');
    ctx.fillStyle=lg; ctx.beginPath(); ctx.arc(bx,by-ph2-40*s,60*s,0,7); ctx.fill();
  }
  // waiting passengers as small figures
  var n=Math.min(sn.waiting.length,6);
  for(var i=0;i<n;i++){
    var fx=bx-pw/2+20*s+i*26*s, fy=by-ph2;
    ctx.fillStyle=css(mixc([60,50,70],[30,28,36],sc.nf));
    ctx.beginPath(); ctx.arc(fx,fy-14*s,5*s,0,7); ctx.fill();
    ctx.fillRect(fx-4*s,fy-14*s,8*s,14*s);
  }
}
function drawFriends(st,sc){
  for(var i=0;i<st.friends.length;i++){
    var f=st.friends[i], dist=f.x-st.train.x;
    if(dist<5||dist>1500) continue;
    var pr=proj(Math.max(0,dist));
    var fx=W/2+f.side*200*pr.s, fy=pr.y+4;
    var s=pr.s;
    if(typeof ART!=='undefined'&&ART.friend){
      var spr=ART.friend(f.kind);
      ctx.drawImage(spr, fx-30*s, fy-52*s, 60*s, 52*s);
    } else {
      ctx.fillStyle=css(mixc([70,80,70],[30,34,30],sc.nf));
      ctx.beginPath(); ctx.arc(fx,fy-14*s,10*s,0,7); ctx.fill();
    }
    // wave back
    if(f.waved){
      ctx.strokeStyle=css([240,230,210],0.9); ctx.lineWidth=2*s+1;
      var wv=Math.sin(tG*8)*4*s;
      ctx.beginPath(); ctx.moveTo(fx+8*s,fy-30*s); ctx.lineTo(fx+14*s+wv,fy-44*s); ctx.stroke();
    }
  }
}
/* smoke from our own stack, drifting past the window edge */
var puffs=[];
function drawSmoke(st,sc){
  var rate=st.train.throttle*0.4+st.train.v*0.006;
  if(rate>0.05&&Math.random()<rate){
    // stack is just left of center; smoke drifts left and up
    puffs.push({x:W/2-40+(Math.random()-0.5)*24, y:H-60, r:7+Math.random()*6, a:0.35, vy:-36-Math.random()*24, vx:-14-(Math.random()*10)-st.train.v*0.9});
    if(puffs.length>40) puffs.shift();
  }
  for(var i=puffs.length-1;i>=0;i--){
    var p=puffs[i];
    p.x+=p.vx*0.016; p.y+=p.vy*0.016; p.r+=10*0.016; p.a-=0.14*0.016;
    if(p.a<=0||p.y<-30){ puffs.splice(i,1); continue; }
    var col=mixc([235,232,225],[70,72,80],sc.nf);
    ctx.fillStyle=css(col, Math.max(0,p.a)*0.42);
    ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,7); ctx.fill();
  }
  // boiler top at the bottom edge
  var bg=ctx.createLinearGradient(0,H-70,0,H);
  bg.addColorStop(0,css(mixc([46,40,36],[16,14,12],sc.nf))); bg.addColorStop(1,css(mixc([26,22,20],[8,7,6],sc.nf)));
  ctx.fillStyle=bg;
  ctx.beginPath(); ctx.ellipse(W/2,H+30,W*0.42,64,0,Math.PI,0); ctx.fill();
  // brass dome + stack hint
  ctx.fillStyle=css(mixc([160,120,50],[70,54,26],sc.nf));
  ctx.beginPath(); ctx.arc(W/2,H-8,16,0,7); ctx.fill();
}
/* lamp glow spilling on the track at night */
function drawLampGlow(st,sc){
  if(!st.lampLit||sc.nf<0.3) return;
  var g=ctx.createRadialGradient(W/2,H-30,10,W/2,H-30,220);
  g.addColorStop(0,'rgba(255,210,130,'+(0.28*sc.nf)+')'); g.addColorStop(1,'rgba(255,210,130,0)');
  ctx.fillStyle=g;
  ctx.beginPath(); ctx.moveTo(W/2-60,H); ctx.lineTo(W/2+60,H); ctx.lineTo(W/2+200,horizonY+40); ctx.lineTo(W/2-200,horizonY+40); ctx.closePath(); ctx.fill();
}

function render(st){
  var sc=skyColors(st);
  drawSky(st,sc);
  drawHills(st,sc);
  drawTrack(st,sc);
  drawPoles(st,sc);
  // stations far to near
  var sns=st.stations.slice().sort(function(a,b){return (b.x-st.train.x)-(a.x-st.train.x);});
  for(var i=0;i<sns.length;i++) drawStation(st,sc,sns[i]);
  drawFriends(st,sc);
  drawLampGlow(st,sc);
  drawSmoke(st,sc);
}

/* ---------- main loop ---------- */
var st=null, running=false, lastT=0;
function frame(ts){
  if(!running) return;
  var dt=Math.min((ts-lastT)/1000,0.1); lastT=ts;
  tG+=dt;
  EL.step(st,dt);
  render(st);
  hud(st);
  // audio follows speed
  if(typeof AU!=='undefined'){
    AU.setChuff(clamp(st.train.v/28,0,1)*0.8+st.train.throttle*0.2);
    AU.setBrake(st.train.brake>0.4? st.train.brake*clamp(st.train.v/20,0,1):0);
  }
  // drain sim events to the log line
  while(st.events.length){
    var e=st.events.shift();
    if(e.k==='log') say(e.msg);
    if(e.k==='dock') onDock(e.station);
  }
  requestAnimationFrame(frame);
}

/* ---------- HUD ---------- */
var lastHud={};
function hud(st){
  var mph=Math.round(st.train.v*2.2);
  if(lastHud.mph!==mph){ speedNum.textContent=mph; lastHud.mph=mph; }
  var ns=st.stations[st.nextStation];
  var nm=ns?ns.name:(st.state==='done'?'End of the line':'—');
  if(lastHud.nm!==nm){ winStation.textContent=nm; lastHud.nm=nm; }
  var c=Math.round(st.coal), w=Math.round(st.water), l=Math.round(st.lampOil);
  if(lastHud.c!==c){ gCoal.style.width=c+'%'; lastHud.c=c; }
  if(lastHud.w!==w){ gWater.style.width=w+'%'; lastHud.w=w; }
  if(lastHud.l!==l){ gLamp.style.width=l+'%'; lastHud.l=l; }
  document.getElementById('b-coal').classList.toggle('cooling',st.shovelCd>0);
  document.getElementById('b-water').classList.toggle('cooling',st.waterCd>0);
  document.getElementById('b-lamp').classList.toggle('lit',st.lampLit);
  renderTimetable(st);
  renderTickets(st);
}
var lastTt='';
function renderTimetable(st){
  var key=st.stations.map(function(s,i){return (i<st.nextStation?'d':(i===st.nextStation?'n':'f'))+(s.missed?'m':'');}).join('')+st.state;
  if(key===lastTt) return; lastTt=key;
  var html='';
  for(var i=0;i<st.stations.length;i++){
    var s=st.stations[i], cls='tt-stop';
    if(i<st.nextStation||(st.state==='done')) cls+=' done';
    else if(i===st.nextStation) cls+=' next';
    var mm=Math.floor(s.sched/60), ss=('0'+(s.sched%60)).slice(-2);
    html+='<div class="'+cls+'"><span class="tt-name">'+esc(s.name)+'</span><span class="tt-time">'+mm+':'+ss+(s.missed?' · missed':'')+'</span></div>';
  }
  ttEl.innerHTML=html;
}
var lastTk='';
function renderTickets(st){
  var key=st.aboard.map(function(p){return p.id;}).join(',')+'|'+st.stations.reduce(function(a,s){return a+s.waiting.length;},0);
  if(key===lastTk) return; lastTk=key;
  if(!st.aboard.length){ ticketsEl.innerHTML='<div class="tickets-empty">No passengers aboard — they&rsquo;ll come.</div>'; return; }
  var html='';
  for(var i=0;i<st.aboard.length;i++){
    var p=st.aboard[i], dest=st.stations[p.dest]?st.stations[p.dest].name:'?';
    html+='<div class="ticket"><div class="tk-name">'+esc(p.name)+'</div><div class="tk-dest">→ '+esc(dest)+'</div><div class="tk-story">'+esc(p.story)+'</div></div>';
  }
  ticketsEl.innerHTML=html;
}
function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;'); }
var sayT=null;
function say(msg){
  cablogEl.textContent=msg;
  if(sayT) clearTimeout(sayT);
  sayT=setTimeout(function(){ cablogEl.textContent=''; },6000);
}
function toast(msg,ms){
  toastEl.textContent=msg; toastEl.classList.add('show');
  setTimeout(function(){ toastEl.classList.remove('show'); },ms||2400);
}
function onDock(stationName){
  if(typeof AU!=='undefined'){ AU.thunk(); AU.chime(); }
  toast('Now at '+stationName);
}

/* ---------- input: the regulator lever ---------- */
var leverVal=0, dragging=false;
function leverFromEvent(e){
  var r=leverTrack.getBoundingClientRect();
  var y=(e.clientY-r.top)/r.height; // 0 top .. 1 bottom
  return clamp(1-y*2,-1,1); // top=+1 throttle, bottom=-1 brake
}
function leverDraw(){
  var r=leverTrack.getBoundingClientRect();
  var frac=(1-leverVal)/2; // 0 top .. 1 bottom
  leverHandle.style.top=(frac*100)+'%';
  leverTrack.setAttribute('aria-valuenow',leverVal.toFixed(2));
}
leverTrack.addEventListener('pointerdown',function(e){
  dragging=true; leverTrack.setPointerCapture(e.pointerId);
  leverVal=leverFromEvent(e); EL.setLever(st,leverVal); leverDraw();
  e.preventDefault();
});
leverTrack.addEventListener('pointermove',function(e){
  if(!dragging) return;
  leverVal=leverFromEvent(e); EL.setLever(st,leverVal); leverDraw();
});
function leverEnd(){ dragging=false; }
leverTrack.addEventListener('pointerup',leverEnd);
leverTrack.addEventListener('pointercancel',leverEnd);
// spring back to neutral on release? No — levers stay where left (real regulator). Keyboard nudge:
leverTrack.addEventListener('keydown',function(e){
  if(e.key==='ArrowUp'){ leverVal=clamp(leverVal+0.1,-1,1); }
  else if(e.key==='ArrowDown'){ leverVal=clamp(leverVal-0.1,-1,1); }
  else return;
  EL.setLever(st,leverVal); leverDraw(); e.preventDefault();
});
// double-tap lever = center it
leverTrack.addEventListener('dblclick',function(){ leverVal=0; EL.setLever(st,0); leverDraw(); });

/* tending buttons */
function bindBtn(id,fn){
  document.getElementById(id).addEventListener('click',function(){
    if(typeof AU!=='undefined') AU.ensure();
    fn();
  });
}
bindBtn('b-coal',function(){ if(EL.shovelCoal(st)){ if(typeof AU!=='undefined')AU.shovel(); say('Coal on the fire. She breathes easier.'); } });
bindBtn('b-water',function(){ if(EL.topWater(st)){ if(typeof AU!=='undefined')AU.water(); say('Water topped up.'); } });
bindBtn('b-lamp',function(){ if(EL.toggleLamp(st)){ if(typeof AU!=='undefined')AU.lampClick(); say(st.lampLit?'Lamp lit.':'Lamp out.'); } });
bindBtn('b-whistle',function(){ if(EL.whistle(st)){ if(typeof AU!=='undefined')AU.whistle(); } });

/* ---------- AI ---------- */
var AI_URL='https://gamez-ai.chaoticutopia84.workers.dev';
function aiFetch(kind,payload,ms){
  ms=ms||6000;
  return new Promise(function(res){
    var done=false;
    var to=setTimeout(function(){ if(!done){done=true;res(null);} },ms);
    try{
      fetch(AI_URL+'/g',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({kind:kind,game:'emberline',ctx:payload})})
      .then(function(r){ return r.json(); })
      .then(function(j){ if(!done){done=true;clearTimeout(to);res(j&&!j.error?j:null);} })
      .catch(function(){ if(!done){done=true;clearTimeout(to);res(null);} });
    }catch(e){ if(!done){done=true;clearTimeout(to);res(null);} }
  });
}
/* enrich today's passengers with AI stories (never blocks play) */
function enrichPassengers(){
  var date=st.dateKey;
  aiFetch('trainpassenger',{date:date}).then(function(j){
    if(!j||!j.passengers||!st||st.dateKey!==date) return;
    var k=0;
    for(var s=0;s<st.stations.length&&k<j.passengers.length;s++){
      var wl=st.stations[s].waiting;
      for(var i=0;i<wl.length&&k<j.passengers.length;i++,k++){
        var jp=j.passengers[k];
        if(jp.name) wl[i].name=String(jp.name).slice(0,28);
        if(jp.story) wl[i].story=String(jp.story).slice(0,90);
        wl[i].ai=true;
      }
    }
    lastTk=''; // force ticket re-render
  });
}
/* conductor's log at end of run */
function fetchLog(){
  var payload={date:st.dateKey,score:st.runScore,
    stops:st.stops.map(function(s){return s.station+':'+s.total;}).join(', '),
    passengers:st.stats.passengers};
  aiFetch('trainlog',payload,7000).then(function(j){
    var el=document.getElementById('sum-log');
    if(j&&j.entry){ el.textContent=j.entry; }
    else {
      el.textContent='Ran the valley with '+st.stats.passengers+' souls aboard. '+
        (st.runScore>=80?'Silk on the rails.':st.runScore>=60?'A steady run.':'A gentle run, and the valley didn\u2019t mind.');
    }
  });
}

/* ---------- leaderboard (gamez-arcade) ---------- */
var ARCADE_URL='https://gamez-arcade.chaoticutopia84.workers.dev';
function keeperName(){
  var n=null;
  try{ n=localStorage.getItem('gamez_name'); }catch(e){}
  return n||'Conductor';
}
function postScore(){
  try{
    fetch(ARCADE_URL+'/score',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({game:'emberline',name:keeperName(),score:st.runScore})}).catch(function(){});
  }catch(e){}
}

/* ---------- run lifecycle ---------- */
function dateKey(){
  var d=new Date();
  return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2);
}
function dailySeed(){
  var dk=dateKey(), h=0;
  for(var i=0;i<dk.length;i++) h=(h*31+dk.charCodeAt(i))|0;
  return (h>>>0)||1;
}
function startRun(){
  var seed=dailySeed();
  st=EL.newRun(seed,dateKey());
  lastTt=''; lastTk=''; lastHud={}; puffs=[];
  leverVal=0; EL.setLever(st,0); leverDraw();
  sumEl.classList.add('hidden');
  enrichPassengers();
  say('All aboard. The valley is waiting.');
  if(!running){ running=true; lastT=performance.now(); requestAnimationFrame(frame); }
}
document.getElementById('begin').addEventListener('click',function(){
  if(typeof AU!=='undefined') AU.ensure();
  titleEl.classList.add('hide');
  setTimeout(function(){ titleEl.style.display='none'; },900);
  startRun();
});
document.getElementById('b-again').addEventListener('click',function(){ startRun(); });
document.getElementById('b-hub').addEventListener('click',function(){ window.location.href='../'; });

/* watch for run end */
setInterval(function(){
  if(st&&st.state==='done'&&sumEl.classList.contains('hidden')){
    document.getElementById('sum-num').textContent=st.runScore;
    document.getElementById('sum-sub').textContent=
      st.runScore>=85?'silk on the rails':st.runScore>=70?'steady and true':st.runScore>=50?'a gentle run':'the valley didn\u2019t mind';
    document.getElementById('sum-log').textContent='Writing the log\u2026';
    fetchLog();
    postScore();
    sumEl.classList.remove('hidden');
    if(typeof AU!=='undefined') AU.setChuff(0);
  }
},800);

/* pause on hide */
document.addEventListener('visibilitychange',function(){
  if(document.hidden){ running=false; }
  else if(st&&titleEl.classList.contains('hide')){ running=true; lastT=performance.now(); requestAnimationFrame(frame); }
});

/* debug hook for smoke tests */
window.ELDebug={
  state:function(){return st;},
  step:function(n){ for(var i=0;i<n;i++) EL.step(st,0.1); },
  setLever:function(v){ leverVal=v; EL.setLever(st,v); leverDraw(); },
  start:startRun
};

layout();
st=EL.newRun(dailySeed(),dateKey());
render(st); // title backdrop
})();
