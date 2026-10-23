// 主循环、输入、刷怪、HUD

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const ROUND_SECONDS = 90;

const state = {
  mode: 'ready',      // ready | playing | over | win
  timeLeft: ROUND_SECONDS,
  kills: 0,
  frame: 0,
  shake: 0,
  particles: [],
  bullets: [],
  enemies: [],
  items: [],
  spawnTimer: 0,
  tank: null,
  message: '',
};

const input = { left: false, right: false, spinLeft: false, spinRight: false };

// ---------- 输入 ----------
window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (['a', 'd', 'w', 'arrowleft', 'arrowright', ' '].includes(k) || e.key === ' ') e.preventDefault();

  if (k === 'a') input.left = true;
  if (k === 'd') input.right = true;
  if (k === 'arrowleft') input.spinLeft = true;
  if (k === 'arrowright') input.spinRight = true;

  if (state.mode === 'ready' || state.mode === 'over' || state.mode === 'win') {
    if (k === 'r' || k === ' ' || k === 'enter') startGame();
    return;
  }

  if (k === 'w') {
    if (state.tank && state.tank.jump()) spawnDust(state.tank.x, state.tank.y + 12, '#999');
  }
  if (k === ' ') {
    const b = state.tank && state.tank.fire();
    if (b) {
      state.bullets.push(b);
      state.shake = Math.max(state.shake, 2.5);
      spawnDust(state.tank.x, state.tank.y, '#777', 3);
    }
  }
});

window.addEventListener('keyup', (e) => {
  const k = e.key.toLowerCase();
  if (k === 'a') input.left = false;
  if (k === 'd') input.right = false;
  if (k === 'arrowleft') input.spinLeft = false;
  if (k === 'arrowright') input.spinRight = false;
});

// ---------- 粒子 ----------
function spawnDust(x, y, color = '#888', n = 6) {
  for (let i = 0; i < n; i++) {
    state.particles.push({
      x, y,
      vx: rand(-2.2, 2.2),
      vy: rand(-2.6, 0.4),
      life: rand(16, 32),
      color,
      size: rand(1.6, 3.4),
    });
  }
}

// ---------- 局 ----------
function startGame() {
  state.mode = 'playing';
  state.timeLeft = ROUND_SECONDS;
  state.kills = 0;
  state.frame = 0;
  state.shake = 0;
  state.particles = [];
  state.bullets = [];
  state.enemies = [];
  state.items = [];
  state.spawnTimer = 95;
  state.tank = new PlayerTank(W / 2, GROUND - 30);
  state.message = '';
}

function spawnWave() {
  const t = state.frame;
  const difficulty = 1 + (ROUND_SECONDS - state.timeLeft) / 45;

  const roll = Math.random();
  if (roll < 0.55) {
    const fromLeft = Math.random() < 0.5;
    const e = new DemandEnemy(fromLeft ? -20 : W + 20, GROUND - 15);
    e.speed *= difficulty;
    state.enemies.push(e);
  } else if (roll < 0.85) {
    state.enemies.push(new MeetingEnemy(rand(120, W - 120), rand(90, 240)));
  } else {
    const fromLeft = Math.random() < 0.5;
    state.enemies.push(new PotEnemy(
      fromLeft ? -30 : W + 30,
      GROUND - 220,
      (fromLeft ? 1 : -1) * rand(2.6, 4.2) * difficulty,
      rand(-3.6, -1.6)
    ));
  }
}

