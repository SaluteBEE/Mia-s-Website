<template>
  <div class="page">
    <div id="game-container"></div>

    <div class="overlay">
      <div class="time-shell">
        <div class="time-ring"></div>
        <div class="time-core glass-card">
          <div class="clock-row">
            <div class="clock-label">LOCAL TIME</div>
            <div class="tz-switch" role="radiogroup" aria-label="选择时间系">
              <button
                type="button"
                class="tz-chip"
                :class="{ active: timeMode === 'mars' }"
                @click="setTimeMode('mars')"
                aria-pressed="timeMode === 'mars'"
              >
                <span class="chip-dot mars"></span> Mars
              </button>
              <button
                type="button"
                class="tz-chip"
                :class="{ active: timeMode === 'phobos' }"
                @click="setTimeMode('phobos')"
                aria-pressed="timeMode === 'phobos'"
              >
                <span class="chip-dot phobos"></span> Phobos
              </button>
              <div class="tz-indicator" :class="timeMode"></div>
            </div>
          </div>
          <div class="clock-time">
            <span v-for="(part, idx) in currentTimeParts" :key="`${idx}-${part}`">{{ part }}</span>
          </div>
          <div class="clock-sub">
            <div class="time-meta">
              <span class="meta-date">{{ dateText }}</span>
              <span class="meta-weather">{{ weatherCity }} · {{ weatherText }} · {{ tempText }}</span>
            </div>
          </div>
        </div>
      </div>
      <form class="search-form" @submit.prevent="onSearch">
        <select v-model="engine">
          <option value="https://www.baidu.com/s?wd=">百度</option>
          <option value="https://www.google.com/search?q=">Google</option>
          <option value="https://www.bing.com/search?q=">Bing</option>
        </select>
        <input v-model="query" placeholder="搜索..." />
        <button type="submit">搜索</button>
      </form>
    </div>

    <div class="debug-panel" v-show="showDebugPanel">
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

  <div v-if="showAnnouncement" class="intro-screen" @click="handleIntroClick">
    <div class="intro-content">
      <div class="intro-title">For Mia</div>
      <div
        v-for="(line, idx) in announcementVisibleLines"
        :key="idx"
        class="intro-line"
        :style="{ animationDelay: `${idx * 0.1}s` }"
      >
        {{ line }}
      </div>
      <div class="intro-hint" v-if="announcementFinished">点击屏幕进入</div>
    </div>
  </div>

  <div v-if="showLinkModal" class="modal-mask">
    <div class="modal-card" @click.stop>
      <div class="modal-title">配置链接</div>
      <div class="modal-field">
        <label>物体</label>
        <div class="modal-readonly">{{ linkForm.name || linkForm.id }}</div>
      </div>
      <div class="modal-field">
        <label for="linkInput">链接</label>
        <input id="linkInput" v-model="linkForm.url" placeholder="输入要跳转的链接" />
      </div>
      <div class="modal-actions">
        <button type="button" class="ghost-btn" @click="showLinkModal = false">取消</button>
        <button type="button" class="primary-btn" @click="saveLinkConfig">保存</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue';
import { createGame } from './game.js';
import announcement from './config/announcement.js';

const engine = ref('https://www.baidu.com/s?wd=');
const query = ref('');
let phaserGame = null;
const dateText = ref('');
const weekdayText = ref('');
const timeMode = ref('mars'); // mars=北京时间，phobos=哥德堡时间
const timeZone = computed(() =>
  timeMode.value === 'phobos' ? 'Europe/Stockholm' : 'Asia/Shanghai'
);
const currentTime = ref('');
const debugHour = ref(12);
const weatherText = ref('加载中...');
const tempText = ref('--°C');
const weatherCity = ref('北京天气');
let timer = null;
let weatherTimer = null;
const currentTimeParts = computed(() => currentTime.value.split(''));
const showDebugPanel = ref(false);
const showAnnouncement = ref(false);
const announcementVisibleLines = ref([]);
const announcementLines = announcement.lines || [];
const announcementVersion = announcement.version || 'default';
const announcementFinished = ref(false);
let announcementTimer = null;
const showLinkModal = ref(false);
const linkForm = ref({ id: '', name: '', url: '' });

