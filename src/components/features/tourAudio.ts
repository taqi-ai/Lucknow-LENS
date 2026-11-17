/**
 * Tour audio (round 3): a cinematic score synthesised live with WebAudio (no audio files, so nothing
 * to license or download) and a voice-over using the browser's speech synthesis.
 *   score: a low drone, a slow minor pad progression (Am - F - C - G) with long attacks, a soft
 *          pulse, and a deep "boom" hit on every scene change.
 *   voice: speaks each stop's description, preferring an Indian-English voice when available.
 */
export class TourAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private timer = 0;
  private step = 0;
  public musicOn = true;
  public voiceOn = true;

  start(): void {
    if (!this.musicOn || this.ctx) return;
    const AC = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext
      ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    const master = ctx.createGain(); master.gain.value = 0; master.connect(ctx.destination);
    master.gain.linearRampToValueAtTime(0.32, ctx.currentTime + 3);
    this.master = master;
    // Reverb-ish feedback delay for space.
    const delay = ctx.createDelay(1.5); delay.delayTime.value = 0.42;
    const fb = ctx.createGain(); fb.gain.value = 0.38;
    const wet = ctx.createGain(); wet.gain.value = 0.35;
    delay.connect(fb); fb.connect(delay); delay.connect(wet); wet.connect(master);
    (this as unknown as { send: AudioNode }).send = delay;
    // Drone.
    for (const f of [55, 82.5]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 220;
      const g = ctx.createGain(); g.gain.value = 0.07;
      o.connect(lp); lp.connect(g); g.connect(master); o.start();
    }
    this.chord();
    this.timer = window.setInterval(() => this.chord(), 6000);
  }

  private chord(): void {
    const ctx = this.ctx, master = this.master; if (!ctx || !master) return;
    const prog = [[220, 261.6, 329.6], [174.6, 220, 261.6], [261.6, 329.6, 392], [196, 246.9, 293.7]];
    const notes = prog[this.step++ % prog.length], t = ctx.currentTime;
    const send = (this as unknown as { send: AudioNode }).send;
    for (const f of notes) for (const det of [-4, 4]) {
      const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f; o.detune.value = det;
      const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.045, t + 2.2); g.gain.linearRampToValueAtTime(0, t + 6.4);
      o.connect(g); g.connect(master); g.connect(send); o.start(t); o.stop(t + 6.5);
    }
    // soft pulse
    for (let i = 0; i < 4; i++) {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = notes[0] / 2;
      const g = ctx.createGain(), tt = t + i * 1.5; g.gain.setValueAtTime(0.0001, tt); g.gain.exponentialRampToValueAtTime(0.08, tt + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.6);
      o.connect(g); g.connect(master); o.start(tt); o.stop(tt + 0.7);
    }
  }

  /** Deep cinematic hit for a scene change. */
  hit(): void {
    const ctx = this.ctx, master = this.master; if (!ctx || !master) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(32, t + 1.4);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 1.8);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + 1.9);
    const n = ctx.createBufferSource(), buf = ctx.createBuffer(1, ctx.sampleRate * 1.2, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
    n.buffer = buf; const hp = ctx.createBiquadFilter(); hp.type = 'bandpass'; hp.frequency.value = 900;
    const ng = ctx.createGain(); ng.gain.value = 0.12; n.connect(hp); hp.connect(ng); ng.connect(master); n.start(t);
  }

  speak(text: string): void {
    if (!this.voiceOn || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();
    u.voice = voices.find((v) => /en-IN/i.test(v.lang)) ?? voices.find((v) => /en-GB/i.test(v.lang)) ?? voices.find((v) => /^en/i.test(v.lang)) ?? null;
    u.rate = 0.93; u.pitch = 0.92; u.volume = 1;
    window.speechSynthesis.speak(u);
  }

  setMusic(on: boolean): void { this.musicOn = on; if (!on) this.stop(); else this.start(); }
  setVoice(on: boolean): void { this.voiceOn = on; if (!on && 'speechSynthesis' in window) window.speechSynthesis.cancel(); }

  stop(): void {
    window.clearInterval(this.timer);
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    const ctx = this.ctx, m = this.master; this.ctx = null; this.master = null;
    if (ctx && m) { m.gain.cancelScheduledValues(ctx.currentTime); m.gain.linearRampToValueAtTime(0, ctx.currentTime + 1.2); setTimeout(() => ctx.close().catch(() => undefined), 1400); }
  }
}
