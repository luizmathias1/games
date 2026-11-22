// Testes da física compartilhada. Rode com: npm test
// Usa apenas node:assert; falha com erro se algo não bater.
import assert from 'node:assert/strict';
import { TICK_DT } from './config';
import { buildMap } from './map';
import { createBody, stepBody } from './physics';
import type { BodyState, MoveInput } from './types';

const map = buildMap();

const cmd = (over: Partial<MoveInput> = {}): MoveInput => ({
  seq: 0,
  forward: 0,
  strafe: 0,
  yaw: 0,
  jump: false,
  crouch: false,
  run: false,
  ...over,
});

/** Avança a física por `seconds` com o mesmo comando. */
function run(state: BodyState, input: MoveInput, seconds: number): BodyState {
  let s = state;
  const n = Math.round(seconds / TICK_DT);
  for (let i = 0; i < n; i++) s = stepBody(s, input, TICK_DT, map);
  return s;
}

const tests: [string, () => void][] = [
  ['parado no chão fica em y=0', () => {
    const s = run(createBody([-14, 0, -17]), cmd(), 1);
    assert.ok(Math.abs(s.y) < 1e-6 && s.onGround);
  }],

  ['pulo sobe e volta ao chão', () => {
    let j = stepBody(createBody([0, 0, -17]), cmd({ jump: true }), TICK_DT, map);
    let peak = 0;
    for (let i = 0; i < 60; i++) {
      j = stepBody(j, cmd(), TICK_DT, map);
      peak = Math.max(peak, j.y);
    }
    // altura teórica: v²/(2g) ≈ 1.28 m
    assert.ok(peak > 1.1 && peak < 1.4, `pico do pulo ${peak}`);
    assert.ok(j.onGround && Math.abs(j.y) < 1e-6);
  }],

  ['pilar central bloqueia a passagem', () => {
    // Pilar em x [-2, 2], z [-2, 2] e altura 3: o corpo para em x = -2 - raio
    const s = run(createBody([-6, 0, 0]), cmd({ strafe: 1 }), 2);
    assert.ok(Math.abs(s.x - (-2.35)) < 0.01, `x=${s.x}`);
  }],

  ['caixote (1.2 m) bloqueia: não dá para subir', () => {
    // Caixote em x [-12, -10], z [-14, -12]; altura 1.2 > degrau 0.5
    const s = run(createBody([-16, 0, -13]), cmd({ strafe: 1 }), 2);
    assert.ok(Math.abs(s.x - (-12.35)) < 0.01, `x=${s.x}`);
    assert.ok(s.y < 0.01);
  }],

  ['sobe a rampa e para em cima da plataforma', () => {
    // Rampa x [8, 12] sobe de y=0 a y=2; plataforma x [12, 16], topo em y=2
    const s = run(createBody([7, 0, -6]), cmd({ strafe: 1 }), 1.4);
    assert.ok(s.x > 12 && s.x < 16, `x=${s.x}`);
    assert.ok(Math.abs(s.y - 2) < 0.01, `y=${s.y}`);
    assert.ok(s.onGround);
  }],

  ['altura no meio da rampa segue a inclinação', () => {
    const s = run(createBody([7, 0, -6]), cmd({ strafe: 1 }), 0.9);
    // Os pés apoiam na borda da frente do corpo (x + raio), que é a parte mais alta
    const front = s.x + 0.35;
    const expected = ((front - 8) / 4) * 2;
    assert.ok(s.x > 8 && s.x < 12, `x=${s.x}`);
    assert.ok(Math.abs(s.y - expected) < 0.05, `y=${s.y} esperado ${expected}`);
  }],

  ['cai da plataforma e para no chão', () => {
    const s = run(createBody([14, 2, -6]), cmd({ strafe: 1 }), 1.5);
    assert.ok(Math.abs(s.y) < 1e-6 && s.onGround, `y=${s.y}`);
  }],

  ['agachar reduz a velocidade', () => {
    const walk = run(createBody([-14, 0, -17]), cmd({ strafe: 1 }), 1);
    const crouch = run(createBody([-14, 0, -17]), cmd({ strafe: 1, crouch: true }), 1);
    const walkDist = walk.x - -14;
    const crouchDist = crouch.x - -14;
    // andar ~5 m/s e agachado ~2.5 m/s: agachado percorre bem menos
    assert.ok(crouchDist < walkDist * 0.7, `agachado ${crouchDist} vs andando ${walkDist}`);
  }],
];

let failed = 0;
for (const [name, fn] of tests) {
  try {
    fn();
    console.log(`ok   - ${name}`);
  } catch (err) {
    failed++;
    console.error(`FALHA - ${name}\n  ${(err as Error).message}`);
  }
}

if (failed > 0) {
  console.error(`\n${failed} teste(s) falharam.`);
  process.exit(1);
}
console.log(`\nTodos os ${tests.length} testes passaram.`);
