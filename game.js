// Lấy thẻ canvas từ tệp HTML
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
// Lấy thẻ audio
const kameAudio = document.getElementById('kameAudio');
const hurtAudio = document.getElementById('hurtAudio');
const destroyAudio = document.getElementById('destroyAudio');

// Lấy các nút bấm
const jumpButton = document.getElementById('jumpButton');
const shootButton = document.getElementById('shootButton');
const rageButton = document.getElementById('rageButton');

canvas.width = 800;
canvas.height = 400;

console.log("Khung game đã sẵn sàng!");

// --- Cài đặt Game ---
const groundLevel = canvas.height - 50;
const gravity = 1.4;
let gameSpeed = 5;

// --- CÀI ĐẶT BOSS (dễ điều chỉnh) ---
const BOSS_SCORE_THRESHOLD = 1000;
const BOSS_MAX_HEALTH = 2000;

// --- CÀI ĐẶT KAMEHAMEHA ---
const KAME_AUDIO_DURATION_MS = 8000; // 8 giây
const KAMEHAMEHA_BLAST_START_MS = 4000; // Bắn ở giây thứ 4
const KAMEHAMEHA_BLAST_DURATION_FRAMES = 180; // Chưởng dài 3 giây (3*60)
const BOSS_DISAPPEAR_DURATION_FRAMES = 120; // Tan biến 2 giây (2*60)

// --- Đường dẫn ảnh nhân vật ---
const PLAYER_DEFAULT_IMAGE_SRC = 'player.png';
const PLAYER_CHARGING_IMAGE_SRC = 'player_charging.png';

// --- Biến trạng thái game ---
let score = 0;
let isGameOver = false;
let playerLives = 5;
let isBossActive = false;
let boss = null;
let rage = 0;
const RAGE_MAX = 100;
let isBossDefeated = false;
let isGameWon = false;
let isKameActive = false;
let isShaking = false;
let shakeTimer = 0;
let isShowingInstructions = true; // Màn hình hướng dẫn

// --- Mảng lưu trữ ---
let projectiles = [];
let obstacles = [];
let enemyProjectiles = [];
let particles = [];

// --- Hai bộ đếm thời gian tạo chướng ngại vật độc lập ---
let obstacle1Timer = 0;
let obstacle1Interval = 90 + Math.random() * 50;
let obstacle2Timer = 0;
let obstacle2Interval = 150 + Math.random() * 70;

// --- Lớp Particle (Hạt hiệu ứng) ---
class Particle {
  constructor(x, y, color, size, speedX, speedY) {
    this.x = x;
    this.y = y;
    this.color = color;
    this.size = size;
    this.speedX = speedX;
    this.speedY = speedY;
    this.life = 100;
  }
  update() {
    this.x += this.speedX;
    this.y += this.speedY;
    this.speedY += 0.1;
    this.life -= 3;
    if (this.size > 0.2) this.size -= 0.1;
  }
  draw() {
    ctx.fillStyle = this.color;
    ctx.globalAlpha = this.life / 100;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1.0;
  }
}

// --- Hàm tạo vụ nổ ---
function createExplosion(x, y, color, count = 10) {
  for (let i = 0; i < count; i++) {
    const size = Math.random() * 4 + 1;
    const speedX = (Math.random() - 0.5) * 4;
    const speedY = (Math.random() - 0.5) * 4;
    particles.push(new Particle(x, y, color, size, speedX, speedY));
  }
}

// --- Lớp hiệu ứng Gồng (Aura) ---
class ChargingEffect {
  constructor(player) {
    this.player = player;
    this.active = false;
    this.timer = 0;
  }
  start() { this.active = true; this.timer = 0; }
  stop() { this.active = false; }
  update() { if (this.active) this.timer++; }
  draw() {
    if (!this.active) return;

    const radius1 = (this.timer % 30) + 10;
    const alpha1 = 1 - (radius1 / 40);
    const radius2 = ((this.timer + 15) % 30) + 10;
    const alpha2 = 1 - (radius2 / 40);

    ctx.strokeStyle = `rgba(0, 150, 255, ${alpha1})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(this.player.x + this.player.width / 2, this.player.y + this.player.height / 2, radius1, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = `rgba(0, 150, 255, ${alpha2})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(this.player.x + this.player.width / 2, this.player.y + this.player.height / 2, radius2, 0, Math.PI * 2);
    ctx.stroke();

    ctx.lineWidth = 1;
  }
}

