// Definição do mapa "Pátio Brasa": pequeno, simétrico (simetria de 180°).
// Tudo é feito de primitivas: caixas sólidas (AABB) e rampas.
// O mapa é compartilhado: o cliente desenha e prevê; o servidor usa para colisão.
import type { Vec3 } from './types';

export type BoxKind = 'wall' | 'crate' | 'block' | 'ledge';

/** Caixa sólida alinhada aos eixos (AABB). */
export interface Box {
  min: Vec3;
  max: Vec3;
  kind: BoxKind;
}

/**
 * Rampa: superfície inclinada ao longo de um eixo (x ou z).
 * `high` indica em qual extremidade do eixo fica o topo.
 * Abaixo da superfície a rampa é sólida (formato de cunha).
 */
export interface Ramp {
  min: Vec3;
  max: Vec3;
  axis: 'x' | 'z';
  high: 'min' | 'max';
}

export interface MapData {
  name: string;
  size: number; // lado do chão quadrado, em metros
  boxes: Box[];
  ramps: Ramp[];
  spawns: Vec3[]; // posições dos pés nos pontos de spawn
}

const SIZE = 40;
const H = SIZE / 2;

function box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, kind: BoxKind): Box {
  return { min: [x0, y0, z0], max: [x1, y1, z1], kind };
}

// Espelha um elemento pelo centro do mapa (rotação de 180°).
function mirrorBox(b: Box): Box {
  return {
    min: [-b.max[0], b.min[1], -b.max[2]],
    max: [-b.min[0], b.max[1], -b.min[2]],
    kind: b.kind,
  };
}

function mirrorRamp(r: Ramp): Ramp {
  return {
    min: [-r.max[0], r.min[1], -r.max[2]],
    max: [-r.min[0], r.max[1], -r.min[2]],
    axis: r.axis,
    high: r.high === 'max' ? 'min' : 'max',
  };
}

// Paredes externas (fecham o mapa)
const outerWalls: Box[] = [
  box(-H - 1, 0, -H - 1, H + 1, 4, -H, 'wall'), // norte
  box(-H - 1, 0, H, H + 1, 4, H + 1, 'wall'), // sul
  box(-H - 1, 0, -H, -H, 4, H, 'wall'), // oeste
  box(H, 0, -H, H + 1, 4, H, 'wall'), // leste
];

// Elementos centrais (já simétricos)
const centerBoxes: Box[] = [
  box(-2, 0, -2, 2, 3, 2, 'block'), // pilar central
];

// Metade A (z negativo). A metade B é o espelho.
const halfBoxes: Box[] = [
  box(-12, 0, -14, -10, 1.2, -12, 'crate'), // caixote
  box(4, 0, -14, 6, 1.2, -12, 'crate'), // caixote
  box(-6, 0, -8, -4, 2.5, -6, 'block'), // bloco de cobertura
  box(-17, 0, -7, -14, 1.5, -6, 'block'), // muro baixo
  box(12, 0, -8, 16, 2, -4, 'ledge'), // plataforma elevada
];

// Rampa que leva à plataforma: sobe de x=8 (y=0) até x=12 (y=2)
const halfRamps: Ramp[] = [
  { min: [8, 0, -8], max: [12, 2, -4], axis: 'x', high: 'max' },
];

// Dois spawns por lado
const spawnsA: Vec3[] = [
  [-14, 0, -17],
  [14, 0, -17],
];

/** Monta o mapa completo a partir das metades espelhadas. */
export function buildMap(): MapData {
  const boxes = [
    ...outerWalls,
    ...centerBoxes,
    ...halfBoxes,
    ...halfBoxes.map(mirrorBox),
  ];
  const ramps = [...halfRamps, ...halfRamps.map(mirrorRamp)];
  const spawns: Vec3[] = [
    ...spawnsA,
    ...spawnsA.map((p): Vec3 => [-p[0], p[1], -p[2]]),
  ];
  return { name: 'Pátio Brasa', size: SIZE, boxes, ramps, spawns };
}

/** Altura da rampa em (x, z), ou null se o ponto estiver fora dela. */
export function rampHeightAt(r: Ramp, x: number, z: number): number | null {
  const onX = r.axis === 'x';
  const t = onX ? x : z; // coordenada ao longo da rampa
  const s = onX ? z : x; // coordenada transversal
  const tMin = onX ? r.min[0] : r.min[2];
  const tMax = onX ? r.max[0] : r.max[2];
  const sMin = onX ? r.min[2] : r.min[0];
  const sMax = onX ? r.max[2] : r.max[0];
  if (t < tMin || t > tMax || s < sMin || s > sMax) return null;
  const f = (t - tMin) / (tMax - tMin);
  const dy = r.max[1] - r.min[1];
  return r.high === 'max' ? r.min[1] + f * dy : r.max[1] - f * dy;
}
