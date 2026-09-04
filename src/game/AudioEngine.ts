import type { Settings } from './types';

type SoundName = 'step' | 'swing' | 'impact' | 'warning' | 'swipe' | 'pickup' | 'deposit' | 'cook' | 'sale' | 'cash' | 'build' | 'upgrade' | 'gate' | 'defeat' | 'respawn' | 'fish';

const SOUND: Record<SoundName, [number, number, OscillatorType, number]> = {
  step: [120, 80, 'sine', 0.04], swing: [440, 150, 'sawtooth', 0.08], impact: [95, 48, 'square', 0.1],
  warning: [140, 115, 'sawtooth', 0.2], swipe: [250, 70, 'sawtooth', 0.12], pickup: [520, 860, 'sine', 0.08],
  deposit: [360, 580, 'triangle', 0.07], cook: [220, 300, 'triangle', 0.09], sale: [620, 920, 'sine', 0.12],
  cash: [760, 1180, 'sine', 0.1], build: [110, 180, 'square', 0.14], upgrade: [420, 980, 'triangle', 0.26],
  gate: [85, 52, 'square', 0.35], defeat: [260, 65, 'sawtooth', 0.55], respawn: [240, 720, 'sine', 0.34], fish: [310, 650, 'sine', 0.15]
};

export class AudioEngine {
  private context?: AudioContext;
  private ambience?: AudioBufferSourceNode;
  private ambienceGain?: GainNode;
  private settings: Settings;
  private lastStep = 0;

  constructor(settings: Settings) { this.settings = settings; }

  updateSettings(settings: Settings): void {
    this.settings = settings;
    if (this.ambienceGain) this.ambienceGain.gain.value = settings.masterVolume * settings.musicVolume * 0.12;
  }

  async unlock(): Promise<void> {
    const AudioContextConstructor = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextConstructor) return;
    if (!this.context) this.context = new AudioContextConstructor();
    if (this.context.state === 'suspended') await this.context.resume();
    if (!this.ambience) this.startAmbience();
  }

  play(name: SoundName, intensity = 1): void {
    const context = this.context;
    if (!context || context.state !== 'running' || this.settings.masterVolume <= 0 || this.settings.sfxVolume <= 0) return;
    if (name === 'step' && context.currentTime - this.lastStep < 0.16) return;
    if (name === 'step') this.lastStep = context.currentTime;
    const [startFrequency, endFrequency, type, duration] = SOUND[name];
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(startFrequency, context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), context.currentTime + duration);
    const volume = this.settings.masterVolume * this.settings.sfxVolume * 0.12 * Math.min(1.5, intensity);
    gain.gain.setValueAtTime(volume, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + duration + 0.01);
  }

  haptic(pattern: number | number[]): void {
    if (!this.settings.haptics || !('vibrate' in navigator)) return;
    navigator.vibrate(pattern);
  }

  private startAmbience(): void {
    const context = this.context;
    if (!context) return;
    const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
    const data = buffer.getChannelData(0);
    let smooth = 0;
    for (let index = 0; index < data.length; index += 1) {
      smooth = smooth * 0.985 + (Math.random() * 2 - 1) * 0.015;
      data[index] = smooth;
    }
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    source.buffer = buffer;
    source.loop = true;
    filter.type = 'lowpass';
    filter.frequency.value = 720;
    gain.gain.value = this.settings.masterVolume * this.settings.musicVolume * 0.12;
    source.connect(filter).connect(gain).connect(context.destination);
    source.start();
    this.ambience = source;
    this.ambienceGain = gain;
  }
}
