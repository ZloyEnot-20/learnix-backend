/**
 * PM2: backend. Запуск: pm2 start ecosystem.config.cjs --env production
 *
 * Проект на чистом JS (ESM) — сборки нет, PM2 запускает src/server.js напрямую.
 * Файл назван .cjs, потому что package.json содержит "type": "module"
 * (PM2 читает конфиг как CommonJS).
 * Секреты (PORT, MONGODB_URI, JWT_*) берутся из .env в этой папке, не отсюда.
 */
module.exports = {
  apps: [
    {
      name: "ielts-backend",
      script: "src/server.js",
      cwd: __dirname,
      interpreter: "node",
      instances: 1,
      autorestart: true,
      // По умолчанию без watch (прод). Для разработки watch включается флагом:
      // npm run dev  ->  pm2 start ... --watch
      watch: false,
      // Что НЕ отслеживать, когда watch включён (--watch в dev).
      ignore_watch: ["node_modules", "logs", ".git", ".mongo-binaries"],
      env: { NODE_ENV: "development" },
      env_production: { NODE_ENV: "production" },
    },
  ],
}
