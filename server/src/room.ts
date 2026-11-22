// Sala e sessão de jogador no servidor. O servidor é autoritativo:
// simula a física e o combate a partir dos comandos recebidos e envia snapshots.
import {
  HIT_MULTIPLIER,
  LAG_COMP,
  MATCH,
  PLAYER,
  RESPAWN_SECONDS,
  TICK_DT,
  WEAPONS,
  WEAPON_ORDER,
  type WeaponId,
} from '../../shared/config';
import { traceShot, type HitPart, type Target } from '../../shared/hitbox';
import type { MapData } from '../../shared/map';
import { createBody, stepBody } from '../../shared/physics';
import type {
  CombatEvent,
  PlayerInfo,
  PlayerSnapshot,
  RoomPhase,
  ServerMessage,
} from '../../shared/protocol';
import type { BodyState, MoveInput, Vec3 } from '../../shared/types';

export const MAX_PLAYERS = 2;
/** No máximo 2 comandos simulados por tick (evita acelerar o jogo por fora). */
const MAX_STEPS_PER_TICK = 2;
/** Limite da fila de comandos guardados por jogador. */
const MAX_QUEUE = 12;
/** Quantos ticks de posição guardamos por jogador (1,5 s, para a compensação de lag). */
const HISTORY_TICKS = 45;

/** Posição de um jogador em um tick passado (usada para voltar no tempo). */
interface PastPose {
  tick: number;
  x: number;
  y: number;
  z: number;
  crouching: boolean;
}

interface WeaponState {
  mag: number;
  reserve: number;
  /** Tempo (s) em que a arma pode disparar de novo. */
  nextFireAt: number;
}

function freshAmmo(): Record<WeaponId, WeaponState> {
  return {
    rifle: { mag: WEAPONS.rifle.magazine, reserve: WEAPONS.rifle.reserve, nextFireAt: 0 },
    pistol: { mag: WEAPONS.pistol.magazine, reserve: WEAPONS.pistol.reserve, nextFireAt: 0 },
    knife: { mag: 0, reserve: 0, nextFireAt: 0 },
  };
}

