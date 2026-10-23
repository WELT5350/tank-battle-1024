// 主循环、输入、刷怪、HUD

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const ROUND_SECONDS = 90;      // 一局时长
const TIME_STOP_FRAMES = 300;  // 年假：时间停止 5 秒
const MERGE_COUNT = 3;         // 几只未读合体
const MERGE_RADIUS = 50;       // 这几只之间的距离上限，太远不算一坨
const FLY_RAM_DAMAGE = 3;      // 飞行撞击伤害
const RAM_COOLDOWN_FRAMES = 18; // 两次撞击间隔，防止贴脸连续判定
const POT_INTERVAL_FRAMES = 900; // 锅固定 15 秒飞进来一个

const state = {
  mode: 'ready',      // ready | playing | over | win
  timeLeft: ROUND_SECONDS,
  kills: 0,
  frame: 0,
  shake: 0,
  particles: [],
  pops: [],
  bullets: [],
  enemies: [],
  items: [],
  spawnTimer: 0,
  tank: null,
  message: '',
  mouse: { x: 480, y: 300 },
  lastSpaceAt: 0,
  timeStop: 0,
  potTimer: 900,
  debug: false,
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
  const p = toCanvas(e);
  state.mouse.x = p.x;
  state.mouse.y = p.y;
  if (state.mode !== 'playing' || !state.tank) return;
  shoot();
});

canvas.addEventListener('contextmenu', (e) => e.preventDefault());

function shoot() {
  const t = state.tank;
  if (!t) return;
  if (state.frame - (t.lastShotFrame || 0) < 3) return;
  t.lastShotFrame = state.frame;
  state.bullets.push(t.fire());
  addShake(0.5);
  spawnDust(t.x, t.y - 6, '#8a8a8a', 2);
}

// ---------- 键盘 ----------
window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (['a', 'd', 'w', 's', ' '].includes(k)) e.preventDefault();

  if (k === 'f1') {
    state.debug = !state.debug;
    if (state.tank) Telemetry.log('debug_toggle', { on: state.debug });
    return;
  }

  if (k === 'escape') {
    if (state.mode === 'playing') { state.mode = 'paused'; }
    else if (state.mode === 'paused') { state.mode = 'playing'; }
    return;
  }

  if (k === 'a') input.left = true;
  if (k === 'd') input.right = true;
  if (k === 'w') input.up = true;
  if (k === 's') input.down = true;

  if (state.mode === 'paused') {
    if (k === 'r') startGame();
    return;
  }

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
        Telemetry.log('flight', { hp: t.hp });
        state.message = '画饼升天！无敌 10 秒';
        addShake(2.4);
      } else if (!t.flying && t.hp > 5) {
        state.message = '血量高于 3，飞不起来';
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

// ---------- 击杀反馈 ----------
function killFeedback(x, y) {
  spawnDust(x, y, '#8a6a5a', 12);
  state.pops.push({ x, y, r: 8, life: 22, max: 22 });
  Sfx.play('kill');
}

// ---------- 抖动 ----------
// 满血完全不抖；血量越低，事件抖动才越明显
function shakeFactor() {
  const t = state.tank;
  if (!t || state.mode !== 'playing') return 0;
  if (t.hp >= 10) return 0;
  if (t.hp >= 7) return 0.35;
  if (t.hp >= 4) return 0.7;
  return 1;
}

function addShake(amount) {
  const v = amount * shakeFactor();
  if (v > state.shake) state.shake = v;
}

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
  state.pops = [];
  state.bullets = [];
  state.enemies = [];
  state.items = [];
  state.spawnTimer = 95;
  state.message = '';
  state.lastSpaceAt = 0;
  state.timeStop = 0;
  state.potTimer = POT_INTERVAL_FRAMES;
  state.tank = new PlayerTank(W / 2, GROUND - 30);
  Telemetry.reset();
  Telemetry.log('round_start');
}

