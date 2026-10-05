/* Wildgrove — one-finger input.
 * hand:  tap = select ripple, tap-hold (450ms) = observe card
 * plant: tap = open picker (first tap) then tap ground to plant
 * water: drag = water along the stroke
 */
(function () {
  var tool = "hand";
  var canvas = null, world = null;
  var downPos = null, downT = 0, holdTimer = null, holdFired = false;
  var lastWater = 0;
  var pickedPlant = null;

  function buzz(ms) {
    try { if (navigator.vibrate) navigator.vibrate(ms || 10); } catch (e) {}
  }

  function init(cv, w) {
    canvas = cv; world = w;
    canvas.style.touchAction = "none";
    canvas.addEventListener("pointerdown", function (e) {
      if (window.WGUi && WGUi.wakeHud) WGUi.wakeHud();
      onDown(e);
    });
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    canvas.addEventListener("contextmenu", function (e) { e.preventDefault(); });
  }

  function toWorld(e) {
    var r = canvas.getBoundingClientRect();
    var cx = e.clientX - r.left, cy = e.clientY - r.top;
    return WGR.cssToWorld(cx, cy);
  }

  function animalAt(x, y) {
    var best = null, bd = 70;
    for (var i = 0; i < world.animals.length; i++) {
      var a = world.animals[i];
      if (a.state === "hide") continue;
      var d = Math.hypot(a.x - x, a.y - y);
      if (d < bd) { bd = d; best = a; }
    }
    return best;
  }

  function onDown(e) {
    WGAudio.ensure();
    var p = toWorld(e);
    downPos = p; downT = Date.now(); holdFired = false;
    if (tool === "water") {
      doWater(p.x, p.y);
    } else if (tool === "hand") {
      var a = animalAt(p.x, p.y);
      if (a) {
        holdTimer = setTimeout(function () {
          holdFired = true;
          WGUi.observe(a.id);
        }, 450);
      }
    }
    e.preventDefault();
  }

  function onMove(e) {
    if (!downPos) return;
    var p = toWorld(e);
    if (tool === "water") {
      var now = Date.now();
      if (now - lastWater > 90) {
        lastWater = now;
        doWater(p.x, p.y);
      }
    } else if (tool === "hand" && holdTimer) {
      // moved too far: cancel the hold
      if (Math.hypot(p.x - downPos.x, p.y - downPos.y) > 26) {
        clearTimeout(holdTimer); holdTimer = null;
      }
    }
    e.preventDefault();
  }

  function onUp(e) {
    if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
    var p = downPos; downPos = null;
    if (!p || holdFired) return;
    var up = toWorld(e);
    var moved = Math.hypot(up.x - p.x, up.y - p.y);
    if (moved > 26) return; // it was a drag, not a tap
    if (tool === "plant") {
      if (!pickedPlant) { WGUi.openPlantPicker(); return; }
      var r = WG.plant(world, pickedPlant, up.x, up.y, Date.now());
      if (r.ok) {
        WGAudio.plant();
        buzz(14);
        WGR.burst(up.x, up.y, "sparkle");
        WGR.invalidatePlant(r.plant.id);
        WGMain.afterPlayerAction();
      } else {
        WGUi.toast(r.error || "can't plant there");
      }
    } else if (tool === "hand") {
      var a = animalAt(up.x, up.y);
      if (a) { WGAudio.select(); buzz(8); WGUi.observe(a.id); }
    }
    // water tool acts on down/move only
  }

  function doWater(x, y) {
    var r = WG.water(world, x, y, Date.now());
    if (r.watered > 0) {
      WGR.burst(x, y, "splash");
      WGMain.afterPlayerAction();
    }
  }

  function setTool(t) {
    tool = t;
    buzz(8);
    if (t === "plant" && !pickedPlant) WGUi.openPlantPicker();
    var btns = document.querySelectorAll("#toolbar .tool");
    for (var i = 0; i < btns.length; i++)
      btns[i].classList.toggle("active", btns[i].dataset.tool === t);
  }
  function setPickedPlant(id) { pickedPlant = id; }

  window.WGInput = {
    init: init, setTool: setTool, setPickedPlant: setPickedPlant,
    currentTool: function () { return tool; }
  };
})();
