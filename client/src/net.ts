// Conexão WebSocket com reconexão automática.
// Útil no plano Free do Render, que "dorme" e demora cerca de 1 minuto para acordar.
import type { ClientMessage, ServerMessage } from '../../shared/protocol';

export type ConnectionState = 'connecting' | 'open' | 'closed';

const MAX_BACKOFF_MS = 4000;

export class Connection {
  state: ConnectionState = 'connecting';
  private ws: WebSocket | null = null;
  private attempts = 0;
  private messageHandlers: ((msg: ServerMessage) => void)[] = [];
  private stateHandlers: ((state: ConnectionState) => void)[] = [];

  constructor() {
    this.connect();
  }

  onMessage(fn: (msg: ServerMessage) => void): void {
    this.messageHandlers.push(fn);
  }

  onState(fn: (state: ConnectionState) => void): void {
    this.stateHandlers.push(fn);
  }

  /** Envia uma mensagem. Retorna false se a conexão não estiver aberta. */
  send(msg: ClientMessage): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    this.ws.send(JSON.stringify(msg));
    return true;
  }

  private connect(): void {
    // Mesma origem da página: wss:// em produção e ws:// em localhost
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    this.ws = ws;

    ws.onopen = () => {
      this.attempts = 0;
      this.setState('open');
    };

    ws.onmessage = (ev) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(String(ev.data)) as ServerMessage;
      } catch {
        return;
      }
      for (const fn of this.messageHandlers) fn(msg);
    };

    ws.onclose = () => {
      this.setState('closed');
      const delay = Math.min(MAX_BACKOFF_MS, 500 * 2 ** this.attempts);
      this.attempts++;
      setTimeout(() => this.connect(), delay);
    };
  }

  private setState(state: ConnectionState): void {
    if (this.state === state) return;
    this.state = state;
    for (const fn of this.stateHandlers) fn(state);
  }
}
