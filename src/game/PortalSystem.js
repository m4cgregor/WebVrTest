import {
  createSystem,
  Mesh,
  TorusGeometry,
  CylinderGeometry,
  MeshBasicMaterial,
  Group,
  Vector3,
  Quaternion,
  XRPlane
} from '@iwsdk/core';
import { GameManager, Portal, Drone } from './components.js';

export class PortalSystem extends createSystem({
  gameManager: { required: [GameManager] },
  portals: { required: [Portal] },
  planes: { required: [XRPlane] }
}) {
  init() {
    this.spawnInterval = 5.0; // segundos entre spawn
    this.sessionPortalsInitialized = false;

    // Suscribirse a planos de Realidad Mixta detectados en la habitación mientras jugamos
    this.queries.planes.subscribe('qualify', (planeEntity) => {
      if (!this.isPlaying()) return; // Solo spawnear si estamos jugando
      
      const rawPlane = planeEntity.getValue(XRPlane, '_plane');
      if (rawPlane && rawPlane.orientation === 'vertical') {
        if (this.queries.portals.entities.length < 4) {
          this.spawnPortalOnPlane(planeEntity);
        }
      }
    });
  }

  isPlaying() {
    let playing = false;
    this.queries.gameManager.entities.forEach((gm) => {
      if (gm.getValue(GameManager, 'state') === 1) {
        playing = true;
      }
    });
    return playing;
  }

  spawnPortalOnPlane(planeEntity) {
    const pos = new Vector3();
    const quat = new Quaternion();
    planeEntity.object3D.getWorldPosition(pos);
    planeEntity.object3D.getWorldQuaternion(quat);

    // Ajustar posición un poco hacia adelante de la pared para evitar z-fighting
    const forward = new Vector3(0, 0, 0.1).applyQuaternion(quat);
    pos.add(forward);

    this.spawnPortalAt(pos, quat);
  }

  spawnPortalAt(position, quaternion) {
    const portalGroup = new Group();

    // Aro exterior del portal
    const ring = new Mesh(
      new TorusGeometry(0.3, 0.04, 12, 32),
      new MeshBasicMaterial({ color: 0x3b82f6 })
    );

    // Disco de energía traslúcido
    const disc = new Mesh(
      new CylinderGeometry(0.28, 0.28, 0.02, 16),
      new MeshBasicMaterial({ color: 0x1d4ed8, transparent: true, opacity: 0.5 })
    );
    disc.rotateX(Math.PI / 2);

    portalGroup.add(ring);
    portalGroup.add(disc);

    portalGroup.position.copy(position);
    portalGroup.quaternion.copy(quaternion);

    const portalEntity = this.world.createTransformEntity(portalGroup);
    portalEntity.addComponent(Portal, { spawnTimer: Math.random() * 2.0 });
  }

  spawnDroneAt(position) {
    const droneGroup = new Group();

    // Cuerpo esférico del drone
    const body = new Mesh(
      new TorusGeometry(0.12, 0.03, 8, 24),
      new MeshBasicMaterial({ color: 0xef4444 })
    );

    // Ojo luminoso central
    const eye = new Mesh(
      new CylinderGeometry(0.04, 0.04, 0.05, 12),
      new MeshBasicMaterial({ color: 0xffeb3b })
    );
    eye.rotateX(Math.PI / 2);
    eye.position.set(0, 0, 0.08);

    droneGroup.add(body);
    droneGroup.add(eye);
    droneGroup.position.copy(position);

    const droneEntity = this.world.createTransformEntity(droneGroup);
    droneEntity.addComponent(Drone, {
      speed: 0.4 + Math.random() * 0.3,
      damage: 20
    });
  }

  cleanupPortals() {
    this.queries.portals.entities.forEach((entity) => {
      entity.dispose();
    });
    this.sessionPortalsInitialized = false;
  }

  update(delta) {
    const playing = this.isPlaying();

    if (!playing) {
      if (this.sessionPortalsInitialized || this.queries.portals.entities.length > 0) {
        this.cleanupPortals();
      }
      return;
    }

    // Inicializar portales para la sesión si aún no lo hemos hecho
    if (!this.sessionPortalsInitialized) {
      this.sessionPortalsInitialized = true;
      
      // Comprobar si hay paredes físicas ya detectadas
      const verticalPlanes = [];
      this.queries.planes.entities.forEach((planeEntity) => {
        const rawPlane = planeEntity.getValue(XRPlane, '_plane');
        if (rawPlane && rawPlane.orientation === 'vertical') {
          verticalPlanes.push(planeEntity);
        }
      });

      if (verticalPlanes.length > 0) {
        // Spawnear portales en las paredes físicas detectadas (máximo 4)
        const count = Math.min(verticalPlanes.length, 4);
        for (let i = 0; i < count; i++) {
          this.spawnPortalOnPlane(verticalPlanes[i]);
        }
      } else {
        // Modo Fallback: no hay paredes físicas detectadas, spawnear 3 portales virtuales al frente
        console.log('[PortalSystem] No physical walls detected. Spawning virtual fallback portals.');
        // Portal 1: Al frente
        this.spawnPortalAt(new Vector3(0, 1.3, -2.2), new Quaternion());
        // Portal 2: Izquierda-Frente
        this.spawnPortalAt(
          new Vector3(-1.5, 1.3, -1.5),
          new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 4)
        );
        // Portal 3: Derecha-Frente
        this.spawnPortalAt(
          new Vector3(1.5, 1.3, -1.5),
          new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), -Math.PI / 4)
        );
      }
    }

    // Gestionar el spawn de drones desde cada portal activo
    this.queries.portals.entities.forEach((portalEntity) => {
      let timer = portalEntity.getValue(Portal, 'spawnTimer');
      timer += delta;

      if (timer >= this.spawnInterval) {
        timer = 0;
        const pos = new Vector3();
        portalEntity.object3D.getWorldPosition(pos);
        // Spawnea el drone un poco salido del portal
        const forward = new Vector3(0, 0, 0.2).applyQuaternion(portalEntity.object3D.quaternion);
        pos.add(forward);

        this.spawnDroneAt(pos);
      }

      portalEntity.setValue(Portal, 'spawnTimer', timer);
      
      // Animación suave de rotación del disco de energía
      portalEntity.object3D.rotateZ(delta * 0.5);
    });
  }
}