/** Direção do tiro a partir de yaw/pitch, com desvio aleatório (dispersão). */
function aimDirection(yaw: number, pitch: number, spread: number): Vec3 {
  const y = yaw + (Math.random() * 2 - 1) * spread;
  const p = pitch + (Math.random() * 2 - 1) * spread;
  const cp = Math.cos(p);
  return [-Math.sin(y) * cp, Math.sin(p), -Math.cos(y) * cp];
}

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

  // Combate
  health: number = PLAYER.maxHealth;
  alive = true;
  /** Tempo do servidor (s) em que o jogador renasce. */
  respawnAt = 0;
  weapon: WeaponId = 'rifle';
  ammo = freshAmmo();
  /** Tempo do servidor em que a recarga termina (null = não está recarregando). */
  reloadEnd: number | null = null;
  kills = 0;
  deaths = 0;
  /** Pediu revanche depois do fim da partida. */
  wantsRematch = false;

  /** Ping (ida e volta) informado pelo próprio cliente, em ms. */
  rttMs = 0;
  /** Posições dos últimos ticks, para a compensação de lag. */
  history: PastPose[] = [];

  constructor(
    readonly id: number,
    readonly nickname: string,
    readonly send: (msg: ServerMessage) => void,
    spawn: Vec3,
  ) {
    this.body = createBody(spawn);
  }

  /** Guarda a posição atual no tick informado. */
  recordPose(tick: number): void {
    this.history.push({ tick, x: this.body.x, y: this.body.y, z: this.body.z, crouching: this.body.crouching });
    if (this.history.length > HISTORY_TICKS) this.history.shift();
  }

  /** Posição mais recente que não seja posterior ao tick pedido (ou null). */
  poseAt(tick: number): PastPose | null {
    for (let i = this.history.length - 1; i >= 0; i--) {
      if (this.history[i].tick <= tick) return this.history[i];
    }
    return null;
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
  phase: RoomPhase = 'waiting';
  tick = 0;
  /** Vencedor da última partida (null = empate). */
  winnerId: number | null = null;
  /** Tempo do servidor em segundos (tick * TICK_DT). */
  private now = 0;
  /** Tempo do servidor em que a partida começou. */
  private matchStart = 0;

  constructor(
    readonly code: string,
    readonly map: MapData,
  ) {}

  info(): PlayerInfo[] {
    return this.players.map((p) => ({
      id: p.id,
      nickname: p.nickname,
      yaw: p.yaw,
      rematch: p.wantsRematch,
    }));
  }

  broadcast(msg: ServerMessage): void {
    for (const p of this.players) p.send(msg);
  }

  broadcastState(): void {
    this.broadcast({
      type: 'roomState',
      players: this.info(),
      phase: this.phase,
      winnerId: this.winnerId,
    });
  }

  /** Começa a partida: cada jogador vai para um spawn de lados opostos. */
  startMatch(): void {
    this.phase = 'playing';
    this.winnerId = null;
    this.matchStart = this.now;
    this.players.forEach((p, i) => {
      p.wantsRematch = false;
      // Jogador 0 nasce no lado A (olha para +Z); jogador 1 no lado B (olha para -Z)
      p.body = createBody(this.map.spawns[i === 0 ? 0 : 2]);
      p.yaw = i === 0 ? Math.PI : 0;
      p.pitch = 0;
      p.queue = [];
      p.lastCmd = null;
      p.health = PLAYER.maxHealth;
      p.alive = true;
      p.ammo = freshAmmo();
      p.weapon = 'rifle';
      p.reloadEnd = null;
      p.kills = 0;
      p.deaths = 0;
    });
    this.broadcastState();
  }

  /** Volta para a sala de espera (algum jogador saiu). */
  stopMatch(): void {
    this.phase = 'waiting';
    this.winnerId = null;
    for (const p of this.players) p.wantsRematch = false;
    this.broadcastState();
  }

  /** Encerra a partida. winnerId null = empate. */
  endMatch(winnerId: number | null): void {
    this.phase = 'ended';
    this.winnerId = winnerId;
    this.broadcastState();
  }

  /** Jogador pede revanche. A partida recomeça quando os dois pedirem. */
  requestRematch(session: PlayerSession): void {
    if (this.phase !== 'ended') return;
    session.wantsRematch = true;
    if (this.players.length === MAX_PLAYERS && this.players.every((q) => q.wantsRematch)) {
      this.startMatch();
    } else {
      this.broadcastState();
    }
  }

  /** Um tick do servidor: aplica comandos, combate e envia o snapshot. */
  simulate(): void {
    if (this.phase !== 'playing') return;
    this.tick++;
    this.now = this.tick * TICK_DT;

    // Fim do tempo: quem tiver mais abates vence (empate se igualar)
    if (this.now - this.matchStart >= MATCH.durationSeconds) {
      this.endMatch(this.leaderId());
      return;
    }

    for (const p of this.players) {
      if (!p.alive) {
        this.dropInputs(p);
        if (this.now >= p.respawnAt) this.respawn(p);
      } else {
        this.processInputs(p);
        if (p.reloadEnd !== null && this.now >= p.reloadEnd) this.finishReload(p);
      }
      p.recordPose(this.tick);
    }

    const snapshot: PlayerSnapshot[] = this.players.map((p) => {
      const ws = p.ammo[p.weapon];
      return {
        id: p.id,
        x: p.body.x,
        y: p.body.y,
        z: p.body.z,
        yaw: p.yaw,
        pitch: p.pitch,
        crouching: p.body.crouching,
        ack: p.lastProcessed,
        health: p.health,
        alive: p.alive,
        respawnIn: p.alive ? 0 : Math.max(0, p.respawnAt - this.now),
        weapon: WEAPONS[p.weapon].slot,
        mag: ws.mag,
        reserve: ws.reserve,
        reloading: p.reloadEnd !== null,
        kills: p.kills,
        deaths: p.deaths,
        vx: p.body.vx,
        vy: p.body.vy,
        vz: p.body.vz,
        onGround: p.body.onGround,
      };
    });
    const timeLeft = Math.max(0, MATCH.durationSeconds - (this.now - this.matchStart));
    this.broadcast({ type: 'snapshot', tick: this.tick, players: snapshot, timeLeft });
  }

  /** Id do jogador com mais abates (null se houver empate ou ninguém). */
  private leaderId(): number | null {
    if (this.players.length === 0) return null;
    const best = Math.max(...this.players.map((p) => p.kills));
    const leaders = this.players.filter((p) => p.kills === best);
    return leaders.length === 1 ? leaders[0].id : null;
  }

  private processInputs(p: PlayerSession): void {
    let steps = 0;
    while (steps < MAX_STEPS_PER_TICK && p.queue.length > 0) {
      const cmd = p.queue.shift()!;
      this.applyCommand(p, cmd);
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
        fire: false,
        fireEdge: false,
        reload: false,
        slot: 0,
      };
      p.body = stepBody(p.body, { ...base, forward: 0, strafe: 0, jump: false }, TICK_DT, this.map);
    }
  }

  /** Descarta comandos de quem está morto (sem movimento nem tiro). */
  private dropInputs(p: PlayerSession): void {
    if (p.queue.length > 0) {
      p.lastProcessed = p.queue[p.queue.length - 1].seq;
      p.queue = [];
    }
  }

  /** Aplica um comando: movimento, troca de arma, recarga e tiro, nessa ordem. */
  private applyCommand(p: PlayerSession, cmd: MoveInput): void {
    p.body = stepBody(p.body, cmd, TICK_DT, this.map);
    p.yaw = cmd.yaw;
    p.pitch = cmd.pitch;
    p.lastCmd = cmd;
    p.lastProcessed = cmd.seq;

    if (cmd.slot >= 1 && cmd.slot <= WEAPON_ORDER.length) {
      const next = WEAPON_ORDER[cmd.slot - 1];
      if (next !== p.weapon) {
        p.weapon = next;
        p.reloadEnd = null; // trocar de arma cancela a recarga
      }
    }
    if (cmd.reload) this.startReload(p);

    const def = WEAPONS[p.weapon];
    const wantsFire = def.auto ? cmd.fire : cmd.fireEdge;
    if (wantsFire) this.fire(p);
  }

  private startReload(p: PlayerSession): void {
    const def = WEAPONS[p.weapon];
    const ws = p.ammo[p.weapon];
    if (def.magazine === 0 || p.reloadEnd !== null) return;
    if (ws.mag >= def.magazine || ws.reserve <= 0) return;
    p.reloadEnd = this.now + def.reloadTime;
  }

  private finishReload(p: PlayerSession): void {
    const def = WEAPONS[p.weapon];
    const ws = p.ammo[p.weapon];
    const take = Math.min(def.magazine - ws.mag, ws.reserve);
    ws.mag += take;
    ws.reserve -= take;
    p.reloadEnd = null;
  }

  /** Tenta disparar: respeita cadência, recarga e munição. */
  private fire(p: PlayerSession): void {
    const def = WEAPONS[p.weapon];
    const ws = p.ammo[p.weapon];
    if (p.reloadEnd !== null || this.now < ws.nextFireAt) return;
    if (def.magazine > 0) {
      if (ws.mag <= 0) return;
      ws.mag--;
    }
    ws.nextFireAt = this.now + def.fireInterval;

    const eyeY = p.body.y + (p.body.crouching ? PLAYER.crouchEyeHeight : PLAYER.standEyeHeight);
    const origin: Vec3 = [p.body.x, eyeY, p.body.z];
    const dir = aimDirection(p.yaw, p.pitch, def.spread);

    const result = traceShot(origin, dir, def.range, this.map, this.targetsSeenBy(p), p.id);

    if (def.magazine > 0) {
      const to: Vec3 = [
        origin[0] + dir[0] * result.distance,
        origin[1] + dir[1] * result.distance,
        origin[2] + dir[2] * result.distance,
      ];
      this.emit({ type: 'shot', shooter: p.id, weapon: def.slot, from: origin, to, hit: result.hit !== null });
    }

    if (result.hit) {
      const victim = this.players.find((q) => q.id === result.hit!.id);
      if (victim) this.applyHit(p, victim, result.hit.part, origin, def.slot, def.damage);
    }
  }

  /**
   * Posições dos adversários como o atirador as via, com compensação de lag:
   * volta no tempo metade do ping + atraso de interpolação (limitado a maxRewindMs).
   */
  private targetsSeenBy(shooter: PlayerSession): Target[] {
    const rewindMs = Math.min(LAG_COMP.maxRewindMs, shooter.rttMs / 2 + LAG_COMP.interpDelayMs);
    const pastTick = this.tick - Math.round((rewindMs / 1000) / TICK_DT);
    return this.players
      .filter((q) => q.alive && q !== shooter)
      .map((q) => {
        const pose = q.poseAt(pastTick);
        if (pose) return { id: q.id, x: pose.x, y: pose.y, z: pose.z, crouching: pose.crouching };
        return { id: q.id, x: q.body.x, y: q.body.y, z: q.body.z, crouching: q.body.crouching };
      });
  }

  private applyHit(
    attacker: PlayerSession,
    victim: PlayerSession,
    part: HitPart,
    from: Vec3,
    weaponSlot: number,
    baseDamage: number,
  ): void {
    const damage = Math.round(baseDamage * HIT_MULTIPLIER[part]);
    victim.health = Math.max(0, victim.health - damage);
    const killed = victim.health === 0;
    this.emit({ type: 'hit', attacker: attacker.id, victim: victim.id, part, damage, killed, from });

    if (killed) {
      victim.alive = false;
      victim.deaths++;
      attacker.kills++;
      victim.respawnAt = this.now + RESPAWN_SECONDS;
      victim.reloadEnd = null;
      victim.queue = [];
      this.emit({ type: 'death', victim: victim.id, killer: attacker.id, weapon: weaponSlot });
      if (attacker.kills >= MATCH.killsToWin) this.endMatch(attacker.id);
    }
  }

  /** Renasce no spawn mais longe dos adversários vivos. */
  private respawn(p: PlayerSession): void {
    const enemies = this.players.filter((q) => q !== p && q.alive);
    let best = this.map.spawns[0];
    let bestDist = -1;
    for (const s of this.map.spawns) {
      let minDist = Infinity;
      for (const e of enemies) {
        minDist = Math.min(minDist, Math.hypot(e.body.x - s[0], e.body.z - s[2]));
      }
      if (minDist === Infinity) minDist = 1e9; // sem adversário vivo: qualquer spawn serve
      if (minDist > bestDist) {
        bestDist = minDist;
        best = s;
      }
    }
    p.body = createBody(best);
    p.health = PLAYER.maxHealth;
    p.alive = true;
    p.ammo = freshAmmo();
    p.weapon = 'rifle';
    p.reloadEnd = null;
    p.queue = [];
    p.lastCmd = null;
  }

  private emit(event: CombatEvent): void {
    this.broadcast(event);
  }
}
