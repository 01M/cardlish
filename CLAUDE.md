# CLAUDE.md

## App overview

"Английские карточки" (`english-cards`) — an Expo/React Native English-vocabulary flashcard app
with spaced repetition. Users flip cards, grade them (`new` → `review` → `learned`), manage a
custom word list on top of a bundled FreeDict dictionary, get a daily study reminder, and track
per-status statistics. UI copy is Russian; identifiers and code are English.

## Tech stack

- **Expo SDK 57** (`expo ~57.0.26`) + **React Native 0.86** + **React 19.2**
- **Expo Router ~57** (`main: "expo-router/entry"`, `experiments.typedRoutes: true`) under `src/app/`
- **TypeScript ~6** with `strict: true`, path alias `@/* → ./src/*`
- **Package manager: npm** (`package-lock.json` present, no `bun.lock`)
- **expo-sqlite ~57** for the local on-device database (`english_cards.db`)
- **expo-notifications** for the daily reminder, **expo-speech** for pronunciation,
  **expo-constants**, **expo-font**, **expo-linking**, **expo-status-bar**
- **react-native-safe-area-context ~5.7** + **react-native-screens ~4.26**
- **EAS Build/Submit/Update** — profiles `development`, `preview`, `production` (see `eas.json`);
  all Android builds are APKs, `appVersionSource: "remote"`
- **Python helper** `scripts/convert-freedict.py` converts FreeDict TEI archives into
  `src/assets/dictionary.json` (build-time only, not part of the app runtime)
- Lint: `eslint` 9 + `eslint-config-expo` (`eslint.config.js`)

## Layout

```
src/app/          Expo Router routes — THIN wrappers only
  _layout.tsx     Root: SafeAreaProvider, StatusBar, DB init gate
  (tabs)/_layout.tsx  Tabs navigator (Учить / Повторение / Слова / Профиль)
  (tabs)/index.tsx   -> re-exports LearnScreen
  (tabs)/review.tsx  -> re-exports ReviewScreen
  (tabs)/words.tsx   -> re-exports WordsScreen
  (tabs)/profile.tsx -> re-exports ProfileScreen
src/screens/      Actual screen implementations (LearnScreen, ReviewScreen, WordsScreen, ProfileScreen)
src/components/   Reusable UI (FlipCard, WordFormModal)
src/db/           SQLite access + models (database.ts)
src/services/     Side-effectful services (notifications.ts)
src/assets/       dictionary.json (large, git-tracked, never read it)
scripts/          Python tooling
assets/           App icons / splash
```

## Commands

```bash
npm start                  # or: npx expo start   — dev server
npm run ios / android / web
npm run lint               # or: npx expo lint
npx tsc --noEmit           # typecheck
npx expo-doctor            # diagnose dependency/config issues
npx expo install <pkg>     # ALWAYS use for adding deps (SDK-compatible versions), never npm install
npx expo install --fix     # fix incompatible versions

# EAS (no local Xcode/Android Studio needed)
npx eas-cli@latest build --profile development|preview|production
npx eas-cli@latest build --profile development --platform android   # dev client with native modules
npx eas-cli@latest submit --profile production
npx eas-cli@latest update --branch production
```

`expo-notifications` needs a **development build** — Expo Go on Android crashes on import
(Since SDK 53 push notifications are stripped from Expo Go). `src/services/notifications.ts`
already lazy-`require`s the module behind an `isExpoGoAndroid` guard; keep that guard.

## Architectural rules

1. **Routes stay thin.** Never put screen logic in `src/app/`. A route file should only import a
   screen from `src/screens/` and export it (`export default LearnScreen;`). Layout files are the
   only place navigator configuration lives. Add new screens as
   `src/screens/XScreen.tsx` + a one-line route wrapper in `src/app/`.
2. **Shared UI goes to `src/components/`.** If two screens need it, extract it; keep components
   presentational and prop-driven.
