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
- **@expo/vector-icons ^15** (Ionicons), **expo-haptics**, **expo-linear-gradient** (edge fades);
  animations use the built-in `Animated` API (react-native-reanimated is NOT used)
- **EAS Build/Submit/Update** — profiles `development`, `preview`, `production` (see `eas.json`);
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
   The DB is opened once via `getDb()` (memoized promise) and seeded from
   `src/assets/dictionary.json` on first launch.
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
  @expo/vector-icons. RN `Alert` and `Switch` stay as they are.
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

## Motion

- Built-in `Animated` only (no reanimated); springs via `Animated.spring` (speed 18, bounciness 4),
  timings ~220 ms. `useNativeDriver: true` for transform/opacity, `false` for layout props.
- Respect reduce motion via `useReduceMotion()` (`src/hooks/useReduceMotion.ts`) or the screen's
  existing `reduceMotion` state; when on, set values directly instead of animating.
- `LayoutAnimation` is NOT used. Conditional UI animates its own height: the plan-card note uses an
  `overflow: "hidden"` wrapper, measured absolutely-positioned content, opacity interpolated from
  the height, and its row is remounted via `key` on visibility change so `onLayout` re-measures.

## Conventions observed in the codebase

- UI strings and comments are in Russian; code identifiers, function names, and log messages use
  English. Match the file you are editing.
- Async data loading uses `try/catch/finally` + local `isLoading` state (see `src/app/_layout.tsx`
  for the DB gate pattern). ProfileScreen: independent loads go through one `Promise.all`, an
  `isLoaded` flag gates a ~180 ms content fade-in, and derived values come from
  `getWordsStats()` (totalCount = totalNew + review + learned).
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
- An element using `buttonInk` as its background uses `textOnButtonInk` for its text. Orange used
  as TEXT on dark ink surfaces uses `amberAccent`.
- The scheme is decided in one place: `useColorSchemeName()` (`src/theme/useTheme.ts`).
- The user's appearance preference (System/Light/Dark, default System) is stored in `app_settings`
  and applied via `applyThemePreference()` before the app is shown (in the DB init flow).
  `userInterfaceStyle` in app.json is `"automatic"`.
