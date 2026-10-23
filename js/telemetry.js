// 埋点：记录一局里发生了什么，结束后可以导出，用来调难度。
// 不联网、不上传，只存在内存和 window.__lastRound 里。

const Telemetry = (() => {
  const MAX_EVENTS = 400;
  let events = [];
  let elapsed = 0;
  let running = false;

  function reset() {
    events = [];
    elapsed = 0;
    running = true;
  }

  function stop() {
    running = false;
  }

  function tick(seconds) {
    elapsed = seconds;
  }

  function log(type, data) {
    if (!running) return;
    if (events.length >= MAX_EVENTS) events.shift();
    const e = { t: Math.round(elapsed * 10) / 10, type };
    if (data) {
      for (const k in data) e[k] = data[k];
    }
    events.push(e);
  }

  // 按类型统计
  function counts() {
    const out = {};
    for (const e of events) {
      out[e.type] = (out[e.type] || 0) + 1;
    }
    return out;
  }

  // 生成可读的总结
  function summary(extra) {
    const c = counts();
    return {
      duration: Math.round(elapsed * 10) / 10,
      counts: c,
      events: events.slice(),
      ...extra,
    };
  }

  // 打完一局时调用：打印到控制台，并挂到 window 上方便复制
  function finish(extra) {
    stop();
    const data = summary(extra);

    if (typeof console !== 'undefined' && console.log) {
      console.log('%c[周一坦克] 本局数据', 'color:#8a6a5a;font-weight:bold');
      console.log('时长 %s 秒 | 击杀 %s | 受伤 %s 次 | 合体 %s 次 | 起飞 %s 次 | 时停 %s 次',
        data.duration,
        (data.counts.kill || 0),
        (data.counts.damage || 0),
        (data.counts.merge || 0),
        (data.counts.flight || 0),
        (data.counts.timestop || 0)
      );
      console.log('复制这段发给开发者：JSON.stringify(window.__lastRound)');
    }

    if (typeof window !== 'undefined') {
      window.__lastRound = data;
    }
    return data;
  }

  return {
    reset,
    tick,
    log,
    finish,
    summary,
    // 供调试面板用
    recent(n) { return events.slice(-(n || 6)); },
    get size() { return events.length; },
    get duration() { return elapsed; },
  };
})();
