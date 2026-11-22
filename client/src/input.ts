// Entrada do jogador: teclado, mouse com Pointer Lock e sensibilidade ajustável.
import { MOUSE } from '../../shared/config';
import type { MoveInput } from '../../shared/types';

// Teclas cujo comportamento padrão do navegador atrapalha o jogo
const BLOCKED_KEYS = new Set(['Space', 'ControlLeft', 'ControlRight', 'Tab']);
const PITCH_LIMIT = Math.PI / 2 - 0.01;

export class InputController {
  /** Rotação horizontal (radianos). 0 = olhando para -Z. */
  yaw = 0;
  /** Rotação vertical (radianos). Positivo = olhando para cima. */
  pitch = 0;

  private radPerPixel = MOUSE.radPerPixelPerStep * MOUSE.defaultSlider;
  private keys = new Set<string>();
  private lookDx = 0;
  private lookDy = 0;
  private locked = false;

  constructor(
    private readonly target: HTMLElement,
    onLockChange: (locked: boolean) => void,
  ) {
    window.addEventListener('keydown', (e) => {
      if (BLOCKED_KEYS.has(e.code)) e.preventDefault();
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.target;
      if (!this.locked) this.keys.clear();
      onLockChange(this.locked);
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.lookDx += e.movementX;
      this.lookDy += e.movementY;
    });
  }

  /** Pede o Pointer Lock (precisa ser chamado a partir de um clique). */
  requestLock(): void {
    this.target.requestPointerLock();
  }

  /** Ajusta a sensibilidade. O valor vem do slider (1 a 10). */
  setSensitivity(slider: number): void {
    this.radPerPixel = MOUSE.radPerPixelPerStep * slider;
  }

  /** Aplica o movimento de mouse acumulado desde o último frame. */
  applyLook(): void {
    this.yaw -= this.lookDx * this.radPerPixel;
    this.pitch -= this.lookDy * this.radPerPixel;
    this.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, this.pitch));
    this.lookDx = 0;
    this.lookDy = 0;
  }

  /** Converte o estado das teclas em um comando de movimento numerado. */
  buildCommand(seq: number): MoveInput {
    const k = this.keys;
    const on = this.locked;
    return {
      seq,
      forward: on ? (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0) : 0,
      strafe: on ? (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0) : 0,
      yaw: this.yaw,
      pitch: this.pitch,
      jump: on && k.has('Space'),
      crouch: on && (k.has('ControlLeft') || k.has('ControlRight')),
      run: on && (k.has('ShiftLeft') || k.has('ShiftRight')),
    };
  }
}
