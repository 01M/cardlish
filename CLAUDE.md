# CLAUDE.md

## App overview

"Английские карточки" (`english-cards`) — an Expo/React Native English-vocabulary flashcard app
with spaced repetition. Users flip cards, grade them (`new` → `review` → `learned`), manage a
custom word list on top of a bundled FreeDict dictionary, get a daily study reminder, and track
per-status statistics. UI copy is Russian; identifiers and code are English.

## Tech stack

- **Expo SDK 57** (`expo ~57.0.28`) + **React Native 0.86** + **React 19.2**
- **Expo Router ~57** (`main: "expo-router/entry"`, `experiments.typedRoutes: true`) under `src/app/`
- **TypeScript ~6** with `strict: true`, path alias `@/* → ./src/*`
- **Package manager: npm** (`package-lock.json` present, no `bun.lock`)
- **expo-sqlite ~57** for the local on-device database (`english_cards.db`)
- **expo-notifications** for the daily reminder, **expo-speech** for pronunciation,
  **expo-constants**, **expo-font**, **expo-linking**, **expo-status-bar**
- **expo-system-ui** is installed so that `userInterfaceStyle: "automatic"` works on Android —
  no imports, but do not remove it
- **react-native-safe-area-context ~5.7** + **react-native-screens ~4.26**
- **@expo/vector-icons ^15** (Ionicons), **expo-haptics**, **expo-linear-gradient** (edge fades);
  animations use the built-in `Animated` API (react-native-reanimated is NOT used)
- **EAS Build/Submit** — profiles `development`, `preview`, `production` (see `eas.json`);
  all Android builds are APKs, `appVersionSource: "remote"`
- **Python helper** `scripts/convert-freedict.py` converts FreeDict TEI archives into
  `src/assets/dictionary.json` (build-time only, not part of the app runtime)
- Lint: `eslint` 9 + `eslint-config-expo` (`eslint.config.js`)
- Tests: `jest` 29 + `jest-expo` preset (`"jest"` key in `package.json`); jest types come from
  `"types": ["jest"]` in `tsconfig.json` (TS 6 no longer auto-includes `@types/*`)

## Layout

```
src/app/          Expo Router routes — THIN wrappers only
  _layout.tsx     Root: SafeAreaProvider, StatusBar, TopFade, DB init gate
  (tabs)/_layout.tsx  NativeTabs navigator (Учить / Повторение / Слова / Профиль)
  (tabs)/index.tsx   -> re-exports LearnScreen
  (tabs)/review.tsx  -> re-exports ReviewScreen
  (tabs)/words.tsx   -> re-exports WordsScreen
  (tabs)/profile.tsx -> re-exports ProfileScreen
  sources.tsx        -> re-exports SourcesScreen (root Stack, pushed from Profile)
src/screens/      Screen implementations (LearnScreen, ReviewScreen, WordsScreen, ProfileScreen, SourcesScreen)
src/data/         sources.json — attribution/licences of every shipped data source
src/components/   Shared UI (Button, PressableScale, FlipCard, FadeInView, WordFormModal, Confetti, TopFade, ListTopFade)
src/hooks/        Shared hooks (useReduceMotion)
src/theme/        tokens.ts (Theme type, lightTheme, darkTheme) + useTheme.ts (useColorSchemeName, useTheme, applyThemePreference)
src/db/           SQLite access + models (database.ts), schema/migration SQL + planMigration (schema.ts)
src/services/     Side-effectful services (notifications.ts)
src/utils/        alerts.ts (confirmResetProgress, showErrorAlert); pure, no React/DB:
                  reviewQueue.ts (mergeReviewQueue(prev, fresh)), sessionPlan.ts (getSessionPlan),
                  sources.ts (DataSource, parseSources, formatUrlForDisplay)
*.test.ts         Unit tests live next to the code they test (never under src/app/)
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
npm test                   # or: npx jest — unit tests (npx jest path/to/file for one file)
npx expo-doctor            # diagnose dependency/config issues
npx expo install <pkg>     # ALWAYS use for adding deps (SDK-compatible versions), never npm install
npx expo install --fix     # fix incompatible versions

# EAS (no local Xcode/Android Studio needed)
npx eas-cli@latest build --profile development|preview|production
npx eas-cli@latest build --profile development --platform android   # dev client with native modules
npx eas-cli@latest submit --profile production
```

