import {
  AssetType,
  SessionMode,
  World
} from '@iwsdk/core';

import {
  AudioSource,
  Interactable,
  PanelUI,
  PlaybackMode,
  ScreenSpace
} from '@iwsdk/core';

import { GameManager } from './game/components.js';
import { GameManagerSystem } from './game/GameManagerSystem.js';
import { PortalSystem } from './game/PortalSystem.js';
import { DroneSystem } from './game/DroneSystem.js';
import { LaserSystem } from './game/LaserSystem.js';
import { BlasterSystem } from './game/BlasterSystem.js';

// Manifiesto de activos estáticos del juego (chime de audio original)
const assets = {
  chimeSound: {
    url: '/audio/chime.mp3',
    type: AssetType.Audio,
    priority: 'background'
  }
};

// Crear el mundo WebXR con passthrough y entendimiento de escena habilitados
World.create(document.getElementById('scene-container'), {
  assets,
  xr: {
    sessionMode: SessionMode.ImmersiveAR,
    offer: 'always',
    features: {
      handTracking: true,
      anchors: true,
      hitTest: true,
      planeDetection: true,
      meshDetection: true,
      layers: true
    }
  },
  features: {
    locomotion: false,
    grabbing: false,  // no necesitamos agarrar objetos
    physics: true,     // habilitar motor de colisiones físicas
    sceneUnderstanding: true,
    environmentRaycast: true
  }
}).then((world) => {
  const { camera } = world;
  
  // Posicionar la cámara por defecto
  camera.position.set(0, 1.2, 0);

  // 1. Crear el GameManager global
  const gameManagerEntity = world.createTransformEntity();
  gameManagerEntity.addComponent(GameManager, {
    score: 0,
    life: 100,
    state: 0 // Welcome
  });

  // Configurar audio de disparo/explosión usando chime.mp3
  gameManagerEntity.addComponent(AudioSource, {
    src: './audio/chime.mp3',
    maxInstances: 4,
    playbackMode: PlaybackMode.FadeRestart
  });

  // 2a. Crear el menú interactivo del juego (bienvenida y fin de partida)
  const menuEntity = world
    .createTransformEntity()
    .addComponent(PanelUI, {
      config: './ui/game_menu.json',
      maxHeight: 0.6,
      maxWidth: 0.9
    })
    .addComponent(Interactable)
    .addComponent(ScreenSpace, {
      top: '20px',
      left: '20px',
      height: '40%'
    });

  menuEntity.object3D.position.set(0, 1.3, -1.8);
  menuEntity.object3D.rotation.set(0, 0, 0);

  // 2b. Crear la UI del HUD (puntos y vida, no interactiva para no tapar el gameplay)
  const hudEntity = world
    .createTransformEntity()
    .addComponent(PanelUI, {
      config: './ui/game_hud.json',
      maxHeight: 0.2,
      maxWidth: 4.0
    });

  hudEntity.object3D.position.set(0, 2.5, -1.8); // 1.3 + 1.2 = 2.5m de altura por defecto
  hudEntity.object3D.rotation.set(0, 0, 0);

  // 3. Registrar todos los sistemas de juego en el ECS
  world
    .registerSystem(GameManagerSystem)
    .registerSystem(PortalSystem)
    .registerSystem(DroneSystem)
    .registerSystem(LaserSystem)
    .registerSystem(BlasterSystem);
});
