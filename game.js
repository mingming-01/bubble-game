const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const scoreElement = document.getElementById("score");
const killsElement = document.getElementById("kills");
const timerElement = document.getElementById("timer");
const hpElement = document.getElementById("hp");

const gameOverElement = document.getElementById("gameOver");
const pauseOverlay = document.getElementById("pauseOverlay");

const resultTitleElement = document.getElementById("resultTitle");
const finalKillsElement = document.getElementById("finalKills");
const finalScoreElement = document.getElementById("finalScore");
const bestScoreElement = document.getElementById("bestScore");

const restartButton = document.getElementById("restartButton");
const resumeButton = document.getElementById("resumeButton");

const muteToggle = document.getElementById("muteToggle");


const keys = {};

const mouse = {
    x: canvas.width / 2,
    y: canvas.height / 2,
    down: false
};


const player = {
    x: canvas.width / 2,
    y: canvas.height / 2,
    radius: 20,
    speed: 300,
    hp: 100,
    invincible: 0
};


const bullets = [];
const enemies = [];
const particles = [];


let score = 0;
let kills = 0;
let gameTime = 30;

let spawnTimer = 0;
let shootCooldown = 0;

let gameRunning = true;
let paused = false;

let lastTime = performance.now();

let bestScore = 0;
let bestKills = 0;

let audioContext = null;


/*
    게임 설정
*/

const GAME_TIME = 30;
const PLAYER_MAX_HP = 100;
const PLAYER_DAMAGE = 15;
const BULLET_SPEED = 750;
const SHOOT_INTERVAL = 0.18;
const AIM_ASSIST_RANGE = 80;
const AIM_ASSIST_STRENGTH = 0.35;

/*
    난이도 실험용 값

    카드 3에서는 이 값만 변경한다.
*/

const SPAWN_INTERVAL = 1.0;


/*
    저장 데이터
*/

const DEFAULT_SAVE = {
    bestScore: 0,
    bestKills: 0,
    mute: false
};


function loadSave() {
    try {
        const raw = localStorage.getItem("bubbleGameSave");

        if (!raw) {
            return { ...DEFAULT_SAVE };
        }

        const data = JSON.parse(raw);

        if (
            typeof data !== "object" ||
            data === null ||
            !Number.isFinite(data.bestScore) ||
            !Number.isFinite(data.bestKills) ||
            typeof data.mute !== "boolean"
        ) {
            return { ...DEFAULT_SAVE };
        }

        return {
            bestScore: Math.max(0, data.bestScore),
            bestKills: Math.max(0, data.bestKills),
            mute: data.mute
        };

    } catch (error) {
        return { ...DEFAULT_SAVE };
    }
}


function saveData() {
    const data = {
        bestScore,
        bestKills,
        mute: muteToggle.checked
    };

    try {
        localStorage.setItem(
            "bubbleGameSave",
            JSON.stringify(data)
        );
    } catch (error) {
        // 저장할 수 없는 환경에서도 게임은 계속 실행한다.
    }
}


function initializeSave() {
    const data = loadSave();

    bestScore = data.bestScore;
    bestKills = data.bestKills;

    muteToggle.checked = data.mute;
}


initializeSave();


/*
    입력 처리
*/

window.addEventListener("keydown", (event) => {
    const key = event.key.toLowerCase();

    keys[key] = true;

    if (event.code === "Space") {
        event.preventDefault();

        if (!event.repeat && gameRunning && !paused) {
            shoot();
        }
    }

    if (event.code === "Escape" && !event.repeat) {
        togglePause();
    }

    if (key === "r" && !event.repeat && !gameRunning) {
        restartGame();
    }
});


window.addEventListener("keyup", (event) => {
    const key = event.key.toLowerCase();

    keys[key] = false;
});


/*
    브라우저 포커스를 잃으면
    입력 상태를 초기화하고 일시정지한다.
*/

window.addEventListener("blur", () => {
    clearInputState();

    if (gameRunning && !paused) {
        paused = true;
        pauseOverlay.classList.remove("hidden");
    }
});


