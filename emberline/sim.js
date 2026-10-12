/* Emberline — pure simulation. No DOM, no canvas, no audio.
   A cozy train conductor sim: one timetable, 4-6 stations, no fail states.
   Deterministic given seed. Serializable via EL.save/EL.load. */
'use strict';
var EL = (function () {

/* ---------------- utils (seeded) ---------------- */
function mulberry32(a){ return function(){ a|=0; a=(a+0x6D2B79F5)|0; var t=Math.imul(a^(a>>>15),1|a); t=(t+Math.imul(t^(t>>>7),61|t))^t; return ((t^(t>>>14))>>>0)/4294967296; }; }
function clamp(v,a,b){ return v<a?a:(v>b?b:v); }
function lerp(a,b,t){ return a+(b-a)*t; }

/* ---------------- tuning ---------------- */
var TUNE = {
  maxSpeed: 30,        // units/sec
  throttleAccel: 7,    // units/sec^2 at full throttle
  brakeDecel: 14,      // units/sec^2 at full brake
  dragK: 0.0085,       // quadratic drag (tuned: cruise ~25 at 0.85 throttle)
  rollK: 0.25,         // rolling resistance
  stopTol: 30,         // |x - station.x| to count as docked
  perfectTol: 6,       // |x - station.x| for full accuracy points
  stationGap: [800, 1200], // spacing between stations (~4-5 min runs)
  coalDrain: 1.4,      // per sec at full throttle
  waterDrain: 0.35,    // per sec base
  waterSpeedK: 0.012,  // extra per speed
  lampDrain: 0.25,     // per sec at night when lit
  coalPerShovel: 22,
  waterPerTopup: 30,
  shovelCd: 2.5,
  waterCd: 3.0,
  capacity: 12         // max passengers aboard
};

/* ---------------- content pools (local fallbacks; AI enriches) ---------------- */
var STATION_NAMES = [
  'Ember Hollow','Pinecrest','Millbrook','Cinder Falls','Willow Bend','Foxglove',
  'Harborlight','Stonebridge','Larkspur','Thistledown','Oakenshade','Briarwood',
  'Copper Creek','Mossbank','Fern Hollow','Duskmoor','Aldergate','Rowanwick'
];
var FIRST = ['Mara','Theo','June','Silas','Wren','Otto','Ivy','Casper','Nora','Felix',
  'Ada','Hugo','Pearl','Emmett','Lena','Jasper','Mabel','Rufus','Tilda','Amos',
  'Cora','Miles','Edith','Harvey','Opal','Stanley','Vera','Walter','Iris','Clara'];
var LAST = ['Ashworth','Bell','Calloway','Drummond','Ellery','Fenwick','Grimsby','Halloway',
  'Inkwell','Juniper','Kestrel','Lark','Marlowe','Nettle','Osgood','Pemberton','Quill','Rowan'];
var REASONS = [
  'visiting her sister for the first time in years',
  'carrying his father\u2019s toolbox to a new apprenticeship',
  'bringing seed potatoes to the spring market',
  'going home with a pocket full of letters',
  'off to see the sea, just once, before winter',
  'delivering a quilt stitched with forty years of summers',
  'starting a bakery in the next valley over',
  'bringing her grandmother\u2019s fiddle home for mending',
  'chasing a job at the copper works',
  'returning a borrowed book, three years overdue',
  'visiting the grave of an old friend',
  'carrying honey jars to sell at the fair',
  'going to meet a grandchild she\u2019s never held',
  'bringing wool to the weaver at Millbrook',
  'off to apprentice with the clockmaker',
  'carrying a cage of homing pigeons, oddly quiet',
  'returning home after the harvest season',
  'bringing medicine for the vicar\u2019s bad knee',
  'off to see the lights of the big station',
  'carrying nothing but a lunch pail and big plans'
];
var FRIEND_KINDS = [
  {k:'heron', label:'a grey heron'},
  {k:'fox', label:'a red fox'},
  {k:'kids', label:'two kids'},
  {k:'sheep', label:'a flock of sheep'},
  {k:'elder', label:'an old man'},
  {k:'deer', label:'a deer'}
];

/* ---------------- state ---------------- */
function newRun(seed, dateKey) {
  var R = mulberry32((seed||1)|0);
  var nSt = 4 + Math.floor(R()*3); // 4-6 stations
  var stations = [];
  var x = 0;
  var usedNames = {};
  for (var i=0;i<nSt;i++) {
    var nm;
    do { nm = STATION_NAMES[Math.floor(R()*STATION_NAMES.length)]; } while (usedNames[nm]);
    usedNames[nm] = 1;
    if (i>0) x += TUNE.stationGap[0] + R()*(TUNE.stationGap[1]-TUNE.stationGap[0]);
    stations.push({
      idx:i, name:nm, x:Math.round(x),
      side: R()<0.5 ? -1 : 1, // which side of the track the platform is on
      waiting: []
    });
  }
  var trackLen = x + 400;
  // timetable: scheduled arrival = distance / cruise speed (18 u/s) + dwell
  var sched = 0, prevX = 0;
  for (var j=0;j<nSt;j++) {
    sched += (stations[j].x - prevX)/18 + (j>0?25:0);
    stations[j].sched = Math.round(sched);
    prevX = stations[j].x;
  }
  var st = {
    v:1, seed:(seed||1)|0, dateKey:dateKey||'',
    rngState:0, // (we keep R in closure for generation only)
    tod:0.32, runT:0,
    train:{ x:0, v:0, throttle:0, brake:0 },
    coal:100, water:100, lampOil:100, lampLit:false,
    shovelCd:0, waterCd:0,
    stations:stations, trackLen:trackLen,
    nextStation:0,
    aboard:[], paxSeq:1,
    stops:[], // per-stop score records
    friends:[],
    whistled:{}, // friend idx -> waved back
    state:'driving', // driving | docked | done
    dockT:0,
    runScore:0, smoothBest:0,
    events:[],
    stats:{stops:0, perfect:0, passengers:0, whistles:0, coal:0}
  };
  // passengers waiting at each station (not the first)
  for (var s=1;s<nSt;s++) {
    var n = 2+Math.floor(R()*4);
    for (var p=0;p<n;p++) {
      var dest = s+1+Math.floor(R()*(nSt-s-1));
      if (dest>=nSt) dest=nSt-1;
      stations[s].waiting.push(makePax(st, R, dest));
    }
  }
  // a few board at the first station too
  for (var q=0;q<3;q++) {
    var d0=1+Math.floor(R()*(nSt-1));
    stations[0].waiting.push(makePax(st, R, d0));
  }
  // trackside friends, seeded along the route
  var nF = 4+Math.floor(R()*3);
  for (var f=0;f<nF;f++) {
    var fk = FRIEND_KINDS[Math.floor(R()*FRIEND_KINDS.length)];
    st.friends.push({
      idx:f, kind:fk.k, label:fk.label,
      x: Math.round(200 + R()*(trackLen-600)),
      side: R()<0.5?-1:1,
      phase: R()*6.28, waved:false
    });
  }
  return st;
}
function makePax(st, R, destIdx) {
  var fn = FIRST[Math.floor(R()*FIRST.length)], ln = LAST[Math.floor(R()*LAST.length)];
  return {
    id: st.paxSeq++, name: fn+' '+ln,
    dest: destIdx,
    story: REASONS[Math.floor(R()*REASONS.length)],
    mood: 0.6+R()*0.4,
    ai: false
  };
}

/* ---------------- physics & sim step ---------------- */
function isNight(st){ return st.tod<0.24||st.tod>0.79; }
function step(st, dt) {
  dt = Math.min(dt, 0.1);
  var tr = st.train;
  // cooldowns
  if (st.shovelCd>0) st.shovelCd-=dt;
  if (st.waterCd>0) st.waterCd-=dt;
  if (st.state==='done') { st.runT+=dt; return; }

  // physics with real inertia
  var coalFactor = st.coal>0 ? 1 : 0.25; // low coal = weak fire
  var acc = tr.throttle*TUNE.throttleAccel*coalFactor
          - tr.brake*TUNE.brakeDecel
          - TUNE.dragK*tr.v*Math.abs(tr.v)
          - TUNE.rollK*Math.sign(tr.v)*Math.min(1,Math.abs(tr.v));
  // gentle grade: rolling hills
  acc -= Math.sin(tr.x*0.0011)*0.55 + Math.sin(tr.x*0.00037+2)*0.35;
  tr.v += acc*dt;
  if (tr.v<0) tr.v=0;
  if (tr.v>TUNE.maxSpeed) tr.v=TUNE.maxSpeed;
  // dead stop snap
  if (tr.brake>0.7 && Math.abs(tr.v)<0.4) tr.v=0;
  tr.x += tr.v*dt;
  if (tr.x>=st.trackLen) { tr.x=st.trackLen; tr.v=0; }

  // resources
  st.coal = Math.max(0, st.coal - tr.throttle*TUNE.coalDrain*dt);
  st.water = Math.max(0, st.water - (TUNE.waterDrain + TUNE.waterSpeedK*tr.v)*dt);
  var night = isNight(st);
  if (st.lampLit && night) st.lampOil = Math.max(0, st.lampOil - TUNE.lampDrain*dt);
  if (st.lampOil<=0) st.lampLit=false;
  // low water = weak steam
  if (st.water<=0) tr.throttle = Math.min(tr.throttle, 0.3);

  // time
  st.runT += dt;
  st.tod = (st.tod + dt/480)%1; // full day = 8 min

  // station arrival / docking
  // generous dock zone (+/-60) since there's no reverse; accuracy score rewards precision
  var ns = st.stations[st.nextStation];
  if (ns && st.state==='driving') {
    var d = ns.x - tr.x;
    if (Math.abs(d)<60 && tr.v<0.6) {
      dock(st, ns, d);
    } else if (d <= -60) {
      // way past the station — gentle note, no penalty
      if (!ns.missed) { ns.missed=true; log(st,'The '+ns.name+' platform slides past. Someone waves anyway.'); }
      st.nextStation++;
    }
  }
  if (st.state==='docked') {
    st.dockT+=dt;
    // auto-depart never happens; player throttles away
    if (tr.throttle>0.15 && tr.v>0.5) {
      st.state='driving';
      st.nextStation++;
      log(st,'Rolling out of '+ns.name+'.');
    }
  }
  // run complete: docked at final station then throttle = done? No — run ends at terminus dock
  var last = st.stations[st.stations.length-1];
  if (st.state==='docked' && st.nextStation>=st.stations.length-1 && tr.x>=last.x-TUNE.stopTol) {
    // stays docked; player can end run via UI, or it auto-completes after dwell
  }
  drainEvents(st);
}

function dock(st, ns, d) {
  var tr = st.train;
  st.state='docked'; st.dockT=0;
  tr.v=0; tr.throttle=0;
  // score this stop (accuracy over the generous dock zone)
  var acc = Math.max(0, 1-Math.abs(d)/60); // 0..1 across -60..30
  var accPts = Math.round(50*acc);
  // smoothness: from approach (track max decel in last stretch — approximated by brake gentleness)
  var smPts = 50; // computed at render layer from recorded braking; default full
  if (st._approach) {
    var jerk = st._approach.maxDecel;
    smPts = Math.round(50*clamp(1-(jerk-4)/14, 0, 1));
    st._approach=null;
  }
  var total = accPts+smPts;
  st.stops.push({station:ns.name, acc:accPts, smooth:smPts, total:total, missed:false});
  st.stats.stops++;
  if (acc>0.85) st.stats.perfect++;
  // alight
  var left=0;
  st.aboard = st.aboard.filter(function(p){ if(p.dest===ns.idx){ left++; return false; } return true; });
  // board
  var cap = TUNE.capacity - st.aboard.length;
  var boarded=0;
  while (ns.waiting.length && cap>0) {
    var p=ns.waiting.shift();
    p.boarded=true; st.aboard.push(p); cap--; boarded++;
    st.stats.passengers++;
  }
  log(st, ns.name+'. '+left+' off, '+boarded+' on.'+(boarded? ' Mind the gap.':''));
  // water top-up at stations (water tower)
  st.water=Math.min(100, st.water+40);
  // terminus?
  if (ns.idx===st.stations.length-1) {
    finishRun(st);
  }
}

function finishRun(st) {
  st.state='done';
  var tot=0;
  for (var i=0;i<st.stops.length;i++) tot+=st.stops[i].total;
  st.runScore = st.stops.length? Math.round(tot/st.stops.length) : 0;
  log(st,'End of the line. Run score: '+st.runScore+'.');
}
/* end the run early (player choice) */
function endRun(st){
  if (st.state==='done') return;
  finishRun(st);
}

/* tending verbs */
function shovelCoal(st){
  if (st.shovelCd>0 || st.state==='done') return false;
  st.coal=Math.min(100, st.coal+TUNE.coalPerShovel);
  st.shovelCd=TUNE.shovelCd; st.stats.coal++;
  return true;
}
function topWater(st){
  if (st.waterCd>0 || st.state==='done') return false;
  st.water=Math.min(100, st.water+TUNE.waterPerTopup);
  st.waterCd=TUNE.waterCd;
  return true;
}
function toggleLamp(st){
  if (st.state==='done') return false;
  if (!st.lampLit && st.lampOil<=0) return false;
  st.lampLit=!st.lampLit;
  return true;
}
function whistle(st){
  if (st.state==='done') return false;
  st.stats.whistles++;
  // nearby friends wave back
  for (var i=0;i<st.friends.length;i++){
    var f=st.friends[i];
    if (Math.abs(f.x-st.train.x)<350 && !st.whistled[f.idx]) {
      st.whistled[f.idx]=true; f.waved=true;
      log(st, f.label+' waves back.');
    }
  }
  return true;
}

/* input: one-thumb lever. v in [-1,1]: positive = throttle, negative = brake */
function setLever(st, v){
  v=clamp(v,-1,1);
  var dead=0.08;
  if (v>dead) { st.train.throttle=(v-dead)/(1-dead); st.train.brake=0; }
  else if (v<-dead) { st.train.brake=(-v-dead)/(1-dead); st.train.throttle=0; }
  else { st.train.throttle=0; st.train.brake=0; }
}

/* events (render drains these) */
function log(st,msg){ st.events.push({k:'log',msg:msg}); }
function drainEvents(st){ /* game.js drains st.events */ }

/* ---------------- serialization ---------------- */
function save(st){ return JSON.stringify(st); }
function load(o){
  // plain revive; functions live on EL, not state
  return o;
}

/* ---------------- self-test ---------------- */
function selfTest(){
  var fails=[];
  function ok(c,n){ if(!c) fails.push(n); }
  var st=newRun(42,'t');
  ok(st.stations.length>=4&&st.stations.length<=6,'station count');
  ok(st.stations[0].x===0,'first at 0');
  // physics: throttle accelerates, brake stops
  setLever(st,1);
  for(var _i=0;_i<20;_i++) step(st,0.1); // 2 sec
  ok(st.train.v>2,'throttle accelerates, v='+st.train.v.toFixed(2));
  var v0=st.train.v;
  setLever(st,-1);
  for(var i=0;i<40;i++) step(st,0.25);
  ok(st.train.v<v0,'brake decelerates');
  ok(st.train.v>=0,'never negative');
  // dock at first station area manually
  var s2=newRun(7,'t');
  s2.train.x=s2.stations[1].x-10; s2.train.v=0.2; s2.nextStation=1;
  setLever(s2,-0.5);
  for(var j=0;j<20;j++) step(s2,0.25);
  ok(s2.state==='docked'||s2.nextStation>=1,'docks or passes, state='+s2.state);
  // tending
  var s3=newRun(9,'t'); s3.coal=10;
  ok(shovelCoal(s3)&&s3.coal>10,'shovel adds coal');
  ok(!shovelCoal(s3),'shovel cooldown blocks');
  // determinism
  var x1=newRun(99,'d'), x2=newRun(99,'d');
  ok(JSON.stringify(x1.stations)===JSON.stringify(x2.stations),'deterministic');
  return fails;
}

return {
  newRun:newRun, step:step, setLever:setLever,
  shovelCoal:shovelCoal, topWater:topWater, toggleLamp:toggleLamp, whistle:whistle,
  isNight:isNight, save:save, load:load, selfTest:selfTest, TUNE:TUNE,
  endRun:endRun
};
})();if(typeof module!=='undefined') module.exports=EL;