function spawnWave() {
  const difficulty = 1 + (ROUND_SECONDS - state.timeLeft) / 45;
  if (Math.random() < 0.62) {
    const fromLeft = Math.random() < 0.5;
    const e = new DemandEnemy(fromLeft ? -20 : W + 20, GROUND - 15);
    e.speed *= difficulty;
    state.enemies.push(e);
  } else {
    state.enemies.push(new MeetingEnemy(rand(120, W - 120), rand(90, 240)));
  }
}

// 锅单独走固定节奏，15 秒来一个
function spawnPot() {
  const difficulty = 1 + (ROUND_SECONDS - state.timeLeft) / 45;
  const fromLeft = Math.random() < 0.5;
  state.enemies.push(new PotEnemy(
    fromLeft ? -40 : W + 40,
    GROUND - 200,
    (fromLeft ? 1 : -1) * rand(2.0, 2.9) * difficulty,
    rand(-2.4, -1.4)
  ));
}

// ---------- 更新 ----------
// 一帧的推进拆成若干小步，每步只干一件事
function update() {
  if (state.mode === 'paused') return;
  state.frame++;

  const frozen = state.timeStop > 0;
  updateTimeStop(frozen);
  if (!frozen) updateRound();
  updateTank(frozen);
  updateBullets(frozen);
  updateEnemies(frozen);
  updateItems();
  updateEffects();
  checkPlayerDown();
}

// ---------- 时间停止 ----------
function updateTimeStop(frozen) {
  if (!frozen) return;
  state.timeStop--;
  if (state.timeStop === 0) state.message = '年假用完，继续上班';
}

// ---------- 回合：倒计时与刷怪 ----------
function updateRound() {
  if (state.mode !== 'playing') return;

  state.timeLeft -= 1 / 60;
  if (state.timeLeft <= 0) {
    state.timeLeft = 0;
    state.mode = 'win';
    Telemetry.log('win', { kills: state.kills });
    Telemetry.finish({ result: 'win', kills: state.kills, hp: state.tank ? state.tank.hp : 0 });
    Sfx.play('win');
    return;
  }

  state.spawnTimer--;
  if (state.spawnTimer <= 0) {
    spawnWave();
    Telemetry.log('spawn');
    const pressure = clamp((ROUND_SECONDS - state.timeLeft) / ROUND_SECONDS, 0, 1);
    state.spawnTimer = Math.round(lerp(105, 52, pressure));
  }

  state.potTimer--;
  if (state.potTimer <= 0) {
    spawnPot();
    Telemetry.log('pot_spawn');
    state.potTimer = POT_INTERVAL_FRAMES;
  }
}

// ---------- 玩家 ----------
function updateTank(frozen) {
  const t = state.tank;
  if (!t) return;

  if (!t.flying) {
    t.aimAngle = Math.atan2(state.mouse.y - (t.y - t.h * 0.20), state.mouse.x - t.x);
  }
  t.update(input);

  if (t.flying) autoFireDuringFlight(t);
  if (frozen) crushFrozenEnemies(t);
  else if (t.flying) ramEnemies(t);
}

// 起飞时炮管自动连射
function autoFireDuringFlight(t) {
  t.autoFire = (t.autoFire || 0) - 1;
  if (t.autoFire > 0) return;
  t.autoFire = 4;
  state.bullets.push(t.fire());
  Sfx.play('shoot');
  addShake(0.6);
}

// 飞行撞击按伤害算，且有冷却，否则贴着 boss 一帧就能把它撞没
function ramEnemies(t) {
  if (t.ramCd > 0) t.ramCd--;
  for (const e of state.enemies) {
    if (e.dead || t.ramCd > 0) continue;
    if (!hitCircle(t, 24, e, e.r + 6)) continue;
    e.hurt(FLY_RAM_DAMAGE);
    t.ramCd = RAM_COOLDOWN_FRAMES;
    addShake(1.4);
    if (e.dead) { state.kills++; killFeedback(e.x, e.y); Telemetry.log('kill', { kind: e.kind, by: 'ram' }); }
    else spawnDust(e.x, e.y, '#8a6a5a', 6);
  }
}

