<template>
  <div class="page">
    <div id="game-container"></div>

    <div class="overlay">
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
  </div>
</template>

<script setup>
import { onMounted, onBeforeUnmount, ref } from 'vue';
import { createGame } from './game.js';

const engine = ref('https://www.google.com/search?q=');
const query = ref('');
let phaserGame = null;

onMounted(() => {
  phaserGame = createGame('game-container');
});

onBeforeUnmount(() => {
  if (phaserGame) {
    phaserGame.destroy(true);
    phaserGame = null;
  }
});

const onSearch = () => {
  const keyword = query.value.trim();
  if (!keyword) return;
  window.open(engine.value + encodeURIComponent(keyword), '_blank');
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

.overlay {
  position: fixed;
  left: 50%;
  top: 16%;
  transform: translateX(-50%);
  z-index: 2;
  width: min(90%, 640px);
  display: flex;
  justify-content: center;
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
</style>
