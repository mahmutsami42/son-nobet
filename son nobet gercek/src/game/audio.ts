import type { Settings } from './data';

type Cue = 'ui' | 'open' | 'pickup' | 'denied' | 'metal' | 'glass' | 'power' | 'step' | 'wet' | 'concrete' | 'enemy' | 'heavy' | 'hit' | 'breathe' | 'lamp' | 'beacon';
export type VoiceClip = 'quarantine' | 'reserve' | 'clinical' | 'transfer' | 'rescue';
export class GameAudio {
  private ctx: AudioContext | null = null;
  private bus: GainNode | null = null;
  private buffer: AudioBuffer | null = null;
  private rain: GainNode | null = null;
  private inside: GainNode | null = null;
  private danger: GainNode | null = null;
  private rotor: GainNode | null = null;
  private rotorTone: OscillatorNode | null = null;
  private voiceElement: { element: HTMLAudioElement; clip: VoiceClip; level: number } | null = null;
  private volume = .64;
  private muted = false;

  start(settings: Settings) {
    if (!this.ctx) try {
      const context = this.ctx = new AudioContext();
      this.bus = context.createGain(); this.bus.gain.value = 0; this.bus.connect(context.destination);
      const length = context.sampleRate * 3;
      this.buffer = context.createBuffer(1, length, context.sampleRate);
      const samples = this.buffer.getChannelData(0);
      for (let i = 0; i < length; i++) samples[i] = Math.random() * 2 - 1;
      this.rain = this.loopNoise('bandpass', 1150, .48);
      this.inside = this.loopNoise('lowpass', 190, .68);
      this.danger = this.loopTone(49, 'sine');
      this.rotor = this.loopTone(22, 'sawtooth', true);
    } catch { return; }
    void this.ctx.resume().catch(() => {});
    this.settings(settings);
  }
  private loopNoise(type: BiquadFilterType, freq: number, q: number) {
    const c = this.ctx!;
    const src = c.createBufferSource(); src.buffer = this.buffer; src.loop = true;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain(); g.gain.value = 0; src.connect(f).connect(g).connect(this.bus!); src.start(); return g;
  }
  private loopTone(freq: number, wave: OscillatorType, rot = false) {
    const c = this.ctx!;
    const src = c.createOscillator(); src.type = wave; src.frequency.value = freq;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 128;
    const g = c.createGain(); g.gain.value = 0; src.connect(f).connect(g).connect(this.bus!); src.start();
    if (rot) this.rotorTone = src;
    return g;
  }
  settings(settings: Settings) {
    this.volume = settings.volume / 100; this.muted = settings.muted;
    if (this.ctx && this.bus) this.bus.gain.setTargetAtTime(this.muted ? 0 : this.volume * .55, this.ctx.currentTime, .11);
    if (this.voiceElement) this.voiceElement.element.volume = this.muted ? 0 : this.volume * this.voiceElement.level;
  }
  voice(clip: VoiceClip, level = .53, finished?: () => void) {
    this.stopVoice();
    if (this.muted || this.volume === 0) { finished?.(); return; }
    const element = new Audio(`/audio/${clip}.mp3`);
    this.voiceElement = { element, clip, level };
    element.volume = this.volume * level;
    const reset = () => { if (this.voiceElement?.element === element) this.voiceElement = null; finished?.(); };
    element.addEventListener('ended', reset, { once: true });
    void element.play().catch(reset);
  }
  stopVoice(clip?: VoiceClip) {
    if (this.voiceElement && (!clip || clip === this.voiceElement.clip)) {
      this.voiceElement.element.pause(); this.voiceElement = null;
    }
  }
  ambience(outside: boolean, tension = 0, rotor = 0, playing = true) {
    if (!this.ctx || !this.rain || !this.inside || !this.danger || !this.rotor) return;
    const now = this.ctx.currentTime;
    if (now - this.lastMix < .1) return;
    this.lastMix = now;
    this.rain.gain.setTargetAtTime(outside ? .29 : playing ? .045 : .18, now, .37);
    this.inside.gain.setTargetAtTime(outside ? .13 : .30, now, .47);
    this.danger.gain.setTargetAtTime(tension * .066, now, .32);
    this.rotor.gain.setTargetAtTime(rotor * .17, now, .24);
    this.rotorTone?.frequency.setTargetAtTime(16 + rotor * 24, now, .27);
  }
  private lastMix = -1;

  cue(kind: Cue, volume = 1, pan = 0) {
    if (!this.ctx || !this.bus || !this.buffer || this.ctx.state !== 'running') return;
    const c = this.ctx, now = c.currentTime;
    const profiles: Record<Cue, [number, number, number, number, number]> = {
      ui: [390, 280, .085, .18, 0], open: [115, 65, .32, .19, 950], pickup: [505, 680, .16, .17, 0],
      denied: [145, 90, .2, .20, 0], metal: [234, 82, .31, .27, 1400], glass: [1190, 240, .46, .25, 3800],
      power: [48, 96, 1.28, .44, 690], step: [96, 44, .17, .15, 290], wet: [125, 66, .15, .15, 870],
      concrete: [118, 55, .185, .18, 520], enemy: [79, 33, .24, .22, 325], heavy: [47, 26, .41, .49, 290],
      hit: [135, 42, .31, .35, 660], breathe: [64, 41, .54, .32, 420], lamp: [306, 182, .08, .12, 1000], beacon: [594, 748, .31, .2, 0],
    };
    const [a, b, seconds, amp, noise] = profiles[kind];
    const spatial = c.createStereoPanner(); spatial.pan.value = Math.max(-1, Math.min(1, pan)); spatial.connect(this.bus);
    const gain = c.createGain(); gain.gain.setValueAtTime(.001, now); gain.gain.exponentialRampToValueAtTime(Math.max(.002, amp * volume), now + .013);
    gain.gain.exponentialRampToValueAtTime(.001, now + seconds); gain.connect(spatial);
    const osc = c.createOscillator(); osc.type = kind === 'power' || kind === 'metal' ? 'triangle' : 'sine';
    osc.frequency.setValueAtTime(a * (.93 + Math.random() * .14), now); osc.frequency.exponentialRampToValueAtTime(b, now + seconds);
    osc.connect(gain); osc.start(now); osc.stop(now + seconds);
    if (noise) {
      const src = c.createBufferSource(); src.buffer = this.buffer;
      const filter = c.createBiquadFilter(); filter.type = 'bandpass'; filter.frequency.value = noise; filter.Q.value = kind === 'glass' ? .5 : 1.05;
      src.connect(filter).connect(gain); src.start(now, Math.random()); src.stop(now + seconds);
    }
    osc.onended = () => spatial.disconnect();
  }
}

export const audio = new GameAudio();