document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
        clearInputState();

        if (gameRunning && !paused) {
            paused = true;
            pauseOverlay.classList.remove("hidden");
        }
    }
});


function clearInputState() {
    for (const key in keys) {
        keys[key] = false;
    }

    mouse.down = false;
}


/*
    마우스 조준
*/

canvas.addEventListener("mousemove", (event) => {
    const rect = canvas.getBoundingClientRect();

    mouse.x =
        (event.clientX - rect.left) *
        canvas.width /
        rect.width;

    mouse.y =
        (event.clientY - rect.top) *
        canvas.height /
        rect.height;
});


/*
    마우스 사격

    클릭하면 즉시 한 발 발사하고
    버튼을 계속 누르고 있으면 연사한다.
*/

canvas.addEventListener("mousedown", (event) => {
    if (event.button !== 0) {
        return;
    }

    if (!gameRunning || paused) {
        return;
    }

    mouse.down = true;

    shoot();
});


window.addEventListener("mouseup", () => {
    mouse.down = false;
});


/*
    버튼
*/

restartButton.addEventListener("click", restartGame);

resumeButton.addEventListener("click", () => {
    if (gameRunning) {
        paused = false;
        pauseOverlay.classList.add("hidden");
        lastTime = performance.now();
    }
});


muteToggle.addEventListener("change", () => {
    saveData();
});


/*
    일시정지
*/

function togglePause() {
    if (!gameRunning) {
        return;
    }

    paused = !paused;

    if (paused) {
        clearInputState();
        pauseOverlay.classList.remove("hidden");
    } else {
        pauseOverlay.classList.add("hidden");
        lastTime = performance.now();
    }
}


/*
    게임 업데이트
*/

function update(deltaTime) {
    if (!gameRunning || paused) {
        updateParticles(deltaTime, false);
        return;
    }

    gameTime -= deltaTime;

    if (gameTime <= 0) {
        gameTime = 0;
        endGame("TIME UP!");
        return;
    }

    if (player.invincible > 0) {
        player.invincible -= deltaTime;
    }

    updatePlayer(deltaTime);
    updateBullets(deltaTime);
    updateEnemies(deltaTime);
    updateParticles(deltaTime, true);

    shootCooldown -= deltaTime;

    if (mouse.down && shootCooldown <= 0) {
        shoot();
        shootCooldown = SHOOT_INTERVAL;
    }

    spawnTimer -= deltaTime;

    if (spawnTimer <= 0) {
        spawnEnemy();
        spawnTimer = SPAWN_INTERVAL;
    }

    updateUI();
}


/*
    플레이어 이동
*/

function updatePlayer(deltaTime) {
    let dx = 0;
    let dy = 0;

    if (keys["w"] || keys["arrowup"]) {
        dy -= 1;
    }

    if (keys["s"] || keys["arrowdown"]) {
        dy += 1;
    }

    if (keys["a"] || keys["arrowleft"]) {
        dx -= 1;
    }

    if (keys["d"] || keys["arrowright"]) {
        dx += 1;
    }

    if (dx !== 0 || dy !== 0) {
        const length = Math.hypot(dx, dy);

        dx /= length;
        dy /= length;

        player.x += dx * player.speed * deltaTime;
        player.y += dy * player.speed * deltaTime;
    }

    player.x = Math.max(
        player.radius,
        Math.min(
            canvas.width - player.radius,
            player.x
        )
    );

    player.y = Math.max(
        player.radius,
        Math.min(
            canvas.height - player.radius,
            player.y
        )
    );
}


/*
    사격
*/

function shoot() {
    if (!gameRunning || paused) {
        return;
    }

    const target = getAimAssistTarget();

    let angle = Math.atan2(
        mouse.y - player.y,
        mouse.x - player.x
    );

    if (target) {
        const targetAngle = Math.atan2(
            target.y - player.y,
            target.x - player.x
        );

        const difference = normalizeAngle(
            targetAngle - angle
        );

        angle += difference * AIM_ASSIST_STRENGTH;
    }

    bullets.push({
        x: player.x,
        y: player.y,
        radius: 6,
        vx: Math.cos(angle) * BULLET_SPEED,
        vy: Math.sin(angle) * BULLET_SPEED
    });

    shootCooldown = SHOOT_INTERVAL;

    playShootSound();
}


