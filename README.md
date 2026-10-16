# Cardlish

Офлайн-приложение для заучивания английских слов по карточкам. Написано на Expo / React
Native, работает на Android и iOS. Сервера нет — словарь, прогресс и настройки хранятся в
SQLite на устройстве. Интерфейс на русском языке.

## Возможности

- **Учить.** Сессия новых слов: карточка переворачивается со слова на перевод и транскрипцию,
  слово можно прослушать. Размер сессии задаётся перед стартом, полоска показывает, сколько
  слов придёт из своего списка и сколько из словаря.
- **Разделы.** Новые слова берутся из выбранных разделов: свои слова, полосы частотности
  (1–500, 501–1 000, … 20 001+) и 21 тема — от «Еды и напитков» до «Путешествий». Разделы
  объединяются, слово из нескольких разделов попадает в сессию один раз.
- **Повторение.** Изученные слова отмечаются «Вспомнил» / «Не вспомнил».
- **Свои слова.** Список можно пополнять, редактировать и искать по нему.
- **Цель на день** (5–50 новых слов) и прогресс «Сегодня».
- **Напоминания** — до трёх в день, локальные уведомления без сервера. Когда цель на день
  выполнена, напоминаний в этот день больше нет; через неделю без запуска приложения они
  прекращаются сами.
- **Статистика** по статусам слов, светлая и тёмная тема, поддержка Reduce Motion и
  экранного диктора.

Слово проходит три состояния: `new` → `review` → `learned`. Интервального повторения (SRS) пока
нет.

## Встроенный словарь

34 965 карточек из англо-русского словаря [FreeDict](https://freedict.org/downloads/): только
отдельные слова (без имён собственных, выражений и пословиц), до пяти переводов на карточку,
транскрипция в американском произношении. Каждому слову присвоен ранг частотности по
[wordfreq](https://github.com/rspeer/wordfreq), темы построены по
[Open English WordNet](https://en-word.net/). Нецензурные и оскорбительные слова удалены, часть
карточек исправлена вручную.

Словарь собирается заранее Python-скриптами из `scripts/` и лежит в репозитории готовым
(`src/assets/dictionary.json`, `src/assets/topics.json`); для запуска приложения Python не нужен.

## Технологии

- Expo SDK 57, React Native 0.86, React 19.2, TypeScript (strict)
- Expo Router (вкладки — NativeTabs)
- expo-sqlite — локальная база данных
- expo-notifications, expo-speech, expo-haptics
- Jest + jest-expo, ESLint
- EAS Build для сборок
- Python 3.14 (`wordfreq`, `wn`) — только для сборки словаря

## Запуск

Нужны Node.js (сборки EAS используют 26.8.2) и npm.

```bash
git clone https://github.com/01M/english-cards.git
```

```bash
cd english-cards
```

```bash
npm install
```

```bash
npm start
```

Дальше откройте приложение в Expo Go по QR-коду или запустите эмулятор (`npm run android` /
`npm run ios`).

> **Уведомления в Expo Go на Android не работают** (начиная с SDK 53 модуль из Expo Go убран).
> Приложение это учитывает и просто отключает напоминания; чтобы их проверить, соберите APK
> (см. ниже).

## Проверки

```bash
npx tsc --noEmit
```

```bash
npm run lint
```

```bash
npm test
```

Тесты лежат рядом с кодом (`*.test.ts`). SQL-запросы схемы, синхронизации словаря и выборки
слов проверяются на настоящем SQLite через `node:sqlite`.

## Сборка

Сборки идут в облаке EAS, локальные Xcode и Android Studio не нужны.

```bash
npx eas-cli@latest build --profile preview --platform android
```

`preview` — APK для установки на телефон, `production` — AAB для Google Play.

## Структура проекта

```
src/app/          маршруты Expo Router — только тонкие обёртки над экранами
src/screens/      экраны: Учить, Повторение, Слова, Профиль, Разделы, Источники
src/components/   общие компоненты интерфейса
src/hooks/        общие хуки
src/db/           SQLite: схема, синхронизация словаря, запросы
src/services/     уведомления и планировщик напоминаний
src/utils/        чистая логика (план сессии, разделы, цель на день, расписание напоминаний)
src/theme/        цветовые токены светлой и тёмной темы
src/assets/       готовые данные словаря и тем
src/data/         sources.json — источники данных и их лицензии
scripts/          Python-конвейер сборки словаря и тем, ручные правки в scripts/data/
assets/           иконки и заставка
docs/             ARCHITECTURE.ru.md — подробный разбор устройства проекта
```

Подробнее об архитектуре — в [docs/ARCHITECTURE.ru.md](docs/ARCHITECTURE.ru.md).

## Пересборка словаря

Нужна только при изменении конвертера или ручных правок в `scripts/data/`. Исходный архив
`freedict-eng-rus-2025.11.23.src.tar.xz` скачивается с [freedict.org](https://freedict.org/downloads/)
и в репозиторий не входит. Команды для Windows:

```bash
py -V:3.14 -m venv scripts/.venv
```

```bash
scripts/.venv/Scripts/python.exe -m pip install -r scripts/requirements.txt
```

```bash
scripts/.venv/Scripts/python.exe scripts/convert_freedict.py <путь>/freedict-eng-rus-2025.11.23.src.tar.xz src/assets/dictionary.json
```

```bash
scripts/.venv/Scripts/python.exe scripts/build_topics.py src/assets/dictionary.json src/assets/topics.json
```

```bash
scripts/.venv/Scripts/python.exe -m unittest discover -s scripts -v
```

Результат детерминирован. `dictionary.json`, `topics.json` и `dictionary.version.json`
коммитятся вместе; при смене версии данных приложение обновит словарь у пользователей, не
трогая их прогресс.

## Источники данных и лицензии

| Источник | Что используется | Лицензия |
| --- | --- | --- |
| [FreeDict eng-rus](https://freedict.org/downloads/) 2025.11.23 (WikDict, данные Викисловаря) | слова, переводы, транскрипции | CC BY-SA 3.0 |
| [wordfreq](https://github.com/rspeer/wordfreq) 3.1.1 | порядок слов по частоте | данные — CC BY-SA 4.0 |
| [Open English WordNet](https://en-word.net/) 2025 | распределение слов по темам | CC BY 4.0; WordNet License |
| Ручные исправления карточек | правки переводов, транскрипций и тем | CC BY-SA 4.0 |

Встроенный словарь распространяется на условиях
[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/deed.ru). Полные сведения об
авторах, изменениях и тексты обязательных уведомлений — в
[src/data/sources.json](src/data/sources.json) и на экране «Источники и лицензии» в приложении
(Профиль → О приложении).
