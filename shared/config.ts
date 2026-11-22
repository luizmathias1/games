// Constantes de gameplay. Ajuste aqui para mudar o equilíbrio do jogo
// (velocidade, dano, cadência, munição...) sem mexer na lógica.

/** Taxa do tick do servidor (Hz). */
export const TICK_RATE = 30;
/** Duração de um tick em segundos. */
export const TICK_DT = 1 / TICK_RATE;

/** Jogador: dimensões e movimento. Unidades em metros e segundos. */
export const PLAYER = {
  radius: 0.35,
  standHeight: 1.8,
  crouchHeight: 1.1,
  standEyeHeight: 1.6,
  crouchEyeHeight: 0.9,
  walkSpeed: 5.0,
  runSpeed: 7.5,
  crouchSpeed: 2.5,
  groundAccel: 60, // aceleração no chão (m/s²)
  airAccel: 12, // controle no ar (m/s²)
  gravity: 22,
  jumpSpeed: 7.5,
  stepHeight: 0.5, // altura máxima de degrau que sobe sem pular
  maxHealth: 100,
};

/** Sensibilidade do mouse: o slider vai de 1 a 10 e é convertido aqui. */
export const MOUSE = {
  defaultSlider: 6,
  radPerPixelPerStep: 0.00035,
};

export type WeaponId = 'rifle' | 'pistol' | 'knife';

export interface WeaponDef {
  name: string;
  /** Tecla 1, 2 ou 3 */
  slot: number;
  /** Rajada contínua (segurar o botão) ou um disparo por clique */
  auto: boolean;
  damage: number; // dano no tronco; cabeça e pernas usam HIT_MULTIPLIER
  fireInterval: number; // segundos entre tiros (cadência)
  magazine: number; // balas no pente (0 = arma corpo a corpo)
  reserve: number; // balas de reserva
  reloadTime: number; // segundos para recarregar
  range: number; // alcance do tiro em metros
  spread: number; // desvio aleatório máximo em radianos
  recoil: number; // coice vertical por tiro, em radianos
  /** Campo de visão ao mirar (botão direito). null = sem zoom. */
  aimFov: number | null;
}

/** Armas do jogo. Ids e nomes são originais. */
export const WEAPONS: Record<WeaponId, WeaponDef> = {
  rifle: {
    name: 'Rifle Ágil',
    slot: 1,
    auto: true,
    damage: 22,
    fireInterval: 0.1,
    magazine: 30,
    reserve: 60,
    reloadTime: 2.2,
    range: 200,
    spread: 0.012,
    recoil: 0.035,
    aimFov: 58,
  },
  pistol: {
    name: 'Pistola Pulso',
    slot: 2,
    auto: false,
    damage: 34,
    fireInterval: 0.22,
    magazine: 12,
    reserve: 24,
    reloadTime: 1.4,
    range: 200,
    spread: 0.004,
    recoil: 0.04,
    aimFov: null,
  },
  knife: {
    name: 'Faca',
    slot: 3,
    auto: false,
    damage: 55,
    fireInterval: 0.6,
    magazine: 0,
    reserve: 0,
    reloadTime: 0,
    range: 1.8,
    spread: 0,
    recoil: 0,
    aimFov: null,
  },
};

/** Ordem das armas pelas teclas 1, 2 e 3. */
export const WEAPON_ORDER: WeaponId[] = ['rifle', 'pistol', 'knife'];

/** Multiplicador de dano por parte do corpo (cabeça = 4x). */
export const HIT_MULTIPLIER = {
  head: 4,
  torso: 1,
  legs: 0.75,
};

/** Tempo de espera antes de renascer. */
export const RESPAWN_SECONDS = 3;

/** Regras da partida: termina ao chegar em killsToWin abates ou ao fim do tempo. */
export const MATCH = {
  killsToWin: 20,
  durationSeconds: 600,
};

/**
 * Compensação de lag (lag compensation) e interpolação.
 * O cliente desenha os adversários com `interpDelayMs` de atraso; o servidor
 * volta no tempo metade do ping + esse atraso antes de checar um tiro.
 */
export const LAG_COMP = {
  interpDelayMs: 100,
  maxRewindMs: 400,
};
