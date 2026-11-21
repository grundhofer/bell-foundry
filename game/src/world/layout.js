export const BAY = 38 / 7;
export const PIER_X = 13;
export const PIER_Z = Array.from({ length: 8 }, (_, i) => -19 + i * BAY);
export const BAY_Z = Array.from({ length: 7 }, (_, i) => -19 + (i + 0.5) * BAY);
export const AISLE_X = 20;
export const AISLE_FACE = AISLE_X - 0.65;
export const EAST_Z = -25.5,
  WEST_Z = 22;
export const DAIS = { z: -17.6, step: 0.9, rise: 0.5 / 3, top: 0.5 };
export const HEIGHTS = { spring: 9.3, string: 13.9, trif: 17.3, vault: 19, head: 25.8, aisle: 12.6 };

export const RUIN_STATES = {
  C: { stack: ['arcade_full', 'trif_full', 'clere_full'], e: 3, w: 3 },
  Cb: { stack: ['arcade_full', 'trif_full', 'clere_bare'], e: 3, w: 3 },
  Cj: { stack: ['arcade_full', 'trif_full', 'clere_jambs'], e: 3, w: 3 },
  Cd: { stack: ['arcade_full', 'trif_full', 'clere_down'], e: 3, w: 2 },
  T: { stack: ['arcade_full', 'trif_full'], e: 2, w: 2 },
  Td: { stack: ['arcade_full', 'trif_down'], e: 2, w: 1 },
  Tl: { stack: ['arcade_full', 'trif_low'], e: 1, w: 1 },
  R: { stack: ['arcade_ruin_a'], e: 1, w: 1 },
  Rb: { stack: ['arcade_ruin_b'], e: 1, w: 1 },
  H: { stack: ['arcade_half'], e: 1, w: 0 },
  X: { stack: ['arcade_stub'], e: 0, w: 0 },
};
export const NAVE = {
  s: ['C', 'Cj', 'Td', 'R', 'H', 'Td~', 'Cb'],
  n: ['C', 'Cb', 'Cd', 'T', 'Td', 'Rb', 'Cd~'],
};
export const AISLE = {
  s: {
    wall: ['full', 'full', 'gap', 'low', 'down~', 'full', 'full'],
    arch: ['full', 'full', 'broken', '', '', 'broken', 'full', 'full'],
  },
  n: {
    wall: ['full', 'gap', 'full', 'down', 'low', 'down~', 'full'],
    arch: ['full', 'full', 'full', 'broken', '', '', 'full', 'full'],
  },
};
export const RIBS = { whole: [1, 7], long: { s: [0], n: [2, 0] }, span: 2 * (PIER_X - 0.8), k: 0.7 };
export function ribY(x) {
  const R = RIBS.k * RIBS.span,
    c = R - RIBS.span / 2,
    a = Math.abs(x) + c;
  return HEIGHTS.vault + Math.sqrt(Math.max(0, R * R - a * a)) - 0.3;
}
export const CHANDELIERS = [
  { line: 1, x: -4.6, chains: 4, yaw: 0.6 },
  { line: 7, x: 5.0, chains: 4, yaw: 2.2 },
];

export const BOUNDS = { hx: 11, hz: 17, r: 4 };
export const SPAWN = {
  player: { x: 0, z: 13, yaw: Math.PI },
  boss: { x: 0, z: -9, yaw: 0 },
  door: { x: 0, z: 19.5, yaw: Math.PI },
  kneel: { x: 0, z: -13.5, yaw: 0 },
};
export const FACE = { x: -9.2, z: 7.4, r: 1.55, yaw: 0.2 };
export const COLUMN = [
  { x: 9.3, z: -4.2, r: 0.95 },
  { x: 7.75, z: -3.25, r: 0.95 },
  { x: 6.15, z: -2.3, r: 0.9 },
];
export const DRUM_AXIS = 0.98;
export const CAPITAL = { yaw: Math.PI + 0.1, sink: -0.02, tip: 0.05, along: 0.55 };
export const BLOCKS = { x: -7.6, z: -9.6, r: 1.15 };
const stone = (x, z, r, h) => ({ x, z, r, h, top: h });
export const COLLIDERS = [
  stone(-9.27, 7.93, 1.09, 2.2),
  stone(-9.2, 7.33, 1.26, 2.2),
  stone(-9.18, 6.73, 1.1, 2.2),
  stone(9.61, -4.44, 1.05, 1.93),
  stone(8.72, -3.91, 1.07, 1.93),
  stone(7.83, -3.38, 1.06, 1.9),
  stone(7.08, -2.92, 1.12, 2.0),
  stone(6.55, -2.63, 1.33, 2.25),
  stone(5.8, -2.22, 1.3, 2.25),
  stone(5.44, -1.82, 1.05, 2.2),
  stone(-7.59, -9.6, 1.2, 1.15),
  stone(-8.03, -10.58, 0.95, 1.4),
  stone(-8.45, -8.72, 0.34, 0.74),
  stone(-9.1, -8.52, 0.32, 0.45),
];
