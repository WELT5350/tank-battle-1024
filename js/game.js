// 主循环、输入、刷怪、HUD

const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('game'));
const ctx = canvas.getContext('2d');

const ROUND_SECONDS = 120; // 一局两分钟
const PHASE_BOUNDS = [40, 80]; // 40 秒后加压，80 秒后冲刺
const COMBO_WINDOW = 120; // 连击窗口：2 秒内再杀才算连上
const COMBO_MAX_MULT = 5; // 连击倍率上限
const SCORE_PER_KILL = 10; // 每杀一个的基础分
const LASER_FRAMES = 180; // 咖啡：激光持续 3 秒
const LASER_TICK = 5; // 激光每 5 帧结算一次伤害
const LASER_WIDTH = 16; // 激光判定宽度
const TIME_STOP_FRAMES = 300; // 年假：时间停止 5 秒
const MERGE_COUNT = 3; // 几只未读合体
const MERGE_RADIUS = 50; // 这几只之间的距离上限，太远不算一坨
const FLY_RAM_DAMAGE = 3; // 飞行撞击伤害
const RAM_COOLDOWN_FRAMES = 18; // 两次撞击间隔，防止贴脸连续判定
const POT_INTERVAL_FRAMES = 900; // 锅固定 15 秒飞进来一个
const RING_INTERVAL_FRAMES = 90; // 电话还活着时，多久响一次

const state = {
  mode: 'ready', // ready | playing | over | win
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
  ringTimer: 0,
  hpFlash: 0,
  hpPop: null,
  hpShown: 10,
  score: 0,
  combo: 0,
  comboTimer: 0,
  maxCombo: 0,
  comboPop: 0,
  phase: 1,
  board: [],
  isBest: false,
  recordRank: 0,
  prevBest: 0,
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

  if (handleGlobalKey(k)) return;

  if (k === 'a') input.left = true;
  if (k === 'd') input.right = true;
  if (k === 'w') input.up = true;
  if (k === 's') input.down = true;

  if (handleMenuKey(k)) return;
  if (k === ' ') handleSpace();
});

// F1 调试 / ESC 暂停 / M 静音：任何时候都有效
function handleGlobalKey(k) {
  if (k === 'f1') {
    state.debug = !state.debug;
    if (state.tank) Telemetry.log('debug_toggle', { on: state.debug });
    return true;
  }

  if (k === 'escape') {
    if (state.mode === 'playing') {
      state.mode = 'paused';
      Sfx.stopMusic();
    } else if (state.mode === 'paused') {
      state.mode = 'playing';
      Sfx.startMusic();
    }
    return true;
  }

  if (k === 'm') {
    const on = Sfx.toggle();
    if (on && state.mode === 'playing') Sfx.startMusic();
    if (!on) Sfx.stopMusic();
    state.message = on ? '声音开' : '声音关';
    return true;
  }

  return false;
}

// 不在对局中时：暂停页和结算页都靠 R 重开
function handleMenuKey(k) {
  if (state.mode === 'paused') {
    if (k === 'r') startGame();
    return true;
  }

  if (state.mode === 'ready' || state.mode === 'over' || state.mode === 'win') {
    if (k === 'r' || k === ' ' || k === 'enter') startGame();
    return true;
  }

  return false;
}

// 空格：单击跳跃，320ms 内双击且血够低就起飞
function handleSpace() {
  const t = state.tank;
  if (!t) return;

  const now = performance.now();
  if (now - state.lastSpaceAt < 320) {
    if (t.canFly() && t.startFlight()) {
      Telemetry.log('flight', { hp: t.hp });
      state.message = '画饼升天！无敌 10 秒';
      addShake(2.4);
    } else if (!t.flying && t.hp > 3) {
      state.message = '血量高于 3，飞不起来';
    }
  } else if (t.jump()) {
    spawnDust(t.x, t.y + 12, '#999');
  }
  state.lastSpaceAt = now;
}

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

// 激光从炮口射出，沿瞄准方向打到屏幕外
function laserBeam() {
  const t = state.tank;
  if (!t || t.laserTimer <= 0) return null;
  const ox = Math.cos(t.aimAngle);
  const oy = Math.sin(t.aimAngle);
  const x1 = t.x + ox * 26;
  const y1 = t.y - t.h * 0.2 + oy * 26;
  return { x1, y1, x2: x1 + ox * 900, y2: y1 + oy * 900 };
}

