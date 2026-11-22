// Uma conexão WebSocket = um cliente. Traduz mensagens em chamadas do lobby.
import type { WebSocket } from 'ws';
import { parseClientMessage, type ServerMessage } from '../../shared/protocol';
import type { Lobby } from './lobby';
import type { PlayerSession } from './room';

export function attachClient(ws: WebSocket, lobby: Lobby): void {
  let session: PlayerSession | null = null;

  const send = (msg: ServerMessage): void => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
  };

  ws.on('message', (data) => {
    const msg = parseClientMessage(data.toString());
    if (!msg) {
      send({ type: 'error', message: 'Mensagem inválida.' });
      return;
    }

    switch (msg.type) {
      case 'create':
        if (session) {
          send({ type: 'error', message: 'Você já está em uma sala.' });
          break;
        }
        session = lobby.createRoom(msg.nickname, send);
        break;

      case 'join': {
        if (session) {
          send({ type: 'error', message: 'Você já está em uma sala.' });
          break;
        }
        const result = lobby.join(msg.code, msg.nickname, send);
        if (result.ok) session = result.session;
        else send({ type: 'error', message: result.error });
        break;
      }

      case 'input':
        if (session) lobby.onInput(session, msg.inputs);
        break;

      case 'ping':
        send({ type: 'pong', t: msg.t });
        break;

      case 'leave':
        if (session) lobby.leave(session);
        session = null;
        break;
    }
  });

  ws.on('close', () => {
    if (session) lobby.leave(session);
    session = null;
  });
}
