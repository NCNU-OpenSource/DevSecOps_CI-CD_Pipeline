# 多階段構建
# Stage 1: 構建前端
FROM node:20-slim AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: 構建後端
FROM oven/bun:1 AS backend-builder
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile
COPY src/ ./src/
COPY tsconfig.json ./
RUN bun build src/index.ts --outdir dist --target bun

# Stage 3: 最終映像
FROM oven/bun:1-slim
WORKDIR /app

# 安裝 mpv 和 yt-dlp
RUN apt-get update && apt-get install -y --no-install-recommends \
    mpv \
    yt-dlp \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# 複製構建產物
COPY --from=backend-builder /app/dist ./dist
COPY --from=backend-builder /app/node_modules ./node_modules
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist
COPY package.json ./

# 複製舊版 HTML5 前端（保留作為後備）
COPY public/ ./public/

# 環境變數
ENV NODE_ENV=production
ENV LOG_LEVEL=INFO

EXPOSE 3000

CMD ["bun", "run", "dist/index.js"]
