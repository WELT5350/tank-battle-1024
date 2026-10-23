// 游戏实体：玩家坦克、子弹、职场怪、道具

const GRAVITY = 0.55;

// 玩法数值，集中在这里方便调
const MAX_HP = 10; // 精神状态上限
const FLY_FRAMES = 600; // 画饼升天持续帧数（10 秒 @60fps）
const JUMP_VELOCITY = -14.6;
const BULLET_SPEED = 12.5;
const POT_DAMAGE = 2; // 锅碰到扣的血
const POT_BOUNCE_SPEEDS = [5.4, 4.1, 3.0]; // 每次弹起的初速，逐次递减

class Bullet {
  constructor(x, y, vx, vy, owner) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.owner = owner; // 'player' | 'enemy'
    this.dead = false;
    this.life = 180;
    this.r = 4;
    this.homing = false; // 追踪弹
    this.target = null;
    this.turn = 0.052; // 每帧最大转向
  }
  update() {
    if (this.homing && this.target) {
      const want = Math.atan2(this.target.y - this.y, this.target.x - this.x);
      const cur = Math.atan2(this.vy, this.vx);
      let diff = want - cur;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const next = cur + clamp(diff, -this.turn, this.turn);
      const sp = Math.hypot(this.vx, this.vy) || 3.2;
      this.vx = Math.cos(next) * sp;
      this.vy = Math.sin(next) * sp;
    }
    this.x += this.vx;
    this.y += this.vy;
    if (!this.homing) this.vy += this.owner === 'enemy' ? 0.12 : 0.02;
    this.life--;
    if (this.life <= 0 || this.x < -40 || this.x > W + 40 || this.y > GROUND) this.dead = true;
  }
  draw(ctx) {
    if (this.homing) {
      ctx.save();
      ctx.strokeStyle = '#b5523b';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r + 2.4 + jitter(0.6), 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#8a3f30';
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r - 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }
    scratchFill(ctx, this.owner === 'player' ? '#222' : '#b5523b');
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r + jitter(0.8), 0, Math.PI * 2);
    ctx.fill();
  }
}