// --- Lớp hiệu ứng Kamehameha ---
class KamehamehaEffect {
  constructor(player) {
    this.player = player;
    this.active = false;
    this.timer = 0;
    this.duration = KAMEHAMEHA_BLAST_DURATION_FRAMES;
  }

  start() {
    this.active = true;
    this.timer = this.duration;
    isShaking = true;
    shakeTimer = this.duration;
  }

  update() {
    if (this.active) {
      this.timer--;
      if (this.timer <= 0) {
        this.active = false;
        if (boss) boss.startDisappearing();
        player.changeImage(PLAYER_DEFAULT_IMAGE_SRC);
      }
    }
  }

  draw() {
    if (this.active) {
      ctx.fillStyle = `rgba(0, 150, 255, ${0.5 + Math.random() * 0.5})`;
      ctx.beginPath();
      ctx.moveTo(this.player.x + this.player.width, this.player.y + this.player.height / 2);
      ctx.lineTo(canvas.width, 0);
      ctx.lineTo(canvas.width, canvas.height);
      ctx.closePath();
      ctx.fill();
    }
  }
}


// --- Lớp Player (Nhân vật) ---
class Player {
  constructor() {
    this.width = 60;
    this.height = 80;
    this.x = 50;
    this.y = groundLevel - this.height;
    this.velocityY = 0;
    this.isJumping = false;
    this.isInvincible = false;
    this.invincibleTimer = 0;
    this.image = new Image();
    this.image.src = PLAYER_DEFAULT_IMAGE_SRC;
    this.image.onerror = () => console.error("Không thể tải 'player.png'.");
    this.kamehameha = new KamehamehaEffect(this);
    this.chargingEffect = new ChargingEffect(this);
  }

  update() {
    if (this.y < groundLevel - this.height || this.velocityY !== 0) {
      this.velocityY += gravity;
      this.y += this.velocityY;
    }
    if (this.y > groundLevel - this.height) {
      this.y = groundLevel - this.height;
      this.velocityY = 0;
      this.isJumping = false;
    }

    if (this.isInvincible) {
      this.invincibleTimer--;
      if (this.invincibleTimer <= 0) this.isInvincible = false;
    }

    this.kamehameha.update();
    this.chargingEffect.update();
  }

  draw() {
    if (this.isInvincible && this.invincibleTimer % 20 < 10) return;

    if (this.image.complete && this.image.naturalWidth !== 0) {
      ctx.drawImage(this.image, this.x, this.y, this.width, this.height);
    } else {
      ctx.fillStyle = 'blue';
      ctx.fillRect(this.x, this.y, this.width, this.height);
    }

    this.chargingEffect.draw();
    this.kamehameha.draw();
  }

  jump() {
    if (!this.isJumping) {
      this.isJumping = true;
      this.velocityY = -22;
    }
  }

  shoot() {
    if (isKameActive) return;
    projectiles.push(new Projectile(this.x + this.width, this.y + this.height / 2));
  }

  takeDamage() {
    if (!this.isInvincible && !isKameActive) {
      playerLives--;

      if (hurtAudio) {
        hurtAudio.currentTime = 0;
        hurtAudio.play();
      }

      this.isInvincible = true;
      this.invincibleTimer = 120;
      if (playerLives <= 0) {
        isGameOver = true;
      }
    }
  }

  changeImage(newImageSrc) {
    if (this.image.src.includes(newImageSrc)) return;
    this.image.src = newImageSrc;
    this.image.onerror = () => console.error(`Không thể tải '${newImageSrc}'.`);
  }
}

