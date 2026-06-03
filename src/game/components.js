import { createComponent, Types } from '@iwsdk/core';

// Componente para gestionar el estado global de la partida
export const GameManager = createComponent('GameManager', {
  score: { type: Types.Int32, default: 0 },
  life: { type: Types.Int32, default: 100 },
  state: { type: Types.Int8, default: 0 }, // 0 = Welcome, 1 = Playing, 2 = GameOver
});

// Componente para los portales de spawn en las paredes
export const Portal = createComponent('Portal', {
  spawnTimer: { type: Types.Float32, default: 0.0 },
});

// Componente para los drones enemigos
export const Drone = createComponent('Drone', {
  speed: { type: Types.Float32, default: 0.6 },
  damage: { type: Types.Int32, default: 20 },
});

// Componente para los proyectiles láser
export const Laser = createComponent('Laser', {
  vx: { type: Types.Float32, default: 0.0 },
  vy: { type: Types.Float32, default: 0.0 },
  vz: { type: Types.Float32, default: 0.0 },
  lifeTime: { type: Types.Float32, default: 3.0 }, // Duración en segundos antes de destruirse
});
