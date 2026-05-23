# ✨ AI Assistant

Веб-приложение для общения с AI-моделями через Fireworks AI API. Работает полностью в браузере — без серверной части.

## 🌐 Демо

**[Открыть приложение](https://hardlevelov.github.io/ai-workspace/)**

## Возможности

- 💬 **Чат с AI** — стриминг ответов в реальном времени
- 🧠 **3 модели** — Qwen 3.6 Plus, DeepSeek V4 Pro, Kimi 2.6
- 📝 **Markdown** — рендеринг с подсветкой кода
- 💾 **История чатов** — сохраняется в localStorage браузера
- 🌙 **Тёмная и светлая тема**
- 📱 **Адаптивный дизайн** — работает на телефонах и планшетах
- 🔒 **Приватность** — API-ключ хранится только в вашем браузере

## Быстрый старт

1. Откройте приложение по ссылке выше
2. Нажмите **⚙️ Настройки** в боковой панели
3. Вставьте ваш API-ключ от [Fireworks AI](https://fireworks.ai)
4. Начните общение!

## Получение API-ключа

1. Зарегистрируйтесь на [fireworks.ai](https://fireworks.ai)
2. Перейдите в раздел API Keys
3. Создайте новый ключ и скопируйте его

## Локальный запуск

```bash
# Клонируйте репозиторий
git clone https://github.com/HardLevelov/ai-workspace.git
cd ai-workspace

# Откройте index.html в браузере или запустите локальный сервер
python3 -m http.server 8000
# Перейдите на http://localhost:8000
```

## Технологии

- Чистый HTML / CSS / JavaScript — без фреймворков
- [Marked.js](https://marked.js.org/) — рендеринг Markdown
- [Highlight.js](https://highlightjs.org/) — подсветка синтаксиса
- GitHub Pages — хостинг
- Fireworks AI API — AI-модели

## Структура

```
├── index.html          # Главная страница
├── css/style.css       # Стили (тёмная + светлая тема)
├── js/app.js           # Логика приложения
├── .github/workflows/  # Автодеплой на GitHub Pages
└── README.md
```
