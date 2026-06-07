import {
  createSystem,
  Mesh,
  TorusGeometry,
  CylinderGeometry,
  MeshBasicMaterial,
  Group,
  Vector3,
  Quaternion,
  XRPlane,
  PanelUI,
  PanelDocument,
  eq
} from '@iwsdk/core';
import { GameManager, Portal, Drone } from './components.js';

export class PortalSystem extends createSystem({
  gameManager: { required: [GameManager] },
  portals: { required: [Portal] },
  planes: { required: [XRPlane] },
  hudPanel: {
    required: [PanelUI, PanelDocument],
    where: [eq(PanelUI, 'config', './ui/game_hud.json')]
  }
}) {
  init() {
    this.spawnInterval = 3.0; // segundos entre spawn (más rápido con 1 solo portal)
    this.sessionPortalsInitialized = false;
    this.fallbackTimer = 0.0;
    this.fallbackSpawned = false;

    // Suscribirse a planos de Realidad Mixta detectados en la habitación mientras jugamos
    this.queries.planes.subscribe('qualify', (planeEntity) => {
      if (!this.isPlaying()) return; // Solo spawnear si estamos jugando
      
      const rawPlane = planeEntity.getValue(XRPlane, '_plane');
      if (rawPlane && rawPlane.orientation === 'vertical') {
        if (this.queries.portals.entities.length < 1) {
          // Si no hay portales y se detecta una pared, la usamos
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
    const planeQuat = new Quaternion();
    planeEntity.object3D.getWorldPosition(pos);
    planeEntity.object3D.getWorldQuaternion(planeQuat);

    // Rotar 90 grados en X para alinear el eje Z del portal con el eje Y del plano (normal de la pared)
    const extraRotation = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI / 2);
    const quat = planeQuat.clone().multiply(extraRotation);

    // Ajustar posición un poco hacia adelante de la pared para evitar z-fighting
    const forward = new Vector3(0, 0, 0.1).applyQuaternion(quat);
    pos.add(forward);

    this.spawnPortalAt(pos, quat);
  }

  spawnPortalAt(position, quaternion) {
    const portalGroup = new Group();

    // 1. Aro exterior del portal (Más grande: radio 0.8m, tubo 0.08m)
    const ring = new Mesh(
      new TorusGeometry(0.8, 0.08, 12, 32),
      new MeshBasicMaterial({ color: 0x3b82f6 })
    );

    // 2. Disco de energía traslúcido (radio 0.78m, altura 0.02m)
    const disc = new Mesh(
      new CylinderGeometry(0.78, 0.78, 0.02, 16),
      new MeshBasicMaterial({ color: 0x1d4ed8, transparent: true, opacity: 0.5 })
    );
    disc.rotateX(Math.PI / 2);

    portalGroup.add(ring);
    portalGroup.add(disc);

    // 3. Túnel 3D del espacio (Tubo que se extiende hacia adentro de la pared, 3 metros de profundidad)
    // side: 1 equivale a BackSide para renderizar el interior del cilindro
    const tunnel = new Mesh(
      new CylinderGeometry(0.78, 0.78, 3.0, 16, 1, true),
      new MeshBasicMaterial({ color: 0x070a13, side: 1 })
    );
    tunnel.rotateX(Math.PI / 2);
    tunnel.position.set(0, 0, -1.5); // Centrado a 1.5m detrás del portal
    portalGroup.add(tunnel);

    // 4. Anillos luminosos de profundidad dentro del túnel (efecto de paralaje 3D)
    const ringColors = [0x3b82f6, 0x8b5cf6, 0x06b6d4];
    for (let i = 0; i < 3; i++) {
      const depthRing = new Mesh(
        new TorusGeometry(0.76, 0.02, 8, 24),
        new MeshBasicMaterial({ color: ringColors[i] })
      );
      // Colocar a profundidades de 0.75m, 1.5m y 2.25m
      depthRing.position.set(0, 0, -0.75 * (i + 1));
      portalGroup.add(depthRing);
    }

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
    this.fallbackSpawned = false;

    // Retornar el HUD al centro de la vista al terminar la partida o ir a la bienvenida
    this.queries.hudPanel.entities.forEach((hudEntity) => {
      hudEntity.object3D.position.set(0, 1.8, -1.5);
      hudEntity.object3D.rotation.set(0.3, 0, 0);
    });
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
      this.fallbackTimer = 3.0; // esperar 3 segundos a que se detecten paredes físicas
      this.fallbackSpawned = false;
      
      // Comprobar si hay paredes físicas ya detectadas
      const verticalPlanes = [];
      this.queries.planes.entities.forEach((planeEntity) => {
        const rawPlane = planeEntity.getValue(XRPlane, '_plane');
        if (rawPlane && rawPlane.orientation === 'vertical') {
          verticalPlanes.push(planeEntity);
        }
      });

      if (verticalPlanes.length > 0) {
        // Encontrar la pared más alineada con la mirada frontal del jugador
        const headPos = new Vector3();
        const headQuat = new Quaternion();
        this.player.head.getWorldPosition(headPos);
        this.player.head.getWorldQuaternion(headQuat);
        const forward = new Vector3(0, 0, -1).applyQuaternion(headQuat).normalize();

        let bestPlane = verticalPlanes[0];
        let maxDot = -Infinity;

        const planePos = new Vector3();
        verticalPlanes.forEach((plane) => {
          plane.object3D.getWorldPosition(planePos);
          const dirToPlane = planePos.clone().sub(headPos).normalize();
          const dot = dirToPlane.dot(forward);
          if (dot > maxDot) {
            maxDot = dot;
            bestPlane = plane;
          }
        });

        // Spawnear solo 1 portal en la mejor pared física
        this.spawnPortalOnPlane(bestPlane);
      }
    }

    // Si no hay portales activos y ha pasado el tiempo de espera, activamos el fallback frente al jugador
    if (this.queries.portals.entities.length === 0 && !this.fallbackSpawned) {
      this.fallbackTimer -= delta;
      if (this.fallbackTimer <= 0) {
        this.fallbackSpawned = true;
        console.log('[PortalSystem] No physical walls detected after delay. Spawning 1 virtual fallback portal.');
        
        // Obtener la posición y rotación actual de la cabeza del jugador
        const headPos = new Vector3();
        const headQuat = new Quaternion();
        this.player.head.getWorldPosition(headPos);
        this.player.head.getWorldQuaternion(headQuat);

        // Vector forward (-Z local de la cabeza) proyectado horizontalmente
        const forward = new Vector3(0, 0, -1).applyQuaternion(headQuat).normalize();
        forward.y = 0;
        forward.normalize();

        // Posicionar a 2.2m enfrente a una altura cómoda de 1.3m
        const portalPos = new Vector3(
          headPos.x + forward.x * 2.2,
          1.3,
          headPos.z + forward.z * 2.2
        );

        // Rotación orientada hacia el jugador (lookAt horizontal)
        const tempGroup = new Group();
        tempGroup.position.copy(portalPos);
        tempGroup.lookAt(new Vector3(headPos.x, 1.3, headPos.z));

        this.spawnPortalAt(portalPos, tempGroup.quaternion);
      }
    }

    // Mantener el HUD a la izquierda del portal activo mientras jugamos
    this.queries.portals.entities.forEach((portalEntity) => {
      this.queries.hudPanel.entities.forEach((hudEntity) => {
        const portalObj = portalEntity.object3D;
        const portalPos = new Vector3();
        const portalQuat = new Quaternion();
        portalObj.getWorldPosition(portalPos);
        portalObj.getWorldQuaternion(portalQuat);

        // A la izquierda (-X local), un poco más arriba (+Y) y ligeramente más cerca en Z
        const hudPos = portalPos.clone().add(
          new Vector3(-1.1, 0.4, 0.15).applyQuaternion(portalQuat)
        );
        hudEntity.object3D.position.copy(hudPos);

        // Misma rotación del portal pero inclinada levemente hacia abajo
        const hudQuat = portalQuat.clone().multiply(
          new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), 0.25)
        );
        hudEntity.object3D.quaternion.copy(hudQuat);
      });
    });

    // Gestionar el spawn de drones desde cada portal activo (nacen al fondo del túnel)
    this.queries.portals.entities.forEach((portalEntity) => {
      let timer = portalEntity.getValue(Portal, 'spawnTimer');
      timer += delta;

      if (timer >= this.spawnInterval) {
        timer = 0;
        const pos = new Vector3();
        portalEntity.object3D.getWorldPosition(pos);
        // Spawnea el drone al fondo del túnel (-3.0 metros en Z local del portal)
        const tunnelBottom = new Vector3(0, 0, -3.0).applyQuaternion(portalEntity.object3D.quaternion);
        pos.add(tunnelBottom);

        this.spawnDroneAt(pos);
      }

      portalEntity.setValue(Portal, 'spawnTimer', timer);
      
      // Animación suave de rotación del disco de energía
      portalEntity.object3D.rotateZ(delta * 0.5);
    });
  }
}
