<template>
  <div class="page">
    <div id="game-container"></div>

    <div class="info-overlay">
      <div class="info-card">
        <div class="info-title">日历</div>
        <div class="info-main">{{ dateText }}</div>
        <div class="info-sub">{{ weekdayText }}</div>
      </div>
      <div class="info-card">
        <div class="info-title">北京天气</div>
        <div class="info-main">{{ weatherText }}</div>
        <div class="info-sub">{{ tempText }}</div>
      </div>
    </div>

    <div class="overlay">
      <div class="time-block">
        <div class="current-time">{{ currentTime }}</div>
        <label class="tz-select">
          <span>时区</span>
          <select v-model="timeZone">
            <option value="Asia/Shanghai">北京时间</option>
            <option value="Europe/Stockholm">哥德堡时间</option>
          </select>
        </label>
      </div>
      <form class="search-form" @submit.prevent="onSearch">
        <select v-model="engine">
          <option value="https://www.google.com/search?q=">Google</option>
          <option value="https://www.baidu.com/s?wd=">百度</option>
          <option value="https://www.bing.com/search?q=">Bing</option>
          <option value="https://duckduckgo.com/?q=">DuckDuckGo</option>
        </select>
        <input v-model="query" placeholder="搜索..." />
        <button type="submit">搜索</button>
      </form>
    </div>

    <div class="debug-panel">
      <div class="debug-block">
        <label>
          调试时间（小时）
          <input
            type="range"
            min="0"
            max="23"
            step="0.1"
            v-model.number="debugHour"
            @input="applyDebugHour"
          />
          <span class="debug-hour">{{ formatDebugHour(debugHour) }}</span>
        </label>
        <button type="button" class="ghost-btn" @click="clearDebugHour">恢复实时</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, onBeforeUnmount, ref, watch } from 'vue';
import { createGame } from './game.js';

const engine = ref('https://www.google.com/search?q=');
const query = ref('');
let phaserGame = null;
const dateText = ref('');
const weekdayText = ref('');
const timeZone = ref('Asia/Shanghai');
const currentTime = ref('');
const debugHour = ref(12);
const weatherText = ref('加载中...');
const tempText = ref('--°C');
let timer = null;
let weatherTimer = null;

onMounted(() => {
  phaserGame = createGame('game-container');
  updateDate();
  timer = setInterval(updateDate, 1000 * 30);
  fetchWeather();
  weatherTimer = setInterval(fetchWeather, 1000 * 60 * 10); // 10 分钟刷新一次
});

onBeforeUnmount(() => {
  if (phaserGame) {
    phaserGame.destroy(true);
    phaserGame = null;
  }
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  if (weatherTimer) {
    clearInterval(weatherTimer);
    weatherTimer = null;
  }
});

watch(timeZone, updateDate);

const onSearch = () => {
  const keyword = query.value.trim();
  if (!keyword) return;
  window.open(engine.value + encodeURIComponent(keyword), '_blank');
};

const applyDebugHour = () => {
  const game = phaserGame;
  if (!game) return;
  const scene = game.scene.getScene('HomeScene');
  if (scene?.setDebugHour) {
    scene.setDebugHour(debugHour.value);
  }
};

const clearDebugHour = () => {
  const game = phaserGame;
  if (!game) return;
  const scene = game.scene.getScene('HomeScene');
  if (scene?.clearDebugTime) {
    scene.clearDebugTime();
  }
};

const formatDebugHour = (hourVal) => {
  const h = Math.floor(hourVal);
  const m = Math.round((hourVal - h) * 60);
  const hh = String(h).padStart(2, '0');
  const mm = String(m).padStart(2, '0');
  return `${hh}:${mm}`;
};

function updateDate() {
  const now = new Date();
  const tz = timeZone.value;
  const dateParts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const dateMap = Object.fromEntries(dateParts.map((p) => [p.type, p.value]));
  dateText.value = `${dateMap.year}-${dateMap.month}-${dateMap.day}`;
  const weekday = new Intl.DateTimeFormat('zh-CN', {
    timeZone: tz,
    weekday: 'long',
  }).format(now);
  const timeStr = new Intl.DateTimeFormat('zh-CN', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(now);
  weekdayText.value = `${weekday} · ${timeStr}`;
  currentTime.value = timeStr;
}

async function fetchWeather() {
  const url =
    'https://api.open-meteo.com/v1/forecast?latitude=39.9042&longitude=116.4074&current=temperature_2m,weather_code,wind_speed_10m';
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('network');
    const data = await res.json();
    const current = data.current ?? data.current_weather ?? {};
    const code = current.weather_code ?? current.weathercode;
    const temp = current.temperature_2m ?? current.temperature;
    const wind = current.wind_speed_10m ?? current.windspeed;
    weatherText.value = codeToText(code);
    const tempDisplay =
      typeof temp === 'number' && !Number.isNaN(temp) ? `${Math.round(temp)}°C` : '--°C';
    const windDisplay =
      typeof wind === 'number' && !Number.isNaN(wind) ? `${Math.round(wind)} km/h` : '微风';
    tempText.value = `${tempDisplay} · ${windDisplay}`;
  } catch (e) {
    weatherText.value = '晴';
    tempText.value = '26°C · 微风';
  }
}