// ---------- 更新 ----------
function update() {
  state.frame++;

  if (state.mode === 'playing') {
    state.timeLeft -= 1 / 60;
    if (state.timeLeft <= 0) {
      state.timeLeft = 0;
      state.mode = 'win';
    }
    state.spawnTimer--;
    if (state.spawnTimer <= 0) {
      spawnWave();
      const pressure = clamp((ROUND_SECONDS - state.timeLeft) / ROUND_SECONDS, 0, 1);
      state.spawnTimer = Math.round(lerp(105, 52, pressure));
    }
  }

  if (state.tank) state.tank.update(input);

  // 子弹
  for (const b of state.bullets) b.update();
  for (const b of state.bullets) {
    if (b.dead) continue;
    if (b.owner === 'player') {
      for (const e of state.enemies) {
        if (e.dead) continue;
        if (hitCircle(b, b.r, e, e.r)) {
          e.dead = true;
          b.dead = true;
          state.kills++;
          spawnDust(e.x, e.y, '#b5523b', 10);
          state.shake = Math.max(state.shake, 3);
          // 掉落
          if (Math.random() < 0.22) {
            state.items.push(new Item(e.x, e.y, Math.random() < 0.65 ? 'coffee' : 'fish'));
          }
          break;
        }
      }
    } else if (state.tank) {
      if (hitCircle(b, b.r, state.tank, 22)) {
        b.dead = true;
        state.tank.damage(8);
        state.shake = Math.max(state.shake, 5);
        spawnDust(state.tank.x, state.tank.y, '#c0392b', 8);
      }
    }
  }
  state.bullets = state.bullets.filter((b) => !b.dead);

  // 敌人
  const newBullets = [];
  for (const e of state.enemies) {
    if (e.kind === 'demand' && state.tank) e.update(state.tank);
    else if (e.kind === 'meeting' && state.tank) e.update(state.tank, (b) => newBullets.push(b));
    else if (e.kind === 'pot' && state.tank) e.update(state.tank);
    if (e.kind === 'demand' && e.dead && state.tank) {
      state.shake = Math.max(state.shake, 6);
      spawnDust(e.x, e.y, '#c0392b', 10);
    }
  }
  state.bullets.push(...newBullets);
  state.enemies = state.enemies.filter((e) => !e.dead);

  // 道具
  for (const it of state.items) it.update();
  for (const it of state.items) {
    if (it.dead || !state.tank) continue;
    if (hitCircle(it, it.r, state.tank, 24)) {
      it.dead = true;
      if (it.kind === 'coffee') {
        state.tank.hp = Math.min(state.tank.maxHp, state.tank.hp + 25);
        state.message = '续命一口';
      } else {
        state.tank.invincible = 180;
        state.message = '摸鱼 3 秒';
      }
      spawnDust(it.x, it.y, '#4b8a5a', 8);
    }
  }
  state.items = state.items.filter((it) => !it.dead);

  // 粒子
  for (const p of state.particles) {
    p.x += p.vx; p.y += p.vy; p.vy += 0.16; p.life--;
  }
  state.particles = state.particles.filter((p) => p.life > 0);

  // 死亡
  if (state.tank && state.tank.hp <= 0 && state.mode === 'playing') {
    state.mode = 'over';
    state.shake = 10;
    spawnDust(state.tank.x, state.tank.y, '#c0392b', 24);
  }

  if (state.shake > 0) state.shake *= 0.86;
}

// ---------- 绘制 ----------
function drawBackground() {
  // 白板底色 + 网格
  ctx.fillStyle = '#f3f2ec';
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = 'rgba(80,80,80,0.10)';
  ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 40) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }
  for (let y = 0; y < H; y += 40) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }

  // 地面
  ctx.strokeStyle = '#1c1c1c';
  ctx.lineWidth = 3;
  wobblyLine(ctx, 0, GROUND, W, GROUND, 12, 2.2);

  // 墙上的便利贴（潦草职场标语）
  const notes = [
    { x: 120, y: 150, txt: '本周必达', color: '#ffe27a' },
    { x: 340, y: 128, txt: '再改一版', color: '#a8d8ea' },
    { x: 650, y: 140, txt: '辛苦了', color: '#ffb3ba' },
    { x: 830, y: 210, txt: '对齐一下', color: '#c8e6a0' },
  ];
  for (const n of notes) {
    ctx.save();
    ctx.translate(n.x, n.y);
    ctx.rotate(rand(-0.06, 0.06));
    scratchFill(ctx, n.color);
    ctx.strokeStyle = 'rgba(0,0,0,.35)';
    ctx.lineWidth = 1.6;
    wobblyRect(ctx, -42, -22, 84, 44, 2);
    ctx.fill(); ctx.stroke();
    handText(ctx, n.txt, 0, 0, 15, '#333', 'center');
    ctx.restore();
  }
}