class PlayerTank {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.w = 46;
    this.h = 26;
    this.aimAngle = -Math.PI / 2;
    this.onGround = true;
    this.jumpsLeft = 1;
    this.hp = MAX_HP;
    this.maxHp = MAX_HP;
    this.invincible = 0;
    this.flying = false;
    this.flyTimer = 0;
    this.ramCd = 0;
  }

  update(input) {
    const ax = (input.right ? 1 : 0) - (input.left ? 1 : 0);

    if (this.flying) {
      const ay = (input.down ? 1 : 0) - (input.up ? 1 : 0);
      this.vx = this.vx * 0.93 + ax * 0.85;
      this.vy = this.vy * 0.93 + ay * 0.85;
      this.aimAngle += 0.36; // 炮管高速旋转
      this.flyTimer--;
      if (this.flyTimer <= 0) this.endFlight();
    } else {
      this.vx += ax * (this.onGround ? 0.9 : 0.35);
      this.vx *= this.onGround ? 0.82 : 0.97;
      this.vy += GRAVITY;
      if (!this.onGround) this.vy *= 0.95;
      this.vy = clamp(this.vy, -20, 16);
    }

    this.x += this.vx;
    this.y += this.vy;

    const floor = GROUND - this.h / 2;
    if (this.y >= floor) {
      this.y = floor;
      if (this.vy > 3) this.vy = -this.vy * 0.18;
      else this.vy = 0;
      if (!this.flying) {
        this.onGround = true;
        this.jumpsLeft = 1;
      }
    } else {
      this.onGround = false;
    }

    this.x = clamp(this.x, this.w / 2, W - this.w / 2);
    if (this.y < 40) {
      this.y = 40;
      this.vy = Math.max(this.vy, 0);
    }

    if (this.invincible > 0 && !this.flying) this.invincible--;
  }

  jump() {
    if (this.flying) return false;
    if (this.jumpsLeft > 0) {
      this.vy = JUMP_VELOCITY;
      this.jumpsLeft--;
      this.onGround = false;
      return true;
    }
    return false;
  }

  canFly() {
    return !this.flying && this.hp <= 3;
  }

  startFlight() {
    if (!this.canFly()) return false;
    this.flying = true;
    this.ramCd = 0;
    this.flyTimer = FLY_FRAMES;
    this.invincible = FLY_FRAMES;
    this.jumpsLeft = 1;
    return true;
  }

  endFlight() {
    this.flying = false;
    this.flyTimer = 0;
    this.ramCd = 0;
    this.invincible = 0;
    this.hp = Math.min(this.maxHp, this.hp + (1 + Math.floor(Math.random() * 3)));
  }

  fire() {
    const speed = BULLET_SPEED;
    const ox = Math.cos(this.aimAngle) * 30;
    const oy = Math.sin(this.aimAngle) * 30;
    const bx = this.x + ox;
    const by = this.y - this.h * 0.2 + oy;
    return new Bullet(
      bx,
      by,
      Math.cos(this.aimAngle) * speed,
      Math.sin(this.aimAngle) * speed,
      'player'
    );
  }

  damage(n) {
    if (this.invincible > 0 || this.flying) return;
    this.hp = Math.max(0, this.hp - n);
  }

  draw(ctx) {
    if (this.invincible > 0 && !this.flying && Math.floor(Date.now() / 90) % 2 === 0) return;

    const w = this.w,
      h = this.h;
    const bodyColor = '#c6c0ae';

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = '#1c1c1c';
    ctx.lineJoin = 'round';

    ctx.save();
    // 履带：宽大底座
    ctx.fillStyle = '#3a3a3a';
    ctx.fillRect(-w / 2, h * 0.04, w, h * 0.52);

    ctx.fillStyle = bodyColor;
    sketchRect(ctx, -w * 0.3, -h * 0.4, w * 0.6, h * 0.44, 1.6);
    ctx.restore();

    // 炮管：朝鼠标，不受翻滚影响
    ctx.save();
    ctx.translate(0, -h * 0.2);
    ctx.rotate(this.aimAngle);
    ctx.lineWidth = 4.4;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(28, 0);
    ctx.stroke();
    ctx.restore();

    // 炮塔
    ctx.fillStyle = '#b3ad9b';
    wobblyCircle(ctx, 0, -h * 0.2, 6.2, 9, 1.0);
    ctx.fill();
    ctx.stroke();

    // 眼睛
    ctx.fillStyle = '#1c1c1c';
    ctx.beginPath();
    ctx.arc(3.2, -h * 0.2, 1.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }
}

class Enemy {
  constructor(x, y, kind) {
    this.x = x;
    this.y = y;
    this.kind = kind;
    this.dead = false;
    this.r = 16;
    this.age = 0;
    this.hp = 1;
    this.labelOff = rand(-9, 9);
  }

  // 所有敌人共用的受伤接口：扣血，归零即死
  hurt(n) {
    this.hp -= n;
    if (this.hp <= 0) this.dead = true;
  }
}

// 临时需求：地面直冲，撞到掉血
class DemandEnemy extends Enemy {
  constructor(x, y) {
    super(x, y, 'demand');
    this.r = 15;
    this.vx = 0;
    this.speed = rand(1.0, 2.0);
  }
  update(player) {
    this.age++;
    const dir = Math.sign(player.x - this.x) || 1;
    this.vx = lerp(this.vx, dir * this.speed, 0.08);
    this.x += this.vx;
    this.y = GROUND - this.r + Math.sin(this.age * 0.2) * 2;
    if (hitCircle(this, this.r, player, 22)) {
      player.damage(1);
      this.dead = true;
    }
    if (this.x < -40 || this.x > W + 40) this.dead = true;
  }
  draw(ctx) {
    ctx.save();
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = '#1c1c1c';
    scratchFill(ctx, '#f0ece0');
    sketchRect(ctx, this.x - this.r, this.y - this.r * 0.7, this.r * 2, this.r * 1.4, 2);
    // 狂躁的眼睛
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(this.x - 5, this.y - 2, 3, 0, 7);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(this.x + 5, this.y - 2, 3, 0, 7);
    ctx.fill();
    ctx.fillStyle = '#111';
    ctx.beginPath();
    ctx.arc(this.x - 5, this.y - 2, 1.4, 0, 7);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(this.x + 5, this.y - 2, 1.4, 0, 7);
    ctx.fill();
    handText(ctx, '未读', this.x + this.labelOff, this.y - this.r - 9, 11, '#8a6a5a', 'center');
    ctx.restore();
  }
}

