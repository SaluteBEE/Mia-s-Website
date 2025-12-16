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

    // 行星参数
    this.planetCenter = { x: w / 2, y: h + h * 0.8 };
    this.planetRadius = h * 1.25;
    this.planetAngle = 0;
    this.targetRotation = null;
    this.targetCallback = null;

    // 天空底板与昼夜遮罩（底板直接用填充色，便于动态变色）
    this.skyRect = this.add
      .rectangle(w / 2, h / 2, w, h, 0x1a2e57)
      .setDepth(-2);
    this.dayNightOverlay = this.add
      .rectangle(w / 2, h / 2, w, h, 0x00142c, 0.12)
      .setDepth(-1);
    this.sunriseTimestamp = null;
    this.sunsetTimestamp = null;
    this.dayNightCheckAccumulator = 0;
    this.debugOverrideTs = null;
    this.loadSunriseSunset();
    this.initStarField();
    // 行星贴图
    this.planetImage = this.add
      .image(this.planetCenter.x, this.planetCenter.y, 'planet')
      .setDisplaySize(this.planetRadius * 2, this.planetRadius * 2)
      .setDepth(0);

    // 基础数值与状态条（能源 / 蓄水 / 精力）
    this.maxStatValue = 100;
    this.energyValue = 80;
    this.waterValue = 30;
    this.staminaValue = 70;
    this.loadPersistedWater();
    this.createStatBars();

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

    // 事件点圆点删除，改为靠近时显示标签
    this.pointObjects = [];

    // 配置化物体（床、桌子、广告牌、火箭）
    this.worldObjects = [];
    this.activeDescriptionEntry = null;
    this.descriptionHideTimer = null;
    this.waterExtractButton = null;
    this.waterExtractButtonTargetEntry = null;
    this.rocketEntry = null;
    this.rocketBaseEntry = null;
    this.isRocketLaunching = false;
    worldObjects.forEach((cfg) => {
      const img = this.add
        .image(0, 0, cfg.textureKey)
        .setOrigin(0.5, 1)
        .setScale(cfg.scale ?? 1)
        .setDepth(cfg.depth ?? 0.4);
      img.setInteractive({ useHandCursor: true });
      const label = this.add
        .text(0, 0, cfg.name ?? '', {
          font: '14px Arial',
          fill: '#ffffff',
          stroke: '#000000',
          strokeThickness: 3,
        })
        .setOrigin(0.5, 1)
        .setDepth((cfg.depth ?? 0.4) + 0.1);

      let descBg = null;
      let descText = null;
      if (cfg.description) {
        const bubbleWidth = Math.min(this.viewWidth * 0.7, 320);
        const bubblePadding = 10;
        descBg = this.add
          .rectangle(0, 0, bubbleWidth, 10, 0x000000, 0.65)
          .setOrigin(0.5, 0)
          .setStrokeStyle(2, 0xffffff, 0.9)
          .setDepth((cfg.depth ?? 0.4) + 0.05)
          .setVisible(false);
        descText = this.add
          .text(0, 0, cfg.description, {
            font: '16px Arial',
            fill: '#fffbe6',
            stroke: '#000000',
            strokeThickness: 3,
            wordWrap: { width: bubbleWidth - bubblePadding * 2, useAdvancedWrap: true },
            align: 'center',
          })
          .setOrigin(0.5, 0)
          .setDepth((cfg.depth ?? 0.4) + 0.06)
          .setVisible(false);
        const finalHeight = descText.height + bubblePadding * 2;
        descBg.setSize(bubbleWidth, finalHeight);
      }

      const handleObjClick = () => {
        this.moveToAngle(cfg.angle, () => {
          this.showObjectDescriptionByCfg(cfg);
          this.handleObjectAction(cfg);
        });
      };
      img.on('pointerdown', handleObjClick);
      label.setInteractive({ useHandCursor: true });
      label.on('pointerdown', handleObjClick);

      const entry = { cfg, img, label, descBg, descText };
      if (cfg.id === 'rocket') {
        this.rocketEntry = entry;
      } else if (cfg.id === 'rocketBase') {
        this.rocketBaseEntry = entry;
      }
      this.worldObjects.push(entry);
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
        if (this.activeDescriptionEntry) {
          this.hideAllObjectDescriptions();
        }
        this.hideWaterExtractButton();
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

    if (this.starGraphics && this.starParticles) {
      this.updateStarField(delta);
    }

    // 白天/黑夜遮罩，每 30 秒检查一次
    this.dayNightCheckAccumulator += delta;
    if (this.dayNightCheckAccumulator >= 30000) {
      this.updateDayNight();
      this.dayNightCheckAccumulator = 0;
    }

    if (this.activities) {
      this.activities.update(time, delta);
    }
  }

  updateActionPointPositions() {
    // 配置化物体的位置更新
    const proximity = 90;
    const playerPos = { x: this.player.x, y: this.player.y };
    this.worldObjects.forEach((entry) => {
      const { cfg, img, label } = entry;
      if (cfg.id === 'rocket' && this.isRocketLaunching) {
        return;
      }
      const angle = cfg.angle + this.planetAngle;
      const pos = this.getPointOnPlanet(angle);
      const yOffset = cfg.yOffset ?? 0;
      const objX = pos.x;
      const objY = pos.y + yOffset;
      img.setPosition(objX, objY);
      img.setRotation(angle);
      label.setPosition(objX, objY - (img.displayHeight || 40) - 8);
      label.setRotation(0);
      if (entry.descBg && entry.descText) {
        const bubbleGap = 10;
        const bubbleY = objY + bubbleGap;
        entry.descBg.setPosition(objX, bubbleY);
        entry.descBg.setRotation(0);
        const bgHeight = entry.descBg.height ?? entry.descBg.displayHeight ?? 40;
        const textY = bubbleY + (bgHeight - entry.descText.height) * 0.5;
        entry.descText.setPosition(objX, textY);
        entry.descText.setRotation(0);
      }
      const dx = playerPos.x - objX;
      const dy = playerPos.y - objY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const visible = dist <= proximity;
      label.setVisible(visible);
      entry.pos = { x: objX, y: objY };
    });
  }

  initStarField() {
    const w = this.viewWidth;
    const h = this.viewHeight;
    this.starGraphics = this.add.graphics();
    // 让星空处在天空矩形之上、昼夜遮罩之下
    this.starGraphics.setDepth(-1.5);
    this.starGraphics.setBlendMode(Phaser.BlendModes.ADD);

    this.starParticles = [];
    this.starMaxLinkDist = 150;
    this.starMaxSpeed = 80; // 像素/秒
    this.starJitter = 20;
    this.starFriction = 0.96;

    const particleCount = 100;
    const colors = [0x00ffff, 0xff00ff, 0xffff00, 0x00ff00, 0xff0080];

    for (let i = 0; i < particleCount; i++) {
      this.starParticles.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * this.starMaxSpeed,
        vy: (Math.random() - 0.5) * this.starMaxSpeed,
        size: Math.random() * 1.8 + 0.8,
        color: colors[Math.floor(Math.random() * colors.length)],
        glow: Math.random() * 6 + 4,
      });
    }
  }

  updateStarField(delta) {
    const g = this.starGraphics;
    const particles = this.starParticles;
    if (!g || !particles || !particles.length) return;

    const dt = delta / 1000;
    const w = this.viewWidth;
    const h = this.viewHeight;
    const maxDist = this.starMaxLinkDist;
    const maxSpeed = this.starMaxSpeed;
    const jitter = this.starJitter;
    const friction = this.starFriction;

    g.clear();

    const pointer = this.input?.activePointer;
    const mx = pointer ? pointer.x : w * 0.5;
    const my = pointer ? pointer.y : h * 0.4;

    // 更新与绘制星点（带辉光）
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];

      // 运动积分
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      // 轻微随机扰动，让星空更有生命力
      p.vx += (Math.random() - 0.5) * jitter * dt;
      p.vy += (Math.random() - 0.5) * jitter * dt;

      // 鼠标/触控点微弱斥力
      const dxm = mx - p.x;
      const dym = my - p.y;
      const distm = Math.hypot(dxm, dym);
      if (distm > 0 && distm < maxDist) {
        const force = (maxDist - distm) / maxDist;
        const k = 25;
        p.vx -= (dxm / distm) * force * k * dt;
        p.vy -= (dym / distm) * force * k * dt;
      }

      // 边界反弹
      if (p.x < 0 || p.x > w) p.vx *= -1;
      if (p.y < 0 || p.y > h) p.vy *= -1;

      // 阻尼与速度上限
      p.vx *= friction;
      p.vy *= friction;
      const speed = Math.hypot(p.vx, p.vy);
      if (speed > maxSpeed) {
        const s = maxSpeed / speed;
        p.vx *= s;
        p.vy *= s;
      }

      // 绘制柔和辉光
      g.fillStyle(p.color, 0.16);
      g.fillCircle(p.x, p.y, p.size + p.glow);
      // 绘制核心高亮
      g.fillStyle(p.color, 0.9);
      g.fillCircle(p.x, p.y, p.size);
    }

    // 星点之间的连线
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      for (let j = i + 1; j < particles.length; j++) {
        const o = particles[j];
        const dx = o.x - p.x;
        const dy = o.y - p.y;
        const dist = Math.hypot(dx, dy);
        if (dist < maxDist) {
          const alpha = ((maxDist - dist) / maxDist) * 0.35;
          if (alpha <= 0) continue;
          g.lineStyle(0.7, 0x64c8ff, alpha);
          g.beginPath();
          g.moveTo(p.x, p.y);
          g.lineTo(o.x, o.y);
          g.strokePath();
        }
      }
    }
  }

  createStatBars() {
    this.statBars = {};
    this.statBarWidth = 140;
    this.statBarHeight = 14;
    const startX = 12;
    const startY = 96;
    const gapY = 26;

    this.statBars.energy = this.createSingleStatBar(startX, startY + gapY * 0, '能源', 0xffc107);
    this.statBars.water = this.createSingleStatBar(startX, startY + gapY * 1, '蓄水', 0x03a9f4);
    this.statBars.stamina = this.createSingleStatBar(startX, startY + gapY * 2, '精力', 0x8bc34a);

    this.updateStatBars();
  }

  createSingleStatBar(x, y, label, color) {
    const labelText = this.add
      .text(x, y - 8, label, {
        font: '14px Arial',
        fill: '#ffffff',
        stroke: '#000000',
        strokeThickness: 2,
      })
      .setOrigin(0, 1)
      .setDepth(10);

    const bg = this.add
      .rectangle(x, y, this.statBarWidth, this.statBarHeight, 0x000000, 0.55)
      .setOrigin(0, 0.5)
      .setDepth(9);

    const fill = this.add
      .rectangle(x, y, this.statBarWidth, this.statBarHeight, color, 0.9)
      .setOrigin(0, 0.5)
      .setDepth(10);

    return { labelText, bg, fill, color };
  }

  updateStatBars() {
    if (!this.statBars) return;
    const max = this.maxStatValue || 100;
    const clamp01Local = (v) => Math.max(0, Math.min(1, v));

    const apply = (bar, value) => {
      if (!bar || !bar.fill) return;
      const ratio = clamp01Local((value ?? 0) / max);
      bar.fill.displayWidth = this.statBarWidth * ratio;
    };

    apply(this.statBars.energy, this.energyValue);
    apply(this.statBars.water, this.waterValue);
    apply(this.statBars.stamina, this.staminaValue);
  }

  loadPersistedWater() {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return;
      const raw = window.localStorage.getItem('miaPlanet_water');
      if (!raw) return;
      const value = Number(raw);
      if (Number.isNaN(value)) return;
      const max = this.maxStatValue || 100;
      this.waterValue = Math.max(0, Math.min(max, value));
    } catch (e) {
      console.warn('加载蓄水状态失败，将使用默认值', e);
    }
  }

  savePersistedWater() {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return;
      const max = this.maxStatValue || 100;
      const value = Math.max(0, Math.min(max, this.waterValue ?? 0));
      window.localStorage.setItem('miaPlanet_water', String(value));
    } catch (e) {
      console.warn('保存蓄水状态失败', e);
    }
  }

  getPointOnPlanet(angle) {
    const x = this.planetCenter.x + Math.sin(angle) * this.planetRadius;
    const y = this.planetCenter.y - Math.cos(angle) * this.planetRadius;
    return { x, y };
  }

  moveToAngle(targetAngle, callback) {
    this.targetRotation = Phaser.Math.Angle.Wrap(-targetAngle);
    this.targetCallback = callback || null;
    this.hideAllObjectDescriptions();
    this.hideWaterExtractButton();
  }

  showObjectDescriptionByCfg(cfg) {
    const entry = this.worldObjects.find((e) => e.cfg === cfg);
    if (!entry) return;
    this.showObjectDescription(entry);
  }

  showObjectDescription(entry) {
    if (!entry || !entry.descBg || !entry.descText) return;
    this.hideAllObjectDescriptions();
    entry.descBg.setVisible(true);
    entry.descText.setVisible(true);
    this.activeDescriptionEntry = entry;
    if (this.descriptionHideTimer) {
      this.descriptionHideTimer.remove(false);
      this.descriptionHideTimer = null;
    }
    this.descriptionHideTimer = this.time.delayedCall(5000, () => {
      if (this.activeDescriptionEntry === entry) {
        this.hideAllObjectDescriptions();
      }
    });
  }

  hideAllObjectDescriptions() {
    if (this.descriptionHideTimer) {
      this.descriptionHideTimer.remove(false);
      this.descriptionHideTimer = null;
    }
    this.worldObjects.forEach((entry) => {
      if (entry.descBg) {
        entry.descBg.setVisible(false);
      }
      if (entry.descText) {
        entry.descText.setVisible(false);
      }
    });
    this.activeDescriptionEntry = null;
  }

  showWaterExtractButtonByCfg(cfg) {
    const entry = this.worldObjects.find((e) => e.cfg === cfg);
    if (!entry) return;
    this.showWaterExtractButton(entry);
  }

  showWaterExtractButton(entry) {
    if (!entry || !entry.pos) return;

    if (!this.waterExtractButton) {
      const { bg, txt } = this.createButton(0, 0, '抽取水分', () => {
        this.onWaterExtractButtonClick();
      }, () => {});
      bg.setDepth(18);
      txt.setDepth(19);
      this.waterExtractButton = { bg, txt };
    }

    const btn = this.waterExtractButton;
    const imgHeight = entry.img?.displayHeight || 40;
    const offsetY = imgHeight + 20;
    const x = entry.pos.x;
    const y = entry.pos.y - offsetY;

    btn.bg.setPosition(x, y);
    btn.txt.setPosition(x, y);
    btn.bg.setVisible(true);
    btn.txt.setVisible(true);

    this.waterExtractButtonTargetEntry = entry;
  }

  hideWaterExtractButton() {
    if (!this.waterExtractButton) return;
    this.waterExtractButton.bg.setVisible(false);
    this.waterExtractButton.txt.setVisible(false);
    this.waterExtractButtonTargetEntry = null;
  }

  onWaterExtractButtonClick() {
    this.waterValue = this.maxStatValue || 100;
    this.updateStatBars();
    this.savePersistedWater();
    this.logAction('抽水站启动，蓄水值已填满');
    this.hideWaterExtractButton();
  }

  startRocketLaunch() {
    if (!this.rocketEntry || this.isRocketLaunching) return;
    const { img, label, cfg } = this.rocketEntry;
    this.isRocketLaunching = true;
    this.logAction('火箭发射');
    const cam = this.cameras.main;
    cam.shake(900, 0.01);

    if (img.disableInteractive) img.disableInteractive();
    if (label.disableInteractive) label.disableInteractive();

    const startPos = { x: img.x, y: img.y, rotation: img.rotation };
    const startAlpha = img.alpha;
    const riseDistance = this.viewHeight * 0.85;

    this.tweens.add({
      targets: img,
      y: img.y - riseDistance,
      alpha: 0.2,
      duration: 1200,
      ease: 'Quad.easeIn',
      onComplete: () => {
        this.time.delayedCall(500, () => {
          img.setPosition(startPos.x, startPos.y);
          img.setRotation(cfg.angle + this.planetAngle);
          img.setAlpha(startAlpha);
          if (cfg.interactive && img.setInteractive) img.setInteractive({ useHandCursor: true });
          if (cfg.interactive && label.setInteractive) label.setInteractive({ useHandCursor: true });
          this.isRocketLaunching = false;
          this.updateActionPointPositions();
        });
      },
    });
  }

  handleObjectAction(cfg) {
    if (cfg.action === 'sleep') {
      this.logAction('触发睡觉');
      this.activities.startSleep?.();
    } else if (cfg.action === 'eat') {
      this.logAction('触发吃饭');
      this.activities.startEatMenu?.();
    } else if (cfg.action === 'launch') {
      this.startRocketLaunch();
    } else if (cfg.id === 'waterExtracter') {
      this.logAction('触发抽水站');
      this.showWaterExtractButtonByCfg(cfg);
    } else {
      this.logAction(`触发物体: ${cfg.name ?? cfg.id}`);
    }
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

  async loadSunriseSunset() {
    const url =
      'https://api.open-meteo.com/v1/forecast?latitude=39.9042&longitude=116.4074&daily=sunrise,sunset&timezone=Asia/Shanghai';
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error('network');
      const data = await res.json();
      const sunrise = data?.daily?.sunrise?.[0];
      const sunset = data?.daily?.sunset?.[0];
      if (sunrise && sunset) {
        this.sunriseTimestamp = Date.parse(sunrise);
        this.sunsetTimestamp = Date.parse(sunset);
        console.log('北京日出/日落时间', { sunrise, sunset });
        this.updateDayNight(true);
      }
    } catch (e) {
      console.warn('sunrise/sunset fetch failed, fallback to default', e);
      this.setDefaultSunTimes();
      this.updateDayNight(true);
    }
  }

  setDefaultSunTimes() {
    const now = new Date();
    const base = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    // 北京本地默认 06:00 和 18:30
    const sunrise = new Date(base);
    sunrise.setUTCHours(22, 0, 0, 0); // UTC 对应次日 06:00+08:00
    const sunset = new Date(base);
    sunset.setUTCHours(10, 30, 0, 0); // UTC 对应当日 18:30+08:00
    this.sunriseTimestamp = sunrise.getTime();
    this.sunsetTimestamp = sunset.getTime();
  }

  updateDayNight(force = false) {
    if (!this.sunriseTimestamp || !this.sunsetTimestamp) {
      this.setDefaultSunTimes();
    }
    const nowTs = this.debugOverrideTs ?? Date.now();
    const sunriseM = this.getMinutesFromTs(this.sunriseTimestamp);
    const sunsetM = this.getMinutesFromTs(this.sunsetTimestamp);
    const nowM = this.getMinutesFromTs(nowTs);
    // 视角靠近地平线，让晨昏颜色更明显
    const palette = getSkyColor(nowM, sunriseM, sunsetM, 0.2);
    const rgb = palette.skyColor.map((c) => Math.round(clamp01(c) * 255));
    const colorHex = (rgb[0] << 16) | (rgb[1] << 8) | rgb[2];
    const brightness = (rgb[0] + rgb[1] + rgb[2]) / (255 * 3);
    // 昼夜明暗更明显
    const targetAlpha = clamp01(0.6 - brightness * 0.4 + 0.15);
    if (this.skyRect) {
      this.skyRect.fillColor = colorHex;
    }
    if (this.dayNightOverlay) {
      this.dayNightOverlay.fillColor = colorHex;
      if (force || Math.abs(this.dayNightOverlay.alpha - targetAlpha) > 0.01) {
        this.dayNightOverlay.setAlpha(targetAlpha);
      }
    }
  }

  setDebugHour(hour) {
    const raw = Number(hour);
    const clamped = Math.max(0, Math.min(23.999, isNaN(raw) ? 0 : raw));
    const h = Math.floor(clamped);
    const m = Math.round((clamped - h) * 60);
    const now = new Date();
    now.setHours(h, m, 0, 0);
    this.debugOverrideTs = now.getTime();
    this.dayNightCheckAccumulator = 0;
    this.updateDayNight(true);
    console.log(`调试时间设为 ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}，ISO=${now.toISOString()}`);
  }

  clearDebugTime() {
    this.debugOverrideTs = null;
    this.dayNightCheckAccumulator = 0;
    this.updateDayNight(true);
    console.log('调试时间已清除，恢复实时昼夜');
  }

  getMinutesFromTs(ts) {
    const d = new Date(ts);
    return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
  }
}

