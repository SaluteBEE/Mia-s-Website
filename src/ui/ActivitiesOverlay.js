export default class ActivitiesOverlay {
  constructor(scene) {
    this.scene = scene;
    this.activeMessage = null;

    const { width, height } = scene.scale;
    const containerWidth = width * 0.7;
    const containerHeight = 120;

    this.container = scene.add.container(width / 2, height * 0.3).setDepth(30);
    this.background = scene.add
      .rectangle(0, 0, containerWidth, containerHeight, 0x000000, 0.55)
      .setStrokeStyle(2, 0xffffff)
      .setOrigin(0.5);
    this.label = scene.add
      .text(0, 0, '', {
        font: '22px Arial',
        fill: '#ffffff',
        stroke: '#000000',
        strokeThickness: 4,
        align: 'center',
      })
      .setOrigin(0.5);

    this.container.add([this.background, this.label]);
    this.container.setVisible(false);
  }

  showMessage(text, duration = 2500) {
    this.activeMessage = text;
    this.label.setText(text);
    this.container.setVisible(true);
    this.scene.time.delayedCall(duration, () => {
      if (this.activeMessage !== text) return;
      this.hide();
    });
  }

  hide() {
    this.activeMessage = null;
    this.container.setVisible(false);
  }

  startEatMenu() {
    this.showMessage('开始吃饭...');
    this.scene.logAction?.('开始吃饭');
  }

  startSleep() {
    this.showMessage('准备睡觉...');
    this.scene.logAction?.('准备睡觉');
  }

  update() {
    // 暂无额外逻辑，预留给后续动画/倒计时。
  }

  destroy() {
    this.container?.destroy(true);
  }
}
