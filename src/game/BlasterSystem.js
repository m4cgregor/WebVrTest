import {
  createComponent,
  createSystem,
  Mesh,
  CylinderGeometry,
  BoxGeometry,
  MeshBasicMaterial,
  Group,
  Vector3,
  Quaternion,
  AudioUtils,
  AudioSource
} from '@iwsdk/core';
import { GameManager, Laser } from './components.js';

export const Blaster = createComponent('Blaster', {});

export class BlasterSystem extends createSystem({
  gameManager: { required: [GameManager] },
  blasters: { required: [Blaster] }
}) {
  init() {
    this.fireCooldown = 0.25; // segundos entre disparos
    this.cooldowns = { left: 0, right: 0, keyboard: 0 };

    this.tempPos = new Vector3();
    this.tempQuat = new Quaternion();
    this.tempDir = new Vector3();

    // Crear representaciones visuales de los blásters en las manos
    this.leftBlasterEntity = this.createBlasterVisual(0x3b82f6);  // Azul
    this.rightBlasterEntity = this.createBlasterVisual(0x10b981); // Verde
  }

  createBlasterVisual(colorHex) {
    const blasterGroup = new Group();

    // Cañón del arma
    const barrel = new Mesh(
      new CylinderGeometry(0.02, 0.02, 0.15, 8),
      new MeshBasicMaterial({ color: colorHex })
    );
    barrel.rotateX(Math.PI / 2);
    barrel.position.set(0, 0, -0.05);

    // Mango
    const grip = new Mesh(
      new BoxGeometry(0.025, 0.08, 0.025),
      new MeshBasicMaterial({ color: 0x1f2937 }) // Gris oscuro
    );
    grip.position.set(0, -0.04, 0.02);

    blasterGroup.add(barrel);
    blasterGroup.add(grip);
    blasterGroup.visible = false;

    // Crear la entidad en el mundo
    return this.world.createTransformEntity(blasterGroup);
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

  fireLaser(originPos, direction, quat, gmEntity) {
    // Crear el proyectil láser
    const laserMesh = new Mesh(
      new CylinderGeometry(0.01, 0.01, 0.3, 8),
      new MeshBasicMaterial({ color: 0xffeb3b }) // Láser amarillo brillante
    );
    // Alinear con el vector forward (-Z)
    laserMesh.rotateX(Math.PI / 2);

    const laserEntity = this.world.createTransformEntity(laserMesh);
    // Spawnea ligeramente por delante del blaster
    const spawnPos = originPos.clone().addScaledVector(direction, 0.15);
    
    laserEntity.object3D.position.copy(spawnPos);
    laserEntity.object3D.quaternion.copy(quat);

    // Añadir el componente Laser con su velocidad
    const laserSpeed = 16.0; // m/s
    laserEntity.addComponent(Laser, {
      vx: direction.x * laserSpeed,
      vy: direction.y * laserSpeed,
      vz: direction.z * laserSpeed,
      lifeTime: 3.0
    });

    // Sonido de disparo (chime mp3 en el game manager)
    if (gmEntity && gmEntity.hasComponent(AudioSource)) {
      AudioUtils.play(gmEntity);
    }
  }

  update(delta) {
    const playing = this.isPlaying();

    if (!playing) {
      this.leftBlasterEntity.object3D.visible = false;
      this.rightBlasterEntity.object3D.visible = false;
      return;
    }

    // Decrementar cooldowns
    this.cooldowns.left = Math.max(0, this.cooldowns.left - delta);
    this.cooldowns.right = Math.max(0, this.cooldowns.right - delta);
    this.cooldowns.keyboard = Math.max(0, this.cooldowns.keyboard - delta);

    let gmEntity = null;
    this.queries.gameManager.entities.forEach((gm) => {
      gmEntity = gm;
    });

    // 1. Mandos VR (WebXR Input)
    const hands = ['left', 'right'];
    hands.forEach((hand) => {
      const gp = this.input.xr.gamepads[hand];
      const raySpace = this.player.raySpaces[hand];
      const blasterEntity = hand === 'left' ? this.leftBlasterEntity : this.rightBlasterEntity;

      const connected = gp && gp.connected;

      if (connected) {
        blasterEntity.object3D.visible = true;

        // Copiar transformadas de los controladores reales
        raySpace.getWorldPosition(this.tempPos);
        raySpace.getWorldQuaternion(this.tempQuat);

        blasterEntity.object3D.position.copy(this.tempPos);
        blasterEntity.object3D.quaternion.copy(this.tempQuat);

        // Disparo al pulsar gatillo
        if (gp.getButtonDown('xr-standard-trigger') && this.cooldowns[hand] === 0) {
          this.cooldowns[hand] = this.fireCooldown;

          // Obtener vector forward
          this.tempDir.set(0, 0, -1).applyQuaternion(this.tempQuat).normalize();
          this.fireLaser(this.tempPos, this.tempDir, this.tempQuat, gmEntity);
        }
      } else {
        blasterEntity.object3D.visible = false;
      }
    });

    // 2. Teclado (Para pruebas sin mandos/headset)
    if (this.input.keyboard.getKeyDown('Space') && this.cooldowns.keyboard === 0) {
      this.cooldowns.keyboard = this.fireCooldown;

      const head = this.player.head;
      head.getWorldPosition(this.tempPos);
      head.getWorldQuaternion(this.tempQuat);

      this.tempDir.set(0, 0, -1).applyQuaternion(this.tempQuat).normalize();

      // Disparar desde el medio de la vista
      this.fireLaser(this.tempPos, this.tempDir, this.tempQuat, gmEntity);
    }
  }
}
