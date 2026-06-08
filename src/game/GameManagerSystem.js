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
  panels: { required: [PanelUI, PanelDocument] }
}) {
  init() {
    this.doc = null;
    this.menuDoc = null;
    this.hudDoc = null;
    this.eventsBound = false;
  }

  bindUIEvents() {
    if (this.eventsBound) return;
    this.eventsBound = true;

    const startBtn = this.doc.menu.getElementById('start-button');
    const restartBtn = this.doc.menu.getElementById('restart-button');

    if (startBtn) {
      startBtn.name = 'start-button';
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

      const welcomeScreen = this.doc.menu.getElementById('welcome-screen');
      const gameOverScreen = this.doc.menu.getElementById('game-over-screen');
      const scoreText = this.doc.hud.getElementById('score-text');
      const lifeText = this.doc.hud.getElementById('life-text');
      const finalScoreText = this.doc.menu.getElementById('final-score-text');

      if (state === 0) {
        // Welcome Screen
        welcomeScreen?.setProperties({ display: 'flex' });
        gameOverScreen?.setProperties({ display: 'none' });
      } else if (state === 1) {
        // Playing
        welcomeScreen?.setProperties({ display: 'none' });
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
        gameOverScreen?.setProperties({ display: 'flex' });

        if (finalScoreText) {
          finalScoreText.setProperties({ text: `Puntuacion final: ${score}` });
        }
      }
    });
  }

  update() {
    // Si la UI aún no ha cargado, intentamos resolver los documentos dinámicamente
    if (!this.doc) {
      this.queries.panels.entities.forEach((panelEntity) => {
        const config = panelEntity.getValue(PanelUI, 'config');
        const doc = panelEntity.getValue(PanelDocument, 'document');
        if (doc) {
          if (config.includes('game_menu')) {
            this.menuDoc = doc;
          } else if (config.includes('game_hud')) {
            this.hudDoc = doc;
          }
        }
      });
      if (this.menuDoc && this.hudDoc) {
        this.doc = {
          menu: this.menuDoc,
          hud: this.hudDoc
        };
        this.bindUIEvents();
      }
    }

    // Mantener la UI actualizada en cada frame si estamos jugando
    this.updateUI();
  }
}
