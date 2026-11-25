// Звуки, синтезированные через WebAudio (никаких файлов): хруст, «пуф», удар, шлепок, капля, гудок,
// перезвон при рождении снеговика, вихрь; фоновые — ветер (по силе ветра) и мотор снегоуборщика.
// По умолчанию выключены; громкости — отдельно.
import { registerModule, audioHooks, App } from './app';

class Synth {
  ctx: AudioContext;
  master: GainNode;
  fx: GainNode;
  windBus: GainNode;
  motorBus: GainNode;
  private noise: AudioBuffer;
  private windSrc: AudioBufferSourceNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private windGain: GainNode | null = null;
  private motorOsc: OscillatorNode | null = null;
  private motorGain: GainNode | null = null;
  private last = new Map<string, number>();

  constructor() {
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
    this.fx = this.bus();
    this.windBus = this.bus();
    this.motorBus = this.bus();
    const len = this.ctx.sampleRate * 2;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  private bus(): GainNode {
    const g = this.ctx.createGain();
    g.connect(this.master);
    return g;
  }

  setVolumes(master: number, wind: number, fx: number, motor: number): void {
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(master, t, 0.05);
    this.windBus.gain.setTargetAtTime(wind, t, 0.05);
    this.fx.gain.setTargetAtTime(fx, t, 0.05);
    this.motorBus.gain.setTargetAtTime(motor, t, 0.05);
  }

  private noiseBurst(dur: number, type: BiquadFilterType, freq: number, q: number, gain: number, attack = 0.005): void {
    const c = this.ctx;
    const t = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.fx);
    src.start(t, Math.random() * 1.5, dur + 0.05);
  }

