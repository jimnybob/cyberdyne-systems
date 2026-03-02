(function () {
    'use strict';

    var canvas = document.getElementById('circuit-canvas');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');

    // State
    var nodes = [];
    var traces = [];
    var pulses = [];
    var offscreenCanvas = null;
    var offscreenCtx = null;
    var animating = false;
    var lastTime = 0;
    var lastPulseSpawn = 0;
    var displayWidth = 0;
    var displayHeight = 0;

    var GRID_SIZE = 40;
    var MAX_PULSES = 18;
    var PULSE_SPAWN_MIN = 150;
    var PULSE_SPAWN_MAX = 400;
    var nextPulseInterval = 300;

    // ============================================
    // PROCEDURAL GENERATION
    // ============================================

    function generateNodes() {
        nodes = [];
        var cols = Math.floor(displayWidth / GRID_SIZE);
        var rows = Math.floor(displayHeight / GRID_SIZE);
        var cx = displayWidth / 2;
        var cy = displayHeight / 2;
        var maxDist = Math.sqrt(cx * cx + cy * cy);

        for (var r = 0; r < rows; r++) {
            for (var c = 0; c < cols; c++) {
                var x = c * GRID_SIZE + GRID_SIZE / 2;
                var y = r * GRID_SIZE + GRID_SIZE / 2;
                var dist = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy));
                var probability = 0.12 + 0.30 * (1 - dist / maxDist);
                if (Math.random() < probability) {
                    nodes.push({
                        x: x,
                        y: y,
                        gridCol: c,
                        gridRow: r,
                        connections: [],
                        glowPhase: Math.random() * Math.PI * 2
                    });
                }
            }
        }
    }

    function dist(a, b) {
        var dx = a.x - b.x;
        var dy = a.y - b.y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    function generateTraces() {
        traces = [];
        var connectionSet = new Set();

        for (var i = 0; i < nodes.length; i++) {
            var node = nodes[i];
            var candidates = [];

            for (var j = 0; j < nodes.length; j++) {
                var other = nodes[j];
                if (other === node) continue;
                var dc = Math.abs(other.gridCol - node.gridCol);
                var dr = Math.abs(other.gridRow - node.gridRow);
                if (dc <= 3 && dr <= 3 && (dc + dr) > 0) {
                    candidates.push(other);
                }
            }

            candidates.sort(function (a, b) {
                return dist(node, a) - dist(node, b);
            });

            var numConnections = 1 + Math.floor(Math.random() * 2);
            var connected = 0;

            for (var k = 0; k < candidates.length && connected < numConnections; k++) {
                var target = candidates[k];
                if (target.connections.length >= 4) continue;

                // Avoid duplicate traces
                var key = Math.min(nodes.indexOf(node), nodes.indexOf(target)) + '-' +
                          Math.max(nodes.indexOf(node), nodes.indexOf(target));
                if (connectionSet.has(key)) continue;
                connectionSet.add(key);

                var trace = createTrace(node, target);
                traces.push(trace);
                node.connections.push(target);
                target.connections.push(node);
                connected++;
            }
        }

        // Add dead-end stubs
        for (var n = 0; n < nodes.length; n++) {
            if (Math.random() < 0.2) {
                addStub(nodes[n]);
            }
        }
    }

    function createTrace(from, to) {
        var waypoints = [{ x: from.x, y: from.y }];
        if (from.gridCol !== to.gridCol && from.gridRow !== to.gridRow) {
            if (Math.random() < 0.5) {
                waypoints.push({ x: to.x, y: from.y });
            } else {
                waypoints.push({ x: from.x, y: to.y });
            }
        }
        waypoints.push({ x: to.x, y: to.y });
        return {
            waypoints: waypoints,
            length: calcTraceLength(waypoints)
        };
    }

    function addStub(node) {
        var dirs = [
            { dx: 1, dy: 0 }, { dx: -1, dy: 0 },
            { dx: 0, dy: 1 }, { dx: 0, dy: -1 }
        ];
        var dir = dirs[Math.floor(Math.random() * dirs.length)];
        var len = (1 + Math.floor(Math.random() * 2)) * GRID_SIZE;
        var endX = node.x + dir.dx * len;
        var endY = node.y + dir.dy * len;

        if (endX < 0 || endX > displayWidth || endY < 0 || endY > displayHeight) return;

        var waypoints = [{ x: node.x, y: node.y }, { x: endX, y: endY }];
        traces.push({
            waypoints: waypoints,
            length: calcTraceLength(waypoints)
        });
    }

    function calcTraceLength(waypoints) {
        var total = 0;
        for (var i = 1; i < waypoints.length; i++) {
            var dx = waypoints[i].x - waypoints[i - 1].x;
            var dy = waypoints[i].y - waypoints[i - 1].y;
            total += Math.sqrt(dx * dx + dy * dy);
        }
        return total;
    }

    // ============================================
    // OFFSCREEN RENDERING (STATIC GEOMETRY)
    // ============================================

    function renderStatic() {
        offscreenCanvas = document.createElement('canvas');
        offscreenCanvas.width = canvas.width;
        offscreenCanvas.height = canvas.height;
        offscreenCtx = offscreenCanvas.getContext('2d');

        var dpr = window.devicePixelRatio || 1;
        offscreenCtx.scale(dpr, dpr);

        // Background
        offscreenCtx.fillStyle = '#05050f';
        offscreenCtx.fillRect(0, 0, displayWidth, displayHeight);

        // Glow pass (wide, dim)
        offscreenCtx.strokeStyle = 'rgba(0, 160, 255, 0.06)';
        offscreenCtx.lineWidth = 6;
        offscreenCtx.lineCap = 'round';
        offscreenCtx.lineJoin = 'round';
        drawAllTraces(offscreenCtx);

        // Core pass (thin, bright)
        offscreenCtx.strokeStyle = 'rgba(0, 180, 255, 0.35)';
        offscreenCtx.lineWidth = 1.5;
        drawAllTraces(offscreenCtx);

        // Static node glow
        for (var i = 0; i < nodes.length; i++) {
            var n = nodes[i];
            // Outer glow
            offscreenCtx.fillStyle = 'rgba(0, 200, 255, 0.06)';
            offscreenCtx.beginPath();
            offscreenCtx.arc(n.x, n.y, 8, 0, Math.PI * 2);
            offscreenCtx.fill();
        }
    }

    function drawAllTraces(context) {
        for (var i = 0; i < traces.length; i++) {
            var t = traces[i];
            context.beginPath();
            context.moveTo(t.waypoints[0].x, t.waypoints[0].y);
            for (var j = 1; j < t.waypoints.length; j++) {
                context.lineTo(t.waypoints[j].x, t.waypoints[j].y);
            }
            context.stroke();
        }
    }

    // ============================================
    // PULSES
    // ============================================

    function spawnPulse() {
        if (traces.length === 0) return;
        var trace = traces[Math.floor(Math.random() * traces.length)];
        var isRed = Math.random() < 0.35;
        pulses.push({
            trace: trace,
            progress: 0,
            speed: 0.0008 + Math.random() * 0.0015,
            color: isRed ? 'red' : 'cyan'
        });
    }

    function getPulsePosition(pulse) {
        var trace = pulse.trace;
        var targetDist = pulse.progress * trace.length;
        var traveled = 0;

        for (var i = 1; i < trace.waypoints.length; i++) {
            var dx = trace.waypoints[i].x - trace.waypoints[i - 1].x;
            var dy = trace.waypoints[i].y - trace.waypoints[i - 1].y;
            var segLen = Math.sqrt(dx * dx + dy * dy);

            if (traveled + segLen >= targetDist) {
                var t = (targetDist - traveled) / segLen;
                return {
                    x: trace.waypoints[i - 1].x + dx * t,
                    y: trace.waypoints[i - 1].y + dy * t
                };
            }
            traveled += segLen;
        }
        var last = trace.waypoints[trace.waypoints.length - 1];
        return { x: last.x, y: last.y };
    }

    // ============================================
    // ANIMATION LOOP
    // ============================================

    function animate(timestamp) {
        if (!animating) return;

        var dt = timestamp - lastTime;
        lastTime = timestamp;
        if (dt > 50) dt = 50;

        var dpr = window.devicePixelRatio || 1;

        // Draw cached static layer
        ctx.drawImage(offscreenCanvas, 0, 0);

        // Scale for logical coordinates
        ctx.save();
        ctx.scale(dpr, dpr);

        // Animate node glow
        for (var i = 0; i < nodes.length; i++) {
            var n = nodes[i];
            var pulse = 0.5 + 0.5 * Math.sin(n.glowPhase + timestamp * 0.0015);
            ctx.fillStyle = 'rgba(0, 220, 255, ' + (0.5 + 0.5 * pulse).toFixed(2) + ')';
            ctx.beginPath();
            ctx.arc(n.x, n.y, 2, 0, Math.PI * 2);
            ctx.fill();
        }

        // Update and draw pulses
        for (var p = pulses.length - 1; p >= 0; p--) {
            var pl = pulses[p];
            pl.progress += pl.speed * dt;
            if (pl.progress > 1) {
                pulses.splice(p, 1);
                continue;
            }

            var pos = getPulsePosition(pl);
            if (pl.color === 'red') {
                // Red pulse glow
                ctx.fillStyle = 'rgba(255, 50, 50, 0.12)';
                ctx.beginPath();
                ctx.arc(pos.x, pos.y, 14, 0, Math.PI * 2);
                ctx.fill();
                // Core
                ctx.fillStyle = 'rgba(255, 60, 60, 0.9)';
                ctx.beginPath();
                ctx.arc(pos.x, pos.y, 3.5, 0, Math.PI * 2);
                ctx.fill();
            } else {
                // Cyan pulse glow
                ctx.fillStyle = 'rgba(0, 200, 255, 0.1)';
                ctx.beginPath();
                ctx.arc(pos.x, pos.y, 12, 0, Math.PI * 2);
                ctx.fill();
                // Core
                ctx.fillStyle = 'rgba(0, 230, 255, 0.85)';
                ctx.beginPath();
                ctx.arc(pos.x, pos.y, 3, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // Spawn new pulses
        if (timestamp - lastPulseSpawn > nextPulseInterval && pulses.length < MAX_PULSES) {
            spawnPulse();
            lastPulseSpawn = timestamp;
            nextPulseInterval = PULSE_SPAWN_MIN + Math.random() * (PULSE_SPAWN_MAX - PULSE_SPAWN_MIN);
        }

        ctx.restore();

        requestAnimationFrame(animate);
    }

    function startAnimation() {
        if (animating) return;
        animating = true;
        lastTime = performance.now();
        requestAnimationFrame(animate);
    }

    function stopAnimation() {
        animating = false;
    }

    // ============================================
    // SIZING & INIT
    // ============================================

    function sizeCanvas() {
        var rect = canvas.parentElement.getBoundingClientRect();
        var dpr = window.devicePixelRatio || 1;
        displayWidth = rect.width;
        displayHeight = rect.height;
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        canvas.style.width = rect.width + 'px';
        canvas.style.height = rect.height + 'px';
    }

    function generate() {
        sizeCanvas();
        generateNodes();
        generateTraces();
        renderStatic();
        pulses = [];
    }

    function init() {
        generate();
        startAnimation();

        // IntersectionObserver for performance
        if (typeof IntersectionObserver !== 'undefined') {
            var observer = new IntersectionObserver(function (entries) {
                entries.forEach(function (entry) {
                    if (entry.isIntersecting) {
                        startAnimation();
                    } else {
                        stopAnimation();
                    }
                });
            }, { threshold: 0.05 });
            observer.observe(canvas);
        }

        // Regenerate on resize
        var resizeTimer;
        window.addEventListener('resize', function () {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(function () {
                generate();
            }, 250);
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
