// Hitboxes em 3 partes (cabeça, tronco e pernas) e raycast do tiro hitscan.
// Usado pelo servidor para decidir acertos. Tudo em metros.
import { PLAYER } from './config';
import type { MapData } from './map';
import type { Vec3 } from './types';

export type HitPart = 'head' | 'torso' | 'legs';

export interface HitBox {
  part: HitPart;
  min: Vec3;
  max: Vec3;
}

/** Caixas de acerto de um jogador com os pés em (x, y, z). */
export function hitboxesFor(x: number, y: number, z: number, crouching: boolean): HitBox[] {
  const height = crouching ? PLAYER.crouchHeight : PLAYER.standHeight;
  const k = height / PLAYER.standHeight; // escala vertical ao agachar
  const box = (part: HitPart, y0: number, y1: number, hx: number, hz: number): HitBox => ({
    part,
    min: [x - hx, y + y0 * k, z - hz],
    max: [x + hx, y + y1 * k, z + hz],
  });
  return [
    box('legs', 0, 0.9, 0.22, 0.2),
    box('torso', 0.9, 1.45, 0.3, 0.22),
    box('head', 1.45, PLAYER.standHeight, 0.18, 0.18),
  ];
}

/** Distância ao longo do raio (direção normalizada) até a caixa, ou null. */
export function rayAabb(o: Vec3, d: Vec3, min: Vec3, max: Vec3): number | null {
  let tMin = -Infinity;
  let tMax = Infinity;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-12) {
      if (o[i] < min[i] || o[i] > max[i]) return null;
    } else {
      let t1 = (min[i] - o[i]) / d[i];
      let t2 = (max[i] - o[i]) / d[i];
      if (t1 > t2) [t1, t2] = [t2, t1];
      tMin = Math.max(tMin, t1);
      tMax = Math.min(tMax, t2);
      if (tMin > tMax) return null;
    }
  }
  if (tMax < 0) return null;
  return Math.max(tMin, 0);
}

export interface Target {
  id: number;
  x: number;
  y: number;
  z: number;
  crouching: boolean;
}

export interface TraceResult {
  /** Distância até o ponto final do tiro (acerto ou parede/alcance). */
  distance: number;
  hit: { id: number; part: HitPart } | null;
}

/**
 * Lança um raio a partir de `origin` na direção `dir` (normalizada), com alcance `range`.
 * Paredes bloqueiam o tiro. O alvo mais próximo atingido é retornado.
 */
export function traceShot(
  origin: Vec3,
  dir: Vec3,
  range: number,
  map: MapData,
  targets: Target[],
  shooterId: number,
): TraceResult {
  let wallDist = range;
  for (const b of map.boxes) {
    const t = rayAabb(origin, dir, b.min, b.max);
    if (t !== null && t < wallDist) wallDist = t;
  }

  let best: { id: number; part: HitPart; t: number } | null = null;
  for (const target of targets) {
    if (target.id === shooterId) continue;
    for (const hb of hitboxesFor(target.x, target.y, target.z, target.crouching)) {
      const t = rayAabb(origin, dir, hb.min, hb.max);
      if (t !== null && t <= wallDist && (best === null || t < best.t)) {
        best = { id: target.id, part: hb.part, t };
      }
    }
  }

  if (best) return { distance: best.t, hit: { id: best.id, part: best.part } };
  return { distance: wallDist, hit: null };
}
