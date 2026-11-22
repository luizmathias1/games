// Ponto de entrada do cliente (etapa 1: cena local com movimento, sem rede ainda).
import { PLAYER, TICK_DT } from '../../shared/config';
import { buildMap } from '../../shared/map';
import { createBody, stepBody } from '../../shared/physics';
import type { BodyState } from '../../shared/types';
import { InputController } from './input';
import { buildMapMeshes } from './mapBuilder';
import { createGameScene } from './scene';

const map = buildMap();
const { renderer, scene, camera } = createGameScene();
scene.add(buildMapMeshes(map));

const overlay = document.getElementById('overlay')!;
const startBtn = document.getElementById('start-btn') as HTMLButtonElement;
const sensInput = document.getElementById('sens') as HTMLInputElement;

const input = new InputController(renderer.domElement, (locked) => {
  overlay.hidden = locked;
});
input.setSensitivity(Number(sensInput.value));
sensInput.addEventListener('input', () => input.setSensitivity(Number(sensInput.value)));
startBtn.addEventListener('click', () => input.requestLock());

// Estado do jogador local: nasce em um spawn aleatório
let body: BodyState = createBody(map.spawns[Math.floor(Math.random() * map.spawns.length)]);
let prevBody: BodyState = body;
let seq = 0;
let acc = 0;
let eyeHeight = PLAYER.standEyeHeight;
let last = performance.now();

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function frame(now: number): void {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;

  input.applyLook();

  // Física em passo fixo (mesma taxa do servidor), com interpolação para a câmera
  acc += dt;
  while (acc >= TICK_DT) {
    prevBody = body;
    body = stepBody(body, input.buildCommand(seq++), TICK_DT, map);
    acc -= TICK_DT;
  }
  const alpha = acc / TICK_DT;

  // Altura dos olhos suaviza ao agachar
  const eyeTarget = body.crouching ? PLAYER.crouchEyeHeight : PLAYER.standEyeHeight;
  eyeHeight += (eyeTarget - eyeHeight) * Math.min(1, dt * 12);

  camera.position.set(
    lerp(prevBody.x, body.x, alpha),
    lerp(prevBody.y, body.y, alpha) + eyeHeight,
    lerp(prevBody.z, body.z, alpha),
  );
  camera.rotation.set(input.pitch, input.yaw, 0);

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