/*
    조준 보정 대상
*/

function getAimAssistTarget() {
    let target = null;
    let closestDistance = AIM_ASSIST_RANGE;

    for (const enemy of enemies) {
        const distance = Math.hypot(
            enemy.x - mouse.x,
            enemy.y - mouse.y
        );

        if (distance < closestDistance) {
            closestDistance = distance;
            target = enemy;
        }
    }

    return target;
}


function normalizeAngle(angle) {
    while (angle > Math.PI) {
        angle -= Math.PI * 2;
    }

    while (angle < -Math.PI) {
        angle += Math.PI * 2;
    }

    return angle;
}


/*
    총알
*/

function updateBullets(deltaTime) {
    for (let i = bullets.length - 1; i >= 0; i--) {
        const bullet = bullets[i];

        bullet.x += bullet.vx * deltaTime;
        bullet.y += bullet.vy * deltaTime;

        let hit = false;

        for (let j = enemies.length - 1; j >= 0; j--) {
            const enemy = enemies[j];

            const distance = Math.hypot(
                bullet.x - enemy.x,
                bullet.y - enemy.y
            );

            if (distance < bullet.radius + enemy.radius) {
                createKillEffect(
                    enemy.x,
                    enemy.y
                );

                enemies.splice(j, 1);
                bullets.splice(i, 1);

                kills += 1;
                score += 100;

                if (score > bestScore) {
                    bestScore = score;
                }

                if (kills > bestKills) {
                    bestKills = kills;
                }

                saveData();

                hit = true;
                break;
            }
        }

        if (hit) {
            continue;
        }

        if (
            bullet.x < -50 ||
            bullet.x > canvas.width + 50 ||
            bullet.y < -50 ||
            bullet.y > canvas.height + 50
        ) {
            bullets.splice(i, 1);
        }
    }
}


/*
    적 생성
*/

function spawnEnemy() {
    const side = Math.floor(Math.random() * 4);

    let x;
    let y;

    if (side === 0) {
        x = Math.random() * canvas.width;
        y = -40;
    } else if (side === 1) {
        x = canvas.width + 40;
        y = Math.random() * canvas.height;
    } else if (side === 2) {
        x = Math.random() * canvas.width;
        y = canvas.height + 40;
    } else {
        x = -40;
        y = Math.random() * canvas.height;
    }

    const random = Math.random();

    let type;

    if (random < 0.5) {
        type = "chaser";
    } else if (random < 0.8) {
        type = "zigzag";
    } else {
        type = "dasher";
    }

    enemies.push({
        x,
        y,

        radius: 18,

        type,

        speed:
            type === "chaser"
                ? 75
                : type === "zigzag"
                    ? 65
                    : 55,

        attackCooldown:
            Math.random() * 1.5,

        zigzagTime:
            Math.random() * Math.PI * 2,

        dashCooldown:
            2 + Math.random() * 2,

        dashTime: 0
    });
}


/*
    적 행동
*/

function updateEnemies(deltaTime) {
    for (const enemy of enemies) {
        enemy.attackCooldown -= deltaTime;
        enemy.dashCooldown -= deltaTime;

        const dx = player.x - enemy.x;
        const dy = player.y - enemy.y;

        const distance = Math.hypot(dx, dy);

        if (distance === 0) {
            continue;
        }

        const dirX = dx / distance;
        const dirY = dy / distance;

        if (enemy.type === "chaser") {
            moveChaser(
                enemy,
                dirX,
                dirY,
                deltaTime
            );
        }

        if (enemy.type === "zigzag") {
            moveZigzag(
                enemy,
                dirX,
                dirY,
                deltaTime
            );
        }

        if (enemy.type === "dasher") {
            moveDasher(
                enemy,
                dirX,
                dirY,
                deltaTime
            );
        }

        const currentDistance = Math.hypot(
            player.x - enemy.x,
            player.y - enemy.y
        );

        if (
            currentDistance < 55 &&
            enemy.attackCooldown <= 0
        ) {
            attackPlayer(enemy);
            enemy.attackCooldown = 1.1;
        }
    }
}