function drawHUD() {
  // 精神状态血条
  const barW = 260, barH = 18, bx = 24, by = 20;
  ctx.save();
  ctx.strokeStyle = '#1c1c1c'; ctx.lineWidth = 2.4;
  wobblyRect(ctx, bx, by, barW, barH, 1.8);
  ctx.stroke();

  if (state.tank) {
    const ratio = state.tank.hp / state.tank.maxHp;
    ctx.fillStyle = ratio > 0.5 ? '#4b8a5a' : ratio > 0.25 ? '#d08c2a' : '#c0392b';
    ctx.fillRect(bx + 2, by + 2, (barW - 4) * ratio, barH - 4);
  }
  handText(ctx, '精神状态', bx, by + barH + 16, 14, '#333');

  // 倒计时
  const secs = Math.ceil(state.timeLeft);
  handText(ctx, `还有 ${secs} 秒下班`, W - 24, by + 8, 20, '#222', 'right');

  // 击杀
  handText(ctx, `干掉了 ${state.kills} 个`, W - 24, by + 36, 15, '#666', 'right');

  // 提示
  if (state.message) handText(ctx, state.message, W / 2, 40, 18, '#4b8a5a', 'center');

  // 升力指示（炮管转速）
  if (state.tank) {
    const spin = Math.abs(state.tank.turretSpin) / MAX_SPIN;
    if (spin > 0.05) {
      ctx.fillStyle = 'rgba(72,104,143,0.5)';
      ctx.fillRect(W / 2 - 60, H - 18, 120 * spin, 6);
      handText(ctx, spin > 0.6 ? '起飞！' : '转起来', W / 2, H - 30, 13, '#48688f', 'center');
    }
  }
  ctx.restore();
}

function drawOverlay() {
  if (state.mode === 'playing') return;

  ctx.save();
  ctx.fillStyle = 'rgba(243,242,236,0.80)';
  ctx.fillRect(0, 0, W, H);

  if (state.mode === 'ready') {
    handText(ctx, '周一坦克', W / 2, 180, 52, '#222', 'center');
    handText(ctx, '一个打工人熬过工作日的解压小游戏', W / 2, 232, 18, '#555', 'center');
    handText(ctx, 'A / D 移动　　W 跳（可二段跳）', W / 2, 320, 20, '#222', 'center');
    handText(ctx, '← / → 转炮管——转快了会飞起来', W / 2, 358, 20, '#222', 'center');
    handText(ctx, '空格 开炮（后坐力会把自己弹飞）', W / 2, 396, 20, '#222', 'center');
    handText(ctx, '按 空格 开始', W / 2, 480, 22, '#b5523b', 'center');
  } else if (state.mode === 'over') {
    handText(ctx, '你倒下了', W / 2, 210, 48, '#c0392b', 'center');
    handText(ctx, `撑过了 ${ROUND_SECONDS - Math.ceil(state.timeLeft)} 秒，干掉了 ${state.kills} 个`, W / 2, 270, 20, '#555', 'center');
    handText(ctx, '按 R 再来一次', W / 2, 350, 22, '#222', 'center');
  } else if (state.mode === 'win') {
    handText(ctx, '下班了！', W / 2, 210, 52, '#4b8a5a', 'center');
    handText(ctx, `今天干掉了 ${state.kills} 个职场怪`, W / 2, 272, 22, '#555', 'center');
    handText(ctx, '按 R 再熬一天', W / 2, 350, 22, '#222', 'center');
  }
  ctx.restore();
}

function draw() {
  ctx.save();
  if (state.shake > 0.2) {
    ctx.translate(rand(-state.shake, state.shake), rand(-state.shake, state.shake));
  }

  drawBackground();

  for (const it of state.items) it.draw(ctx);
  for (const e of state.enemies) e.draw(ctx);
  for (const b of state.bullets) b.draw(ctx);
  if (state.tank && state.mode !== 'over') state.tank.draw(ctx);

  for (const p of state.particles) {
    ctx.globalAlpha = clamp(p.life / 30, 0, 1);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  ctx.restore();

  drawHUD();
  drawOverlay();
}

function loop() {
  update();
  draw();
  requestAnimationFrame(loop);
}

loop();
