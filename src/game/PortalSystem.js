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
  BufferGeometry,
  BufferAttribute,
  Points,
  PointsMaterial,
  CircleGeometry
} from '@iwsdk/core';
import { GameManager, Portal, Drone } from './components.js';

export class PortalSystem extends createSystem({
  gameManager: { required: [GameManager] },
  portals: { required: [Portal] },
  planes: { required: [XRPlane] },
  hudPanel: { required: [PanelUI, PanelDocument] }
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
    
    // Forzar actualización para obtener valores del mundo exactos
    planeEntity.object3D.updateMatrixWorld(true);
    planeEntity.object3D.getWorldPosition(pos);
    planeEntity.object3D.getWorldQuaternion(planeQuat);

    // Rotar 90 grados en X para alinear el eje Z del portal con el eje Y del plano (normal de la pared)
    const extraRotation = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI / 2);
    const quat = planeQuat.clone().multiply(extraRotation);

    // Obtener la mirada horizontal del jugador para centrar el portal frente a él
    const headPos = new Vector3();
    const headQuat = new Quaternion();
    this.player.head.getWorldPosition(headPos);
    this.player.head.getWorldQuaternion(headQuat);

    const forward = new Vector3(0, 0, -1).applyQuaternion(headQuat).normalize();
    forward.y = 0;
    forward.normalize();

    // El plano pasa por 'pos' y su normal es el eje Y local del plano
    const N = new Vector3(0, 1, 0).applyQuaternion(planeQuat).normalize();
    const dot = forward.dot(N);

    const portalPos = new Vector3();
    if (Math.abs(dot) > 0.05) {
      // Intersección del rayo del jugador con el plano vertical
      const t = (pos.clone().sub(headPos).dot(N)) / dot;
      if (t > 0 && t < 10) {
        portalPos.copy(headPos).addScaledVector(forward, t);
      } else {
        portalPos.copy(pos);
      }
    } else {
      portalPos.copy(pos);
    }

    portalPos.y = 1.3; // Altura fija cómoda de 1.3m
    
    // Separar ligeramente de la pared (0.05m hacia afuera)
    portalPos.addScaledVector(N, 0.05);

    this.spawnPortalAt(portalPos, quat);
  }

  spawnPortalAt(position, quaternion) {
    const portalGroup = new Group();

    // 1. Aro exterior del portal (2.0m de diámetro: radio 1.0m, tubo 0.08m)
    const ring = new Mesh(
      new TorusGeometry(1.0, 0.08, 12, 32),
      new MeshBasicMaterial({ color: 0x3b82f6 })
    );
    portalGroup.add(ring);

    // 2. Túnel 3D del espacio (Tubo de radio 0.98m, 4 metros de profundidad)
    // side: 1 equivale a BackSide para renderizar el interior del cilindro
    const tunnel = new Mesh(
      new CylinderGeometry(0.98, 0.98, 4.0, 16, 1, true),
      new MeshBasicMaterial({ color: 0x070a13, side: 1 })
    );
    tunnel.rotateX(Math.PI / 2);
    tunnel.position.set(0, 0, -2.0); // Centrado a 2.0m detrás del portal
    portalGroup.add(tunnel);

    // 3. Anillos luminosos de profundidad dentro del túnel (efecto de paralaje 3D)
    const ringColors = [0x3b82f6, 0x8b5cf6, 0x06b6d4];
    for (let i = 0; i < 3; i++) {
      const depthRing = new Mesh(
        new TorusGeometry(0.96, 0.02, 8, 24),
        new MeshBasicMaterial({ color: ringColors[i] })
      );
      // Colocar a profundidades de 1.0m, 2.0m y 3.0m
      depthRing.position.set(0, 0, -1.0 * (i + 1));
      depthRing.name = `depthRing_${i}`;
      portalGroup.add(depthRing);
    }

    // 5. Tapa de fondo negro absoluto a 4m de profundidad (detrás de las estrellas)
    const bottomCap = new Mesh(
      new CircleGeometry(0.98, 16),
      new MeshBasicMaterial({ color: 0x000000 })
    );
    bottomCap.position.set(0, 0, -4.0);
    portalGroup.add(bottomCap);

    // 6. Campo de estrellas en el FONDO del túnel (plano 2D a z = -3.9m, sin estar flotando dentro del túnel)
    const starsGeometry = new BufferGeometry();
    const starsCount = 120;
    const positions = new Float32Array(starsCount * 3);
    for (let i = 0; i < starsCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const r = Math.random() * 0.96;
      positions[i * 3] = Math.cos(theta) * r;
      positions[i * 3 + 1] = Math.sin(theta) * r;
      positions[i * 3 + 2] = -3.9; // Justo delante de la tapa negra del fondo
    }
    starsGeometry.setAttribute('position', new BufferAttribute(positions, 3));
    const starsMaterial = new PointsMaterial({
      color: 0xffffff,
      size: 0.025,
      transparent: true,
      opacity: 0.95
    });
    const starfield = new Points(starsGeometry, starsMaterial);
    portalGroup.add(starfield);

    portalGroup.position.copy(position);
    portalGroup.quaternion.copy(quaternion);

    const portalEntity = this.world.createTransformEntity(portalGroup);
    portalEntity.addComponent(Portal, { spawnTimer: Math.random() * 2.0 });
  }

  spawnDroneAt(position) {
    const droneGroup = new Group();

    // Crear pirámide de proporción 1x1x2 (base cuadrada de lado ~0.12m, altura 0.24m)
    // El radio circunscrito para lado 0.12m es 0.12 / sqrt(2) ≈ 0.085m
    const pyramidGeom = new CylinderGeometry(0, 0.085, 0.24, 4);
    pyramidGeom.rotateY(Math.PI / 4); // Alinear caras con los ejes local X/Y
    pyramidGeom.rotateX(-Math.PI / 2); // Orientar el vértice (+Y original) hacia el frente (-Z)

    const body = new Mesh(
      pyramidGeom,
      new MeshBasicMaterial({ color: 0xef4444 })
    );

    // Pequeño booster/motor brillante amarillo en la parte trasera (z = 0.13m)
    const thrusterGeom = new CylinderGeometry(0.02, 0.03, 0.04, 8);
    thrusterGeom.rotateX(Math.PI / 2); // Alinear cilindro con el eje Z
    const thruster = new Mesh(
      thrusterGeom,
      new MeshBasicMaterial({ color: 0xffeb3b })
    );
    thruster.position.set(0, 0, 0.13);

    droneGroup.add(body);
    droneGroup.add(thruster);
    droneGroup.position.copy(position);

    const droneEntity = this.world.createTransformEntity(droneGroup);
    droneEntity.addComponent(Drone, {
      speed: 0.6 + Math.random() * 0.45,
      damage: 20
    });
  }

  cleanupPortals() {
    this.queries.portals.entities.forEach((entity) => {
      entity.dispose();
    });
    this.sessionPortalsInitialized = false;
    this.fallbackSpawned = false;

    // Retornar los paneles a sus posiciones iniciales por defecto
    this.queries.hudPanel.entities.forEach((panelEntity) => {
      const config = panelEntity.getValue(PanelUI, 'config');
      if (config.includes('game_menu')) {
        panelEntity.object3D.position.set(0, 1.3, -1.8);
        panelEntity.object3D.rotation.set(0, 0, 0);
      } else if (config.includes('game_hud')) {
        panelEntity.object3D.position.set(0, 2.5, -1.8);
        panelEntity.object3D.rotation.set(0, 0, 0);
      }
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
        forward.y = 0;
        forward.normalize();

        let bestPlane = null;
        let maxDot = -Infinity;

        const planePos = new Vector3();
        verticalPlanes.forEach((plane) => {
          plane.object3D.updateMatrixWorld(true);
          plane.object3D.getWorldPosition(planePos);
          const dirToPlane = planePos.clone().sub(headPos).normalize();
          dirToPlane.y = 0;
          dirToPlane.normalize();
          const dot = dirToPlane.dot(forward);
          if (dot > maxDot) {
            maxDot = dot;
            bestPlane = plane;
          }
        });

        // Solo usar la pared física si está en un rango de 60 grados enfrente (dot > 0.5)
        if (bestPlane && maxDot > 0.5) {
          console.log('[PortalSystem] Detected wall in front. Spawning portal and HUD on it.');
          this.spawnPortalOnPlane(bestPlane);
          this.fallbackSpawned = true; // no necesitamos fallback
        }
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

        // Posicionar a 2.2m exactamente enfrente (en el centro)
        const portalPos = headPos.clone().addScaledVector(forward, 2.2);
        portalPos.y = 1.3;

        // Rotación orientada hacia el jugador (lookAt horizontal)
        const tempGroup = new Group();
        tempGroup.position.copy(portalPos);
        tempGroup.lookAt(new Vector3(headPos.x, 1.3, headPos.z));

        this.spawnPortalAt(portalPos, tempGroup.quaternion);
      }
    }

    // Mantener el HUD perfectamente alineado al portal activo, y ocultar el menú interactivo
    this.queries.portals.entities.forEach((portalEntity) => {
      this.queries.hudPanel.entities.forEach((panelEntity) => {
        const config = panelEntity.getValue(PanelUI, 'config');
        
        // Forzar actualización de matrices en Three.js para obtener las transformadas de mundo exactas
        portalEntity.object3D.updateMatrixWorld(true);
        
        const portalObj = portalEntity.object3D;
        const portalPos = new Vector3();
        const portalQuat = new Quaternion();
        portalObj.getWorldPosition(portalPos);
        portalObj.getWorldQuaternion(portalQuat);

        if (config.includes('game_hud')) {
          // El HUD se posiciona exactamente a y = 1.2m local del portal (el portal tiene radio 1.0m, dejando un espacio libre vertical de 0.1m)
          // Ligeramente hacia adelante (+0.02m) para evitar z-fighting
          const hudPos = portalPos.clone().add(
            new Vector3(0, 1.2, 0.02).applyQuaternion(portalQuat)
          );
          panelEntity.object3D.position.copy(hudPos);
          panelEntity.object3D.quaternion.copy(portalQuat);
        } else if (config.includes('game_menu')) {
          // El menú se esconde enviándolo muy abajo mientras jugamos para que no tape nada
          panelEntity.object3D.position.set(0, -10, 0);
        }
      });
    });

    // Gestionar el spawn de drones desde cada portal activo (nacen al fondo del túnel)
    this.queries.portals.entities.forEach((portalEntity) => {
      let timer = portalEntity.getValue(Portal, 'spawnTimer');
      timer += delta;

      if (timer >= this.spawnInterval) {
        timer = 0;
        
        // Forzar actualización de matrices en Three.js para obtener las transformadas de mundo exactas
        portalEntity.object3D.updateMatrixWorld(true);
        
        const pos = new Vector3();
        portalEntity.object3D.getWorldPosition(pos);
        const quat = new Quaternion();
        portalEntity.object3D.getWorldQuaternion(quat);

        // Spawnea el drone al fondo del túnel (-4.0 metros en Z local del portal)
        const tunnelBottom = new Vector3(0, 0, -4.0).applyQuaternion(quat);
        pos.add(tunnelBottom);

        this.spawnDroneAt(pos);
      }

      portalEntity.setValue(Portal, 'spawnTimer', timer);
      
      // Animación suave de rotación de los anillos del túnel en direcciones alternas
      for (let i = 0; i < 3; i++) {
        const depthRing = portalEntity.object3D.getObjectByName(`depthRing_${i}`);
        if (depthRing) {
          depthRing.rotateZ(delta * (0.3 * (i + 1) * (i % 2 === 0 ? 1 : -1)));
        }
      }
    });
  }
}