// 周会通知：空中盘旋，定期丢炸弹
class MeetingEnemy extends Enemy {
  constructor(x, y) {
    super(x, y, 'meeting');
    this.r = 17;
    this.baseY = y;
    this.phase = rand(0, Math.PI * 2);
    this.timer = rand(60, 130);
  }
  update(player, spawnBullet) {
    this.age++;
    this.phase += 0.02;
    this.x += Math.sin(this.phase) * 1.4;
    this.y = this.baseY + Math.cos(this.phase * 0.7) * 14;
    this.timer--;
    if (this.timer <= 0) {
      this.timer = rand(95, 165);
      const b = new Bullet(this.x, this.y + this.r, 0, 3.1, 'enemy');
      b.homing = true;
      b.target = player;
      spawnBullet(b);
    }
  }
  draw(ctx) {
    ctx.save();
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = '#1c1c1c';
    scratchFill(ctx, '#f0ece0');
    wobblyCircle(ctx, this.x, this.y, this.r, 9, 2);
    ctx.fill();
    ctx.stroke();
    // 时钟指针
    ctx.beginPath();
    ctx.moveTo(this.x, this.y);
    ctx.lineTo(this.x, this.y - 9);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(this.x, this.y);
    ctx.lineTo(this.x + 7, this.y + 3);
    ctx.stroke();
    handText(ctx, '催', this.x, this.y + this.r + 12, 14, '#555', 'center');
    ctx.restore();
  }
}

// 隔壁的锅：抛物线砸下来，落地炸开
class PotEnemy extends Enemy {
  constructor(x, y, vx, vy) {
    super(x, y, 'pot');
    this.r = 19;
    this.vx = vx;
    this.vy = vy;
    this.bounced = false;
    this.settled = false;
    this.restLife = 0;
    this.bounceLeft = POT_BOUNCE_SPEEDS.length;
  }
  update(player) {
    this.age++;

    // 已经落定的锅：谁踩上去就烫一下，锅也碎了
    if (this.settled) {
      this.restLife++;
      if (hitCircle(this, this.r, player, 22)) {
        player.damage(POT_DAMAGE);
        this.dead = true;
        return;
      }
      if (this.restLife > 420) this.dead = true;
      return;
    }

    // 弹跳阶段用较缓的重力，弹得慢一点，不会一下子砸下来
    this.vy += this.bounced ? GRAVITY * 0.5 : GRAVITY * 0.1;
    this.x += this.vx;
    this.y += this.vy;

    if (hitCircle(this, this.r, player, 22)) {
      player.damage(POT_DAMAGE);
      this.dead = true;
      return;
    }

    if (this.y > GROUND - this.r) {
      this.y = GROUND - this.r;
      if (this.bounceLeft > 0) {
        // 每弹一次高度递减，弹三次后彻底躺下
        this.bounced = true;
        this.vy = -POT_BOUNCE_SPEEDS[POT_BOUNCE_SPEEDS.length - this.bounceLeft];
        this.bounceLeft--;
        this.vx *= 0.6;
      } else {
        this.settled = true;
        this.vx = 0;
        this.vy = 0;
      }
    }

    if (this.x < -60 || this.x > W + 60) this.dead = true;
  }
  draw(ctx) {
    ctx.save();

    // 地面落点阴影：越接近地面越大越深，提前告诉玩家要落在哪
    const alt = clamp((GROUND - this.y) / 240, 0, 1);
    ctx.fillStyle = `rgba(60,60,60,${0.1 + (1 - alt) * 0.18})`;
    ctx.beginPath();
    ctx.ellipse(
      this.x,
      GROUND - 2,
      this.r * (1.4 - alt * 0.5),
      5 * (1.4 - alt * 0.5),
      0,
      0,
      Math.PI * 2
    );
    ctx.fill();

    ctx.lineWidth = 2.4;
    ctx.strokeStyle = '#1c1c1c';
    scratchFill(ctx, '#f0ece0');
    const r = this.settled ? this.r * 0.94 : this.r;
    wobblyCircle(ctx, this.x, this.y, r, 8, 2);
    ctx.fill();
    ctx.stroke();
    handText(ctx, '锅', this.x, this.y + 1, 15, '#333', 'center');
    ctx.restore();
  }
}

