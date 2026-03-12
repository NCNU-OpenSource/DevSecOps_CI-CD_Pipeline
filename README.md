# YouTube Music 點歌機器人 WebUI

一個基於 Web 的 YouTube Music 點歌系統，用戶可以透過瀏覽器搜尋、點歌和控制播放，音訊則透過連接的音箱輸出。

## 功能特色

- 🔍 **搜尋歌曲**：透過歌曲名稱、歌手或 YouTube 連結搜尋
- 🎵 **點歌系統**：加入歌曲到播放清單
- 🎮 **播放控制**：播放/暫停、下一首、音量調整
- 📋 **播放清單**：查看和管理排隊中的歌曲
- 📝 **同步歌詞**：即時顯示歌詞（支援 LRC 格式）
- 🔄 **即時同步**：透過 WebSocket 即時更新所有客戶端的狀態

## 系統架構

```
┌─────────────────┐                    ┌─────────────────┐
│   手機/電腦      │    WebSocket       │   後端 Server   │
│   瀏覽器        │ ◄────────────────► │   (Bun/Hono)    │
├─────────────────┤                    ├─────────────────┤
│ - 搜尋歌曲       │                    │ - 管理播放清單   │
│ - 點歌          │                    │ - youtubei.js   │
│ - 看播放清單     │                    │ - mpv 播放      │
│ - 播放控制       │                    │                 │
│ - 顯示歌詞       │                    │                 │
└─────────────────┘                    └────────┬────────┘
                                                │
                                                │ mpv (--no-video)
                                                ▼
                                       ┌─────────────────┐
                                       │   音箱 / 喇叭    │
                                       └─────────────────┘
```

## 技術棧

- **Runtime**: Bun
- **Backend**: Hono (Web 框架)
- **播放器**: mpv (音訊播放)
- **YouTube API**: youtubei.js
- **歌詞**: LRCLIB API
- **即時通訊**: WebSocket
- **Frontend**: HTML5 + Vanilla JavaScript

## 安裝需求

### 1. 安裝 Bun

```bash
# macOS/Linux
curl -fsSL https://bun.sh/install | bash

# Windows
powershell -c "irm bun.sh/install.ps1 | iex"
```

### 2. 安裝 mpv 播放器

```bash
# macOS
brew install mpv

# Ubuntu/Debian
sudo apt install mpv

# Windows
# 從 https://mpv.io 下載並安裝
```

### 3. 安裝專案依賴

```bash
bun install
```

## 使用方式

### 啟動伺服器

```bash
# 開發模式（自動重新載入）
bun run dev

# 生產模式
bun run start
```

### 存取 WebUI

1. 開啟瀏覽器訪問 `http://localhost:3000`
2. 使用搜尋功能找到想聽的歌曲
3. 點擊搜尋結果加入播放清單
4. 系統會自動開始播放，音訊從連接的音箱輸出
5. 可以使用多台裝置同時控制播放

## API 文件

### REST API

#### `GET /api/search?q={query}`
搜尋歌曲。

**回應範例**:
```json
{
  "success": true,
  "data": [
    {
      "videoId": "dQw4w9WgXcQ",
      "title": "Never Gonna Give You Up",
      "artist": "Rick Astley",
      "duration": 212,
      "thumbnail": "https://..."
    }
  ]
}
```

#### `POST /api/queue`
加入歌曲到播放清單。

**請求範例**:
```json
{
  "videoId": "dQw4w9WgXcQ"
}
```

#### `GET /api/queue`
取得播放清單。

#### `DELETE /api/queue/{index}`
從播放清單移除歌曲。

#### `GET /api/state`
取得目前播放狀態。

#### `GET /api/lyrics`
取得目前歌曲的歌詞。

### WebSocket API

**連接**: `ws://localhost:3000/ws`

#### 伺服器 → 客戶端

```javascript
// 播放狀態更新
{
  "type": "playback_state",
  "state": {
    "isPlaying": true,
    "currentTrack": { ... },
    "position": 45.2,
    "duration": 212,
    "volume": 70,
    "queue": [ ... ]
  }
}

// 播放清單更新
{
  "type": "queue_updated",
  "queue": [ ... ]
}

// 歌詞
{
  "type": "lyrics",
  "lyrics": [
    { "time": 0, "text": "..." },
    ...
  ]
}
```

#### 客戶端 → 伺服器

```javascript
// 播放/暫停
{ "type": "play" }
{ "type": "pause" }

// 下一首
{ "type": "skip" }

// 音量
{ "type": "volume", "value": 80 }
```

## 檔案結構

```
youtube_music_bot/
├── package.json
├── tsconfig.json
├── README.md
├── src/
│   ├── index.ts              # 入口點
│   ├── server.ts             # Hono server + WebSocket
│   ├── routes/
│   │   └── api.ts            # REST API 路由
│   ├── services/
│   │   ├── music.service.ts  # YouTube Music 服務
│   │   ├── player.service.ts # mpv 播放器控制
│   │   └── queue.service.ts  # 播放清單佇列
│   ├── websocket/
│   │   └── handler.ts        # WebSocket 事件處理
│   └── types/
│       └── index.ts          # 類型定義
└── public/
    ├── index.html            # 點歌頁面
    ├── style.css             # 樣式
    └── app.js                # 前端邏輯
```

## 常見問題

### mpv 找不到？

確保 mpv 已安裝並在 PATH 中：

```bash
which mpv
mpv --version
```

如果 mpv 在自訂路徑，可設定環境變數：

```bash
export MPV_PATH=/path/to/mpv
```

### 無法播放歌曲？

1. 檢查網路連線
2. 確認 mpv 正常運作：`mpv https://www.youtube.com/watch?v=dQw4w9WgXcQ`
3. 查看伺服器日誌是否有錯誤訊息

### WebSocket 連接失敗？

1. 確認伺服器正在運行
2. 檢查防火牆設定
3. 如果使用代理，確保 WebSocket 連接未被阻擋

## 授權

MIT License

## 作者

基於 [youtube-music-cli](https://github.com/involvex/youtube-music-cli) 專案開發
