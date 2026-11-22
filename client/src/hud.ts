// HUD em DOM: vida, munição, arma, mira, placar, killfeed, indicador de dano,
// marcador de acerto e placar completo (segure Tab).
import type { WeaponDef } from '../../shared/config';
import type { PlayerSnapshot } from '../../shared/protocol';

export interface ScoreRow {
  name: string;
  kills: number;
  deaths: number;
  mine: boolean;
}

/** Tempo (ms) que uma linha do killfeed fica na tela. */
const FEED_MS = 5000;

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
  private readonly timer = byId('timer');
  private readonly score = byId('score');
  private readonly feed = byId('killfeed');
  private readonly dmg = byId('dmg');
  private readonly scoreboard = byId('scoreboard');
  private readonly sbBody = byId('sb-body');
  private markerTimer = 0;
  private dmgTimer = 0;

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

  /** Tempo restante e placar (abates de cada um) no topo. */
  setMatchInfo(timeLeft: number, myKills: number, otherKills: number): void {
    const s = Math.ceil(timeLeft);
    const mm = String(Math.floor(s / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    this.timer.textContent = `${mm}:${ss}`;
    this.score.textContent = `${myKills} : ${otherKills}`;
  }

  /** Placar completo. rows = null esconde. */
  setScoreboard(rows: ScoreRow[] | null): void {
    this.scoreboard.hidden = rows === null;
    if (!rows) return;
    this.sbBody.replaceChildren(
      ...rows.map((r) => {
        const tr = document.createElement('tr');
        if (r.mine) tr.classList.add('mine');
        for (const text of [r.name, String(r.kills), String(r.deaths)]) {
          const td = document.createElement('td');
          td.textContent = text;
          tr.appendChild(td);
        }
        return tr;
      }),
    );
  }

  /** Linha no killfeed. mine = envolve o jogador local (destaque). */
  killfeed(text: string, mine: boolean): void {
    const line = document.createElement('div');
    line.className = mine ? 'feed-line mine' : 'feed-line';
    line.textContent = text;
    this.feed.appendChild(line);
    while (this.feed.children.length > 5) this.feed.firstElementChild?.remove();
    window.setTimeout(() => line.remove(), FEED_MS);
  }

  /** Seta vermelha na direção de quem atirou (angle: 0 = à frente, + = direita). */
  damaged(angle: number): void {
    this.dmg.style.setProperty('--angle', `${(angle * 180) / Math.PI}deg`);
    this.dmg.classList.remove('on');
    void this.dmg.offsetWidth; // reinicia a animação
    this.dmg.classList.add('on');
    window.clearTimeout(this.dmgTimer);
    this.dmgTimer = window.setTimeout(() => this.dmg.classList.remove('on'), 900);
  }

  /** Marcador de acerto por um instante (vermelho em abate). */
  hitmarker(killed: boolean): void {
    this.marker.classList.remove('on', 'kill');
    void this.marker.offsetWidth; // reinicia a animação
    this.marker.classList.add('on');
    if (killed) this.marker.classList.add('kill');
    window.clearTimeout(this.markerTimer);
    this.markerTimer = window.setTimeout(() => this.marker.classList.remove('on', 'kill'), 150);
  }
}