function moveChaser(
    enemy,
    dirX,
    dirY,
    deltaTime
) {
    enemy.x +=
        dirX *
        enemy.speed *
        deltaTime;

    enemy.y +=
        dirY *
        enemy.speed *
        deltaTime;
}


function moveZigzag(
    enemy,
    dirX,
    dirY,
    deltaTime
) {
    enemy.zigzagTime +=
        deltaTime * 5;

    const sideX = -dirY;
    const sideY = dirX;

    const sway =
        Math.sin(enemy.zigzagTime) * 45;

    enemy.x += (
        dirX * enemy.speed +
        sideX * sway
    ) * deltaTime;

    enemy.y += (
        dirY * enemy.speed +
        sideY * sway
    ) * deltaTime;
}


function moveDasher(
    enemy,
    dirX,
    dirY,
    deltaTime
) {
    if (enemy.dashTime > 0) {
        enemy.dashTime -= deltaTime;

        enemy.x +=
            dirX *
            420 *
            deltaTime;

        enemy.y +=
            dirY *
            420 *
            deltaTime;

        return;
    }

    const distance = Math.hypot(
        player.x - enemy.x,
        player.y - enemy.y
    );

    if (
        enemy.dashCooldown <= 0 &&
        distance < 300
    ) {
        enemy.dashTime = 0.35;
        enemy.dashCooldown = 3;

        createDashWarning(enemy);
    }

    enemy.x +=
        dirX *
        enemy.speed *
        deltaTime;

    enemy.y +=
        dirY *
        enemy.speed *
        deltaTime;
}


/*
    플레이어 공격
*/

function attackPlayer(enemy) {
    if (player.invincible > 0) {
        return;
    }

    player.hp -= PLAYER_DAMAGE;

    player.invincible = 0.6;

    if (player.hp <= 0) {
        player.hp = 0;
        endGame("GAME OVER");
    }
}


/*
    효과
*/

function createKillEffect(x, y) {
    for (let i = 0; i < 12; i++) {
        const angle =
            Math.random() * Math.PI * 2;

        const speed =
            60 + Math.random() * 160;

        particles.push({
            x,
            y,

            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,

            life:
                0.35 +
                Math.random() * 0.25,

            maxLife: 0.6,

            size:
                3 +
                Math.random() * 4,

            type: "kill"
        });
    }

    playKillSound();
}


function createDashWarning(enemy) {
    for (let i = 0; i < 8; i++) {
        particles.push({
            x: enemy.x,
            y: enemy.y,

            vx: 0,
            vy: 0,

            life: 0.35,
            maxLife: 0.35,

            size: 3,

            type: "warning"
        });
    }
}


function updateParticles(deltaTime, active) {
    for (
        let i = particles.length - 1;
        i >= 0;
        i--
    ) {
        const particle = particles[i];

        if (active) {
            particle.x +=
                particle.vx *
                deltaTime;

            particle.y +=
                particle.vy *
                deltaTime;
        }

        particle.life -= deltaTime;

        if (particle.life <= 0) {
            particles.splice(i, 1);
        }
    }
}


/*
    간단한 효과음
*/

function getAudioContext() {
    if (!audioContext) {
        const AudioContext =
            window.AudioContext ||
            window.webkitAudioContext;

        if (!AudioContext) {
            return null;
        }

        audioContext = new AudioContext();
    }

    return audioContext;
}


