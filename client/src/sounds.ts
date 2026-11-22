// Sons gerados com a Web Audio API (sem arquivos externos, sem direitos autorais).
import type { Vec3 } from '../../shared/types';

/** Distância (m) em que um som distante fica inaudível. */
const HEAR_RANGE = 60;

export class Sounds {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;

  /**
   * Cria o áudio. Os navegadores exigem um gesto do usuário (clique ou tecla),
   * por isso é chamado no botão "Capturar mouse".
   */
  unlock(): void {
    if (!this.ctx) {
      const AudioCtor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtor) return;
      const ctx = new AudioCtor();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = 0.6;
      this.master.connect(ctx.destination);
      this.noiseBuf = makeNoise(ctx);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  /** Volume de um som na posição `from`, conforme a distância até o ouvinte. */
  volumeAt(from: Vec3, listener: Vec3): number {
    const d = Math.hypot(from[0] - listener[0], from[1] - listener[1], from[2] - listener[2]);
    return Math.min(1, Math.max(0.08, 1 - d / HEAR_RANGE));
  }

  /** Tiro. Slot 1 = rifle, 2 = pistola, 3 = faca. */
  shot(slot: number, vol: number): void {
    if (slot === 1) {
      this.noise(vol * 0.9, 0.12, 900, 'lowpass');
      this.tone(180, 60, vol * 0.5, 0.15, 'triangle');
    } else if (slot === 2) {
      this.noise(vol * 0.8, 0.07, 2500, 'highpass');
      this.tone(320, 120, vol * 0.4, 0.08, 'square');
    } else {
      this.noise(vol * 0.5, 0.14, 3000, 'bandpass');
    }
  }

  /** Recarga: dois cliques metálicos. */
  reload(vol: number): void {
    this.tone(900, 700, vol * 0.35, 0.04, 'square', 0);
    this.tone(600, 500, vol * 0.35, 0.05, 'square', 0.35);
  }

  /** Passo (pequeno ruído grave). */
  step(vol: number): void {
    this.noise(vol * 0.25, 0.06, 500, 'lowpass');
  }

  /** Confirmação de acerto (mais aguda em abate). */
  hitConfirm(killed: boolean): void {
    this.tone(1400, 1400, 0.3, 0.06, 'sine');
    if (killed) this.tone(1800, 1800, 0.3, 0.1, 'sine', 0.07);
  }

  /** Você foi atingido. */
  hurt(): void {
    this.tone(220, 110, 0.5, 0.18, 'sawtooth');
  }

  /** Morte de alguém. */
  death(vol: number): void {
    this.tone(330, 55, vol * 0.6, 0.6, 'triangle');
  }

  private tone(f0: number, f1: number, vol: number, dur: number, type: OscillatorType, delay = 0): void {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private noise(vol: number, dur: number, cutoff: number, filterType: BiquadFilterType): void {
    if (!this.ctx || !this.master || !this.noiseBuf) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = cutoff;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(gain).connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }
}

/** Um segundo de ruído branco, reutilizado por todos os sons de ruído. */
function makeNoise(ctx: AudioContext): AudioBuffer {
  const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}