// 时停期间撞到谁就撞碎谁，否则碰到敌人完全没有反馈
function crushFrozenEnemies(t) {
  for (const e of state.enemies) {
    if (e.dead) continue;
    if (!hitCircle(t, 24, e, e.r)) continue;
    e.hurt(999);
    if (e.dead) { state.kills++; killFeedback(e.x, e.y); Telemetry.log('kill', { kind: e.kind, by: 'crush' }); }
    addShake(1.2);
  }
}

// ---------- 子弹 ----------
function updateBullets(frozen) {
  for (const b of state.bullets) {
    if (!(frozen && b.owner === 'enemy')) b.update();
  }
  resolveBulletHits();
  cancelOpposingBullets();
  state.bullets = state.bullets.filter((b) => !b.dead);
}

function resolveBulletHits() {
  const t = state.tank;
  for (const b of state.bullets) {
    if (b.dead) continue;

    if (b.owner === 'player') {
      for (const e of state.enemies) {
        if (e.dead || !hitCircle(b, b.r, e, e.r)) continue;
        b.dead = true;
        e.hurt(1);
        spawnDust(b.x, b.y, '#8a6a5a', 4);
        if (e.dead) {
          state.kills++;
          killFeedback(e.x, e.y);
          Telemetry.log('kill', { kind: e.kind });
          addShake(1.2);
        } else {
          Sfx.play('hit');
        }
        break;
      }
    } else if (t && hitCircle(b, b.r, t, 22)) {
      b.dead = true;
      t.damage(1);
      Telemetry.log('damage', { by: 'bullet', hp: t.hp });
      Sfx.play('hurt');
      addShake(2.0);
      spawnDust(t.x, t.y, '#b5736a', 8);
    }
  }
}

// 玩家子弹和敌方子弹相撞，双方一起消失
function cancelOpposingBullets() {
  for (const pb of state.bullets) {
    if (pb.dead || pb.owner !== 'player') continue;
    for (const eb of state.bullets) {
      if (eb.dead || eb.owner !== 'enemy') continue;
      if (!hitCircle(pb, pb.r + 2, eb, eb.r + 2)) continue;
      pb.dead = true;
      eb.dead = true;
      Sfx.play('hit');
      spawnDust((pb.x + eb.x) / 2, (pb.y + eb.y) / 2, '#8a6a5a', 7);
      addShake(0.8);
      break;
    }
  }
}

// ---------- 敌人 ----------
function updateEnemies(frozen) {
  const t = state.tank;

  if (!frozen) {
    const spawned = [];
    for (const e of state.enemies) {
      if (e.kind === 'meeting' && t) e.update(t, (b) => spawned.push(b));
      else if (t) e.update(t);

      if (e.kind === 'demand' && e.dead && t) {
        addShake(2.4);
        spawnDust(e.x, e.y, '#b5736a', 10);
      }
    }
    state.bullets.push(...spawned);
  }

  dropLoot();
  state.enemies = state.enemies.filter((e) => !e.dead);
  tryMergeUnread();
}

// 掉落统一结算，不管是子弹打死、撞死还是被时停撞碎
function dropLoot() {
  for (const e of state.enemies) {
    if (!e.dead || e.dropDone) continue;
    e.dropDone = true;

    if (e.kind === 'boss') {
      state.items.push(new Item(e.x, e.y, 'leave'));   // 夺命连环 call 必掉年假
    } else if (e.kind === 'meeting' && Math.random() < 0.38) {
      state.items.push(new Item(e.x, e.y, Math.random() < 0.65 ? 'coffee' : 'fish'));
    }
    // 地面的未读和锅不掉落
  }
}

