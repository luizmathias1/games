// Partida no cliente:
// - Predição: o jogador local roda a mesma física do servidor com os próprios comandos.
// - Reconciliação: ao chegar uma snapshot, volta ao estado confirmado e reaplica os
//   comandos ainda não confirmados; a diferença visual é suavizada.
// - Interpolação: os adversários são desenhados com atraso (interpDelayMs) a partir
//   de um buffer de snapshots, para o movimento ficar suave mesmo com lag.
import * as THREE from 'three';
import { LAG_COMP, PLAYER, TICK_DT, WEAPONS, WEAPON_ORDER } from '../../shared/config';
import type { MapData } from '../../shared/map';
import { stepBody } from '../../shared/physics';
import type {
  ClientMessage,
  CombatEvent,
  PlayerInfo,
  PlayerSnapshot,
  SnapshotMessage,
} from '../../shared/protocol';
import type { BodyState, MoveInput } from '../../shared/types';
import type { Effects } from './effects';
import type { Hud } from './hud';
import type { InputController } from './input';
import { createPlayerModel, type PlayerModel } from './playerModel';
import type { ViewModel } from './viewmodel';

const TEAM_COLORS = ['#ff7a3d', '#3da5ff'];
/** Quantos comandos recentes reenviar em cada pacote (tolera perda de pacotes). */
const RESEND_HISTORY = 4;
/** Comandos não confirmados que guardamos para a reconciliação. */
const MAX_PENDING = 120;
/** Por quanto tempo guardamos snapshots para a interpolação (ms). */
const BUFFER_MS = 1000;
const CROUCH_SCALE = PLAYER.crouchHeight / PLAYER.standHeight;
const DEFAULT_FOV = 75;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

interface Pending {
  cmd: MoveInput;
  body: BodyState;
}

interface Vec {
  x: number;
  y: number;
  z: number;
}

interface SnapshotFrame {
  t: number;
  players: Map<number, PlayerSnapshot>;
}

function bodyFrom(p: PlayerSnapshot): BodyState {
  return {
    x: p.x,
    y: p.y,
    z: p.z,
    vx: p.vx,
    vy: p.vy,
    vz: p.vz,
    onGround: p.onGround,
    crouching: p.crouching,
  };
}

export class Match {
  localId: number | null = null;
  /** Verdadeiro enquanto a partida está em andamento. */
  playing = false;

  private views = new Map<number, PlayerModel>();
  private buffer: SnapshotFrame[] = [];
  private seq = 1;
  private recent: MoveInput[] = [];
  private eyeHeight: number = PLAYER.standEyeHeight;

  // Predição do jogador local
  private predicted: BodyState | null = null;
  private prevPredicted: BodyState | null = null;
  private pending: Pending[] = [];
  /** Diferença visual entre a posição mostrada e a predita; some com o tempo. */
  private offset: Vec = { x: 0, y: 0, z: 0 };

  constructor(
    private readonly scene: THREE.Scene,
    private readonly input: InputController,
    private readonly send: (msg: ClientMessage) => void,
    private readonly map: MapData,
    private readonly fx: Effects,
    private readonly hud: Hud,
    private readonly viewmodel: ViewModel,
  ) {}

  /** Atualiza a lista de jogadores e cria/remove as malhas dos adversários. */
  setRoster(players: PlayerInfo[], playing: boolean): void {
    const ids = new Set(players.map((p) => p.id));
    for (const [id, model] of this.views) {
      if (!ids.has(id)) {
        this.scene.remove(model.group);
        this.views.delete(id);
      }
    }
    players.forEach((p, index) => {
      if (p.id === this.localId || this.views.has(p.id)) return;
      const model = createPlayerModel(p.nickname, TEAM_COLORS[index % TEAM_COLORS.length]);
      this.scene.add(model.group);
      this.views.set(p.id, model);
    });

    this.playing = playing;
    if (!playing) this.resetPrediction();
  }

  /** Limpa tudo ao sair da sala. */
  reset(): void {
    for (const model of this.views.values()) this.scene.remove(model.group);
    this.views.clear();
    this.buffer = [];
    this.recent = [];
    this.playing = false;
    this.localId = null;
    this.resetPrediction();
  }

  private resetPrediction(): void {
    this.predicted = null;
    this.prevPredicted = null;
    this.pending = [];
    this.offset = { x: 0, y: 0, z: 0 };
  }

  onSnapshot(msg: SnapshotMessage): void {
    const now = performance.now();
    const players = new Map<number, PlayerSnapshot>();
    for (const p of msg.players) players.set(p.id, p);
    this.buffer.push({ t: now, players });
    while (this.buffer.length > 2 && now - this.buffer[0].t > BUFFER_MS) this.buffer.shift();

    const me = this.localId === null ? undefined : players.get(this.localId);
    if (!me) return;
    if (!me.alive) {
      this.resetPrediction(); // morto: o servidor manda a posição, sem predição
    } else if (!this.predicted) {
      this.predicted = bodyFrom(me);
      this.prevPredicted = this.predicted;
      this.pending = [];
      this.offset = { x: 0, y: 0, z: 0 };
    } else {
      this.reconcile(bodyFrom(me), me.ack);
    }
  }

