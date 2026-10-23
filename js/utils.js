// 通用工具 + 潦草画风绘制helper
// 画风原则：线不直、位置有抖动、颜色脏一点。越潦草越对味。

const W = 960;
const H = 600;
const GROUND = H - 46;

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// 手抖：每次绘制都给一点点随机偏移，模拟手绘
function jitter(amount = 1.4) {
  return rand(-amount, amount);
}

// 潦草直线：把一条线拆成几段，每段端点抖一下
function wobblyLine(ctx, x1, y1, x2, y2, seg = 4, amp = 1.6) {
  ctx.beginPath();
  ctx.moveTo(x1 + jitter(amp), y1 + jitter(amp));
  for (let i = 1; i <= seg; i++) {
    const t = i / seg;
    ctx.lineTo(
      lerp(x1, x2, t) + jitter(amp),
      lerp(y1, y2, t) + jitter(amp)
    );
  }
  ctx.stroke();
}

// 潦草矩形：构建单条闭合路径，调用方可以 fill() 再 stroke()
function wobblyRect(ctx, x, y, w, h, amp = 1.8) {
  const corners = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
  const segs = 3;
  ctx.beginPath();
  let first = true;
  for (let i = 0; i < 4; i++) {
    const [x1, y1] = corners[i];
    const [x2, y2] = corners[(i + 1) % 4];
    for (let s = 0; s < segs; s++) {
      const t = s / segs;
      const px = lerp(x1, x2, t) + jitter(amp);
      const py = lerp(y1, y2, t) + jitter(amp);
      if (first) { ctx.moveTo(px, py); first = false; }
      else ctx.lineTo(px, py);
    }
  }
  ctx.closePath();
}

// 潦草圆：用多边形近似 + 每点抖动
function wobblyCircle(ctx, cx, cy, r, sides = 12, amp = 1.8) {
  ctx.beginPath();
  for (let i = 0; i <= sides; i++) {
    const a = (i / sides) * Math.PI * 2;
    const rr = r + jitter(amp);
    const px = cx + Math.cos(a) * rr;
    const py = cy + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();
}

// 手写体文字
function handText(ctx, text, x, y, size = 16, color = '#222', align = 'left') {
  ctx.save();
  ctx.font = `${size}px "Comic Sans MS", "PingFang SC", cursive`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + jitter(0.8), y + jitter(0.8));
  ctx.restore();
}

// 涂鸦感的填充色块（先填后描，边缘故意溢出）
function scratchFill(ctx, color) {
  ctx.fillStyle = color;
}

// 两点间角度
function angleTo(a, b) {
  return Math.atan2(b.y - a.y, b.x - a.x);
}

// 圆与圆碰撞
function hitCircle(a, ar, b, br) {
  return dist(a, b) < ar + br;
}
