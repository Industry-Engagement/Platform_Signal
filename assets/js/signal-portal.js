(function () {
  "use strict";

  var portal = document.getElementById("signal-portal");
  var canvas = document.getElementById("signal-portal-canvas");
  var enterButton = document.getElementById("signal-portal-enter");
  if (!portal || !canvas || !enterButton) return;

  var context = canvas.getContext("2d");
  if (!context) return;

  var transitionMs = Number(portal.getAttribute("data-transition-ms")) || 1400;
  var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var width = 1;
  var height = 1;
  var pixelRatio = 1;
  var animationFrame = 0;
  var previousTime = 0;
  var elapsed = 0;
  var isExiting = false;
  var isVisible = true;
  var lastRippleTime = 0;
  var lastPointerSample = null;
  var ripples = [];

  var pointer = {
    x: window.innerWidth * 0.5,
    y: window.innerHeight * 0.46,
    targetX: window.innerWidth * 0.5,
    targetY: window.innerHeight * 0.46,
    velocity: 0,
    active: false
  };

  var flights = [
    { offset: 0.08, speed: 0.020, level: 0.23, amplitude: 0.070, direction: 1, color: [105, 224, 255] },
    { offset: 0.49, speed: 0.014, level: 0.31, amplitude: 0.095, direction: -1, color: [111, 188, 255] },
    { offset: 0.72, speed: 0.024, level: 0.18, amplitude: 0.045, direction: 1, color: [255, 154, 66] },
    { offset: 0.31, speed: 0.017, level: 0.39, amplitude: 0.060, direction: -1, color: [105, 224, 255] },
    { offset: 0.90, speed: 0.011, level: 0.27, amplitude: 0.115, direction: 1, color: [46, 212, 122] }
  ];

  var subwayPulses = [
    { offset: 0.08, speed: 0.055, line: 0, color: [167, 120, 255] },
    { offset: 0.62, speed: 0.041, line: 0, color: [167, 120, 255] },
    { offset: 0.30, speed: 0.047, line: 1, color: [46, 212, 122] },
    { offset: 0.81, speed: 0.034, line: 1, color: [46, 212, 122] }
  ];

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
  }

  function resizeCanvas() {
    var bounds = portal.getBoundingClientRect();
    width = Math.max(1, bounds.width);
    height = Math.max(1, bounds.height);
    pixelRatio = Math.min(window.devicePixelRatio || 1, 1.75);
    canvas.width = Math.round(width * pixelRatio);
    canvas.height = Math.round(height * pixelRatio);
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    if (!pointer.active) {
      pointer.x = pointer.targetX = width * 0.5;
      pointer.y = pointer.targetY = height * 0.46;
    }
  }

  function addRipple(x, y, strength) {
    ripples.push({
      x: x,
      y: y,
      age: 0,
      strength: clamp(strength || 0.55, 0.25, 1.3)
    });
    if (ripples.length > 12) ripples.shift();
  }

  function pointerEventPosition(event) {
    var bounds = portal.getBoundingClientRect();
    return {
      x: clamp(event.clientX - bounds.left, 0, bounds.width),
      y: clamp(event.clientY - bounds.top, 0, bounds.height)
    };
  }

  function onPointerMove(event) {
    if (isExiting) return;
    var position = pointerEventPosition(event);
    var now = performance.now();
    var distance = lastPointerSample
      ? Math.hypot(position.x - lastPointerSample.x, position.y - lastPointerSample.y)
      : 0;
    var duration = lastPointerSample ? Math.max(16, now - lastPointerSample.time) : 16;

    pointer.targetX = position.x;
    pointer.targetY = position.y;
    pointer.velocity = clamp(distance / duration, 0, 2.5);
    pointer.active = true;

    if (distance > 13 && now - lastRippleTime > 95) {
      addRipple(position.x, position.y, 0.28 + pointer.velocity * 0.20);
      lastRippleTime = now;
    }
    lastPointerSample = { x: position.x, y: position.y, time: now };
  }

  function onPointerDown(event) {
    if (isExiting) return;
    var position = pointerEventPosition(event);
    pointer.targetX = position.x;
    pointer.targetY = position.y;
    pointer.active = true;
    addRipple(position.x, position.y, event.pointerType === "touch" ? 1.15 : 0.75);
  }

  function flightPoint(flight, progress) {
    var normalized = flight.direction === 1 ? progress : 1 - progress;
    var x = -width * 0.08 + normalized * width * 1.16;
    var baseY = height * flight.level;
    var arch = Math.sin(normalized * Math.PI) * height * flight.amplitude;
    var fineWave = Math.sin((normalized * 3.4 + flight.offset) * Math.PI) * height * 0.012;
    var y = baseY - arch + fineWave;

    var distance = Math.hypot(x - pointer.x, y - pointer.y);
    var radius = Math.min(width, height) * 0.22;
    if (distance < radius && pointer.active) {
      var influence = Math.pow(1 - distance / radius, 2);
      var verticalDirection = y <= pointer.y ? -1 : 1;
      y += verticalDirection * influence * (16 + pointer.velocity * 12);
      x += (x <= pointer.x ? -1 : 1) * influence * 9;
    }
    return { x: x, y: y };
  }

  function drawFlightPath(flight, alpha) {
    context.beginPath();
    for (var sample = 0; sample <= 70; sample += 1) {
      var point = flightPoint(flight, sample / 70);
      if (sample === 0) context.moveTo(point.x, point.y);
      else context.lineTo(point.x, point.y);
    }
    var color = flight.color;
    context.strokeStyle = "rgba(" + color.join(",") + "," + alpha + ")";
    context.lineWidth = 0.8;
    context.setLineDash([2, 9]);
    context.stroke();
    context.setLineDash([]);
  }

  function drawPlane(flight) {
    var progress = (elapsed * flight.speed + flight.offset) % 1;
    var current = flightPoint(flight, progress);
    var ahead = flightPoint(flight, (progress + 0.002) % 1);
    var angle = Math.atan2(ahead.y - current.y, ahead.x - current.x);
    if (flight.direction === -1 && progress > 0.998) angle += Math.PI;

    var color = flight.color;
    var trailLength = 23;
    var gradient = context.createLinearGradient(
      current.x - Math.cos(angle) * trailLength,
      current.y - Math.sin(angle) * trailLength,
      current.x,
      current.y
    );
    gradient.addColorStop(0, "rgba(" + color.join(",") + ",0)");
    gradient.addColorStop(1, "rgba(" + color.join(",") + ",0.72)");
    context.beginPath();
    context.moveTo(
      current.x - Math.cos(angle) * trailLength,
      current.y - Math.sin(angle) * trailLength
    );
    context.lineTo(current.x, current.y);
    context.strokeStyle = gradient;
    context.lineWidth = 1.4;
    context.stroke();

    context.save();
    context.translate(current.x, current.y);
    context.rotate(angle);
    context.shadowColor = "rgba(" + color.join(",") + ",0.72)";
    context.shadowBlur = 10;
    context.fillStyle = "rgba(" + color.join(",") + ",0.95)";
    context.beginPath();
    context.moveTo(8, 0);
    context.lineTo(-5, -4);
    context.lineTo(-2, 0);
    context.lineTo(-5, 4);
    context.closePath();
    context.fill();
    context.restore();
  }

  function subwayPoint(line, progress) {
    var x = width * 0.05 + progress * width * 0.90;
    var base = line === 0 ? height * 0.775 : height * 0.835;
    var wave = Math.sin(progress * Math.PI * (line === 0 ? 2.7 : 3.4) + line) * height * 0.018;
    var y = base + wave;

    var distance = Math.hypot(x - pointer.x, y - pointer.y);
    var radius = Math.min(width, height) * 0.18;
    if (distance < radius && pointer.active) {
      y += (y <= pointer.y ? -1 : 1) * Math.pow(1 - distance / radius, 2) * 13;
    }
    return { x: x, y: y };
  }

  function drawSubwayLine(line) {
    context.beginPath();
    for (var sample = 0; sample <= 80; sample += 1) {
      var point = subwayPoint(line, sample / 80);
      if (sample === 0) context.moveTo(point.x, point.y);
      else context.lineTo(point.x, point.y);
    }
    context.strokeStyle = line === 0 ? "rgba(167,120,255,0.18)" : "rgba(46,212,122,0.16)";
    context.lineWidth = 1.1;
    context.stroke();
  }

  function drawSubwayPulse(pulse) {
    var progress = (elapsed * pulse.speed + pulse.offset) % 1;
    var point = subwayPoint(pulse.line, progress);
    var color = pulse.color;

    context.shadowColor = "rgba(" + color.join(",") + ",0.80)";
    context.shadowBlur = 13;
    context.fillStyle = "rgba(" + color.join(",") + ",0.94)";
    context.beginPath();
    context.arc(point.x, point.y, 2.7, 0, Math.PI * 2);
    context.fill();
    context.shadowBlur = 0;
  }

  function drawHorizon() {
    var horizon = height * 0.705;
    var parallaxX = (pointer.x / width - 0.5) * 11;
    var parallaxY = (pointer.y / height - 0.5) * 4;

    context.save();
    context.translate(parallaxX, parallaxY);
    context.strokeStyle = "rgba(120,197,226,0.13)";
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(-20, horizon);
    context.lineTo(width + 20, horizon);
    context.stroke();

    context.fillStyle = "rgba(15,42,59,0.34)";
    var buildingWidth = Math.max(18, width / 58);
    var count = Math.ceil(width / buildingWidth) + 2;
    for (var index = -1; index < count; index += 1) {
      var noise = Math.sin(index * 91.7) * 0.5 + 0.5;
      var buildingHeight = height * (0.018 + noise * 0.060);
      if (index % 9 === 0) buildingHeight *= 1.7;
      context.fillRect(
        index * buildingWidth,
        horizon - buildingHeight,
        buildingWidth - 2,
        buildingHeight
      );
    }
    context.restore();
  }

  function drawRipples(delta) {
    for (var index = ripples.length - 1; index >= 0; index -= 1) {
      var ripple = ripples[index];
      ripple.age += delta;
      if (ripple.age > 1.15) {
        ripples.splice(index, 1);
        continue;
      }
      var eased = 1 - Math.pow(1 - ripple.age / 1.15, 3);
      var radius = eased * (70 + ripple.strength * 85);
      var alpha = (1 - ripple.age / 1.15) * 0.28 * ripple.strength;
      context.strokeStyle = "rgba(105,224,255," + alpha + ")";
      context.lineWidth = 1;
      context.beginPath();
      context.arc(ripple.x, ripple.y, radius, 0, Math.PI * 2);
      context.stroke();
      if (ripple.age < 0.72) {
        context.strokeStyle = "rgba(255,154,66," + alpha * 0.42 + ")";
        context.beginPath();
        context.arc(ripple.x, ripple.y, radius * 0.58, 0, Math.PI * 2);
        context.stroke();
      }
    }
  }

  function drawPointerField() {
    if (!pointer.active) return;
    var radius = 110 + pointer.velocity * 28;
    var glow = context.createRadialGradient(pointer.x, pointer.y, 0, pointer.x, pointer.y, radius);
    glow.addColorStop(0, "rgba(105,224,255,0.075)");
    glow.addColorStop(0.45, "rgba(105,224,255,0.028)");
    glow.addColorStop(1, "rgba(105,224,255,0)");
    context.fillStyle = glow;
    context.beginPath();
    context.arc(pointer.x, pointer.y, radius, 0, Math.PI * 2);
    context.fill();
  }

  function render(time) {
    if (!isVisible) return;
    var delta = previousTime ? Math.min((time - previousTime) / 1000, 0.05) : 0;
    previousTime = time;
    if (!reducedMotion) elapsed += delta;

    pointer.x += (pointer.targetX - pointer.x) * 0.075;
    pointer.y += (pointer.targetY - pointer.y) * 0.075;
    pointer.velocity *= 0.94;

    context.clearRect(0, 0, width, height);
    drawPointerField();
    drawHorizon();

    flights.forEach(function (flight, index) {
      drawFlightPath(flight, index === 2 ? 0.17 : 0.095);
      drawPlane(flight);
    });

    drawSubwayLine(0);
    drawSubwayLine(1);
    subwayPulses.forEach(drawSubwayPulse);
    drawRipples(delta);

    if (!reducedMotion || ripples.length) {
      animationFrame = window.requestAnimationFrame(render);
    }
  }

  function numberFromElement(id) {
    var element = document.getElementById(id);
    if (!element) return 0;
    var value = Number(String(element.textContent || "").replace(/[^0-9.-]/g, ""));
    return Number.isFinite(value) ? value : 0;
  }

  function syncLiveReadout() {
    var portalFlights = document.getElementById("signal-portal-flights");
    var portalSubways = document.getElementById("signal-portal-subways");
    var portalStatus = document.getElementById("signal-portal-status");
    var portalStatusDot = document.getElementById("signal-portal-status-dot");
    var sourceStatus = document.getElementById("status-label");
    var sourceDot = document.getElementById("status-dot");

    if (portalFlights) {
      portalFlights.textContent = String(
        numberFromElement("confirmed-count") + numberFromElement("probable-count")
      );
    }
    if (portalSubways) {
      portalSubways.textContent = String(numberFromElement("subway-count"));
    }
    if (portalStatus && sourceStatus) {
      var sourceText = String(sourceStatus.textContent || "").trim();
      portalStatus.textContent = sourceText && sourceText !== "Starting"
        ? sourceText
        : "Connecting to live network";
    }
    if (portalStatusDot && sourceDot) {
      portalStatusDot.classList.toggle("is-online", sourceDot.classList.contains("online"));
      portalStatusDot.classList.toggle("is-error", sourceDot.classList.contains("error"));
    }
  }

  function observeLiveReadout() {
    var sourceIds = [
      "confirmed-count",
      "probable-count",
      "subway-count",
      "status-label",
      "status-dot"
    ];
    var observer = new MutationObserver(syncLiveReadout);
    sourceIds.forEach(function (id) {
      var element = document.getElementById(id);
      if (element) {
        observer.observe(element, {
          attributes: true,
          childList: true,
          characterData: true,
          subtree: true
        });
      }
    });
    syncLiveReadout();
    return observer;
  }

  var liveObserver = observeLiveReadout();

  function finishExit() {
    portal.hidden = true;
    portal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("signal-portal-is-open");
    isVisible = false;
    window.cancelAnimationFrame(animationFrame);
    liveObserver.disconnect();
    window.removeEventListener("resize", resizeCanvas);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    var planButton = document.getElementById("btn-plan-view");
    if (planButton) planButton.focus({ preventScroll: true });
  }

  function beginExit() {
    if (isExiting) return;
    isExiting = true;
    enterButton.disabled = true;
    portal.style.setProperty("--signal-portal-transition", transitionMs + "ms");
    portal.classList.add("is-exiting");
    addRipple(width * 0.5, height * 0.5, 1.3);
    window.setTimeout(finishExit, reducedMotion ? 240 : transitionMs + 40);
  }

  function onPortalKeyDown(event) {
    if (isExiting) return;
    if (event.key === "Tab") {
      event.preventDefault();
      enterButton.focus();
      return;
    }
    if (event.key === "Enter" && event.target !== enterButton) {
      event.preventDefault();
      beginExit();
    }
  }

  function onVisibilityChange() {
    isVisible = !document.hidden && !portal.hidden;
    if (isVisible) {
      previousTime = 0;
      animationFrame = window.requestAnimationFrame(render);
    } else {
      window.cancelAnimationFrame(animationFrame);
    }
  }

  document.body.classList.add("signal-portal-is-open");
  enterButton.addEventListener("click", beginExit);
  portal.addEventListener("keydown", onPortalKeyDown);
  portal.addEventListener("pointermove", onPointerMove, { passive: true });
  portal.addEventListener("pointerdown", onPointerDown, { passive: true });
  window.addEventListener("resize", resizeCanvas);
  document.addEventListener("visibilitychange", onVisibilityChange);

  resizeCanvas();
  addRipple(width * 0.5, height * 0.43, 0.65);
  enterButton.focus({ preventScroll: true });
  animationFrame = window.requestAnimationFrame(render);
})();