// ---------- 连击与分数 ----------
function comboMultiplier() {
  if (state.combo <= 0) return 1;
  return Math.min(1 + Math.floor((state.combo - 1) / 2), COMBO_MAX_MULT);
}

// 每次击杀都走这里：刷新连击、加分、更新纪录
function registerKill() {
  state.combo++;
  state.comboTimer = COMBO_WINDOW;
  state.comboPop = 12;
  if (state.combo > state.maxCombo) state.maxCombo = state.combo;
  state.score += SCORE_PER_KILL * comboMultiplier();
}

function updateCombo() {
  if (state.comboPop > 0) state.comboPop--;
  if (state.comboTimer > 0) {
    state.comboTimer--;
    if (state.comboTimer === 0) state.combo = 0;
  }
}

function resetCombo() {
  state.combo = 0;
  state.comboTimer = 0;
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
      x,
      y,
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
  state.ringTimer = 0;
  state.hpFlash = 0;
  state.hpPop = null;
  state.score = 0;
  state.combo = 0;
  state.comboTimer = 0;
  state.maxCombo = 0;
  state.comboPop = 0;
  state.phase = 1;
  state.isBest = false;
  state.recordRank = 0;
  state.board = Records.load();
  state.tank = new PlayerTank(W / 2, GROUND - 30);
  state.hpShown = state.tank.hp;
  Telemetry.reset();
  Telemetry.log('round_start');
  Sfx.startMusic();
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
  state.enemies.push(
    new PotEnemy(
      fromLeft ? -40 : W + 40,
      GROUND - 200,
      (fromLeft ? 1 : -1) * rand(2.0, 2.9) * difficulty,
      rand(-2.4, -1.4)
    )
  );
}

// ---------- 更新 ----------
// 一帧的推进拆成若干小步，每步只干一件事
function update() {
  if (state.mode === 'paused') return;
  state.frame++;

  const frozen = state.timeStop > 0;
  updateTimeStop(frozen);

  // 一局结束后世界就停住：怪不再动、电话不再响、子弹不再飞
  if (state.mode === 'over' || state.mode === 'win') {
    updateEffects();
    return;
  }

  if (!frozen) updateRound();
  updateTank(frozen);
  updateBullets(frozen);
  updateEnemies(frozen);
  updateItems();
  updateCombo();
  updateBossRing();
  updateEffects();
  checkPlayerDown();
}

// ---------- 时间停止 ----------
function updateTimeStop(frozen) {
  if (!frozen) return;
  state.timeStop--;
  if (state.timeStop === 0) {
    state.message = '年假用完，继续上班';
    Sfx.setMusicSpeed(1);
  }
}

// ---------- 回合：倒计时与刷怪 ----------
function updateRound() {
  if (state.mode !== 'playing') return;

  state.timeLeft -= 1 / 60;
  if (state.timeLeft <= 0) {
    state.timeLeft = 0;
    state.mode = 'win';
    saveRecord('win');
    Telemetry.log('win', { kills: state.kills });
    Sfx.stopMusic();
    Telemetry.finish({ result: 'win', kills: state.kills, hp: state.tank ? state.tank.hp : 0 });
    Sfx.play('win');
    return;
  }

  // 三个阶段：0—40 热身，40—80 加压，80—120 冲刺
  const elapsed = ROUND_SECONDS - state.timeLeft;
  const phase = elapsed < PHASE_BOUNDS[0] ? 1 : elapsed < PHASE_BOUNDS[1] ? 2 : 3;
  if (phase !== state.phase) {
    state.phase = phase;
    state.message = phase === 2 ? '需求开始堆上来了' : '快到下班时间，冲刺！';
    Sfx.play('phase');
    Telemetry.log('phase', { phase });
  }

  state.spawnTimer--;
  if (state.spawnTimer <= 0) {
    spawnWave();
    Telemetry.log('spawn');
    const pressure = clamp(elapsed / ROUND_SECONDS, 0, 1);
    state.spawnTimer = Math.round(lerp(112, 46, Math.pow(pressure, 1.4)));
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
    t.aimAngle = Math.atan2(state.mouse.y - (t.y - t.h * 0.2), state.mouse.x - t.x);
  }
  t.update(input);

  if (t.laserTimer > 0) updateLaser(t);
  if (t.flying) autoFireDuringFlight(t);
  if (frozen) crushFrozenEnemies(t);
  else if (t.flying) ramEnemies(t);
}

