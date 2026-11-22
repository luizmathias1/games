// Partida no cliente: envia comandos ao servidor, mostra os adversários,
// posiciona a câmera e repassa eventos de combate para efeitos e HUD.
// A predição do jogador local entra na etapa 4.
import * as THREE from 'three';
import { PLAYER, TICK_DT, WEAPONS, WEAPON_ORDER } from '../../shared/config';
import type {
  ClientMessage,
  CombatEvent,
  PlayerInfo,
  PlayerSnapshot,
  SnapshotMessage,
} from '../../shared/protocol';
import type { MoveInput } from '../../shared/types';
import type { Effects } from './effects';
import type { InputController } from './input';
import type { Hud } from './hud';
import { createPlayerModel, type PlayerModel } from './playerModel';
import type { ViewModel } from './viewmodel';

const TEAM_COLORS = ['#ff7a3d', '#3da5ff'];
/** Quantos comandos recentes reenviar em cada pacote (tolera perda de pacotes). */
const RESEND_HISTORY = 4;
const CROUCH_SCALE = PLAYER.crouchHeight / PLAYER.standHeight;
const DEFAULT_FOV = 75;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export class Match {
  localId: number | null = null;
  /** Verdadeiro enquanto a partida está em andamento. */
  playing = false;

  private views = new Map<number, PlayerModel>();
  private prev = new Map<number, PlayerSnapshot>();
  private curr = new Map<number, PlayerSnapshot>();
  private snapAt = 0;
  private seq = 1;
  private recent: MoveInput[] = [];
  private eyeHeight: number = PLAYER.standEyeHeight;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly input: InputController,
    private readonly send: (msg: ClientMessage) => void,
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
    if (!playing) {
      this.prev.clear();
      this.curr.clear();
    }
  }

  /** Limpa tudo ao sair da sala. */
  reset(): void {
    for (const model of this.views.values()) this.scene.remove(model.group);
    this.views.clear();
    this.prev.clear();
    this.curr.clear();
    this.recent = [];
    this.playing = false;
    this.localId = null;
  }

  onSnapshot(msg: SnapshotMessage): void {
    this.prev = this.curr;
    const next = new Map<number, PlayerSnapshot>();
    for (const p of msg.players) next.set(p.id, p);
    this.curr = next;
    this.snapAt = performance.now();
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

  /** Chamado a 30 Hz: manda o comando atual (com os recentes) ao servidor. */
  sendTick(): void {
    if (!this.playing) return;
    const cmd = this.input.buildCommand(this.seq++);
    this.recent.push(cmd);
    if (this.recent.length > RESEND_HISTORY) this.recent.shift();
    this.send({ type: 'input', inputs: [...this.recent] });
  }

  /** Chamado todo frame: interpola os adversários, câmera, arma e HUD. */
  update(camera: THREE.PerspectiveCamera, dt: number): void {
    if (!this.playing) return;
    const alpha = Math.min(1, (performance.now() - this.snapAt) / (TICK_DT * 1000));

    for (const [id, model] of this.views) {
      const to = this.curr.get(id);
      if (!to) continue;
      const from = this.prev.get(id) ?? to;
      model.group.position.set(
        lerp(from.x, to.x, alpha),
        lerp(from.y, to.y, alpha),
        lerp(from.z, to.z, alpha),
      );
      model.group.rotation.y = to.yaw;
      model.body.scale.y = to.crouching ? CROUCH_SCALE : 1;
      model.group.visible = to.alive;
    }

    const me = this.localId === null ? undefined : this.curr.get(this.localId);
    if (!me) return;
    const from = this.prev.get(this.localId!) ?? me;

    // Câmera: posição vem do servidor, mira vem do mouse
    const eyeTarget = me.crouching ? PLAYER.crouchEyeHeight : PLAYER.standEyeHeight;
    this.eyeHeight += (eyeTarget - this.eyeHeight) * Math.min(1, dt * 12);
    camera.position.set(
      lerp(from.x, me.x, alpha),
      lerp(from.y, me.y, alpha) + this.eyeHeight,
      lerp(from.z, me.z, alpha),
    );
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
