// Constrói os meshes Three.js do mapa a partir dos dados compartilhados.
import * as THREE from 'three';
import type { BoxKind, MapData, Ramp } from '../../shared/map';
import { makeTexture } from './textures';

type MapMaterials = Record<BoxKind, THREE.MeshStandardMaterial> & {
  floor: THREE.MeshStandardMaterial;
  ramp: THREE.MeshStandardMaterial;
  floorTex: THREE.Texture;
};

/** Materiais com paleta própria (cores originais, sem referência a outros jogos). */
function createMaterials(): MapMaterials {
  const std = (tex: THREE.Texture, side: THREE.Side = THREE.FrontSide) =>
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, metalness: 0.05, side });

  const floorTex = makeTexture({ base: '#c9c2b0', speck: '#8f8870', seed: 3 });
  return {
    floor: std(floorTex),
    floorTex,
    wall: std(makeTexture({ base: '#8c9196', speck: '#4d5257', seed: 7 })),
    crate: std(makeTexture({ base: '#9a6b3f', speck: '#5b3b1f', lines: '#4a2f18', seed: 11 })),
    block: std(makeTexture({ base: '#b7a88a', speck: '#7f735b', seed: 13 })),
    ledge: std(makeTexture({ base: '#4f7c8a', speck: '#2f5360', seed: 17 })),
    ramp: std(makeTexture({ base: '#7d8f5a', speck: '#4b5a33', seed: 19 }), THREE.DoubleSide),
  };
}

/**
 * Monta a geometria de uma rampa (cunha).
 * Vértices: ponto baixo na base, ponto alto no topo e base na extremidade alta.
 */
function buildRampMesh(r: Ramp, mat: THREE.Material): THREE.Mesh {
  const onX = r.axis === 'x';
  const tMin = onX ? r.min[0] : r.min[2];
  const tMax = onX ? r.max[0] : r.max[2];
  const s0 = onX ? r.min[2] : r.min[0];
  const s1 = onX ? r.max[2] : r.max[0];
  const yBase = r.min[1];
  const yTop = r.max[1];

  const tLow = r.high === 'max' ? tMin : tMax; // extremidade baixa (y = yBase)
  const tHigh = r.high === 'max' ? tMax : tMin; // extremidade alta (y = yTop)

  // Converte (t, y, s) para (x, y, z) conforme o eixo da rampa
  const P = (t: number, y: number, s: number): [number, number, number] =>
    onX ? [t, y, s] : [s, y, t];

  const A0 = P(tLow, yBase, s0);
  const B0 = P(tHigh, yTop, s0);
  const C0 = P(tHigh, yBase, s0);
  const A1 = P(tLow, yBase, s1);
  const B1 = P(tHigh, yTop, s1);
  const C1 = P(tHigh, yBase, s1);

  const verts: number[] = [];
  const tri = (a: number[], b: number[], c: number[]) => verts.push(...a, ...b, ...c);
  tri(A0, B0, B1); // superfície inclinada
  tri(A0, B1, A1);
  tri(B0, C0, C1); // face vertical no topo
  tri(B0, C1, B1);
  tri(A0, C0, C1); // base
  tri(A0, C1, A1);
  tri(A0, B0, C0); // laterais (triângulos da cunha)
  tri(A1, C1, B1);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** Cria o grupo com chão, caixas e rampas do mapa. */
export function buildMapMeshes(map: MapData): THREE.Group {
  const group = new THREE.Group();
  const mats = createMaterials();
  mats.floorTex.repeat.set(map.size / 4, map.size / 4);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(map.size, map.size), mats.floor);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  group.add(floor);

  for (const b of map.boxes) {
    const w = b.max[0] - b.min[0];
    const h = b.max[1] - b.min[1];
    const d = b.max[2] - b.min[2];
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats[b.kind]);
    mesh.position.set(
      (b.min[0] + b.max[0]) / 2,
      (b.min[1] + b.max[1]) / 2,
      (b.min[2] + b.max[2]) / 2,
    );
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  for (const r of map.ramps) group.add(buildRampMesh(r, mats.ramp));
  return group;
}
