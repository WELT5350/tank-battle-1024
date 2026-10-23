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
    this.w = 46; this.h = 26;
    this.aimAngle = -Math.PI / 2;
    this.onGround = true;
    this.jumpsLeft = 2;
    this.hp = 10;
    this.maxHp = 10;
    this.invincible = 0;
    this.hurtFlash = 0;
    this.flying = false;
    this.flyTimer = 0;
  }

  update(input) {
    const ax = (input.right ? 1 : 0) - (input.left ? 1 : 0);

    if (this.flying) {
      const ay = (input.down ? 1 : 0) - (input.up ? 1 : 0);
      this.vx = this.vx * 0.93 + ax * 0.85;
      this.vy = this.vy * 0.93 + ay * 0.85;
      this.aimAngle += 0.36;   // 炮管高速旋转
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
      if (!this.flying) { this.onGround = true; this.jumpsLeft = 2; }
    } else {
      this.onGround = false;
    }

    this.x = clamp(this.x, this.w / 2, W - this.w / 2);
    if (this.y < 40) { this.y = 40; this.vy = Math.max(this.vy, 0); }

    if (this.invincible > 0 && !this.flying) this.invincible--;
    if (this.hurtFlash > 0) this.hurtFlash--;
  }

  jump() {
    if (this.flying) return false;
    if (this.jumpsLeft > 0) {
      this.vy = -14.6;
      this.jumpsLeft--;
      this.onGround = false;
      return true;
    }
    return false;
  }

  canFly() { return !this.flying && this.hp <= 5; }

  startFlight() {
    if (!this.canFly()) return false;
    this.flying = true;
    this.flyTimer = 600;       // 10 秒 @60fps
    this.invincible = 600;
    this.jumpsLeft = 2;
    return true;
  }

  endFlight() {
    this.flying = false;
    this.flyTimer = 0;
    this.invincible = 0;
    this.hp = Math.min(this.maxHp, this.hp + (1 + Math.floor(Math.random() * 3)));
  }

  fire() {
    const speed = 12.5;
    const ox = Math.cos(this.aimAngle) * 30;
    const oy = Math.sin(this.aimAngle) * 30;
    const bx = this.x + ox;
    const by = this.y - this.h * 0.20 + oy;
    return new Bullet(bx, by, Math.cos(this.aimAngle) * speed, Math.sin(this.aimAngle) * speed, 'player');
  }

  damage(n) {
    if (this.invincible > 0 || this.flying) return;
    this.hp = Math.max(0, this.hp - n);
    this.hurtFlash = 12;
  }

  draw(ctx) {
    if (this.invincible > 0 && !this.flying && Math.floor(Date.now() / 90) % 2 === 0) return;

    const w = this.w, h = this.h;
    const bodyColor = this.hurtFlash > 0 ? '#e3b7ae' : '#c6c0ae';

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
    sketchRect(ctx, -w * 0.30, -h * 0.40, w * 0.60, h * 0.44, 1.6);
    ctx.restore();

    // 炮管：朝鼠标，不受翻滚影响
    ctx.save();
    ctx.translate(0, -h * 0.20);
    ctx.rotate(this.aimAngle);
    ctx.lineWidth = 4.4;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(28, 0);
    ctx.stroke();
    ctx.restore();

    // 炮塔
    ctx.fillStyle = '#b3ad9b';
    wobblyCircle(ctx, 0, -h * 0.20, 6.2, 9, 1.0);
    ctx.fill(); ctx.stroke();

    // 眼睛
    ctx.fillStyle = '#1c1c1c';
    ctx.beginPath();
    ctx.arc(3.2, -h * 0.20, 1.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }
}


class Enemy {
  constructor(x, y, kind) {
    this.x = x; this.y = y;
    this.kind = kind;
    this.dead = false;
    this.r = 16;
    this.hp = 1;
    this.age = 0;
    this.labelOff = rand(-9, 9);
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
      player.damage(1);
      this.dead = true;
    }
    if (this.x < -40 || this.x > W + 40) this.dead = true;
  }
  draw(ctx) {
    ctx.save();
    ctx.lineWidth = 2.2; ctx.strokeStyle = '#1c1c1c';
    scratchFill(ctx, '#f0ece0');
    sketchRect(ctx, this.x - this.r, this.y - this.r * 0.7, this.r * 2, this.r * 1.4, 2);
    // 狂躁的眼睛
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(this.x - 5, this.y - 2, 3, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(this.x + 5, this.y - 2, 3, 0, 7); ctx.fill();
    ctx.fillStyle = '#111';
    ctx.beginPath(); ctx.arc(this.x - 5, this.y - 2, 1.4, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(this.x + 5, this.y - 2, 1.4, 0, 7); ctx.fill();
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
      spawnBullet(new Bullet(this.x, this.y + this.r, rand(-1.2, 1.2), 3.4, 'enemy'));
    }
  }
  draw(ctx) {
    ctx.save();
    ctx.lineWidth = 2.2; ctx.strokeStyle = '#1c1c1c';
    scratchFill(ctx, '#f0ece0');
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
      if (Math.abs(this.x - player.x) < 60) player.damage(1);
    }
    if (this.x < -60 || this.x > W + 60) this.dead = true;
  }
  draw(ctx) {
    ctx.save();
    ctx.lineWidth = 2.2; ctx.strokeStyle = '#1c1c1c';
    scratchFill(ctx, '#f0ece0');
    wobblyCircle(ctx, this.x, this.y, this.r, 8, 2);
    ctx.fill(); ctx.stroke();
    handText(ctx, '锅', this.x, this.y + 1, 13, '#333', 'center');
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
    scratchFill(ctx, this.kind === 'coffee' ? '#e6d3b8' : '#cfe0c8');
    sketchRect(ctx, this.x - this.r, this.y - this.r * 0.8, this.r * 2, this.r * 1.6, 1.8);
    handText(ctx, this.kind === 'coffee' ? '咖' : '摸', this.x, this.y, 13, '#333', 'center');
    ctx.restore();
  }
}
