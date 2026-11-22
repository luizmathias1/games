// Efeitos visuais de tiro: traçantes (linhas que somem em pouco tempo).
import * as THREE from 'three';
import type { Vec3 } from '../../shared/types';

const LIFE = 0.08; // segundos

interface Tracer {
  line: THREE.Line;
  age: number;
}

export class Effects {
  private tracers: Tracer[] = [];

  constructor(private readonly scene: THREE.Scene) {}

  /** Desenha um traçante do ponto `from` até `to`. `mine` escolhe a cor. */
  tracer(from: Vec3, to: Vec3, mine: boolean): void {
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(...from),
      new THREE.Vector3(...to),
    ]);
    const mat = new THREE.LineBasicMaterial({
      color: mine ? '#ffe9a8' : '#ff9a5c',
      transparent: true,
      opacity: 0.9,
    });
    const line = new THREE.Line(geo, mat);
    this.scene.add(line);
    this.tracers.push({ line, age: 0 });
  }

  /** Atualiza a vida dos traçantes e remove os que já sumiram. */
  update(dt: number): void {
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.age += dt;
      const mat = t.line.material as THREE.LineBasicMaterial;
      mat.opacity = Math.max(0, 0.9 * (1 - t.age / LIFE));
      if (t.age >= LIFE) {
        this.scene.remove(t.line);
        t.line.geometry.dispose();
        mat.dispose();
        this.tracers.splice(i, 1);
      }
    }
  }
}
