// Arma em primeira pessoa (viewmodel): modelos simples presos à câmera.
// Feitos com caixas; podem ser trocados por modelos melhores depois.
import * as THREE from 'three';
import type { WeaponId } from '../../shared/config';

const HIP = new THREE.Vector3(0.22, -0.2, -0.42);
const AIM = new THREE.Vector3(0, -0.16, -0.36);

const metal = () => new THREE.MeshStandardMaterial({ color: '#2d3138', roughness: 0.5, metalness: 0.4 });
const accent = () => new THREE.MeshStandardMaterial({ color: '#ff7a3d', roughness: 0.6 });
const steel = () => new THREE.MeshStandardMaterial({ color: '#c9d2dc', roughness: 0.3, metalness: 0.8 });

function box(w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}

function buildRifle(): THREE.Group {
  const g = new THREE.Group();
  g.add(
    box(0.07, 0.1, 0.5, 0, 0, 0, metal()),
    box(0.03, 0.03, 0.22, 0, 0.01, -0.36, metal()),
    box(0.05, 0.14, 0.07, 0, -0.12, -0.05, metal()),
    box(0.075, 0.02, 0.1, 0, 0.06, 0.12, accent()),
  );
  return g;
}

function buildPistol(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(0.06, 0.1, 0.2, 0, 0, -0.1, metal()), box(0.05, 0.14, 0.06, 0, -0.12, -0.06, metal()));
  return g;
}

function buildKnife(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(0.012, 0.04, 0.22, 0, 0, -0.18, steel()), box(0.03, 0.05, 0.12, 0, 0, -0.02, metal()));
  return g;
}

export class ViewModel {
  private readonly root = new THREE.Group();
  private readonly models: Record<WeaponId, THREE.Group>;
  private current: WeaponId | null = null;
  private aimT = 0;
  private kick = 0;

  constructor(camera: THREE.Camera) {
    this.root.position.copy(HIP);
    camera.add(this.root);
    this.models = { rifle: buildRifle(), pistol: buildPistol(), knife: buildKnife() };
    for (const m of Object.values(this.models)) {
      m.visible = false;
      this.root.add(m);
    }
  }

  setVisible(visible: boolean): void {
    this.root.visible = visible;
  }

  /** Mostra a arma certa e anima a mira (aim = botão direito com zoom). */
  show(weapon: WeaponId, aiming: boolean, dt: number): void {
    if (weapon !== this.current) {
      if (this.current) this.models[this.current].visible = false;
      this.models[weapon].visible = true;
      this.current = weapon;
    }
    this.aimT += ((aiming ? 1 : 0) - this.aimT) * Math.min(1, dt * 12);
    this.root.position.lerpVectors(HIP, AIM, this.aimT);
    this.kick *= Math.exp(-dt * 14);
    this.root.rotation.x = this.kick;
  }

  /** Sacudida ao atirar. */
  fired(): void {
    this.kick = 0.05;
  }
}
