import Phaser from 'phaser';
import ActivitiesOverlay from '../ui/ActivitiesOverlay.js';
import worldObjects from '../config/worldObjects.js';
import playerConfig from '../config/playerConfig.js';
import planetPng from '../assets/planet.png';
import walk1Png from '../assets/walk1.png';
import walk2Png from '../assets/walk2.png';
import walk3Png from '../assets/walk3.png';
import walk4Png from '../assets/walk4.png';
import walk5Png from '../assets/walk5.png';
import walk6Png from '../assets/walk6.png';
import robotDialog from '../config/robotDialog.js';
import buttonOnPng from '../assets/buttonOn.png';
import buttonDownPng from '../assets/buttonDown.png';
import arrowPng from '../assets/arrow.png';
import configPng from '../assets/config.png';

export default class HomeScene extends Phaser.Scene {
  constructor() {
    super('HomeScene');
  }

  preload() {
    // 玩家、行星、背景
    this.load.image(playerConfig.textureKey, playerConfig.texture);
    this.load.image('waterBtnOn', buttonOnPng);
    this.load.image('waterBtnDown', buttonDownPng);
    this.load.image('walk1', walk1Png);
    this.load.image('walk2', walk2Png);
    this.load.image('walk3', walk3Png);
    this.load.image('walk4', walk4Png);
    this.load.image('walk5', walk5Png);
    this.load.image('walk6', walk6Png);
    this.load.image('planet', planetPng);
    this.load.image('arrow', arrowPng);
    this.load.image('configIcon', configPng);
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
    this.waterDrainPerMs = (this.maxStatValue || 100) / (2 * 60 * 60 * 1000); // 2 小时耗尽
    this.lastWaterSaveTs = Date.now();
    this.waterSaveAccumulator = 0;
    this.showStats = false; // HUD 默认隐藏
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
    this.createPlayerAnimations();
    this.updatePlayerVisual('idle');

    this.cursors = this.input.keyboard.createCursorKeys();

    // 事件点圆点删除，改为靠近时显示标签
    this.pointObjects = [];

    // 配置化物体（床、桌子、广告牌、火箭）
    this.worldObjects = [];
    this.activeDescriptionEntry = null;
    this.descriptionHideTimer = null;
    this.waterExtractButton = null;
    this.waterExtractButtonTargetEntry = null;
    this.musicPromptBg = null;
    this.musicPromptText = null;
    this.musicPromptButton = null;
    this.rocketEntry = null;
    this.rocketBaseEntry = null;
    this.robotEntry = null;
    this.towerEntry = null;
    this.towerClickCount = 0;
    this.towerClickTimer = null;
    this.robotDialogTimer = null;
    this.robotDialogIndex = 0;
    this.enableLogs = false; // 日志显示开关，默认隐藏
    this.onLogToggle = (evt) => this.handleLogToggle(evt);
    this.objectButtons = new Map(); // key: entry, value: sprite
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
        const descBaseDepth = 5; // 提升描述层级，避免被场景元素遮挡
        const glowDepth = descBaseDepth;
        const glowRect = this.add
          .rectangle(0, 0, bubbleWidth * 1.08, 10, 0x64c8ff, 0.18)
          .setOrigin(0.5, 0)
          .setDepth(glowDepth)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setVisible(false);
        descBg = this.add
          .rectangle(0, 0, bubbleWidth, 10, 0x0a1326, 0.82)
          .setOrigin(0.5, 0)
          .setStrokeStyle(2, 0x64c8ff, 0.9)
          .setDepth(descBaseDepth + 0.05)
          .setVisible(false);
        descText = this.add
          .text(0, 0, cfg.description, {
            font: '16px Arial',
            fill: '#e8f3ff',
            stroke: '#000000',
            strokeThickness: 3,
            wordWrap: { width: bubbleWidth - bubblePadding * 2, useAdvancedWrap: true },
            align: 'center',
          })
          .setOrigin(0.5, 0)
          .setDepth(descBaseDepth + 0.06)
          .setVisible(false);
        descText.setShadow(0, 0, '#64c8ff', 8, true, true);
        const finalHeight = descText.height + bubblePadding * 2;
        descBg.setSize(bubbleWidth, finalHeight);
        glowRect.setSize(bubbleWidth * 1.08, finalHeight * 1.12);
        descBg.glow = glowRect;
      }

