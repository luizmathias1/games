// Ponto de entrada do cliente: liga a conexão, o lobby, a partida e o loop de render.
import * as THREE from 'three';
import { TICK_DT } from '../../shared/config';
import { buildMap } from '../../shared/map';
import type { ServerMessage } from '../../shared/protocol';
import { Match } from './game';
import { InputController } from './input';
import { buildMapMeshes } from './mapBuilder';
import { Connection } from './net';
import { createGameScene } from './scene';
import { Ui, type UiState } from './ui';

const { renderer, scene, camera } = createGameScene();
scene.add(buildMapMeshes(buildMap()));

const state: UiState = {
  connection: 'connecting',
  screen: 'menu',
  code: '',
  players: [],
  phase: 'waiting',
  locked: false,
  error: null,
};

const conn = new Connection();
const input = new InputController(renderer.domElement, (locked) => {
  state.locked = locked;
  ui.render(state);
});
const match = new Match(scene, input, (msg) => {
  conn.send(msg);
});

const ui = new Ui({
  onCreate: (nickname) => {
    state.error = null;
    if (!conn.send({ type: 'create', nickname })) state.error = 'Sem conexão com o servidor.';
    ui.render(state);
  },
  onJoin: (code, nickname) => {
    state.error = null;
    if (!conn.send({ type: 'join', code, nickname })) state.error = 'Sem conexão com o servidor.';
    ui.render(state);
  },
  onLeave: () => {
    conn.send({ type: 'leave' });
    backToMenu();
  },
  onCapture: () => input.requestLock(),
  onSensitivity: (slider) => input.setSensitivity(slider),
});

function backToMenu(): void {
  match.reset();
  state.screen = 'menu';
  state.code = '';
  state.players = [];
  state.phase = 'waiting';
  if (document.pointerLockElement) document.exitPointerLock();
  ui.render(state);
}

conn.onState((s) => {
  state.connection = s;
  // Caiu no meio de uma sala: a sala se perde, volta ao menu
  if (s === 'closed' && state.screen !== 'menu') {
    backToMenu();
    state.error = 'Conexão perdida. Entre na sala de novo.';
  }
  ui.render(state);
});

conn.onMessage((msg: ServerMessage) => {
  switch (msg.type) {
    case 'joined':
      match.localId = msg.playerId;
      state.code = msg.code;
      state.screen = 'room';
      state.error = null;
      break;
    case 'roomState': {
      const wasPlaying = state.phase === 'playing';
      state.players = msg.players;
      state.phase = msg.phase;
      match.setRoster(msg.players, msg.phase === 'playing');
      // Ao começar a partida, a mira já aponta para o adversário
      const me = msg.players.find((p) => p.id === match.localId);
      if (msg.phase === 'playing' && !wasPlaying && me) {
        input.yaw = me.yaw;
        input.pitch = 0;
      }
      if (state.screen !== 'menu') state.screen = msg.phase === 'playing' ? 'match' : 'room';
      break;
    }
    case 'snapshot':
      match.onSnapshot(msg);
      break;
    case 'error':
      state.error = msg.message;
      break;
    case 'pong':
      break;
  }
  ui.render(state);
});

ui.render(state);

// Loop de render (60+ FPS) com envio de inputs em passo fixo de 30 Hz
let last = performance.now();
let acc = 0;

function frame(now: number): void {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;

  input.applyLook();

  if (state.screen === 'match') {
    acc += dt;
    while (acc >= TICK_DT) {
      acc -= TICK_DT;
      match.sendTick();
    }
    match.update(camera, dt);
  } else {
    acc = 0;
    // Fundo de menu: câmera girando lentamente em volta do mapa
    const t = now / 1000;
    camera.position.set(Math.sin(t * 0.08) * 30, 14, Math.cos(t * 0.08) * 30);
    camera.lookAt(new THREE.Vector3(0, 1, 0));
  }

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
