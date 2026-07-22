(function () {
  "use strict";

  var ORBIT_MS = 5000;
  var ORBIT_DEGREES = 120;
  var CAMERA_MOVE_MS = 1600;
  var CAMERA_FOLLOW_MS = 220;
  var TARGET_RETRY_MS = 500;
  var TARGET_WAIT_LIMIT_MS = 5000;
  var threeDView = document.getElementById("threeDView");
  var button = document.getElementById("display-mode-toggle");
  var state = {
    active: false,
    phase: "idle",
    phaseTimer: null,
    animationFrame: null,
    moveMap: null,
    moveEndHandler: null,
    selectionVersion: 0,
    current: null,
    lastKey: null,
    orbitStartedAt: null,
    orbitStartBearing: 0,
    orbitCenter: null,
    orbitZoom: null,
    lastValidPose: null,
    targetWaitStartedAt: 0,
    lastFrameAt: 0,
    center: null,
    zoom: null,
    pitch: null
  };

  function fullscreenElement() {
    return document.fullscreenElement || document.webkitFullscreenElement || null;
  }

  function isThreeDFullscreen() {
    return fullscreenElement() === threeDView;
  }

  function setButtonState(active, title) {
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
    button.title = title || (active ? "Turn fullscreen Display Mode off" : "Turn fullscreen Display Mode on");
  }

  function flightApi() {
    return window.PlatformFlightDisplay || null;
  }

  function subwayApi() {
    return window.PlatformSubwayDisplay || null;
  }

  function candidatePool() {
    var flights = flightApi() ? flightApi().getCandidates() : [];
    var trains = subwayApi() ? subwayApi().getCandidates() : [];
    var all = flights.concat(trains);
    if (all.length > 1 && state.lastKey) {
      var alternatives = all.filter(function (candidate) { return candidate.key !== state.lastKey; });
      if (alternatives.length) all = alternatives;
    }
    return all;
  }

  function randomCandidate() {
    var all = candidatePool();
    if (!all.length) return null;
    var flights = all.filter(function (candidate) { return candidate.kind === "flight"; });
    var trains = all.filter(function (candidate) { return candidate.kind === "train"; });
    var groups = [flights, trains].filter(function (group) { return group.length; });
    var group = groups[Math.floor(Math.random() * groups.length)];
    return group[Math.floor(Math.random() * group.length)];
  }

  function currentMap() {
    return window.ThreeDView && window.ThreeDView.getMap ? window.ThreeDView.getMap() : null;
  }

  function currentPose() {
    if (!state.current) return null;
    var api = state.current.kind === "flight" ? flightApi() : subwayApi();
    return api && api.getPose ? api.getPose(state.current.id) : null;
  }

  function currentCameraTarget(map) {
    if (!state.current) return null;
    if (state.current.kind === "flight") {
      var api = flightApi();
      return api && api.getCameraTarget ? api.getCameraTarget(state.current.id, map) : null;
    }
    var pose = currentPose();
    if (!pose || !pose.center) return null;
    return {
      kind: "point",
      center: pose.center,
      zoom: 14.8,
      pitch: 65,
      bearing: map.getBearing(),
      ready: true
    };
  }

  function clearMotion() {
    if (state.animationFrame != null) window.cancelAnimationFrame(state.animationFrame);
    state.animationFrame = null;
    window.clearTimeout(state.phaseTimer);
    state.phaseTimer = null;
    if (state.moveMap && state.moveEndHandler) {
      state.moveMap.off("moveend", state.moveEndHandler);
    }
    var movingMap = state.moveMap;
    state.moveMap = null;
    state.moveEndHandler = null;
    if (movingMap) movingMap.stop();
    state.phase = "idle";
    state.orbitStartedAt = null;
    state.orbitCenter = null;
    state.orbitZoom = null;
    state.lastValidPose = null;
    state.center = null;
    state.lastFrameAt = 0;
  }

  function finishCameraMove(version) {
    if (version !== state.selectionVersion) return;
    if (state.moveMap && state.moveEndHandler) {
      state.moveMap.off("moveend", state.moveEndHandler);
    }
    state.moveMap = null;
    state.moveEndHandler = null;
    window.clearTimeout(state.phaseTimer);
    state.phaseTimer = null;
    if (!state.active || !isThreeDFullscreen()) return;
    var map = currentMap();
    if (!map) return;
    var mapCenter = map.getCenter();
    state.orbitCenter = [mapCenter.lng, mapCenter.lat];
    state.orbitZoom = map.getZoom();
    state.lastValidPose = state.current && state.current.kind === "train" ? currentPose() : null;
    startOrbit(version);
  }

  function moveToCurrentTarget(version) {
    if (!state.active || version !== state.selectionVersion || !isThreeDFullscreen()) return;
    var map = currentMap();
    var target = map ? currentCameraTarget(map) : null;
    var waitedTooLong = Date.now() - state.targetWaitStartedAt >= TARGET_WAIT_LIMIT_MS;
    if (!map || !map.isStyleLoaded() || !target || target.ready === false) {
      if (waitedTooLong) {
        selectNext();
        return;
      }
      state.phaseTimer = window.setTimeout(function () { moveToCurrentTarget(version); }, TARGET_RETRY_MS);
      return;
    }

    state.phase = "moving";
    setButtonState(true, "Moving to " + state.current.label + " - click to turn Display Mode off");
    var targetZoom = state.current.kind === "flight" ? 13.8 : 14.8;
    state.moveMap = map;
    state.moveEndHandler = function () { finishCameraMove(version); };
    map.on("moveend", state.moveEndHandler);
    // The fallback covers a no-op camera move, for which some MapLibre versions
    // may not emit moveend. It starts after the requested transition has ended.
    state.phaseTimer = window.setTimeout(function () { finishCameraMove(version); }, CAMERA_MOVE_MS + 300);
    if (target.kind === "bounds") {
      map.fitBounds(target.bounds, {
        padding: target.padding,
        maxZoom: target.maxZoom,
        pitch: 65,
        bearing: target.bearing,
        duration: CAMERA_MOVE_MS,
        curve: 1.35,
        essential: true
      });
    } else {
      map.flyTo({
        center: [Number(target.center[0]), Number(target.center[1])],
        zoom: target.zoom == null ? targetZoom : target.zoom,
        pitch: target.pitch == null ? 65 : target.pitch,
        bearing: target.bearing == null ? map.getBearing() : target.bearing,
        duration: CAMERA_MOVE_MS,
        curve: 1.35,
        essential: true
      });
    }
  }

  function orbitFrame(now, version) {
    if (!state.active || version !== state.selectionVersion || !isThreeDFullscreen() || state.phase !== "rotating") return;
    var map = currentMap();
    if (!map || !map.isStyleLoaded()) {
      state.animationFrame = window.requestAnimationFrame(function (nextNow) { orbitFrame(nextNow, version); });
      return;
    }

    var elapsed = Math.max(0, now - state.orbitStartedAt);
    var progress = Math.min(1, elapsed / ORBIT_MS);
    var deltaMs = state.lastFrameAt ? Math.min(100, now - state.lastFrameAt) : 0;
    state.lastFrameAt = now;

    if (!state.center) {
      var mapCenter = map.getCenter();
      state.center = [mapCenter.lng, mapCenter.lat];
      state.zoom = map.getZoom();
      state.pitch = map.getPitch();
    }

    var targetCenter = state.orbitCenter || state.center;
    if (state.current.kind === "train") {
      var pose = currentPose();
      if (pose && pose.center) state.lastValidPose = pose;
      if (state.lastValidPose && state.lastValidPose.center) targetCenter = state.lastValidPose.center;
    }
    var followFactor = deltaMs ? Math.min(1, deltaMs / CAMERA_FOLLOW_MS) : 0.08;
    state.center[0] += (Number(targetCenter[0]) - state.center[0]) * followFactor;
    state.center[1] += (Number(targetCenter[1]) - state.center[1]) * followFactor;
    var targetZoom = state.orbitZoom == null ? map.getZoom() : state.orbitZoom;
    var targetPitch = 65;
    state.zoom = targetZoom;
    state.pitch += (targetPitch - state.pitch) * followFactor;

    var camera = {
      center: state.center,
      pitch: state.pitch,
      bearing: (state.orbitStartBearing + ORBIT_DEGREES * progress) % 360
    };
    // Apply the target zoom once per selection. Re-sending a changing zoom on every
    // orbit frame would repeatedly rebuild the train's zoom-scaled signal spindle.
    if (Math.abs(map.getZoom() - targetZoom) > 0.001) camera.zoom = targetZoom;
    map.jumpTo(camera);
    state.animationFrame = window.requestAnimationFrame(function (nextNow) { orbitFrame(nextNow, version); });
  }

  function finishOrbit(version) {
    if (!state.active || version !== state.selectionVersion || state.phase !== "rotating") return;
    if (state.animationFrame != null) window.cancelAnimationFrame(state.animationFrame);
    state.animationFrame = null;
    window.clearTimeout(state.phaseTimer);
    state.phaseTimer = null;
    var map = currentMap();
    if (map && state.center) {
      map.jumpTo({
        center: state.center,
        zoom: state.orbitZoom == null ? map.getZoom() : state.orbitZoom,
        pitch: 65,
        bearing: (state.orbitStartBearing + ORBIT_DEGREES) % 360
      });
    }
    state.phase = "switching";
    selectNext();
  }

  function startOrbit(version) {
    if (!state.active || version !== state.selectionVersion || !isThreeDFullscreen()) return;
    var map = currentMap();
    if (!map) return;
    state.phase = "rotating";
    state.orbitStartedAt = window.performance.now();
    state.orbitStartBearing = map.getBearing();
    state.lastFrameAt = 0;
    state.center = null;
    setButtonState(true, "Displaying " + state.current.label + " - click to turn Display Mode off");
    state.phaseTimer = window.setTimeout(function () { finishOrbit(version); }, ORBIT_MS);
    state.animationFrame = window.requestAnimationFrame(function (now) { orbitFrame(now, version); });
  }

  function selectNext() {
    if (!state.active || !isThreeDFullscreen()) return;
    var candidate = randomCandidate();
    if (!candidate) {
      state.selectionVersion += 1;
      clearMotion();
      state.current = null;
      setButtonState(true, "Display Mode is waiting for a flight or train with signal data");
      state.phaseTimer = window.setTimeout(selectNext, TARGET_RETRY_MS);
      return;
    }

    state.selectionVersion += 1;
    var version = state.selectionVersion;
    clearMotion();
    if (candidate.kind === "flight" && subwayApi()) subwayApi().clearDisplaySignal();
    var api = candidate.kind === "flight" ? flightApi() : subwayApi();
    if (!api || api.select(candidate.id) === false) {
      state.current = null;
      state.phaseTimer = window.setTimeout(selectNext, TARGET_RETRY_MS);
      return;
    }
    state.current = candidate;
    state.lastKey = candidate.key;
    state.targetWaitStartedAt = Date.now();
    moveToCurrentTarget(version);
  }

  function start() {
    if (state.active || !isThreeDFullscreen()) return;
    state.active = true;
    state.lastKey = null;
    setButtonState(true);
    selectNext();
  }

  function stop() {
    if (!state.active) return;
    state.active = false;
    state.selectionVersion += 1;
    clearMotion();
    if (subwayApi()) subwayApi().clearDisplaySignal();
    state.current = null;
    setButtonState(false);
  }

  button.addEventListener("click", function () {
    if (state.active) stop();
    else start();
  });
  document.addEventListener("fullscreenchange", function () {
    if (!isThreeDFullscreen()) stop();
  });
  document.addEventListener("webkitfullscreenchange", function () {
    if (!isThreeDFullscreen()) stop();
  });

  setButtonState(false);
  window.PlatformDisplayMode = {
    isActive: function () { return state.active; },
    stop: stop
  };
})();