// 三只未读挤成一堆就合体
function tryMergeUnread() {
  const unread = state.enemies.filter(
    (e) => e.kind === 'demand' && !e.dead && e.x > 30 && e.x < W - 30
  );
  if (unread.length < MERGE_COUNT) return;

  let picked = null;
  for (const anchor of unread) {
    const near = unread
      .filter((e) => e !== anchor && dist(anchor, e) <= MERGE_RADIUS)
      .sort((a, b) => dist(anchor, a) - dist(anchor, b));
    if (near.length + 1 >= MERGE_COUNT) {
      picked = [anchor, ...near.slice(0, MERGE_COUNT - 1)];
      break;
    }
  }
  if (!picked) return;

  const cx = picked.reduce((a, e) => a + e.x, 0) / MERGE_COUNT;
  const cy = picked.reduce((a, e) => a + e.y, 0) / MERGE_COUNT;
  for (const e of picked) e.dead = true;
  state.enemies = state.enemies.filter((e) => !e.dead);
  state.enemies.push(new CallBoss(clamp(cx, 60, W - 60), cy));
  Telemetry.log('merge');
  state.message = '未读挤成一堆——夺命连环call！';
  Sfx.play('merge');
  addShake(3);
  spawnDust(cx, cy, '#8a6a5a', 16);
}

// ---------- 道具 ----------
function updateItems() {
  const t = state.tank;
  for (const it of state.items) {
    it.update();
    if (it.dead || !t || !hitCircle(it, it.r, t, 24)) continue;
    it.dead = true;
    Telemetry.log('pickup', { kind: it.kind });
    Sfx.play(it.kind === 'leave' ? 'timestop' : 'pickup');
    if (it.kind === 'coffee') {
      t.hp = Math.min(t.maxHp, t.hp + 3);
      state.message = '续命一口 +3';
    } else if (it.kind === 'fish') {
      t.invincible = Math.max(t.invincible, 180);
      state.message = '摸鱼 3 秒';
    } else {
      state.timeStop = TIME_STOP_FRAMES;
      state.message = '一天年假！时间停止 5 秒';
      addShake(4);
    }
    spawnDust(it.x, it.y, '#7d9a7b', 8);
  }
  state.items = state.items.filter((it) => !it.dead);
}

// ---------- 粒子与抖动 ----------
function updateEffects() {
  for (const p of state.particles) {
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.16;
    p.life--;
  }
  state.particles = state.particles.filter((p) => p.life > 0);

  for (const p of state.pops) { p.r += 1.6; p.life--; }
  state.pops = state.pops.filter((p) => p.life > 0);

  // 基础抖动四档：血越少抖越狠
  let baseShake = 0;
  const t = state.tank;
  if (t && state.mode === 'playing') {
    if (t.hp >= 10) baseShake = 0;
    else if (t.hp >= 7) baseShake = 0.45;
    else if (t.hp >= 4) baseShake = 1.1;
    else baseShake = 2.0;
    if (t.flying) baseShake *= 0.35;
  }
  state.shake = Math.max(state.shake * 0.86, baseShake);

  if (state.message && state.frame % 220 === 0) state.message = '';
}

function checkPlayerDown() {
  const t = state.tank;
  if (!t || t.hp > 0 || state.mode !== 'playing') return;
  state.mode = 'over';
  state.shake = 9;
  Telemetry.log('death', { kills: state.kills });
  Telemetry.finish({ result: 'over', kills: state.kills, timeLeft: Math.round(state.timeLeft) });
  Sfx.play('over');
  spawnDust(t.x, t.y, '#b5736a', 24);
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
    const fr = clamp(t.flyTimer / FLY_FRAMES, 0, 1);
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

  if (state.timeStop > 0) {
    const fr = clamp(state.timeStop / TIME_STOP_FRAMES, 0, 1);
    ctx.strokeStyle = '#4a6a8a';
    ctx.lineWidth = 2;
    sketchStroke(ctx, W / 2 - 90, 66, 180, 8, 1.2);
    ctx.fillStyle = '#9db8cc';
    ctx.fillRect(W / 2 - 88, 68, 176 * fr, 4);
    handText(ctx, '年假中 · 时间停止', W / 2, 88, 14, '#4a6a8a', 'center');
  }

  if (state.message) handText(ctx, state.message, W / 2, 44, 18, '#6d8a6d', 'center');

  ctx.restore();
}

