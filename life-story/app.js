/* Life Story v2 — UI wiring. LifeSim (life.js) holds all game logic. */
(function () {
  'use strict';
  var S = null;
  var $ = function (id) { return document.getElementById(id); };

  function legacy() {
    try { return JSON.parse(localStorage.getItem('lifestory') || '{}'); }
    catch (e) { return {}; }
  }
  function saveLegacy(patch) {
    var L = legacy();
    for (var k in patch) L[k] = patch[k];
    try { localStorage.setItem('lifestory', JSON.stringify(L)); } catch (e) {}
  }
  function recordDeath() {
    var L = legacy();
    var ribbons = L.ribbons || [];
    if (ribbons.indexOf(S.ribbon.t) < 0) ribbons.push(S.ribbon.t);
    saveLegacy({
      lives: (L.lives || 0) + 1,
      best: Math.max(L.best || 0, LifeSim.netWorth(S)),
      ribbons: ribbons,
      wins: (L.wins || 0) + (S.won ? 1 : 0)
    });
  }

  var toastT = null;
  function toast(msg) {
    var t = $('toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(function () { t.classList.remove('show'); }, 2200);
  }
  function avatar() {
    if (S.age < 3) return '🍼';
    if (S.age < 13) return S.gender === 'M' ? '👦' : '👧';
    if (S.age < 60) return S.gender === 'M' ? '👨' : '👩';
    return S.gender === 'M' ? '👴' : '👵';
  }

  function stage(age) {
    if (age < 3) return 'Baby';
    if (age < 13) return 'Kid';
    if (age < 18) return 'Teen';
    if (age < 30) return 'Young adult';
    if (age < 60) return 'Adult';
    if (age < 80) return 'Senior';
    return 'Elder';
  }

  var prevStats = {};
  function render() {
    if (!S) return;
    $('avatar').textContent = avatar();
    $('pname').textContent = S.name;
    var extra = '';
    if (S.jail > 0) extra += ' · 🔒 ' + S.jail + 'y left';
    if (S.studying) extra += ' · 🎓 studying';
    if (S.fame >= 20) extra += ' · ⭐' + S.fame;
    if (S.followers >= 1000) extra += ' · 📱' + LifeSim.fmtN(S.followers);
    $('page').textContent = stage(S.age) + ' · Age ' + S.age + ' · ' + S.city + extra;
    $('pmoney').textContent = LifeSim.fmt(LifeSim.netWorth(S));
    [['happy', 'b-happy'], ['health', 'b-health'], ['smarts', 'b-smarts'], ['looks', 'b-looks']].forEach(function (pair) {
      var bar = $(pair[1]), num = $(pair[1] + '-n'), v = S[pair[0]];
      bar.style.width = v + '%';
      if (num) num.textContent = v;
      if (prevStats[pair[0]] !== undefined && prevStats[pair[0]] !== v) {
        bar.classList.remove('up', 'down');
        void bar.offsetWidth;
        bar.classList.add(v > prevStats[pair[0]] ? 'up' : 'down');
      }
      prevStats[pair[0]] = v;
    });
    var j = $('journal');
    j.innerHTML = S.log.map(function (e) {
      return '<div class="entry"><span class="ag">Age ' + e.age + '</span>' + e.text + '</div>';
    }).join('');
  }

  function btn(label, sub, fn, disabledReason) {
    var b = document.createElement('button');
    b.className = 'act';
    var showSub = disabledReason || sub;
    b.innerHTML = '<span>' + label + (showSub ? '<small>' + showSub + '</small>' : '') + '</span><span class="go">›</span>';
    if (disabledReason) { b.disabled = true; }
    else b.onclick = function () {
      var r = fn();
      if (r && r.ok === false) toast(r.msg);
      render();
      if (!S.alive) showDeath();
      else openSheet(currentTab);
    };
    return b;
  }
  function sect(t) { var d = document.createElement('div'); d.className = 'sect'; d.textContent = t; return d; }
  function info(t) { var d = document.createElement('div'); d.className = 'act'; d.style.opacity = '.8'; d.innerHTML = '<span>' + t + '</span>'; return d; }
  var currentTab = 'act';
  var TITLES = { act: '🎯 Life', love: '💕 Love', job: '💼 Career', assets: '🏠 Assets', crime: '🕶️ Crime' };

  function openSheet(tab) {
    currentTab = tab;
    document.querySelectorAll('#tabs button').forEach(function (b) {
      b.classList.toggle('on', b.dataset.tab === tab);
    });
    $('sheet-title').textContent = TITLES[tab];
    var body = $('sheet-body');
    body.innerHTML = '';
    var acts = LifeSim.actions;
    var add = function (el) { body.appendChild(el); };
    var locked = S.jail > 0;

    if (tab === 'act') {
      if (locked) {
        add(sect('Prison life'));
        add(btn('🕳️ Bribe a guard', '$5,000 · 40% odds', function () { return acts.escape(S, 'bribe'); }));
        add(btn('🥄 Dig a tunnel', '35% odds · +1y if caught', function () { return acts.escape(S, 'tunnel'); }));
        add(btn('🔥 Start a riot', '25% odds · +3y if caught', function () { return acts.escape(S, 'riot'); }));
        add(btn('📚 Prison book club', 'Free. Surprisingly good.', function () { return acts.meditate(S); }));
        $('sheet').classList.remove('hidden');
        return;
      }
      add(sect('Mind & body'));
      add(btn('📖 Study hard', 'Smarts up, fun down', function () { return acts.study(S); }));
      add(btn('🏋️ Hit the gym', 'Health & looks up', function () { return acts.gym(S); }));
      add(btn('📚 Library', 'Quiet smarts boost', function () { return acts.library(S); }));
      add(btn('🩺 See a doctor', '$200 · Health boost', function () { return acts.doctor(S); }));
      add(btn('🧘 Meditate', 'Happiness up', function () { return acts.meditate(S); }));
      add(sect('Look sharp'));
      add(btn('💇 Salon visit', '$150 · Looks up', function () { return acts.salon(S); }));
      add(btn('✨ Plastic surgery', '$8,000 · risky', function () { return acts.surgery(S); }, S.age < 18 ? '18+' : null));
      add(sect('Spotlight'));
      add(btn('📱 Post on social media', (S.followers ? LifeSim.fmtN(S.followers) + ' followers' : 'Build your following'), function () { return acts.postSocial(S); }, S.age < 13 ? '13+' : null));
      add(btn('🎤 Do an interview', 'Needs 20 fame', function () { return acts.interview(S); }, S.fame < 20 ? 'Get famous first' : null));
      add(sect('Treat yourself'));
      add(btn('🎰 Lottery ticket', '$10 · dream big', function () { return acts.lottery(S); }, S.age < 18 ? '18+' : null));
      add(btn('🏝️ Vacation', '$3,000 · big happiness', function () { return acts.vacation(S); }, S.age < 18 ? '18+' : null));
      add(sect('Money moves'));
      add(btn('📈 Invest $10K in stocks', S.stocks ? 'Holding ' + LifeSim.fmt(S.stocks) : 'High risk, high reward', function () { return acts.buyStocks(S, 10000); }, S.age < 18 ? '18+' : null));
      if (S.stocks >= 1) add(btn('📉 Cash out stocks', 'Sell for ' + LifeSim.fmt(S.stocks), function () { return acts.sellStocks(S); }));
      add(btn('🏪 Buy a business', S.business ? 'Own: ' + S.business.name : '$200,000', function () { return acts.buyBusiness(S); }, S.business ? 'Already own one' : S.age < 18 ? '18+' : null));
      if (S.business) add(btn('💼 Sell ' + S.business.name, 'Worth ' + LifeSim.fmt(S.business.value), function () { return acts.sellBusiness(S); }));
      add(btn('🕊️ Donate $10K', 'Given: ' + LifeSim.fmt(S.donated), function () { return acts.donate(S, 10000); }, S.age < 18 ? '18+' : null));
      add(btn('📜 Write your will', S.willWritten ? 'Done. Very responsible.' : 'For the kids', function () { return acts.writeWill(S); }, S.willWritten ? 'Done' : S.age < 18 ? '18+' : null));
      add(sect('Education · ' + LifeSim.EDU_NAMES[S.edu]));
      add(btn('🎓 University', '$40,000 · 4 years', function () { return acts.goUniversity(S); }, S.edu >= 2 ? 'Done' : S.age < 18 ? '18+' : null));
      add(btn('🎓 Graduate school', '$60,000 · 2 years', function () { return acts.goGrad(S); }, S.edu >= 3 ? 'Done' : S.edu < 2 ? 'Need university' : null));
    }
    if (tab === 'love') {
      if (locked) { add(info('🔒 Love can wait. You\'re in prison.')); }
      else if (!S.partner) {
        add(btn('💘 Find love', 'Looks help. Obviously.', function () { return acts.findLove(S); }, S.age < 18 ? '18+' : null));
      } else {
        var p = S.partner;
        add(sect((p.married ? 'Married to ' : 'Dating ') + p.name + ' · ❤️' + p.affection));
        if (!p.married) add(btn('💍 Propose', '$5,000 wedding', function () { return acts.propose(S); }));
        else add(btn('👶 Have a baby', 'The ultimate legacy', function () { return acts.haveBaby(S); }, S.age > 50 ? 'Too late' : null));
        add(btn('🌹 Date night', 'Affection up', function () { return acts.dateNight(S); }));
        add(btn(p.married ? '⚖️ Divorce' : '💔 Break up', p.married ? 'Lose half your money. Ouch.' : 'It\'s not you...', function () { return acts.breakup(S); }));
      }
      if (S.kids.length) {
        add(sect('Kids (' + S.kids.length + ')'));
        S.kids.forEach(function (k) {
          add(info('👶 ' + k.name + ' · age ' + k.age));
        });
      }
    }
    if (tab === 'job') {
      if (locked) { add(info('🔒 No career moves from a cell.')); }
      else if (S.job) {
        var jdef = LifeSim.JOBS.filter(function (x) { return x.t === S.job.t; })[0];
        add(sect(S.job.t + ' · ' + LifeSim.fmt(S.job.sal) + '/yr · perf ' + S.job.perf + (jdef.fame ? ' · ⭐' + S.fame : '')));
        add(btn('💪 Work hard', 'Performance up, mood down', function () { return acts.workHard(S); }));
        add(btn('💰 Ask for a raise', 'Needs good performance', function () { return acts.askRaise(S); }));
        add(btn('🚪 Quit', 'Walk out like a legend', function () { return acts.quitJob(S); }));
      } else {
        add(sect('Openings · ⭐ = fame career'));
        acts.jobList(S).forEach(function (j) {
          add(btn('💼 ' + j.t + (j.fame ? ' ⭐' : ''), LifeSim.fmt(j.sal) + '/yr' + (j.lock ? ' · 🔒 ' + j.lock : ''), function () { return acts.applyJob(S, j.i); }, j.lock || null));
        });
      }
    }
    if (tab === 'assets') {
      if (locked) { add(info('🔒 Your assets are fine. You are not.')); }
      else {
        add(sect('Buy property'));
        LifeSim.HOUSES.forEach(function (h, i) {
          add(btn('🏠 ' + h.t, LifeSim.fmt(h.price), function () { return acts.buyHouse(S, i); }, S.money < h.price ? 'Can\'t afford' : null));
        });
        add(sect('Buy a car'));
        LifeSim.CARS.forEach(function (c, i) {
          add(btn('🚗 ' + c.t, LifeSim.fmt(c.price), function () { return acts.buyCar(S, i); }, S.money < c.price ? 'Can\'t afford' : null));
        });
      }
      if (S.houses.length) {
        add(sect('Your homes · tap to sell'));
        S.houses.forEach(function (h, i) {
          add(btn('🏠 ' + h.t, 'Worth ' + LifeSim.fmt(h.value), function () { return acts.sellHouse(S, i); }));
        });
      }
      if (S.cars.length) {
        add(sect('Your cars · tap to sell'));
        S.cars.forEach(function (c, i) {
          add(btn('🚗 ' + c.t, 'Worth ' + LifeSim.fmt(c.value), function () { return acts.sellCar(S, i); }));
        });
      }
    }
    if (tab === 'crime') {
      if (locked) {
        add(sect('Break out'));
        add(btn('🕳️ Bribe a guard', '$5,000 · 40% odds', function () { return acts.escape(S, 'bribe'); }));
        add(btn('🥄 Dig a tunnel', '35% odds · +1y if caught', function () { return acts.escape(S, 'tunnel'); }));
        add(btn('🔥 Start a riot', '25% odds · +3y if caught', function () { return acts.escape(S, 'riot'); }));
      } else {
        add(sect('High risk, high reward'));
        LifeSim.CRIMES.forEach(function (c, i) {
          add(btn('🕶️ ' + c.t, 'Up to ' + LifeSim.fmt(c.reward) + ' · ' + c.jail + 'y if caught', function () { return acts.crime(S, i); }, S.age < 14 ? '14+' : null));
        });
      }
      if (S.jailTotal > 0 || S.crimes > 0) add(sect('Rap sheet: ' + S.crimes + ' crimes · ' + S.jailTotal + 'y served' + (S.escaped ? ' · ' + S.escaped + ' escapes' : '')));
    }
    $('sheet').classList.remove('hidden');
  }

  function startLife(scenarioId, inherit) {
    S = LifeSim.newLife(scenarioId, inherit);
    $('start').classList.add('hidden');
    $('death').classList.add('hidden');
    $('sheet').classList.add('hidden');
    render();
    $('journal').scrollTop = 0;
  }

  function confetti() {
    var c = $('confetti');
    if (!c.getContext) return;
    var ctx = c.getContext('2d');
    c.width = window.innerWidth; c.height = window.innerHeight;
    c.classList.remove('hidden');
    var colors = ['#ffd166', '#7c5cff', '#4dd0a6', '#ff6b9d', '#2ea8ff'];
    var parts = [];
    for (var i = 0; i < 140; i++) parts.push({
      x: Math.random() * c.width, y: -20 - Math.random() * c.height * 0.4,
      w: 6 + Math.random() * 6, h: 8 + Math.random() * 8,
      vy: 2 + Math.random() * 3.5, vx: -1.5 + Math.random() * 3,
      r: Math.random() * Math.PI, vr: -0.12 + Math.random() * 0.24,
      col: colors[i % colors.length]
    });
    var t = 0;
    (function tick() {
      ctx.clearRect(0, 0, c.width, c.height);
      parts.forEach(function (p) {
        p.x += p.vx; p.y += p.vy; p.r += p.vr;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r);
        ctx.fillStyle = p.col; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      });
      if (++t < 200) requestAnimationFrame(tick);
      else c.classList.add('hidden');
    })();
  }

  function showDeath() {
    recordDeath();
    $('d-emoji').textContent = S.ribbon.e;
    $('d-name').textContent = S.name;
    $('d-cause').textContent = S.deathCause.charAt(0).toUpperCase() + S.deathCause.slice(1) + '.';
    var banner = S.won ? '<div class="winbanner">🏆 SCENARIO COMPLETE!</div>' : '';
    $('d-ribbon-e').textContent = S.ribbon.e;
    $('d-ribbon-t').textContent = S.ribbon.t;
    $('d-ribbon-d').innerHTML = banner + S.ribbon.d;
    $('d-stats').innerHTML =
      '<div><span>Final age</span><b>' + S.age + '</b></div>' +
      '<div><span>Net worth</span><b>' + LifeSim.fmt(LifeSim.netWorth(S)) + '</b></div>' +
      '<div><span>Career</span><b>' + (S.job ? S.job.t : '—') + '</b></div>' +
      '<div><span>Kids</span><b>' + S.kids.length + '</b></div>' +
      (S.fame >= 20 ? '<div><span>Fame</span><b>⭐' + S.fame + '</b></div>' : '') +
      (S.followers >= 1000 ? '<div><span>Followers</span><b>' + LifeSim.fmtN(S.followers) + '</b></div>' : '');
    var canKid = S.kids.length > 0 && LifeSim.netWorth(S) > 0;
    $('child-btn').classList.toggle('hidden', !canKid);
    $('death').classList.remove('hidden');
    if (S.won) setTimeout(confetti, 350);
  }

  function buildScenarios() {
    var wrap = $('scenario-pick');
    wrap.innerHTML = '';
    LifeSim.SCENARIOS.forEach(function (sc) {
      var b = document.createElement('button');
      b.className = 'scen';
      b.innerHTML = '<b>' + sc.name + '</b><small>' + sc.desc + '</small>';
      b.onclick = function () { startLife(sc.id, null); };
      wrap.appendChild(b);
    });
  }

  function showLegacy() {
    var L = legacy();
    $('legacy').innerHTML = L.lives
      ? '🪦 ' + L.lives + ' lives · 🏆 ' + (L.wins || 0) + ' scenarios beaten<br>💰 best: ' + LifeSim.fmt(L.best || 0) + ' · 🎗️ ribbons: ' + (L.ribbons || []).length
      : 'No lives lived yet. Make the first one count.';
  }

  $('age-btn').onclick = function () {
    if (!S || !S.alive) return;
    LifeSim.ageUp(S);
    render();
    $('journal').scrollTop = 0;
    if (!S.alive) showDeath();
  };
  document.querySelectorAll('#tabs button').forEach(function (b) {
    b.onclick = function () { if (S && S.alive) openSheet(b.dataset.tab); };
  });
  function closeSheet() {
    $('sheet').classList.add('hidden');
    document.querySelectorAll('#tabs button').forEach(function (b) { b.classList.remove('on'); });
  }
  $('sheet-x').onclick = closeSheet;
  $('sheet').addEventListener('click', function (e) { if (e.target === $('sheet')) closeSheet(); });
  $('again-btn').onclick = function () { $('death').classList.add('hidden'); $('start').classList.remove('hidden'); showLegacy(); };
  $('child-btn').onclick = function () {
    var kid = S.kids[0];
    var money = LifeSim.netWorth(S);
    startLife(S.scenario, { money: money });
    S.name = kid.name;
    S.log.unshift({ age: 0, text: '👶 Continuing the family story as ' + kid.name + ', heir to ' + LifeSim.fmt(money) + '.' });
    render();
  };

  buildScenarios();
  showLegacy();
})();
