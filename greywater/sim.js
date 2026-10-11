/* Greywater Light — pure simulation. No DOM, no canvas, no audio.
   Deterministic given seed; serializable via GW.save/GW.load.
   The sea, the lamp, the ships, the logbook — and something else. */
'use strict';
var GW = (function () {

/* ---------------- utils ---------------- */
function rnd(st){ st._a|=0; st._a=(st._a+0x6D2B79F5)|0; var t=Math.imul(st._a^(st._a>>>15),1|st._a); t=(t+Math.imul(t^(t>>>7),61|t))^t; return ((t^(t>>>14))>>>0)/4294967296; }
function ri(st,a,b){ return a+Math.floor(rnd(st)*(b-a+1)); }
function pick(st,arr){ return arr[Math.floor(rnd(st)*arr.length)]; }
function clamp(v,a,b){ return v<a?a:(v>b?b:v); }

var DAY_LEN=240, SEASON_DAYS=5;
var SEASONS=['spring','summer','autumn','winter'];
var SEASON_LABEL={spring:'Spring',summer:'Summer',autumn:'Autumn',winter:'Winter'};
var WX_LABEL={clear:'Clear',cloudy:'Overcast',rain:'Rain',storm:'Storm',fog:'Fog'};

/* ---------------- content pools (local fallbacks; AI enriches live) ---------------- */
var NAME_A=['Meridian','Grey','Salt','North','Kestrel','Drift','Sea','Lantern','Brine','Storm','Coral','Mist','Harbor','Tide','Gull','Anchor','Pearl','Ember','Frost','Willow','Cinder','Wren','Lark','Sable'];
var NAME_B=['Star','Gull','Spray','Light','Wing','Swallow','Petrel','Rider','Rose','Maiden','Dancer','Runner','Bell','Song','Wanderer','Bride','Queen','Child','Hope','Lantern'];
var SHIPTYPES={
  schooner:{spd:[26,40],label:'schooner'},
  steamer:{spd:[42,58],label:'steamer'},
  smack:{spd:[16,26],label:'fishing smack'},
  clipper:{spd:[30,44],label:'clipper'}
};
var TYPE_KEYS=['schooner','schooner','steamer','smack','clipper'];
var ORIGINS=['Bergen','St. John\u2019s','Reykjavik','Glasgow','T\u00f3rshavn','Nuuk','Dublin','Bod\u00f8','Halifax','Lerwick','Aberdeen','Vestmannaeyjar'];
var CARGOS=['salt cod','timber','wool','whale oil','tea','coal','ice','dried herring','rope','potatoes','apples','peat'];
var STORIES=[
  'Her captain swears she once outran a November gale with every sail set.',
  'Three voyages now without a lost soul \u2014 the crew touch the mast for luck.',
  'She carries letters. Seventeen of them, bound for hands across the water.',
  'The crew sings on night watch. On still evenings you can almost hear it.',
  'She was built from the bones of a wreck that the rocks claimed in \u201989.',
  'Her figurehead is a gull with one gold eye. The men say it watches back.',
  'Last winter she was iced in at Nuuk for six weeks. The cook learned chess.',
  'She runs a little dark tonight \u2014 only the riding light, and prayers.'
];
var SIGNALS=[[0.25,0.25,0.25],[0.7,0.7],[0.25,0.7,0.25],[0.25,0.25,0.7],[0.7,0.25,0.25,0.25]];
var WHALE_NAMES=['the scarred-fluke one','the old singer','the grey calf\u2019s mother','the deep bell','the barnacled elder'];
var GUIDE_ROCKS=[352,402,452]; // narrows zone x positions (world units)

/* ---------------- state ---------------- */
function newGame(seed){
  var st={
    _a:(seed||1)|0, v:1,
    tod:0.32, day:1, season:1, wt:0,
    wx:{cur:'clear', t:75},
    lamp:{fuel:85, lit:false, lens:92},
    ships:[], shipT:18, shipSeq:1,
    guide:null,
    logbook:[], unread:0,
    cat:{state:'sit', spot:'gallery', t:20},
    whale:{state:'away', t:150, x:500, dir:1, visits:0, name:null, surfT:6, song:[]},
    hornCd:0, fogHornT:30,
    lastSupplyDay:1,
    stats:{ships:0, guided:0, greeted:0, nights:0, whales:0, polishes:0, horns:0},
    fx:[]
  };
  log(st,'sys','You arrive at Greywater Light. The lamp is cold; the sea is waiting.');
  return st;
}
function isNight(st){ return st.tod<0.25||st.tod>0.78; }
function seasonOf(st){ return Math.floor(st.day/SEASON_DAYS)%4; }

function log(st,kind,text){
  st.logbook.push({day:st.day,tod:Math.round(st.tod*1000)/1000,kind:kind,text:text});
  if(st.logbook.length>220) st.logbook.splice(0,st.logbook.length-220);
  st.unread++;
}
function fx(st,k,data){ st.fx.push({k:k,d:data||null}); }

/* ---------------- sea ---------------- */
function waveAmp(st){
  var w=st.wx.cur;
  return w==='storm'?30 : w==='rain'?16 : w==='fog'?8 : w==='cloudy'?10 : 7;
}
function waveH(st,x){
  var t=st.wt, a=waveAmp(st);
  return a*(0.55*Math.sin(x*0.021+t*1.7)+0.3*Math.sin(x*0.043-t*2.3+1.7)+0.15*Math.sin(x*0.09+t*3.1+4.2));
}

/* ---------------- weather ---------------- */
function nextWeather(st){
  var cur=st.wx.cur, s=st.season, o;
  if(cur==='storm') o={rain:5,cloudy:3,clear:1};
  else if(cur==='rain') o={cloudy:4,rain:3,clear:2,storm:(s===3?2:1)};
  else if(cur==='fog') o={cloudy:4,clear:3,rain:1};
  else if(cur==='cloudy') o={clear:4,rain:2,fog:2,storm:1};
  else o={clear:5,cloudy:3,fog:2,rain:1};
  var tot=0,k; for(k in o) tot+=o[k];
  var r=rnd(st)*tot, acc=0, nxt='clear';
  for(k in o){ acc+=o[k]; if(r<=acc){ nxt=k; break; } }
  st.wx.cur=nxt; st.wx.t=60+rnd(st)*100;
  if(nxt==='storm') log(st,'wx','The barometer falls. A storm is coming.');
  else if(nxt==='fog') log(st,'wx','Fog rolls in off the water. The horn will earn its keep.');
}
function stepWeather(st,dt){
  st.wx.t-=dt;
  if(st.wx.t<=0) nextWeather(st);
}

/* ---------------- lamp ---------------- */
function beam(st){ return st.lamp.lit ? 0.35+0.65*(st.lamp.lens/100) : 0; }
function stepLamp(st,dt){
  var L=st.lamp, w=st.wx.cur;
  if(L.lit){
    L.fuel-=dt*0.22;
    if(L.fuel<=0){ L.fuel=0; L.lit=false; log(st,'lamp','The lamp guttered out \u2014 the oil is gone.'); fx(st,'lampOut'); }
  }
  var spray = w==='storm'?0.55 : w==='rain'?0.28 : w==='fog'?0.14 : 0.045;
  L.lens=clamp(L.lens-dt*spray,0,100);
}
function toggleLamp(st){
  var L=st.lamp;
  if(L.lit){ L.lit=false; log(st,'lamp','Lamp dimmed.'); }
  else{
    if(L.fuel<=0){ log(st,'lamp','No oil. The supply boat can\u2019t come soon enough.'); return false; }
    L.lit=true; log(st,'lamp','The lamp is lit. Greywater burns again.');
  }
  return true;
}
function polishLens(st){ st.lamp.lens=100; st.stats.polishes++; }

/* ---------------- ships ---------------- */
function localStory(st){
  var a=pick(st,NAME_A), b=pick(st,NAME_B);
  return {
    name:a+' '+b, type:pick(st,TYPE_KEYS),
    origin:pick(st,ORIGINS), dest:pick(st,ORIGINS), cargo:pick(st,CARGOS),
    story:pick(st,STORIES), signal:pick(st,SIGNALS).slice()
  };
}
function spawnShip(st,forceSupply){
  var s=localStory(st), T=SHIPTYPES[s.type];
  var dir=rnd(st)<0.5?1:-1;
  var sh={
    id:st.shipSeq++, name:s.name, type:forceSupply?'supply':s.type,
    origin:s.origin, dest:s.dest, cargo:s.cargo, story:s.story, signal:s.signal,
    x:dir===1?-130:1130, dir:dir, speed:forceSupply?52:ri(st,T.spd[0],T.spd[1]),
    depth:rnd(st), state:'sail', greeted:false, answered:false,
    needsHelp:false, guided:false, sigT:0, bob:0, pitch:0, dockT:0, ai:null
  };
  if(!forceSupply&&(st.wx.cur==='storm'||st.wx.cur==='fog')&&rnd(st)<0.5) sh.needsHelp=true;
  if(forceSupply){ sh.name='Supply Boat'; sh.story='Oil, wicks, and the post. The keeper\u2019s lifeline.'; }
  st.ships.push(sh);
  return sh;
}
function stepShips(st,dt){
  st.shipT-=dt;
  if(st.shipT<=0&&st.ships.length<2){ spawnShip(st); st.shipT=80+rnd(st)*150; }
  var night=isNight(st), bm=beam(st);
  for(var i=st.ships.length-1;i>=0;i--){
    var sh=st.ships[i];
    if(sh.type==='supply'){
      var tx=640;
      if(sh.state==='sail'){
        var d=tx-sh.x, stepv=sh.speed*dt*(d>0?1:-1);
        sh.x+= (Math.abs(d)<Math.abs(stepv))? d : stepv;
        if(Math.abs(tx-sh.x)<8){ sh.state='docked'; sh.dockT=16; }
      }else if(sh.state==='docked'){
        sh.dockT-=dt;
        if(sh.dockT<=0){
          st.lamp.fuel=100; st.lastSupplyDay=st.day;
          log(st,'ship','The supply boat unloads oil, wicks, and letters. The tanks are full.');
          fx(st,'supplied'); sh.state='leave';
        }
      }else{ sh.x+=sh.dir*sh.speed*dt; }
    }else if(sh.state==='sail'){
      sh.x+=sh.dir*sh.speed*dt;
      // greeting: ships hail the light
      if(!sh.greeted&&Math.abs(sh.x-500)<360&&(!night||bm>0)){
        sh.greeted=true; sh.state='signal'; sh.sigT=7;
        fx(st,'shipHail',{id:sh.id});
      }
      // trouble in the narrows
      if(sh.needsHelp&&!sh.guided&&sh.x>320&&sh.x<480&&!st.guide){
        sh.state='troubled';
        st.guide={ship:sh.id, round:0, phase:'signal', t:1.6};
        log(st,'ship',sh.name+' is standing into the narrows, and the rocks are waiting.');
        fx(st,'shipTrouble',{id:sh.id});
      }
    }else if(sh.state==='signal'){
      sh.x+=sh.dir*sh.speed*dt*0.35; // slows to exchange signals
      sh.sigT-=dt;
      if(sh.sigT<=0) sh.state='sail';
    }else if(sh.state==='troubled'){
      // holds position, waiting for guidance
    }else if(sh.state==='safe'||sh.state==='leave'){
      sh.x+=sh.dir*sh.speed*dt;
    }
    sh.bob=waveH(st,sh.x)*(0.5+sh.depth*0.3);
    sh.pitch=(waveH(st,sh.x+34)-waveH(st,sh.x-34))/68;
    if(sh.x<-170||sh.x>1170){
      if(sh.type!=='supply') st.stats.ships++;
      if(st.guide&&st.guide.ship===sh.id) st.guide=null;
      st.ships.splice(i,1);
    }
  }
  // guidance minigame clock
  var g=st.guide;
  if(g){
    var sh2=null;
    for(var j=0;j<st.ships.length;j++) if(st.ships[j].id===g.ship) sh2=st.ships[j];
    if(!sh2){ st.guide=null; }
    else{
      g.t-=dt;
      if(g.phase==='signal'&&g.t<=0){ g.phase='answer'; g.t=2.0+1.8*bm; fx(st,'guideFlash',{id:sh2.id,round:g.round}); }
      else if(g.phase==='answer'&&g.t<=0){ g.phase='rest'; g.t=2.2; }
      else if(g.phase==='rest'&&g.t<=0){ g.phase='signal'; g.t=1.4; }
    }
  }
}
/* player answers a hail (tap the ship) */
function greetShip(st,id){
  for(var i=0;i<st.ships.length;i++){
    var sh=st.ships[i];
    if(sh.id===id&&sh.state==='signal'&&!sh.answered){
      sh.answered=true; sh.state='sail'; st.stats.greeted++;
      var txt=sh.name+', '+SHIPTYPES[sh.type].label+' out of '+sh.origin+', bound for '+sh.dest+' with '+sh.cargo+'. '+sh.story;
      log(st,'ship','You answer '+sh.name+'\u2019s signals. '+txt);
      fx(st,'greeted',{id:id});
      return sh;
    }
  }
  return null;
}
/* player taps the lamp during a guidance answer window */
function answerSignal(st){
  var g=st.guide;
  if(g&&g.phase==='answer'){
    g.round++;
    var sh=null;
    for(var i=0;i<st.ships.length;i++) if(st.ships[i].id===g.ship) sh=st.ships[i];
    if(g.round>=3){
      if(sh){ sh.state='safe'; sh.guided=true; }
      st.stats.guided++;
      log(st,'ship','Three true flashes. '+(sh?sh.name:'She')+' finds the channel and slips past the rocks.');
      fx(st,'guided',{id:g.ship});
      st.guide=null;
    }else{ g.phase='signal'; g.t=1.4; }
    return true;
  }
  return false;
}

/* ---------------- horn & the whale ---------------- */
function soundHorn(st){
  if(st.hornCd>0) return null;
  st.hornCd=8; st.stats.horns++;
  fx(st,'horn',{});
  var w=st.whale;
  if(w.state==='near'){
    w.state='answering'; w.t=10; w.visits++;
    w.song=genSong(st);
    log(st,'whale','You sound the horn \u2014 and something out in the dark answers. Not a ship.');
    fx(st,'whaleSong',{});
    return {answered:true};
  }
  return {answered:false};
}
function genSong(st){
  // a small motif: 4-6 descending phrases; the whale "harmonizes" with the horn
  var song=[], base=ri(st,0,2);
  var roots=[146.8,164.8,174.6]; // D3 E3 F3 — the horn's neighborhood
  var n=ri(st,4,6);
  for(var i=0;i<n;i++){
    var r0=roots[(base+i)%3];
    song.push({f0:r0*(0.9+rnd(st)*0.2), f1:r0*(0.55+rnd(st)*0.25), dur:1.6+rnd(st)*2.2, gap:0.4+rnd(st)*1.2});
  }
  return song;
}
function stepWhale(st,dt){
  var w=st.whale;
  w.t-=dt;
  w.surfT-=dt;
  if(w.surfT<=0) w.surfT=9+rnd(st)*8;
  if(w.state==='away'&&w.t<=0){
    w.state='near'; w.t=80+rnd(st)*90;
    w.x=150+rnd(st)*700; w.dir=rnd(st)<0.5?1:-1;
    if(!w.name) w.name=pick(st,WHALE_NAMES);
    st.stats.whales++;
    log(st,'whale','A spout on the grey water \u2014 a whale is moving through the sound.');
  }else if(w.state==='near'){
    w.x+=w.dir*dt*14;
    if(w.x<80) w.dir=1; if(w.x>920) w.dir=-1;
    if(w.t<=0){ w.state='leaving'; w.t=18; }
  }else if(w.state==='answering'){
    w.x+=w.dir*dt*6;
    if(w.t<=0){ w.state='leaving'; w.t=18; log(st,'whale','The song fades eastward. The sea keeps its counsel.'); }
  }else if(w.state==='leaving'){
    w.x+=w.dir*dt*30;
    if(w.t<=0){ w.state='away'; w.t=260+rnd(st)*520; }
  }
}

/* ---------------- cat ---------------- */
function stepCat(st,dt){
  var c=st.cat;
  c.t-=dt;
  if(st.wx.cur==='storm'&&c.spot!=='lamp'){ c.spot='lamp'; c.state='sleep'; }
  if(c.t<=0){
    c.t=25+rnd(st)*60;
    var r=rnd(st);
    c.state=r<0.4?'sleep':r<0.65?'sit':r<0.85?'wash':'watch';
    if(st.wx.cur!=='storm') c.spot=pick(st,['gallery','gallery','lamp','rocks']);
  }
}

/* ---------------- main step ---------------- */
function step(st,dt){
  dt=Math.min(dt,0.5);
  st.wt+=dt;
  var wasNight=isNight(st);
  // time
  st.tod+=dt/DAY_LEN;
  if(st.tod>=1){
    st.tod-=1; st.day++;
    var s=Math.floor(st.day/SEASON_DAYS)%4;
    if(s!==st.season){ st.season=s; log(st,'sys',SEASON_LABEL[s]+' comes to Greywater. The light keeps its own calendar.'); }
    if(st.day-st.lastSupplyDay>=3&&!st.ships.some(function(q){return q.type==='supply';})){
      spawnShip(st,true); // supply boat puts to sea
    }
  }
  var nowNight=isNight(st);
  if(nowNight&&!wasNight&&st.lamp.lit){ st.stats.nights++; }
  if(st.hornCd>0) st.hornCd-=dt;
  // fog: the horn sounds itself
  if(st.wx.cur==='fog'){
    st.fogHornT-=dt;
    if(st.fogHornT<=0){ st.fogHornT=38+rnd(st)*20; fx(st,'horn',{auto:true}); }
  }else st.fogHornT=30;
  stepWeather(st,dt);
  stepLamp(st,dt);
  stepShips(st,dt);
  stepWhale(st,dt);
  stepCat(st,dt);
}

/* ---------------- save/load ---------------- */
function save(st){ return JSON.stringify(st); }
function load(json){
  var st=JSON.parse(json);
  if(!st||st.v!==1) return null;
  if(!st.fx) st.fx=[];
  return st;
}

/* ---------------- self test ---------------- */
function selfTest(){
  var fails=[];
  function ok(c,m){ if(!c) fails.push(m); }
  var st=newGame(1234);
  ok(st.ships.length===0,'no ships at start');
  // run ~15 game-days (step clamps dt to 0.5, so double the iterations)
  for(var i=0;i<7200;i++) step(st,1);
  ok(st.day>=14,'day advanced, got '+st.day);
  ok(st.logbook.length>5,'logbook grew');
  ok(st.stats.ships>0,'ships passed');
  ok(!isNaN(st.wt),'wave clock sane');
  // lamp burns fuel
  var st2=newGame(7);
  st2.lamp.fuel=100; toggleLamp(st2);
  for(var j=0;j<300;j++) step(st2,1);
  ok(st2.lamp.fuel<100,'fuel burns when lit');
  // lens degrades
  ok(st2.lamp.lens<92,'lens degrades');
  // waves finite
  for(var x=0;x<1000;x+=50){ var h=waveH(st2,x); ok(isFinite(h)&&Math.abs(h)<60,'wave sane at '+x); }
  // guidance flow
  var st3=newGame(99);
  st3.wx.cur='storm';
  var sh=spawnShip(st3); sh.needsHelp=true; sh.x=400; sh.state='sail';
  step(st3,0.1);
  ok(st3.guide!==null,'guidance starts in narrows');
  var rounds=0;
  for(var k=0;k<600&&st3.guide;k++){
    step(st3,0.2);
    var g=st3.guide;
    if(g&&g.phase==='answer'){ if(answerSignal(st3)) rounds++; }
  }
  ok(rounds===3,'three answers complete guidance, got '+rounds);
  ok(st3.stats.guided===1,'guided stat');
  // greeting flow
  var st4=newGame(5);
  st4.tod=0.5; st4.lamp.lit=true;
  var sh4=spawnShip(st4); sh4.x=500; sh4.state='sail';
  step(st4,0.1);
  ok(sh4.state==='signal','ship hails');
  var g4=greetShip(st4,sh4.id);
  ok(g4!==null&&st4.stats.greeted===1,'greeting works');
  // horn + whale
  var st5=newGame(11);
  st5.whale.state='near'; st5.whale.x=500;
  var r=soundHorn(st5);
  ok(r&&r.answered===true,'whale answers the horn');
  ok(st5.whale.song.length>=4,'whale song generated');
  // supply boat
  var st6=newGame(3);
  st6.lamp.fuel=10; st6.day=4; st6.tod=0.99; st6.lastSupplyDay=1;
  var sup=spawnShip(st6,true);
  for(var m=0;m<400&&st6.lamp.fuel<100;m++) step(st6,0.5);
  ok(st6.lamp.fuel===100,'supply refills fuel');
  // save/load round trip
  var s=save(st); var st7=load(s);
  ok(st7&&st7.day===st.day&&st7.stats.ships===st.stats.ships,'save/load round trip');
  // no NaN anywhere important
  ['tod','day','wt'].forEach(function(k){ ok(isFinite(st[k]),k+' finite'); });
  return fails;
}

return {
  newGame:newGame, step:step, save:save, load:load,
  toggleLamp:toggleLamp, polishLens:polishLens, greetShip:greetShip,
  answerSignal:answerSignal, soundHorn:soundHorn, spawnShip:spawnShip,
  isNight:isNight, beam:beam, waveH:waveH, waveAmp:waveAmp,
  SEASONS:SEASONS, SEASON_LABEL:SEASON_LABEL, WX_LABEL:WX_LABEL,
  DAY_LEN:DAY_LEN, GUIDE_ROCKS:GUIDE_ROCKS, SHIPTYPES:SHIPTYPES,
  selfTest:selfTest
};
})();
if(typeof module!=='undefined') module.exports=GW;