      const approachOffset =
        cfg.id === 'robot' ? 0.04 : 0; // 玩家到达机器人侧面，避免重叠
      const handleObjClick = () => {
        this.moveToAngle(cfg.angle + approachOffset, () => {
          this.showObjectDescriptionByCfg(cfg);
          this.handleObjectAction(cfg);
        });
      };
      img.on('pointerdown', handleObjClick);
      label.setInteractive({ useHandCursor: true });
      label.on('pointerdown', handleObjClick);

      const entry = {
        cfg,
        img,
        label,
        descBg,
        descText,
        descGlow: descBg?.glow,
        isHovering: false,
        hasActionButton: Boolean(cfg.buttonConfig || cfg.waterButton),
        hasConfigButton: Boolean(cfg.configButtonConfig),
      };
      const setHover = (hovered) => {
        entry.isHovering = hovered;
      };
      img.on('pointerover', () => setHover(true));
      img.on('pointerout', () => setHover(false));
      label.on('pointerover', () => setHover(true));
      label.on('pointerout', () => setHover(false));
      if (cfg.id === 'rocket') {
        this.rocketEntry = entry;
      } else if (cfg.id === 'rocketBase') {
        this.rocketBaseEntry = entry;
      } else if (cfg.id === 'robot') {
        this.robotEntry = entry;
      } else if (cfg.id === 'tower') {
        this.towerEntry = entry;
      }
      this.worldObjects.push(entry);
    });

    this.updateActionPointPositions();

    // 底部按键
    this.leftButtonDown = false;
    this.rightButtonDown = false;
    const buttonY = h - 70;
    this.createArrowButton(w * 0.3, buttonY, 'left', () => {
      this.leftButtonDown = true;
    }, () => {
      this.leftButtonDown = false;
    });
    this.createArrowButton(w * 0.7, buttonY, 'right', () => {
      this.rightButtonDown = true;
    }, () => {
      this.rightButtonDown = false;
    });

    // 弹窗/活动
    this.activities = new ActivitiesOverlay(this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.activities?.destroy());

    this.logAction('进入家场景');

    if (typeof window !== 'undefined') {
      window.addEventListener('mia:log-toggle', this.onLogToggle);
      window.addEventListener('beforeunload', this.savePersistedWater.bind(this));
    }

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('mia:log-toggle', this.onLogToggle);
        window.removeEventListener('beforeunload', this.savePersistedWater.bind(this));
      }
    });
  }

  update(time, delta) {
    const rotationSpeed = (playerConfig.moveSpeed ?? 0.001) * delta;
    let currentMoveState = 'idle';
    // 蓄水缓慢流失：2 小时耗尽，且定期保存
    this.waterValue = Math.max(0, (this.waterValue ?? 0) - (this.waterDrainPerMs || 0) * delta);
    this.waterSaveAccumulator += delta;
    if (this.waterSaveAccumulator >= 30000) {
      this.savePersistedWater();
      this.waterSaveAccumulator = 0;
    }
    this.updateStatBars();

    if (this.targetRotation !== null) {
      const diff = Phaser.Math.Angle.Wrap(this.targetRotation - this.planetAngle);
      const step = Math.sign(diff) * rotationSpeed;
      // 自动旋转时也切换到对应方向的行走动画
      if (diff !== 0) {
        currentMoveState = diff > 0 ? 'left' : 'right';
      }
      if (Math.abs(diff) <= Math.abs(step)) {
        this.planetAngle = this.targetRotation;
        this.targetRotation = null;
        currentMoveState = 'idle';
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
        this.hideMusicPrompt();
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
      this.updatePlayerVisual(currentMoveState);
    }

    const surfaceTopY = this.getPointOnPlanet(0).y;
    const playerYOffset = playerConfig.yOffset ?? -8;
    this.player.setPosition(this.viewWidth / 2, surfaceTopY + playerYOffset);

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
        if (entry.descGlow) {
          entry.descGlow.setPosition(objX, bubbleY);
          entry.descGlow.setRotation(0);
        }
        const bgHeight = entry.descBg.height ?? entry.descBg.displayHeight ?? 40;
        const textY = bubbleY + (bgHeight - entry.descText.height) * 0.5;
        entry.descText.setPosition(objX, textY);
        entry.descText.setRotation(0);
      }
      const dx = playerPos.x - objX;
      const dy = playerPos.y - objY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const visible = dist <= proximity || entry.isHovering;
      label.setVisible(visible);
      entry.pos = { x: objX, y: objY };

      const btnCfg = entry.cfg.buttonConfig || entry.cfg.waterButton;
      const btnSprite = this.objectButtons.get(entry);
      if (btnCfg && btnSprite) {
        const btnOffset = btnCfg.offsetY ?? 24;
        btnSprite.setPosition(objX, objY + btnOffset);
        btnSprite.setDepth((entry.cfg.depth ?? 0.4) + 0.2);
      }
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
    // 稍微更鲜艳一些但仍偏真实的星色（冷白 + 微暖）
    const colors = [0xffffff, 0xe5f0ff, 0xfff2de, 0xd8e4ff, 0xfaf3ff];

    for (let i = 0; i < particleCount; i++) {
      const baseSize = Math.random() * 1.8 + 0.8;
      this.starParticles.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * this.starMaxSpeed,
        vy: (Math.random() - 0.5) * this.starMaxSpeed,
        baseSize,
        size: baseSize,
        color: colors[Math.floor(Math.random() * colors.length)],
        glow: Math.random() * 6 + 4,
        twinklePhase: Math.random() * Math.PI * 2,
        twinkleSpeed: 1 + Math.random() * 2, // 1~3 rad/s
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

      // 鼠标/触控点斥力（加强）
      const dxm = mx - p.x;
      const dym = my - p.y;
      const distm = Math.hypot(dxm, dym);
      if (distm > 0 && distm < maxDist) {
        const force = (maxDist - distm) / maxDist;
        // 鼠标驱离力度更强一些
        const k = 110;
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
      // 闪烁：基于每个星星自己的相位和速度
      p.twinklePhase += (p.twinkleSpeed ?? 1.5) * dt;
      const tw = 0.7 + 0.3 * Math.sin(p.twinklePhase);
      const baseSize = p.baseSize || p.size;
      const renderSize = baseSize * tw;
      // 光晕进一步减淡：降低外圈透明度
      const outerAlpha = 0.05 + 0.05 * tw;
      const innerAlpha = 0.75 + 0.2 * tw;

      // 绘制柔和辉光
      g.fillStyle(p.color, outerAlpha);
      g.fillCircle(p.x, p.y, renderSize + p.glow);
      // 绘制核心高亮
      g.fillStyle(p.color, innerAlpha);
      g.fillCircle(p.x, p.y, renderSize);
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
    this.statBarWidth = 160;
    this.statBarHeight = 12;
    const panelX = 90;
    const panelY = 90;
    const panelWidth = 200;
    const panelHeight = 120;
    // 背景面板
    this.statPanel = this.add
      .rectangle(panelX, panelY, panelWidth, panelHeight, 0x0d1a2f, 0.6)
      .setStrokeStyle(2, 0x64c8ff, 0.4)
      .setDepth(10);
    this.statPanelGlow = this.add
      .rectangle(panelX, panelY, panelWidth * 1.05, panelHeight * 1.05, 0x64c8ff, 0.12)
      .setDepth(9.5)
      .setBlendMode(Phaser.BlendModes.ADD);

    const startX = panelX - panelWidth * 0.5 + 14;
    const startY = panelY - panelHeight * 0.5 + 20;
    const gapY = 30;

    this.statBars.energy = this.createSingleStatBar(startX, startY + gapY * 0, '能源', 0xffc107);
    this.statBars.water = this.createSingleStatBar(startX, startY + gapY * 1, '蓄水', 0x03a9f4);
    this.statBars.stamina = this.createSingleStatBar(startX, startY + gapY * 2, '精力', 0x8bc34a);

    this.setStatsVisible(this.showStats);
    this.updateStatBars();
  }

  createSingleStatBar(x, y, label, color) {
    const labelText = this.add
      .text(x, y - 10, label, {
        font: '13px Arial',
        fill: '#e8f3ff',
      })
      .setOrigin(0, 1)
      .setDepth(11);

    const bg = this.add
      .rectangle(x, y, this.statBarWidth, this.statBarHeight, 0x0a1326, 0.7)
      .setOrigin(0, 0.5)
      .setStrokeStyle(1, 0x64c8ff, 0.3)
      .setDepth(10);

    const fill = this.add
      .rectangle(x, y, this.statBarWidth, this.statBarHeight, color, 0.9)
      .setOrigin(0, 0.5)
      .setDepth(11);

    const glow = this.add
      .rectangle(x, y, this.statBarWidth, this.statBarHeight + 6, color, 0.14)
      .setOrigin(0, 0.5)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(9.8);

    return { labelText, bg, fill, glow, color };
  }

  setStatsVisible(visible) {
    if (this.statPanel) this.statPanel.setVisible(visible);
    if (this.statPanelGlow) this.statPanelGlow.setVisible(visible);
    Object.values(this.statBars || {}).forEach((bar) => {
      bar.labelText?.setVisible(visible);
      bar.bg?.setVisible(visible);
      bar.fill?.setVisible(visible);
      bar.glow?.setVisible(visible);
    });
  }

  updateStatBars() {
    if (!this.statBars) return;
    const max = this.maxStatValue || 100;
    const clamp01Local = (v) => Math.max(0, Math.min(1, v));

    const apply = (bar, value) => {
      if (!bar || !bar.fill) return;
      const ratio = clamp01Local((value ?? 0) / max);
      bar.fill.displayWidth = this.statBarWidth * ratio;
      if (bar.glow) {
        bar.glow.displayWidth = this.statBarWidth * ratio;
      }
    };

    apply(this.statBars.energy, this.energyValue);
    apply(this.statBars.water, this.waterValue);
    apply(this.statBars.stamina, this.staminaValue);
  }

  loadPersistedWater() {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return;
      const raw = window.localStorage.getItem('miaPlanet_water');
      const tsRaw = window.localStorage.getItem('miaPlanet_water_ts');
      if (!raw) return;
      const value = Number(raw);
      if (Number.isNaN(value)) return;
      const max = this.maxStatValue || 100;
      let newVal = Math.max(0, Math.min(max, value));
      if (tsRaw) {
        const lastTs = Number(tsRaw);
        if (!Number.isNaN(lastTs)) {
          const now = Date.now();
          const elapsed = Math.max(0, now - lastTs);
          const drained = (this.waterDrainPerMs || 0) * elapsed;
          newVal = Math.max(0, Math.min(max, newVal - drained));
        }
      }
      this.waterValue = newVal;
      this.lastWaterSaveTs = Date.now();
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
      window.localStorage.setItem('miaPlanet_water_ts', String(Date.now()));
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
    this.hideMusicPrompt();
  }

  showObjectDescriptionByCfg(cfg) {
    const entry = this.worldObjects.find((e) => e.cfg === cfg);
    if (!entry) return;
    if (entry.descText && entry.cfg?.description) {
      entry.descText.setText(entry.cfg.description);
    }
    this.showObjectDescription(entry);
  }

  showObjectDescription(entry) {
    if (!entry || !entry.descBg || !entry.descText) return;
    this.hideAllObjectDescriptions();
    if (entry.cfg.id === 'waterExtracter' && this.waterValue <= 0) {
      entry.descText.setText('水槽已空');
    }
    if (entry.descGlow) {
      entry.descGlow.setVisible(true);
    }
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
      if (entry.descGlow) {
        entry.descGlow.setVisible(false);
      }
      if (entry.descText) {
        entry.descText.setVisible(false);
      }
    });
    this.hideObjectButtons();
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
      const { bg, txt } = this.createButton(
        0,
        0,
        '抽取水分',
        () => {
          this.onWaterExtractButtonClick();
        },
        () => {},
        {
          fill: 0x0b162c,
          fillAlpha: 0.85,
          stroke: 0x64c8ff,
          strokeAlpha: 0.9,
          textColor: '#e8f3ff',
          textShadowColor: '#64c8ff',
          textShadowBlur: 12,
          activeFill: 0x13335c,
          activeFillAlpha: 0.95,
        }
      );
      bg.setDepth(18);
      txt.setDepth(19);
      this.waterExtractButton = { bg, txt };
    }

    const btn = this.waterExtractButton;
    let x = entry.pos.x;
    let y = entry.pos.y;

    if (entry.descBg) {
      // descBg 原点在顶部，height 为整个气泡高度
      const bgHeight = entry.descBg.height ?? entry.descBg.displayHeight ?? 40;
      const bubbleBottomY = entry.descBg.y + bgHeight;
      x = entry.descBg.x;
      y = bubbleBottomY + 16; // 按钮放在文字提示正下方，略留间距
    } else {
      // 兜底：如果未来某个物体没有描述气泡，则放在物体上方
      const imgHeight = entry.img?.displayHeight || 40;
      const offsetY = imgHeight + 20;
      x = entry.pos.x;
      y = entry.pos.y - offsetY;
    }

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

  showMusicPromptByCfg(cfg) {
    const entry = this.worldObjects.find((e) => e.cfg === cfg);
    if (!entry) return;
    this.showMusicPrompt(entry);
  }

  showMusicPrompt(entry) {
    if (!entry || !entry.pos) return;

    const w = this.viewWidth;
    const boxWidth = Math.min(w * 0.7, 420);
    const boxHeight = 110;

    if (!this.musicPromptBg) {
      this.musicPromptBg = this.add
        .rectangle(0, 0, boxWidth, boxHeight, 0x000000, 0.7)
        .setStrokeStyle(2, 0xffffff, 0.6)
        .setDepth(24);

      this.musicPromptText = this.add
        .text(0, 0, '在火星上就要听火星音乐！', {
          font: '20px Arial',
          fill: '#e5f0ff',
          stroke: '#000000',
          strokeThickness: 4,
          align: 'center',
          wordWrap: { width: boxWidth - 40, useAdvancedWrap: true },
        })
        .setOrigin(0.5)
        .setDepth(25);

      const { bg, txt } = this.createButton(0, 0, '打开网易云', () => {
        this.openNetEaseMusic();
      }, () => {});
      bg.setDepth(25);
      txt.setDepth(26);
      this.musicPromptButton = { bg, txt };
    }

    let centerX = entry.pos.x;
    let centerY = entry.pos.y;

    if (entry.descBg) {
      // descBg 原点在顶部，height 为整个气泡高度
      const bgHeight = entry.descBg.height ?? entry.descBg.displayHeight ?? 40;
      const bubbleBottomY = entry.descBg.y + bgHeight;
      centerX = entry.descBg.x;
      centerY = bubbleBottomY + 16 + boxHeight * 0.5;
    } else {
      // 兜底：如果未来某个物体没有描述气泡，则放在物体上方附近
      const imgHeight = entry.img?.displayHeight || 40;
      const offsetY = imgHeight + 20;
      centerX = entry.pos.x;
      centerY = entry.pos.y - offsetY;
    }

    this.musicPromptBg.setPosition(centerX, centerY);
    this.musicPromptText.setPosition(centerX, centerY - 20);
    if (this.musicPromptButton) {
      this.musicPromptButton.bg.setPosition(centerX, centerY + 24);
      this.musicPromptButton.txt.setPosition(centerX, centerY + 24);
      this.musicPromptButton.bg.setVisible(true);
      this.musicPromptButton.txt.setVisible(true);
    }

    this.musicPromptBg.setVisible(true);
    this.musicPromptText.setVisible(true);
  }

  hideMusicPrompt() {
    if (this.musicPromptBg) this.musicPromptBg.setVisible(false);
    if (this.musicPromptText) this.musicPromptText.setVisible(false);
    if (this.musicPromptButton) {
      this.musicPromptButton.bg.setVisible(false);
      this.musicPromptButton.txt.setVisible(false);
    }
  }

  openNetEaseMusic() {
    try {
      const appUrl = 'orpheus://';
      const webUrl = 'https://music.163.com/';
      const now = Date.now();

      // 尝试唤起客户端
      window.location.href = appUrl;

      // 简单的降级逻辑：如果 2 秒后仍停留在当前页面，则打开网页版
      setTimeout(() => {
        const elapsed = Date.now() - now;
        // 大多数情况下，如果应用成功切走，这段代码不会真正执行；这里作为兜底
        if (elapsed >= 1800) {
          window.open(webUrl, '_blank');
        }
      }, 2000);
    } catch (e) {
      window.open('https://music.163.com/', '_blank');
    }
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
      // 取消发射功能，仅记录
      this.logAction('火箭暂不发射');
    } else if (cfg.id === 'waterExtracter') {
      this.logAction('触发抽水站');
      const entry = this.worldObjects.find((e) => e.cfg === cfg);
      if (entry) {
        this.showObjectButton(entry, () => this.onWaterButtonClick(entry));
      }
    } else if (cfg.id === 'musicPlayer') {
      this.logAction('触发音乐播放终端');
      const entry = this.worldObjects.find((e) => e.cfg === cfg);
      if (entry) {
        this.showObjectButton(entry, () => {
          entry.descText?.setText('火星曲库播放中，享受音乐吧！');
          const url = this.getObjectLink(entry);
          if (url) {
            window.open(url, '_blank');
          } else {
            this.openNetEaseMusic();
          }
        });
      }
    } else if (cfg.id === 'billboard') {
      const entry = this.worldObjects.find((e) => e.cfg === cfg);
      if (entry) {
        this.showObjectButton(entry, () => {
          const url = this.getObjectLink(entry);
          if (url) window.open(url, '_blank');
          entry.descText?.setText('打开最新任务公告...');
        });
      }
    } else if (cfg.id === 'bilibili') {
      const entry = this.worldObjects.find((e) => e.cfg === cfg);
      if (entry) {
        this.showObjectButton(entry, () => {
          const url = this.getObjectLink(entry);
          if (url) window.open(url, '_blank');
          entry.descText?.setText('正在与哔哩哔哩连接...');
        });
      }
    } else if (cfg.id === 'table') {
      const entry = this.worldObjects.find((e) => e.cfg === cfg);
      if (entry) {
        this.showObjectButton(entry, () => {
          entry.descText?.setText('正在打开影片，请稍候...');
          const url = this.getObjectLink(entry) || 'https://vidhub4.cc/';
          if (typeof window !== 'undefined') {
            window.open(url, '_blank');
          }
        });
      }
    } else if (cfg.id === 'robot') {
      this.logAction('与机器人对话');
      this.showRobotDialog();
    } else if (cfg.id === 'tower') {
      this.logAction('触发瞭望塔');
      this.handleTowerDebugToggle();
    } else {
      this.logAction(`触发物体: ${cfg.name ?? cfg.id}`);
    }
  }

  createButton(x, y, label, onDown, onUp, style = {}) {
    const width = 120;
    const height = 50;
    const fillColor = style.fill ?? 0x1a1a1a;
    const fillAlpha = style.fillAlpha ?? 0.7;
    const strokeColor = style.stroke ?? 0xffffff;
    const strokeAlpha = style.strokeAlpha ?? 1;
    const textColor = style.textColor ?? '#ffffff';
    const textShadowColor = style.textShadowColor ?? '#000000';
    const textShadowBlur = style.textShadowBlur ?? 0;

    const bg = this.add
      .rectangle(x, y, width, height, fillColor, fillAlpha)
      .setStrokeStyle(2, strokeColor, strokeAlpha)
      .setInteractive({ useHandCursor: true });
    const txt = this.add
      .text(x, y, label, {
        font: '18px Arial',
        fill: textColor,
        stroke: textShadowColor,
        strokeThickness: 2,
      })
      .setOrigin(0.5);
    if (textShadowBlur > 0 && txt.setShadow) {
      txt.setShadow(0, 0, textShadowColor, textShadowBlur, true, true);
    }

    bg.on('pointerdown', () => {
      bg.setFillStyle(style.activeFill ?? fillColor, (style.activeFillAlpha ?? fillAlpha) + 0.15);
      onDown();
    });
    bg.on('pointerup', () => {
      bg.setFillStyle(fillColor, fillAlpha);
      onUp();
    });
    bg.on('pointerout', () => {
      bg.setFillStyle(fillColor, fillAlpha);
      onUp();
    });

    txt.setInteractive({ useHandCursor: true });
    txt.on('pointerdown', () => bg.emit('pointerdown'));
    txt.on('pointerup', () => bg.emit('pointerup'));
    txt.on('pointerout', () => bg.emit('pointerout'));

    return { bg, txt };
  }

  createArrowButton(x, y, direction, onDown, onUp) {
    const sprite = this.add
      .sprite(x, y, 'arrow')
      .setScale(0.9)
      .setInteractive({ useHandCursor: true });
    sprite.setFlipX(direction === 'left');
    sprite.on('pointerdown', () => {
      sprite.setTint(0xb0d4ff);
      onDown?.();
    });
    sprite.on('pointerup', () => {
      sprite.clearTint();
      onUp?.();
    });
    sprite.on('pointerout', () => {
      sprite.clearTint();
      onUp?.();
    });
    return sprite;
  }

  logAction(desc) {
    const timestamp = new Date().toLocaleTimeString();
    const entry = `[${timestamp}] ${desc}`;
    this.logs.push(entry);
    if (!this.enableLogs) {
      return;
    }
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

  handleTowerDebugToggle() {
    this.towerClickCount = (this.towerClickCount ?? 0) + 1;
    if (this.towerClickTimer) {
      this.towerClickTimer.remove(false);
    }
    this.towerClickTimer = this.time.delayedCall(1000, () => {
      this.towerClickCount = 0;
      this.towerClickTimer = null;
    });
    if (this.towerClickCount >= 3) {
      this.towerClickCount = 0;
      if (this.towerClickTimer) {
        this.towerClickTimer.remove(false);
        this.towerClickTimer = null;
      }
      if (typeof window !== 'undefined' && window.dispatchEvent) {
        window.dispatchEvent(new CustomEvent('mia:debug-toggle', { detail: { toggle: true } }));
        window.dispatchEvent(new CustomEvent('mia:log-toggle', { detail: { toggle: true } }));
        try {
          window.localStorage?.removeItem('mia_intro_seen');
          window.localStorage?.removeItem('mia_announcement_seen_version');
          // 重置自定义链接到默认
          (worldObjects || []).forEach((cfgItem) => {
            if (cfgItem?.id) {
              window.localStorage?.removeItem(`mia_obj_link_${cfgItem.id}`);
            }
          });
        } catch (e) {
          // ignore
        }
      }
      this.showStats = !this.showStats;
      this.setStatsVisible(this.showStats);
    }
  }

  showRobotDialog() {
    if (!this.robotEntry) return;
    const text = robotDialog[this.robotDialogIndex % robotDialog.length] ?? '';
    this.robotDialogIndex += 1;
    const label = this.robotEntry.label;
    if (label) {
      label.setText(text);
      label.setStyle({
        font: '14px Arial',
        fill: '#e8f3ff',
        stroke: '#000000',
        strokeThickness: 2,
        wordWrap: { width: 220, useAdvancedWrap: true },
        align: 'center',
      });
      label.setInteractive({ useHandCursor: true });
      label.removeAllListeners('pointerdown');
      label.on('pointerdown', () => this.showRobotDialog());
    }

    if (this.robotDialogTimer) {
      this.robotDialogTimer.remove(false);
    }
    this.robotDialogTimer = this.time.delayedCall(5000, () => this.showRobotDialog());
  }

  handleLogToggle(event) {
    if (event?.detail && typeof event.detail.visible === 'boolean') {
      this.enableLogs = event.detail.visible;
    } else {
      this.enableLogs = !this.enableLogs;
    }
  }

  showObjectButton(entry, onClick) {
    if (!entry || !entry.descText || !entry.hasActionButton) return;
    let sprite = this.objectButtons.get(entry);
    if (!sprite) {
      sprite = this.add
        .sprite(entry.pos?.x || this.viewWidth / 2, entry.pos?.y || this.viewHeight / 2, 'waterBtnOn')
        .setInteractive({ useHandCursor: true })
        .setDepth((entry.cfg.depth ?? 0.4) + 0.2)
        .setVisible(false);

      sprite.on('pointerdown', () => {
        sprite.setTexture('waterBtnDown');
      });
      sprite.on('pointerup', () => {
        sprite.setTexture('waterBtnOn');
        onClick?.();
      });
      sprite.on('pointerout', () => {
        sprite.setTexture('waterBtnOn');
      });
      this.objectButtons.set(entry, sprite);
    }

    const cfg = entry.cfg.buttonConfig || entry.cfg.waterButton || {};
    const btnOffset = cfg.offsetY ?? 24;
    const x = entry.pos?.x || this.viewWidth / 2;
    const y = entry.pos?.y + btnOffset || this.viewHeight / 2;
    sprite.setPosition(x, y);
    if (cfg.scale) {
      sprite.setScale(cfg.scale);
    }
    sprite.setVisible(true);

    // 配置按钮（使用 config.png）
    if (entry.hasConfigButton) {
      let configBtn = this.objectButtons.get(`${entry.cfg.id}-config`);
      if (!configBtn) {
        const sprite = this.add
          .sprite(x, y, 'configIcon')
          .setScale(entry.cfg.configButtonConfig?.scale ?? 0.6)
          .setInteractive({ useHandCursor: true })
          .setVisible(false)
          .setDepth((entry.cfg.depth ?? 0.4) + 0.25);
        sprite.on('pointerup', () => this.onLinkConfigClick(entry));
        sprite.on('pointerdown', () => sprite.setTint(0xb0d4ff));
        sprite.on('pointerout', () => sprite.clearTint());
        this.objectButtons.set(`${entry.cfg.id}-config`, sprite);
        configBtn = sprite;
      }
      const cfgBtn = entry.cfg.configButtonConfig || {};
      const cfgOffsetX = cfgBtn.offsetX ?? cfg.configOffsetX ?? cfg.offsetX ?? 80;
      const cfgOffsetY = cfgBtn.offsetY ?? cfg.configOffsetY ?? 0;
      configBtn.setPosition(x + cfgOffsetX, y + cfgOffsetY);
      if (cfgBtn.scale || cfg.configScale) {
        configBtn.setScale(cfgBtn.scale ?? cfg.configScale);
      }
      configBtn.setVisible(true);
    }
  }

  hideObjectButtons() {
    this.objectButtons.forEach((sprite) => {
      sprite.setVisible(false);
      if (sprite.clearTint) sprite.clearTint();
    });
  }

  onWaterButtonClick(entry) {
    if (!entry || !entry.descText) return;
    const bonus = 20;
    const max = this.maxStatValue || 100;
    this.waterValue = Math.min(max, (this.waterValue ?? 0) + bonus);
    this.updateStatBars();
    this.savePersistedWater();
    entry.descText.setText('蓄水已补充，水量提升！');
  }

  createPlayerAnimations() {
    if (this.anims.exists('player-walk')) return;
    this.anims.create({
      key: 'player-walk',
      frames: ['walk1', 'walk2', 'walk3', 'walk4', 'walk5', 'walk6'].map((key) => ({ key })),
      frameRate: 12,
      repeat: -1,
    });
  }

  updatePlayerVisual(state) {
    if (!this.player) return;
    if (state === 'left') {
      this.player.flipX = true;
      this.player.anims.play('player-walk', true);
    } else if (state === 'right') {
      this.player.flipX = false;
      this.player.anims.play('player-walk', true);
    } else {
      this.player.anims.stop();
      this.player.setTexture(playerConfig.textureKey);
    }
  }

  onLinkConfigClick(entry) {
    if (typeof window === 'undefined' || !entry?.cfg) return;
    const url = this.getObjectLink(entry);
    window.dispatchEvent(
      new CustomEvent('mia:link-config', {
        detail: {
          id: entry.cfg.id,
          name: entry.cfg.name,
          url: url || '',
        },
      })
    );
  }

  getObjectLink(entry) {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const key = `mia_obj_link_${entry?.cfg?.id}`;
        const stored = window.localStorage.getItem(key);
        if (stored) return stored;
      }
    } catch (e) {
      /* ignore */
    }
    return entry?.cfg?.buttonConfig?.url || entry?.cfg?.waterButton?.url || null;
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
