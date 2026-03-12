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

### 後端
- **Runtime**: Bun
- **Backend**: Hono (Web 框架)
- **播放器**: mpv (音訊播放)
- **YouTube API**: youtubei.js
- **歌詞**: LRCLIB API
- **即時通訊**: WebSocket

### 前端
- **React 19** - UI 框架
- **TypeScript** - 類型安全
- **Vite** - 構建工具
- **Tailwind CSS v4** - 樣式框架
- **Zustand** - 狀態管理
- **COSS UI** - 設計系統

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
# 後端依賴
bun install

# 前端依賴
cd frontend && npm install && cd ..
```

## 使用方式

### 開發模式

**方式一：分別啟動（推薦）**

```bash
# 終端 1：啟動後端
bun run dev

# 終端 2：啟動前端
npm run dev:frontend
```

前端會在 http://localhost:5173 啟動，並自動代理 API 到後端 http://localhost:3000。

**方式二：僅啟動後端（使用舊版 HTML5 前端）**

```bash
bun run dev
# 訪問 http://localhost:3000 使用基礎 HTML5 版本
```

### 生產模式

```bash
# 1. 構建前端和後端
npm run build:all

# 2. 啟動生產服務器
npm run start
```

生產模式下訪問 http://localhost:3000 即可使用完整功能的 React 前端。

## Docker 部署（樹莓派）

本專案支援透過 Docker 部署到樹莓派，提供簡單的容器化部署方案。

### 前置需求

- 樹莓派（推薦 64 位元系統，如 Raspberry Pi OS 64-bit）
- Docker 和 Docker Compose 已安裝
- 音頻設備正常運作

### 部署方式

#### 方式一：在樹莓派上直接構建

```bash
# 1. 複製專案到樹莓派
git clone <your-repo-url> youtube-music-bot
cd youtube-music-bot

# 2. 構建並啟動服務
docker compose up -d

# 3. 查看日誌
docker compose logs -f
```

#### 方式二：跨架構構建（在 Mac/PC 上）

這個方式適合在 Mac 或 PC 上構建 ARM64 映像，然後傳輸到樹莓派。

**步驟 1：在 Mac/PC 上構建 ARM64 映像**

```bash
# 設置 buildx 構建器（首次需要）
docker buildx create --name arm-builder --use

# 構建 ARM64 映像並保存為 tar
docker buildx build --platform linux/arm64 \
  -t youtube-music-bot:latest \
  --output type=docker,dest=youtube-music-bot-arm64.tar .
```

**步驟 2：傳輸映像到樹莓派**

```bash
# 使用 scp 傳輸（替換 <樹莓派IP>）
scp youtube-music-bot-arm64.tar pi@<樹莓派IP>:~/

# 或使用 rsync（支援斷點續傳）
rsync -avP youtube-music-bot-arm64.tar pi@<樹莓派IP>:~/

# 同時傳輸 docker-compose.yml
scp docker-compose.yml pi@<樹莓派IP>:~/youtube-music-bot/
```

**步驟 3：在樹莓派上載入並啟動**

```bash
# SSH 進入樹莓派
ssh pi@<樹莓派IP>

# 載入 Docker 映像
docker load -i youtube-music-bot-arm64.tar

# 啟動服務
cd ~/youtube-music-bot
docker compose up -d

# 查看日誌
docker compose logs -f
```

### 驗證部署

1. 訪問 `http://<樹莓派IP>:3000`
2. 搜尋並加入歌曲到播放清單
3. 確認音頻從樹莓派連接的音箱輸出

### Docker 管理指令

```bash
# 啟動服務
docker compose up -d

# 停止服務
docker compose down

# 重新啟動服務
docker compose restart

# 查看日誌
docker compose logs -f

# 更新映像並重啟
docker compose pull
docker compose up -d
```

### 音頻配置說明

**ALSA（預設）**：
Docker Compose 配置已掛載 `/dev/snd`，支援直接使用 ALSA 音頻設備。

**PulseAudio（進階）**：
如果樹莓派使用 PulseAudio，請編輯 `docker-compose.yml`，取消註解 PulseAudio 相關配置：

```yaml
volumes:
  - /run/user/1000/pulse:/run/user/1000/pulse
environment:
  - PULSE_SERVER=unix:/run/user/1000/pulse/native
```

### 疑難排解

**音頻無輸出？**
1. 確認音頻設備已正確掛載：`ls -l /dev/snd`
2. 檢查容器是否有音頻設備訪問權限
3. 測試 mpv 是否正常：`docker exec youtube-music-bot mpv --version`

**無法連接服務？**
1. 確認服務正在運行：`docker compose ps`
2. 檢查防火牆設定：`sudo ufw status`
3. 查看詳細日誌：`docker compose logs -f`

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
├── src/                      # 後端程式碼
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
├── frontend/                 # React 前端
│   ├── src/
│   │   ├── components/       # React 組件
│   │   ├── hooks/            # 自定義 Hooks
│   │   ├── stores/           # Zustand 狀態管理
│   │   ├── services/         # API 服務層
│   │   └── types/            # 前端類型定義
│   └── dist/                 # 構建產物（生產模式）
└── public/                   # 舊版 HTML5 前端（保留）
    ├── index.html
    ├── style.css
    └── app.js
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