function codeToText(code) {
  const map = {
    0: '晴',
    1: '多云',
    2: '局部多云',
    3: '阴',
    45: '雾',
    48: '雾',
    51: '小毛毛雨',
    53: '毛毛雨',
    55: '大毛毛雨',
    56: '冻雨',
    57: '冻雨',
    61: '小雨',
    63: '中雨',
    65: '大雨',
    66: '冻雨',
    67: '冻雨',
    71: '小雪',
    73: '中雪',
    75: '大雪',
    80: '阵雨',
    81: '中阵雨',
    82: '暴阵雨',
    95: '雷阵雨',
    96: '雷阵雨伴冰雹',
    99: '雷阵雨伴冰雹',
  };
  return map[code] ?? '未知';
}
</script>

<style scoped>
.page {
  position: relative;
  min-height: 100vh;
  background: #000;
  color: #e8f3ff;
  overflow: hidden;
}

#game-container {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: 0;
}

.info-overlay {
  position: fixed;
  top: 5%;
  right: 6%;
  left: auto;
  display: flex;
  gap: 12px;
  z-index: 2;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.info-card {
  min-width: 150px;
  padding: 12px 14px;
  border-radius: 12px;
  background: linear-gradient(160deg, rgba(255, 255, 255, 0.12), rgba(255, 255, 255, 0.04));
  border: 1px solid rgba(255, 255, 255, 0.16);
  backdrop-filter: blur(10px);
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.35);
}

.info-title {
  font-size: 13px;
  letter-spacing: 0.02em;
  color: #a8c7ff;
  margin-bottom: 6px;
}

.info-main {
  font-size: 20px;
  font-weight: 700;
}

.info-sub {
  margin-top: 4px;
  font-size: 13px;
  color: #d8e6ff;
}

.overlay {
  position: fixed;
  left: 50%;
  top: 16%;
  transform: translateX(-50%);
  z-index: 2;
  width: min(90%, 640px);
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: center;
}

.time-block {
  display: flex;
  gap: 10px;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.45);
  border: 1px solid rgba(255, 255, 255, 0.12);
  padding: 10px 14px;
  border-radius: 12px;
  backdrop-filter: blur(12px);
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.3);
}

.search-form {
  width: 100%;
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 14px 16px;
  border-radius: 14px;
  background: rgba(0, 0, 0, 0.45);
  border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(12px);
}

select,
input {
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.08);
  color: #e8f3ff;
}

select {
  min-width: 150px;
}

input {
  flex: 1;
}

button {
  padding: 10px 16px;
  border-radius: 10px;
  border: none;
  background: #3baaff;
  color: #0b1d36;
  font-weight: 700;
  cursor: pointer;
}

button:hover {
  background: #6cc1ff;
}

.current-time {
  font-size: 32px;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: #e8f3ff;
  text-shadow: 0 0 12px rgba(59, 170, 255, 0.4);
}

.tz-select {
  display: flex;
  gap: 6px;
  align-items: center;
  font-size: 13px;
  color: #e8f3ff;
}

.tz-select select {
  padding: 6px 8px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(255, 255, 255, 0.08);
  color: #e8f3ff;
}

.debug-panel {
  position: fixed;
  right: 24px;
  top: 20%;
  z-index: 2;
  width: min(320px, 26vw);
}

.debug-block {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.16);
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(10px);
  color: #e8f3ff;
  font-size: 13px;
}

.debug-block input[type='range'] {
  flex: 1;
}

.debug-hour {
  min-width: 54px;
  display: inline-block;
  text-align: right;
  font-weight: 700;
}

.ghost-btn {
  padding: 8px 12px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.28);
  background: transparent;
  color: #e8f3ff;
  cursor: pointer;
}

.ghost-btn:hover {
  background: rgba(255, 255, 255, 0.08);
}
</style>
