// Tipos compartilhados entre cliente e servidor.

/** Vetor [x, y, z]. Y é "para cima". Z negativo é o lado A do mapa. */
export type Vec3 = [number, number, number];

/** Estado físico de um jogador. y é a altura dos pés. */
export interface BodyState {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  onGround: boolean;
  crouching: boolean;
}

/** Comando de movimento numerado (o cliente envia isso ao servidor). */
export interface MoveInput {
  seq: number; // número sequencial do input (começa em 1)
  forward: number; // -1..1 (S/W)
  strafe: number; // -1..1 (A/D)
  yaw: number; // rotação horizontal da câmera, em radianos
  pitch: number; // rotação vertical da câmera, em radianos
  jump: boolean;
  crouch: boolean;
  run: boolean;
  /** Botão de tiro segurado (usado por armas automáticas). */
  fire: boolean;
  /** Clique novo neste comando (usado por armas semiautomáticas e faca). */
  fireEdge: boolean;
  /** Tecla R apertada. */
  reload: boolean;
  /** Troca de arma pelas teclas 1/2/3 (0 = sem troca). */
  slot: number;
}
