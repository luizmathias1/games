// Cena Three.js: renderer, câmera e iluminação básica.
import * as THREE from 'three';

export interface GameScene {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
}

const SKY = '#9fb8c9';

/** Cria o renderer, a cena e a câmera FPS. */
export function createGameScene(): GameScene {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  document.getElementById('app')!.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY);
  scene.fog = new THREE.Fog(SKY, 35, 95);

  // Luz do sol com sombras + luz ambiente do céu
  const sun = new THREE.DirectionalLight('#fff1d8', 2.2);
  sun.position.set(14, 30, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -28;
  sun.shadow.camera.right = 28;
  sun.shadow.camera.top = 28;
  sun.shadow.camera.bottom = -28;
  sun.shadow.camera.far = 100;
  sun.shadow.bias = -0.0008;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight('#d7ebff', '#5b5144', 1.1));

  // Câmera em primeira pessoa: yaw/pitch aplicados em ordem YXZ
  const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.05, 200);
  camera.rotation.order = 'YXZ';

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  return { renderer, scene, camera };
}