// 咖啡的激光：扫到的敌人每 5 帧掉 1 点
function updateLaser(t) {
  t.laserTimer--;
  if (state.frame % LASER_TICK !== 0) return;

  const beam = laserBeam();
  if (!beam) return;

  for (const e of state.enemies) {
    if (e.dead) continue;
    if (distToSegment(e.x, e.y, beam.x1, beam.y1, beam.x2, beam.y2) > e.r + LASER_WIDTH / 2) {
      continue;
    }
    e.hurt(1);
    spawnDust(e.x, e.y, '#c9a86a', 3);
    if (e.dead) {
      state.kills++;
      registerKill();
      killFeedback(e.x, e.y);
      Telemetry.log('kill', { kind: e.kind, by: 'laser' });
    }
  }
  Sfx.play('laserTick');
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
    if (e.dead) {
      state.kills++;
      registerKill();
      killFeedback(e.x, e.y);
      Telemetry.log('kill', { kind: e.kind, by: 'ram' });
    } else spawnDust(e.x, e.y, '#8a6a5a', 6);
  }
}

// 时停期间撞到谁就撞碎谁，否则碰到敌人完全没有反馈
function crushFrozenEnemies(t) {
  for (const e of state.enemies) {
    if (e.dead) continue;
    if (!hitCircle(t, 24, e, e.r)) continue;
    e.hurt(999);
    if (e.dead) {
      state.kills++;
      registerKill();
      killFeedback(e.x, e.y);
      Telemetry.log('kill', { kind: e.kind, by: 'crush' });
    }
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
          registerKill();
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
      state.items.push(new Item(e.x, e.y, 'leave')); // 夺命连环 call 必掉年假
    } else if (e.kind === 'meeting' && Math.random() < 0.22) {
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
    Sfx.play(it.kind === 'coffee' ? 'laser' : it.kind === 'leave' ? 'timestop' : 'pickup');
    if (it.kind === 'coffee') {
      t.laserTimer = LASER_FRAMES;
      state.message = '咖啡下肚，激光 3 秒';
    } else if (it.kind === 'fish') {
      t.hp = Math.min(t.maxHp, t.hp + 3);
      state.message = '摸鱼回血 +3';
    } else {
      state.timeStop = TIME_STOP_FRAMES;
      Sfx.setMusicSpeed(0.42);
      state.message = '一天年假！时间停止 5 秒';
      addShake(4);
    }
    spawnDust(it.x, it.y, '#7d9a7b', 8);
  }
  state.items = state.items.filter((it) => !it.dead);
}