function playShootSound() {
    if (muteToggle.checked) {
        return;
    }

    const audio = getAudioContext();

    if (!audio) {
        return;
    }

    if (audio.state === "suspended") {
        audio.resume();
    }

    const oscillator =
        audio.createOscillator();

    const gain =
        audio.createGain();

    oscillator.type = "square";

    oscillator.frequency.setValueAtTime(
        420,
        audio.currentTime
    );

    oscillator.frequency.exponentialRampToValueAtTime(
        180,
        audio.currentTime + 0.05
    );

    gain.gain.setValueAtTime(
        0.035,
        audio.currentTime
    );

    gain.gain.exponentialRampToValueAtTime(
        0.001,
        audio.currentTime + 0.05
    );

    oscillator.connect(gain);
    gain.connect(audio.destination);

    oscillator.start();
    oscillator.stop(
        audio.currentTime + 0.05
    );
}


function playKillSound() {
    if (muteToggle.checked) {
        return;
    }

    const audio = getAudioContext();

    if (!audio) {
        return;
    }

    if (audio.state === "suspended") {
        audio.resume();
    }

    const oscillator =
        audio.createOscillator();

    const gain =
        audio.createGain();

    oscillator.type = "sine";

    oscillator.frequency.setValueAtTime(
        650,
        audio.currentTime
    );

    oscillator.frequency.exponentialRampToValueAtTime(
        1000,
        audio.currentTime + 0.08
    );

    gain.gain.setValueAtTime(
        0.06,
        audio.currentTime
    );

    gain.gain.exponentialRampToValueAtTime(
        0.001,
        audio.currentTime + 0.08
    );

    oscillator.connect(gain);
    gain.connect(audio.destination);

    oscillator.start();
    oscillator.stop(
        audio.currentTime + 0.08
    );
}


/*
    화면 그리기
*/

function draw() {
    drawBackground();
    drawBullets();
    drawEnemies();
    drawPlayer();
    drawCrosshair();
    drawParticles();
}


function drawBackground() {
    ctx.fillStyle = "#182230";

    ctx.fillRect(
        0,
        0,
        canvas.width,
        canvas.height
    );

    ctx.strokeStyle =
        "rgba(255,255,255,0.04)";

    ctx.lineWidth = 1;

    for (
        let x = 0;
        x < canvas.width;
        x += 80
    ) {
        ctx.beginPath();

        ctx.moveTo(x, 0);
        ctx.lineTo(
            x,
            canvas.height
        );

        ctx.stroke();
    }

    for (
        let y = 0;
        y < canvas.height;
        y += 80
    ) {
        ctx.beginPath();

        ctx.moveTo(0, y);
        ctx.lineTo(
            canvas.width,
            y
        );

        ctx.stroke();
    }
}


function drawPlayer() {
    if (
        player.invincible > 0 &&
        Math.floor(
            player.invincible * 15
        ) % 2 === 0
    ) {
        return;
    }

    const angle = Math.atan2(
        mouse.y - player.y,
        mouse.x - player.x
    );

    ctx.save();

    ctx.translate(
        player.x,
        player.y
    );

    ctx.rotate(angle);

    ctx.fillStyle = "#4dabf7";

    ctx.beginPath();

    ctx.arc(
        0,
        0,
        player.radius,
        0,
        Math.PI * 2
    );

    ctx.fill();

    ctx.fillStyle = "#ced4da";

    ctx.fillRect(
        10,
        -5,
        28,
        10
    );

    ctx.restore();
}


function drawBullets() {
    for (const bullet of bullets) {
        ctx.fillStyle = "#f8f9fa";

        ctx.beginPath();

        ctx.arc(
            bullet.x,
            bullet.y,
            bullet.radius,
            0,
            Math.PI * 2
        );

        ctx.fill();
    }
}


function drawEnemies() {
    for (const enemy of enemies) {
        if (enemy.type === "chaser") {
            ctx.fillStyle = "#ff6b6b";
        } else if (enemy.type === "zigzag") {
            ctx.fillStyle = "#ffd43b";
        } else {
            ctx.fillStyle = "#845ef7";
        }

        ctx.beginPath();

        ctx.arc(
            enemy.x,
            enemy.y,
            enemy.radius,
            0,
            Math.PI * 2
        );

        ctx.fill();

        if (
            enemy.type === "dasher" &&
            enemy.dashTime > 0
        ) {
            ctx.strokeStyle = "#ffffff";
            ctx.lineWidth = 3;

            ctx.beginPath();

            ctx.arc(
                enemy.x,
                enemy.y,
                enemy.radius + 7,
                0,
                Math.PI * 2
            );

            ctx.stroke();
        }
    }
}


