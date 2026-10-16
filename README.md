<div align="center">

<img src="assets/icon.png" alt="Иконка Cardlish" width="128" height="128">

# Cardlish

**Английские слова по карточкам — офлайн, без регистрации и рекламы**

[![Скачать APK для Android](https://img.shields.io/badge/%D0%A1%D0%BA%D0%B0%D1%87%D0%B0%D1%82%D1%8C-APK%20%D0%B4%D0%BB%D1%8F%20Android-D97706?style=for-the-badge&logo=android&logoColor=white)](https://github.com/01M/cardlish/releases/latest)

[![Expo SDK 57](https://img.shields.io/badge/Expo-SDK%2057-000020?logo=expo&logoColor=white)](https://expo.dev)
[![React Native 0.86](https://img.shields.io/badge/React%20Native-0.86-61DAFB?logo=react&logoColor=black)](https://reactnative.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![SQLite](https://img.shields.io/badge/SQLite-offline-003B57?logo=sqlite&logoColor=white)](https://docs.expo.dev/versions/latest/sdk/sqlite/)
<br>
[![Release](https://img.shields.io/github/v/release/01M/cardlish?label=release&color=D97706)](https://github.com/01M/cardlish/releases/latest)
![Platforms](https://img.shields.io/badge/platforms-Android%20%7C%20iOS-D97706)
![Dictionary](https://img.shields.io/badge/dictionary-34%20965%20words-D97706)
[![Data licence](https://img.shields.io/badge/data-CC%20BY--SA%204.0-lightgrey)](#-источники-данных-и-лицензии)

[Возможности](#-возможности) •
[Словарь](#-встроенный-словарь) •
[Установка](#-установка) •
[Быстрый старт](#-быстрый-старт) •
[Разработка](#-разработка) •
[Лицензии](#-источники-данных-и-лицензии)

</div>

<!-- Скриншоты: положите PNG в docs/screenshots/ и раскомментируйте блок.
<p align="center">
  <img src="docs/screenshots/learn.png" width="200" alt="Учить">
  <img src="docs/screenshots/review.png" width="200" alt="Повторение">
  <img src="docs/screenshots/categories.png" width="200" alt="Разделы">
  <img src="docs/screenshots/profile.png" width="200" alt="Профиль">
</p>
-->

## 📖 О проекте

**Cardlish** — приложение для заучивания английских слов на Android и iOS. Внутри уже есть
англо-русский словарь на 34&nbsp;965 карточек с переводами, транскрипцией и произношением. Слова
идут от самых частых к редким, их можно выбирать по темам и добавлять свои.

Сервера нет: словарь, прогресс и настройки хранятся в SQLite на телефоне, интернет не нужен.
Интерфейс на русском.

## ✨ Возможности

<table>
<tr>
<td width="50%" valign="top">
<h4>📇 Учить</h4>
Карточка переворачивается со слова на перевод и транскрипцию, слово можно прослушать. Перед
стартом видно, сколько слов придёт из своего списка, а сколько из словаря.
</td>
<td width="50%" valign="top">
<h4>🗂️ Разделы</h4>
Свои слова, 8 полос частотности (1–500 … 20&nbsp;001+) и 21 тема. Слово из нескольких выбранных
разделов попадает в сессию один раз.
</td>
</tr>
<tr>
<td width="50%" valign="top">
<h4>🔁 Повторение</h4>
Изученные слова отмечаются «Вспомнил» или «Не вспомнил».
</td>
<td width="50%" valign="top">
<h4>✏️ Свои слова</h4>
Добавление, редактирование, удаление и поиск по списку.
</td>
</tr>
<tr>
<td width="50%" valign="top">
<h4>🎯 Цель на день</h4>
От 5 до 50 новых слов в день и прогресс «Сегодня» на главном экране.
</td>
<td width="50%" valign="top">
<h4>🔔 Напоминания</h4>
До трёх в день, без сервера. После выполненной цели в этот день не беспокоят.
</td>
</tr>
<tr>
<td width="50%" valign="top">
<h4>📊 Статистика</h4>
Сколько слов новых, на повторении и уже выучено.
</td>
<td width="50%" valign="top">
<h4>🌗 Удобство</h4>
Светлая и тёмная тема, экранный диктор, Reduce Motion, тактильный отклик.
</td>
</tr>
</table>

### Как слово проходит обучение

<p align="center">
<b>🆕 Новое</b> &nbsp;→&nbsp; <b>🔁 На повторении</b> &nbsp;→&nbsp; <b>✅ Выучено</b>
</p>

«Далее» в сессии отправляет слово на повторение, «Вспомнил» — в выученные. Интервального
повторения (SRS) пока нет — оно в планах.

## 📚 Встроенный словарь

- **34&nbsp;965 карточек** из англо-русского словаря [FreeDict](https://freedict.org/downloads/)
  (WikDict, данные Викисловаря): отдельные слова без имён собственных, выражений и пословиц.
- **До пяти переводов** на карточку и **транскрипция** в американском произношении.
- **Ранг частотности** по [wordfreq](https://github.com/rspeer/wordfreq) — сначала учатся самые
  употребительные слова.
- **21 тема** по [Open English WordNet](https://en-word.net/), проверенная вручную.
- Нецензурные и оскорбительные слова удалены, часть карточек исправлена вручную.

<details>
<summary><b>Все 21 тема</b></summary>
<br>

🍎 Еда и напитки · 🦊 Животные · 🌿 Растения · 🖐️ Части тела · 👕 Одежда и украшения ·
🏠 Дом и быт · 🚗 Транспорт и дороги · 💼 Профессии · 👨‍👩‍👧 Семья · 🎨 Цвета · ⏰ Время ·
⛅ Погода · 😊 Чувства и эмоции · 🩺 Здоровье и медицина · 🎓 Школа и учёба · ⚽ Спорт и игры ·
🎵 Музыка и танцы · 💰 Деньги и покупки · 💻 Техника и компьютеры · 🏔️ Природа и ландшафт ·
✈️ Путешествия

</details>

## 📲 Установка

Скачайте `cardlish-<версия>.apk` со страницы
[последнего релиза](https://github.com/01M/cardlish/releases/latest) и откройте его на телефоне.
Android попросит разрешить установку из этого источника. Нужен Android 7.0 или новее.

> [!WARNING]
> Это сборка вне Google Play. Если приложение появится в Play, перейти на ту версию можно будет
> только через удаление этой, и прогресс при этом не сохранится.

Версии для iOS пока нет: код её поддерживает, но сборка в App Store не выкладывалась.

## 🚀 Быстрый старт

Нужны [Node.js](https://nodejs.org) (сборки EAS используют 26.8.2) и npm.

```bash
git clone https://github.com/01M/cardlish.git
cd cardlish
npm install
npm start
```

Отсканируйте QR-код в [Expo Go](https://expo.dev/go) или запустите эмулятор: `npm run android`
/ `npm run ios`.

> [!NOTE]
> В Expo Go на Android уведомления не работают — начиная с SDK 53 модуль оттуда убран.
> Приложение просто отключает напоминания. Чтобы их проверить, соберите APK
> (см. [Сборка](#-сборка)).

## 🧰 Разработка

### Стек

- **Приложение:** Expo SDK 57 · React Native 0.86 · React 19.2 · TypeScript (strict)
- **Навигация:** Expo Router, нативные вкладки (NativeTabs)
- **Данные:** expo-sqlite, версия схемы в `PRAGMA user_version`
- **Устройство:** expo-notifications · expo-speech · expo-haptics
- **Качество:** Jest + jest-expo · ESLint
- **Сборка словаря:** Python 3.14 · wordfreq · wn (только при пересборке)

### Проверки

```bash
npx tsc --noEmit   # типы
npm run lint       # линтер
npm test           # тесты
```

Тесты лежат рядом с кодом (`*.test.ts`). SQL-запросы схемы, синхронизации словаря и выборки
слов проверяются на настоящем SQLite через `node:sqlite`.

### 📦 Сборка

Сборки идут в облаке [EAS](https://expo.dev/eas), локальные Xcode и Android Studio не нужны.

```bash
npx eas-cli@latest build --profile preview --platform android      # APK для телефона
npx eas-cli@latest build --profile production --platform android   # AAB для Google Play
```

### Структура проекта

<details>
<summary><b>Показать</b></summary>

```
src/
├── app/          маршруты Expo Router — только тонкие обёртки над экранами
├── screens/      экраны: Учить, Повторение, Слова, Профиль, Разделы, Источники
├── components/   общие компоненты интерфейса
├── hooks/        общие хуки
├── db/           SQLite: схема, синхронизация словаря, запросы
├── services/     уведомления и планировщик напоминаний
├── utils/        чистая логика: план сессии, разделы, цель на день, расписание
├── theme/        цветовые токены светлой и тёмной темы
├── assets/       готовые данные словаря и тем
└── data/         sources.json — источники данных и их лицензии
scripts/          Python-конвейер сборки словаря и тем, ручные правки в scripts/data/
assets/           иконки и заставка
docs/             подробный разбор архитектуры
```

</details>

Как всё устроено внутри — в [docs/ARCHITECTURE.ru.md](docs/ARCHITECTURE.ru.md).

### Пересборка словаря

Готовый словарь уже лежит в репозитории (`src/assets/dictionary.json`, `topics.json`), для
запуска приложения Python не нужен. Пересборка нужна только при изменении конвертера или
ручных правок в `scripts/data/`.

<details>
<summary><b>Команды (Windows)</b></summary>
<br>

Исходный архив `freedict-eng-rus-2025.11.23.src.tar.xz` скачивается с
[freedict.org](https://freedict.org/downloads/) и в репозиторий не входит.

```bash
py -V:3.14 -m venv scripts/.venv
scripts/.venv/Scripts/python.exe -m pip install -r scripts/requirements.txt

scripts/.venv/Scripts/python.exe scripts/convert_freedict.py <путь>/freedict-eng-rus-2025.11.23.src.tar.xz src/assets/dictionary.json
scripts/.venv/Scripts/python.exe scripts/build_topics.py src/assets/dictionary.json src/assets/topics.json

scripts/.venv/Scripts/python.exe -m unittest discover -s scripts -v
```

Результат детерминирован. `dictionary.json`, `topics.json` и `dictionary.version.json`
коммитятся вместе; при смене версии данных приложение обновит словарь у пользователей, не
трогая их прогресс.

</details>

## 📜 Источники данных и лицензии

| Источник | Что используется | Лицензия |
| --- | --- | --- |
| [FreeDict eng-rus](https://freedict.org/downloads/) 2025.11.23 | слова, переводы, транскрипции | CC BY-SA 3.0 |
| [wordfreq](https://github.com/rspeer/wordfreq) 3.1.1 | порядок слов по частоте | данные — CC BY-SA 4.0 |
| [Open English WordNet](https://en-word.net/) 2025 | распределение слов по темам | CC BY 4.0 · WordNet License |
| Ручные исправления карточек | правки переводов, транскрипций и тем | CC BY-SA 4.0 |

Встроенный словарь распространяется на условиях
[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/deed.ru). Авторы, список изменений
и тексты обязательных уведомлений — в [src/data/sources.json](src/data/sources.json) и на экране
**Профиль → Источники и лицензии** в приложении.

<div align="center">
<br>
<sub>Сделано с ☕ и <a href="https://expo.dev">Expo</a></sub>
<br><br>
<a href="#cardlish">↑ Наверх</a>
</div>