`expo-notifications` needs a **development build** — Expo Go on Android crashes on import
(Since SDK 53 push notifications are stripped from Expo Go). `src/services/notifications.ts`
already lazy-`require`s the module behind an `isExpoGoAndroid` guard; keep that guard.

**Windows dev environment**
- If PowerShell blocks `npx.ps1`, call `npx.cmd` instead.
- Do not use Python for file edits (`python` resolves to the Windows Store stub); edit files with
  the editor tools.

## Workflow rules

- Keep edits scoped to the files named in the task.
- No dead code or leftover legacy after a migration — remove the old path in the same change.
- **Every new data source must be added to `src/data/sources.json` before its data ships**
  (title, author, version, https URLs, licence, what is used, what was changed; `noticeText` when
  the licence requires a full notice). `parseSources()` validates it and a test checks the real
  file; the "Источники и лицензии" screen shows it with no UI changes.
- Run `npx tsc --noEmit`, `npm run lint` and `npm test` before finishing.

## Testing

- Tests are `*.test.ts` files next to the code (e.g. `src/utils/reviewQueue.test.ts`). Never put
  them in `src/app/` — Expo Router would treat them as routes. Nothing imports them, so Metro does
  not bundle them.
- Tests only for pure logic (no React rendering, no snapshots, no component tests, no hand-written
  mocks of expo-sqlite or React Native internals). To make logic testable, extract it into a pure
  function (`src/utils/`, or an exported helper such as `splitStyle` in `PressableScale.tsx`).
- Schema and migration SQL (`src/db/schema.ts`) is tested against real SQLite via `node:sqlite`
  (`src/db/schema.test.ts`, `@jest-environment node`, `/// <reference types="node" />`). The rest
  of `src/db/database.ts` is verified by hand on a device.
- New scheduling logic (SRS: intervals, due dates, grading) must be written as pure functions with
  tests in the same change.

## Architectural rules

1. **Routes stay thin.** Never put screen logic in `src/app/`. A route file should only import a
   screen from `src/screens/` and export it (`export default LearnScreen;`). Layout files are the
   only place navigator configuration lives. Add new screens as
   `src/screens/XScreen.tsx` + a one-line route wrapper in `src/app/`.
2. **Shared UI goes to `src/components/`, shared hooks to `src/hooks/`.** If two screens need it,
   extract it; keep components presentational and prop-driven. Screen-local subcomponents (e.g.
   `StepperButton`, `SessionComplete` in `LearnScreen.tsx`) may stay in the screen file.