function drawCrosshair() {
    const target =
        getAimAssistTarget();

    ctx.save();

    ctx.translate(
        mouse.x,
        mouse.y
    );

    if (target) {
        const pulse =
            Math.sin(
                performance.now() / 70
            ) * 3;

        ctx.strokeStyle = "#ffd43b";
        ctx.lineWidth = 3;

        ctx.beginPath();

        ctx.arc(
            0,
            0,
            16 + pulse,
            0,
            Math.PI * 2
        );

        ctx.stroke();

        drawCrosshairLines(24, 10);

    } else {
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2;

        ctx.beginPath();

        ctx.arc(
            0,
            0,
            10,
            0,
            Math.PI * 2
        );

        ctx.stroke();

        drawCrosshairLines(17, 7);
    }

    ctx.restore();
}


function drawCrosshairLines(outer, inner) {
    ctx.beginPath();

    ctx.moveTo(-outer, 0);
    ctx.lineTo(-inner, 0);

    ctx.moveTo(outer, 0);
    ctx.lineTo(inner, 0);

    ctx.moveTo(0, -outer);
    ctx.lineTo(0, -inner);

    ctx.moveTo(0, outer);
    ctx.lineTo(0, inner);

    ctx.stroke();
}


function drawParticles() {
    for (const particle of particles) {
        const alpha =
            particle.life /
            particle.maxLife;

        ctx.globalAlpha = alpha;

        if (particle.type === "warning") {
            ctx.fillStyle = "#ff8787";
        } else {
            ctx.fillStyle = "#ffffff";
        }

        ctx.beginPath();

        ctx.arc(
            particle.x,
            particle.y,
            particle.size,
            0,
            Math.PI * 2
        );

        ctx.fill();
    }

    ctx.globalAlpha = 1;
}


/*
    UI
*/

function updateUI() {
    scoreElement.textContent = score;
    killsElement.textContent = kills;
    timerElement.textContent =
        Math.ceil(gameTime);
    hpElement.textContent =
        player.hp;
}


/*
    게임 종료
*/

function endGame(title) {
    gameRunning = false;
    paused = false;

    clearInputState();

    if (score > bestScore) {
        bestScore = score;
    }

    if (kills > bestKills) {
        bestKills = kills;
    }

    saveData();

    resultTitleElement.textContent =
        title;

    finalKillsElement.textContent =
        kills;

    finalScoreElement.textContent =
        score;

    bestScoreElement.textContent =
        bestScore;

    gameOverElement.classList.remove(
        "hidden"
    );

    pauseOverlay.classList.add(
        "hidden"
    );

    updateUI();
}


/*
    새 게임
*/

function restartGame() {
    player.x =
        canvas.width / 2;

    player.y =
        canvas.height / 2;

    player.hp =
        PLAYER_MAX_HP;

    player.invincible = 0;

    bullets.length = 0;
    enemies.length = 0;
    particles.length = 0;

    score = 0;
    kills = 0;

    gameTime = GAME_TIME;

    spawnTimer = 0;
    shootCooldown = 0;

    gameRunning = true;
    paused = false;

    clearInputState();

    gameOverElement.classList.add(
        "hidden"
    );

    pauseOverlay.classList.add(
        "hidden"
    );

    lastTime =
        performance.now();

    updateUI();
}


/*
    게임 루프
*/

function gameLoop(currentTime) {
    const deltaTime =
        Math.min(
            (currentTime - lastTime) / 1000,
            0.05
        );

    lastTime = currentTime;

    update(deltaTime);
    draw();

    requestAnimationFrame(
        gameLoop
    );
}


/*
    시작
*/

updateUI();

gameLoop(lastTime);
