import bedPng from '../assets/bed.png';
import tablePng from '../assets/table.png';

// 配置化的场景物体；按需在这里新增/调整。
const worldObjects = [
  {
    id: 'bed',
    name: '睡觉',
    angle: -0.45,
    textureKey: 'bed',
    texture: bedPng,
    scale: 0.5,
    yOffset: 8,
    depth: 0.4,
    interactive: true,
    action: 'sleep',
  },
  {
    id: 'table',
    name: '桌子',
    angle: 0.2,
    textureKey: 'table',
    texture: tablePng,
    scale: 0.4,
    yOffset: 6,
    depth: 0.45,
    interactive: false,
  },
];

export default worldObjects;