3. **Data access lives in `src/db/`.** All SQL, schema, migrations, and model types stay in
   `src/db/` — queries and model types in `database.ts`; schema/migration SQL strings and pure
   helpers in `schema.ts` (no expo-sqlite import, so they are tested on `node:sqlite`).
   Screens/services call exported async functions — never issue queries inline.
   The DB is opened once via `getDb()` (memoized promise; a failed open clears the memo so a retry
   reopens).
   - **Schema v2, versioned by `PRAGMA user_version` (= 2; v1 was 0).** `words` has `dict_key`
     (`term.trim().toLowerCase()`, UNIQUE, NULL for custom words —
     `CHECK ((is_custom = 1) = (dict_key IS NULL))`), `is_custom` 0/1 and `status` NOT NULL with
     CHECKs. `initDatabase()` reads the version and follows `planMigration(userVersion,
     hasWordsTable)`: `fresh` (create schema + seed + set version, one exclusive transaction),
     `upgrade-v1`, `current`, `too-new` (throws `DatabaseTooNewError`; the DB is not touched and
     the error screen says to update the app) or `unknown` (error screen).
   - Seeding: `dictionary.json` is `require`d lazily, only on the seeding path (fresh install, or
     an empty v1 table), and inserted with batched multi-row INSERTs (`buildSeedBatches`).
   - v1 → v2: first `VACUUM INTO` `english_cards.v1-backup.db` next to the DB (failure aborts the
     upgrade); then one exclusive transaction keeps ids, statuses and custom words, merges
     duplicate dictionary keys into the lowest id with the most advanced status, keeps the
     AUTOINCREMENT counter, and sets the version. Any error rolls back to the untouched v1 DB. The
     backup is deleted on the next launch that finds schema v2.
   - New schema changes: bump `SCHEMA_VERSION`, add a plan step + SQL in `schema.ts` with
     `node:sqlite` tests (`@jest-environment node` docblock), applied in one transaction.
   - Row type `Word`: `dict_key`/`transcription`/`example` are `string | null`; `status` is
     `"new" | "review" | "learned"`. `WordsStats` is exported and shared by Learn and Profile.
   - `getWordsStats()` is one query (`COUNT(CASE …)`), backed by index `idx_words_is_custom_status`.
   - `markWordAsReview()` only moves words that are still `'new'` (guards against a stale Learn
     session).
   - `resetDatabase()` runs in one exclusive transaction: deletes custom words and sets all
     remaining words to `'new'`. Dictionary rows are NOT re-seeded and keep their ids.
     `resetProgressOnly()` sets every word to `'new'` and keeps custom words.
   - Known limitation: the schema is versioned and dictionary words have a stable `dict_key`, but
     dictionary *content* updates (upsert by `dict_key` for existing installs) are not implemented
     yet — changing `dictionary.json` only affects fresh installs.
4. **React Native primitives only.** No HTML tags (`div`, `span`, `p`, `button`), no DOM APIs, no
   `tailwindcss`/`react-native-web` shortcuts. Use `View`/`Text`/`Pressable`/`FlatList`/
   `ScrollView`/`Modal` + `StyleSheet.create`. Keep list rendering virtualized (`FlatList`).
5. **Respect safe areas.** NativeTabs owns the tab bar and its insets — never add manual tab bar
   height. Follow "Navigation & insets" below; avoid hardcoded device assumptions and verify both
   iOS and Android.
6. **Styling conventions:** Keep styles in a `createStyles(theme)` factory at the bottom of the
   file, called once per screen via `const styles = useMemo(() => createStyles(theme), [theme])`;
   no inline style objects for anything non-trivial (dynamic values like progress-bar width or
   inset-derived padding are exempt). All colors come from the theme (see "Theming"). TextInputs
   use the theme's `placeholder` + `keyboardAppearance`. Use `StyleSheet.absoluteFill`
   (`absoluteFillObject` does not exist in RN 0.86).
7. **Navigation** via Expo Router only: `Link`, `router`, `useLocalSearchParams` from
   `expo-router`. Never pass non-serializable params (functions, DB handles).
8. **Branch switches in one synchronous block.** When a screen switches between branches
   (session / completion / setup), do the async work first (e.g. `await getWordsStats()`), then
   update all related state together with no `await` in between — otherwise a frame of the wrong
   branch flashes.

## UI conventions

**Navigation & insets**
- Tabs use NativeTabs (`expo-router/unstable-native-tabs`) in `src/app/(tabs)/_layout.tsx`.
- Scrolling tab screens rely on the automatic native inset: the screen's first ScrollView, or a
  `FlatList` with `contentInsetAdjustmentBehavior="automatic"` (WordsScreen). WordsScreen wraps
  its list in a `react-native-screens/experimental` `SafeAreaView` whose bottom edge is on only
  while the list is empty, so the empty state centers above the tab bar.
- ReviewScreen uses `SafeAreaView` from `react-native-screens/experimental` +
  `disableAutomaticContentInsets` on its trigger.
