// WebSocket 連接
let ws = null;
let currentState = null;
let currentLyrics = [];
let lastLyricIndex = -1;

// DOM 元素
const statusIndicator = document.getElementById("status-indicator");
const statusText = document.getElementById("status-text");
const searchInput = document.getElementById("search-input");
const searchBtn = document.getElementById("search-btn");
const searchResults = document.getElementById("search-results");
const nowPlaying = document.getElementById("now-playing");
const progressFill = document.getElementById("progress-fill");
const currentTime = document.getElementById("current-time");
const durationTime = document.getElementById("duration-time");
const playPauseBtn = document.getElementById("play-pause-btn");
const skipBtn = document.getElementById("skip-btn");
const volumeSlider = document.getElementById("volume-slider");
const volumeValue = document.getElementById("volume-value");
const queueList = document.getElementById("queue-list");
const queueCount = document.getElementById("queue-count");
const lyricsDisplay = document.getElementById("lyrics-display");

// 初始化 WebSocket
function connectWebSocket() {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const wsUrl = `${protocol}//${window.location.host}/ws`;

  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    console.log("WebSocket connected");
    statusIndicator.className = "status-online";
    statusText.textContent = "已連線";
  };

  ws.onclose = () => {
    console.log("WebSocket disconnected");
    statusIndicator.className = "status-offline";
    statusText.textContent = "離線";

    // 5 秒後重連
    setTimeout(connectWebSocket, 5000);
  };

  ws.onerror = (error) => {
    console.error("WebSocket error:", error);
  };

  ws.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data);
      handleWebSocketMessage(message);
    } catch (error) {
      console.error("Failed to parse WebSocket message:", error);
    }
  };
}

// 處理 WebSocket 訊息
function handleWebSocketMessage(message) {
  console.log("WebSocket message:", message.type);

  switch (message.type) {
    case "playback_state":
      currentState = message.state;
      updatePlaybackState(message.state);
      break;

    case "queue_updated":
      updateQueue(message.queue);
      break;

    case "lyrics":
      currentLyrics = message.lyrics;
      updateLyrics(message.lyrics);
      break;

    default:
      console.log("Unknown message type:", message.type);
  }
}

// 更新播放狀態
function updatePlaybackState(state) {
  // 更新目前播放
  if (state.currentTrack) {
    nowPlaying.innerHTML = `
      <div class="now-playing-content">
        <img src="${state.currentTrack.thumbnail}" alt="${state.currentTrack.title}">
        <div class="now-playing-info">
          <h3>${state.currentTrack.title}</h3>
          <p>${state.currentTrack.artist}</p>
        </div>
      </div>
    `;

    // 更新進度條
    const progress = (state.position / state.duration) * 100;
    progressFill.style.width = `${progress}%`;

    // 更新時間顯示
    currentTime.textContent = formatTime(state.position);
    durationTime.textContent = formatTime(state.duration);

    // 啟用控制按鈕
    playPauseBtn.disabled = false;
    skipBtn.disabled = false;

    // 更新播放/暫停按鈕
    if (state.isPlaying) {
      playPauseBtn.textContent = "⏸️ 暫停";
    } else {
      playPauseBtn.textContent = "▶️ 播放";
    }

    // 更新當前歌詞行
    updateCurrentLyricLine(state.position);
  } else {
    nowPlaying.innerHTML = '<p class="no-track">沒有播放中的歌曲</p>';
    progressFill.style.width = "0%";
    currentTime.textContent = "0:00";
    durationTime.textContent = "0:00";
    playPauseBtn.disabled = true;
    skipBtn.disabled = true;
  }

  // 更新音量
  volumeSlider.value = state.volume;
  volumeValue.textContent = state.volume;
}

// 更新播放清單
function updateQueue(queue) {
  queueCount.textContent = queue.length;

  if (queue.length === 0) {
    queueList.innerHTML = '<p class="no-items">播放清單是空的</p>';
    return;
  }

  queueList.innerHTML = queue
    .map(
      (track, index) => `
    <div class="queue-item">
      <div class="queue-item-info">
        <img src="${track.thumbnail}" alt="${track.title}">
        <div class="queue-item-text">
          <h4>${track.title}</h4>
          <p>${track.artist} • ${formatTime(track.duration)}</p>
        </div>
      </div>
      <button class="queue-item-remove" onclick="removeFromQueue(${index})">移除</button>
    </div>
  `,
    )
    .join("");
}

