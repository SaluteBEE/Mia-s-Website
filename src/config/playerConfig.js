import playerPng from '../assets/player.png';

// 玩家配置，方便统一调整贴图、尺寸与层级。
export default {
  textureKey: 'player',
  texture: playerPng,
  scale: 0.35,
  yOffset: -30, // 相对地表顶部的偏移（负值向上）
  depth: 1,
  moveSpeed: 0.0005, // 移动速度系数，越小越慢
};
