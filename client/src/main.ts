// Ponto de entrada do cliente: liga a conexão, o lobby, a partida e o loop de render.
import * as THREE from 'three';
import { TICK_DT } from '../../shared/config';
import { buildMap } from '../../shared/map';
import type { ServerMessage } from '../../shared/protocol';
import { Effects } from './effects';
import { Match } from './game';
import { Hud } from './hud';
import { InputController } from './input';
import { buildMapMeshes } from './mapBuilder';
import { Connection } from './net';
import { createGameScene } from './scene';
import { Sounds } from './sounds';
import { Ui, type UiState } from './ui';
import { ViewModel } from './viewmodel';

const DEFAULT_FOV = 75;
/** Intervalo entre medições de ping (ms). */
const PING_EVERY_MS = 1000;

const map = buildMap();
const { renderer, scene, camera } = createGameScene();
scene.add(buildMapMeshes(map));
// A câmera precisa estar na cena: a arma em primeira pessoa é filha dela
scene.add(camera);

const state: UiState = {
  connection: 'connecting',
  screen: 'menu',
  code: '',
  players: [],
  phase: 'waiting',
  localId: null,
  winnerId: null,
  endSummary: '',
  locked: false,
  error: null,
};

const conn = new Connection();
const input = new InputController(renderer.domElement, (locked) => {
  state.locked = locked;
  ui.render(state);
});
const fx = new Effects(scene);
const hud = new Hud();
const sounds = new Sounds();
const viewmodel = new ViewModel(camera);
viewmodel.setVisible(false);
const match = new Match({
  scene,
  input,
  send: (msg) => {
    conn.send(msg);
  },
  map,
  fx,
  hud,
  viewmodel,
  sounds,
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
  onRematch: () => {
    conn.send({ type: 'rematch' });
  },
  onCapture: () => {
    sounds.unlock(); // o áudio só pode começar depois de um clique
    input.requestLock();
  },
  onSensitivity: (slider) => input.setSensitivity(slider),
});

function backToMenu(): void {
  match.reset();
  state.screen = 'menu';
  state.code = '';
  state.players = [];
  state.phase = 'waiting';
  state.localId = null;
  state.winnerId = null;
  state.endSummary = '';
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

// Ping: o cliente mede o ida e volta e informa o valor ao servidor (lag compensation)
let rtt = 0;
setInterval(() => {
  if (state.connection === 'open') conn.send({ type: 'ping', t: performance.now(), rtt });
}, PING_EVERY_MS);

conn.onMessage((msg: ServerMessage) => {
  switch (msg.type) {
    case 'joined':
      match.localId = msg.playerId;
      state.localId = msg.playerId;
      state.code = msg.code;
      state.screen = 'room';
      state.error = null;
      break;
    case 'roomState': {
      const wasPlaying = state.phase === 'playing';
      state.players = msg.players;
      state.phase = msg.phase;
      state.winnerId = msg.winnerId;
      match.setRoster(msg.players, msg.phase === 'playing');
      // Ao começar a partida, a mira já aponta para o adversário
      const me = msg.players.find((p) => p.id === match.localId);
      if (msg.phase === 'playing' && !wasPlaying && me) {
        input.yaw = me.yaw;
        input.pitch = 0;
      }
      if (msg.phase === 'ended') {
        // Libera o mouse para clicar nos botões da tela final
        state.endSummary = match.summary();
        if (document.pointerLockElement) document.exitPointerLock();
      }
      if (state.screen !== 'menu') state.screen = msg.phase === 'waiting' ? 'room' : 'match';
      break;
    }
    case 'snapshot':
      match.onSnapshot(msg);
      break;
    case 'shot':
    case 'hit':
    case 'death':
      match.onEvent(msg);
      break;
    case 'error':
      state.error = msg.message;
      break;
    case 'pong':
      rtt = Math.round(performance.now() - msg.t);
      hud.setPing(rtt);
      break;
  }
  ui.render(state);
});

ui.render(state);

// Loop de render (60+ FPS). Comandos e predição rodam em passo fixo de 30 Hz.
let last = performance.now();
let acc = 0;

function frame(now: number): void {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  const playing = state.screen === 'match' && state.phase === 'playing';

  input.applyLook(dt);
  fx.update(dt);
  hud.setVisible(playing);
  viewmodel.setVisible(playing);

  if (playing) {
    acc += dt;
    while (acc >= TICK_DT) {
      acc -= TICK_DT;
      match.sendTick();
    }
    match.update(camera, dt, acc / TICK_DT);
  } else {
    acc = 0;
    if (camera.fov !== DEFAULT_FOV) {
      camera.fov = DEFAULT_FOV;
      camera.updateProjectionMatrix();
    }
    // Fundo de menu e tela final: câmera girando lentamente em volta do mapa
    const t = now / 1000;
    camera.position.set(Math.sin(t * 0.08) * 30, 14, Math.cos(t * 0.08) * 30);
    camera.lookAt(new THREE.Vector3(0, 1, 0));
  }

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
