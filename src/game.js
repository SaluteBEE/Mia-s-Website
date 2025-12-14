import Phaser from 'phaser';
import HomeScene from './scenes/HomeScene.js';

// Base vertical resolution for the viewport plus FIT scaling for mobile screens.
export const designWidth = 430;
export const designHeight = 900;

const baseConfig = {
  type: Phaser.AUTO,
  parent: 'game-container',
  backgroundColor: '#87cefa',
  pixelArt: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: designWidth,
    height: designHeight,
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { y: 0 },
    },
  },
  scene: [HomeScene],
};

export const createGame = (parentId = 'game-container') =>
  new Phaser.Game({ ...baseConfig, parent: parentId });

export default baseConfig;
