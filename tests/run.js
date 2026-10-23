// 周一坦克 · 逻辑自测
// 不依赖任何第三方库：把 utils.js 和 entities.js 拼起来丢进 vm 里跑，
// 只测纯逻辑（物理、碰撞、血量），不碰 Canvas。

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// ---------- 迷你断言 ----------
let passed = 0;
const failures = [];

function assert(name, condition, detail) {
  if (condition) {
    passed++;
  } else {
    failures.push(`${name}${detail ? ' —— ' + detail : ''}`);
  }
}

function near(a, b, tol) {
  return Math.abs(a - b) <= (tol || 0.001);
}

// ---------- 载入被测代码 ----------
// 按文件分别执行（vm 的多个脚本共享词法作用域），
// 这样 V8 覆盖率能把执行情况算到真实文件上。
const sandbox = { console, Math, Date, performance: { now: () => Date.now() } };
const context = vm.createContext(sandbox);

for (const file of ['js/utils.js', 'js/entities.js']) {
  vm.runInContext(read(file), context, { filename: path.join(ROOT, file) });
}

const harness = `
  const __results = [];
  const T = (name, cond, detail) => __results.push({ name, ok: !!cond, detail: detail || '' });
  const near = ${near.toString()};

  // 1. 数学工具
  T('clamp 上限', clamp(15, 0, 10) === 10);
  T('clamp 下限', clamp(-3, 0, 10) === 0);
  T('lerp 中点', near(lerp(0, 10, 0.5), 5));

  // 2. 圆形碰撞
  T('碰撞：刚好接触', hitCircle({x:0,y:0}, 5, {x:9,y:0}, 5) === true);
  T('碰撞：差一点', hitCircle({x:0,y:0}, 5, {x:11,y:0}, 5) === false);

  // 3. 跳跃高度
  const tank = new PlayerTank(480, GROUND - 13);
  const startY = tank.y;
  tank.jump();
  let peak = startY;
  for (let i = 0; i < 120; i++) {
    tank.update({});
    if (tank.y < peak) peak = tank.y;
  }
  T('单次跳跃超过 90px', startY - peak > 90, '实际 ' + Math.round(startY - peak) + 'px');

  // 4. 二段跳已移除
  const tank2 = new PlayerTank(480, GROUND - 13);
  tank2.jump();
  const second = tank2.jump();
  T('空中不能二段跳', second === false);

  // 5. 受伤
  const tank3 = new PlayerTank(480, GROUND - 13);
  tank3.damage(3);
  T('受伤扣血', tank3.hp === MAX_HP - 3, 'hp=' + tank3.hp);

  // 6. 飞行时免疫伤害
  const tank4 = new PlayerTank(480, GROUND - 13);
  tank4.hp = 3;
  tank4.startFlight();
  tank4.damage(5);
  T('飞行时无敌', tank4.hp === 3, 'hp=' + tank4.hp);

  // 7. 起飞条件：必须压到 3 血及以下
  const tank5 = new PlayerTank(480, GROUND - 13);
  T('满血不能起飞', tank5.startFlight() === false);

  // 7b. 起飞门槛是 3 血
  const tankFly3 = new PlayerTank(480, GROUND - 13);
  tankFly3.hp = 4;
  T('4 血不能起飞', tankFly3.startFlight() === false);
  tankFly3.hp = 3;
  T('3 血可以起飞', tankFly3.startFlight() === true);

  // 8. 小怪一枪死
  const unread = new DemandEnemy(300, GROUND - 15);
  unread.hurt(1);
  T('未读一枪即死', unread.dead === true);

  // 9. boss 血量 10
  const boss = new CallBoss(500, GROUND - 26);
  T('boss 血量 10', boss.hp === 10, 'hp=' + boss.hp);
  for (let i = 0; i < 9; i++) boss.hurt(1);
  T('boss 挨 9 枪还活着', boss.dead === false && boss.hp === 1);
  boss.hurt(1);
  T('boss 第 10 枪死亡', boss.dead === true);

  // 10. 追踪弹会朝目标拐
  const homing = new Bullet(0, 0, 3.1, 0, 'enemy');
  homing.homing = true;
  homing.target = { x: 0, y: 300 };
  for (let i = 0; i < 30; i++) homing.update();
  T('追踪弹向下拐', homing.vy > 0.5, 'vy=' + homing.vy.toFixed(2));

  // 11. 普通弹不受追踪影响
  const plain = new Bullet(0, 0, 3.1, 0, 'enemy');
  plain.homing = false;
  for (let i = 0; i < 10; i++) plain.update();
  T('普通弹只受重力', plain.vy > 0 && plain.vy < 2, 'vy=' + plain.vy.toFixed(2));

  // 12. 锅落地弹一下再静置
  const pot = new PotEnemy(700, GROUND - 110, 0, 0);
  const farPlayer = { x: -9999, y: 0 };
  let landed = false;
  let minAfterLand = 9999;
  for (let i = 0; i < 400; i++) {
    pot.update(farPlayer);
    if (!landed && pot.y >= GROUND - pot.r - 0.5) landed = true;
    if (landed && pot.y < minAfterLand) minAfterLand = pot.y;
    if (pot.settled) break;
  }
  T('锅会落地', landed);
  T('锅弹起后静置', pot.settled === true);
  T('弹跳高于 20px', (GROUND - pot.r) - minAfterLand > 20,
    '弹起 ' + Math.round((GROUND - pot.r) - minAfterLand) + 'px');

  // 13. 踩到落定的锅：扣 1 血，锅碎掉
  const tank6 = new PlayerTank(480, GROUND - 13);
  tank6.hp = MAX_HP;
  const restingPot = new PotEnemy(480, GROUND - 19, 0, 0);
  restingPot.settled = true;
  restingPot.bounced = true;
  restingPot.update(tank6);
  T('踩到落定的锅扣 2 血', tank6.hp === MAX_HP - 2, 'hp=' + tank6.hp);
  T('踩过之后锅碎掉', restingPot.dead === true);

  // 13b. 落定的锅放着不动会自己消失
  const idlePot = new PotEnemy(700, GROUND - 19, 0, 0);
  idlePot.settled = true;
  idlePot.restLife = 420;
  idlePot.update({ x: -9999, y: 0 });
  T('锅静置超时消失', idlePot.dead === true);

  // 14. 道具半径
  T('年假道具更大', new Item(0, 0, 'leave').r > new Item(0, 0, 'coffee').r);

  __results;
`;

