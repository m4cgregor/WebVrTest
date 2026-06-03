import {
  createSystem,
  Vector3,
  AudioUtils,
  AudioSource
} from '@iwsdk/core';
import { GameManager, Drone } from './components.js';

export class DroneSystem extends createSystem({
  gameManager: { required: [GameManager] },
  drones: { required: [Drone] }
}) {
  init() {
    this.tempVec1 = new Vector3();
    this.tempVec2 = new Vector3();
  }

  cleanupDrones() {
    this.queries.drones.entities.forEach((entity) => {
      entity.dispose();
    });
  }

  update(delta) {
    let playing = false;
    let gmEntity = null;

    this.queries.gameManager.entities.forEach((gm) => {
      gmEntity = gm;
      if (gm.getValue(GameManager, 'state') === 1) {
        playing = true;
      }
    });

    if (!playing) {
      this.cleanupDrones();
      return;
    }

    const playerHead = this.player.head;
    playerHead.getWorldPosition(this.tempVec1); // Posición de la cabeza del jugador

    this.queries.drones.entities.forEach((droneEntity) => {
      const droneObj = droneEntity.object3D;
      droneObj.getWorldPosition(this.tempVec2);

      // Calcular dirección hacia el jugador
      const dir = new Vector3().subVectors(this.tempVec1, this.tempVec2);
      const distance = dir.length();
      dir.normalize();

      const speed = droneEntity.getValue(Drone, 'speed');
      const damage = droneEntity.getValue(Drone, 'damage');

      // Mover el drone hacia la cabeza
      droneObj.position.addScaledVector(dir, speed * delta);
      
      // Rotar suavemente hacia el jugador
      droneObj.lookAt(this.tempVec1);

      // Colisión con el jugador (cuerpo del jugador en MR)
      if (distance <= 0.4) {
        // Impacto!
        if (gmEntity) {
          let life = gmEntity.getValue(GameManager, 'life');
          life = Math.max(0, life - damage);
          gmEntity.setValue(GameManager, 'life', life);

          // Reproducir sonido de impacto
          if (gmEntity.hasComponent(AudioSource)) {
            AudioUtils.play(gmEntity);
          }

          if (life <= 0) {
            gmEntity.setValue(GameManager, 'state', 2); // GameOver
          }
        }

        // Destruir el drone
        droneEntity.dispose();
      }
    });
  }
}