// 更新歌詞
function updateLyrics(lyrics) {
  if (!lyrics || lyrics.length === 0) {
    lyricsDisplay.innerHTML = '<p class="no-lyrics">沒有歌詞</p>';
    return;
  }

  lyricsDisplay.innerHTML = lyrics
    .map(
      (line, index) => `
    <div class="lyric-line" data-time="${line.time}" data-index="${index}">
      ${line.text}
    </div>
  `,
    )
    .join("");

  // 當歌曲切換時重置 lastLyricIndex
  lastLyricIndex = -1;
}

// 更新當前歌詞行
function updateCurrentLyricLine(currentTime) {
  // 邊界條件檢查
  if (!currentLyrics || currentLyrics.length === 0) return;
  if (!lyricsDisplay) return;

  let currentIndex = 0;
  for (let i = 0; i < currentLyrics.length; i++) {
    if (currentLyrics[i].time <= currentTime) {
      currentIndex = i;
    } else {
      break;
    }
  }

  // 只在歌詞行切換時才更新 UI
  if (currentIndex === lastLyricIndex) return;

  // 移除上一行的 active class（如果存在）
  if (lastLyricIndex !== -1) {
    const prevLine = document.querySelector(
      `.lyric-line[data-index="${lastLyricIndex}"]`,
    );
    if (prevLine) prevLine.classList.remove("active");
  }

  lastLyricIndex = currentIndex;

  // 添加 active class 到當前行
  const currentLine = document.querySelector(
    `.lyric-line[data-index="${currentIndex}"]`,
  );
  if (currentLine) {
    currentLine.classList.add("active");

    // 只在歌詞容器內捲動，不影響整個頁面
    const container = lyricsDisplay;
    const lineTop = currentLine.offsetTop;
    const lineHeight = currentLine.offsetHeight;
    const containerHeight = container.clientHeight;

    // 計算目標捲動位置，確保不會是負數
    const targetScrollTop = Math.max(
      0,
      lineTop - containerHeight / 2 + lineHeight / 2,
    );

    // 將當前行捲動到容器中央
    container.scrollTo({
      top: targetScrollTop,
      behavior: "smooth",
    });
  }
}

// 格式化時間（秒 -> mm:ss）
function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return "0:00";

  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

// 搜尋歌曲
async function searchSongs() {
  const query = searchInput.value.trim();
  if (!query) return;

  searchResults.innerHTML =
    '<p style="text-align: center; color: #999;">搜尋中...</p>';

  try {
    const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
    const data = await response.json();

    if (!data.success || !data.data || data.data.length === 0) {
      searchResults.innerHTML =
        '<p style="text-align: center; color: #999;">沒有找到結果</p>';
      return;
    }

    searchResults.innerHTML = data.data
      .map(
        (track) => `
      <div class="search-result-item" onclick="addToQueue('${track.videoId}')">
        <img src="${track.thumbnail}" alt="${track.title}">
        <div class="search-result-info">
          <h4>${track.title}</h4>
          <p>${track.artist} • ${formatTime(track.duration)}</p>
        </div>
      </div>
    `,
      )
      .join("");
  } catch (error) {
    console.error("Search failed:", error);
    searchResults.innerHTML =
      '<p style="text-align: center; color: #f44336;">搜尋失敗</p>';
  }
}

// 加入播放清單
async function addToQueue(videoId) {
  try {
    const response = await fetch("/api/queue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ videoId }),
    });

    const data = await response.json();
    if (data.success) {
      console.log("Added to queue:", videoId);
    }
  } catch (error) {
    console.error("Failed to add to queue:", error);
  }
}

// 從播放清單移除
async function removeFromQueue(index) {
  try {
    const response = await fetch(`/api/queue/${index}`, { method: "DELETE" });
    const data = await response.json();
    if (data.success) {
      console.log("Removed from queue:", index);
    }
  } catch (error) {
    console.error("Failed to remove from queue:", error);
  }
}

// 播放/暫停
function togglePlayPause() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;

  ws.send(
    JSON.stringify({
      type: currentState?.isPlaying ? "pause" : "play",
    }),
  );
}

// 跳過
function skip() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;

  ws.send(JSON.stringify({ type: "skip" }));
}

// 設定音量
function setVolume() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;

  const volume = parseInt(volumeSlider.value, 10);
  volumeValue.textContent = volume;

  ws.send(
    JSON.stringify({
      type: "volume",
      value: volume,
    }),
  );
}

// 事件監聽
searchBtn.addEventListener("click", searchSongs);
searchInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") searchSongs();
});

playPauseBtn.addEventListener("click", togglePlayPause);
skipBtn.addEventListener("click", skip);
volumeSlider.addEventListener("input", setVolume);

// 初始化
connectWebSocket();