// 夺命连环 call：三只未读攒够了合体，15 血、攻击 3
class CallBoss extends Enemy {
  constructor(x, y) {
    super(x, y, 'boss');
    this.r = 26;
    this.hp = 10;
    this.maxHp = 10;
    this.speed = 1.35;
    this.vx = 0;
    this.hitCd = 0;
    this.flash = 0;
    this.label = '夺命连环call';
  }
  update(player) {
    this.age++;
    const dir = Math.sign(player.x - this.x) || 1;
    this.vx = lerp(this.vx, dir * this.speed, 0.06);
    this.x += this.vx;
    this.y = GROUND - this.r + Math.sin(this.age * 0.12) * 3;
    if (this.hitCd > 0) this.hitCd--;
    if (this.flash > 0) this.flash--;
    if (this.hitCd <= 0 && hitCircle(this, this.r + 2, player, 24)) {
      player.damage(3);
      this.hitCd = 55;
      this.vx *= -0.7;
    }
    if (this.x < -60 || this.x > W + 60) this.dead = true;
  }
  hurt(n) {
    super.hurt(n);
    this.flash = 6;
  }
  draw(ctx) {
    const shakeX = this.flash > 0 ? rand(-2, 2) : 0;
    ctx.save();
    ctx.translate(this.x + shakeX, this.y);
    ctx.lineWidth = 2.6;
    ctx.strokeStyle = '#1c1c1c';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // 两侧振铃声波
    const ringPhase = (this.age % 30) / 30;
    ctx.strokeStyle = '#8a6a5a';
    ctx.lineWidth = 2;
    for (let i = 0; i < 2; i++) {
      const rr = 7 + i * 7 + ringPhase * 9;
      ctx.globalAlpha = 1 - ringPhase * 0.8;
      ctx.beginPath();
      ctx.arc(-26, -2, rr, Math.PI * 0.55, Math.PI * 1.45);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(26, -2, rr, Math.PI * 1.55, Math.PI * 0.45);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // ---- 听筒本体：竖着立起来 ----
    // 手柄：一根轻微弯曲的粗柄
    ctx.beginPath();
    ctx.moveTo(0, -13);
    ctx.quadraticCurveTo(-8.5, 0, 0, 13);
    ctx.strokeStyle = '#1c1c1c';
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.stroke();

    // 上下两端的听筒 / 话筒：横向椭圆
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.translate(0, side * 17);
      ctx.rotate(side * 0.12);

      const pts = [];
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        pts.push([Math.cos(a) * 9.2, Math.sin(a) * 7.4]);
      }
      ctx.lineWidth = 2.6;
      scratchFill(ctx, '#efe9dc');
      sketchPoly(ctx, pts, 0.9);
      ctx.fill();
      ctx.stroke();

      // 网面纹路
      ctx.strokeStyle = 'rgba(60,60,60,0.5)';
      ctx.lineWidth = 1.3;
      for (let d = -3.6; d <= 3.6; d += 3.6) {
        ctx.beginPath();
        ctx.moveTo(d, -3);
        ctx.lineTo(d, 3);
        ctx.stroke();
      }
      ctx.restore();
    }

    // 血条
    ctx.lineWidth = 1.6;
    const bw = 48,
      bh = 5,
      bx = -24,
      by = -36;
    ctx.strokeRect(bx, by, bw, bh);
    ctx.fillStyle = '#b5736a';
    ctx.fillRect(bx + 1, by + 1, (bw - 2) * clamp(this.hp / this.maxHp, 0, 1), bh - 2);

    // 名字
    handText(ctx, this.label, 0, -48, 12, '#8a6a5a', 'center');

    ctx.restore();
  }
}

