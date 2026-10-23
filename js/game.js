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
  mouse: { x: 480, y: 300, down: false },
  lastSpaceAt: 0,
};

const input = { left: false, right: false, up: false, down: false };

// ---------- 鼠标 ----------
function toCanvas(e) {
  const r = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - r.left) * (canvas.width / r.width),
    y: (e.clientY - r.top) * (canvas.height / r.height),
  };
}

canvas.addEventListener('mousemove', (e) => {
  const p = toCanvas(e);
  state.mouse.x = p.x;
  state.mouse.y = p.y;
});

canvas.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  e.preventDefault();
  state.mouse.down = true;
  const p = toCanvas(e);
  state.mouse.x = p.x;
  state.mouse.y = p.y;
  if (state.mode !== 'playing' || !state.tank) return;
  shoot();
});

window.addEventListener('mouseup', () => { state.mouse.down = false; });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

function shoot() {
  const t = state.tank;
  if (!t) return;
  if (state.frame - (t.lastShotFrame || 0) < 3) return;
  t.lastShotFrame = state.frame;
  state.bullets.push(t.fire());
  state.shake = Math.max(state.shake, 1.6);
  spawnDust(t.x, t.y - 6, '#8a8a8a', 2);
}

// ---------- 键盘 ----------
window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (['a', 'd', 'w', 's', ' '].includes(k)) e.preventDefault();

  if (k === 'a') input.left = true;
  if (k === 'd') input.right = true;
  if (k === 'w') input.up = true;
  if (k === 's') input.down = true;

  if (state.mode === 'ready' || state.mode === 'over' || state.mode === 'win') {
    if (k === 'r' || k === ' ' || k === 'enter') startGame();
    return;
  }

  if (k === ' ') {
    const t = state.tank;
    if (!t) return;
    const now = performance.now();
    if (now - state.lastSpaceAt < 320) {
      // 双击空格：5 血及以下进入旋转起飞
      if (t.canFly() && t.startFlight()) {
        state.message = '画饼升天！10 秒无敌';
        state.shake = Math.max(state.shake, 6);
      } else if (!t.flying && t.hp > 5) {
        state.message = '血量高于 5，飞不起来';
      }
    } else if (t.jump()) {
      spawnDust(t.x, t.y + 12, '#999');
    }
    state.lastSpaceAt = now;
  }
});

window.addEventListener('keyup', (e) => {
  const k = e.key.toLowerCase();
  if (k === 'a') input.left = false;
  if (k === 'd') input.right = false;
  if (k === 'w') input.up = false;
  if (k === 's') input.down = false;
});

