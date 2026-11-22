// Gerenciador de salas: cria códigos, entra/sai de salas e repassa inputs.
import { randomInt } from 'node:crypto';
import { buildMap, type MapData } from '../../shared/map';
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH, type ServerMessage } from '../../shared/protocol';
import type { MoveInput } from '../../shared/types';
import { MAX_PLAYERS, PlayerSession, Room } from './room';

export type JoinResult = { ok: true; session: PlayerSession } | { ok: false; error: string };

export class Lobby {
  readonly map: MapData = buildMap();
  private readonly rooms = new Map<string, Room>();
  private nextPlayerId = 1;

  allRooms(): Room[] {
    return [...this.rooms.values()];
  }

  /** Cria uma sala nova com um código de 5 letras e adiciona o criador. */
  createRoom(nickname: string, send: (msg: ServerMessage) => void): PlayerSession {
    const room = new Room(this.newCode(), this.map);
    this.rooms.set(room.code, room);
    return this.addPlayer(room, nickname, send);
  }

  /** Entra em uma sala existente, se houver vaga. */
  join(code: string, nickname: string, send: (msg: ServerMessage) => void): JoinResult {
    const room = this.rooms.get(code);
    if (!room) return { ok: false, error: 'Sala não encontrada. Confira o código.' };
    if (room.players.length >= MAX_PLAYERS) return { ok: false, error: 'Sala cheia.' };
    return { ok: true, session: this.addPlayer(room, nickname, send) };
  }

  /** Remove o jogador da sala. Apaga a sala quando ela fica vazia. */
  leave(session: PlayerSession): void {
    const room = session.room;
    if (!room) return;
    session.room = null;
    const idx = room.players.indexOf(session);
    if (idx >= 0) room.players.splice(idx, 1);

    if (room.players.length === 0) {
      this.rooms.delete(room.code);
      return;
    }
    // Saiu no meio da partida ou depois do fim: a sala volta a esperar outro jogador
    if (room.phase !== 'waiting') room.stopMatch();
    else room.broadcastState();
  }

  onInput(session: PlayerSession, inputs: MoveInput[]): void {
    session.enqueue(inputs);
  }

  private addPlayer(room: Room, nickname: string, send: (msg: ServerMessage) => void): PlayerSession {
    const session = new PlayerSession(this.nextPlayerId++, nickname, send, this.map.spawns[0]);
    session.room = room;
    room.players.push(session);
    send({ type: 'joined', code: room.code, playerId: session.id });
    if (room.players.length === MAX_PLAYERS) room.startMatch();
    else room.broadcastState();
    return session;
  }

  private newCode(): string {
    let code: string;
    do {
      code = '';
      for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
        code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
      }
    } while (this.rooms.has(code));
    return code;
  }
}