3. **Data access lives in `src/db/`.** All SQL, schema, migrations, and model types stay in
   `src/db/database.ts`. Screens/services call exported async functions — never issue queries inline.
   The DB is opened once via `getDb()` (memoized promise) and seeded from
   `src/assets/dictionary.json` on first launch.
4. **React Native primitives only.** No HTML tags (`div`, `span`, `p`, `button`), no DOM APIs, no
   `tailwindcss`/`react-native-web` shortcuts. Use `View`/`Text`/`Pressable`/`FlatList`/
   `ScrollView`/`Modal` + `StyleSheet.create`. Keep list rendering virtualized (`FlatList`).
5. **Respect safe areas on mobile.** Wrap screens in `SafeAreaView` / use
   `useSafeAreaInsets()` from `react-native-safe-area-context` for headers, footers, and the tab bar
   (`height: 58 + insets.bottom`, `paddingBottom: Math.max(insets.bottom, 8)`). Avoid hardcoded
   device assumptions and verify both iOS and Android.
6. **Styling conventions:** `StyleSheet.create` at the bottom of the file, warm neutral palette
   (`#FAFAFA` background, `#D97706` accent, `#FFFDF8` surface, `#E8E3D7` borders, `#374151`/
   `#8A938F` text). No inline style objects for anything non-trivial.
7. **Navigation** via Expo Router only: `Link`, `router`, `useLocalSearchParams` from
   `expo-router`. Never pass non-serializable params (functions, DB handles).

## Inherited rules from AGENTS.md (must be preserved)

- **Mobile-first**, performance- and cross-platform-conscious. Expo/React Native app; keep changes
  safe on iOS and Android.
- **Do not trust training data on Expo.** Before writing code that touches an Expo, EAS, or RN API:
  1. read the `expo` major version in `package.json` (currently **57**),
  2. fetch `https://docs.expo.dev/versions/v<major>.0.0/` (i.e. `v57.0.0`),
  3. otherwise use `https://docs.expo.dev/llms.txt`, which indexes Expo docs and corrects common
     LLM misconceptions, and follow its links. Never answer Expo API questions from memory.
- **Prefer recommended Expo modules** over third-party libraries; check available skills before
  adding dependencies.
- **`ios/` and `android/` are generated** (Continuous Native Generation). Never create or edit them by
  hand — configure native behavior in `app.json` and config plugins.
- **Adding a native module requires a development build** (`npx expo run:ios|android` or
  `eas build --profile development`); Expo Go will not include it.
- **Run lint and typecheck before declaring any task done.**
- EAS CLI is invoked as `npx eas-cli@latest <command>` in npm projects (this repo has no
  `bun.lock`, so `bunx` does not apply).
- Expo Router docs: https://docs.expo.dev/router/introduction.md · EAS docs:
  https://docs.expo.dev/eas/index.md

## Conventions observed in the codebase

- UI strings and comments are in Russian; code identifiers, function names, and log messages use
  English. Match the file you are editing.
- Async data loading uses `try/catch/finally` + local `isLoading` state (see `src/app/_layout.tsx`
  for the DB gate pattern).
- Word lifecycle is a 3-state machine: `new` → `review` → `learned`, stored in
  `words.status`. Progress resets go through `resetProgressOnly()` / `resetDatabase()`.
- Comments in this repo are numbered section headers (`// 1. Инициализация базы данных`) — keep that
  style when adding functions to `src/db/database.ts`.

## Context protection

`.claudeignore` marks files that must not be read, indexed, or quoted unless the user explicitly
asks: `node_modules/`, `.git/`, `.expo/`, generated `ios/`+`android/`, `dist/`, `web-build/`,
`repomix-output.xml`, **`src/assets/dictionary.json`** (very large data file — access it only through
`src/db/database.ts`), image/font binaries, logs, and secrets. Run `npx repomix` into
`repomix-output.xml` for whole-repo snapshots rather than reading files individually.