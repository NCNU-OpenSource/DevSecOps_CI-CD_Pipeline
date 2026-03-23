import { createServer } from './server.ts';
import { getAppMetadata } from "./utils/app-metadata.ts";
import { logRuntimeDependencyStatus } from "./utils/runtime-dependencies.ts";

const metadata = getAppMetadata();
logRuntimeDependencyStatus();
const server = createServer();
const displayHost = process.env.HOST?.trim() || "localhost";

console.log(`
╔════════════════════════════════════════════╗
║  YouTube Music 點歌機器人 WebUI           ║
╚════════════════════════════════════════════╝

🏷️  Version: ${metadata.buildVersion}
🎵 Server running at: http://${displayHost}:${server.port}
🌐 WebSocket endpoint: ws://${displayHost}:${server.port}/ws

請使用瀏覽器開啟 http://${displayHost}:${server.port} 來使用點歌系統。
確保已安裝 mpv 播放器：
  - macOS: brew install mpv
  - Ubuntu: sudo apt install mpv
  - Windows: 從 https://mpv.io 下載

按 Ctrl+C 停止伺服器。
`);
