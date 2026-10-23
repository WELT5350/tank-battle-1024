// 极简音效：全部用 WebAudio 现场合成，不加载任何音频文件。
// 浏览器禁止自动播放，所以音频上下文在第一次按键/点击时才创建。

const Sfx = (() => {
  let audio = null;
  let master = null;
  let musicBus = null;
  let silenced = false;

  function ensure() {
    if (audio) return audio;
    if (typeof window === 'undefined') return null;
    const AC = window.AudioContext || /** @type {any} */ (window).webkitAudioContext;
    if (!AC) return null;
    try {
      audio = new AC();
      master = audio.createGain();
      master.gain.value = 0.22;
      master.connect(audio.destination);

      musicBus = audio.createGain();
      musicBus.gain.value = 0.6; // 背景音乐总音量
      musicBus.connect(master);
    } catch (e) {
      return null;
    }
    return audio;
  }

  function tone(opts) {
    const c = ensure();
    if (!c) return;
    if (c.state === 'suspended') c.resume();

    const dur = opts.dur || 0.12;
    const t0 = c.currentTime + (opts.delay || 0);
    const osc = c.createOscillator();
    const gain = c.createGain();

    osc.type = opts.type || 'square';
    osc.frequency.setValueAtTime(opts.freq || 440, t0);
    if (opts.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.to), t0 + dur);

    const peak = opts.gain === undefined ? 0.6 : opts.gain;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(peak, t0 + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function noise(opts) {
    const c = ensure();
    if (!c) return;
    if (c.state === 'suspended') c.resume();

    const dur = opts.dur || 0.08;
    const t0 = c.currentTime + (opts.delay || 0);
    const frames = Math.max(1, Math.floor(c.sampleRate * dur));
    const buffer = c.createBuffer(1, frames, c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
    }

    const src = c.createBufferSource();
    src.buffer = buffer;

    const gain = c.createGain();
    gain.gain.setValueAtTime(opts.gain === undefined ? 0.5 : opts.gain, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    src.connect(gain);
    gain.connect(master);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  const bank = {
    shoot: () => tone({ freq: 760, to: 400, dur: 0.05, type: 'square', gain: 0.35 }),
    hit: () => noise({ dur: 0.035, gain: 0.35 }),
    kill: () => {
      tone({ freq: 320, to: 70, dur: 0.15, type: 'sawtooth', gain: 0.5 });
      noise({ dur: 0.09, gain: 0.4 });
    },
    hurt: () => tone({ freq: 210, to: 75, dur: 0.22, type: 'square', gain: 0.65 }),
    // 激光启动：一声上扬的锯齿
    laser: () => {
      tone({ freq: 500, to: 1400, dur: 0.22, type: 'sawtooth', gain: 0.5 });
      tone({ freq: 250, to: 700, dur: 0.22, type: 'square', gain: 0.25 });
    },
    // 激光持续中的轻微嘶声
    laserTick: () => tone({ freq: 1200, to: 900, dur: 0.03, type: 'sawtooth', gain: 0.12 }),
    pickup: () => {
      tone({ freq: 620, dur: 0.07, type: 'sine', gain: 0.55 });
      tone({ freq: 900, dur: 0.1, type: 'sine', gain: 0.45, delay: 0.07 });
    },
    flight: () => tone({ freq: 260, to: 880, dur: 0.35, type: 'sine', gain: 0.6 }),
    timestop: () => {
      tone({ freq: 170, to: 40, dur: 0.7, type: 'sine', gain: 0.7 });
      tone({ freq: 90, to: 30, dur: 0.9, type: 'triangle', gain: 0.4 });
    },
    merge: () => tone({ freq: 130, to: 55, dur: 0.5, type: 'sawtooth', gain: 0.6 }),
    // 阶段推进：两声上行的提示音
    phase: () => {
      tone({ freq: 620, dur: 0.12, type: 'triangle', gain: 0.45 });
      tone({ freq: 830, dur: 0.16, type: 'triangle', gain: 0.4, delay: 0.13 });
    },
    over: () => tone({ freq: 300, to: 55, dur: 0.8, type: 'square', gain: 0.6 }),
    boom: () => {
      noise({ dur: 0.55, gain: 0.9 });
      tone({ freq: 110, to: 26, dur: 0.55, type: 'sine', gain: 0.95 });
      tone({ freq: 70, to: 22, dur: 0.75, type: 'triangle', gain: 0.6, delay: 0.03 });
    },
    // 老式电话的丁零零：两组颤音，频率压低、时长加长，笔记本喇叭才听得见
    ring: () => {
      for (let burst = 0; burst < 2; burst++) {
        for (let i = 0; i < 7; i++) {
          tone({
            freq: i % 2 ? 1180 : 1520,
            dur: 0.075,
            type: 'triangle',
            gain: burst ? 0.55 : 0.7,
            delay: burst * 0.62 + i * 0.075,
          });
        }
      }
    },
    win: () => {
      [523, 659, 784, 1046].forEach((f, i) => {
        tone({ freq: f, dur: 0.16, type: 'sine', gain: 0.45, delay: i * 0.12 });
      });
    },
  };

  // ---------- 背景音乐：一段 8 秒的循环 ----------
  const BPM = 92;
  const STEP = 60 / BPM / 2; // 八分音符
  const LOOP_STEPS = 32; // 四个和弦 × 8 步
  const CHORDS = [
    [57, 60, 64], // Am
    [53, 57, 60], // F
    [48, 52, 55], // C
    [55, 59, 62], // G
  ];

  let musicSpeed = 1;
  let musicTimer = null;
  let musicStep = 0;
  let musicNext = 0;

  function midiToFreq(m) {
    return 440 * Math.pow(2, (m - 69) / 12);
  }

  function musicNote(freq, when, dur, gain, type) {
    const c = audio;
    if (!c) return;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type || 'triangle';
    osc.frequency.setValueAtTime(freq, when);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(gain, when + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    osc.connect(g);
    g.connect(musicBus);
    osc.start(when);
    osc.stop(when + dur + 0.02);
  }

  // 时停时把音乐整体拖慢并降调，玩家能从听觉上立刻感到"世界停了"
  function setMusicSpeed(v) {
    musicSpeed = Math.max(0.25, Math.min(1, v));
  }

  function scheduleStep(i, when) {
    const chordIndex = Math.floor(i / 8) % CHORDS.length;
    const chord = CHORDS[chordIndex];
    const inChord = i % 8;

    // 低音：每小节头尾各一次
    if (inChord === 0 || inChord === 4) {
      musicNote(
        midiToFreq(chord[0] - 12) * pitchScale(),
        when,
        (STEP * 1.8) / musicSpeed,
        0.18,
        'sine'
      );
    }
    // 琶音：弱起，留空拍，避免太吵
    if (inChord !== 3 && inChord !== 7) {
      const note = chord[inChord % chord.length] + 12;
      musicNote(midiToFreq(note) * pitchScale(), when, (STEP * 1.2) / musicSpeed, 0.07, 'triangle');
    }
  }

  function pitchScale() {
    return 0.55 + 0.45 * musicSpeed; // 拖慢时音高也跟着塌下去
  }

  function musicTick() {
    const c = audio;
    if (!c || !musicBus) return;
    if (c.state === 'suspended') c.resume();
    const horizon = c.currentTime + 0.18;
    while (musicNext < horizon) {
      if (musicNext < c.currentTime) musicNext = c.currentTime;
      scheduleStep(musicStep, musicNext);
      musicStep = (musicStep + 1) % LOOP_STEPS;
      musicNext += STEP / musicSpeed;
    }
  }

  return {
    // ---------- 背景音乐 ----------
    startMusic() {
      if (silenced) return;
      const c = ensure();
      if (!c || musicTimer) return;
      if (c.state === 'suspended') c.resume();
      musicNext = c.currentTime + 0.1;
      musicStep = 0;
      musicTick();
      musicTimer = setInterval(musicTick, 40);
    },
    stopMusic() {
      if (musicTimer) {
        clearInterval(musicTimer);
        musicTimer = null;
      }
    },
    isMusicPlaying() {
      return !!musicTimer;
    },
    setMusicSpeed,

    play(name) {
      if (silenced) return;
      const fn = bank[name];
      if (fn) fn();
    },
    toggle() {
      silenced = !silenced;
      if (silenced) {
        if (musicTimer) {
          clearInterval(musicTimer);
          musicTimer = null;
        }
      }
      return !silenced;
    },
    isMuted() {
      return silenced;
    },
  };
})();
