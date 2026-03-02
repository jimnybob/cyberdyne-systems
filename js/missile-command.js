(function () {
    'use strict';

    var canvas = document.getElementById('game-canvas');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');

    var overlay = document.getElementById('game-overlay');
    var overlayTitle = overlay ? overlay.querySelector('.overlay-title') : null;
    var overlayPrompt = overlay ? overlay.querySelector('.overlay-prompt') : null;
    var hudEl = document.getElementById('game-hud');
    var hudScore = document.getElementById('hud-score');
    var hudWave = document.getElementById('hud-wave');
    var hudCities = document.getElementById('hud-cities');

    // Game dimensions (logical)
    var W = 0;
    var H = 0;
    var GROUND_Y = 0;

    // Game state
    var state = 'IDLE'; // IDLE, PLAYING, WAVE_COMPLETE, GAME_OVER
    var score = 0;
    var wave = 0;
    var animFrameId = null;
    var lastTime = 0;

    // Wave management
    var enemiesPerWave = 0;
    var enemiesSpawned = 0;
    var spawnInterval = 0;
    var lastSpawn = 0;
    var waveCompleteTimer = 0;

    // Entities
    var cities = [];
    var bases = [];
    var enemyMissiles = [];
    var counterMissiles = [];
    var explosions = [];
    var particles = [];

    // ============================================
    // ENTITY CONSTRUCTORS
    // ============================================

    function City(x, groundY) {
        this.x = x;
        this.groundY = groundY;
        this.width = 40;
        this.alive = true;
        this.buildings = [];
        var count = 3 + Math.floor(Math.random() * 3);
        var bw = this.width / count;
        for (var i = 0; i < count; i++) {
            this.buildings.push({
                x: this.x - this.width / 2 + i * bw + 1,
                width: bw - 2,
                height: 8 + Math.random() * 22
            });
        }
    }

    function LaunchBase(x, groundY) {
        this.x = x;
        this.groundY = groundY;
        this.ammo = 10;
    }

    function EnemyMissile(startX, startY, targetX, targetY, speed) {
        this.startX = startX;
        this.startY = startY;
        this.targetX = targetX;
        this.targetY = targetY;
        this.x = startX;
        this.y = startY;
        this.speed = speed;
        this.alive = true;
        this.trailAlpha = 1.0;
        var dx = targetX - startX;
        var dy = targetY - startY;
        var d = Math.sqrt(dx * dx + dy * dy);
        this.vx = (dx / d) * speed;
        this.vy = (dy / d) * speed;
    }

    function CounterMissile(startX, startY, targetX, targetY) {
        this.startX = startX;
        this.startY = startY;
        this.targetX = targetX;
        this.targetY = targetY;
        this.x = startX;
        this.y = startY;
        this.speed = 300;
        this.alive = true;
        this.trailAlpha = 1.0;
        var dx = targetX - startX;
        var dy = targetY - startY;
        var d = Math.sqrt(dx * dx + dy * dy);
        this.vx = (dx / d) * this.speed;
        this.vy = (dy / d) * this.speed;
        this.totalDist = d;
        this.traveled = 0;
    }

    function Explosion(x, y) {
        this.x = x;
        this.y = y;
        this.maxRadius = 40;
        this.radius = 0;
        this.expanding = true;
        this.alive = true;
        this.growSpeed = 100;
        this.shrinkSpeed = 50;
        this.isEnemy = false;
    }

    function Particle(x, y, vx, vy, color, life) {
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.color = color;
        this.life = life;
        this.maxLife = life;
        this.alive = true;
    }

    // ============================================
    // INITIALIZATION
    // ============================================

    function sizeCanvas() {
        var rect = canvas.parentElement.getBoundingClientRect();
        var dpr = window.devicePixelRatio || 1;
        W = rect.width;
        H = rect.height;
        GROUND_Y = H - 50;
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        canvas.style.width = rect.width + 'px';
        canvas.style.height = rect.height + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function initEntities() {
        cities = [];
        bases = [];
        var cityPositions = [0.18, 0.27, 0.36, 0.64, 0.73, 0.82];
        for (var i = 0; i < cityPositions.length; i++) {
            cities.push(new City(W * cityPositions[i], GROUND_Y));
        }
        bases = [
            new LaunchBase(W * 0.08, GROUND_Y),
            new LaunchBase(W * 0.50, GROUND_Y),
            new LaunchBase(W * 0.92, GROUND_Y)
        ];
    }

    // ============================================
    // WAVE MANAGEMENT
    // ============================================

    function startWave() {
        wave++;
        enemiesPerWave = 8 + wave * 3;
        enemiesSpawned = 0;
        spawnInterval = Math.max(200, 800 - wave * 50);
        lastSpawn = 0;

        // Refill ammo
        for (var i = 0; i < bases.length; i++) {
            bases[i].ammo = 10;
        }

        state = 'PLAYING';
        updateHUD();
    }

    function spawnEnemy(timestamp) {
        if (enemiesSpawned >= enemiesPerWave) return;
        if (timestamp - lastSpawn < spawnInterval) return;

        lastSpawn = timestamp;
        enemiesSpawned++;

        var startX = Math.random() * W;
        var startY = -10;

        // Target a city or random ground position
        var aliveCities = cities.filter(function (c) { return c.alive; });
        var targetX, targetY;
        if (aliveCities.length > 0 && Math.random() < 0.7) {
            var target = aliveCities[Math.floor(Math.random() * aliveCities.length)];
            targetX = target.x;
            targetY = target.groundY;
        } else {
            targetX = Math.random() * W;
            targetY = GROUND_Y;
        }

        var speed = 35 + wave * 8;
        enemyMissiles.push(new EnemyMissile(startX, startY, targetX, targetY, speed));
    }

    function checkWaveComplete() {
        if (state !== 'PLAYING') return;
        if (enemiesSpawned < enemiesPerWave) return;

        var anyAlive = false;
        for (var i = 0; i < enemyMissiles.length; i++) {
            if (enemyMissiles[i].alive) { anyAlive = true; break; }
        }
        if (anyAlive) return;

        // All enemies dealt with
        state = 'WAVE_COMPLETE';
        waveCompleteTimer = 2000;

        // Bonus points
        var cityBonus = 0;
        var ammoBonus = 0;
        for (var c = 0; c < cities.length; c++) {
            if (cities[c].alive) cityBonus += 50;
        }
        for (var b = 0; b < bases.length; b++) {
            ammoBonus += bases[b].ammo * 10;
        }
        score += cityBonus + ammoBonus;
    }

    function checkGameOver() {
        var anyAlive = false;
        for (var i = 0; i < cities.length; i++) {
            if (cities[i].alive) { anyAlive = true; break; }
        }
        if (!anyAlive) {
            state = 'GAME_OVER';
            showOverlay('GAME OVER', 'SCORE: ' + score + '  [ CLICK TO RESTART ]');
        }
    }

    // ============================================
    // PLAYER INPUT
    // ============================================

    function findNearestBaseWithAmmo(clickX) {
        var best = null;
        var bestDist = Infinity;
        for (var i = 0; i < bases.length; i++) {
            if (bases[i].ammo <= 0) continue;
            var d = Math.abs(bases[i].x - clickX);
            if (d < bestDist) {
                bestDist = d;
                best = bases[i];
            }
        }
        return best;
    }

    // Overlay click starts/restarts the game
    if (overlay) {
        overlay.addEventListener('click', function () {
            if (state === 'IDLE' || state === 'GAME_OVER') {
                startGame();
            }
        });
    }

    canvas.addEventListener('click', function (e) {
        if (state === 'IDLE') {
            startGame();
            return;
        }
        if (state === 'GAME_OVER') {
            startGame();
            return;
        }
        if (state !== 'PLAYING') return;

        var rect = canvas.getBoundingClientRect();
        var clickX = (e.clientX - rect.left) * (W / rect.width);
        var clickY = (e.clientY - rect.top) * (H / rect.height);

        if (clickY >= GROUND_Y) return;

        var base = findNearestBaseWithAmmo(clickX);
        if (base) {
            base.ammo--;
            counterMissiles.push(new CounterMissile(base.x, base.groundY, clickX, clickY));
        }
    });

    // ============================================
    // UPDATE LOGIC
    // ============================================

    function update(dt, timestamp) {
        if (state === 'PLAYING') {
            spawnEnemy(timestamp);
        }

        // Enemy missiles
        for (var i = enemyMissiles.length - 1; i >= 0; i--) {
            var em = enemyMissiles[i];
            if (!em.alive) {
                em.trailAlpha -= dt * 1.2;
                continue;
            }
            em.x += em.vx * dt;
            em.y += em.vy * dt;

            if (em.y >= em.targetY) {
                em.alive = false;
                // Damage nearest city
                var nearest = null;
                var nearestDist = Infinity;
                for (var c = 0; c < cities.length; c++) {
                    if (!cities[c].alive) continue;
                    var d = Math.abs(cities[c].x - em.x);
                    if (d < nearestDist && d < 35) {
                        nearestDist = d;
                        nearest = cities[c];
                    }
                }
                if (nearest) {
                    nearest.alive = false;
                    spawnDebris(nearest.x, nearest.groundY, '#ff4400');
                }
                // Impact explosion
                var exp = new Explosion(em.x, em.targetY);
                exp.isEnemy = true;
                exp.maxRadius = 20;
                explosions.push(exp);
            }
        }

        // Counter missiles
        for (var j = counterMissiles.length - 1; j >= 0; j--) {
            var cm = counterMissiles[j];
            if (cm.alive) {
                cm.x += cm.vx * dt;
                cm.y += cm.vy * dt;
                cm.traveled += cm.speed * dt;

                if (cm.traveled >= cm.totalDist) {
                    cm.alive = false;
                    explosions.push(new Explosion(cm.targetX, cm.targetY));
                }
            } else {
                // Fade trail after detonation
                cm.trailAlpha -= dt * 1.5;
            }
        }

        // Explosions
        for (var k = explosions.length - 1; k >= 0; k--) {
            var ex = explosions[k];
            if (!ex.alive) continue;
            if (ex.expanding) {
                ex.radius += ex.growSpeed * dt;
                if (ex.radius >= ex.maxRadius) {
                    ex.radius = ex.maxRadius;
                    ex.expanding = false;
                }
            } else {
                ex.radius -= ex.shrinkSpeed * dt;
                if (ex.radius <= 0) {
                    ex.radius = 0;
                    ex.alive = false;
                }
            }
        }

        // Collision: explosions vs enemy missiles
        for (var ei = 0; ei < explosions.length; ei++) {
            var explosion = explosions[ei];
            if (!explosion.alive || explosion.isEnemy) continue;
            for (var mi = 0; mi < enemyMissiles.length; mi++) {
                var missile = enemyMissiles[mi];
                if (!missile.alive) continue;
                var dx = missile.x - explosion.x;
                var dy = missile.y - explosion.y;
                if (Math.sqrt(dx * dx + dy * dy) <= explosion.radius) {
                    missile.alive = false;
                    score += 25;
                    spawnDebris(missile.x, missile.y, '#ff3333');
                }
            }
        }

        // Particles
        for (var pi = particles.length - 1; pi >= 0; pi--) {
            var p = particles[pi];
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.vy += 80 * dt; // gravity
            p.life -= dt;
            if (p.life <= 0) {
                p.alive = false;
                particles.splice(pi, 1);
            }
        }

        // Cleanup dead entities (keep trails until they fade)
        enemyMissiles = enemyMissiles.filter(function (m) { return m.alive || m.trailAlpha > 0; });
        counterMissiles = counterMissiles.filter(function (m) { return m.alive || m.trailAlpha > 0; });
        explosions = explosions.filter(function (e) { return e.alive; });

        // Wave/game checks
        if (state === 'PLAYING') {
            checkCollisions();
            checkWaveComplete();
            checkGameOver();
        }

        if (state === 'WAVE_COMPLETE') {
            waveCompleteTimer -= dt * 1000;
            if (waveCompleteTimer <= 0) {
                startWave();
            }
        }

        updateHUD();
    }

    function checkCollisions() {
        // Already handled in update loop above
    }

    function spawnDebris(x, y, color) {
        for (var i = 0; i < 8; i++) {
            var angle = Math.random() * Math.PI * 2;
            var speed = 30 + Math.random() * 80;
            particles.push(new Particle(
                x, y,
                Math.cos(angle) * speed,
                Math.sin(angle) * speed - 40,
                color,
                0.5 + Math.random() * 0.8
            ));
        }
    }

    // ============================================
    // RENDERING
    // ============================================

    function render() {
        // Background
        ctx.fillStyle = '#020208';
        ctx.fillRect(0, 0, W, H);

        // Subtle grid
        ctx.strokeStyle = 'rgba(0, 150, 255, 0.03)';
        ctx.lineWidth = 0.5;
        var gridStep = 40;
        for (var gx = 0; gx < W; gx += gridStep) {
            ctx.beginPath();
            ctx.moveTo(gx, 0);
            ctx.lineTo(gx, H);
            ctx.stroke();
        }
        for (var gy = 0; gy < H; gy += gridStep) {
            ctx.beginPath();
            ctx.moveTo(0, gy);
            ctx.lineTo(W, gy);
            ctx.stroke();
        }

        // Ground line glow
        ctx.strokeStyle = 'rgba(0, 200, 255, 0.08)';
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.moveTo(0, GROUND_Y);
        ctx.lineTo(W, GROUND_Y);
        ctx.stroke();

        ctx.strokeStyle = 'rgba(0, 200, 255, 0.5)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, GROUND_Y);
        ctx.lineTo(W, GROUND_Y);
        ctx.stroke();

        // Cities
        for (var ci = 0; ci < cities.length; ci++) {
            var city = cities[ci];
            if (!city.alive) {
                // Rubble
                ctx.fillStyle = 'rgba(100, 50, 0, 0.3)';
                ctx.fillRect(city.x - city.width / 2, city.groundY - 3, city.width, 3);
                continue;
            }
            for (var bi = 0; bi < city.buildings.length; bi++) {
                var b = city.buildings[bi];
                // Building glow
                ctx.fillStyle = 'rgba(0, 180, 255, 0.06)';
                ctx.fillRect(b.x - 2, city.groundY - b.height - 2, b.width + 4, b.height + 4);
                // Building
                ctx.fillStyle = 'rgba(0, 180, 255, 0.4)';
                ctx.fillRect(b.x, city.groundY - b.height, b.width, b.height);
                // Window dots
                ctx.fillStyle = 'rgba(0, 220, 255, 0.6)';
                for (var wy = city.groundY - b.height + 4; wy < city.groundY - 2; wy += 6) {
                    for (var wx = b.x + 2; wx < b.x + b.width - 2; wx += 5) {
                        ctx.fillRect(wx, wy, 2, 2);
                    }
                }
            }
        }

        // Launch bases
        for (var li = 0; li < bases.length; li++) {
            var base = bases[li];
            // Base shape (trapezoid)
            ctx.fillStyle = 'rgba(0, 160, 255, 0.3)';
            ctx.beginPath();
            ctx.moveTo(base.x - 15, base.groundY);
            ctx.lineTo(base.x - 8, base.groundY - 12);
            ctx.lineTo(base.x + 8, base.groundY - 12);
            ctx.lineTo(base.x + 15, base.groundY);
            ctx.closePath();
            ctx.fill();
            // Base glow outline
            ctx.strokeStyle = 'rgba(0, 200, 255, 0.5)';
            ctx.lineWidth = 1;
            ctx.stroke();
            // Ammo dots
            var ammoY = base.groundY + 8;
            for (var ai = 0; ai < base.ammo; ai++) {
                ctx.fillStyle = 'rgba(0, 220, 255, 0.5)';
                ctx.fillRect(base.x - 12 + ai * 2.5, ammoY, 1.5, 3);
            }
        }

        // Enemy missile trails
        for (var ei = 0; ei < enemyMissiles.length; ei++) {
            var em = enemyMissiles[ei];
            var ea = Math.max(0, em.trailAlpha);
            if (ea <= 0) continue;
            // Trail glow
            ctx.strokeStyle = 'rgba(255, 50, 50, ' + (0.08 * ea).toFixed(3) + ')';
            ctx.lineWidth = 5;
            ctx.beginPath();
            ctx.moveTo(em.startX, em.startY);
            ctx.lineTo(em.x, em.y);
            ctx.stroke();
            // Trail core
            ctx.strokeStyle = 'rgba(255, 60, 60, ' + (0.7 * ea).toFixed(3) + ')';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(em.startX, em.startY);
            ctx.lineTo(em.x, em.y);
            ctx.stroke();
            // Head dot
            if (em.alive) {
                ctx.fillStyle = '#ff4444';
                ctx.beginPath();
                ctx.arc(em.x, em.y, 2.5, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // Counter missile trails
        for (var cmi = 0; cmi < counterMissiles.length; cmi++) {
            var cm = counterMissiles[cmi];
            var ca = Math.max(0, cm.trailAlpha);
            if (ca <= 0) continue;
            // Trail glow
            ctx.strokeStyle = 'rgba(0, 200, 255, ' + (0.1 * ca).toFixed(3) + ')';
            ctx.lineWidth = 5;
            ctx.beginPath();
            ctx.moveTo(cm.startX, cm.startY);
            ctx.lineTo(cm.x, cm.y);
            ctx.stroke();
            // Trail core
            ctx.strokeStyle = 'rgba(0, 220, 255, ' + (0.85 * ca).toFixed(3) + ')';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(cm.startX, cm.startY);
            ctx.lineTo(cm.x, cm.y);
            ctx.stroke();
            // Head dot
            if (cm.alive) {
                ctx.fillStyle = '#00ddff';
                ctx.beginPath();
                ctx.arc(cm.x, cm.y, 2.5, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // Explosions
        for (var exi = 0; exi < explosions.length; exi++) {
            var ex = explosions[exi];
            if (!ex.alive || ex.radius <= 0) continue;
            var alpha = ex.radius / ex.maxRadius;
            if (ex.isEnemy) {
                // Orange/red enemy impact
                ctx.fillStyle = 'rgba(255, 80, 20, ' + (0.1 * alpha).toFixed(2) + ')';
                ctx.beginPath();
                ctx.arc(ex.x, ex.y, ex.radius * 1.5, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = 'rgba(255, 100, 30, ' + (0.6 * alpha).toFixed(2) + ')';
            } else {
                // Cyan player explosion
                ctx.fillStyle = 'rgba(0, 200, 255, ' + (0.08 * alpha).toFixed(2) + ')';
                ctx.beginPath();
                ctx.arc(ex.x, ex.y, ex.radius * 1.4, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = 'rgba(0, 220, 255, ' + (0.7 * alpha).toFixed(2) + ')';
            }
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(ex.x, ex.y, ex.radius, 0, Math.PI * 2);
            ctx.stroke();
        }

        // Particles
        for (var pi = 0; pi < particles.length; pi++) {
            var p = particles[pi];
            var pAlpha = (p.life / p.maxLife) * 0.8;
            ctx.fillStyle = p.color.replace(')', ', ' + pAlpha.toFixed(2) + ')').replace('rgb', 'rgba');
            // Simple fallback for hex colors
            if (p.color.charAt(0) === '#') {
                var r = parseInt(p.color.substr(1, 2), 16);
                var g = parseInt(p.color.substr(3, 2), 16);
                var bl = parseInt(p.color.substr(5, 2), 16);
                ctx.fillStyle = 'rgba(' + r + ',' + g + ',' + bl + ',' + pAlpha.toFixed(2) + ')';
            }
            ctx.fillRect(p.x - 1, p.y - 1, 2, 2);
        }

        // Wave complete text
        if (state === 'WAVE_COMPLETE') {
            ctx.fillStyle = 'rgba(0, 255, 136, 0.8)';
            ctx.font = '24px Courier New';
            ctx.textAlign = 'center';
            ctx.fillText('WAVE ' + (wave) + ' COMPLETE', W / 2, H / 2 - 10);
            ctx.font = '14px Courier New';
            ctx.fillStyle = 'rgba(0, 255, 136, 0.5)';
            ctx.fillText('BONUS AWARDED', W / 2, H / 2 + 20);
        }
    }

    // ============================================
    // HUD & OVERLAY
    // ============================================

    function updateHUD() {
        if (hudScore) hudScore.textContent = 'SCORE: ' + score;
        if (hudWave) hudWave.textContent = 'WAVE: ' + wave;
        var aliveCities = 0;
        for (var i = 0; i < cities.length; i++) {
            if (cities[i].alive) aliveCities++;
        }
        if (hudCities) hudCities.textContent = 'CITIES: ' + aliveCities;
    }

    function showOverlay(title, prompt) {
        if (overlayTitle) overlayTitle.textContent = title;
        if (overlayPrompt) overlayPrompt.textContent = prompt;
        if (overlay) overlay.classList.remove('hidden');
        if (hudEl) hudEl.classList.add('hidden');
    }

    function hideOverlay() {
        if (overlay) overlay.classList.add('hidden');
        if (hudEl) hudEl.classList.remove('hidden');
    }

    // ============================================
    // GAME LOOP
    // ============================================

    function gameLoop(timestamp) {
        var dt = (timestamp - lastTime) / 1000;
        lastTime = timestamp;
        if (dt > 0.05) dt = 0.05;

        update(dt, timestamp);
        render();

        if (state === 'PLAYING' || state === 'WAVE_COMPLETE') {
            animFrameId = requestAnimationFrame(gameLoop);
        }
    }

    function startGame() {
        score = 0;
        wave = 0;
        enemyMissiles = [];
        counterMissiles = [];
        explosions = [];
        particles = [];

        sizeCanvas();
        initEntities();
        hideOverlay();
        lastTime = performance.now();
        startWave();

        if (animFrameId) cancelAnimationFrame(animFrameId);
        animFrameId = requestAnimationFrame(gameLoop);
    }

    // ============================================
    // INIT
    // ============================================

    function init() {
        sizeCanvas();
        initEntities();

        // Render static initial frame
        render();

        // Show overlay
        showOverlay('DEFENSE GRID ONLINE', '[ CLICK TO ENGAGE ]');

        // Handle resize
        var resizeTimer;
        window.addEventListener('resize', function () {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(function () {
                sizeCanvas();
                if (state === 'IDLE' || state === 'GAME_OVER') {
                    initEntities();
                    render();
                }
            }, 250);
        });

        // IntersectionObserver for performance
        if (typeof IntersectionObserver !== 'undefined') {
            var observer = new IntersectionObserver(function (entries) {
                entries.forEach(function (entry) {
                    if (!entry.isIntersecting && (state === 'PLAYING' || state === 'WAVE_COMPLETE')) {
                        // Pause game when not visible
                        if (animFrameId) {
                            cancelAnimationFrame(animFrameId);
                            animFrameId = null;
                        }
                    } else if (entry.isIntersecting && (state === 'PLAYING' || state === 'WAVE_COMPLETE') && !animFrameId) {
                        lastTime = performance.now();
                        animFrameId = requestAnimationFrame(gameLoop);
                    }
                });
            }, { threshold: 0.1 });
            observer.observe(canvas);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