- Non-scrolling Learn states (session, completion, empty) set their own bottom padding from
  `insets.bottom` (`useSafeAreaInsets()`). Checked on iPhone; Android unverified.
- `/sources` (SourcesScreen) is the only screen with a native Stack header (configured in
  `src/app/_layout.tsx`: title, back title "Профиль", `pageBackground`/`textPrimary`, no shadow).
  It is opened from Profile's "О ПРИЛОЖЕНИИ" row (placed above "УПРАВЛЕНИЕ ДАННЫМИ" so the
  destructive buttons stay last); its ScrollView sets bottom padding from `insets.bottom`.
  Links there use `PressableScale` with `accessibilityRole="link"` and `Linking.openURL`
  (`showErrorAlert()` on failure).

**Buttons**
- Full-width text buttons use `Button` (`src/components/Button.tsx`): `label`, `onPress`,
  `variant` (`"primary"` default, `"secondary"`, `"ink"`, `"danger"`), `disabled` (opacity 0.6)
  and `style` for placement only (margins). One size for all: `minHeight` 54, padding 18×15,
  radius 16, stretches to full width, label 16/700 centered. Tokens: primary `orangeAccent` /
  `textOnAccent`; secondary transparent + 1px `secondaryButtonBorder` / `textButtonSecondary`;
  ink `buttonInk` / `textOnButtonInk`; danger `dangerBackground` / `dangerBorder` /
  `dangerText`. No icon, loading or haptics props — haptics stay in the press handlers.
  Do not add variants or sizes for one call site.
- Uses `Button`: all LearnScreen CTAs ("Начать сессию", "Далее" (ink), "Повторить", empty-state
  and completion buttons), the ReviewScreen empty state, the Words empty-state "Добавить слово",
  the root DB-error "Повторить" (`src/app/_layout.tsx`) and the Profile reset buttons
  ("Сбросить прогресс изучения" secondary, "Сбросить всё до начала" danger). Learn "Далее" does
  NOT pass `disabled`: the `isProcessing` guard in `handleNextWord` blocks double taps, and
  dimming would flash on every tap.
- Not migrated — deliberate exceptions, keep them as they are:
  - WordFormModal "Сохранить" (`TouchableOpacity`): the only indigo button (`indigoAccent`,
    dims to 0.6 while saving); its color is a separate design decision.
  - WordFormModal "Отмена" (`TouchableOpacity`): a text button with no fill or border.
  - Review "Не вспомнил"/"Вспомнил" (`PressableScale`): a matched grading pair laid out two
    across (flex 1, padding 10, 14/800); the success look has no other user.
  - Words header "Добавить" (`PressableScale`): compact with an icon — would need size and icon
    props for one call site.
  - Icon buttons — Learn session close, Words search clear, FlipCard speak (`TouchableOpacity`;
    speak is tied to FlipCard's `isSpeaking` flip guard) and `StepperButton` (`PressableScale`,
    0.92 scale, 0.35 dimming): icon-only, own sizes, labelled via `accessibilityLabel`.
  - Learn source toggle and Words filter chips (`PressableScale`): selectable controls with
    `accessibilityState={{ selected }}`; the toggle shares a sliding thumb.
  - Words per-card "Изменить"/"Удалить" (`TouchableOpacity`): inline links with tuned `hitSlop`.
- Other pressables use `PressableScale` (`src/components/PressableScale.tsx`, press-scale
  feedback; `Button` is built on it). Its `style` is split: placement/size props (`alignSelf`,
  `flex*`, width/height/min/max, margins, `position`, `display`) go to the outer `Pressable`,
  everything else to the inner `Animated.View` (exported `splitStyle`, tested).

**Edge fades**
- `TopFade` — status-bar scrim, rendered once in `src/app/_layout.tsx`.
- `ListTopFade` — top fade over the word list (WordsScreen).
- Both are `expo-linear-gradient` gradients built from `theme.pageBackground` (via `withAlpha`).

