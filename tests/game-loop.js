// 周一坦克 · 主循环无头测试
// game.js 依赖 document / canvas / window，这里用桩把它跑起来，
// 然后手动推进帧，验证合体、时停、暂停这些"只在 game.js 里"的逻辑。

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let passed = 0;
const failures = [];

function assert(name, condition, detail) {
  if (condition) passed++;
  else failures.push(`${name}${detail ? ' —— ' + detail : ''}`);
}

// ---------- Canvas / DOM 桩 ----------
function makeCtx() {
  const target = {};
  return new Proxy(target, {
    get(t, prop) {
      if (prop in t) return t[prop];
      // 任何未知属性都当成空方法，调用不会炸
      const fn = () => ({ width: 10 });
      t[prop] = fn;
      return fn;
    },
    set(t, prop, value) {
      t[prop] = value;
      return true;
    },
  });
}

const canvasStub = {
  width: 960,
  height: 600,
  style: {},
  getContext: () => makeCtx(),
  addEventListener: () => {},
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 960, height: 600 }),
};

const windowHandlers = {};
const windowStub = {
  addEventListener: (type, fn) => { windowHandlers[type] = fn; },
};

let clock = 1000;
const sandbox = {
  console,
  Math,
  Date,
  document: { getElementById: () => canvasStub },
  window: windowStub,
  performance: { now: () => clock },
  requestAnimationFrame: () => 0, // 不让它自己跑循环，由测试手动推进
};

// ---------- 载入三个文件 ----------
const source = [
  read('js/utils.js'),
  read('js/entities.js'),
  read('js/audio.js'),
  read('js/telemetry.js'),
  read('js/game.js'),
  // 把内部符号导出来给测试用
  'globalThis.__game = { state, input, startGame, update, draw, spawnWave, spawnPot, Telemetry,' +
  '  PlayerTank, DemandEnemy, MeetingEnemy, PotEnemy, CallBoss, Item, Bullet };',
].join('\n');

try {
  vm.runInNewContext(source, sandbox, { filename: 'game-bundle.js' });
} catch (e) {
  console.error('载入 game.js 失败:', e.message);
  process.exit(1);
}

const G = sandbox.__game;
const { state, input } = G;

const key = (k) => {
  clock += 400; // 保证不在双击判定窗口内
  windowHandlers.keydown({ key: k, preventDefault() {} });
};
const keyUp = (k) => windowHandlers.keyup && windowHandlers.keyup({ key: k });

const step = (n) => { for (let i = 0; i < (n || 1); i++) G.update(); };
const clearEnemies = () => { state.enemies.length = 0; };
const countOf = (kind) => state.enemies.filter((e) => e.kind === kind).length;

// ---------- 场景 ----------
// 1. 开局
G.startGame();
assert('开局进入 playing', state.mode === 'playing');
assert('开局有坦克', !!state.tank);
assert('开局满血', state.tank.hp === 10);

// 2. 三只未读分散 → 不合体
clearEnemies();
state.tank.x = 940; // 让坦克远离，避免被撞
for (const x of [200, 330, 460]) {
  const d = new G.DemandEnemy(x, 539);
  d.speed = 0;
  state.enemies.push(d);
}
step(2);
assert('三只相距 130px 不合体', countOf('boss') === 0, 'boss=' + countOf('boss'));

// 3. 三只聚在 50px 内 → 合体
clearEnemies();
for (const x of [400, 425, 445]) {
  const d = new G.DemandEnemy(x, 539);
  d.speed = 0;
  state.enemies.push(d);
}
step(2);
assert('三只挨着会合体', countOf('boss') === 1, 'boss=' + countOf('boss'));
assert('合体后未读被消耗', countOf('demand') === 0, '未读=' + countOf('demand'));
assert('合体出的 boss 是 10 血', (state.enemies.find((e) => e.kind === 'boss') || {}).hp === 10);

