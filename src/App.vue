<template>
  <div class="page">
    <header class="search-bar">
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
    </header>

    <main>
      <div id="game-wrapper">
        <div id="game-container"></div>
      </div>
    </main>
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
  min-height: 100vh;
  background: linear-gradient(180deg, #0b1d36, #0b2646);
  color: #e8f3ff;
  display: flex;
  flex-direction: column;
}

.search-bar {
  padding: 12px 16px;
  background: rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(6px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.search-form {
  display: flex;
  gap: 8px;
  align-items: center;
}

select,
input {
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.06);
  color: #e8f3ff;
}

select {
  min-width: 130px;
}

input {
  flex: 1;
}

button {
  padding: 8px 14px;
  border-radius: 8px;
  border: none;
  background: #3baaff;
  color: #0b1d36;
  font-weight: 700;
  cursor: pointer;
}

button:hover {
  background: #6cc1ff;
}

main {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 16px;
}

#game-wrapper {
  width: 100%;
  max-width: 520px;
  aspect-ratio: 430 / 900;
  display: flex;
  justify-content: center;
  align-items: center;
  border-radius: 16px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.45);
  background: radial-gradient(circle at 30% 30%, rgba(255, 255, 255, 0.08), transparent 40%), rgba(0, 0, 0, 0.25);
}

#game-container {
  width: 100%;
  height: 100%;
}
</style>
