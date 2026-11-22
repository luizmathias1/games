// Física compartilhada entre cliente (predição) e servidor (autoridade).
// Movimento com gravidade, pulo, agachar e colisão com caixas (AABB) e rampas.
// Não usa engine de física: tudo é checagem simples de sobreposição.
import { PLAYER } from './config';
import { rampHeightAt, type Box, type MapData } from './map';
import type { BodyState, MoveInput, Vec3 } from './types';

const R = PLAYER.radius;
const EPS = 1e-4;

/** Cria o estado inicial de um jogador nos pés do spawn. */
export function createBody(spawn: Vec3): BodyState {
  return {
    x: spawn[0],
    y: spawn[1],
    z: spawn[2],
    vx: 0,
    vy: 0,
    vz: 0,
    onGround: true,
    crouching: false,
  };
}

/** Aproxima v de target no máximo em maxDelta. */
function approach(v: number, target: number, maxDelta: number): number {
  if (Math.abs(target - v) <= maxDelta) return target;
  return v + Math.sign(target - v) * maxDelta;
}

/** Verdadeiro se o corpo (caixa de largura 2R e altura h) sobrepõe a caixa. */
function overlapsBox(x: number, y: number, z: number, h: number, b: Box): boolean {
  return (
    x - R < b.max[0] - EPS &&
    x + R > b.min[0] + EPS &&
    z - R < b.max[2] - EPS &&
    z + R > b.min[2] + EPS &&
    y < b.max[1] - EPS &&
    y + h > b.min[1] + EPS
  );
}

function collides(map: MapData, x: number, y: number, z: number, h: number): boolean {
  return map.boxes.some((b) => overlapsBox(x, y, z, h, b));
}

/**
 * Altura do piso mais alto sob o corpo que não passe de maxY.
 * Considera o chão (y=0), topos de caixas e a superfície das rampas.
 */
function floorBelow(map: MapData, x: number, z: number, maxY: number): number {
  let best = maxY >= -EPS ? 0 : -Infinity;
  for (const b of map.boxes) {
    if (x + R <= b.min[0] || x - R >= b.max[0] || z + R <= b.min[2] || z - R >= b.max[2]) continue;
    if (b.max[1] <= maxY + EPS && b.max[1] > best) best = b.max[1];
  }
  // Amostra o centro e os 4 cantos do corpo para as rampas
  const samples: [number, number][] = [
    [x, z],
    [x - R, z - R],
    [x + R, z - R],
    [x - R, z + R],
    [x + R, z + R],
  ];
  for (const r of map.ramps) {
    for (const [px, pz] of samples) {
      const hgt = rampHeightAt(r, px, pz);
      if (hgt !== null && hgt <= maxY + EPS && hgt > best) best = hgt;
    }
  }
  return best;
}

/**
 * Move o corpo em um eixo (x ou z) e resolve colisões com caixas.
 * Se o obstáculo for baixo e o corpo estiver no chão, sobe o degrau.
 */
function moveAxis(s: BodyState, map: MapData, axis: 'x' | 'z', delta: number, h: number, grounded: boolean): void {
  if (delta === 0) return;
  if (axis === 'x') s.x += delta;
  else s.z += delta;

  for (const b of map.boxes) {
    if (!overlapsBox(s.x, s.y, s.z, h, b)) continue;

    const rise = b.max[1] - s.y;
    if (grounded && rise <= PLAYER.stepHeight + EPS) {
      s.y = b.max[1]; // sobe o degrau
      continue;
    }

    // Empurra para fora da caixa e zera a velocidade nesse eixo
    if (axis === 'x') {
      s.x = delta > 0 ? b.min[0] - R : b.max[0] + R;
      s.vx = 0;
    } else {
      s.z = delta > 0 ? b.min[2] - R : b.max[2] + R;
      s.vz = 0;
    }
  }
}

/**
 * Avança a física de um jogador em dt segundos com o comando dado.
 * Retorna um novo estado (não altera o anterior).
 */
export function stepBody(prev: BodyState, input: MoveInput, dt: number, map: MapData): BodyState {
  const s: BodyState = { ...prev };
  const wasOnGround = s.onGround;

  // 1) Agachar. Só levanta se não houver teto por cima.
  if (input.crouch) s.crouching = true;
  else if (s.crouching && !collides(map, s.x, s.y, s.z, PLAYER.standHeight)) s.crouching = false;
  const h = s.crouching ? PLAYER.crouchHeight : PLAYER.standHeight;

  // 2) Direção desejada no plano XZ. Yaw 0 = olhando para -Z.
  const sin = Math.sin(input.yaw);
  const cos = Math.cos(input.yaw);
  let wx = -sin * input.forward + cos * input.strafe;
  let wz = -cos * input.forward - sin * input.strafe;
  const len = Math.hypot(wx, wz);
  if (len > 1) {
    wx /= len; // evita andar mais rápido na diagonal
    wz /= len;
  }

  const maxSpeed = s.crouching ? PLAYER.crouchSpeed : input.run ? PLAYER.runSpeed : PLAYER.walkSpeed;
  const accel = (wasOnGround ? PLAYER.groundAccel : PLAYER.airAccel) * dt;
  s.vx = approach(s.vx, wx * maxSpeed, accel);
  s.vz = approach(s.vz, wz * maxSpeed, accel);

  // 3) Pulo (só do chão e sem estar agachado)
  if (input.jump && wasOnGround && !s.crouching) {
    s.vy = PLAYER.jumpSpeed;
    s.onGround = false;
  }

  // 4) Gravidade
  s.vy -= PLAYER.gravity * dt;

  // 5) Movimento horizontal, eixo por eixo
  moveAxis(s, map, 'x', s.vx * dt, h, wasOnGround);
  moveAxis(s, map, 'z', s.vz * dt, h, wasOnGround);

  // 6) Movimento vertical
  const prevY = s.y;
  s.y += s.vy * dt;

  // Bateu a cabeça em teto: encosta embaixo da caixa
  if (s.vy > 0) {
    for (const b of map.boxes) {
      if (overlapsBox(s.x, s.y, s.z, h, b)) {
        s.y = b.min[1] - h;
        s.vy = 0;
      }
    }
  }

  // 7) Chão: pousa, cola em descidas/rampas e sobe pequenos degraus
  s.onGround = false;
  if (s.vy <= 0) {
    const maxY = prevY + (wasOnGround ? PLAYER.stepHeight : EPS);
    const g = floorBelow(map, s.x, s.z, maxY);
    const stick = wasOnGround && s.y - g <= PLAYER.stepHeight + EPS;
    const landed = s.y <= g + EPS;
    if (stick || landed) {
      s.y = g;
      s.vy = 0;
      s.onGround = true;
    }
  }

  return s;
}
