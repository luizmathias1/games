// Testes do combate no servidor (tiro, dano, cadência, recarga, morte e respawn).
// Rode com: npm test. Usa a sala diretamente, sem rede.
import assert from 'node:assert/strict';
import { TICK_DT } from '../../shared/config';
import { traceShot } from '../../shared/hitbox';
import { buildMap } from '../../shared/map';
import { createBody } from '../../shared/physics';
import type { ServerMessage } from '../../shared/protocol';
import type { MoveInput } from '../../shared/types';
import { PlayerSession, Room } from './room';

// Dispersão zero para que os testes sejam determinísticos
const realRandom = Math.random;
Math.random = () => 0.5;

interface Setup {
  room: Room;
  a: PlayerSession;
  b: PlayerSession;
  out: ServerMessage[];
  seq: number;
}

/** Sala com dois jogadores frente a frente, sem obstáculos entre eles (x = -8). */
function setup(): Setup {
  const room = new Room('TESTE', buildMap());
  // Cada jogador tem sua própria "caixa de correio": o broadcast chega uma vez por jogador.
  // `out` guarda só o que chegou ao jogador A.
  const out: ServerMessage[] = [];
  const a = new PlayerSession(1, 'A', (m) => out.push(m), [0, 0, 0]);
  const b = new PlayerSession(2, 'B', () => {}, [0, 0, 0]);
  a.room = room;
  b.room = room;
  room.players.push(a, b);
  room.startMatch();
  // Posição fixa: A olha para +Z (yaw pi) e B fica 14 m à frente
  a.body = createBody([-8, 0, -18]);
  a.yaw = Math.PI;
  b.body = createBody([-8, 0, -4]);
  return { room, a, b, out, seq: 1 };
}

function cmd(s: Setup, over: Partial<MoveInput> = {}): MoveInput {
  return {
    seq: s.seq++,
    forward: 0,
    strafe: 0,
    yaw: Math.PI,
    pitch: 0,
    jump: false,
    crouch: false,
    run: false,
    fire: false,
    fireEdge: false,
    reload: false,
    slot: 0,
    ...over,
  };
}

/** Envia um comando e roda um tick do servidor. */
function step(s: Setup, over: Partial<MoveInput> = {}): void {
  s.a.enqueue([cmd(s, over)]);
  s.room.simulate();
}

function ticks(s: Setup, n: number): void {
  for (let i = 0; i < n; i++) s.room.simulate();
}

const count = (out: ServerMessage[], type: string) => out.filter((m) => m.type === type).length;

const tests: [string, () => void][] = [
  ['raio sem obstáculo acerta o alvo; parede bloqueia', () => {
    const map = buildMap();
    const hit = traceShot([-8, 1.6, -18], [0, 0, 1], 200, map, [{ id: 2, x: -8, y: 0, z: -4, crouching: false }], 1);
    assert.equal(hit.hit?.part, 'head', 'olhos na altura da cabeça acertam a cabeça');
    // Pilar central (x -2..2, z -2..2) bloqueia o tiro até o alvo
    const blocked = traceShot([0, 1.6, -8], [0, 0, 1], 200, map, [{ id: 2, x: 0, y: 0, z: 6, crouching: false }], 1);
    assert.equal(blocked.hit, null);
  }],

  ['tiro de pistola na cabeça mata (34 x 4 = 136 de dano)', () => {
    const s = setup();
    step(s, { slot: 2, fireEdge: true }); // troca para a pistola e atira
    const shots = count(s.out, 'shot');
    const hits = s.out.filter((m) => m.type === 'hit');
    assert.equal(shots, 1, 'um tiro');
    assert.equal(hits.length, 1);
    assert.equal(s.b.health, 0);
    assert.equal(s.b.alive, false);
    assert.equal(s.a.kills, 1);
    assert.equal(s.b.deaths, 1);
    assert.equal(count(s.out, 'death'), 1);
  }],

  ['tiro de rifle no tronco causa 22 de dano', () => {
    const s = setup();
    // Mira um pouco para baixo: tronco fica perto de 1.1 m de altura
    step(s, { fire: true, pitch: -0.035 });
    const hit = s.out.find((m) => m.type === 'hit');
    assert.ok(hit && hit.type === 'hit', 'houve acerto');
    assert.equal(hit.part, 'torso');
    assert.equal(hit.damage, 22);
    assert.equal(s.b.health, 78);
  }],

  ['cadência do rifle limita os tiros (100 ms entre tiros)', () => {
    const s = setup();
    for (let i = 0; i < 10; i++) step(s, { fire: true });
    const shots = count(s.out, 'shot');
    assert.ok(shots >= 2 && shots <= 4, `tiros em 10 ticks: ${shots}`);
  }],

  ['pistola é semiautomática: segurar o botão não repete o tiro', () => {
    const s = setup();
    step(s, { slot: 2, fireEdge: true }); // um clique = um tiro
    assert.equal(count(s.out, 'shot'), 1);
    // Segurando o botão (fire=true, sem novo clique) durante 1 s: nenhum tiro novo
    for (let i = 0; i < 30; i++) step(s, { fire: true, fireEdge: false });
    assert.equal(count(s.out, 'shot'), 1);
  }],

  ['recarga com R enche o pente a partir da reserva', () => {
    const s = setup();
    s.a.ammo.rifle.mag = 5;
    step(s, { reload: true });
    ticks(s, Math.ceil(2.3 / TICK_DT));
    assert.equal(s.a.ammo.rifle.mag, 30);
    assert.equal(s.a.ammo.rifle.reserve, 60 - 25);
    assert.equal(s.a.reloadEnd, null);
  }],

  ['sem munição no pente o tiro não sai', () => {
    const s = setup();
    s.a.ammo.rifle.mag = 0;
    step(s, { fire: true });
    assert.equal(count(s.out, 'shot'), 0);
  }],

  ['morto renasce depois de 3 s com vida cheia', () => {
    const s = setup();
    step(s, { slot: 2, fireEdge: true });
    step(s, { slot: 2, fireEdge: false });
    assert.equal(s.b.alive, false);
    ticks(s, Math.ceil(3.2 / TICK_DT));
    assert.equal(s.b.alive, true);
    assert.equal(s.b.health, 100);
  }],

  ['compensação de lag: o tiro checa a posição que o atirador viu', () => {
    const s = setup();
    s.b.body = createBody([-8, 0, -4]);
    ticks(s, 10);
    // O alvo dá um passo lateral (x = -5) e o tiro é dado logo depois, sem ping
    s.b.body = createBody([-5, 0, -4]);
    s.room.simulate();
    // Com 0 ms de ping o servidor volta ~100 ms: vê o alvo ainda em x = -8 e acerta
    step(s, { slot: 2, fireEdge: true });
    assert.ok(s.out.some((m) => m.type === 'hit'), 'acertou a posição que o atirador viu');
  }],

  ['servidor processa no máximo 2 comandos por tick (anti-speed)', () => {
    const s = setup();
    const batch: MoveInput[] = [];
    for (let i = 0; i < 10; i++) batch.push(cmd(s, { forward: 1, yaw: 0 }));
    s.a.enqueue(batch);
    s.room.simulate();
    assert.equal(s.a.lastProcessed, 2);
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

Math.random = realRandom;
if (failed > 0) {
  console.error(`\n${failed} teste(s) falharam.`);
  process.exit(1);
}
console.log(`\nTodos os ${tests.length} testes de combate passaram.`);
