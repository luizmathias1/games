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
