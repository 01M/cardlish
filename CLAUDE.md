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

## Layout

```
src/app/          Expo Router routes — THIN wrappers only
  _layout.tsx     Root: SafeAreaProvider, StatusBar, TopFade, DB init gate
  (tabs)/_layout.tsx  NativeTabs navigator (Учить / Повторение / Слова / Профиль)
  (tabs)/index.tsx   -> re-exports LearnScreen
  (tabs)/review.tsx  -> re-exports ReviewScreen
  (tabs)/words.tsx   -> re-exports WordsScreen
  (tabs)/profile.tsx -> re-exports ProfileScreen
src/screens/      Screen implementations (LearnScreen, ReviewScreen, WordsScreen, ProfileScreen)
src/components/   Shared UI (PressableScale, FlipCard, WordFormModal, Confetti, TopFade, ListTopFade)
src/hooks/        Shared hooks (useReduceMotion)
src/theme/        tokens.ts (Theme type, lightTheme, darkTheme) + useTheme.ts (useColorSchemeName, useTheme, applyThemePreference)
src/db/           SQLite access + models (database.ts)
src/services/     Side-effectful services (notifications.ts)
src/utils/        alerts.ts (confirmResetProgress, showErrorAlert); reviewQueue.ts (pure
                  mergeReviewQueue(prev, fresh), no React/DB — first candidate for unit tests)
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
- Run `npx tsc --noEmit` and `npm run lint` before finishing.

## Architectural rules

1. **Routes stay thin.** Never put screen logic in `src/app/`. A route file should only import a
   screen from `src/screens/` and export it (`export default LearnScreen;`). Layout files are the
   only place navigator configuration lives. Add new screens as
   `src/screens/XScreen.tsx` + a one-line route wrapper in `src/app/`.
2. **Shared UI goes to `src/components/`, shared hooks to `src/hooks/`.** If two screens need it,
   extract it; keep components presentational and prop-driven. Screen-local subcomponents (e.g.
   `StepperButton`, `SessionComplete` in `LearnScreen.tsx`) may stay in the screen file.
3. **Data access lives in `src/db/`.** All SQL, schema, migrations, and model types stay in
   `src/db/database.ts`. Screens/services call exported async functions — never issue queries inline.
   The DB is opened once via `getDb()` (memoized promise; a failed open clears the memo so a retry
   reopens) and seeded from `src/assets/dictionary.json` only when the `words` table is empty.
   - Row type `Word`: `transcription`/`example` are `string | null`; `status` is
     `"new" | "review" | "learned"`. `WordsStats` is exported and shared by Learn and Profile.
   - `getWordsStats()` is one query (`COUNT(CASE …)`), backed by index `idx_words_is_custom_status`.
   - `markWordAsReview()` only moves words that are still `'new'` (guards against a stale Learn
     session).
   - `resetDatabase()` runs in one exclusive transaction: deletes custom words and sets all
     remaining words to `'new'`. Dictionary rows are NOT re-seeded and keep their ids.
     `resetProgressOnly()` sets every word to `'new'` and keeps custom words.
   - Known limitation: no schema versioning (no `user_version`/migrations), and dictionary words
     have no stable key besides the autoincrement `id`. Before changing the bundled dictionary,
     add versioning plus a stable key.
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
  `FlatList` with `contentInsetAdjustmentBehavior="automatic"` (WordsScreen).
- ReviewScreen uses `SafeAreaView` from `react-native-screens/experimental` +
  `disableAutomaticContentInsets` on its trigger.
- Non-scrolling Learn states (session, completion, empty) set their own bottom padding from
  `insets.bottom` (`useSafeAreaInsets()`). Checked on iPhone; Android unverified.

**Buttons**
- Main buttons use `PressableScale` (`src/components/PressableScale.tsx`, press-scale feedback)
  instead of `TouchableOpacity`. Its `style` is split: placement/size props (`alignSelf`, `flex*`,
  width/height/min/max, margins, `position`, `display`) go to the outer `Pressable`, everything
  else to the inner `Animated.View`.
- Not yet migrated (`TouchableOpacity`): WordsScreen per-card "Изменить"/"Удалить" links (intentional),
  search clear button and empty-state "Добавить слово"; LearnScreen session close button;
  FlipCard speak buttons; WordFormModal "Сохранить"/"Отмена".

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
  legend + inline note ("Своих слов не хватает…", shown when `missingCustomCount > 0`).
- The composition split mirrors what `getSessionWords()` will load — derive counts only from
  `sessionSize`, `stats` and `source`, never new queries.
- Completion (`SessionComplete`): badge pop, `Confetti`, word count-up, success haptic.
- Empty state ("Новые слова закончились"): "Добавить слова" is the orange primary, "Сбросить
  прогресс" the outlined secondary below it (goes through `confirmResetProgress()`).

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
  live: follows changes while the app is open) — LearnScreen, ProfileScreen, FlipCard and
  PressableScale all use it; no local one-shot `isReduceMotionEnabled()` checks. When on, set final
  values directly instead of animating — except FlipCard, which replaces the 3D rotation with a
  200 ms opacity crossfade between the faces.
- `LayoutAnimation` is NOT used. Conditional UI animates its own height: the plan-card note uses an
  `overflow: "hidden"` wrapper, measured absolutely-positioned content, opacity interpolated from
  the height, and its row is remounted via `key` on visibility change so `onLayout` re-measures.

## Conventions observed in the codebase

- UI strings and comments are in Russian; code identifiers and function names use English.
  `console.error` messages are mixed (older ones Russian) — match the file you are editing.
- Async data loading uses `try/catch` (+ `finally` where a flag must flip) and local state flags
  (DB gate in `src/app/_layout.tsx`: `isReady` / `initFailed`). ProfileScreen: independent loads go
  through one `Promise.all`, an `isLoaded` flag gates a ~180 ms content fade-in, and derived values
  come from `getWordsStats()` (totalCount = totalNew + review + learned).
- Loading/error states: the DB gate shows a spinner, and on failure "Не удалось открыть базу
  данных" + "Повторить". LearnScreen renders only the page background until its first load
  completes; a failed first load shows an icon + "Не удалось загрузить данные" + "Повторить".
  Profile fades its content in even after a failed load (with `showErrorAlert()`); Review and
  Words render immediately and alert on failure. Action handlers keep the previous state on
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
