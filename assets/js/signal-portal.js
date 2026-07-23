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
  var lastTransmissionTime = 0;
  var lastPointerSample = null;
  var transmissions = [];
  var iconTintCache = {};
  var planeNativeHeading = -Math.PI * 0.75;

  var pointer = {
    x: window.innerWidth * 0.5,
    y: window.innerHeight * 0.46,
    targetX: window.innerWidth * 0.5,
    targetY: window.innerHeight * 0.46,
    velocity: 0,
    heading: 0,
    active: false
  };

  function loadPortalIcon(url) {
    var image = new Image();
    image.decoding = "async";
    image.addEventListener("load", function () {
      iconTintCache = {};
      if (reducedMotion && isVisible) {
        window.cancelAnimationFrame(animationFrame);
        animationFrame = window.requestAnimationFrame(render);
      }
    });
    image.src = url;
    return image;
  }

  var portalIcons = {
    plane: loadPortalIcon("assets/icons/signal-portal-plane.svg"),
    train: loadPortalIcon("Source/Train.svg")
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

  function addTransmission(x, y, strength, heading) {
    transmissions.push({
      x: x,
      y: y,
      age: 0,
      strength: clamp(strength || 0.75, 0.4, 1.6),
      heading: Number.isFinite(heading) ? heading : pointer.heading,
      phase: transmissions.length % 2
    });
    if (transmissions.length > 16) transmissions.shift();
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
    var deltaX = lastPointerSample ? position.x - lastPointerSample.x : 0;
    var deltaY = lastPointerSample ? position.y - lastPointerSample.y : 0;

    pointer.targetX = position.x;
    pointer.targetY = position.y;
    pointer.velocity = clamp(distance / duration, 0, 2.5);
    if (distance > 2) pointer.heading = Math.atan2(deltaY, deltaX);
    pointer.active = true;

    if (distance > 8 && now - lastTransmissionTime > 72) {
      addTransmission(
        position.x,
        position.y,
        0.58 + pointer.velocity * 0.32,
        pointer.heading
      );
      lastTransmissionTime = now;
    }
    lastPointerSample = { x: position.x, y: position.y, time: now };
  }

  function onPointerDown(event) {
    if (isExiting) return;
    var position = pointerEventPosition(event);
    pointer.targetX = position.x;
    pointer.targetY = position.y;
    pointer.active = true;
    addTransmission(
      position.x,
      position.y,
      event.pointerType === "touch" ? 1.5 : 1.1,
      pointer.heading
    );
  }

  function flightPoint(flight, progress) {
    var normalized = flight.direction === 1 ? progress : 1 - progress;
    var x = -width * 0.08 + normalized * width * 1.16;
    var baseY = height * flight.level;
    var arch = Math.sin(normalized * Math.PI) * height * flight.amplitude;
    var fineWave = Math.sin((normalized * 3.4 + flight.offset) * Math.PI) * height * 0.012;
    var y = baseY - arch + fineWave;

    var distance = Math.hypot(x - pointer.x, y - pointer.y);
    var radius = Math.min(width, height) * 0.24;
    if (distance < radius && pointer.active) {
      var influence = Math.pow(1 - distance / radius, 2);
      y += Math.sin(distance * 0.12 - elapsed * 15) *
        influence * (3.5 + pointer.velocity * 2.5);
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

    if (pointer.active) {
      context.save();
      context.shadowColor = "rgba(" + color.join(",") + ",0.68)";
      context.shadowBlur = 9;
      for (var responseSample = 1; responseSample <= 70; responseSample += 1) {
        var responseStart = flightPoint(flight, (responseSample - 1) / 70);
        var responseEnd = flightPoint(flight, responseSample / 70);
        var responseDistance = Math.hypot(
          (responseStart.x + responseEnd.x) * 0.5 - pointer.x,
          (responseStart.y + responseEnd.y) * 0.5 - pointer.y
        );
        var responseRadius = Math.min(width, height) * 0.23;
        if (responseDistance >= responseRadius) continue;
        var responseAlpha = Math.pow(1 - responseDistance / responseRadius, 2) *
          (0.36 + pointer.velocity * 0.18);
        context.strokeStyle = "rgba(" + color.join(",") + "," + responseAlpha + ")";
        context.lineWidth = 1.8;
        context.beginPath();
        context.moveTo(responseStart.x, responseStart.y);
        context.lineTo(responseEnd.x, responseEnd.y);
        context.stroke();
      }
      context.restore();
    }
  }

  function tintedPortalIcon(name, color) {
    var image = portalIcons[name];
    if (!image || !image.complete || !image.naturalWidth || !image.naturalHeight) return null;
    var key = name + "-" + color.join("-");
    if (iconTintCache[key]) return iconTintCache[key];

    var maximumSize = 180;
    var scale = maximumSize / Math.max(image.naturalWidth, image.naturalHeight);
    var iconCanvas = document.createElement("canvas");
    iconCanvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    iconCanvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    var iconContext = iconCanvas.getContext("2d");
    if (!iconContext) return null;

    iconContext.drawImage(image, 0, 0, iconCanvas.width, iconCanvas.height);
    iconContext.globalCompositeOperation = "source-in";
    iconContext.fillStyle = "rgb(" + color.join(",") + ")";
    iconContext.fillRect(0, 0, iconCanvas.width, iconCanvas.height);
    iconContext.globalCompositeOperation = "source-over";
    iconTintCache[key] = iconCanvas;
    return iconCanvas;
  }

  function drawPortalIcon(name, color, x, y, angle, targetWidth) {
    var iconCanvas = tintedPortalIcon(name, color);
    if (!iconCanvas) return false;
    var targetHeight = targetWidth * iconCanvas.height / iconCanvas.width;
    context.save();
    context.translate(x, y);
    context.rotate(angle);
    context.shadowColor = "rgba(" + color.join(",") + ",0.82)";
    context.shadowBlur = name === "plane" ? 11 : 9;
    context.globalAlpha = 0.96;
    context.drawImage(
      iconCanvas,
      -targetWidth * 0.5,
      -targetHeight * 0.5,
      targetWidth,
      targetHeight
    );
    context.restore();
    return true;
  }

  function drawPlane(flight) {
    var progress = (elapsed * flight.speed + flight.offset) % 1;
    var current = flightPoint(flight, progress);
    var tangentStart = flightPoint(flight, Math.max(0, progress - 0.002));
    var tangentEnd = flightPoint(flight, Math.min(1, progress + 0.002));
    var angle = Math.atan2(
      tangentEnd.y - tangentStart.y,
      tangentEnd.x - tangentStart.x
    );

    var color = flight.color;
    var trailLength = 28;
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

    var planeWidth = clamp(width * 0.019, 18, 27);
    if (!drawPortalIcon(
      "plane",
      color,
      current.x,
      current.y,
      angle - planeNativeHeading,
      planeWidth
    )) {
      context.save();
      context.translate(current.x, current.y);
      context.rotate(angle);
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
  }

  function subwayPoint(line, progress) {
    var x = width * 0.05 + progress * width * 0.90;
    var base = line === 0 ? height * 0.775 : height * 0.835;
    var wave = Math.sin(progress * Math.PI * (line === 0 ? 2.7 : 3.4) + line) * height * 0.018;
    var y = base + wave;

    var distance = Math.hypot(x - pointer.x, y - pointer.y);
    var radius = Math.min(width, height) * 0.20;
    if (distance < radius && pointer.active) {
      y += Math.sin(distance * 0.14 - elapsed * 16) *
        Math.pow(1 - distance / radius, 2) * 4.5;
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

    if (pointer.active) {
      var color = line === 0 ? [167, 120, 255] : [46, 212, 122];
      context.save();
      context.shadowColor = "rgba(" + color.join(",") + ",0.72)";
      context.shadowBlur = 8;
      for (var responseSample = 1; responseSample <= 80; responseSample += 1) {
        var responseStart = subwayPoint(line, (responseSample - 1) / 80);
        var responseEnd = subwayPoint(line, responseSample / 80);
        var responseDistance = Math.hypot(
          (responseStart.x + responseEnd.x) * 0.5 - pointer.x,
          (responseStart.y + responseEnd.y) * 0.5 - pointer.y
        );
        var responseRadius = Math.min(width, height) * 0.20;
        if (responseDistance >= responseRadius) continue;
        var responseAlpha = Math.pow(1 - responseDistance / responseRadius, 2) *
          (0.42 + pointer.velocity * 0.18);
        context.strokeStyle = "rgba(" + color.join(",") + "," + responseAlpha + ")";
        context.lineWidth = 2;
        context.beginPath();
        context.moveTo(responseStart.x, responseStart.y);
        context.lineTo(responseEnd.x, responseEnd.y);
        context.stroke();
      }
      context.restore();
    }
  }

  function drawSubwayPulse(pulse) {
    var progress = (elapsed * pulse.speed + pulse.offset) % 1;
    var normalized = pulse.direction === -1 ? 1 - progress : progress;
    var point = subwayPoint(pulse.line, normalized);
    var tangentBefore = clamp(normalized + (pulse.direction === -1 ? 0.002 : -0.002), 0, 1);
    var tangentAfter = clamp(normalized + (pulse.direction === -1 ? -0.002 : 0.002), 0, 1);
    var tangentStart = subwayPoint(pulse.line, tangentBefore);
    var tangentEnd = subwayPoint(pulse.line, tangentAfter);
    var angle = Math.atan2(
      tangentEnd.y - tangentStart.y,
      tangentEnd.x - tangentStart.x
    );
    var color = pulse.color;

    var trainWidth = clamp(width * 0.0205, 20, 30);
    if (!drawPortalIcon("train", color, point.x, point.y, angle, trainWidth)) {
      context.shadowColor = "rgba(" + color.join(",") + ",0.80)";
      context.shadowBlur = 13;
      context.fillStyle = "rgba(" + color.join(",") + ",0.94)";
      context.beginPath();
      context.arc(point.x, point.y, 2.7, 0, Math.PI * 2);
      context.fill();
      context.shadowBlur = 0;
    }
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

  function drawTransmissions(delta) {
    for (var index = transmissions.length - 1; index >= 0; index -= 1) {
      var transmission = transmissions[index];
      transmission.age += delta;
      var duration = 1.05;
      if (transmission.age > duration) {
        transmissions.splice(index, 1);
        continue;
      }

      var life = transmission.age / duration;
      var eased = 1 - Math.pow(1 - life, 3);
      var fade = Math.pow(1 - life, 1.35);
      var baseRadius = eased * (52 + transmission.strength * 102);
      var fan = 0.43 + transmission.strength * 0.06;

      context.save();
      context.lineCap = "round";
      context.shadowBlur = 12;
      for (var band = 0; band < 3; band += 1) {
        var radius = baseRadius + band * 15;
        var color = band === 2 ? [255, 154, 66] : [105, 224, 255];
        var alpha = fade * transmission.strength * (0.66 - band * 0.11);
        var dash = 9 + band * 3;
        context.strokeStyle = "rgba(" + color.join(",") + "," + alpha + ")";
        context.shadowColor = "rgba(" + color.join(",") + "," + alpha + ")";
        context.lineWidth = 1.55 + transmission.strength * 0.35 - band * 0.10;
        context.setLineDash([dash, 6 + band * 2]);
        context.lineDashOffset = -(elapsed * 38 + transmission.phase * 7 + band * 4);

        [transmission.heading, transmission.heading + Math.PI].forEach(function (direction) {
          context.beginPath();
          context.arc(
            transmission.x,
            transmission.y,
            radius,
            direction - fan,
            direction + fan
          );
          context.stroke();
        });
      }
      context.setLineDash([]);

      var packetDistance = 18 + eased * (70 + transmission.strength * 36);
      var packetX = transmission.x + Math.cos(transmission.heading) * packetDistance;
      var packetY = transmission.y + Math.sin(transmission.heading) * packetDistance;
      context.fillStyle = "rgba(105,224,255," + fade * 0.92 + ")";
      context.shadowColor = "rgba(105,224,255,0.85)";
      context.shadowBlur = 13;
      context.beginPath();
      context.arc(packetX, packetY, 1.8 + transmission.strength * 0.65, 0, Math.PI * 2);
      context.fill();
      context.restore();
    }
  }

  function drawPointerTransmitter() {
    if (!pointer.active) return;
    context.save();
    context.translate(pointer.x, pointer.y);
    context.rotate(pointer.heading);
    context.strokeStyle = "rgba(105,224,255,0.82)";
    context.fillStyle = "rgba(105,224,255,0.95)";
    context.shadowColor = "rgba(105,224,255,0.76)";
    context.shadowBlur = 11;
    context.lineWidth = 1.25;
    context.lineCap = "round";

    context.beginPath();
    context.arc(0, 0, 10, -0.55, 0.55);
    context.arc(0, 0, 10, Math.PI - 0.55, Math.PI + 0.55);
    context.stroke();

    context.beginPath();
    context.moveTo(13, 0);
    context.lineTo(27 + pointer.velocity * 5, 0);
    context.moveTo(-7, -4);
    context.lineTo(-7, 4);
    context.stroke();

    context.beginPath();
    context.arc(0, 0, 2.4, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  function drawPointerField() {
    if (!pointer.active) return;
    var radius = 125 + pointer.velocity * 34;
    var glow = context.createRadialGradient(pointer.x, pointer.y, 0, pointer.x, pointer.y, radius);
    glow.addColorStop(0, "rgba(105,224,255,0.115)");
    glow.addColorStop(0.34, "rgba(105,224,255,0.042)");
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

    pointer.x += (pointer.targetX - pointer.x) * 0.11;
    pointer.y += (pointer.targetY - pointer.y) * 0.11;
    pointer.velocity *= 0.93;

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
    drawTransmissions(delta);
    drawPointerTransmitter();

    if (!reducedMotion || transmissions.length) {
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
    addTransmission(width * 0.5, height * 0.5, 1.6, -Math.PI * 0.5);
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
  addTransmission(width * 0.5, height * 0.43, 0.85, 0);
  enterButton.focus({ preventScroll: true });
  animationFrame = window.requestAnimationFrame(render);
})();
