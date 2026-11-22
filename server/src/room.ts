// Sala e sessão de jogador no servidor. O servidor é autoritativo:
// ele simula a física a partir dos comandos recebidos e envia snapshots.
import { TICK_DT } from '../../shared/config';
import type { MapData } from '../../shared/map';
import { createBody, stepBody } from '../../shared/physics';
import type { PlayerInfo, PlayerSnapshot, ServerMessage } from '../../shared/protocol';
import type { BodyState, MoveInput, Vec3 } from '../../shared/types';

export const MAX_PLAYERS = 2;
/** No máximo 2 comandos simulados por tick (evita acelerar o jogo por fora). */
const MAX_STEPS_PER_TICK = 2;
/** Limite da fila de comandos guardados por jogador. */
const MAX_QUEUE = 12;

export class PlayerSession {
  body: BodyState;
  /** Comandos recebidos e ainda não simulados, em ordem. */
  queue: MoveInput[] = [];
  /** Maior seq já colocado na fila (ignora duplicados). */
  lastQueued = 0;
  /** Maior seq já simulado pelo servidor. */
  lastProcessed = 0;
  yaw = 0;
  pitch = 0;
  lastCmd: MoveInput | null = null;
  room: Room | null = null;

  constructor(
    readonly id: number,
    readonly nickname: string,
    readonly send: (msg: ServerMessage) => void,
    spawn: Vec3,
  ) {
    this.body = createBody(spawn);
  }

  /** Recebe comandos do cliente. Duplicados e antigos são ignorados. */
  enqueue(inputs: MoveInput[]): void {
    for (const cmd of inputs) {
      if (cmd.seq <= this.lastQueued) continue;
      this.queue.push(cmd);
      this.lastQueued = cmd.seq;
    }
    if (this.queue.length > MAX_QUEUE) {
      this.queue.splice(0, this.queue.length - MAX_QUEUE);
    }
  }
}

export class Room {
  readonly players: PlayerSession[] = [];
  phase: 'waiting' | 'playing' = 'waiting';
  tick = 0;

  constructor(
    readonly code: string,
    readonly map: MapData,
  ) {}

  info(): PlayerInfo[] {
    return this.players.map((p) => ({ id: p.id, nickname: p.nickname, yaw: p.yaw }));
  }

  broadcast(msg: ServerMessage): void {
    for (const p of this.players) p.send(msg);
  }

  broadcastState(): void {
    this.broadcast({ type: 'roomState', players: this.info(), phase: this.phase });
  }

  /** Começa a partida: cada jogador vai para um spawn de lados opostos. */
  startMatch(): void {
    this.phase = 'playing';
    this.players.forEach((p, i) => {
      // Jogador 0 nasce no lado A (olha para +Z); jogador 1 no lado B (olha para -Z)
      p.body = createBody(this.map.spawns[i === 0 ? 0 : 2]);
      p.yaw = i === 0 ? Math.PI : 0;
      p.pitch = 0;
      p.queue = [];
      p.lastCmd = null;
    });
    this.broadcastState();
  }

  /** Volta para a sala de espera (algum jogador saiu). */
  stopMatch(): void {
    this.phase = 'waiting';
    this.broadcastState();
  }

  /** Um tick do servidor: aplica os comandos e envia o snapshot. */
  simulate(): void {
    if (this.phase !== 'playing') return;
    this.tick++;
    for (const p of this.players) this.processInputs(p);

    const snapshot: PlayerSnapshot[] = this.players.map((p) => ({
      id: p.id,
      x: p.body.x,
      y: p.body.y,
      z: p.body.z,
      yaw: p.yaw,
      pitch: p.pitch,
      crouching: p.body.crouching,
      ack: p.lastProcessed,
    }));
    this.broadcast({ type: 'snapshot', tick: this.tick, players: snapshot });
  }

  private processInputs(p: PlayerSession): void {
    let steps = 0;
    while (steps < MAX_STEPS_PER_TICK && p.queue.length > 0) {
      const cmd = p.queue.shift()!;
      p.body = stepBody(p.body, cmd, TICK_DT, this.map);
      p.lastProcessed = cmd.seq;
      p.yaw = cmd.yaw;
      p.pitch = cmd.pitch;
      p.lastCmd = cmd;
      steps++;
    }
    if (steps === 0) {
      // Sem comando novo: continua a física (gravidade) com um comando parado
      const base: MoveInput = p.lastCmd ?? {
        seq: p.lastProcessed,
        forward: 0,
        strafe: 0,
        yaw: p.yaw,
        pitch: p.pitch,
        jump: false,
        crouch: false,
        run: false,
      };
      p.body = stepBody(p.body, { ...base, forward: 0, strafe: 0, jump: false }, TICK_DT, this.map);
    }
  }
}
