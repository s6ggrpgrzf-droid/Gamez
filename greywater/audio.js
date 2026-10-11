/* Greywater Light — generative coastal audio. No samples, no files.
   Context is created on first user gesture. Everything degrades silently. */
'use strict';
var AU=(function(){
var ctx=null, master=null, waveGain=null, windGain=null, humOsc=null, humGain=null, muted=false;

function ensure(){
  if(ctx) return true;
  try{
    ctx=new (window.AudioContext||window.webkitAudioContext)();
    master=ctx.createGain(); master.gain.value=0.8; master.connect(ctx.destination);
    // looped noise buffer, shared by waves + wind
    var len=ctx.sampleRate*3, buf=ctx.createBuffer(1,len,ctx.sampleRate), d=buf.getChannelData(0);
    for(var i=0;i<len;i++) d[i]=Math.random()*2-1;
    // waves: lowpassed noise
    var wsrc=ctx.createBufferSource(); wsrc.buffer=buf; wsrc.loop=true;
    var wlp=ctx.createBiquadFilter(); wlp.type='lowpass'; wlp.frequency.value=420; wlp.Q.value=0.4;
    waveGain=ctx.createGain(); waveGain.gain.value=0.0;
    wsrc.connect(wlp); wlp.connect(waveGain); waveGain.connect(master); wsrc.start();
    // wind: bandpassed noise
    var wsrc2=ctx.createBufferSource(); wsrc2.buffer=buf; wsrc2.loop=true; wsrc2.playbackRate.value=0.7;
    var wbp=ctx.createBiquadFilter(); wbp.type='bandpass'; wbp.frequency.value=900; wbp.Q.value=0.6;
    windGain=ctx.createGain(); windGain.gain.value=0.0;
    wsrc2.connect(wbp); wbp.connect(windGain); windGain.connect(master); wsrc2.start();
    // slow LFO on the waves so they breathe
    var lfo=ctx.createOscillator(); lfo.frequency.value=0.09;
    var lg=ctx.createGain(); lg.gain.value=0.05;
    lfo.connect(lg); lg.connect(waveGain.gain); lfo.start();
    return true;
  }catch(e){ return false; }
}
function setWaves(x){ if(waveGain) waveGain.gain.setTargetAtTime(0.05+x*0.5, ctx.currentTime, 1.2); }
function setWind(x){ if(windGain) windGain.gain.setTargetAtTime(x*0.16, ctx.currentTime, 1.5); }
function setHum(on){
  if(!ctx) return;
  if(on&&!humOsc){
    humOsc=ctx.createOscillator(); humOsc.type='sawtooth'; humOsc.frequency.value=118;
    var lp=ctx.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=300;
    humGain=ctx.createGain(); humGain.gain.value=0.0;
    humOsc.connect(lp); lp.connect(humGain); humGain.connect(master); humOsc.start();
    humGain.gain.setTargetAtTime(0.035, ctx.currentTime, 2);
  }else if(!on&&humOsc){
    var o=humOsc, g=humGain; humOsc=null;
    g.gain.setTargetAtTime(0, ctx.currentTime, 0.8);
    setTimeout(function(){ try{o.stop();}catch(e){} },1200);
  }
}
/* the foghorn: two detuned diaphragms, deep and mournful */
function horn(){
  if(!ensure()) return;
  if(ctx.state==='suspended') ctx.resume();
  var t=ctx.currentTime;
  [[73.4,0.5],[110.2,0.32],[146.8,0.18]].forEach(function(p){
    var o=ctx.createOscillator(); o.type='sawtooth'; o.frequency.value=p[0]*(0.995+Math.random()*0.01);
    var lp=ctx.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=500;
    var g=ctx.createGain();
    g.gain.setValueAtTime(0,t); g.gain.linearRampToValueAtTime(p[1],t+0.35);
    g.gain.setValueAtTime(p[1],t+1.9); g.gain.linearRampToValueAtTime(0,t+2.7);
    o.connect(lp); lp.connect(g); g.connect(master);
    o.start(t); o.stop(t+2.9);
  });
}
function gull(){
  if(!ensure()) return;
  var t=ctx.currentTime, o=ctx.createOscillator(); o.type='sine';
  o.frequency.setValueAtTime(1750,t);
  o.frequency.exponentialRampToValueAtTime(950,t+0.28);
  var vib=ctx.createOscillator(); vib.frequency.value=28;
  var vg=ctx.createGain(); vg.gain.value=120; vib.connect(vg); vg.connect(o.frequency);
  var g=ctx.createGain();
  g.gain.setValueAtTime(0,t); g.gain.linearRampToValueAtTime(0.12,t+0.05);
  g.gain.exponentialRampToValueAtTime(0.001,t+0.4);
  o.connect(g); g.connect(master); o.start(t); vib.start(t); o.stop(t+0.45); vib.stop(t+0.45);
}
function bell(){
  if(!ensure()) return;
  var t=ctx.currentTime;
  [523.25,784.0,1046.5,1318.5].forEach(function(f,i){
    var o=ctx.createOscillator(); o.type='sine'; o.frequency.value=f;
    var g=ctx.createGain(); var a=0.14/(i+1);
    g.gain.setValueAtTime(a,t); g.gain.exponentialRampToValueAtTime(0.0008,t+1.6);
    o.connect(g); g.connect(master); o.start(t); o.stop(t+1.7);
  });
}
/* the whale answers: long gliding phrases with slow vibrato, pitched near the horn */
function whaleSong(song){
  if(!ensure()||!song||!song.length) return;
  if(ctx.state==='suspended') ctx.resume();
  var t=ctx.currentTime+0.4;
  song.forEach(function(n){
    var o=ctx.createOscillator(); o.type='sine';
    o.frequency.setValueAtTime(n.f0,t);
    o.frequency.exponentialRampToValueAtTime(Math.max(30,n.f1),t+n.dur);
    var vib=ctx.createOscillator(); vib.frequency.value=4.5;
    var vg=ctx.createGain(); vg.gain.value=n.f0*0.03;
    vib.connect(vg); vg.connect(o.frequency);
    var g=ctx.createGain();
    g.gain.setValueAtTime(0,t);
    g.gain.linearRampToValueAtTime(0.22,t+n.dur*0.3);
    g.gain.linearRampToValueAtTime(0.0008,t+n.dur);
    var lp=ctx.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=900;
    o.connect(lp); lp.connect(g); g.connect(master);
    o.start(t); vib.start(t); o.stop(t+n.dur+0.1); vib.stop(t+n.dur+0.1);
    t+=n.dur+n.gap;
  });
}
function splash(){
  if(!ensure()) return;
  var t=ctx.currentTime, o=ctx.createOscillator(); o.type='sine';
  o.frequency.setValueAtTime(900,t); o.frequency.exponentialRampToValueAtTime(220,t+0.18);
  var g=ctx.createGain();
  g.gain.setValueAtTime(0.1,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.25);
  o.connect(g); g.connect(master); o.start(t); o.stop(t+0.3);
}
function toggleMute(){ muted=!muted; if(master) master.gain.value=muted?0:0.8; return muted; }

return {
  ensure:ensure, horn:horn, gull:gull, bell:bell, whaleSong:whaleSong,
  splash:splash, setWaves:setWaves, setWind:setWind, setHum:setHum,
  toggleMute:toggleMute, isMuted:function(){return muted;}
};
})();