onMounted(() => {
  phaserGame = createGame('game-container');
  hydrateTimeMode();
  hydrateEngine();
  updateDate();
  timer = setInterval(updateDate, 1000); // 秒级刷新，保证秒钟实时跳动
  fetchWeather();
  weatherTimer = setInterval(fetchWeather, 1000 * 60 * 10); // 10 分钟刷新一次

  window.addEventListener('mia:debug-toggle', handleDebugToggle);
  startAnnouncementIfNeeded();
  window.addEventListener('mia:link-config', handleLinkConfig);
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
  window.removeEventListener('mia:debug-toggle', handleDebugToggle);
  window.removeEventListener('mia:link-config', handleLinkConfig);
  if (announcementTimer) {
    clearTimeout(announcementTimer);
    announcementTimer = null;
  }
});

watch(timeZone, updateDate);
watch(engine, (val) => {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem('miaPlanet_search_engine', val);
    }
  } catch (e) {
    /* ignore */
  }
});

watch(timeMode, (mode) => {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem('miaPlanet_time_mode', mode);
    }
  } catch (e) {
    /* ignore */
  }
});

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

const setTimeMode = (mode) => {
  timeMode.value = mode;
  updateDate();
  fetchWeather();
  emitTimezoneChange();
};

const handleDebugToggle = (evt) => {
  const detail = evt?.detail || {};
  if (typeof detail.visible === 'boolean') {
    showDebugPanel.value = detail.visible;
  } else {
    showDebugPanel.value = !showDebugPanel.value;
  }
};

const startAnnouncementIfNeeded = () => {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    const seen = window.localStorage.getItem('mia_announcement_seen_version');
    if (seen === announcementVersion) return;
    showAnnouncement.value = true;
    announcementVisibleLines.value = [];
    announcementFinished.value = false;
    let idx = 0;
    const step = () => {
      if (idx < announcementLines.length) {
        announcementVisibleLines.value = [...announcementVisibleLines.value, announcementLines[idx]];
        idx += 1;
        announcementTimer = setTimeout(step, 1500);
      } else {
        announcementFinished.value = true;
        announcementTimer = null;
      }
    };
    step();
  } catch (e) {
    showAnnouncement.value = false;
  }
};

const handleIntroClick = () => {
  if (!showAnnouncement.value) return;
  if (!announcementFinished.value) {
    announcementVisibleLines.value = [...announcementLines];
    announcementFinished.value = true;
    if (announcementTimer) {
      clearTimeout(announcementTimer);
      announcementTimer = null;
    }
    return;
  }
  showAnnouncement.value = false;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem('mia_announcement_seen_version', announcementVersion);
    }
  } catch (e) {
    /* ignore */
  }
};

const handleLinkConfig = (evt) => {
  const detail = evt?.detail || {};
  linkForm.value = {
    id: detail.id || '',
    name: detail.name || '',
    url: detail.url || '',
  };
  showLinkModal.value = true;
};

const saveLinkConfig = () => {
  try {
    if (typeof window !== 'undefined' && window.localStorage && linkForm.value.id) {
      window.localStorage.setItem(`mia_obj_link_${linkForm.value.id}`, linkForm.value.url || '');
    }
  } catch (e) {
    /* ignore */
  }
  showLinkModal.value = false;
};

function hydrateEngine() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    const saved = window.localStorage.getItem('miaPlanet_search_engine');
    if (saved) {
      engine.value = saved;
    }
  } catch (e) {
    /* ignore */
  }
}

