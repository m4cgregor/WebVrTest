import {
  createSystem,
  PanelUI,
  PanelDocument,
  eq,
  VisibilityState
} from '@iwsdk/core';
import { GameManager } from './components.js';

export class GameManagerSystem extends createSystem({
  gameManager: { required: [GameManager] },
  hudPanel: {
    required: [PanelUI, PanelDocument],
    where: [eq(PanelUI, 'config', './ui/game_hud.json')]
  }
}) {
  init() {
    this.doc = null;
    this.eventsBound = false;
  }

  bindUIEvents(doc) {
    if (this.eventsBound) return;
    this.eventsBound = true;
    console.log('[GameManagerSystem] bindUIEvents called! Available IDs in doc:', Array.from(doc.elementMap.keys()));

    const startBtn = doc.getElementById('start-button');
    const restartBtn = doc.getElementById('restart-button');

    if (startBtn) {
      startBtn.name = 'start-button';
      console.log('[GameManagerSystem] startBtn UUID:', startBtn.uuid);
      startBtn.addEventListener('click', () => {
        console.log('[GameManagerSystem] Start button clicked!');
        this.startGame();
      });
    }

    if (restartBtn) {
      restartBtn.name = 'restart-button';
      restartBtn.addEventListener('click', () => {
        console.log('[GameManagerSystem] Restart button clicked!');
        this.startGame();
      });
    }

    // Sincronizar UI inicial
    this.updateUI();
  }

  startGame() {
    this.queries.gameManager.entities.forEach((gmEntity) => {
      gmEntity.setValue(GameManager, 'score', 0);
      gmEntity.setValue(GameManager, 'life', 100);
      gmEntity.setValue(GameManager, 'state', 1); // Playing
    });

    // Entrar en Realidad Mixta (XR) automáticamente
    if (this.world.visibilityState.value === VisibilityState.NonImmersive) {
      try {
        this.world.launchXR();
      } catch (err) {
        console.warn('[GameManagerSystem] Failed to launch XR (user gesture required):', err);
      }
    }

    this.updateUI();
  }

  endGame(finalScore) {
    this.queries.gameManager.entities.forEach((gmEntity) => {
      gmEntity.setValue(GameManager, 'state', 2); // GameOver
    });
    this.updateUI();
  }

  updateUI() {
    if (!this.doc) return;

    this.queries.gameManager.entities.forEach((gmEntity) => {
      const state = gmEntity.getValue(GameManager, 'state');
      const score = gmEntity.getValue(GameManager, 'score');
      const life = gmEntity.getValue(GameManager, 'life');

      const welcomeScreen = this.doc.getElementById('welcome-screen');
      const hudScreen = this.doc.getElementById('hud-screen');
      const gameOverScreen = this.doc.getElementById('game-over-screen');
      const scoreText = this.doc.getElementById('score-text');
      const lifeText = this.doc.getElementById('life-text');
      const finalScoreText = this.doc.getElementById('final-score-text');

      if (state === 0) {
        // Welcome Screen
        welcomeScreen?.setProperties({ display: 'flex' });
        hudScreen?.setProperties({ display: 'none' });
        gameOverScreen?.setProperties({ display: 'none' });
      } else if (state === 1) {
        // Playing
        welcomeScreen?.setProperties({ display: 'none' });
        hudScreen?.setProperties({ display: 'flex' });
        gameOverScreen?.setProperties({ display: 'none' });

        if (scoreText) {
          scoreText.setProperties({ text: `PUNTOS: ${score}` });
        }
        if (lifeText) {
          lifeText.setProperties({ text: `VIDA: ${life}%` });
          if (life < 30) {
            lifeText.setProperties({ color: '#ef4444' });
          } else {
            lifeText.setProperties({ color: '#10b981' });
          }
        }
      } else if (state === 2) {
        // Game Over
        welcomeScreen?.setProperties({ display: 'none' });
        hudScreen?.setProperties({ display: 'none' });
        gameOverScreen?.setProperties({ display: 'flex' });

        if (finalScoreText) {
          finalScoreText.setProperties({ text: `Puntuacion final: ${score}` });
        }
      }
    });
  }

  update() {
    // Si la UI aún no ha cargado, intentamos resolver el documento dinámicamente
    if (!this.doc) {
      this.queries.hudPanel.entities.forEach((panelEntity) => {
        const doc = panelEntity.getValue(PanelDocument, 'document');
        if (doc) {
          this.doc = doc;
          this.bindUIEvents(doc);
        }
      });
    }

    // Mantener la UI actualizada en cada frame si estamos jugando
    this.updateUI();
  }
}
