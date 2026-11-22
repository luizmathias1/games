// Modelo provisório do adversário: cápsula, visor (frente) e etiqueta com o apelido.
// Pode ser trocado por um modelo melhor depois, sem mexer no resto do código.
import * as THREE from 'three';
import { PLAYER } from '../../shared/config';

export interface PlayerModel {
  /** Origem nos pés do jogador. */
  group: THREE.Group;
  /** Parte do corpo que encolhe ao agachar. */
  body: THREE.Group;
}

export function createPlayerModel(nickname: string, color: string): PlayerModel {
  const group = new THREE.Group();
  const body = new THREE.Group();

  const capsule = new THREE.Mesh(
    new THREE.CapsuleGeometry(PLAYER.radius, PLAYER.standHeight - 2 * PLAYER.radius, 6, 12),
    new THREE.MeshStandardMaterial({ color, roughness: 0.6 }),
  );
  capsule.position.y = PLAYER.standHeight / 2;
  capsule.castShadow = true;

  // Visor na frente (-Z) mostra para onde o jogador está olhando
  const visor = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 0.12, 0.12),
    new THREE.MeshStandardMaterial({ color: '#1b1b1b' }),
  );
  visor.position.set(0, PLAYER.standEyeHeight, -PLAYER.radius);

  body.add(capsule, visor);
  group.add(body, nameTag(nickname));
  return { group, body };
}

function nameTag(text: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.fillRect(0, 0, 256, 64);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 34px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 34);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }),
  );
  sprite.scale.set(1.1, 0.28, 1);
  sprite.position.y = PLAYER.standHeight + 0.35;
  return sprite;
}