// ---------- 粒子 ----------
function spawnDust(x, y, color = '#888', n = 6) {
  for (let i = 0; i < n; i++) {
    state.particles.push({
      x, y,
      vx: rand(-2.2, 2.2),
      vy: rand(-2.6, 0.4),
      life: rand(14, 30),
      color,
      size: rand(1.6, 3.2),
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
  state.message = '';
  state.lastSpaceAt = 0;
  state.tank = new PlayerTank(W / 2, GROUND - 30);
}

function spawnWave() {
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
    if (state.timeLeft <= 0) { state.timeLeft = 0; state.mode = 'win'; }
    state.spawnTimer--;
    if (state.spawnTimer <= 0) {
      spawnWave();
      const pressure = clamp((ROUND_SECONDS - state.timeLeft) / ROUND_SECONDS, 0, 1);
      state.spawnTimer = Math.round(lerp(105, 52, pressure));
    }
  }

  const t = state.tank;
  if (t) {
    t.aimAngle = Math.atan2(state.mouse.y - (t.y - t.h * 0.20), state.mouse.x - t.x);
    t.update(input);

    if (t.flying) {
      for (const e of state.enemies) {
        if (e.dead) continue;
        if (hitCircle(t, 24, e, e.r + 6)) {
          e.dead = true;
          state.kills++;
          state.shake = Math.max(state.shake, 4);
          spawnDust(e.x, e.y, '#8a6a5a', 12);
        }
      }
    }
  }

  for (const b of state.bullets) b.update();
  for (const b of state.bullets) {
    if (b.dead) continue;
    if (b.owner === 'player') {
      for (const e of state.enemies) {
        if (e.dead) continue;
        if (hitCircle(b, b.r, e, e.r)) {
          e.dead = true; b.dead = true; state.kills++;
          spawnDust(e.x, e.y, '#8a6a5a', 10);
          state.shake = Math.max(state.shake, 3);
          if (Math.random() < 0.22) {
            state.items.push(new Item(e.x, e.y, Math.random() < 0.65 ? 'coffee' : 'fish'));
          }
          break;
        }
      }
    } else if (t) {
      if (hitCircle(b, b.r, t, 22)) {
        b.dead = true;
        t.damage(1);
        state.shake = Math.max(state.shake, 5);
        spawnDust(t.x, t.y, '#b5736a', 8);
      }
    }
  }
  state.bullets = state.bullets.filter((b) => !b.dead);

  const newBullets = [];
  for (const e of state.enemies) {
    if (e.kind === 'demand' && t) e.update(t);
    else if (e.kind === 'meeting' && t) e.update(t, (b) => newBullets.push(b));
    else if (e.kind === 'pot' && t) e.update(t);
    if (e.kind === 'demand' && e.dead && t) {
      state.shake = Math.max(state.shake, 6);
      spawnDust(e.x, e.y, '#b5736a', 10);
    }
  }
  state.bullets.push(...newBullets);
  state.enemies = state.enemies.filter((e) => !e.dead);

  for (const it of state.items) it.update();
  for (const it of state.items) {
    if (it.dead || !t) continue;
    if (hitCircle(it, it.r, t, 24)) {
      it.dead = true;
      if (it.kind === 'coffee') { t.hp = Math.min(t.maxHp, t.hp + 3); state.message = '续命一口 +3'; }
      else { t.invincible = Math.max(t.invincible, 180); state.message = '摸鱼 3 秒'; }
      spawnDust(it.x, it.y, '#7d9a7b', 8);
    }
  }
  state.items = state.items.filter((it) => !it.dead);

  for (const p of state.particles) {
    p.x += p.vx; p.y += p.vy; p.vy += 0.16; p.life--;
  }
  state.particles = state.particles.filter((p) => p.life > 0);

  if (t && t.hp <= 0 && state.mode === 'playing') {
    state.mode = 'over';
    state.shake = 10;
    spawnDust(t.x, t.y, '#b5736a', 24);
  }

  if (state.shake > 0) state.shake *= 0.86;
  if (state.message && state.frame % 220 === 0) state.message = '';
}

// ---------- 绘制 ----------
function drawBackground() {
  ctx.fillStyle = '#f3f2ec';
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = 'rgba(80,80,80,0.10)';
  ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = 0; y < H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

  ctx.strokeStyle = '#1c1c1c';
  ctx.lineWidth = 3;
  wobblyLine(ctx, 0, GROUND, W, GROUND, 12, 2.2);

  const notes = [
    { x: 120, y: 150, txt: '本周必达', color: '#fbe98f' },
    { x: 340, y: 128, txt: '再改一版', color: '#bcdcea' },
    { x: 650, y: 140, txt: '辛苦了', color: '#f6c3c8' },
    { x: 830, y: 210, txt: '对齐一下', color: '#d3e5b0' },
  ];
  for (const n of notes) {
    ctx.save();
    ctx.translate(n.x, n.y);
    ctx.rotate(rand(-0.06, 0.06));
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = 'rgba(0,0,0,.35)';
    ctx.fillStyle = n.color;
    sketchRect(ctx, -42, -22, 84, 44, 2);
    handText(ctx, n.txt, 0, 0, 15, '#333', 'center');
    ctx.restore();
  }
}

function drawHUD() {
  const bx = 24, by = 22, barW = 250, barH = 18;
  ctx.save();

  const t = state.tank;
  const hp = t ? t.hp : 10;
  const fill = hp <= 3 ? '#b5736a' : hp <= 5 ? '#c9a86a' : '#7d9a7b';

  ctx.strokeStyle = '#1c1c1c';
  ctx.lineWidth = 2.4;
  sketchStroke(ctx, bx, by, barW, barH, 1.6);

  const inset = 3;
  const ratio = clamp(hp / 10, 0, 1);
  if (ratio > 0) {
    ctx.fillStyle = fill;
    ctx.fillRect(bx + inset, by + inset, (barW - inset * 2) * ratio, barH - inset * 2);
  }
  handText(ctx, '精神状态', bx, by + barH + 16, 14, '#444');

  if (t && t.flying) {
    const fr = clamp(t.flyTimer / 600, 0, 1);
    ctx.strokeStyle = '#8a6a5a';
    ctx.lineWidth = 2;
    const fw = 150;
    sketchStroke(ctx, bx, by + barH + 28, fw, 8, 1.2);
    ctx.fillStyle = '#d8b48f';
    ctx.fillRect(bx + 2, by + barH + 30, (fw - 4) * fr, 4);
    handText(ctx, '画饼升天中', bx + fw + 10, by + barH + 32, 13, '#8a6a5a', 'left');
  }

  const secs = Math.ceil(state.timeLeft);
  handText(ctx, `还有 ${secs} 秒下班`, W - 24, by + 2, 20, '#222', 'right');
  handText(ctx, `干掉了 ${state.kills} 个`, W - 24, by + 28, 15, '#666', 'right');

  if (state.message) handText(ctx, state.message, W / 2, 44, 18, '#6d8a6d', 'center');

  ctx.restore();
}

function drawOverlay() {
  if (state.mode === 'playing') return;
  ctx.save();
  ctx.fillStyle = 'rgba(243,242,236,0.80)';
  ctx.fillRect(0, 0, W, H);

  if (state.mode === 'ready') {
    handText(ctx, '周一坦克', W / 2, 150, 52, '#222', 'center');
    handText(ctx, '一个打工人熬过工作日的解压小游戏', W / 2, 200, 18, '#555', 'center');
    handText(ctx, 'A / D 左右移动　　W / S 起飞时上下移动', W / 2, 296, 19, '#222', 'center');
    handText(ctx, '空格 跳跃（空中可再跳一次）', W / 2, 332, 19, '#222', 'center');
    handText(ctx, '鼠标 转炮管　　左键 开炮（点得越快射得越快）', W / 2, 368, 19, '#222', 'center');
    handText(ctx, '血量 ≤5 时双击空格：画饼升天 10 秒，无敌，撞谁谁死', W / 2, 404, 18, '#8a6a5a', 'center');
    handText(ctx, '按 空格 开始', W / 2, 486, 22, '#b5736a', 'center');
  } else if (state.mode === 'over') {
    handText(ctx, '你倒下了', W / 2, 210, 48, '#b5736a', 'center');
    handText(ctx, `撑过了 ${ROUND_SECONDS - Math.ceil(state.timeLeft)} 秒，干掉了 ${state.kills} 个`, W / 2, 270, 20, '#555', 'center');
    handText(ctx, '按 R 再来一次', W / 2, 350, 22, '#222', 'center');
  } else if (state.mode === 'win') {
    handText(ctx, '下班了！', W / 2, 210, 52, '#7d9a7b', 'center');
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
    ctx.globalAlpha = clamp(p.life / 28, 0, 1);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.restore();

  if (state.mode === 'playing') {
    const m = state.mouse;
    ctx.save();
    ctx.strokeStyle = 'rgba(40,40,40,.55)';
    ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(m.x, m.y, 7, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(m.x - 11, m.y); ctx.lineTo(m.x - 3, m.y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(m.x + 3, m.y); ctx.lineTo(m.x + 11, m.y); ctx.stroke();
    ctx.restore();
  }

  drawHUD();
  drawOverlay();
}

function loop() {
  update();
  draw();
  requestAnimationFrame(loop);
}

loop();