// F1 调试面板：调难度时看这一屏就够了
function drawDebug() {
  if (!state.debug) return;
  const t = state.tank;
  const lines = [
    `闪烁 ${state.frame}  |  模式 ${state.mode}`,
    `血量 ${t ? t.hp : '-'}/10  |  击杀 ${state.kills}`,
    `剩余 ${Math.ceil(state.timeLeft)}s  |  时停 ${state.timeStop}`,
    `敌人 ${state.enemies.length}  |  子弹 ${state.bullets.length}`,
    `锅 ${state.potTimer} 帧后  |  起飞 ${t && t.flying ? t.flyTimer : '否'}`,
    '— 最近事件 —',
  ];
  for (const e of Telemetry.recent(6)) {
    const extra = e.kind ? ` ${e.kind}` : (e.by ? ` ${e.by}` : '');
    lines.push(`  ${e.t}s  ${e.type}${extra}`);
  }

  ctx.save();
  ctx.fillStyle = 'rgba(28,28,28,0.82)';
  ctx.fillRect(W - 268, 74, 250, 18 + lines.length * 15);
  ctx.fillStyle = '#e8e4d8';
  ctx.font = '11px monospace';
  ctx.textAlign = 'left';
  lines.forEach((line, i) => {
    ctx.fillText(line, W - 256, 92 + i * 15);
  });
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
    handText(ctx, 'A / D 移动　　空格 跳跃　　ESC 暂停', W / 2, 320, 19, '#222', 'center');
    handText(ctx, '鼠标 瞄准　　左键 开炮', W / 2, 356, 19, '#222', 'center');
    handText(ctx, '按 空格 开始', W / 2, 470, 22, '#b5736a', 'center');
  } else if (state.mode === 'over') {
    handText(ctx, '你倒下了', W / 2, 210, 48, '#b5736a', 'center');
    handText(ctx, `撑过了 ${ROUND_SECONDS - Math.ceil(state.timeLeft)} 秒，干掉了 ${state.kills} 个`, W / 2, 270, 20, '#555', 'center');
    handText(ctx, '按 R 再来一次', W / 2, 350, 22, '#222', 'center');
  } else if (state.mode === 'paused') {
    handText(ctx, '已暂停', W / 2, 240, 46, '#222', 'center');
    handText(ctx, '按 ESC 继续，按 R 重开', W / 2, 306, 20, '#555', 'center');
  } else if (state.mode === 'win') {
    handText(ctx, '下班了！', W / 2, 210, 52, '#7d9a7b', 'center');
    handText(ctx, `今天干掉了 ${state.kills} 个职场怪`, W / 2, 272, 22, '#555', 'center');
    handText(ctx, '按 R 再熬一天', W / 2, 350, 22, '#222', 'center');
  }
  ctx.restore();
}

function draw() {
  beginFrameJitter(state.frame);
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

  for (const p of state.pops) {
    const k = p.life / p.max;
    ctx.save();
    ctx.globalAlpha = k;
    ctx.strokeStyle = '#8a6a5a';
    ctx.lineWidth = 2 + k * 1.5;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  if (state.mode === 'playing' && !(state.tank && state.tank.flying)) {
    const m = state.mouse;
    ctx.save();
    ctx.strokeStyle = 'rgba(40,40,40,.55)';
    ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(m.x, m.y, 7, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(m.x - 11, m.y); ctx.lineTo(m.x - 3, m.y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(m.x + 3, m.y); ctx.lineTo(m.x + 11, m.y); ctx.stroke();
    ctx.restore();
  }

  if (state.timeStop > 0) {
    ctx.save();
    ctx.fillStyle = 'rgba(120,150,180,0.16)';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(70,100,130,0.10)';
    ctx.lineWidth = 1;
    for (let y = (state.frame * 2) % 8; y < H; y += 8) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
    ctx.restore();
  }

  drawHUD();
  drawDebug();
  drawOverlay();
}

function loop() {
  update();
  draw();
  requestAnimationFrame(loop);
}

loop();
