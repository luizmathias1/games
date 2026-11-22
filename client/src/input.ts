// Entrada do jogador: teclado, mouse com Pointer Lock, tiro, mira, recarga e troca de arma.
import { MOUSE, WEAPON_ORDER } from '../../shared/config';
import type { MoveInput } from '../../shared/types';

// Teclas cujo comportamento padrão do navegador atrapalha o jogo
const BLOCKED_KEYS = new Set(['Space', 'ControlLeft', 'ControlRight', 'Tab']);
const PITCH_LIMIT = Math.PI / 2 - 0.01;
/** Velocidade (1/s) com que o coice da arma some. */
const RECOIL_RECOVERY = 7;

const clampPitch = (p: number) => Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, p));

export class InputController {
  /** Rotação horizontal (radianos). 0 = olhando para -Z. */
  yaw = 0;
  /** Rotação vertical do mouse (radianos). Positivo = olhando para cima. */
  pitch = 0;
  /** Coice acumulado da arma. Soma-se à mira e some sozinho com o tempo. */
  recoil = 0;
  /** Botão direito segurado (mira). */
  aiming = false;
  /** Slot da arma em uso (1, 2 ou 3), atualizado pela partida. */
  currentSlot = 1;

  private radPerPixel = MOUSE.radPerPixelPerStep * MOUSE.defaultSlider;
  private keys = new Set<string>();
  private lookDx = 0;
  private lookDy = 0;
  private locked = false;
  // Estados de botão e "bordas" (eventos que valem para um único comando)
  private fireHeld = false;
  private firePressed = false;
  private reloadPressed = false;
  private slotPressed = 0;

  constructor(
    private readonly target: HTMLElement,
    onLockChange: (locked: boolean) => void,
  ) {
    window.addEventListener('keydown', (e) => {
      if (BLOCKED_KEYS.has(e.code)) e.preventDefault();
      this.keys.add(e.code);
      if (e.repeat) return;
      if (e.code === 'KeyR') this.reloadPressed = true;
      const digit = /^Digit([1-3])$/.exec(e.code);
      if (digit) this.slotPressed = Number(digit[1]);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.clearButtons());

    window.addEventListener(
      'wheel',
      (e) => {
        if (!this.locked) return;
        const step = e.deltaY > 0 ? 1 : -1;
        const idx = (this.currentSlot - 1 + step + WEAPON_ORDER.length) % WEAPON_ORDER.length;
        this.slotPressed = idx + 1;
      },
      { passive: true },
    );

    target.addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      if (e.button === 0) {
        this.fireHeld = true;
        this.firePressed = true;
      } else if (e.button === 2) {
        this.aiming = true;
      }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.fireHeld = false;
      if (e.button === 2) this.aiming = false;
    });
    target.addEventListener('contextmenu', (e) => e.preventDefault());

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.target;
      if (!this.locked) {
        this.keys.clear();
        this.clearButtons();
      }
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
    // Alguns contextos (ex.: iframes) recusam o Pointer Lock; o overlay continua visível
    const result = this.target.requestPointerLock() as unknown as Promise<void> | undefined;
    result?.catch(() => console.warn('O navegador recusou o Pointer Lock.'));
  }

  /** Ajusta a sensibilidade. O valor vem do slider (1 a 10). */
  setSensitivity(slider: number): void {
    this.radPerPixel = MOUSE.radPerPixelPerStep * slider;
  }

  /** Aplica o movimento do mouse e o decaimento do coice. Chamado todo frame. */
  applyLook(dt: number): void {
    this.yaw -= this.lookDx * this.radPerPixel;
    this.pitch = clampPitch(this.pitch - this.lookDy * this.radPerPixel);
    this.lookDx = 0;
    this.lookDy = 0;
    this.recoil *= Math.exp(-dt * RECOIL_RECOVERY);
  }

  /** Verdadeiro enquanto a tecla (código, ex.: 'Tab') está apertada. */
  isDown(code: string): boolean {
    return this.keys.has(code);
  }

  /** Mira final (mouse + coice), a mesma que é enviada ao servidor. */
  get aimPitch(): number {
    return clampPitch(this.pitch + this.recoil);
  }

  /** Soma coice vertical (chamado quando um tiro seu é confirmado). */
  addRecoil(amount: number): void {
    this.recoil += amount;
  }

  /** Converte o estado atual em um comando numerado. Consome as bordas de tecla. */
  buildCommand(seq: number): MoveInput {
    const k = this.keys;
    const on = this.locked;
    const cmd: MoveInput = {
      seq,
      forward: on ? (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0) : 0,
      strafe: on ? (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0) : 0,
      yaw: this.yaw,
      pitch: this.aimPitch,
      jump: on && k.has('Space'),
      crouch: on && (k.has('ControlLeft') || k.has('ControlRight')),
      run: on && (k.has('ShiftLeft') || k.has('ShiftRight')),
      fire: on && this.fireHeld,
      fireEdge: on && this.firePressed,
      reload: on && this.reloadPressed,
      slot: on ? this.slotPressed : 0,
    };
    this.firePressed = false;
    this.reloadPressed = false;
    this.slotPressed = 0;
    return cmd;
  }

  private clearButtons(): void {
    this.fireHeld = false;
    this.firePressed = false;
    this.aiming = false;
  }
}
