// Loop do servidor em tick fixo de 30 Hz (TICK_RATE).
// Usa acumulador de tempo para não derivar mesmo que o setInterval atrase.
import { TICK_DT } from '../../shared/config';
import type { Lobby } from './lobby';

/** Máximo de ticks executados de uma vez (evita "bola de neve" após travamento). */
const MAX_CATCHUP = 5;

export function startGameLoop(lobby: Lobby): void {
  let last = Date.now();
  let acc = 0;

  setInterval(() => {
    const now = Date.now();
    acc += (now - last) / 1000;
    last = now;

    let steps = 0;
    while (acc >= TICK_DT && steps < MAX_CATCHUP) {
      acc -= TICK_DT;
      steps++;
      for (const room of lobby.allRooms()) room.simulate();
    }
    if (steps >= MAX_CATCHUP) acc = 0;
  }, 5);
}