function hydrateTimeMode() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    const saved = window.localStorage.getItem('miaPlanet_time_mode');
    if (saved === 'mars' || saved === 'phobos') {
      timeMode.value = saved;
    }
  } catch (e) {
    /* ignore */
  }
}

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
  const mode = timeMode.value === 'phobos' ? 'phobos' : 'mars';
  const cfg = mode === 'phobos'
    ? { city: '哥德堡天气', latitude: 57.7089, longitude: 11.9746 }
    : { city: '北京天气', latitude: 39.9042, longitude: 116.4074 };
  weatherCity.value = cfg.city;
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${cfg.latitude}&longitude=${cfg.longitude}&current=temperature_2m,weather_code,wind_speed_10m`;
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

const emitTimezoneChange = () => {
  const mode = timeMode.value === 'phobos' ? 'phobos' : 'mars';
  const cfg = mode === 'phobos'
    ? { lat: 57.7089, lon: 11.9746, tz: 'Europe/Stockholm' }
    : { lat: 39.9042, lon: 116.4074, tz: 'Asia/Shanghai' };
  try {
    if (typeof window !== 'undefined' && window.dispatchEvent) {
      window.dispatchEvent(new CustomEvent('mia:timezone-change', { detail: cfg }));
    }
  } catch (e) {
    /* ignore */
  }
};
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
  top: 7%;
  transform: translateX(-50%);
  z-index: 2;
  width: min(88%, 660px);
  display: flex;
  flex-direction: column;
  gap: 14px;
  align-items: center;
}

.glass-card {
  background: radial-gradient(circle at 20% 20%, rgba(110, 200, 255, 0.12), transparent 55%),
    radial-gradient(circle at 80% 80%, rgba(140, 110, 255, 0.12), transparent 50%),
    linear-gradient(160deg, rgba(12, 20, 40, 0.6), rgba(8, 12, 28, 0.5));
  border: 1px solid rgba(76, 205, 255, 0.12);
  box-shadow:
    0 12px 30px rgba(0, 0, 0, 0.45),
    0 0 14px rgba(76, 205, 255, 0.25),
    inset 0 0 8px rgba(255, 255, 255, 0.04);
  backdrop-filter: blur(12px);
  border-radius: 16px;
}

  .time-shell {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .time-ring {
    position: absolute;
    inset: -12px;
    border-radius: 18px;
    background:
      radial-gradient(circle at 20% 20%, rgba(100, 200, 255, 0.18), transparent 45%),
      radial-gradient(circle at 80% 80%, rgba(138, 107, 255, 0.16), transparent 40%),
      linear-gradient(120deg, rgba(100, 200, 255, 0.25), rgba(138, 107, 255, 0.16));
    filter: blur(12px);
    opacity: 0.75;
    z-index: 0;
  }

.time-core {
  position: relative;
  z-index: 1;
  padding: 14px 18px;
  min-width: 320px;
}

  .clock-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 6px;
  }

  .clock-label {
    font-size: 12px;
    letter-spacing: 0.14em;
    color: #7dd7ff;
    text-transform: uppercase;
  }

.clock-time {
  display: flex;
  gap: 6px;
  align-items: baseline;
  font-family: 'Share Tech Mono', 'Orbitron', 'SFMono-Regular', Consolas, monospace;
  font-size: 32px;
  font-weight: 800;
  letter-spacing: 0.08em;
  color: #e8f3ff;
  text-shadow: 0 0 12px rgba(59, 170, 255, 0.5);
}

  .clock-time span {
    display: inline-block;
    min-width: 18px;
    animation: flip 0.25s ease;
  }

.clock-sub {
  margin-top: 4px;
  font-size: 13px;
  color: #9eb8d6;
}

.time-meta {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 12px;
  color: #cfe1ff;
  opacity: 0.9;
}

.time-meta .meta-date {
  font-weight: 700;
}

.time-meta .meta-weather {
  color: #a8c7ff;
}

.intro-screen {
  position: fixed;
  inset: 0;
  background: radial-gradient(circle at 20% 20%, rgba(100, 200, 255, 0.18), transparent 45%),
    radial-gradient(circle at 80% 80%, rgba(138, 107, 255, 0.15), transparent 40%),
    linear-gradient(135deg, #0a1020, #0c1c38);
  z-index: 99;
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(4px);
}

.intro-content {
  padding: 32px 40px;
  border-radius: 18px;
  background: rgba(12, 20, 40, 0.8);
  border: 1px solid rgba(120, 160, 255, 0.35);
  box-shadow:
    0 20px 60px rgba(0, 0, 0, 0.45),
    0 0 32px rgba(100, 200, 255, 0.25);
  max-width: 520px;
  text-align: center;
}

.intro-title {
  font-size: 18px;
  letter-spacing: 0.2em;
  color: #7dd7ff;
  margin-bottom: 16px;
}

.intro-line {
  font-size: 18px;
  color: #e8f3ff;
  margin: 8px 0;
  opacity: 0;
  animation: fadeInUp 0.6s ease forwards;
  text-shadow: 0 0 12px rgba(100, 200, 255, 0.5);
}

.intro-hint {
  margin-top: 16px;
  font-size: 14px;
  color: #9bc8ff;
  opacity: 0.85;
  letter-spacing: 0.08em;
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.modal-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 120;
}

.modal-card {
  width: min(420px, 90%);
  background: rgba(12, 20, 40, 0.9);
  border: 1px solid rgba(120, 160, 255, 0.25);
  border-radius: 16px;
  padding: 20px;
  box-shadow:
    0 18px 40px rgba(0, 0, 0, 0.4),
    0 0 24px rgba(100, 200, 255, 0.3);
  color: #e8f3ff;
}

.modal-title {
  font-size: 18px;
  font-weight: 800;
  margin-bottom: 12px;
}

.modal-field {
  margin-bottom: 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.modal-field label {
  font-size: 13px;
  color: #9eb8d6;
}

.modal-field input {
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(255, 255, 255, 0.08);
  color: #e8f3ff;
}

.modal-readonly {
  padding: 10px 12px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.12);
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 8px;
}

.primary-btn {
  padding: 10px 14px;
  border-radius: 10px;
  border: none;
  background: linear-gradient(135deg, #4dc9ff, #5c7dff);
  color: #0b1d36;
  font-weight: 800;
  cursor: pointer;
  box-shadow:
    0 10px 20px rgba(0, 0, 0, 0.35),
    0 0 12px rgba(100, 200, 255, 0.5);
}

.primary-btn:hover {
  background: linear-gradient(135deg, #6addff, #7d8dff);
}

.search-form {
  width: 100%;
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 12px 14px;
  border-radius: 14px;
  background: radial-gradient(circle at 20% 20%, rgba(100, 200, 255, 0.1), transparent 50%),
    radial-gradient(circle at 80% 80%, rgba(138, 107, 255, 0.1), transparent 45%),
    linear-gradient(160deg, rgba(10, 18, 38, 0.72), rgba(6, 10, 24, 0.72));
  border: 1px solid rgba(80, 150, 255, 0.16);
  box-shadow:
    0 12px 36px rgba(0, 0, 0, 0.45),
    0 0 18px rgba(64, 186, 255, 0.25),
    inset 0 0 10px rgba(255, 255, 255, 0.03);
  backdrop-filter: blur(14px);
}

select,
input {
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(6, 10, 20, 0.8);
  color: #e8f3ff;
  box-shadow: inset 0 0 10px rgba(0, 0, 0, 0.45);
}

select {
  min-width: 160px;
  font-weight: 700;
  letter-spacing: 0.01em;
  appearance: none;
  background-image:
    linear-gradient(45deg, transparent 50%, #cfe9ff 50%),
    linear-gradient(135deg, #cfe9ff 50%, transparent 50%),
    linear-gradient(to right, rgba(255, 255, 255, 0.2), rgba(255, 255, 255, 0.2));
  background-position:
    calc(100% - 18px) calc(50% - 3px),
    calc(100% - 12px) calc(50% - 3px),
    calc(100% - 28px) 50%;
  background-repeat: no-repeat;
  background-size: 6px 6px, 6px 6px, 1px 60%;
  padding-right: 34px;
}

input {
  flex: 1;
}

button {
  padding: 12px 16px;
  border-radius: 12px;
  border: none;
  background: linear-gradient(135deg, #4dc9ff, #5c7dff);
  color: #0b1d36;
  font-weight: 800;
  cursor: pointer;
  box-shadow:
    0 10px 20px rgba(0, 0, 0, 0.35),
    0 0 12px rgba(100, 200, 255, 0.5);
}

button:hover {
  background: linear-gradient(135deg, #6addff, #7d8dff);
}

.tz-switch {
  position: relative;
  display: inline-flex;
  gap: 0;
  padding: 6px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(100, 200, 255, 0.2);
  box-shadow:
    0 10px 24px rgba(0, 0, 0, 0.35),
    inset 0 0 12px rgba(0, 0, 0, 0.4);
  overflow: hidden;
}

.tz-chip {
  position: relative;
  z-index: 1;
  flex: 1;
  min-width: 0;
  padding: 10px 14px;
  white-space: nowrap;
  border-radius: 10px;
  border: none;
  background: transparent;
  color: #cfe9ff;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  cursor: pointer;
  transition: color 0.25s ease;
}

.tz-chip .chip-dot {
  display: inline-block;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  margin-right: 8px;
  box-shadow: 0 0 10px currentColor;
}
.chip-dot.mars {
  background: #4ad7ff;
  color: #4ad7ff;
}
.chip-dot.phobos {
  background: #a371ff;
  color: #a371ff;
}

.tz-chip.active {
  color: #0b1428;
}

.tz-indicator {
  position: absolute;
  z-index: 0;
  top: 6px;
  bottom: 6px;
  left: 6px;
  width: calc(50% - 6px);
  border-radius: 12px;
  background: linear-gradient(135deg, #64c8ff, #8a6bff);
  box-shadow:
    0 8px 20px rgba(100, 200, 255, 0.4),
    0 0 18px rgba(138, 107, 255, 0.4);
  transition: transform 0.28s ease, background 0.28s ease;
}
.tz-indicator.mars {
  transform: translateX(0%);
}
.tz-indicator.phobos {
  transform: translateX(100%);
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
  
  @keyframes flip {
    0% {
      transform: translateY(6px);
      opacity: 0;
    }
    100% {
      transform: translateY(0);
      opacity: 1;
    }
  }
</style>
