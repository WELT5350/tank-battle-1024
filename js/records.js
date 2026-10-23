// 本地最高分榜：存在 localStorage 里，不联网。
// 不支持的浏览器（比如某些 file:// 场景）会静默降级成「没有纪录」。

const Records = (() => {
  const KEY = 'tank-battle-records-v1';
  const MAX = 5;

  function storage() {
    try {
      if (typeof localStorage === 'undefined') return null;
      localStorage.setItem('__t', '1');
      localStorage.removeItem('__t');
      return localStorage;
    } catch (e) {
      return null;
    }
  }

  function load() {
    const s = storage();
    if (!s) return [];
    try {
      const raw = s.getItem(KEY);
      if (!raw) return [];
      const list = JSON.parse(raw);
      return Array.isArray(list) ? list : [];
    } catch (e) {
      return [];
    }
  }

  function save(list) {
    const s = storage();
    if (!s) return;
    try {
      s.setItem(KEY, JSON.stringify(list));
    } catch (e) {
      // 配额满了之类，忽略
    }
  }

  // 返回 { board, isBest, rank }
  function submit(entry) {
    const list = load();
    const prevBest = list.length ? list[0].score : 0;
    const next = list.concat([entry]);
    next.sort((a, b) => b.score - a.score);
    const board = next.slice(0, MAX);
    save(board);
    return {
      board,
      isBest: entry.score > prevBest,
      rank: board.findIndex((r) => r.at === entry.at && r.score === entry.score) + 1,
    };
  }

  function best() {
    const list = load();
    return list.length ? list[0] : null;
  }

  return { load, submit, best, MAX };
})();
