import Phaser from 'phaser';

export default class HelloScene extends Phaser.Scene {
  constructor() {
    super('HelloScene');
  }

  preload() {
    console.log('preload: loading assets');
  }

  create() {
    console.log('create: scene starts');
    this.text = this.add.text(100, 140, 'Hello Mia ❤️', {
      color: '#ffffff'
    });
  }

  update() {
    this.text.x += 0.3;
  }
}
