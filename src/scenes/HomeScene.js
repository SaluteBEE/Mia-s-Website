import Phaser from 'phaser';
import ActivitiesOverlay from '../ui/ActivitiesOverlay.js';
import worldObjects from '../config/worldObjects.js';
import playerConfig from '../config/playerConfig.js';
import planetPng from '../assets/planet.png';

export default class HomeScene extends Phaser.Scene {
  constructor() {
    super('HomeScene');
  }

  preload() {
    // 玩家、行星、背景
    this.load.image(playerConfig.textureKey, playerConfig.texture);
    this.load.image('planet', planetPng);
    this.load.image('homeBg', 'https://labs.phaser.io/assets/skies/deepblue.png');

    // 配置化物体纹理
    worldObjects.forEach((obj) => {
      if (obj.textureKey && (obj.texture || obj.texturePath)) {
        this.load.image(obj.textureKey, obj.texture ?? obj.texturePath);
      }
    });
  }

  create() {
    const w = this.scale.width;
    const h = this.scale.height;
    this.viewWidth = w;
    this.viewHeight = h;

    // 背景
    this.add.image(w / 2, h / 2, 'homeBg').setDisplaySize(w, h);

    // 行星参数
    this.planetCenter = { x: w / 2, y: h + h * 0.8 };
    this.planetRadius = h * 1.25;
    this.planetAngle = 0;
    this.targetRotation = null;
    this.targetCallback = null;
    this.pendingStatusLabel = null;

    this.currentCoordText = this.add.text(12, 68, '角度: 0°', {
      font: '16px Arial',
      fill: '#ffffff',
      stroke: '#000000',
      strokeThickness: 3,
    });

    // 行星贴图
    this.planetImage = this.add
      .image(this.planetCenter.x, this.planetCenter.y, 'planet')
      .setDisplaySize(this.planetRadius * 2, this.planetRadius * 2)
      .setDepth(0);

    // 顶部时间
    this.timeText = this.add
      .text(12, 12, this.getLocalTimeString(), {
        font: '18px Arial',
        fill: '#ffffff',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setDepth(10);
    this.timeAccumulator = 0;

    // 状态
    this.statusText = this.add
      .text(12, 40, '闲逛中...', {
        font: '18px Arial',
        fill: '#ffeb3b',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setDepth(10);

    // 日志与滚动字幕
    this.logs = [];
    this.moveState = 'idle';
    this.marqueeStartY = 12;
    this.marqueeSpacing = 22;
    this.marqueeMax = 4;
    this.marqueeX = w - 12;
    this.marqueeEntries = [];

    // 玩家
    const surfaceTopY = this.getPointOnPlanet(0).y;
    const playerYOffset = playerConfig.yOffset ?? -8;
    this.player = this.physics.add.sprite(w / 2, surfaceTopY + playerYOffset, playerConfig.textureKey);
    this.player.setScale(playerConfig.scale ?? 1);
    this.player.setCollideWorldBounds(true);
    this.player.body.setAllowGravity(false);
    this.player.setDepth(playerConfig.depth ?? 1);

    this.cursors = this.input.keyboard.createCursorKeys();

    // 事件点（睡觉由床物体处理，不用圆点）
    this.actionPoints = [{ key: 'eat', label: '吃饭', baseAngle: 0.45, color: 0xff5722 }];
    this.pointObjects = [];

    this.actionPoints.forEach((point) => {
      const marker = this.add
        .circle(0, 0, 14, point.color)
        .setStrokeStyle(2, 0xffffff)
        .setInteractive({ useHandCursor: true })
        .setDepth(0.5);

      const handleClick = () => {
        if (point.key === 'eat') {
          this.moveToAngle(point.baseAngle, () => this.activities.startEatMenu());
        } else {
          this.statusText.setText('前往事件点...');
          this.pendingStatusLabel = point.label;
          this.targetRotation = Phaser.Math.Angle.Wrap(-point.baseAngle);
          this.logAction(`前往${point.label}`);
        }
      };
      marker.on('pointerdown', handleClick);

      const label = this.add
        .text(0, 0, point.label, {
          font: '14px Arial',
          fill: '#ffffff',
          stroke: '#000000',
          strokeThickness: 3,
        })
        .setOrigin(0.5, 1)
        .setDepth(0.6);

      this.pointObjects.push({ point, marker, label });
    });

    // 配置化物体（床、桌子等）
    this.worldObjects = [];
    worldObjects.forEach((cfg) => {
      const img = this.add
        .image(0, 0, cfg.textureKey)
        .setOrigin(0.5, 1)
        .setScale(cfg.scale ?? 1)
        .setDepth(cfg.depth ?? 0.4);
      if (cfg.interactive) {
        img.setInteractive({ useHandCursor: true });
      }
      const label = this.add
        .text(0, 0, cfg.name ?? '', {
          font: '14px Arial',
          fill: '#ffffff',
          stroke: '#000000',
          strokeThickness: 3,
        })
        .setOrigin(0.5, 1)
        .setDepth((cfg.depth ?? 0.4) + 0.1);

      const handleObjClick = () => {
        if (cfg.action === 'sleep') {
          this.moveToAngle(cfg.angle, () => this.activities.startSleep());
        } else if (cfg.action === 'eat') {
          this.moveToAngle(cfg.angle, () => this.activities.startEatMenu());
        }
      };
      if (cfg.interactive) {
        img.on('pointerdown', handleObjClick);
        label.setInteractive({ useHandCursor: true });
        label.on('pointerdown', handleObjClick);
      }

      this.worldObjects.push({ cfg, img, label });
    });

    this.updateActionPointPositions();

    // 底部按键
    this.leftButtonDown = false;
    this.rightButtonDown = false;
    const buttonY = h - 70;
    this.createButton(w * 0.3, buttonY, '< 左', () => {
      this.leftButtonDown = true;
    }, () => {
      this.leftButtonDown = false;
    });
    this.createButton(w * 0.7, buttonY, '右 >', () => {
      this.rightButtonDown = true;
    }, () => {
      this.rightButtonDown = false;
    });

    // 弹窗/活动
    this.activities = new ActivitiesOverlay(this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.activities?.destroy());

    this.logAction('进入家场景');
  }

  update(time, delta) {
    const rotationSpeed = 0.0018 * delta;
    let currentMoveState = 'idle';

    if (this.targetRotation !== null) {
      const diff = Phaser.Math.Angle.Wrap(this.targetRotation - this.planetAngle);
      const step = Math.sign(diff) * rotationSpeed;
      if (Math.abs(diff) <= Math.abs(step)) {
        this.planetAngle = this.targetRotation;
        this.targetRotation = null;
        if (this.pendingStatusLabel) {
          this.statusText.setText(this.pendingStatusLabel);
          this.logAction(this.pendingStatusLabel);
          this.pendingStatusLabel = null;
        }
        if (this.targetCallback) {
          const cb = this.targetCallback;
          this.targetCallback = null;
          cb();
        }
      } else {
        this.planetAngle += step;
      }
    } else {
      let moved = false;
      if (this.cursors.left.isDown || this.leftButtonDown) {
        this.planetAngle += rotationSpeed;
        moved = true;
        currentMoveState = 'left';
      } else if (this.cursors.right.isDown || this.rightButtonDown) {
        this.planetAngle -= rotationSpeed;
        moved = true;
        currentMoveState = 'right';
      }
      if (moved) {
        this.statusText.setText('闲逛中...');
      }
    }

    if (currentMoveState !== this.moveState) {
      if (currentMoveState === 'left') {
        this.logAction('向左移动');
      } else if (currentMoveState === 'right') {
        this.logAction('向右移动');
      } else if (this.moveState !== 'idle') {
        this.logAction('停止移动');
      }
      this.moveState = currentMoveState;
    }

    const surfaceTopY = this.getPointOnPlanet(0).y;
    const playerYOffset = playerConfig.yOffset ?? -8;
    this.player.setPosition(this.viewWidth / 2, surfaceTopY + playerYOffset);
    this.player.flipX = false;

    if (this.planetImage) {
      this.planetImage.setRotation(this.planetAngle);
    }

    this.updateActionPointPositions();

    const deg = Phaser.Math.Wrap(this.planetAngle * Phaser.Math.RAD_TO_DEG * -1, 0, 360);
    this.currentCoordText.setText(`角度: ${deg.toFixed(1)}°`);

    this.timeAccumulator += delta;
    if (this.timeAccumulator >= 500) {
      this.timeText.setText(this.getLocalTimeString());
      this.timeAccumulator = 0;
    }

    if (this.activities) {
      this.activities.update(time, delta);
    }
  }

  updateActionPointPositions() {
    this.pointObjects.forEach(({ point, marker, label }) => {
      const angle = point.baseAngle + this.planetAngle;
      const pos = this.getPointOnPlanet(angle);
      if (marker) {
        marker.setPosition(pos.x, pos.y);
      }
      label.setPosition(pos.x, pos.y - 20);
      label.setRotation(0);
    });

    // 配置化物体的位置更新
    this.worldObjects.forEach(({ cfg, img, label }) => {
      const angle = cfg.angle + this.planetAngle;
      const pos = this.getPointOnPlanet(angle);
      const yOffset = cfg.yOffset ?? 0;
      img.setPosition(pos.x, pos.y + yOffset);
      img.setRotation(angle);
      label.setPosition(pos.x, pos.y + yOffset - (img.displayHeight || 40) - 8);
      label.setRotation(0);
    });
  }

  getPointOnPlanet(angle) {
    const x = this.planetCenter.x + Math.sin(angle) * this.planetRadius;
    const y = this.planetCenter.y - Math.cos(angle) * this.planetRadius;
    return { x, y };
  }

  moveToAngle(targetAngle, callback) {
    this.statusText.setText('前往事件点...');
    this.pendingStatusLabel = null;
    this.targetRotation = Phaser.Math.Angle.Wrap(-targetAngle);
    this.targetCallback = callback || null;
  }

  createButton(x, y, label, onDown, onUp) {
    const width = 120;
    const height = 50;
    const bg = this.add
      .rectangle(x, y, width, height, 0x1a1a1a, 0.7)
      .setStrokeStyle(2, 0xffffff)
      .setInteractive({ useHandCursor: true });
    const txt = this.add
      .text(x, y, label, {
        font: '18px Arial',
        fill: '#ffffff',
        stroke: '#000000',
        strokeThickness: 2,
      })
      .setOrigin(0.5);

    bg.on('pointerdown', () => {
      bg.setFillStyle(0x333333, 0.9);
      onDown();
    });
    bg.on('pointerup', () => {
      bg.setFillStyle(0x1a1a1a, 0.7);
      onUp();
    });
    bg.on('pointerout', () => {
      bg.setFillStyle(0x1a1a1a, 0.7);
      onUp();
    });

    txt.setInteractive({ useHandCursor: true });
    txt.on('pointerdown', () => bg.emit('pointerdown'));
    txt.on('pointerup', () => bg.emit('pointerup'));
    txt.on('pointerout', () => bg.emit('pointerout'));

    return { bg, txt };
  }

  logAction(desc) {
    const timestamp = new Date().toLocaleTimeString();
    const entry = `[${timestamp}] ${desc}`;
    this.logs.push(entry);
    console.log(entry);
    const txt = this.add
      .text(this.marqueeX, this.marqueeStartY, desc, {
        font: '16px Arial',
        fill: '#fffbe6',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(1, 0)
      .setDepth(20);

    this.marqueeEntries.forEach(({ text }) => {
      this.tweens.add({
        targets: text,
        y: text.y + this.marqueeSpacing,
        duration: 150,
        ease: 'Quad.easeOut',
      });
    });

    this.marqueeEntries.unshift({ text: txt });

    if (this.marqueeEntries.length > this.marqueeMax) {
      const removed = this.marqueeEntries.pop();
      if (removed && removed.text) {
        this.tweens.add({
          targets: removed.text,
          alpha: 0,
          duration: 200,
          onComplete: () => removed.text.destroy(),
        });
      }
    }

    this.time.delayedCall(4000, () => {
      const idx = this.marqueeEntries.findIndex((e) => e.text === txt);
      if (idx === -1) return;
      this.marqueeEntries.splice(idx, 1);
      this.tweens.add({
        targets: txt,
        alpha: 0,
        duration: 250,
        onComplete: () => {
          txt.destroy();
          this.compactMarquee();
        },
      });
    });
  }

  compactMarquee() {
    this.marqueeEntries.forEach(({ text }, index) => {
      this.tweens.add({
        targets: text,
        y: this.marqueeStartY + index * this.marqueeSpacing,
        duration: 150,
        ease: 'Quad.easeOut',
      });
    });
  }

  getLocalTimeString() {
    const now = new Date();
    return now.toLocaleString(undefined, {
      hour12: false,
      timeZoneName: 'short',
    });
  }
}