// --- Lớp Projectile (Chưởng của Player) ---
class Projectile {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.radius = 8;
    this.speed = 10;
    this.color = 'orange';
    this.markedForDeletion = false;
  }
  update() { this.x += this.speed; }
  draw() {
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

// --- Lớp Obstacle (Loại 1: Bị tiêu diệt) ---
class Obstacle {
  constructor() {
    this.width = 50;
    this.height = 70;
    this.x = canvas.width;
    this.y = groundLevel - this.height;
    this.speed = gameSpeed * 1.4;
    this.markedForDeletion = false;
    this.type = 'Type1';
    this.image = new Image();
    this.image.src = 'obstacle1.png';
    this.image.onerror = () => console.error("Không thể tải 'obstacle1.png'.");
  }
  update() {
    this.x -= this.speed;
    if (this.x < 0 - this.width) this.markedForDeletion = true;
  }
  draw() {
    if (this.image.complete && this.image.naturalWidth !== 0) {
      ctx.drawImage(this.image, this.x, this.y, this.width, this.height);
    } else {
      ctx.fillStyle = 'red';
      ctx.fillRect(this.x, this.y, this.width, this.height);
    }
  }
}

// --- Lớp ObstacleType2 (Loại 2: Bắn đạn) ---
class ObstacleType2 {
  constructor() {
    this.width = 20;
    this.height = 70;
    this.x = canvas.width;
    this.y = groundLevel - this.height;
    this.speed = gameSpeed * 1.1;
    this.markedForDeletion = false;
    this.type = 'Type2';
    this.hasFiredFirstShot = false;
    this.hasFiredSecondShot = false;
    this.image = new Image();
    this.image.src = 'obstacle2.png';
    this.image.onerror = () => console.error("Không thể tải 'obstacle2.png'.");
  }
  update() {
    this.x -= this.speed;
    if (this.x < 0 - this.width) this.markedForDeletion = true;
    if (!this.hasFiredFirstShot && this.x <= 750) {
      this.shoot();
      this.hasFiredFirstShot = true;
    }
    if (this.hasFiredFirstShot && !this.hasFiredSecondShot && this.x <= 500) {
      this.shoot();
      this.hasFiredSecondShot = true;
    }
  }
  draw() {
    if (this.image.complete && this.image.naturalWidth !== 0) {
      ctx.drawImage(this.image, this.x, this.y, this.width, this.height);
    } else {
      ctx.fillStyle = 'purple';
      ctx.fillRect(this.x, this.y, this.width, this.height);
    }
  }
  shoot() {
    enemyProjectiles.push(new EnemyProjectile(this.x, this.y + this.height / 2, -15, 0, false, 'heart'));
  }
}

// --- Lớp EnemyProjectile (Đạn của địch) ---
class EnemyProjectile {
  constructor(x, y, speedX, speedY, usesGravity, type = 'bullet') {
    this.x = x;
    this.y = y;
    this.speedX = speedX;
    this.speedY = speedY;
    this.usesGravity = usesGravity;
    this.color = '#ff0000';
    this.markedForDeletion = false;
    this.type = type;

    this.image = null;
    if (this.type === 'horn') {
      this.width = 35;
      this.height = 35;
      this.image = new Image();
      this.image.src = 'sung.png';
      this.image.onerror = () => console.error("Không tìm thấy 'sung.png'");
    } else if (this.type === 'heart') {
      this.width = 18;
      this.height = 18;
    } else {
      this.width = 10;
      this.height = 10;
    }
  }

  update() {
    this.x += this.speedX;

    if (this.usesGravity) {
      this.speedY += gravity;
      this.y += this.speedY;
    }

    if (this.x < 0 || this.y > canvas.height) this.markedForDeletion = true;
  }

  draw() {
    ctx.fillStyle = this.color;

    if (this.type === 'horn') {
      if (this.image && this.image.complete && this.image.naturalWidth !== 0) {
        ctx.drawImage(this.image, this.x - this.width / 2, this.y - this.height / 2, this.width, this.height);
      } else {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.width / 2, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (this.type === 'heart') {
      this.drawHeart(this.x, this.y, this.width);
    } else {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.width / 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawHeart(x, y, size) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.PI);
    ctx.translate(-x, -y);

    ctx.beginPath();
    let topCurveHeight = size * 0.3;
    ctx.moveTo(x, y + topCurveHeight);
    ctx.bezierCurveTo(x, y, x - size / 2, y, x - size / 2, y + topCurveHeight);
    ctx.bezierCurveTo(x - size / 2, y + (size + topCurveHeight) / 2, x, y + (size + topCurveHeight) / 2, x, y + size);
    ctx.bezierCurveTo(x, y + (size + topCurveHeight) / 2, x + size / 2, y + (size + topCurveHeight) / 2, x + size / 2, y + topCurveHeight);
    ctx.bezierCurveTo(x + size / 2, y, x, y, x, y + topCurveHeight);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

// --- Lớp BOSS ---
class Boss {
  constructor() {
    this.width = 150;
    this.height = 200;
    this.x = canvas.width - this.width - 20;
    this.y = groundLevel - this.height;
    this.maxHealth = BOSS_MAX_HEALTH;
    this.currentHealth = this.maxHealth;
    this.image = new Image();
    this.image.src = 'boss.png';

    this.attackTimer1 = 0;
    this.attackInterval1 = 50;
    this.attackTimer2 = 0;
    this.attackInterval2 = 120;

    this.isDisappearing = false;
    this.disappearTimer = BOSS_DISAPPEAR_DURATION_FRAMES;
    this.disappearMaxTimer = BOSS_DISAPPEAR_DURATION_FRAMES;
  }

  update() {
    if (this.isDisappearing) {
      this.disappearTimer--;
      createExplosion(this.x + Math.random() * this.width, this.y + Math.random() * this.height, 'white', 3);
      if (this.disappearTimer <= 0) {
        this.die();
      }
      return;
    }

    if (isKameActive) return;

    this.attackTimer1++;
    if (this.attackTimer1 > this.attackInterval1) {
      this.shootStraight();
      this.attackTimer1 = 0;
    }

    this.attackTimer2++;
    if (this.attackTimer2 > this.attackInterval2) {
      this.shootArc();
      this.attackTimer2 = 0;
    }
  }

  draw() {
    if (this.isDisappearing) {
      ctx.globalAlpha = this.disappearTimer / this.disappearMaxTimer;
    }

    if (this.image.complete && this.image.naturalWidth !== 0) {
      ctx.drawImage(this.image, this.x, this.y, this.width, this.height);
    } else {
      ctx.fillStyle = 'purple';
      ctx.fillRect(this.x, this.y, this.width, this.height);
    }

    ctx.globalAlpha = 1.0;
  }

  drawHealthBar() {
    if (this.isDisappearing) return;

    const barWidth = 300;
    const barHeight = 20;
    const x = (canvas.width / 2) - (barWidth / 2);
    const y = 30;

    ctx.fillStyle = '#555';
    ctx.fillRect(x, y, barWidth, barHeight);

    const healthPercent = this.currentHealth / this.maxHealth;
    ctx.fillStyle = 'red';
    ctx.fillRect(x, y, barWidth * healthPercent, barHeight);
  }

  shootStraight() {
    enemyProjectiles.push(new EnemyProjectile(this.x, this.y + 70, -15, 0, false, 'horn'));
    enemyProjectiles.push(new EnemyProjectile(this.x, this.y + 100, -15, 0, false, 'horn'));
    enemyProjectiles.push(new EnemyProjectile(this.x, this.y + 130, -15, 0, false, 'horn'));
  }

  shootArc() {
    enemyProjectiles.push(new EnemyProjectile(this.x, this.y, -10, -25, true, 'horn'));
    enemyProjectiles.push(new EnemyProjectile(this.x, this.y, -12, -22, true, 'horn'));
  }

  takeDamage(amount) {
    if (this.isDisappearing || isKameActive) return;

    this.currentHealth -= amount;
    createExplosion(this.x + Math.random() * this.width, this.y + Math.random() * this.height, 'orange', 5);

    if (this.currentHealth > this.maxHealth / 2) {
      let healthLostInPhase1 = this.maxHealth - this.currentHealth;
      let percentOfPhase1 = healthLostInPhase1 / (this.maxHealth / 2);
      rage = (RAGE_MAX / 2) + (percentOfPhase1 * (RAGE_MAX / 2));
    } else {
      rage = RAGE_MAX;
    }

    if (this.currentHealth <= 0) {
      this.currentHealth = 0;
      this.startDisappearing();
    }
  }

  startDisappearing() {
    if (!this.isDisappearing) {
      console.log("Boss đang tan biến...");
      this.isDisappearing = true;
      this.currentHealth = 0;
      enemyProjectiles = [];
    }
  }

  die() {
    isBossActive = false;
    isBossDefeated = true;
    boss = null;
    score += 10000;
    isGameWon = true;
  }
}

// --- Hàm bắt đầu trận Boss ---
function startBossBattle() {
  if (isBossActive) return;

  console.log("BOSS BATTLE START!");
  isBossActive = true;
  boss = new Boss();

  obstacles = [];
  enemyProjectiles = [];
}


// --- Tạo đối tượng game ---
const player = new Player();

// --- Hàm chơi lại game ---
function restartGame() {
  console.log("Khởi động lại game!");
  score = 0;
  isGameOver = false;
  playerLives = 5;

  obstacles = [];
  projectiles = [];
  enemyProjectiles = [];
  particles = [];

  player.y = groundLevel - player.height;
  player.velocityY = 0;
  player.isJumping = false;
  player.isInvincible = false;
  player.invincibleTimer = 0;
  player.chargingEffect.stop();
  player.changeImage(PLAYER_DEFAULT_IMAGE_SRC);

  obstacle1Timer = 0;
  obstacle2Timer = 0;

  isBossActive = false;
  boss = null;
  rage = 0;
  isBossDefeated = false;
  isGameWon = false;

  isKameActive = false;
  if (kameAudio) kameAudio.pause();
  if (kameAudio) kameAudio.currentTime = 0;
  if (hurtAudio) hurtAudio.pause();
  if (hurtAudio) hurtAudio.currentTime = 0;
  if (destroyAudio) destroyAudio.pause();
  if (destroyAudio) destroyAudio.currentTime = 0;

  isShaking = false;
  shakeTimer = 0;

  isShowingInstructions = true;

  if (rageButton) rageButton.style.display = 'none';
}

// --- Hàm kích hoạt Kamehameha (Audio) ---
function triggerKamehameha() {
  console.log("KAMEHAMEHA Sequence!");
  isKameActive = true;
  rage = 0;

  if (rageButton) rageButton.style.display = 'none';

  if (kameAudio) {
    kameAudio.currentTime = 0;
    kameAudio.play().catch(e => console.error("Lỗi phát âm thanh:", e));
  }

  player.chargingEffect.start();
  player.changeImage(PLAYER_CHARGING_IMAGE_SRC);

  setTimeout(() => {
    player.chargingEffect.stop();

    if (isBossActive && boss) {
      player.kamehameha.start();
    } else {
      isKameActive = false;
      player.changeImage(PLAYER_DEFAULT_IMAGE_SRC);
    }
  }, KAMEHAMEHA_BLAST_START_MS); // 4000ms
}


// --- Xử lý sự kiện bàn phím & NÚT BẤM ---

// --- MỚI: Hàm xử lý hành động (tránh lặp code) ---
function handlePlayerAction(action) {
  if (isShowingInstructions) {
    isShowingInstructions = false;
    return;
  }

  if (isGameOver || isGameWon) {
    if (action === 'shoot' || action === 'jump') { // Chỉ Enter/Nhảy mới chơi lại
      restartGame();
    }
    return;
  }

  if (isKameActive) return; // Không làm gì khi đang gồng/bắn

  switch (action) {
    case 'jump':
      player.jump();
      break;
    case 'shoot':
      player.shoot();
      break;
    case 'rage':
      if (rage >= RAGE_MAX && isBossActive) {
        triggerKamehameha();
      }
      break;
  }
}

// Bàn phím
document.addEventListener('keydown', (event) => {
  event.preventDefault(); // Ngăn hành vi mặc định (như Space cuộn trang)
  switch (event.code) {
    case 'Space':
      handlePlayerAction('jump');
      break;
    case 'Enter':
      handlePlayerAction('shoot');
      break;
    case 'KeyQ':
      handlePlayerAction('rage');
      break;
  }
});

// Nút bấm (Mobile)
// 'touchstart' phản hồi nhanh hơn 'click'
if (jumpButton) {
  jumpButton.addEventListener('touchstart', (e) => {
    e.preventDefault();
    handlePlayerAction('jump');
  });
}
if (shootButton) {
  shootButton.addEventListener('touchstart', (e) => {
    e.preventDefault();
    handlePlayerAction('shoot');
  });
}
if (rageButton) {
  rageButton.addEventListener('touchstart', (e) => {
    e.preventDefault();
    handlePlayerAction('rage');
  });
}


// --- Hàm xử lý Chướng ngại vật ---
function handleObstacles() {

  if (!isBossActive) {
    // 1. Logic cho Kẻ địch 1
    if (obstacle1Timer > obstacle1Interval) {
      obstacles.push(new Obstacle());
      obstacle1Interval = 80 + Math.random() * 50;
      obstacle1Timer = 0;
    } else {
      obstacle1Timer++;
    }

    // 2. Logic cho Kẻ địch 2
    const type2Exists = obstacles.some(obstacle => obstacle.type === 'Type2');
    if (obstacle2Timer > obstacle2Interval && !type2Exists) {
      obstacles.push(new ObstacleType2());
      obstacle2Interval = 150 + Math.random() * 70;
      obstacle2Timer = 0;
    } else {
      obstacle2Timer++;
    }
  }

  obstacles.forEach(obstacle => {
    obstacle.update();
    obstacle.draw();
  });

  obstacles = obstacles.filter(obstacle => !obstacle.markedForDeletion);
}

// --- Hàm xử lý Hạt ---
function handleParticles() {
  for (let i = particles.length - 1; i >= 0; i--) {
    particles[i].update();
    particles[i].draw();
    if (particles[i].life <= 0 || particles[i].size <= 0.2) {
      particles.splice(i, 1);
    }
  }
}


// --- Hàm kiểm tra Va chạm ---
function checkCollision(rect1, rect2) {
  return (
    rect1.x < rect2.x + rect2.width &&
    rect1.x + rect1.width > rect2.x &&
    rect1.y < rect2.y + rect2.height &&
    rect1.y + rect1.height > rect2.y
  );
}

// --- Hàm xử lý Va chạm ---
function handleCollisions() {

  if (isBossActive && boss) {
    // 1. Chưởng Player vs Boss
    projectiles.forEach(projectile => {
      const projectileHitbox = {
        x: projectile.x - projectile.radius,
        y: projectile.y - projectile.radius,
        width: projectile.radius * 2,
        height: projectile.radius * 2
      };

      if (checkCollision(projectileHitbox, boss)) {
        boss.takeDamage(10);
        projectile.markedForDeletion = true;
        createExplosion(projectile.x, projectile.y, 'orange', 5);
      }
    });

    // 2. Player vs Boss
    if (checkCollision(player, boss)) {
      player.takeDamage();
    }

  } else {
    // 1. Chưởng Player vs Chướng ngại vật
    projectiles.forEach(projectile => {
      obstacles.forEach(obstacle => {
        const projectileHitbox = {
          x: projectile.x - projectile.radius, y: projectile.y - projectile.radius,
          width: projectile.radius * 2, height: projectile.radius * 2
        };
        if (checkCollision(projectileHitbox, obstacle)) {
          if (obstacle.type === 'Type1') {
            obstacle.markedForDeletion = true;
            projectile.markedForDeletion = true;
            score += 100;

            if (destroyAudio) {
              destroyAudio.currentTime = 0;
              destroyAudio.play();
            }

            createExplosion(obstacle.x + obstacle.width / 2, obstacle.y + obstacle.height / 2, 'red', 10);
          }
        }
      });
    });

    // 2. Người chơi vs Chướng ngại vật
    obstacles.forEach(obstacle => {
      if (checkCollision(player, obstacle)) {
        player.takeDamage();
        if (obstacle.type === 'Type1') {
          obstacle.markedForDeletion = true;
        }
      }
    });
  }

  // 3. Người chơi vs Đạn địch (Luôn chạy)
  enemyProjectiles.forEach(bullet => {
    const bulletHitbox = {
      x: bullet.x - bullet.width / 2,
      y: bullet.y - bullet.height / 2,
      width: bullet.width,
      height: bullet.height
    };

    if (checkCollision(player, bulletHitbox)) {
      player.takeDamage();
      bullet.markedForDeletion = true;
      createExplosion(player.x + player.width / 2, player.y + player.height / 2, 'red', 5);
    }
  });

  // Lọc ra các đối tượng
  obstacles = obstacles.filter(obstacle => !obstacle.markedForDeletion);
  projectiles = projectiles.filter(projectile => !projectile.markedForDeletion);
  projectiles = projectiles.filter(projectile => projectile.x < canvas.width);
  enemyProjectiles = enemyProjectiles.filter(bullet => !bullet.markedForDeletion);
}


/**
 * CẬP NHẬT: Hàm update() - Cập nhật logic game
 */
function update() {
  if (isGameOver || isGameWon || isShowingInstructions) return;

  if (isKameActive) {
    player.update();
    if (boss) boss.update();
    handleParticles();

    if (isShaking && shakeTimer > 0) {
      shakeTimer--;
    } else {
      isShaking = false;
    }

    return;
  }

  if (score >= BOSS_SCORE_THRESHOLD && !isBossActive && !isBossDefeated) {
    startBossBattle();
  }

  if (!isBossActive) {
    score++;

    if (!isBossDefeated) {
      rage = (score / BOSS_SCORE_THRESHOLD) * (RAGE_MAX / 2);
      if (rage > (RAGE_MAX / 2)) rage = (RAGE_MAX / 2);
    }
  }

  player.update();
  projectiles.forEach(projectile => projectile.update());
  enemyProjectiles.forEach(bullet => bullet.update());
  particles.forEach(particle => particle.update());

  if (isBossActive && boss) {
    boss.update();
  } else {
    if (!isBossDefeated) {
      handleObstacles();
    }
  }

  handleCollisions();
}

// --- Hàm vẽ Thanh Nộ ---
function drawRageBar() {
  const barWidth = 200;
  const barHeight = 15;
  const x = canvas.width - barWidth - 20;
  const y = 30;

  ctx.fillStyle = '#555';
  ctx.fillRect(x, y, barWidth, barHeight);

  const ragePercent = rage / RAGE_MAX;
  ctx.fillStyle = '#00FFFF'; // Màu Cyan
  ctx.fillRect(x, y, barWidth * ragePercent, barHeight);

  if (rage >= RAGE_MAX && !isKameActive) {
    ctx.fillStyle = 'yellow';
    ctx.font = '20px Arial';
    ctx.textAlign = 'right';
    ctx.fillText('Nhấn [Q]', canvas.width - 20, 60);

    if (rageButton && rageButton.style.display === 'none') {
      rageButton.style.display = 'block';
    }
  } else {
    if (rageButton && rageButton.style.display !== 'none') {
      rageButton.style.display = 'none';
    }
  }
}

/**
 * CẬP NHẬT: Hàm draw() - Vẽ mọi thứ lên màn hình
 */
function draw() {
  ctx.save();

  if (isShaking && shakeTimer > 0) {
    const shakeX = (Math.random() - 0.5) * 10;
    const shakeY = (Math.random() - 0.5) * 10;
    ctx.translate(shakeX, shakeY);
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Vẽ mặt đất
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, groundLevel);
  ctx.lineTo(canvas.width, groundLevel);
  ctx.stroke();

  // Vẽ các đối tượng game (trừ khi đang ở màn hình hướng dẫn)
  if (!isShowingInstructions) {
    player.draw();
    projectiles.forEach(projectile => projectile.draw());
    obstacles.forEach(obstacle => obstacle.draw());
    enemyProjectiles.forEach(bullet => bullet.draw());
    particles.forEach(particle => particle.draw());
  } else {
    // Vẽ nhân vật ở màn hình chờ
    player.draw();
  }

  // Vẽ Boss
  if (isBossActive && boss) {
    boss.draw();
    boss.drawHealthBar();
  }

  // Vẽ Điểm số và Mạng (trừ khi đang ở màn hình hướng dẫn)
  if (!isShowingInstructions) {
    ctx.fillStyle = 'black';
    ctx.font = '24px Arial';
    ctx.textAlign = 'left';
    ctx.fillText('Điểm: ' + score, 20, 40);
    ctx.fillStyle = 'red';
    ctx.fillText('❤️ ' + playerLives, 20, 70);
  }

  // Vẽ Thanh Nộ
  if (!isBossDefeated && !isShowingInstructions) {
    drawRageBar();
  }

  // Vẽ màn hình Hướng dẫn (TRÊN CÙNG)
  if (isShowingInstructions) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = 'white';
    ctx.font = 'bold 30px Arial';
    ctx.textAlign = 'center';

    ctx.fillText("HƯỚNG DẪN", canvas.width / 2, canvas.height / 2 - 100);

    ctx.font = '24px Arial';
    ctx.fillText("Nhấn [SPACE] / Nút [Nhảy] để Nhảy", canvas.width / 2, canvas.height / 2 - 40);
    ctx.fillText("Nhấn [ENTER] / Nút [Bắn] để Bắn", canvas.width / 2, canvas.height / 2);
    ctx.fillText("Khi nộ đầy, [Q]xuất hiện, ấn nó để diệt BOSS", canvas.width / 2, canvas.height / 2 + 40);
    ctx.fillText("Gặp BOSS khi 3000 điểm", canvas.width / 2, canvas.height / 2 + 80);

    ctx.font = 'bold 26px Arial';
    ctx.fillStyle = '#FFFF00'; // Màu vàng
    ctx.fillText("Nhấn phím/nút bất kỳ để Bắt đầu!", canvas.width / 2, canvas.height / 2 + 120);
  }

  // Xử lý màn hình Game Over (phải ở sau Hướng dẫn)
  if (isGameOver) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = 'white';
    ctx.font = '50px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('GAME OVER', canvas.width / 2, canvas.height / 2 - 20);

    ctx.font = '30px Arial';
    ctx.fillText('Điểm của bạn: ' + score, canvas.width / 2, canvas.height / 2 + 30);

    ctx.font = '20px Arial';
    ctx.fillText('Nhấn Enter / [Bắn] để chơi lại', canvas.width / 2, canvas.height / 2 + 70);
  }
  // Màn hình Chiến thắng
  else if (isGameWon) {
    ctx.fillStyle = 'rgba(0, 200, 100, 0.5)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = 'white';
    ctx.font = '50px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('CHIẾN THẮNG!', canvas.width / 2, canvas.height / 2 - 20);

    ctx.font = '30px Arial';
    ctx.fillText('Tổng điểm: ' + score, canvas.width / 2, canvas.height / 2 + 30);

    ctx.font = '20px Arial';
    ctx.fillText('Nhấn Enter / [Bắn] để chơi lại', canvas.width / 2, canvas.height / 2 + 70);
  }

  ctx.restore();
}

/**
 * CẬP NHẬT: Hàm gameLoop() - Trái tim của game
 */
function gameLoop() {
  // Chỉ cập nhật nếu game đang chạy
  if (!isGameOver && !isGameWon && !isShowingInstructions) {
    update();
  }

  // Luôn luôn vẽ
  draw();
  requestAnimationFrame(gameLoop);
}

// Bắt đầu vòng lặp game!
requestAnimationFrame(gameLoop);