**Native UI, icons, haptics**
- Allowed: @expo/ui (e.g. SegmentedControl on Profile), expo-symbols, expo-haptics,
  @expo/vector-icons. RN `Alert` and `Switch` stay as they are. The PROGRESS reset (all words
  back to `'new'`, `resetProgressOnly()`) is confirmed only through `confirmResetProgress()`, and
  error alerts go only through `showErrorAlert()` (`src/utils/alerts.ts`) — no inline
  `Alert.alert` for these. The full database reset in Profile ("Удалить всё",
  `resetDatabase()`, deletes custom words) has its own dedicated confirmation dialog.
- Icons are Ionicons from @expo/vector-icons — never emoji or text glyphs.
- Haptics are fire-and-forget: `void Haptics.x().catch(() => {})`. Selection: FlipCard flip,
  Learn source toggle and session-size stepper, Profile reminder switch and theme setting.
  Light impact: Learn next card, Review "forgot". Success: Learn session complete, Review "remembered".

**Learn screen**
- Setup: sliding-thumb source toggle (two labels over one `Animated.View` thumb on
  `theme.orangeAccent`) + one merged plan card: stepper (`StepperButton`) + composition bar +
  legend + inline note ("Своих слов не хватает…", shown when the plan's `isOwnShort`; its
  "добавим N из словаря" is the plan's `dictionary`, same as the bar and legend, and is omitted
  when it is 0; text from `getPlanNoteText()`).
- The composition split mirrors what `getSessionWords()` will load — computed by the pure
  `getSessionPlan(source, sessionSize, stats)` (`src/utils/sessionPlan.ts`, tested), never new
  queries.
- Completion (`SessionComplete`): badge pop, `Confetti`, word count-up, success haptic.
- Empty state ("Новые слова закончились"): "Добавить слова" is a primary `Button`, "Сбросить
  прогресс" a secondary `Button` below it (goes through `confirmResetProgress()`).

