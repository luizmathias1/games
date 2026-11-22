// Protocolo de mensagens entre cliente e servidor (JSON sobre WebSocket).
// Tudo que chega do cliente é validado aqui: nunca confie no cliente.
import type { HitPart } from './hitbox';
import type { MoveInput, Vec3 } from './types';

export const ROOM_CODE_LENGTH = 5;
/** Letras sem I, L e O para evitar confusão visual (ex.: I com 1, O com 0). */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ';
export const MAX_NICKNAME = 16;

export interface PlayerInfo {
  id: number;
  nickname: string;
  /** Direção inicial da mira na partida (para o jogador já olhar para o adversário). */
  yaw: number;
}

export interface PlayerSnapshot {
  id: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  crouching: boolean;
  /** Último seq de input que o servidor já processou para este jogador. */
  ack: number;
  health: number;
  alive: boolean;
  /** Segundos até renascer (0 se estiver vivo). */
  respawnIn: number;
  /** Slot da arma em uso (1, 2 ou 3). */
  weapon: number;
  mag: number;
  reserve: number;
  reloading: boolean;
  kills: number;
  deaths: number;
}

export interface SnapshotMessage {
  type: 'snapshot';
  tick: number;
  players: PlayerSnapshot[];
}

/** Eventos pontuais do combate (enviados a todos na sala). */
export type CombatEvent =
  | { type: 'shot'; shooter: number; weapon: number; from: Vec3; to: Vec3; hit: boolean }
  | {
      type: 'hit';
      attacker: number;
      victim: number;
      part: HitPart;
      damage: number;
      killed: boolean;
      from: Vec3;
    }
  | { type: 'death'; victim: number; killer: number; weapon: number };

export type ClientMessage =
  | { type: 'create'; nickname: string }
  | { type: 'join'; code: string; nickname: string }
  | { type: 'input'; inputs: MoveInput[] }
  | { type: 'ping'; t: number }
  | { type: 'leave' };

export type ServerMessage =
  | { type: 'joined'; code: string; playerId: number }
  | { type: 'roomState'; players: PlayerInfo[]; phase: 'waiting' | 'playing' }
  | SnapshotMessage
  | CombatEvent
  | { type: 'error'; message: string }
  | { type: 'pong'; t: number };

/** Limpa o apelido: remove controles, espaços das pontas e limita o tamanho. */
export function cleanNickname(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, MAX_NICKNAME);
  return s.length > 0 ? s : null;
}

/** Valida o código da sala (5 letras do alfabeto permitido). */
export function cleanCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.trim().toUpperCase();
  if (s.length !== ROOM_CODE_LENGTH) return null;
  for (const ch of s) {
    if (!ROOM_CODE_ALPHABET.includes(ch)) return null;
  }
  return s;
}

function clampNumber(v: unknown, min: number, max: number): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  return Math.min(max, Math.max(min, v));
}

/** Valida um comando de movimento. Valores fora da faixa são limitados. */
export function parseMoveInput(v: unknown): MoveInput | null {
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  const seq = typeof o.seq === 'number' && Number.isInteger(o.seq) && o.seq > 0 ? o.seq : null;
  const forward = clampNumber(o.forward, -1, 1);
  const strafe = clampNumber(o.strafe, -1, 1);
  const yaw = clampNumber(o.yaw, -1e6, 1e6);
  const pitch = clampNumber(o.pitch, -Math.PI / 2, Math.PI / 2);
  const slot = clampNumber(o.slot, 0, 3);
  if (seq === null || forward === null || strafe === null || yaw === null || pitch === null || slot === null) {
    return null;
  }
  return {
    seq,
    forward,
    strafe,
    yaw,
    pitch,
    jump: o.jump === true,
    crouch: o.crouch === true,
    run: o.run === true,
    fire: o.fire === true,
    fireEdge: o.fireEdge === true,
    reload: o.reload === true,
    slot: Math.round(slot),
  };
}

/** Converte o texto recebido em uma mensagem válida do cliente, ou null. */
export function parseClientMessage(raw: string): ClientMessage | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof data !== 'object' || data === null) return null;
  const o = data as Record<string, unknown>;

  switch (o.type) {
    case 'create': {
      const nickname = cleanNickname(o.nickname);
      return nickname ? { type: 'create', nickname } : null;
    }
    case 'join': {
      const code = cleanCode(o.code);
      const nickname = cleanNickname(o.nickname);
      return code && nickname ? { type: 'join', code, nickname } : null;
    }
    case 'input': {
      if (!Array.isArray(o.inputs) || o.inputs.length > 16) return null;
      const inputs: MoveInput[] = [];
      for (const item of o.inputs) {
        const cmd = parseMoveInput(item);
        if (cmd) inputs.push(cmd);
      }
      return { type: 'input', inputs };
    }
    case 'ping':
      return typeof o.t === 'number' ? { type: 'ping', t: o.t } : null;
    case 'leave':
      return { type: 'leave' };
    default:
      return null;
  }
}
