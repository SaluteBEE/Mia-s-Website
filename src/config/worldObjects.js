import bedPng from '../assets/bed.png';
import tablePng from '../assets/table.png';
import billboardPng from '../assets/billboard.png';
import rocketBasePng from '../assets/rocketBase.png';
import rocketPng from '../assets/rocket.png';

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
  {
    id: 'billboard',
    name: '广告牌',
    angle: 1.1,
    textureKey: 'billboard',
    texture: billboardPng,
    scale: 0.45,
    yOffset: 10,
    depth: 0.5,
    interactive: false,
  },
  {
    id: 'rocketBase',
    name: '火箭底座',
    angle: -1.15,
    textureKey: 'rocketBase',
    texture: rocketBasePng,
    scale: 0.5,
    yOffset: 12,
    depth: 0.52,
    interactive: false,
  },
  {
    id: 'rocket',
    name: '火箭',
    angle: -1.15,
    textureKey: 'rocket',
    texture: rocketPng,
    scale: 0.48,
    yOffset: -40,
    depth: 0.6,
    interactive: true,
    action: 'launch',
  },
];

export default worldObjects;
