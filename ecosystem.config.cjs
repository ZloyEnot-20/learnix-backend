/**
 * PM2: backend. Запуск: pm2 start ecosystem.config.cjs --env production
 *
 * Проект на чистом JS (ESM) — сборки нет, PM2 запускает src/server.js напрямую.
 * Файл назван .cjs, потому что package.json содержит "type": "module"
 * (PM2 читает конфиг как CommonJS).
 * Секреты (PORT, MONGODB_URI, JWT_*) берутся из .env в этой папке, не отсюда.
 */
const ignoreWatch = ["node_modules", "logs", ".git", ".mongo-binaries"]

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
      // Бот — отдельный процесс; перезапуск API при правках src/bot не нужен.
      ignore_watch: [...ignoreWatch, "src/bot"],
      env: { NODE_ENV: "development" },
      env_production: { NODE_ENV: "production" },
    },
    {
      // Telegram-бот для родителей. Запускается вместе с бэкендом (npm run dev).
      name: "ielts-bot",
      script: "src/bot/telegram-bot.js",
      cwd: __dirname,
      interpreter: "node",
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      watch: false,
      ignore_watch: ignoreWatch,
      // Бот завершается с кодом 1, если TELEGRAM_BOT_TOKEN не задан в .env.
      // Ограничиваем рестарты и делаем паузу, чтобы не было бесконечного цикла.
      max_restarts: 5,
      restart_delay: 5000,
      env: { NODE_ENV: "development" },
      env_production: { NODE_ENV: "production" },
    },
  ],
}
