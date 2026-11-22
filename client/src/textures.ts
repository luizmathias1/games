// Texturas procedurais geradas em canvas (sem arquivos de imagem externos).
import * as THREE from 'three';

export interface TextureOptions {
  base: string; // cor de fundo
  speck: string; // cor dos grãos de ruído
  lines?: string; // cor de linhas horizontais (ex.: tábuas de caixote)
  seed?: number;
}

/** Cria uma textura de ruído com (opcionalmente) linhas. Repetível. */
export function makeTexture(opts: TextureOptions, size = 256): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = opts.base;
  ctx.fillRect(0, 0, size, size);

  // Gerador pseudoaleatório simples (determinístico, para o mesmo visual sempre)
  let seed = opts.seed ?? 1;
  const rnd = (): number => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };

  ctx.fillStyle = opts.speck;
  for (let i = 0; i < size * size * 0.06; i++) {
    ctx.globalAlpha = rnd() * 0.35;
    ctx.fillRect(rnd() * size, rnd() * size, 1 + rnd() * 2, 1 + rnd() * 2);
  }
  ctx.globalAlpha = 1;

  if (opts.lines) {
    ctx.strokeStyle = opts.lines;
    ctx.lineWidth = 3;
    for (let y = 0; y <= size; y += size / 4) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(size, y);
      ctx.stroke();
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
