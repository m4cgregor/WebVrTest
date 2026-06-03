import {
  createSystem,
  Vector3,
  AudioUtils,
  AudioSource
} from '@iwsdk/core';
import { GameManager, Drone, Laser } from './components.js';

export class LaserSystem extends createSystem({
  gameManager: { required: [GameManager] },
  lasers: { required: [Laser] },
  drones: { required: [Drone] }
}) {
  init() {
    this.tempVec1 = new Vector3();
    this.tempVec2 = new Vector3();
  }

  cleanupLasers() {
    this.queries.lasers.entities.forEach((entity) => {
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
      this.cleanupLasers();
      return;
    }

    this.queries.lasers.entities.forEach((laserEntity) => {
      const laserObj = laserEntity.object3D;
      
      const vx = laserEntity.getValue(Laser, 'vx');
      const vy = laserEntity.getValue(Laser, 'vy');
      const vz = laserEntity.getValue(Laser, 'vz');

      // Mover el láser
      laserObj.position.x += vx * delta;
      laserObj.position.y += vy * delta;
      laserObj.position.z += vz * delta;

      // Decrementar ciclo de vida
      let life = laserEntity.getValue(Laser, 'lifeTime');
      life -= delta;
      laserEntity.setValue(Laser, 'lifeTime', life);

      if (life <= 0) {
        laserEntity.dispose();
        return;
      }

      // Obtener posición del láser
      laserObj.getWorldPosition(this.tempVec1);

      // Comprobar colisiones contra cada drone
      let destroyed = false;
      for (const droneEntity of this.queries.drones.entities) {
        const droneObj = droneEntity.object3D;
        droneObj.getWorldPosition(this.tempVec2);

        const dist = this.tempVec1.distanceTo(this.tempVec2);

        if (dist <= 0.35) {
          // Impacto!
          destroyed = true;

          // Registrar puntuación
          if (gmEntity) {
            const score = gmEntity.getValue(GameManager, 'score');
            gmEntity.setValue(GameManager, 'score', score + 10);

            // Sonido de explosión/acierto
            if (gmEntity.hasComponent(AudioSource)) {
              AudioUtils.play(gmEntity);
            }
          }

          // Eliminar drone y proyectil
          droneEntity.dispose();
          laserEntity.dispose();
          break; // Salir del bucle de drones para este láser
        }
      }
    });
  }
}
