// Interface do lobby: menu, sala de espera, aviso de conexão e captura do mouse.
// A tela é sempre desenhada a partir de um UiState (render).
import type { PlayerInfo } from '../../shared/protocol';
import type { ConnectionState } from './net';

export type Screen = 'menu' | 'room' | 'match';

export interface UiState {
  connection: ConnectionState;
  screen: Screen;
  code: string;
  players: PlayerInfo[];
  phase: 'waiting' | 'playing';
  locked: boolean;
  error: string | null;
}

export interface UiHandlers {
  onCreate(nickname: string): void;
  onJoin(code: string, nickname: string): void;
  onLeave(): void;
  onCapture(): void;
  onSensitivity(slider: number): void;
}

const NICK_KEY = 'brasa.apelido';

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Elemento #${id} não encontrado no HTML`);
  return el as T;
}

export class Ui {
  private readonly banner = byId('banner');
  private readonly menu = byId('screen-menu');
  private readonly room = byId('screen-room');
  private readonly overlay = byId('overlay');
  private readonly errorEl = byId('error');
  private readonly nickInput = byId<HTMLInputElement>('nick');
  private readonly codeInput = byId<HTMLInputElement>('code');
  private readonly roomCode = byId('room-code');
  private readonly playerList = byId('player-list');
  private readonly roomStatus = byId('room-status');

  constructor(private readonly h: UiHandlers) {
    try {
      this.nickInput.value = localStorage.getItem(NICK_KEY) ?? '';
    } catch {
      // localStorage pode estar bloqueado: o apelido só não fica salvo
    }

    byId('btn-create').addEventListener('click', () => {
      const nick = this.readNickname();
      if (nick) this.h.onCreate(nick);
    });

    byId('btn-join').addEventListener('click', () => {
      const nick = this.readNickname();
      if (!nick) return;
      const code = this.codeInput.value.trim().toUpperCase();
      if (code.length !== 5) {
        this.showError('O código da sala tem 5 letras.');
        return;
      }
      this.h.onJoin(code, nick);
    });

    byId('btn-leave').addEventListener('click', () => this.h.onLeave());
    byId('btn-capture').addEventListener('click', () => this.h.onCapture());
    byId<HTMLInputElement>('sens').addEventListener('input', (e) => {
      this.h.onSensitivity(Number((e.target as HTMLInputElement).value));
    });
  }

  render(s: UiState): void {
    this.banner.hidden = s.connection === 'open';
    this.banner.textContent =
      s.connection === 'closed'
        ? 'Conectando ao servidor... tentando de novo'
        : 'Conectando ao servidor... (o plano gratuito pode demorar ~1 minuto)';

    this.menu.hidden = s.screen !== 'menu';
    this.room.hidden = s.screen !== 'room';
    this.overlay.hidden = !(s.screen === 'match' && !s.locked);

    this.errorEl.textContent = s.error ?? '';
    this.roomCode.textContent = s.code || '-----';
    this.playerList.replaceChildren(
      ...s.players.map((p) => {
        const li = document.createElement('li');
        li.textContent = p.nickname;
        return li;
      }),
    );
    this.roomStatus.textContent =
      s.phase === 'playing'
        ? 'Partida em andamento.'
        : 'Aguardando adversário. Mande o código para seu amigo.';
  }

  private readNickname(): string | null {
    const nick = this.nickInput.value.trim().slice(0, 16);
    if (!nick) {
      this.showError('Digite um apelido.');
      return null;
    }
    try {
      localStorage.setItem(NICK_KEY, nick);
    } catch {
      // ignora: apelido não será salvo
    }
    return nick;
  }

  private showError(msg: string): void {
    this.errorEl.textContent = msg;
  }
}