// 4. 时停：撞到敌人直接撞碎，玩家不掉血
clearEnemies();
state.tank.hp = 10;
state.timeStop = 300;
state.tank.x = 480;
state.tank.y = 539;
const victim = new G.DemandEnemy(480, 539);
state.enemies.push(victim);
const killsBefore = state.kills;
step(1);
assert('时停撞碎敌人', countOf('demand') === 0, '未读=' + countOf('demand'));
assert('时停撞击计入击杀', state.kills === killsBefore + 1);
assert('时停撞击不掉血', state.tank.hp === 10, 'hp=' + state.tank.hp);

// 5. 时停期间倒计时冻结
clearEnemies();
state.timeStop = 120;
const timeBefore = state.timeLeft;
step(2);
assert('时停时倒计时不动', state.timeLeft === timeBefore,
  `${timeBefore.toFixed(2)} → ${state.timeLeft.toFixed(2)}`);

// 6. 时停结束后倒计时恢复
state.timeStop = 0;
const timeAfter = state.timeLeft;
step(2);
assert('时停结束后倒计时继续', state.timeLeft < timeAfter);

// 7. ESC 暂停会冻结世界
key('Escape');
assert('ESC 进入暂停', state.mode === 'paused', 'mode=' + state.mode);
const frozenFrame = state.frame;
step(3);
assert('暂停时帧数不走', state.frame === frozenFrame);
key('Escape');
assert('再按 ESC 恢复', state.mode === 'playing');

// 8. 锅按固定间隔出场
G.startGame();
clearEnemies();
state.potTimer = 1;
step(1);
assert('锅按计时器出场', countOf('pot') === 1, '锅=' + countOf('pot'));
assert('出场后计时器重置', state.potTimer > 800, 'potTimer=' + state.potTimer);

// 9. 击杀会产生反馈波纹
G.startGame();
clearEnemies();
state.pops = [];
const prey = new G.DemandEnemy(500, 539);
prey.speed = 0;
state.enemies.push(prey);
state.bullets.push(new G.Bullet(500, 539, 0, 0, 'player'));
step(1);
assert('击杀会产生波纹', state.pops.length > 0, '波纹=' + state.pops.length);
assert('波纹会随时间扩大', (function () {
  const before = state.pops[0] ? state.pops[0].r : 0;
  step(2);
  const after = state.pops[0] ? state.pops[0].r : before;
  return after > before;
})());

// 10. 埋点记录
G.startGame();
clearEnemies();
const beforeSize = G.Telemetry.size;
const prey2 = new G.DemandEnemy(500, 539);
prey2.speed = 0;
state.enemies.push(prey2);
state.bullets.push(new G.Bullet(500, 539, 0, 0, 'player'));
step(1);
assert('击杀会被记录', G.Telemetry.summary().counts.kill >= 1,
  'counts=' + JSON.stringify(G.Telemetry.summary().counts));
assert('埋点有事件累积', G.Telemetry.size > beforeSize);

// 11. 一局结束会导出数据
G.startGame();
state.tank.hp = 0;
step(2);
assert('结束时写入 window.__lastRound', !!(sandbox.window.__lastRound),
  '结果=' + JSON.stringify((sandbox.window.__lastRound || {}).result));
assert('导出数据含 result', (sandbox.window.__lastRound || {}).result === 'over');

// 12. 正常游玩不会崩
G.startGame();
state.timeLeft = 90;
let crashed = null;
try {
  for (let i = 0; i < 600; i++) {
    G.update();
    G.draw();
  }
} catch (e) {
  crashed = e.message;
}
assert('连续跑 600 帧不报错', crashed === null, crashed || '');

// ---------- 输出 ----------
console.log(`\n主循环测试：通过 ${passed} 项`);
if (failures.length) {
  console.log(`失败 ${failures.length} 项：\n`);
  for (const f of failures) console.log('  ✗ ' + f);
  console.log('');
  process.exit(1);
}
console.log('全部通过 ✓\n');