  /**
   * Volta ao estado confirmado pelo servidor (ack = último comando que ele processou)
   * e reaplica os comandos que ainda não foram confirmados.
   */
  private reconcile(server: BodyState, ack: number): void {
    const i = this.pending.findIndex((p) => p.cmd.seq === ack);
    if (i < 0 || !this.predicted) return;

    // Posição que estava na tela antes da correção
    const shownBefore = {
      x: this.predicted.x + this.offset.x,
      y: this.predicted.y + this.offset.y,
      z: this.predicted.z + this.offset.z,
    };

    this.pending = this.pending.slice(i + 1);
    let body = server;
    for (const p of this.pending) {
      body = stepBody(body, p.cmd, TICK_DT, this.map);
      p.body = body;
    }
    this.predicted = body;
    this.prevPredicted = body;

    // Correção grande (ex.: teleporte) vira um snap; pequena é suavizada
    const dx = shownBefore.x - body.x;
    const dy = shownBefore.y - body.y;
    const dz = shownBefore.z - body.z;
    const err = Math.hypot(dx, dy, dz);
    this.offset = err > 2 ? { x: 0, y: 0, z: 0 } : { x: dx, y: dy, z: dz };
  }

  /** Eventos pontuais de combate: tiros, acertos e mortes. */
  onEvent(ev: CombatEvent): void {
    switch (ev.type) {
      case 'shot': {
        const mine = ev.shooter === this.localId;
        this.fx.tracer(ev.from, ev.to, mine);
        if (mine) {
          const def = WEAPONS[WEAPON_ORDER[ev.weapon - 1]];
          this.input.addRecoil(def.recoil);
          this.viewmodel.fired();
        }
        break;
      }
      case 'hit':
        if (ev.attacker === this.localId) this.hud.hitmarker(ev.killed);
        break;
      case 'death':
        break;
    }
  }

  /** Chamado a 30 Hz: envia o comando atual e o aplica na predição. */
  sendTick(): void {
    if (!this.playing) return;
    const cmd = this.input.buildCommand(this.seq++);
    this.recent.push(cmd);
    if (this.recent.length > RESEND_HISTORY) this.recent.shift();
    this.send({ type: 'input', inputs: [...this.recent] });

    if (this.predicted) {
      this.prevPredicted = this.predicted;
      this.predicted = stepBody(this.predicted, cmd, TICK_DT, this.map);
      this.pending.push({ cmd, body: this.predicted });
      if (this.pending.length > MAX_PENDING) this.pending.shift();
    }
  }

  /** Estado do jogador local na última snapshot. */
  private latestMe(): PlayerSnapshot | undefined {
    if (this.localId === null || this.buffer.length === 0) return undefined;
    return this.buffer[this.buffer.length - 1].players.get(this.localId);
  }

  /** Posição de um adversário no instante renderT, interpolada entre snapshots. */
  private sampleRemote(id: number, renderT: number): PlayerSnapshot | undefined {
    const b = this.buffer;
    if (b.length === 0) return undefined;
    let i = 0;
    while (i + 1 < b.length && b[i + 1].t <= renderT) i++;
    const a = b[i];
    const c = b[Math.min(i + 1, b.length - 1)];
    const pa = a.players.get(id);
    const pc = c.players.get(id);
    if (!pa || !pc) return pc ?? pa;
    const span = c.t - a.t;
    const t = span > 0 ? Math.min(1, Math.max(0, (renderT - a.t) / span)) : 1;
    return {
      ...pc,
      x: lerp(pa.x, pc.x, t),
      y: lerp(pa.y, pc.y, t),
      z: lerp(pa.z, pc.z, t),
      yaw: lerp(pa.yaw, pc.yaw, t),
    };
  }

  /** Chamado todo frame. alpha (0..1) interpola a predição entre dois passos de 30 Hz. */
  update(camera: THREE.PerspectiveCamera, dt: number, alpha: number): void {
    if (!this.playing) return;
    const renderT = performance.now() - LAG_COMP.interpDelayMs;

    for (const [id, model] of this.views) {
      const s = this.sampleRemote(id, renderT);
      if (!s) continue;
      model.group.position.set(s.x, s.y, s.z);
      model.group.rotation.y = s.yaw;
      model.body.scale.y = s.crouching ? CROUCH_SCALE : 1;
      model.group.visible = s.alive;
    }

    const me = this.latestMe();
    if (!me) return;

    // A diferença de reconciliação some em ~0,1 s
    const decay = Math.exp(-dt * 12);
    this.offset.x *= decay;
    this.offset.y *= decay;
    this.offset.z *= decay;

    // Câmera: predição do jogador local (ou posição do servidor se estiver morto)
    let pos: Vec;
    let crouching: boolean;
    if (me.alive && this.predicted && this.prevPredicted) {
      const p = this.predicted;
      const q = this.prevPredicted;
      pos = {
        x: lerp(q.x, p.x, alpha) + this.offset.x,
        y: lerp(q.y, p.y, alpha) + this.offset.y,
        z: lerp(q.z, p.z, alpha) + this.offset.z,
      };
      crouching = p.crouching;
    } else {
      pos = { x: me.x, y: me.y, z: me.z };
      crouching = me.crouching;
    }
    const eyeTarget = crouching ? PLAYER.crouchEyeHeight : PLAYER.standEyeHeight;
    this.eyeHeight += (eyeTarget - this.eyeHeight) * Math.min(1, dt * 12);
    camera.position.set(pos.x, pos.y + this.eyeHeight, pos.z);
    camera.rotation.set(this.input.aimPitch, this.input.yaw, 0);

    // Arma em uso, zoom da mira e HUD
    const weaponId = WEAPON_ORDER[me.weapon - 1];
    const def = WEAPONS[weaponId];
    this.input.currentSlot = me.weapon;
    const aiming = this.input.aiming && me.alive && def.aimFov !== null;
    const fov = aiming ? def.aimFov! : DEFAULT_FOV;
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = lerp(camera.fov, fov, Math.min(1, dt * 12));
      camera.updateProjectionMatrix();
    }
    this.viewmodel.show(weaponId, aiming, dt);
    this.hud.update(me, def);
  }
}