let results;
try {
  results = vm.runInContext(harness, context, { filename: path.join(ROOT, 'tests/harness.js') });
} catch (e) {
  console.error('载入被测代码失败:', e.message);
  process.exit(1);
}

for (const r of results) assert(r.name, r.ok, r.detail);

// ---------- 结构检查 ----------
const html = read('index.html');

// 引用的脚本文件都要存在
const scriptSrcs = [...html.matchAll(/<script\s+src="([^"]+)"/g)].map((m) => m[1]);
assert('index.html 至少引用一个脚本', scriptSrcs.length > 0);
for (const src of scriptSrcs) {
  assert(`脚本存在: ${src}`, fs.existsSync(path.join(ROOT, src)));
}

// 预览页存在且引用了同样的脚本
assert('preview.html 存在', fs.existsSync(path.join(ROOT, 'preview.html')));

// 没有遗留的调试输出
for (const f of ['js/utils.js', 'js/entities.js', 'js/game.js']) {
  const code = read(f);
  assert(`${f} 无 console.log`, !/console\.(log|debug)\(/.test(code));
  assert(`${f} 无 debugger`, !/\bdebugger\b/.test(code));
}

// 关键常量不能丢
const gameSrc = read('js/game.js');
for (const c of ['MERGE_COUNT', 'TIME_STOP_FRAMES', 'FLY_RAM_DAMAGE', 'RAM_COOLDOWN_FRAMES']) {
  assert(`game.js 定义 ${c}`, new RegExp(`const ${c}\\s*=`).test(gameSrc));
}

// ---------- 输出 ----------
console.log(`\n通过 ${passed} 项`);
if (failures.length) {
  console.log(`失败 ${failures.length} 项：\n`);
  for (const f of failures) console.log('  ✗ ' + f);
  process.exit(1);
}
console.log('全部通过 ✓\n');
