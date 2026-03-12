import { createServer } from './server.ts';

const server = createServer();

console.log(`
╔════════════════════════════════════════════╗
║  YouTube Music 點歌機器人 WebUI           ║
╚════════════════════════════════════════════╝

🎵 Server running at: http://localhost:${server.port}
🌐 WebSocket endpoint: ws://localhost:${server.port}/ws

請使用瀏覽器開啟 http://localhost:${server.port} 來使用點歌系統。
確保已安裝 mpv 播放器：
  - macOS: brew install mpv
  - Ubuntu: sudo apt install mpv
  - Windows: 從 https://mpv.io 下載

按 Ctrl+C 停止伺服器。
`);
