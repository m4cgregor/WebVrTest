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

    this.queries.hudPanel.subscribe('qualify', (panelEntity) => {
      const doc = panelEntity.getValue(PanelDocument, 'document');
      if (!doc) return;
      this.doc = doc;

      const startBtn = doc.getElementById('start-button');
      const restartBtn = doc.getElementById('restart-button');

      if (startBtn) {
        startBtn.addEventListener('click', () => {
          this.startGame();
        });
      }

      if (restartBtn) {
        restartBtn.addEventListener('click', () => {
          this.startGame();
        });
      }

      // Sincronizar UI inicial
      this.updateUI();
    });
  }

  startGame() {
    this.queries.gameManager.entities.forEach((gmEntity) => {
      gmEntity.setValue(GameManager, 'score', 0);
      gmEntity.setValue(GameManager, 'life', 100);
      gmEntity.setValue(GameManager, 'state', 1); // Playing
    });

    // Entrar en Realidad Mixta (XR) automáticamente
    if (this.world.visibilityState.value === VisibilityState.NonImmersive) {
      this.world.launchXR();
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
        welcomeScreen?.setProperties({ class: 'screen' });
        hudScreen?.setProperties({ class: 'screen hidden' });
        gameOverScreen?.setProperties({ class: 'screen hidden' });
      } else if (state === 1) {
        // Playing
        welcomeScreen?.setProperties({ class: 'screen hidden' });
        hudScreen?.setProperties({ class: 'screen' });
        gameOverScreen?.setProperties({ class: 'screen hidden' });

        if (scoreText) {
          scoreText.setProperties({ text: `PUNTOS: ${score}` });
        }
        if (lifeText) {
          lifeText.setProperties({ text: `VIDA: ${life}%` });
          if (life < 30) {
            lifeText.setProperties({ class: 'hud-item life-critical' });
          } else {
            lifeText.setProperties({ class: 'hud-item life-healthy' });
          }
        }
      } else if (state === 2) {
        // Game Over
        welcomeScreen?.setProperties({ class: 'screen hidden' });
        hudScreen?.setProperties({ class: 'screen hidden' });
        gameOverScreen?.setProperties({ class: 'screen' });

        if (finalScoreText) {
          finalScoreText.setProperties({ text: `Puntuación final: ${score}` });
        }
      }
    });
  }

  update() {
    // Mantener la UI actualizada en cada frame si estamos jugando
    this.updateUI();
  }
}
