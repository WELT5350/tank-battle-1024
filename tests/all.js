// 一次进程里跑完全部测试，方便覆盖率统计。
// 两个套件各自建自己的 vm 上下文，互不干扰。
require('./run.js');
require('./game-loop.js');