// 道具
class Item {
  constructor(x, y, kind) {
    this.x = x;
    this.y = y;
    this.kind = kind; // 'coffee' | 'fish'
    this.r = kind === 'leave' ? 17 : 13;
    this.dead = false;
    this.age = 0;
    this.vy = -2;
  }
  update() {
    this.age++;
    this.vy += GRAVITY * 0.6;
    this.y += this.vy;
    if (this.y > GROUND - this.r) {
      this.y = GROUND - this.r;
      this.vy = 0;
    }
    if (this.age > 600) this.dead = true;
  }
  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#1c1c1c';
    ctx.lineJoin = 'round';
    const bob = Math.sin(this.age * 0.1) * 0.8;
    ctx.translate(0, bob);

    if (this.kind === 'coffee') this.drawCup(ctx);
    else if (this.kind === 'fish') this.drawFish(ctx);
    else this.drawCalendar(ctx);

    ctx.restore();
  }

  // ---------- 咖啡杯 ----------
  drawCup(ctx) {
    scratchFill(ctx, '#e6d3b8');
    // 上宽下窄的杯身
    sketchPoly(
      ctx,
      [
        [-7, -7],
        [7, -7],
        [4.6, 8.5],
        [-4.6, 8.5],
      ],
      1.0
    );
    ctx.fill();
    ctx.stroke();

    // 杯把
    ctx.beginPath();
    ctx.arc(7.6, 0.5, 4.2, -Math.PI * 0.5, Math.PI * 0.5);
    ctx.stroke();

    // 液面
    handText(ctx, '', 0, 0, 1, '#333', 'center');
    ctx.beginPath();
    ctx.moveTo(-5.6, -3.4);
    ctx.lineTo(5.6, -3.4);
    ctx.stroke();

    // 热气
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(90,90,90,0.55)';
    for (const dx of [-3, 2.6]) {
      ctx.beginPath();
      ctx.moveTo(dx, -10);
      ctx.quadraticCurveTo(dx + 2.4, -13, dx, -16);
      ctx.stroke();
    }
  }

  // ---------- 小鱼 ----------
  drawFish(ctx) {
    scratchFill(ctx, '#cfe0c8');
    // 身体
    sketchPoly(
      ctx,
      [
        [-10, 0],
        [-4, -6.4],
        [4, -6.4],
        [10, 0],
        [4, 6.4],
        [-4, 6.4],
      ],
      1.0
    );
    ctx.fill();
    ctx.stroke();

    // 尾巴
    scratchFill(ctx, '#cfe0c8');
    sketchPoly(
      ctx,
      [
        [10, 0],
        [16.5, -5.4],
        [16.5, 5.4],
      ],
      1.1
    );
    ctx.fill();
    ctx.stroke();

    // 眼睛
    ctx.fillStyle = '#1c1c1c';
    ctx.beginPath();
    ctx.arc(-5.4, -1.4, 1.7, 0, Math.PI * 2);
    ctx.fill();

    // 鱼鳍
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-0.5, -6.2);
    ctx.quadraticCurveTo(0.5, -8.6, 3, -6.4);
    ctx.stroke();
  }

  // ---------- 日历 ----------
  drawCalendar(ctx) {
    // 纸体
    scratchFill(ctx, '#dfe8f0');
    sketchRect(ctx, -8.5, -7.5, 17, 16, 1.1);
    ctx.fill();
    ctx.stroke();

    // 顶部色带
    ctx.save();
    ctx.beginPath();
    ctx.rect(-8.5, -7.5, 17, 5);
    ctx.clip();
    ctx.fillStyle = '#b5736a';
    ctx.fillRect(-8.5, -7.5, 17, 5);
    ctx.restore();
    ctx.beginPath();
    ctx.moveTo(-8.5, -2.5);
    ctx.lineTo(8.5, -2.5);
    ctx.stroke();

    // 两个挂环
    ctx.beginPath();
    ctx.moveTo(-4, -7.5);
    ctx.lineTo(-4, -10.5);
    ctx.moveTo(4, -7.5);
    ctx.lineTo(4, -10.5);
    ctx.stroke();

    // 日期小格
    ctx.fillStyle = '#1c1c1c';
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 3; c++) {
        ctx.fillRect(-6 + c * 4.6, 0.4 + r * 4.2, 2.2, 2.2);
      }
    }
  }
}