  private tone(freq: number, dur: number, type: OscillatorType, gain: number, endFreq?: number, delay = 0): void {
    const c = this.ctx;
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.fx);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  play(name: string, power: number): void {
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    const now = performance.now();
    const minGap = name === 'crunch' ? 70 : name === 'thud' ? 60 : 120;
    if (now - (this.last.get(name) ?? 0) < minGap) return;
    this.last.set(name, now);
    const p = Math.max(0.15, Math.min(1, power));
    switch (name) {
      case 'crunch':
        // хруст снега: несколько коротких щелчков в полосе 1.5–4 кГц
        for (let k = 0; k < 3; k++) setTimeout(() => this.noiseBurst(0.05 + Math.random() * 0.05, 'bandpass', 1800 + Math.random() * 2200, 1.2, 0.5 * p), k * 28);
        break;
      case 'puff':
        this.noiseBurst(0.25, 'lowpass', 700, 0.7, 0.35 * p, 0.03);
        break;
      case 'thud':
      case 'hit':
        this.tone(110, 0.18, 'sine', 0.5 * p, 55);
        this.noiseBurst(0.08, 'lowpass', 900, 0.7, 0.3 * p);
        break;
      case 'splat':
        this.noiseBurst(0.16, 'lowpass', 1200, 1, 0.45);
        this.tone(220, 0.1, 'sine', 0.2, 120);
        break;
      case 'melt':
      case 'drip':
        this.tone(900 + Math.random() * 400, 0.09, 'sine', 0.18, 1500);
        break;
      case 'horn': {
        // двухтональный гудок
        for (const f of [370, 466]) {
          const c = this.ctx;
          const t = c.currentTime;
          const o = c.createOscillator();
          o.type = 'square';
          o.frequency.value = f;
          const lp = c.createBiquadFilter();
          lp.type = 'lowpass';
          lp.frequency.value = 1600;
          const g = c.createGain();
          g.gain.setValueAtTime(0, t);
          g.gain.linearRampToValueAtTime(0.18, t + 0.03);
          g.gain.setValueAtTime(0.18, t + 0.45);
          g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
          o.connect(lp).connect(g).connect(this.fx);
          o.start(t);
          o.stop(t + 0.65);
        }
        break;
      }
      case 'snowman':
        [880, 1108.7, 1318.5, 1760].forEach((f, k) => this.tone(f, 0.6, 'sine', 0.14, undefined, k * 0.09));
        break;
      case 'shake': {
        const c = this.ctx;
        const t = c.currentTime;
        const src = c.createBufferSource();
        src.buffer = this.noise;
        const f = c.createBiquadFilter();
        f.type = 'bandpass';
        f.Q.value = 2;
        f.frequency.setValueAtTime(300, t);
        f.frequency.exponentialRampToValueAtTime(2500, t + 0.9);
        f.frequency.exponentialRampToValueAtTime(400, t + 2);
        const g = c.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.5, t + 0.3);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
        src.connect(f).connect(g).connect(this.fx);
        src.start(t, 0, 2.3);
        break;
      }
    }
  }

  /** Фон: ветер (0..1) и мотор (0..1, скорость). */
  ambient(wind: number, motor: number, motorSpeed: number): void {
    const c = this.ctx;
    const t = c.currentTime;
    if (!this.windSrc) {
      this.windSrc = c.createBufferSource();
      this.windSrc.buffer = this.noise;
      this.windSrc.loop = true;
      this.windFilter = c.createBiquadFilter();
      this.windFilter.type = 'bandpass';
      this.windFilter.Q.value = 0.9;
      this.windGain = c.createGain();
      this.windGain.gain.value = 0;
      this.windSrc.connect(this.windFilter).connect(this.windGain).connect(this.windBus);
      this.windSrc.start();
    }
    this.windFilter!.frequency.setTargetAtTime(250 + wind * 900, t, 0.3);
    this.windGain!.gain.setTargetAtTime(Math.min(0.5, wind * 0.45), t, 0.4);
    if (!this.motorOsc) {
      this.motorOsc = c.createOscillator();
      this.motorOsc.type = 'sawtooth';
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 320;
      this.motorGain = c.createGain();
      this.motorGain.gain.value = 0;
      this.motorOsc.connect(lp).connect(this.motorGain).connect(this.motorBus);
      this.motorOsc.start();
    }
    this.motorOsc.frequency.setTargetAtTime(42 + motorSpeed * 30, t, 0.2);
    this.motorGain!.gain.setTargetAtTime(motor * 0.12, t, 0.3);
  }

  close(): void {
    void this.ctx.close();
  }
}

let synth: Synth | null = null;

function sync(app: App): void {
  const s = app.settings.sound;
  if (!s.enabled) {
    if (synth) {
      synth.close();
      synth = null;
    }
    audioHooks.play = () => {};
    return;
  }
  if (!synth) {
    try {
      synth = new Synth();
    } catch (e) {
      console.warn('звук недоступен:', e);
      return;
    }
  }
  synth.setVolumes(s.master / 100, s.wind / 100, s.effects / 100, s.motor / 100);
  audioHooks.play = (n, p) => synth?.play(n, p);
}

registerModule({
  name: 'audio',
  attach: sync,
  onSettings: sync,
  frame(app) {
    if (!synth) return;
    // фоновые звуки — только из одного окна (основного монитора), чтобы не удваивались
    if (!app.info.hasDock) return;
    const pm = app.scene.modules.plow as { plows?: { v: number; lane: number }[] } | undefined;
    const plows = pm?.plows ?? [];
    const sp = plows.reduce((a, p) => Math.max(a, Math.abs(p.v)), 0);
    const near = plows.length ? (plows[0].lane > 0.5 ? 0.5 : 1) : 0;
    synth.ambient(Math.min(1, Math.abs(app.scene.wind.value) / 220), near, Math.min(1, sp / 150));
  },
});

// тестовый хук: проверить, что звуковой движок создаётся и играет без ошибок
const TT = ((window as unknown as { __test: Record<string, unknown> }).__test ??= {});
TT.audioState = () => (synth ? synth.ctx.state : 'off');