**Review screen**
- On focus the queue is merged with the DB via `mergeReviewQueue()`: words still due keep their
  order and the current position, newly due words are appended, no-longer-due words are dropped.
  Only an empty queue is built from scratch (in the DB's random order).
- The card always returns to its front face on focus.

**Profile screen**
- On focus, before loading data, the reminders flag is synced with the OS
  (`isDailyReminderActive()`: permission granted + reminder scheduled). A stale flag is turned off
  silently (`console.error` on failure) and leftover scheduled reminders are cancelled; nothing is
  scheduled and no permission is requested.

**Components**
- `FlipCard`: fixed height 370; the back face content is in a `ScrollView` (tap flips, drag
  scrolls); the front term uses `numberOfLines` + `adjustsFontSizeToFit`.
- Big digits (Learn counter and stat strip, Profile numbers) set `maxFontSizeMultiplier`; the Words
  search field uses `minHeight`, not `height`.
- `WordFormModal` top padding comes from safe-area insets (min 24).

**Accessibility**
- `PressableScale` defaults to `accessibilityRole="button"`. Icon-only buttons need a Russian
  `accessibilityLabel`. Selectable controls (Learn source toggle, Words filter chips) set
  `accessibilityState={{ selected }}`. Small touch targets use `hitSlop` to reach 44pt.
- `FlipCard`: only the visible face is exposed to screen readers; each face has an invisible
  full-size button with the label and an `activate` action; speak buttons stay separately
  focusable, labelled "Произнести слово".
- TextInputs have an `accessibilityLabel`: the visible field name in `WordFormModal`, "Поиск слов"
  for the Words search.

## Motion

- Built-in `Animated` only (no reanimated); springs via `Animated.spring` (speed 18, bounciness 4),
  timings ~220 ms. `useNativeDriver: true` for transform/opacity, `false` for layout props.
- Respect reduce motion via the shared `useReduceMotion()` hook (`src/hooks/useReduceMotion.ts`,
  live: follows changes while the app is open; a late-mounted consumer starts from the last known
  value) — LearnScreen, ProfileScreen, FlipCard, PressableScale and FadeInView all use it; no
  local one-shot `isReduceMotionEnabled()` checks. When on, set final
  values directly instead of animating — except FlipCard, which replaces the 3D rotation with a
  200 ms opacity crossfade between the faces.
- First-load reveal: Learn, Review and Profile show only the page background until the first load
  completes, then fade the content in once with `FadeInView` (`src/components/FadeInView.tsx`,
  180 ms on mount). Learn and Review keep `FadeInView` at the same tree position in every
  post-load branch so focus reloads and branch switches do not replay it.
- `LayoutAnimation` is NOT used. Conditional UI animates its own height: the plan-card note uses an
  `overflow: "hidden"` wrapper, measured absolutely-positioned content, opacity interpolated from
  the height, and its row is remounted via `key` on visibility change so `onLayout` re-measures.

## Conventions observed in the codebase

- UI strings and comments are in Russian; code identifiers and function names use English.
  `console.error` messages are mixed (older ones Russian) — match the file you are editing.
- Async data loading uses `try/catch` (+ `finally` where a flag must flip) and local state flags
  (DB gate in `src/app/_layout.tsx`: `isReady` / `initFailed`). ProfileScreen: independent loads go
  through one `Promise.all`, an `isLoaded` flag gates the `FadeInView` content fade-in, and derived values
  come from `getWordsStats()` (totalCount = totalNew + review + learned).
- Loading/error states: the DB gate shows a spinner, and on failure "Не удалось открыть базу
  данных" + "Повторить". LearnScreen and ReviewScreen render only the page background until their first load
  completes; a failed first load shows an icon + "Не удалось загрузить данные" + "Повторить".
  Profile fades its content in even after a failed load (with `showErrorAlert()`); Words renders
  immediately and alerts on failure. Action handlers keep the previous state on
  failure and call `showErrorAlert()`.
- `FlipCard` has no internal reset: parents remount it via `key` (Learn: `word.id`; Review:
  `word.id` + a counter bumped on every queue advance or focus reload, so a repeated word still
  resets).
- Word lifecycle is a 3-state machine: `new` → `review` → `learned`, stored in
  `words.status`. Progress resets go through `resetProgressOnly()` / `resetDatabase()`.
- Comments in this repo are numbered section headers (`// 1. Инициализация базы данных`) — keep that
  style when adding functions to `src/db/database.ts`.

## Context protection

`.claudeignore` marks files that must not be read, indexed, or quoted unless the user explicitly
asks: `node_modules/`, `.git/`, `.expo/`, generated `ios/`+`android/`, `dist/`, `web-build/`,
`repomix-output.xml`, **`src/assets/dictionary.json`** (very large data file — access it only through
`src/db/database.ts`), image/font binaries, logs, and secrets.

## Theming

- All colors come from `src/theme/tokens.ts` (`Theme` type, `lightTheme`, `darkTheme`) through
  `useTheme()`. No hex/rgba/named color literals in screens or components. A new color role means
  a new key in the `Theme` interface plus light and dark values (text must reach at least 4.5:1
  contrast on the dark surfaces).
- An element using `buttonInk` as its background uses `textOnButtonInk` for its text.
- `orangeAccent` is `#D97706` in both themes and is only for fills (buttons, the Learn toggle
  thumb, the plan bar segment and legend dot), the tab bar tint and confetti. Orange TEXT or icons
  on surfaces use `amberAccent`. `textMutedHint` and `statAmber` no longer exist — use
  `textMuted` / `amberAccent`.
- White text on `#D97706` is ~3.2:1 — accepted consciously for bold button labels; do not "fix" it
  without asking.
- The scheme is decided in one place: `useColorSchemeName()` (`src/theme/useTheme.ts`).
- The user's appearance preference (System/Light/Dark, default System) is stored in `app_settings`
  and applied via `applyThemePreference()` before the app is shown (in the DB init flow).
  `userInterfaceStyle` in app.json is `"automatic"`.