// ---------- 电话铃 ----------
// 夺命连环 call 还在场时，每隔一阵子响一次
function updateBossRing() {
  const alive = state.enemies.some((e) => e.kind === 'boss' && !e.dead);
  if (!alive) {
    state.ringTimer = 0;
    return;
  }
  if (state.ringTimer > 0) {
    state.ringTimer--;
    return;
  }
  Sfx.play('ring');
  state.ringTimer = RING_INTERVAL_FRAMES;
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

  // 激光：一条带抖动的亮线
  const beam = laserBeam();
  if (beam) {
    ctx.save();
    ctx.lineCap = 'round';
    const flick = 0.75 + Math.random() * 0.25;

    ctx.strokeStyle = `rgba(201,168,106,${0.35 * flick})`;
    ctx.lineWidth = 14;
    wobblyLine(ctx, beam.x1, beam.y1, beam.x2, beam.y2, 12, 1.6);

    ctx.strokeStyle = `rgba(255,241,196,${0.95 * flick})`;
    ctx.lineWidth = 4;
    wobblyLine(ctx, beam.x1, beam.y1, beam.x2, beam.y2, 12, 1.2);

    ctx.fillStyle = '#fff6d8';
    ctx.beginPath();
    ctx.arc(beam.x1, beam.y1, 6 + Math.random() * 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  for (const p of state.pops) {
    p.r += 1.6;
    p.life--;
  }
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

  // 血量变化检测：任何来源的掉血都会触发血条反馈
  if (t) {
    if (t.hp < state.hpShown) {
      state.hpFlash = 26;
      state.hpPop = { n: state.hpShown - t.hp, life: 46, max: 46 };
      addShake(1.8);
      t.damageBlink = 18;
      resetCombo();
    }
    state.hpShown = t.hp;
  }
  if (state.hpFlash > 0) state.hpFlash--;
  if (state.hpPop && state.hpPop.life > 0) state.hpPop.life--;

  if (state.message && state.frame % 220 === 0) state.message = '';
}

function checkPlayerDown() {
  const t = state.tank;
  if (!t || t.hp > 0 || state.mode !== 'playing') return;
  state.mode = 'over';
  state.shake = 9;
  saveRecord('over');
  Telemetry.log('death', { kills: state.kills });
  Sfx.stopMusic();
  Sfx.play('boom');
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
  for (let x = 0; x < W; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  for (let y = 0; y < H; y += 40) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }

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
  ctx.save();
  drawHealthBar();
  drawFlightTimer();
  drawScorePanel();
  drawTimeStopBar();
  drawCombo();
  drawMessage();
  ctx.restore();
}

// 左上角：10 格精神状态，挨打时抖一下、闪一下
function drawHealthBar() {
  const bx = 24;
  const by = 22;
  const barW = 250;
  const barH = 18;
  const inset = 3;
  const innerW = barW - inset * 2;

  const t = state.tank;
  const hp = t ? t.hp : 10;
  const fill = hp <= 3 ? '#b5736a' : hp <= 5 ? '#c9a86a' : '#7d9a7b';
  const flash = state.hpFlash > 0 ? state.hpFlash / 26 : 0;
  const ratio = clamp(hp / 10, 0, 1);

  ctx.save();
  if (flash > 0) ctx.translate(rand(-3, 3) * flash, rand(-2, 2) * flash);

  ctx.strokeStyle = '#1c1c1c';
  ctx.lineWidth = 2.4 + flash * 1.8;
  sketchStroke(ctx, bx, by, barW, barH, 1.6);

  if (ratio > 0) {
    ctx.fillStyle = fill;
    ctx.fillRect(bx + inset, by + inset, innerW * ratio, barH - inset * 2);
  }

  // 掉血瞬间：整条白闪一下，损失的那段标红
  if (flash > 0) {
    ctx.fillStyle = `rgba(255,255,255,${0.45 * flash})`;
    ctx.fillRect(bx + inset, by + inset, innerW * ratio, barH - inset * 2);

    const lost = state.hpPop ? state.hpPop.n / 10 : 0;
    if (lost > 0) {
      ctx.fillStyle = `rgba(181,115,106,${0.9 * flash})`;
      ctx.fillRect(bx + inset + innerW * ratio, by + inset, innerW * lost, barH - inset * 2);
    }
  }
  ctx.restore();

  handText(ctx, '精神状态', bx, by + barH + 16, 14, '#444');

  // 飘起来的扣血数字
  if (state.hpPop && state.hpPop.life > 0) {
    const k = state.hpPop.life / state.hpPop.max;
    ctx.save();
    ctx.globalAlpha = k;
    handText(
      ctx,
      `-${state.hpPop.n}`,
      bx + barW + 18,
      by + 14 - (1 - k) * 26,
      20,
      '#b5736a',
      'left'
    );
    ctx.restore();
  }
}

// 血条下面那条：画饼升天的剩余时间
function drawFlightTimer() {
  const t = state.tank;
  if (!t || !t.flying) return;

  const bx = 24;
  const y = 22 + 18 + 28;
  const fw = 150;
  const fr = clamp(t.flyTimer / FLY_FRAMES, 0, 1);

  ctx.strokeStyle = '#8a6a5a';
  ctx.lineWidth = 2;
  sketchStroke(ctx, bx, y, fw, 8, 1.2);
  ctx.fillStyle = '#d8b48f';
  ctx.fillRect(bx + 2, y + 2, (fw - 4) * fr, 4);
  handText(ctx, '画饼升天中', bx + fw + 10, y + 4, 13, '#8a6a5a', 'left');
}

// 右上角：倒计时、分数、击杀数
function drawScorePanel() {
  const secs = Math.ceil(state.timeLeft);
  const phaseTag = state.phase === 3 ? '（冲刺）' : '';

  handText(ctx, `还有 ${secs} 秒下班${phaseTag}`, W - 24, 24, 20, '#222', 'right');
  handText(ctx, `分数 ${state.score}　干掉 ${state.kills} 个`, W - 24, 50, 15, '#666', 'right');
}

// 顶部中间：年假的时间停止进度
function drawTimeStopBar() {
  if (state.timeStop <= 0) return;

  const fr = clamp(state.timeStop / TIME_STOP_FRAMES, 0, 1);
  ctx.strokeStyle = '#4a6a8a';
  ctx.lineWidth = 2;
  sketchStroke(ctx, W / 2 - 90, 66, 180, 8, 1.2);
  ctx.fillStyle = '#9db8cc';
  ctx.fillRect(W / 2 - 88, 68, 176 * fr, 4);
  handText(ctx, '年假中 · 时间停止', W / 2, 88, 14, '#4a6a8a', 'center');
}

// 坦克头顶：连击数与倍率
function drawCombo() {
  if (state.combo < 2) return;

  const t = state.tank;
  const pop = state.comboPop > 0 ? 1 + (state.comboPop / 12) * 0.45 : 1;
  const mult = comboMultiplier();

  ctx.save();
  ctx.translate(t ? t.x : W / 2, t ? Math.max(t.y - 62, 96) : 470);
  ctx.scale(pop, pop);
  handText(ctx, `${state.combo} 连击`, 0, 0, 18, '#b5736a', 'center');
  if (mult > 1) handText(ctx, `×${mult}`, 0, -24, 15, '#c9a86a', 'center');
  ctx.restore();
}

function drawMessage() {
  if (state.message) handText(ctx, state.message, W / 2, 44, 18, '#6d8a6d', 'center');
}

// 一局结束时写进本地榜，返回本次是否破纪录
function saveRecord(result) {
  const entry = {
    score: state.score,
    kills: state.kills,
    combo: state.maxCombo,
    hp: state.tank ? state.tank.hp : 0,
    result,
    at: Date.now(),
  };
  const prevBest = bestScore();
  const res = Records.submit(entry);
  state.board = res.board;
  state.isBest = res.isBest;
  state.recordRank = res.rank;
  state.prevBest = prevBest;
  return res;
}

function bestScore() {
  const b = Records.best();
  return b ? b.score : 0;
}

// 结算评价：熬到下班才有机会拿 S
function rankOf(survived) {
  const s = state.score;
  if (survived && s >= 1400) return 'S';
  if (survived && s >= 900) return 'A';
  if (s >= 500) return 'B';
  return 'C';
}

// 结算页那行纪录文案
function recordLine() {
  if (state.isBest) {
    return state.prevBest > 0 ? `新纪录！上次最高 ${state.prevBest}` : '新纪录！这是第一局';
  }
  const best = bestScore();
  if (state.recordRank > 0) return `历史最高 ${best}　本次第 ${state.recordRank} 名`;
  return `历史最高 ${best}`;
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
    const extra = e.kind ? ` ${e.kind}` : e.by ? ` ${e.by}` : '';
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
    handText(ctx, '周一坦克', W / 2, 132, 52, '#222', 'center');
    handText(ctx, '一个打工人熬过两分钟工作日的解压小游戏', W / 2, 178, 17, '#555', 'center');

    // 本地最高分榜
    const board = Records.load();
    if (board.length) {
      handText(ctx, `历史最高 ${board[0].score}`, W / 2, 226, 19, '#8a6a5a', 'center');
      const tops = board.slice(0, 3);
      tops.forEach((r, i) => {
        const tag = r.result === 'win' ? '下班' : '倒下';
        handText(
          ctx,
          `${i + 1}. ${r.score} 分 · ${r.kills} 杀 · ${tag}`,
          W / 2,
          256 + i * 22,
          14,
          '#8a8080',
          'center'
        );
      });
    } else {
      handText(ctx, '还没有纪录，第一局就是你的', W / 2, 236, 15, '#999', 'center');
    }
    handText(ctx, 'A / D 移动　　空格 跳跃　　ESC 暂停', W / 2, 348, 19, '#222', 'center');
    handText(ctx, '鼠标 瞄准　　左键 开炮', W / 2, 384, 19, '#222', 'center');
    handText(ctx, '按 空格 开始', W / 2, 478, 22, '#b5736a', 'center');
  } else if (state.mode === 'over') {
    handText(ctx, '你倒下了', W / 2, 190, 48, '#b5736a', 'center');
    handText(ctx, rankOf(false), W / 2, 250, 44, '#8a6a5a', 'center');
    handText(
      ctx,
      `撑过 ${ROUND_SECONDS - Math.ceil(state.timeLeft)} 秒 · 干掉 ${state.kills} 个 · 最高 ${state.maxCombo} 连击`,
      W / 2,
      300,
      17,
      '#555',
      'center'
    );
    handText(ctx, `分数 ${state.score}`, W / 2, 336, 26, '#222', 'center');
    handText(ctx, recordLine(), W / 2, 372, 16, '#8a6a5a', 'center');
    handText(ctx, '按 R 再来一次', W / 2, 420, 22, '#222', 'center');
  } else if (state.mode === 'paused') {
    handText(ctx, '已暂停', W / 2, 240, 46, '#222', 'center');
    handText(ctx, '按 ESC 继续，按 R 重开', W / 2, 306, 20, '#555', 'center');
  } else if (state.mode === 'win') {
    handText(ctx, '下班了！', W / 2, 190, 52, '#7d9a7b', 'center');
    handText(ctx, rankOf(true), W / 2, 250, 44, '#8a6a5a', 'center');
    handText(
      ctx,
      `干掉 ${state.kills} 个 · 最高 ${state.maxCombo} 连击 · 剩 ${state.tank ? state.tank.hp : 0} 血`,
      W / 2,
      300,
      17,
      '#555',
      'center'
    );
    handText(ctx, `分数 ${state.score}`, W / 2, 336, 26, '#222', 'center');
    handText(ctx, recordLine(), W / 2, 372, 16, '#8a6a5a', 'center');
    handText(ctx, '按 R 再熬一天', W / 2, 420, 22, '#222', 'center');
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
  drawEntities();
  ctx.restore();

  drawMergeHints();
  drawLaser();
  drawPops();
  drawCrosshair();
  drawTimeStopOverlay();

  drawHUD();
  drawDebug();
  drawOverlay();
}

// 场景里所有会动的东西
function drawEntities() {
  for (const it of state.items) it.draw(ctx);
  for (const e of state.enemies) e.draw(ctx);
  for (const b of state.bullets) b.draw(ctx);
  if (state.tank && state.mode !== 'over') state.tank.draw(ctx);
  drawParticles();
}

function drawParticles() {
  for (const p of state.particles) {
    ctx.globalAlpha = clamp(p.life / 28, 0, 1);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

// 两只未读靠得够近时，双方身上泛起一圈脉动虚线——
// 不写字，但让人感觉到"要出事了"
function drawMergeHints() {
  const unread = state.enemies.filter(
    (e) => e.kind === 'demand' && !e.dead && e.x > 30 && e.x < W - 30
  );
  if (unread.length < 2) return;

  const charged = new Set();
  for (let i = 0; i < unread.length; i++) {
    for (let j = i + 1; j < unread.length; j++) {
      if (dist(unread[i], unread[j]) > MERGE_RADIUS) continue;
      charged.add(unread[i]);
      charged.add(unread[j]);
    }
  }

  for (const e of charged) drawChargeRing(e);
}

function drawChargeRing(e) {
  const pulse = 0.5 + 0.5 * Math.sin(state.frame * 0.18);

  ctx.save();
  ctx.strokeStyle = `rgba(181,115,106,${0.25 + pulse * 0.6})`;
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 4]);
  ctx.lineDashOffset = -state.frame * 0.9;
  ctx.beginPath();
  ctx.arc(e.x, e.y, e.r + 7 + pulse * 3, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

// 咖啡的激光：外粗内亮两条，带一点随机闪烁
function drawLaser() {
  const beam = laserBeam();
  if (!beam) return;

  const flick = 0.75 + Math.random() * 0.25;

  ctx.save();
  ctx.lineCap = 'round';

  ctx.strokeStyle = `rgba(201,168,106,${0.35 * flick})`;
  ctx.lineWidth = 14;
  wobblyLine(ctx, beam.x1, beam.y1, beam.x2, beam.y2, 12, 1.6);

  ctx.strokeStyle = `rgba(255,241,196,${0.95 * flick})`;
  ctx.lineWidth = 4;
  wobblyLine(ctx, beam.x1, beam.y1, beam.x2, beam.y2, 12, 1.2);

  ctx.fillStyle = '#fff6d8';
  ctx.beginPath();
  ctx.arc(beam.x1, beam.y1, 6 + Math.random() * 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// 击杀时扩散的圈
function drawPops() {
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
}

function drawCrosshair() {
  if (state.mode !== 'playing' || (state.tank && state.tank.flying)) return;

  const m = state.mouse;
  ctx.save();
  ctx.strokeStyle = 'rgba(40,40,40,.55)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(m.x, m.y, 7, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(m.x - 11, m.y);
  ctx.lineTo(m.x - 3, m.y);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(m.x + 3, m.y);
  ctx.lineTo(m.x + 11, m.y);
  ctx.stroke();
  ctx.restore();
}

// 年假生效时压一层冷色和扫描线
function drawTimeStopOverlay() {
  if (state.timeStop <= 0) return;

  ctx.save();
  ctx.fillStyle = 'rgba(120,150,180,0.16)';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(70,100,130,0.10)';
  ctx.lineWidth = 1;
  for (let y = (state.frame * 2) % 8; y < H; y += 8) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
  ctx.restore();
}

// ---------- 主循环 ----------
// update 固定按 60Hz 推进，draw 跟着屏幕刷新率走。
// 这样在 120Hz 显示器上不会变成两倍速，低帧率时也不会瞬间追帧。
const STEP_MS = 1000 / 60;
const MAX_CATCHUP_STEPS = 5;

let lastTime = 0;
let accum = 0;
let crashed = null;

function loop(now) {
  try {
    const t = typeof now === 'number' ? now : performance.now();
    if (!lastTime) lastTime = t;
    let delta = t - lastTime;
    lastTime = t;

    // 切标签页回来时 delta 会很大，截断避免一口气补几百帧
    if (delta > 250) delta = STEP_MS;
    accum += delta;

    let steps = 0;
    while (accum >= STEP_MS && steps < MAX_CATCHUP_STEPS) {
      update();
      accum -= STEP_MS;
      steps++;
    }
    if (steps === MAX_CATCHUP_STEPS) accum = 0;

    draw();
  } catch (err) {
    crashed = err;
    drawCrashScreen(err);
    return; // 停掉循环，不再 requestAnimationFrame
  }

  requestAnimationFrame(loop);
}

// 出错时不要只留一个定格的画面
function drawCrashScreen(err) {
  try {
    ctx.save();
    ctx.fillStyle = 'rgba(243,242,236,0.96)';
    ctx.fillRect(0, 0, W, H);
    handText(ctx, '出错了', W / 2, 240, 42, '#b5736a', 'center');
    handText(ctx, '刷新页面重试', W / 2, 300, 20, '#222', 'center');
    const msg = err && err.message ? String(err.message).slice(0, 60) : '未知错误';
    handText(ctx, msg, W / 2, 340, 13, '#777', 'center');
    ctx.restore();
  } catch (ignored) {
    // 连报错画面都画不出来，就只能靠控制台了
  }
  if (typeof console !== 'undefined' && console.error) {
    console.error('[周一坦克] 运行出错，循环已停止：', err);
  }
}

if (typeof window !== 'undefined' && window.addEventListener) {
  window.addEventListener('error', (ev) => {
    console.error('[周一坦克] 未捕获的错误：', ev.error || ev.message);
  });
}

requestAnimationFrame(loop);
