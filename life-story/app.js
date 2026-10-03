/* Life Story — UI wiring. LifeSim (life.js) holds all game logic. */
(function () {
  'use strict';
  var S = null;
  var $ = function (id) { return document.getElementById(id); };

  /* ---------- persistence ---------- */
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
      ribbons: ribbons
    });
  }

  /* ---------- helpers ---------- */
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

  function render() {
    if (!S) return;
    $('avatar').textContent = avatar();
    $('pname').textContent = S.name;
    $('page').innerHTML = 'Age ' + S.age + ' · ' + S.city +
      (S.jail > 0 ? ' · 🔒 ' + S.jail + 'y left' : '') +
      (S.studying ? ' · 🎓 studying' : '');
    $('pmoney').textContent = LifeSim.fmt(LifeSim.netWorth(S));
    $('b-happy').style.width = S.happy + '%';
    $('b-health').style.width = S.health + '%';
    $('b-smarts').style.width = S.smarts + '%';
    $('b-looks').style.width = S.looks + '%';
    var j = $('journal');
    j.innerHTML = S.log.map(function (e) {
      return '<div class="entry"><span class="ag">Age ' + e.age + '</span>' + e.text + '</div>';
    }).join('');
  }

  /* ---------- sheets ---------- */
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
      else openSheet(currentTab); // refresh availability
    };
    return b;
  }
  function sect(t) { var d = document.createElement('div'); d.className = 'sect'; d.textContent = t; return d; }
  var currentTab = 'act';
  var TITLES = { act: '🎯 Life', love: '💕 Love', job: '💼 Career', assets: '🏠 Assets', crime: '🕶️ Crime' };

  function openSheet(tab) {
    currentTab = tab;
    $('sheet-title').textContent = TITLES[tab];
    var body = $('sheet-body');
    body.innerHTML = '';
    var acts = LifeSim.actions;
    var add = function (el) { body.appendChild(el); };

    if (tab === 'act') {
      add(sect('Mind & body'));
      add(btn('📖 Study hard', 'Smarts up, fun down', function () { return acts.study(S); }));
      add(btn('🏋️ Hit the gym', 'Health & looks up', function () { return acts.gym(S); }));
      add(btn('📚 Library', 'Quiet smarts boost', function () { return acts.library(S); }));
      add(btn('🩺 See a doctor', '$200 · Health boost', function () { return acts.doctor(S); }));
      add(btn('🧘 Meditate', 'Happiness up', function () { return acts.meditate(S); }));
      add(sect('Treat yourself'));
      add(btn('🎰 Lottery ticket', '$10 · dream big', function () { return acts.lottery(S); }, S.age < 18 ? '18+' : null));
      add(btn('🏝️ Vacation', '$3,000 · big happiness', function () { return acts.vacation(S); }, S.age < 18 ? '18+' : null));
      add(sect('Education · ' + LifeSim.EDU_NAMES[S.edu]));
      add(btn('🎓 University', '$40,000 · 4 years', function () { return acts.goUniversity(S); }, S.edu >= 2 ? 'Done' : S.age < 18 ? '18+' : null));
      add(btn('🎓 Graduate school', '$60,000 · 2 years', function () { return acts.goGrad(S); }, S.edu >= 3 ? 'Done' : S.edu < 2 ? 'Need university' : null));
    }
    if (tab === 'love') {
      if (!S.partner) {
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
          var d = document.createElement('div'); d.className = 'act';
          d.innerHTML = '<span>👶 ' + k.name + '<small>Age ' + k.age + '</small></span>';
          add(d);
        });
      }
    }
    if (tab === 'job') {
      if (S.job) {
        add(sect(S.job.t + ' · ' + LifeSim.fmt(S.job.sal) + '/yr · perf ' + S.job.perf));
        add(btn('💪 Work hard', 'Performance up, mood down', function () { return acts.workHard(S); }));
        add(btn('💰 Ask for a raise', 'Needs good performance', function () { return acts.askRaise(S); }));
        add(btn('🚪 Quit', 'Walk out like a legend', function () { return acts.quitJob(S); }));
      } else {
        add(sect('Openings'));
        acts.jobList(S).forEach(function (j) {
          add(btn('💼 ' + j.t, LifeSim.fmt(j.sal) + '/yr' + (j.lock ? ' · 🔒 ' + j.lock : ''), function () { return acts.applyJob(S, j.i); }, j.lock || null));
        });
      }
    }
    if (tab === 'assets') {
      add(sect('Buy property'));
      LifeSim.HOUSES.forEach(function (h, i) {
        add(btn('🏠 ' + h.t, LifeSim.fmt(h.price), function () { return acts.buyHouse(S, i); }, S.money < h.price ? 'Can\'t afford' : null));
      });
      add(sect('Buy a car'));
      LifeSim.CARS.forEach(function (c, i) {
        add(btn('🚗 ' + c.t, LifeSim.fmt(c.price), function () { return acts.buyCar(S, i); }, S.money < c.price ? 'Can\'t afford' : null));
      });
      if (S.houses.length) {
        add(sect('Your homes'));
        S.houses.forEach(function (h, i) {
          add(btn('🏠 ' + h.t, 'Worth ' + LifeSim.fmt(h.value) + ' · tap to sell', function () { return acts.sellHouse(S, i); }));
        });
      }
      if (S.cars.length) {
        add(sect('Your cars'));
        S.cars.forEach(function (c, i) {
          add(btn('🚗 ' + c.t, 'Worth ' + LifeSim.fmt(c.value) + ' · tap to sell', function () { return acts.sellCar(S, i); }));
        });
      }
    }
    if (tab === 'crime') {
      add(sect('High risk, high reward'));
      LifeSim.CRIMES.forEach(function (c, i) {
        add(btn('🕶️ ' + c.t, 'Up to ' + LifeSim.fmt(c.reward) + ' · ' + c.jail + 'y if caught', function () { return acts.crime(S, i); }, S.age < 14 ? '14+' : null));
      });
      if (S.jailTotal > 0) add(sect('Rap sheet: ' + S.crimes + ' crimes · ' + S.jailTotal + 'y served'));
    }
    $('sheet').classList.remove('hidden');
  }

  /* ---------- flow ---------- */
  function startLife(inherit) {
    S = LifeSim.newLife(inherit);
    $('start').classList.add('hidden');
    $('death').classList.add('hidden');
    $('sheet').classList.add('hidden');
    render();
    $('journal').scrollTop = 0;
  }

  function showDeath() {
    recordDeath();
    $('d-emoji').textContent = S.ribbon.e;
    $('d-name').textContent = S.name;
    $('d-cause').textContent = S.deathCause.charAt(0).toUpperCase() + S.deathCause.slice(1) + '.';
    $('d-ribbon-e').textContent = S.ribbon.e;
    $('d-ribbon-t').textContent = S.ribbon.t;
    $('d-ribbon-d').textContent = S.ribbon.d;
    $('d-stats').innerHTML =
      '<div><span>Final age</span><b>' + S.age + '</b></div>' +
      '<div><span>Net worth</span><b>' + LifeSim.fmt(LifeSim.netWorth(S)) + '</b></div>' +
      '<div><span>Career</span><b>' + (S.job ? S.job.t : '—') + '</b></div>' +
      '<div><span>Kids</span><b>' + S.kids.length + '</b></div>';
    var canKid = S.kids.length > 0 && LifeSim.netWorth(S) > 0;
    $('child-btn').classList.toggle('hidden', !canKid);
    $('death').classList.remove('hidden');
  }

  function showLegacy() {
    var L = legacy();
    $('legacy').innerHTML = L.lives
      ? '🪦 ' + L.lives + ' lives lived · 💰 best: ' + LifeSim.fmt(L.best || 0) + '<br>🏆 ribbons: ' + (L.ribbons || []).length
      : 'No lives lived yet. Make the first one count.';
  }

  /* ---------- wire up ---------- */
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
  $('sheet-x').onclick = function () { $('sheet').classList.add('hidden'); };
  $('sheet').addEventListener('click', function (e) { if (e.target === $('sheet')) $('sheet').classList.add('hidden'); });
  $('new-life-btn').onclick = function () { startLife(null); };
  $('again-btn').onclick = function () { startLife(null); };
  $('child-btn').onclick = function () {
    var kid = S.kids[0];
    var money = LifeSim.netWorth(S);
    startLife({ money: money });
    S.name = kid.name; // keep the kid's identity
    S.log.unshift({ age: 0, text: '👶 Continuing the family story as ' + kid.name + ', heir to ' + LifeSim.fmt(money) + '.' });
    render();
  };

  showLegacy();
})();
