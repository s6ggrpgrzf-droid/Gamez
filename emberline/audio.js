/* Emberline — cozy train audio. All synthesized WebAudio, no samples, no files.
   The AudioContext is created only on user gesture (ensure()).
   Continuous sounds (chuff, brake, wind) reuse persistent nodes — setChuff /
   setBrake / setAmbient allocate nothing per call and are safe per-frame.
   Everything degrades silently if WebAudio is unavailable.

   Wiring notes for the game:
   - Call AU.ensure() from the first user gesture (e.g. the Start tap). The
     continuous functions (setChuff/setBrake/setAmbient) stay silent until then.
   - One-shot sounds (whistle/chime/shovel/water/lampClick/thunk) call ensure()
     themselves, so they work from any gesture handler.
   - AU.setAmbient(true, day) starts the wind loop (+ sparse birds by day);
     AU.setAmbient(false) fades it out. */
'use strict';
var AU=(function(){
var ctx=null, master=null, noiseBuf=null, muted=false;

/* persistent loop nodes (built once in ensure, reused forever) */
var chuffSrc=null, chuffFilt=null, chuffGain=null, chuffLfo=null, chuffLfoDepth=null;
var brakeOsc=null, brakeGain=null;
var windGain=null;

/* ambient state */
var ambientOn=false, ambientDay=true, birdTimer=null;

try{ muted=(window.localStorage&&window.localStorage.getItem('emberline_muted')==='1'); }catch(e){}
function persist(){ try{ window.localStorage.setItem('emberline_muted', muted?'1':'0'); }catch(e){} }
function applyMute(){ if(master) master.gain.value=muted?0:0.8; }

function ensure(){
  if(ctx) return true;
  try{
    ctx=new (window.AudioContext||window.webkitAudioContext)();
    master=ctx.createGain(); master.gain.value=muted?0:0.8; master.connect(ctx.destination);
    // shared looped noise buffer (3s), feeds chuff + brake breath + wind + one-shots
    var len=ctx.sampleRate*3, buf=ctx.createBuffer(1,len,ctx.sampleRate), d=buf.getChannelData(0);
    for(var i=0;i<len;i++) d[i]=Math.random()*2-1;
    noiseBuf=buf;
    buildChuff();
    buildBrake();
    buildWind();
    return true;
  }catch(e){ return false; }
}

/* ---- continuous: steam chuffs ----
   Looped noise through a lowpass; a square LFO gates the gain so it puffs
   rhythmically. Pedestal + swing are kept equal, so output swings 0..base. */
function buildChuff(){
  chuffSrc=ctx.createBufferSource(); chuffSrc.buffer=noiseBuf; chuffSrc.loop=true;
  chuffFilt=ctx.createBiquadFilter(); chuffFilt.type='lowpass'; chuffFilt.frequency.value=600; chuffFilt.Q.value=0.4;
  chuffGain=ctx.createGain(); chuffGain.gain.value=0;
  chuffLfo=ctx.createOscillator(); chuffLfo.type='square'; chuffLfo.frequency.value=2;
  chuffLfoDepth=ctx.createGain(); chuffLfoDepth.gain.value=0;
  chuffLfo.connect(chuffLfoDepth); chuffLfoDepth.connect(chuffGain.gain);
  chuffSrc.connect(chuffFilt); chuffFilt.connect(chuffGain); chuffGain.connect(master);
  chuffSrc.start(); chuffLfo.start();
}
function setChuff(x){
  if(!ctx||!chuffGain) return;  // silent until a gesture has created ctx
  x=Math.max(0,Math.min(1,x));
  var t=ctx.currentTime, base=x*0.55;
  chuffGain.gain.setTargetAtTime(base*0.5, t, 0.3);       // pedestal
  chuffLfoDepth.gain.setTargetAtTime(base*0.5, t, 0.3);   // swing: puffs hit 0..base
  chuffLfo.frequency.setTargetAtTime(1.5+x*7.5, t, 0.25); // chuffs/sec follow speed
  chuffFilt.frequency.setTargetAtTime(450+x*900, t, 0.3); // brighter when working hard
}

/* ---- continuous: brake squeal ----
   Subtle high sine with a slow wobble, only audible when braking hard. */
function buildBrake(){
  brakeOsc=ctx.createOscillator(); brakeOsc.type='sine'; brakeOsc.frequency.value=3150;
  var wob=ctx.createOscillator(); wob.frequency.value=11;
  var wg=ctx.createGain(); wg.gain.value=140;
  wob.connect(wg); wg.connect(brakeOsc.frequency);
  var bp=ctx.createBiquadFilter(); bp.type='bandpass'; bp.frequency.value=3200; bp.Q.value=6;
  brakeGain=ctx.createGain(); brakeGain.gain.value=0;
  brakeOsc.connect(bp); bp.connect(brakeGain); brakeGain.connect(master);
  brakeOsc.start(); wob.start();
}
function setBrake(x){
  if(!ctx||!brakeGain) return;
  x=Math.max(0,Math.min(1,x));
  var v=x<0.35?0:((x-0.35)/0.65)*0.05;  // nothing until a firm brake
  brakeGain.gain.setTargetAtTime(v, ctx.currentTime, 0.4);
}

/* ---- continuous: ambient wind + scheduled birds ---- */
function buildWind(){
  var src=ctx.createBufferSource(); src.buffer=noiseBuf; src.loop=true; src.playbackRate.value=0.6;
  var lp=ctx.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=260; lp.Q.value=0.3;
  windGain=ctx.createGain(); windGain.gain.value=0;
  var lfo=ctx.createOscillator(); lfo.frequency.value=0.07;  // slow breathing
  var lg=ctx.createGain(); lg.gain.value=0.012;
  lfo.connect(lg); lg.connect(windGain.gain);
  src.connect(lp); lp.connect(windGain); windGain.connect(master);
  src.start(); lfo.start();
}
function scheduleBird(){
  if(birdTimer||!ctx) return;
  birdTimer=setTimeout(function(){
    birdTimer=null;
    if(ambientOn&&ambientDay&&ctx) chirp();
    if(ambientOn&&ambientDay) scheduleBird();
  }, 3500+Math.random()*7000);
}
function chirp(){
  if(!ctx) return;
  var n=2+Math.floor(Math.random()*3), t=ctx.currentTime+0.05;
  for(var i=0;i<n;i++){
    var o=ctx.createOscillator(); o.type='sine';
    var f=2300+Math.random()*1200;
    o.frequency.setValueAtTime(f,t);
    o.frequency.exponentialRampToValueAtTime(f*1.25,t+0.09);
    o.frequency.exponentialRampToValueAtTime(f*0.9,t+0.16);
    var g=ctx.createGain();
    g.gain.setValueAtTime(0,t);
    g.gain.linearRampToValueAtTime(0.035,t+0.03);
    g.gain.exponentialRampToValueAtTime(0.001,t+0.2);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t+0.25);
    t+=0.22;
  }
}
/* setAmbient(on, day): on=true starts the wind loop (birds only by day);
   setAmbient(false) fades it out. Called with one boolean, it's (day, on=true). */
function setAmbient(on, day){
  if(on===undefined){ on=true; day=true; }
  else if(day===undefined){ day=on; on=true; }
  if(!ctx) return;  // silent until a gesture has created ctx
  ambientOn=!!on; ambientDay=!!day;
  if(ambientOn){
    windGain.gain.setTargetAtTime(ambientDay?0.05:0.032, ctx.currentTime, 2);
    scheduleBird();
  }else{
    windGain.gain.setTargetAtTime(0, ctx.currentTime, 1.5);
    if(birdTimer){ clearTimeout(birdTimer); birdTimer=null; }
  }
}

/* ---- one-shots (each calls ensure(); safe from any gesture handler) ---- */

/* classic two-tone chime whistle: a major third (A4 + C#5), warm and ~1.2s */
function whistle(){
  if(!ensure()) return;
  if(ctx.state==='suspended') ctx.resume();
  var t=ctx.currentTime;
  [[440,0.16,'triangle'],[554.37,0.16,'triangle'],[220,0.10,'sine']].forEach(function(p){
    var o=ctx.createOscillator(); o.type=p[2]; o.frequency.value=p[0];
    var vib=ctx.createOscillator(); vib.frequency.value=5.2;
    var vg=ctx.createGain(); vg.gain.value=p[0]*0.004;
    vib.connect(vg); vg.connect(o.frequency);
    var g=ctx.createGain();
    g.gain.setValueAtTime(0,t);
    g.gain.linearRampToValueAtTime(p[1],t+0.09);
    g.gain.setValueAtTime(p[1],t+0.85);
    g.gain.exponentialRampToValueAtTime(0.001,t+1.25);
    o.connect(g); g.connect(master);
    o.start(t); vib.start(t); o.stop(t+1.35); vib.stop(t+1.35);
  });
  // steam breath under the tones
  var n=ctx.createBufferSource(); n.buffer=noiseBuf; n.loop=true;
  var nf=ctx.createBiquadFilter(); nf.type='lowpass'; nf.frequency.value=1400;
  var ng=ctx.createGain();
  ng.gain.setValueAtTime(0,t);
  ng.gain.linearRampToValueAtTime(0.045,t+0.12);
  ng.gain.setValueAtTime(0.045,t+0.8);
  ng.gain.exponentialRampToValueAtTime(0.001,t+1.2);
  n.connect(nf); nf.connect(ng); ng.connect(master);
  n.start(t); n.stop(t+1.3);
}

/* gentle station bell: soft sine + 2nd harmonic, xylophone-like */
function chime(){
  if(!ensure()) return;
  var t=ctx.currentTime;
  [[1318.5,0.13],[2637.0,0.045]].forEach(function(p){
    var o=ctx.createOscillator(); o.type='sine'; o.frequency.value=p[0];
    var g=ctx.createGain();
    g.gain.setValueAtTime(0,t);
    g.gain.linearRampToValueAtTime(p[1],t+0.008);
    g.gain.exponentialRampToValueAtTime(0.0008,t+1.1);
    o.connect(g); g.connect(master); o.start(t); o.stop(t+1.2);
  });
}

/* coal shovel clank: inharmonic metallic partials + bright noise tick */
function shovel(){
  if(!ensure()) return;
  var t=ctx.currentTime;
  [[196,0.16],[311,0.09],[587,0.05]].forEach(function(p){
    var o=ctx.createOscillator(); o.type='square'; o.frequency.value=p[0];
    var g=ctx.createGain();
    g.gain.setValueAtTime(p[1],t);
    g.gain.exponentialRampToValueAtTime(0.001,t+0.14);
    o.connect(g); g.connect(master); o.start(t); o.stop(t+0.16);
  });
  var n=ctx.createBufferSource(); n.buffer=noiseBuf;
  var hp=ctx.createBiquadFilter(); hp.type='highpass'; hp.frequency.value=2800;
  var ng=ctx.createGain();
  ng.gain.setValueAtTime(0.10,t); ng.gain.exponentialRampToValueAtTime(0.001,t+0.07);
  n.connect(hp); hp.connect(ng); ng.connect(master); n.start(t); n.stop(t+0.1);
}

/* water pouring: bandpassed noise sweeping up then settling, ~1s, with a burble */
function water(){
  if(!ensure()) return;
  var t=ctx.currentTime;
  var n=ctx.createBufferSource(); n.buffer=noiseBuf; n.loop=true;
  var bp=ctx.createBiquadFilter(); bp.type='bandpass'; bp.Q.value=1.1;
  bp.frequency.setValueAtTime(500,t);
  bp.frequency.exponentialRampToValueAtTime(1500,t+0.45);
  bp.frequency.exponentialRampToValueAtTime(700,t+1.0);
  var g=ctx.createGain();
  g.gain.setValueAtTime(0,t);
  g.gain.linearRampToValueAtTime(0.20,t+0.15);
  g.gain.setValueAtTime(0.20,t+0.7);
  g.gain.exponentialRampToValueAtTime(0.001,t+1.05);
  var lfo=ctx.createOscillator(); lfo.frequency.value=9;  // pour burble
  var lg=ctx.createGain(); lg.gain.value=0.06;
  lfo.connect(lg); lg.connect(g.gain);
  n.connect(bp); bp.connect(g); g.connect(master);
  n.start(t); lfo.start(t); n.stop(t+1.1); lfo.stop(t+1.1);
}

/* small brass lamp click */
function lampClick(){
  if(!ensure()) return;
  var t=ctx.currentTime;
  var n=ctx.createBufferSource(); n.buffer=noiseBuf;
  var hp=ctx.createBiquadFilter(); hp.type='highpass'; hp.frequency.value=4200;
  var g=ctx.createGain();
  g.gain.setValueAtTime(0.09,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.04);
  n.connect(hp); hp.connect(g); g.connect(master); n.start(t); n.stop(t+0.06);
  var o=ctx.createOscillator(); o.type='sine'; o.frequency.value=2450;
  var og=ctx.createGain();
  og.gain.setValueAtTime(0.06,t); og.gain.exponentialRampToValueAtTime(0.001,t+0.05);
  o.connect(og); og.connect(master); o.start(t); o.stop(t+0.06);
}

/* soft thunk for docking at a station */
function thunk(){
  if(!ensure()) return;
  var t=ctx.currentTime;
  var o=ctx.createOscillator(); o.type='sine';
  o.frequency.setValueAtTime(110,t);
  o.frequency.exponentialRampToValueAtTime(55,t+0.2);
  var g=ctx.createGain();
  g.gain.setValueAtTime(0.30,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.28);
  o.connect(g); g.connect(master); o.start(t); o.stop(t+0.3);
  var n=ctx.createBufferSource(); n.buffer=noiseBuf;
  var lp=ctx.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=320;
  var ng=ctx.createGain();
  ng.gain.setValueAtTime(0.12,t); ng.gain.exponentialRampToValueAtTime(0.001,t+0.12);
  n.connect(lp); lp.connect(ng); ng.connect(master); n.start(t); n.stop(t+0.15);
}

/* ---- mute (persisted) ---- */
function mute(){ muted=true; persist(); applyMute(); }
function unmute(){ muted=false; persist(); applyMute(); }
function toggleMute(){ muted=!muted; persist(); applyMute(); return muted; }

return {
  ensure:ensure,
  setChuff:setChuff, whistle:whistle, chime:chime, setBrake:setBrake,
  shovel:shovel, water:water, lampClick:lampClick, setAmbient:setAmbient,
  thunk:thunk, mute:mute, unmute:unmute,
  toggleMute:toggleMute, isMuted:function(){return muted;}
};
})();
