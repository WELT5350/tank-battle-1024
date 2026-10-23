// 游戏实体：玩家坦克、子弹、职场怪、道具

const GRAVITY = 0.55;
const MAX_SPIN = 0.40;   // 炮管最大角速度
const LIFT_GAIN = 0.72;  // 转速拉满时的升力，只比重力大一点点，才是慢慢飘
const LIFT_THRESHOLD = 0.5; // 转速不到一半不产生升力，方便稳定瞄准

class Bullet {
  constructor(x, y, vx, vy, owner) {
    this.x = x; this.y = y;
    this.vx = vx; this.vy = vy;
    this.owner = owner;      // 'player' | 'enemy'
    this.dead = false;
    this.life = 180;
    this.r = 4;
  }
  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.vy += this.owner === 'enemy' ? 0.12 : 0.02;
    this.life--;
    if (this.life <= 0 || this.x < -40 || this.x > W + 40 || this.y > GROUND) this.dead = true;
  }
  draw(ctx) {
    scratchFill(ctx, this.owner === 'player' ? '#222' : '#b5523b');
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r + jitter(0.8), 0, Math.PI * 2);
    ctx.fill();
  }
}

class PlayerTank {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.vx = 0; this.vy = 0;
    this.w = 58; this.h = 34;
    this.turretAngle = -Math.PI / 2;
    this.turretSpin = 0;
    this.onGround = true;
    this.jumpsLeft = 2;
    this.hp = 100;
    this.maxHp = 100;
    this.invincible = 0;
    this.cooldown = 0;
    this.spinDir = 0;
    this.moveDir = 0;
    this.hurtFlash = 0;
  }

  get lift() {
    const s = Math.abs(this.turretSpin) / MAX_SPIN;
    if (s < LIFT_THRESHOLD) return 0;
    return ((s - LIFT_THRESHOLD) / (1 - LIFT_THRESHOLD)) * LIFT_GAIN;
  }

  update(input) {
    // 水平
    this.moveDir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const accel = this.onGround ? 0.9 : 0.35;
    this.vx += this.moveDir * accel;
    this.vx *= this.onGround ? 0.82 : 0.97;

    // 炮管旋转
    this.spinDir = (input.spinRight ? 1 : 0) - (input.spinLeft ? 1 : 0);
    if (this.spinDir !== 0) {
      this.turretSpin = clamp(this.turretSpin + this.spinDir * 0.055, -MAX_SPIN, MAX_SPIN);
    } else {
      this.turretSpin *= 0.94;
      if (Math.abs(this.turretSpin) < 0.004) this.turretSpin = 0;
    }
    this.turretAngle += this.turretSpin;

    // 竖直：重力 - 升力
    this.vy += GRAVITY - this.lift;
    // 空气阻力，让上浮和下坠都是缓慢可控的
    if (!this.onGround) this.vy *= 0.95;
    this.vy = clamp(this.vy, -6, 16);
    this.x += this.vx;
    this.y += this.vy;

    // 地面
    const floor = GROUND - this.h / 2;
    if (this.y >= floor) {
      this.y = floor;
      if (this.vy > 3) this.vy = -this.vy * 0.18; // 落地小弹一下
      else this.vy = 0;
      this.onGround = true;
      this.jumpsLeft = 2;
    } else {
      this.onGround = false;
    }

    // 边界
    this.x = clamp(this.x, this.w / 2, W - this.w / 2);
    if (this.y < 40) { this.y = 40; this.vy = Math.max(this.vy, 0); }

    if (this.invincible > 0) this.invincible--;
    if (this.cooldown > 0) this.cooldown--;
    if (this.hurtFlash > 0) this.hurtFlash--;
  }

  jump() {
    if (this.jumpsLeft > 0) {
      this.vy = -10.2;
      this.jumpsLeft--;
      this.onGround = false;
      return true;
    }
    return false;
  }

  fire() {
    if (this.cooldown > 0) return null;
    this.cooldown = 16;
    const speed = 12.5;
    const bx = this.x + Math.cos(this.turretAngle) * 34;
    const by = this.y + Math.sin(this.turretAngle) * 34;
    // 后坐力：把自己往反方向推
    this.vx -= Math.cos(this.turretAngle) * 3.6;
    this.vy -= Math.sin(this.turretAngle) * 3.6;
    return new Bullet(bx, by, Math.cos(this.turretAngle) * speed, Math.sin(this.turretAngle) * speed, 'player');
  }

  damage(n) {
    if (this.invincible > 0) return;
    this.hp = Math.max(0, this.hp - n);
    this.hurtFlash = 12;
  }

  draw(ctx) {
    if (this.invincible > 0 && Math.floor(Date.now() / 90) % 2 === 0) return;

    const w = this.w, h = this.h;
    const bodyColor = this.hurtFlash > 0 ? '#c0392b' : '#48688f';
    const tilt = clamp(this.vx * 0.012, -0.10, 0.10);

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(tilt);
    ctx.lineWidth = 2.6;
    ctx.strokeStyle = '#1c1c1c';
    ctx.lineJoin = 'round';

    // 履带底座
    ctx.fillStyle = '#2b2b2b';
    wobblyRect(ctx, -w / 2, h * 0.06, w, h * 0.42, 1.5);
    ctx.fill(); ctx.stroke();
    // 履带齿
    ctx.fillStyle = '#6a6a6a';
    for (let i = 0; i < 6; i++) {
      const tx = -w / 2 + 6 + i * ((w - 12) / 5);
      ctx.fillRect(tx - 2.5, h * 0.10, 5, h * 0.10);
      ctx.fillRect(tx - 2.5, h * 0.30, 5, h * 0.10);
    }

    // 车身
    ctx.fillStyle = bodyColor;
    wobblyRect(ctx, -w / 2 + 4, -h * 0.42, w - 8, h * 0.56, 1.8);
    ctx.fill(); ctx.stroke();

    // 车身高光
    ctx.strokeStyle = 'rgba(255,255,255,.45)';
    ctx.lineWidth = 2;
    wobblyLine(ctx, -w / 2 + 9, -h * 0.30, w / 2 - 12, -h * 0.34, 3, 1.0);

    // 炮管：绕炮塔旋转的粗矩形
    ctx.save();
    ctx.translate(0, -h * 0.22);
    ctx.rotate(this.turretAngle);
    ctx.strokeStyle = '#141414';
    ctx.lineWidth = 2.2;
    ctx.fillStyle = '#22354d';
    ctx.beginPath();
    ctx.rect(6, -5, 34, 10);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#0d0d0d';
    ctx.beginPath();
    ctx.rect(38, -4, 4, 8);
    ctx.fill();
    ctx.restore();

    // 炮塔
    ctx.strokeStyle = '#1c1c1c';
    ctx.lineWidth = 2.4;
    ctx.fillStyle = '#3b557a';
    wobblyCircle(ctx, 0, -h * 0.22, 11, 10, 1.3);
    ctx.fill(); ctx.stroke();

    // 打工人疲惫的眼睛
    ctx.fillStyle = '#f3f2ec';
    ctx.beginPath(); ctx.ellipse(6, -h * 0.22 - 1, 4.2, 3.4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#111';
    ctx.beginPath(); ctx.arc(7.4, -h * 0.22 - 1, 1.7, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#1c1c1c';
    ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(2, -h * 0.22 + 4); ctx.lineTo(10, -h * 0.22 + 4.6); ctx.stroke();

    ctx.restore();
  }
}

// 职场怪基类
class Enemy {
  constructor(x, y, kind) {
    this.x = x; this.y = y;
    this.kind = kind;
    this.dead = false;
    this.r = 16;
    this.hp = 1;
    this.age = 0;
    this.label = { demand: '临时需求', meeting: '周会通知', pot: '隔壁的锅' }[kind];
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
      player.damage(10);
      this.dead = true;
    }
    if (this.x < -40 || this.x > W + 40) this.dead = true;
  }
  draw(ctx) {
    ctx.save();
    ctx.lineWidth = 2.2; ctx.strokeStyle = '#1c1c1c';
    scratchFill(ctx, '#b5523b');
    wobblyRect(ctx, this.x - this.r, this.y - this.r * 0.7, this.r * 2, this.r * 1.4, 2);
    ctx.fill(); ctx.stroke();
    // 狂躁的眼睛
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(this.x - 5, this.y - 2, 3, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(this.x + 5, this.y - 2, 3, 0, 7); ctx.fill();
    ctx.fillStyle = '#111';
    ctx.beginPath(); ctx.arc(this.x - 5, this.y - 2, 1.4, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(this.x + 5, this.y - 2, 1.4, 0, 7); ctx.fill();
    handText(ctx, '！', this.x, this.y - this.r - 10, 15, '#b5523b', 'center');
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
      spawnBullet(new Bullet(this.x, this.y + this.r, rand(-1.2, 1.2), 3.4, 'enemy'));
    }
  }
  draw(ctx) {
    ctx.save();
    ctx.lineWidth = 2.2; ctx.strokeStyle = '#1c1c1c';
    scratchFill(ctx, '#6b6b8a');
    wobblyCircle(ctx, this.x, this.y, this.r, 9, 2);
    ctx.fill(); ctx.stroke();
    // 时钟指针
    ctx.beginPath(); ctx.moveTo(this.x, this.y); ctx.lineTo(this.x, this.y - 9); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(this.x, this.y); ctx.lineTo(this.x + 7, this.y + 3); ctx.stroke();
    handText(ctx, '催', this.x, this.y + this.r + 12, 14, '#555', 'center');
    ctx.restore();
  }
}

// 隔壁的锅：抛物线砸下来，落地炸开
class PotEnemy extends Enemy {
  constructor(x, y, vx, vy) {
    super(x, y, 'pot');
    this.r = 14;
    this.vx = vx; this.vy = vy;
    this.landed = false;
  }
  update(player) {
    this.age++;
    this.vy += GRAVITY * 0.85;
    this.x += this.vx;
    this.y += this.vy;
    if (hitCircle(this, this.r, player, 22)) {
      player.damage(13);
      this.dead = true;
      return;
    }
    if (this.y > GROUND - this.r) {
      this.dead = true;
      if (Math.abs(this.x - player.x) < 60) player.damage(10);
    }
    if (this.x < -60 || this.x > W + 60) this.dead = true;
  }
  draw(ctx) {
    ctx.save();
    ctx.lineWidth = 2.2; ctx.strokeStyle = '#1c1c1c';
    scratchFill(ctx, '#3a3a3a');
    wobblyCircle(ctx, this.x, this.y, this.r, 8, 2);
    ctx.fill(); ctx.stroke();
    handText(ctx, '锅', this.x, this.y + 1, 13, '#f3f2ec', 'center');
    ctx.restore();
  }
}

// 道具
class Item {
  constructor(x, y, kind) {
    this.x = x; this.y = y;
    this.kind = kind; // 'coffee' | 'fish'
    this.r = 13;
    this.dead = false;
    this.age = 0;
    this.vy = -2;
  }
  update() {
    this.age++;
    this.vy += GRAVITY * 0.6;
    this.y += this.vy;
    if (this.y > GROUND - this.r) { this.y = GROUND - this.r; this.vy = 0; }
    if (this.age > 600) this.dead = true;
  }
  draw(ctx) {
    ctx.save();
    ctx.lineWidth = 2; ctx.strokeStyle = '#1c1c1c';
    scratchFill(ctx, this.kind === 'coffee' ? '#8a5a2b' : '#4b8a5a');
    wobblyRect(ctx, this.x - this.r, this.y - this.r * 0.8, this.r * 2, this.r * 1.6, 1.8);
    ctx.fill(); ctx.stroke();
    handText(ctx, this.kind === 'coffee' ? '咖' : '摸', this.x, this.y, 13, '#f3f2ec', 'center');
    ctx.restore();
  }
}