// ===== Sky Color Helpers (参考给定算法简化版) =====
function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

function clamp(x, min, max) {
  return Math.max(min, Math.min(max, x));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function lerpColor(c1, c2, t) {
  return [
    lerp(c1[0], c2[0], t),
    lerp(c1[1], c2[1], t),
    lerp(c1[2], c2[2], t),
  ];
}

function addColor(a, b) {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function mulColor(c, k) {
  return [c[0] * k, c[1] * k, c[2] * k];
}

function smoothstep(edge0, edge1, x) {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function getSkyColor(time, sunrise, sunset, viewY) {
  const twilight = 45; // 分钟
  const dayLen = sunset - sunrise;
  const solarNoon = (sunrise + sunset) * 0.5;

  let x = (time - solarNoon) / (dayLen * 0.5);
  x = clamp(x, -1, 1);
  let sunHeight = Math.cos(x * Math.PI * 0.5);

  if (time < sunrise) {
    sunHeight *= smoothstep(sunrise - twilight, sunrise, time);
  }
  if (time > sunset) {
    sunHeight *= 1 - smoothstep(sunset, sunset + twilight, time);
  }

  const dayW = smoothstep(0.1, 0.35, sunHeight);
  let twilightW = (1 - dayW) * smoothstep(0.0, 0.25, sunHeight);
  const nightW = 1 - smoothstep(0.0, 0.08, sunHeight);

  const distToSunrise = Math.abs(time - sunrise);
  const distToSunset = Math.abs(time - sunset);
  const nearTwilight = 1 - smoothstep(0, twilight, Math.min(distToSunrise, distToSunset));
  twilightW *= nearTwilight;

  const zenith_day = [0.22, 0.45, 0.95];
  const horizon_day = [0.7, 0.85, 1.0];
  const zenith_twi = [0.35, 0.2, 0.55];
  const horizon_twi = [1.0, 0.5, 0.15];
  const zenith_night = [0.02, 0.03, 0.08];
  const horizon_night = [0.03, 0.04, 0.1];

  let zenith = [0, 0, 0];
  let horizon = [0, 0, 0];
  zenith = addColor(zenith, mulColor(zenith_day, dayW));
  zenith = addColor(zenith, mulColor(zenith_twi, twilightW));
  zenith = addColor(zenith, mulColor(zenith_night, nightW));
  horizon = addColor(horizon, mulColor(horizon_day, dayW));
  horizon = addColor(horizon, mulColor(horizon_twi, twilightW));
  horizon = addColor(horizon, mulColor(horizon_night, nightW));

  const k = Math.pow(clamp01(viewY), 0.6);
  let sky = lerpColor(horizon, zenith, k);
  const horizonFactor = Math.pow(1 - clamp01(viewY), 3);
  const glow = mulColor(horizon_twi, twilightW * horizonFactor * 0.8);
  sky = addColor(sky, glow);
  return { skyColor: sky };
}
