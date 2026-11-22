// HUD em DOM: vida, munição, arma, mira, marcador de acerto e tela de morte.
import type { WeaponDef } from '../../shared/config';
import type { PlayerSnapshot } from '../../shared/protocol';

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Elemento #${id} não encontrado no HTML`);
  return el as T;
}

export class Hud {
  private readonly root = byId('hud');
  private readonly hpText = byId('hp-text');
  private readonly hpBar = byId('hp-bar');
  private readonly weaponName = byId('weapon-name');
  private readonly ammo = byId('ammo');
  private readonly reload = byId('reload');
  private readonly marker = byId('hitmarker');
  private readonly death = byId('death');
  private readonly deathTimer = byId('death-timer');
  private readonly pingEl = byId('ping');
  private markerTimer = 0;

  setVisible(visible: boolean): void {
    this.root.hidden = !visible;
  }

  /** Mostra o ping (ida e volta) no canto superior direito. */
  setPing(ms: number): void {
    this.pingEl.textContent = `Ping ${ms} ms`;
    this.pingEl.classList.toggle('bad', ms > 150);
  }

  /** Atualiza os números com o estado do jogador local. */
  update(me: PlayerSnapshot | null, def: WeaponDef | null): void {
    if (!me || !def) return;
    this.hpText.textContent = String(Math.ceil(me.health));
    this.hpBar.style.width = `${Math.max(0, me.health)}%`;
    this.weaponName.textContent = def.name;
    this.ammo.textContent = def.magazine > 0 ? `${me.mag} / ${me.reserve}` : '—';
    this.reload.hidden = !me.reloading;
    this.death.hidden = me.alive;
    if (!me.alive) {
      this.deathTimer.textContent = `Renascendo em ${Math.ceil(me.respawnIn)} s`;
    }
  }

  /** Mostra o marcador de acerto por um instante (mais forte se for abate). */
  hitmarker(killed: boolean): void {
    this.marker.classList.remove('on', 'kill');
    void this.marker.offsetWidth; // reinicia a animação
    this.marker.classList.add('on');
    if (killed) this.marker.classList.add('kill');
    window.clearTimeout(this.markerTimer);
    this.markerTimer = window.setTimeout(() => this.marker.classList.remove('on', 'kill'), 150);
  }
}
