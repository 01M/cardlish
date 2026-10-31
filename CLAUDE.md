# CLAUDE.md

## App overview

"Cardlish" (`cardlish`) — an Expo/React Native English-vocabulary flashcard app
with a three-state word flow (`new` → `review` → `learned`) and a simple review queue (no
intervals or due dates yet). Users flip cards, move words through those states, manage a
custom word list on top of a bundled FreeDict dictionary, get up to three daily study reminders, and track
per-status statistics. UI copy is Russian; identifiers and code are English.

**Name and identifiers:** the user-visible brand "Cardlish" (`app.json` `"name"`: launcher
label, iOS display name; the author of the `manual-corrections` entry in
`src/data/sources.json`) and all technical identifiers match: `android.package` /
`ios.bundleIdentifier` `com.cardlish.app`, `slug` `cardlish`, `scheme` `cardlish`, the DB file
`cardlish.db`, `package.json` `"name"` `cardlish`. They were aligned before the first store
publication. **After the first store publication never rename** the package id / bundle
identifier (a new id is a new app in the stores), the EAS `extra.eas.projectId` (it links the
EAS project and its build history) or the DB file name (a new name orphans installed users'
data).

## Tech stack

- **Expo SDK 58** (`expo ~58.0.22`) + **React Native 0.88** + **React 19.3**; RN's Strict
  TypeScript API is on (refs use instance types such as `ScrollViewInstance`, style types are
  read-only)
- **Expo Router ~58** (`main: "expo-router/entry"`, `experiments.typedRoutes: true`) under `src/app/`;
  hrefs are checked by tsc against the gitignored `.expo/types/router.d.ts`. After adding a
  route without running the dev server, regenerate it with Expo's own generator:
  `EXPO_ROUTER_APP_ROOT="$(pwd -W)/src/app" node -e "require('./node_modules/@expo/router-server/build/typed-routes').regenerateDeclarations('.expo/types')"`
  (Git Bash; a running `expo start` also rewrites it and may add bogus `/../…` entries for
  files outside `src/app` — regenerate if you see them)
- **TypeScript ~6** with `strict: true`, path alias `@/* → ./src/*`
- **Package manager: npm** (`package-lock.json` present, no `bun.lock`)
- **expo-sqlite ~58** for the local on-device database (`cardlish.db`)
- **expo-notifications** for the study reminders (one-shot local notifications, see "Reminders"), **expo-speech** for pronunciation,
  **expo-constants**, **expo-font**, **expo-linking**, **expo-status-bar**
- **expo-splash-screen ~58** — the only way to keep the native splash up until the DB is ready
  (`preventAutoHideAsync` / `hideAsync`) and to configure it via its config plugin; see "App
  icon, notification icon and splash screen"
- **expo-system-ui** is installed so that `userInterfaceStyle: "automatic"` works on Android —
  no imports, but do not remove it
- **react-native-safe-area-context ~5.10** + **react-native-screens ~4.30**
- **expo-symbols ~58** — no imports; since SDK 58 an optional peer of expo-router that
  `NativeTabs.Trigger.Icon`'s `md` prop needs on Android (tab icons); do not remove it
- **@expo/vector-icons ^15** (Ionicons), **expo-haptics**, **expo-linear-gradient** (edge fades);
  animations use the built-in `Animated` API (react-native-reanimated is NOT used)
- **react-native-reanimated** and **react-native-worklets** are not app dependencies: npm
  auto-installs them only as peers (of react-native-drawer-layout, a dependency of expo-router;
  worklets also of expo-modules-core and @expo/ui), and they are autolinked into the Android build. The app does not use them — never import them
  and do not add them to `package.json`.
- **EAS Build/Submit** — two build profiles in `eas.json`: `preview` (APK, internal
  distribution, `autoIncrement`) and `production` (app-bundle / AAB for Google Play,
  `autoIncrement`); `appVersionSource: "remote"`. There is NO `development` profile —
  expo-dev-client is not installed, development runs in Expo Go. Both profiles pin `"node"` to
  the local Node version (see "EAS Node pin" under Commands).
- **Dictionary pipeline (Python, build-time only)** `scripts/convert_freedict.py` converts the
  FreeDict eng-rus TEI archive into `src/assets/dictionary.json` and adds a wordfreq frequency
  `rank`; venv in `scripts/.venv` (gitignored), deps pinned in `scripts/requirements.txt`
  (`wordfreq==3.1.1`), stdlib `unittest` tests in `scripts/test_convert_freedict.py`. See
  "Dictionary pipeline" under Commands. `scripts/build_topics.py` (`wn==1.1.1`) derives topic
  membership (`src/assets/topics.json`) from Open English WordNet — see "Topic pipeline". Both
  scripts end by rewriting the shared data version through `scripts/data_version.py`.
- Lint: `eslint` 9 + `eslint-config-expo` (`eslint.config.js`)
- Tests: `jest` 30 + `jest-expo` preset (`"jest"` key in `package.json`); jest types come from
  `"types": ["jest"]` in `tsconfig.json` (TS 6 no longer auto-includes `@types/*`)

## Layout

```
src/app/          Expo Router routes — THIN wrappers only
  _layout.tsx     Root: SafeAreaProvider, StatusBar, TopFade, DB init gate, native splash hide
  (tabs)/_layout.tsx  NativeTabs navigator (Учить / Повторение / Слова / Профиль)
  (tabs)/index.tsx   -> re-exports LearnScreen
  (tabs)/review.tsx  -> re-exports ReviewScreen
  (tabs)/words.tsx   -> re-exports WordsScreen
  (tabs)/profile.tsx -> re-exports ProfileScreen
  sources.tsx        -> re-exports SourcesScreen (root Stack, pushed from Profile)
  categories.tsx     -> re-exports CategoriesScreen (root Stack full-screen modal, opened from Learn)
src/screens/      Screen implementations (LearnScreen, ReviewScreen, WordsScreen, ProfileScreen, SourcesScreen,
                  CategoriesScreen)
src/data/         sources.json — attribution/licences of every shipped data source
src/components/   Shared UI (Button, PressableScale, StepperButton, FlipCard, FadeInView, WordFormModal, Confetti, TopFade, ListTopFade,
                  TimePickerModal, TimeWheel (+ .ios))
src/hooks/        Shared hooks (useReduceMotion, useReminderReplan)
src/theme/        tokens.ts (Theme type, lightTheme, darkTheme) + useTheme.ts (useColorSchemeName, useTheme, applyThemePreference)
                  + tokens.test.ts (app.json splash / notification colours = tokens)
src/db/           SQLite access + models (database.ts), schema/migration SQL + planMigration (schema.ts),
                  dictionary + topic sync SQL + pure helpers (dictionarySync.ts), Learn section
                  SQL (categoryQueries.ts), status changes + daily progress + goal + reset SQL
                  (progressQueries.ts), schema.v5.snapshot.json (fresh-schema guard for schema.test.ts)
src/services/     Side-effectful services: notifications.ts (expo-notifications behind the Expo Go
                  guard, permission, the wired `replanReminders`), reminders.ts (replan adapter
                  factory `createReminderReplanner(deps)`, no runtime expo/DB imports, tested)
src/utils/        alerts.ts (confirmResetProgress, showErrorAlert); pure, no React/DB:
                  reviewQueue.ts (mergeReviewQueue(prev, fresh)), sessionPlan.ts (getSessionPlan),
                  sources.ts (DataSource, parseSources, formatUrlForDisplay),
                  categories.ts (section registry: band + topic tables, groups, selection, SQL
                  filters, labels),
                  dailyGoal.ts (toLocalDay, goal parse/clamp/step, "Сегодня" labels),
                  plural.ts (pluralRu), reminderTimes.ts (reminder_times parse/validate/serialise,
                  list edits), reminderPlan.ts (planReminders: rolling window + texts)
*.test.ts         Unit tests live next to the code they test (never under src/app/)
src/assets/       dictionary.json (large, generated, git-tracked, never read it), topics.json
                  (generated topic membership, synced into word_topics) + topics.test.ts (guard),
                  dictionary.version.json (data version over both, generated) + dictionary.test.ts
                  (shape + version guard)
scripts/          Python pipelines: convert_freedict.py, build_topics.py, data_version.py (shared
                  version writer), their tests, requirements.txt, data/ (card_overrides.json,
                  excluded_terms.json, topic_overrides.json), .venv/ and .wn_data/ (gitignored)
assets/           Final artwork, never regenerate: icon.png (1024, opaque app icon),
                  android-icon-background/foreground/monochrome.png (adaptive icon layers),
                  notification-icon.png (96×96 white on transparent, Android notification small
                  icon), splash-icon.png (1024 RGBA, ~640 px rounded square centred), favicon.png
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
npx eas-cli@latest build --profile preview --platform android      # APK for testing
npx eas-cli@latest build --profile production --platform android   # AAB for Google Play
npx eas-cli@latest submit --profile production
```

**EAS Node pin:** `preview` and `production` set `"node"` (currently `"26.12.1"`) to the local
Node version, so EAS runs the same bundled npm as the machine that generated
`package-lock.json`. EAS's default image can ship an older npm (on SDK 57 it was npm 10.9.x),
whose `npm ci` rejects our npm-11 lock file ("Missing: react-native-worklets@0.10.4 from lock
file"). Whenever the lock
file is regenerated or the local Node major changes: update the pin, run
`npm ci --ignore-scripts --dry-run` under the Node version pinned in `eas.json` (it must pass),
and check the "Install dependencies" step of the next EAS build log before relying on it.

**Dictionary pipeline** (run from the repo root; Python via the `py` launcher, not bare `python`):

```bash
py -V:3.14 -m venv scripts/.venv                                        # once
scripts/.venv/Scripts/python.exe -m pip install -r scripts/requirements.txt
scripts/.venv/Scripts/python.exe scripts/convert_freedict.py <path>/freedict-eng-rus-2025.11.23.src.tar.xz src/assets/dictionary.json
scripts/.venv/Scripts/python.exe -m unittest discover -s scripts -v     # Python tests
```

- Source archive: `freedict-eng-rus-2025.11.23.src.tar.xz` from https://freedict.org/downloads/
  (not in the repo). The output is deterministic (LF line endings) — regenerating must not change
  the file unless the converter or its inputs changed.
- **Data version** `src/assets/dictionary.version.json` (`{ "version": … }`): the first 16 hex
  chars of sha256 over the LF-normalised bytes of `dictionary.json`, then a single `"\n"`, then
  the LF-normalised bytes of `topics.json`. One shared writer, `scripts/data_version.py`
  (`write_data_version`), is called at the end of BOTH `convert_freedict.py` and
  `build_topics.py`, each using the other file as it currently exists (a missing file fails
  loudly; `convert_freedict.py` reads the `topics.json` next to its output). The app syncs words
  and topics when this value changes. Workflow: run the script(s) → commit `dictionary.json`,
  `topics.json` and `dictionary.version.json` together. The jest guard in
  `src/assets/dictionary.test.ts` (and the Python test `test_data_version.py`) recomputes the
  hash and fails ("rerun …") when they diverge — never edit any of them by hand.
- Converter rules: eligible entries have a single-word headword (`^[A-Za-z][A-Za-z'-]*$`), a
  TEI part of speech among `n v adj adv pronoun preposition postposition conjunction determiner
  numeral interjection particle` (excluded: `pn`, `prefix`, `suffix`, `phraseologicalunit`,
  `proverb`, `symbol`, none) and at least one Russian translation after wiki-link cleanup.
  Entries are grouped by lowercase headword; if a group has a lowercase-spelled entry, its
  capitalised entries are dropped. One card per group: translations round-robin across the
  group's entries, deduped (NFC, stress mark U+0301 ignored, stressed variant kept), capped at
  5; transcription chosen by `ACCENT_PREFERENCE` (module constant, General American only: the
  first pronunciation labelled `GA` or `GenAm` in its TEI `<a:…>` annotation, lists like
  `RP,GA` included, else the first non-empty one), then cut at `<`.
- Transcription convention — **General American**, phonemic `/…/`; every hand-written
  transcription follows it: `ɹ` for r, `ɡ` (U+0261), no length marks (`/i/ /u/ /ɔ/`), `oʊ` for
  GOAT, `ɑ` for PALM/START (`/stɑɹt/`), `ɝ`/`ɚ`, `ʌ`, `ɛ`; `ˈ` before the stressed syllable of
  multi-syllable words only; no syllable dots, parentheses, hyphens or off-glide marks; affricates
  tied (`t͡ʃ`, `d͡ʒ`) as in most generated entries. Ranks 1–300 conform (via overrides); the rest
  of the dictionary still has mixed source notation (dots, parentheses, length marks, British
  vowels) — a converter-level normalisation is not implemented.
- Order of the build: cards → `apply_exclusions` → `assign_ranks` → `apply_overrides`. Rank is
  computed from the generated cards that survive the exclusions, so ranks stay unique and dense
  1..N, and an override (even a `term` change such as i → I) never changes a rank.
- **Excluded terms** (offensive vocabulary, removed from the dictionary entirely — no opt-in
  section) live in `scripts/data/excluded_terms.json` (UTF-8, LF, one `{ "key", "reason" }` per
  line; 156 keys: profanity, slurs, abusive insults, explicit sexual acts / sex toys / porn,
  obsolete racial typology). Ordinary words whose translation only had a crude item keep the
  card and get a `card_overrides.json` entry without it. The build fails loudly, listing every
  problem, on: unknown key (not produced by the converter), duplicate key, empty reason, unknown
  fields, a key that is also in `card_overrides.json`. A removed key must also disappear from
  `topic_overrides.json` (`build_topics.py` fails on unknown keys); `src/assets/topics.test.ts`
  checks that no excluded key is in `dictionary.json` or `topics.json`. Update the removed-word
  count in the `manual-corrections` entry of `src/data/sources.json` (a Python test checks it).
  Installed apps lose a removed word on the next sync only if it is still `'new'`.
- **Hand corrections** live in `scripts/data/card_overrides.json` (UTF-8, LF, one object per
  line): `{ "key", "translations"?, "transcription"?, "term"?, "reason" }`. To correct a card,
  add an object keyed by the lowercase `term`, giving only the fields to replace: `translations`
  is a list of 1..5 items (most common meaning first, stress marks only where sure, no slang,
  vulgar, archaic or jargon items; at most one grammatical function as one parenthesised item
  without a comma, e.g. "(родительный падеж)"); `transcription` in General American (convention below); `term` only to change
  the case of the spelling. Then regenerate and update the counts in the `manual-corrections`
  entry of `src/data/sources.json` (a Python test checks them). The build fails loudly, listing
  every problem at once, on: unknown key, duplicate key, an override identical to the generated
  card (stale), a `term` whose lowercase differs from the key, an empty `reason`, unknown
  fields, nothing to override, translations that are not 1..5 trimmed items or contain
  duplicates (stress ignored), an empty transcription.
- JSON shape: array of `{ term, translation, transcription, example, rank }`, one entry per
  lowercase `term` (= `dict_key`), in the order of each group's first eligible source entry.
  Row ids are assigned by the sync and are not stable across installs and dictionary updates —
  match dictionary rows only by `dict_key`, never by id. `translation`: items joined with ", "
  (an item may itself contain ", "); `transcription`: IPA or ""; `example`: always "";
  `rank`: 1..N unique — group 1 (`^[a-z]+$` with non-zero wordfreq `large` frequency) before
  group 2 (everything else); within a group frequency descending, then lowercase term.
  `src/assets/dictionary.test.ts` guards the shape; the item cap and dedupe are covered by the
  Python tests (they work on real item lists).

**Topic pipeline** (`scripts/build_topics.py`; same venv, `wn==1.1.1` from requirements.txt):

```bash
scripts/.venv/Scripts/python.exe scripts/build_topics.py src/assets/dictionary.json src/assets/topics.json
scripts/.venv/Scripts/python.exe scripts/build_topics.py src/assets/dictionary.json src/assets/topics.json --review <scratch>/review.txt
```

- Data: Open English WordNet 2025 (`oewn:2025`, hierarchy + sense order) and `omw-en:2.0`
  (Princeton WordNet 3.0, only its SemCor sense counts). The `wn` package downloads both into
  the gitignored cache `scripts/.wn_data/` (also in `.claudeignore`); first
  run: `wn.config.data_directory = 'scripts/.wn_data'; wn.download('oewn:2025');
  wn.download('omw-en:2.0')`. A build takes ~1.5 min.
- Output `src/assets/topics.json`: `{ "<slug>": ["<dict_key>", …] }`, slugs in `TOPICS` order,
  keys sorted, LF, one key per line; deterministic (two runs are byte-identical). The run ends by
  rewriting the data version (see above). The app syncs it into `word_topics` (see "Dictionary
  sync") and offers each topic as a Learn section `topic:<slug>`. `src/assets/topics.test.ts`
  guards it: every key exists in dictionary.json (the sync would silently skip an unknown key),
  no duplicates, sorted, ≥ 40 keys per topic, unique slugs — no hard-coded counts.
- **Adding a topic:** add it to `TOPICS` in `build_topics.py` (roots, Russian working title),
  curate, rebuild; then add `[slug, title, emoji]` (the tie test requires a non-empty emoji) to the `TOPICS` table in `src/utils/categories.ts`
  at the same position. The tie test in `src/utils/categories.test.ts` fails until the registry
  and `topics.json` list the same slugs in the same order — also when a topic drops out of the
  file (under `MIN_TOPIC_SIZE`): then remove its registry entry (saved selections simply drop
  the unknown key).
- `TOPICS` (21 slugs with Russian working titles) lists each topic's root synsets by stable
  OEWN id plus a comment label; a missing id fails the build. A card belongs to a topic when one
  of its chosen senses has a root among its hypernyms (instance hypernyms ignored; `animal`
  excludes `hominid`; adjectives count only for `colour`/`emotion`, via attribute / derivation /
  pertainym links). Chosen senses — rule f, per WordNet part of speech: dominant parts of speech
  only, first sense, senses with a strong SemCor count, the second sense of a rare card with few
  senses, the second sense of a food/plant/animal/body regular-polysemy pair. Only cards with
  rank ≤ `RANK_CUTOFF` (20000) come from the automatic mapping; topics with fewer than
  `MIN_TOPIC_SIZE` (40) members after curation are not written.
- **Hand curation** in `scripts/data/topic_overrides.json` (UTF-8, LF, a JSON array with one
  object per line): `{ "topic", "key", "action": "add" | "remove", "reason" }`, reasons from
  `OVERRIDE_REASONS` (`wrong-sense`, `translation-mismatch`, `slang`, `rare-jargon`, `off-topic`,
  `vulgar`, `missed-member`, `calendar`). Policy: a word belongs to a topic only if both its
  commonly used sense and the Russian translation on its card fit the topic; vulgar, sexual,
  offensive or slur items never belong to any topic (offensive words are not in the dictionary
  at all, crude translation items are removed by card overrides; of the sexual anatomy only
  penis, vagina, breast, anus and buttock are in `body` — other genital terms keep their cards
  but are removed from topics with reason `vulgar`). A shift of ranks (e.g. after excluding cards)
  moves cards across `RANK_CUTOFF` and the rank-dependent sense rule: rebuild, review the new
  automatic members and fix stale overrides the build reports. Overrides are applied after the automatic mapping; an explicit `add` may bring in a
  card above the rank cutoff. The build fails loudly, listing every problem, on: unknown topic,
  key not in dictionary.json, duplicate decision, `remove` of a key not in the automatic set,
  `add` of a key already in it (both stale), unknown reason or fields. `--review` writes the
  curation candidates (automatic members + rule-c additions at rank ≤ 20000, with translations).
  After editing, rebuild and update the topic-decision counts in the `manual-corrections` entry
  of `src/data/sources.json` (a Python test checks them).
- Licences: the `open-english-wordnet` entry in `src/data/sources.json` (CC BY 4.0) carries both
  Princeton notices in `noticeText` — OEWN's `WNDB_License.txt` and omw-en's
  `LICENSE` (WordNet 3.0) — since the licences require them on all copies. The wording is
  unchanged; only the hard wraps inside paragraphs (and the stray line numbers) are removed.

`expo-notifications` needs a **native build** (the `preview` APK; there is no dev client) — Expo Go on Android crashes on import
(Since SDK 53 push notifications are stripped from Expo Go). `src/services/notifications.ts`
already lazy-`require`s the module behind an `isExpoGoAndroid` guard; keep that guard. The guard
uses `isRunningInExpoGo()` from `expo` (the check expo-notifications itself uses), NOT
`Constants.executionEnvironment === "storeClient"` — that stopped matching Expo Go 58 on Android.
The `require` is also wrapped in try/catch (`console.error`, reminders become "unavailable"), so
a failing native module never breaks the root layout. Nothing else may import
expo-notifications at runtime (`reminders.ts` uses `import type` only).

**Reminders** (rolling window of one-shot local notifications — NO repeating triggers anywhere)
- Settings: `app_settings.daily_reminder_enabled` (`"true"`/`"false"`) and
  `app_settings.reminder_times` — JSON array of local `"HH:MM"` strings, sorted, unique, 1–3
  items (`src/utils/reminderTimes.ts`: `parseReminderTimes` drops garbage, dedupes, sorts, keeps
  the earliest 3 and falls back to `["20:00"]` when absent or empty; `serializeReminderTimes` /
  `setReminderTimes()` refuse an invalid list). There is no other reminder setting.
- Planner (pure, `src/utils/reminderPlan.ts`, tested): `planReminders({ now, times, windowDays,
  goalReachedToday, reviewCount, dailyGoal })` → `{ at, title, body }[]`: today + the next
  `windowDays − 1` days (`REMINDER_WINDOW_DAYS` = 7) at every time, built from LOCAL date
  components (`new Date(y, m, d + offset, hh, mm)`, never + 24 h — DST-safe); only strictly
  future; none today when today's goal is reached; ascending; capped at `REMINDER_PLAN_MAX` = 21
  (iOS keeps at most 64 pending notifications per app). Title `REMINDER_TITLE` ("Время
  повторить слова"); body: 3 review variants with the review count (`pluralRu`) or, with 0 words
  to review, 3 new-word variants with the daily goal; variant = (local day of year + time index)
  mod 3, so a slot always gets the same text. No emoji.
- Adapter (`src/services/reminders.ts`): `createReminderReplanner({ notifications, loadState,
  androidChannel, now })`. One run: load state for `toLocalDay(now)` → **cancel ALL scheduled
  notifications** (the rolling window is re-planned from scratch; done even when disabled
  or without permission) → stop if disabled → check permission (never prompts) → plan →
  Android channel → one `DATE` trigger per item. Runs are serialised (a promise chain; calls
  made while one runs share one queued run, which reads fresh state); errors never reach the UI
  (`console.error`). The real instance is `replanReminders` in `notifications.ts` (state =
  enabled flag, times, `getDailyProgress(localDay)` → goal reached = introduced >= goal,
  `getWordsStats().review` = Learn's "Повторить").
- `replanReminders()` is called: at start, on AppState `active`, `background` and `inactive`
  (all three in `useReminderReplan(isReady)`, used once by `src/app/_layout.tsx` — not in
  screens), and from Profile after any reminder setting change (switch, time added / changed /
  removed) and after a granted permission. Because the window only moves when the app runs,
  reminders stop by themselves about a week after the app was last opened.

**App icon, notification icon and splash screen** (all in `app.json`; the images in `assets/`
are final — do not regenerate or edit them)
- `icon` `./assets/icon.png`; `android.adaptiveIcon`: the three `android-icon-*` layers, fallback
  `backgroundColor` `#D97706` (the amber icon background).
- `expo-notifications` plugin: `icon` `./assets/notification-icon.png`, `color` `#D97706`
  (= `orangeAccent`).
- `expo-splash-screen` plugin (keys from the package's `plugin/src/types.ts` and
  `getAndroidSplashConfig.ts` / `getIosSplashConfig.ts`; the README there is the outdated bare
  workflow guide): `image` `./assets/splash-icon.png`, `imageWidth` 240, `resizeMode`
  `contain`, `backgroundColor` `#F7F7F2` (= `lightTheme.pageBackground`), `dark.backgroundColor`
  `#0F1519` (= `darkTheme.pageBackground`); no dark image (both themes share it). The splash
  follows the system appearance (the in-app theme preference is applied only after JS starts).
- Android: the plugin always uses the Android 12 SplashScreen API (`Theme.SplashScreen`,
  `windowSplashScreenAnimatedIcon`, no icon background, also on older Android via
  core-splashscreen): the image is drawn at `imageWidth` dp in a 288 dp canvas and masked to a
  192 dp circle (radius 96 dp). The artwork's farthest opaque pixel is 0.384 × image width from
  the centre, so `imageWidth` ≤ 250 keeps it unclipped; 240 → visible square ≈ 150 dp, corners
  at 92 dp. No extra Android keys are needed. iOS draws the image at 240 pt, no mask.
- Behaviour: `src/app/_layout.tsx` calls `SplashScreen.preventAutoHideAsync()` at module level
  and `SplashScreen.hideAsync()` in an effect once `isReady` or `initFailed` is set (the existing
  `prepare()` = `initDatabase()` → schema migration + dictionary sync), so the splash never
  hides before the DB is ready and never covers the error screen. A retry after an error shows
  the gate's spinner (the splash is gone). The config takes effect only in a native build
  (`preview` APK).
- Guard: `src/theme/tokens.test.ts` fails when the app.json splash backgrounds or the
  notification colour drift from the tokens — change app.json together with `tokens.ts`.

**Windows dev environment**
- If PowerShell blocks `npx.ps1`, call `npx.cmd` instead.
- Python 3.14 is installed via the Python install manager: use `py -V:3.14 …` or the venv's
  `scripts/.venv/Scripts/python.exe`. Bare `python` in PowerShell may hit the WindowsApps alias
  and print nothing. Do not use Python for file edits; edit files with the editor tools.

## Workflow rules

- Keep edits scoped to the files named in the task.
- No dead code or leftover legacy after a migration — remove the old path in the same change.
- **Every new data source must be added to `src/data/sources.json` before its data ships**
  (title, author, version, https licence URL, licence, what is used, what was changed;
  optional https project `url` — the app's own work has none and the screen then hides
  "Сайт проекта"; `noticeText` when the licence requires a full notice). `parseSources()`
  validates it and a test checks the real file; the "Источники и лицензии" screen shows it with
  no UI changes.
- Run `npx tsc --noEmit`, `npm run lint` and `npm test` before finishing.

## Testing

- Tests are `*.test.ts` files next to the code (e.g. `src/utils/reviewQueue.test.ts`). Never put
  them in `src/app/` — Expo Router would treat them as routes. Nothing imports them, so Metro does
  not bundle them.
- Tests only for pure logic (no React rendering, no snapshots, no component tests, no hand-written
  mocks of expo-sqlite or React Native internals). To make logic testable, extract it into a pure
  function (`src/utils/`, or an exported helper such as `splitStyle` in `PressableScale.tsx`).
  The one adapter test, `src/services/reminders.test.ts`, injects a `jest.fn()` stand-in for the
  expo-notifications API and a `loadState` function into `createReminderReplanner` (no module
  mocks, no DB).
- Schema/migration SQL (`src/db/schema.ts`), dictionary-sync SQL (`src/db/dictionarySync.ts`),
  section SQL (`src/db/categoryQueries.ts`) and progress SQL (`src/db/progressQueries.ts`) are
  tested against real SQLite via `node:sqlite` (`schema.test.ts`, `dictionarySync.test.ts`,
  `categoryQueries.test.ts`, `progressQueries.test.ts` — incl. a sync of the real
  `dictionary.json` + `topics.json` and their band and topic sizes; tests mirror `database.ts` flows such as "UPDATE, then
  +1 only if it changed a row" in small helpers; `@jest-environment node`,
  `/// <reference types="node" />`). The rest of `src/db/database.ts` is verified by hand on a
  device.
- New scheduling logic (SRS: intervals, due dates, grading) must be written as pure functions with
  tests in the same change.

## Architectural rules

1. **Routes stay thin.** Never put screen logic in `src/app/`. A route file should only import a
   screen from `src/screens/` and export it (`export default LearnScreen;`). Layout files are the
   only place navigator configuration lives. Add new screens as
   `src/screens/XScreen.tsx` + a one-line route wrapper in `src/app/`.
2. **Shared UI goes to `src/components/`, shared hooks to `src/hooks/`.** If two screens need it,
   extract it; keep components presentational and prop-driven. Screen-local subcomponents (e.g.
   `SessionComplete` in `LearnScreen.tsx`) may stay in the screen file; `StepperButton` was
   extracted once Profile needed it too.
3. **Data access lives in `src/db/`.** All SQL, schema, migrations, and model types stay in
   `src/db/` — queries and model types in `database.ts`; schema/migration SQL strings and pure
   helpers in `schema.ts`, dictionary + topic sync SQL and pure helpers in `dictionarySync.ts`,
   Learn section SQL (selection setting, per-section counts, selection availability, next new
   words) in `categoryQueries.ts`
   (none of them imports expo-sqlite, so all are tested on `node:sqlite`).
   Screens/services call exported async functions — never issue queries inline.
   The DB is opened once via `getDb()` (memoized promise; a failed open clears the memo so a retry
   reopens).
   - **Schema v5, versioned by `PRAGMA user_version` (= 5).** The upgrade chain v1 → v5 was
     squashed before the first release (the app was never published; the only install was the
     developer's own, already at v5), so only a fresh install or a v5 DB is supported. `word_topics (topic TEXT NOT NULL, dict_key TEXT NOT NULL, PRIMARY KEY (topic,
     dict_key)) WITHOUT ROWID` (v5) holds topic membership of dictionary words (slug →
     `dict_key`; no foreign key, custom words never appear — their dict_key is NULL); only the
     dictionary sync writes it.
     `daily_progress (local_day TEXT PRIMARY KEY NOT NULL, introduced INTEGER NOT NULL DEFAULT 0
     CHECK (introduced >= 0))` (v4) counts words that left `'new'` per local day. `words` has
     `dict_key` (`term.trim().toLowerCase()`, UNIQUE, NULL for custom words —
     `CHECK ((is_custom = 1) = (dict_key IS NULL))`), `is_custom` 0/1, `status` NOT NULL with
     CHECKs and `rank` INTEGER (frequency rank from `dictionary.json`; NULL for custom words and
     until synced). `rank` defines the Learn sections (frequency bands) and the order of new
     dictionary words in a session; `Word` does not include it. `initDatabase()` = `migrateSchema()` then `syncDictionaryIfNeeded()`;
     `migrateSchema()` follows `planMigration(userVersion, hasWordsTable)`: `fresh` (version 0
     and no `words` table: create the v5 schema + set version, one exclusive transaction),
     `current` (5), `too-new` (above 5; throws `DatabaseTooNewError`; the DB is not touched and
     the error screen says to update the app) or `unknown` (everything else: versions 1–4, version
     0 with a `words` table (old v1), negatives; throws `DatabaseUnsupportedError`; the DB is not
     touched — never delete it silently — and the error screen says to reinstall the app).
   - **Dictionary sync** (`dictionarySync.ts`, fills a fresh install too — there is no separate
     seed path): runs when `app_settings.dictionary_version` differs from
     `src/assets/dictionary.version.json` (the data version over `dictionary.json` + `topics.json`).
     Only then are the large (~6 MB) `dictionary.json` and `topics.json` `require`d
     (lazily). One exclusive transaction runs `planDictionarySync()`: upsert in 500-row batches,
     matched **only by `dict_key`** (ids differ between installs) — `term`, `translation`,
     `transcription`, `example`, `rank` are updated, **`id`, `status` and `is_custom` never**;
     custom words (dict_key NULL) are never touched, even if their term equals a dictionary key;
     dictionary rows absent from the JSON are deleted only when `status = 'new'` (pure
     `findKeysToDelete()`, batched deletes), rows with progress are kept unchanged; then
     **`word_topics` is rewritten completely** (`DELETE FROM word_topics`, then batched inserts
     from `topics.json`, `buildTopicInsertBatches()`), so a moved or removed key or a removed
     topic is reflected; a key without a dictionary row in `words` is skipped (`WHERE EXISTS`) —
     with the shipped files there are none (`topics.test.ts` + the upserts run first in the same
     transaction; the real-file sync test checks row count = key count). The version is
     written as the last statement, so it is stored only if the whole sync commits. A second run
     leaves the same content (DO UPDATE skips unchanged rows; the topic rows are deleted and
     reinserted identically). Note: SQLite allocates an AUTOINCREMENT
     value even for rows that end in DO UPDATE, so every sync advances the id counter by about the
     dictionary size — harmless, ids stay unique and existing ids never change. A failed sync
     rolls back and shows the DB error screen; "Повторить" retries it.
   - The fresh schema is pinned by `src/db/schema.v5.snapshot.json` (`sqlite_master` names + SQL
     and `user_version` of a fresh DB, generated from the pre-squash code); `schema.test.ts` fails
     on any drift. Never edit the snapshot to make a test pass without a schema version bump.
   - New schema changes (once the app is published, real incremental migrations again — never
     squash): bump `SCHEMA_VERSION`, add the SQL step in `schema.ts` and a plan (`upgrade-v5` for
     v5 → v6) in `planMigration` + a `case` in `migrateSchema()`, update the fresh schema and
     its snapshot together, with `node:sqlite` tests (`@jest-environment node` docblock): the
     upgraded DB keeps its data and ends with the same schema as a fresh install; the step and
     `SET_SCHEMA_VERSION` run in one exclusive transaction.
   - Row type `Word`: `dict_key`/`transcription`/`example` are `string | null`; `status` is
     `"new" | "review" | "learned"`. `WordsStats` (`totalNew`, `review`, `learned`) is exported
     and shared by Learn and Profile; Learn's own/dictionary split comes from
     `getSelectionAvailability(selection)`, not from `WordsStats`.
   - `getSessionWords(selection, limit)`, `getCategoryCounts()`,
     `getSelectionAvailability(selection)`, `getLearnSelection()` / `setLearnSelection()` — see
     "Sections" under UI conventions.
   - `getWordsStats()` is one query (`COUNT(CASE …)`), backed by index `idx_words_is_custom_status`.
   - Status changes (SQL in `progressQueries.ts`): `markWordAsReview()` (Learn "Далее") is the
     only way a word leaves `'new'`. It only moves words that are still `'new'` (guards against a
     stale Learn session) and, in the same exclusive transaction and only when that UPDATE changed
     a row, adds 1 to today's `daily_progress` row (`INSERT … ON CONFLICT(local_day) DO UPDATE
     SET introduced = introduced + 1`) — a repeated call never double counts; own words count
     like dictionary words. `markWordAsLearned()` (Review "Вспомнил") only moves `'review'` →
     `'learned'` and never counts. Deleting words (own words, sync, full reset) never counts.
   - Local day: `toLocalDay(new Date())` (`src/utils/dailyGoal.ts`, local date components, never
     `toISOString`/UTC) computed in JS and passed as a parameter — no SQLite `'localtime'`.
   - `getDailyProgress(localDay)` → `{ introduced, goal }` (one query); `getDailyGoal()` /
     `setDailyGoal()`: `app_settings.daily_goal`, integer as text, 5–50 in steps of 5, default
     10; anything else reads as the default (`parseDailyGoal`), invalid values are never written.
   - `resetDatabase()` runs in one exclusive transaction: deletes custom words, sets all
     remaining words to `'new'` and clears `daily_progress`. Dictionary rows are NOT re-seeded
     and keep their ids. `resetProgressOnly()` (also one exclusive transaction) sets every word to
     `'new'`, clears `daily_progress` and keeps custom words. Neither touches the goal; the
     dictionary sync never touches `daily_progress`.
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
   (`absoluteFillObject` does not exist in RN 0.88).
7. **Navigation** via Expo Router only: `Link`, `router`, `useLocalSearchParams` from
   `expo-router`. Never pass non-serializable params (functions, DB handles).
8. **Branch switches in one synchronous block.** When a screen switches between branches
   (session / completion / setup), do the async work first (e.g. `await getWordsStats()`), then
   update all related state together with no `await` in between — otherwise a frame of the wrong
   branch flashes.

## UI conventions

**Navigation & insets**
- Tabs use NativeTabs (`expo-router/native-tabs`) in `src/app/(tabs)/_layout.tsx`.
- Scrolling tab screens get the iOS safe-area insets from `contentInsetAdjustmentBehavior=
  "automatic"` set explicitly on their scroll view: ProfileScreen's ScrollView (status bar on
  top, tab bar at the bottom; on Android it pads with `insets.top` instead) and WordsScreen's
  `FlatList` (tab bar; the Words header above it pads with `insets.top`). Do not rely on
  NativeTabs switching the screen's first ScrollView to automatic by itself — with SDK 58 that
  stopped reaching Profile (its title slid under the status bar). Learn's setup ScrollView sets
  its own top padding from `insets.top` on both platforms. WordsScreen wraps
  its list in a `react-native-screens/experimental` `SafeAreaView` whose bottom edge is on only
  while the list is empty, so the empty state centers above the tab bar.
- ReviewScreen uses `SafeAreaView` from `react-native-screens/experimental` +
  `disableAutomaticContentInsets` on its trigger.
- Non-scrolling Learn states (session, completion, empty) set their own bottom padding from
  `insets.bottom` (`useSafeAreaInsets()`). Checked on iPhone; Android unverified.
- `/sources` (SourcesScreen) is the only screen with a native Stack header (configured in
  `src/app/_layout.tsx`: title, `headerBackButtonDisplayMode: "minimal"` (chevron only),
  `pageBackground`/`textPrimary`, no shadow).
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
  the root DB-error "Повторить" (`src/app/_layout.tsx`), the Profile reset buttons
  ("Сбросить прогресс изучения" secondary, "Сбросить всё до начала" danger), Profile
  "Добавить время" (secondary) and the iOS time picker sheet ("Готово" primary, "Отмена"
  secondary). Learn "Далее" does
  NOT pass `disabled`: the `isProcessingRef` guard (a ref, set synchronously) in `handleNextWord` blocks double taps, and
  dimming would flash on every tap.
- Not migrated — deliberate exceptions, keep them as they are:
  - WordFormModal "Сохранить" (`TouchableOpacity`): the only indigo button (`indigoAccent`,
    dims to 0.6 while saving; double taps are blocked by `isSavingRef`, a ref set synchronously at
    the start of `handleSave`, since `disabled={saving}` only applies after a re-render); its
    color is a separate design decision.
  - WordFormModal "Отмена" (`TouchableOpacity`): a text button with no fill or border.
  - Review "Не вспомнил"/"Вспомнил" (`PressableScale`): a matched grading pair laid out two
    across (flex 1, padding 10, 14/800); the success look has no other user.
  - Words header "Добавить" (`PressableScale`): compact with an icon — would need size and icon
    props for one call site.
  - Icon buttons — Learn session close, Words search clear, FlipCard speak (`TouchableOpacity`;
    speak is tied to FlipCard's `isSpeaking` flip guard) and `StepperButton`
    (`src/components/StepperButton.tsx`, `PressableScale`, 48 pt, 0.92 scale, 0.35 dimming; Learn
    session size and Profile daily goal): icon-only, own sizes, labelled via `accessibilityLabel`.
  - Words filter chips (`PressableScale`): selectable controls with
    `accessibilityState={{ selected }}`.
  - Section picker chips and topic tiles (`PressableScale`, `accessibilityRole="checkbox"`),
    its close button (`TouchableOpacity`, same look as the Learn session close) and its
    group-header actions "Все" / "Нет" (`PressableScale`, amber text, ≥ 44 pt, 0.35 dimming
    when disabled). Its bottom-bar "Готово" IS a primary `Button` (own size via placement
    style, closes like "Закрыть").
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
  Learn session-size stepper, section picker toggle and group "Все" / "Нет", Profile daily-goal
  stepper, reminder switch, reminder time added / changed / removed and theme setting.
  Light impact: Learn next card, Review "forgot". Success: Learn session complete, Review "remembered".
  Warning: tapping the last selected section in the picker.

**Learn screen**
- Setup: a "Разделы" row (opens `/categories`): the selection by name from
  `formatSelectionSummary()` — "Все разделы", or up to two parts of `getSelectionParts()`
  ("Свои слова", adjacent selected bands merged into one range such as "Слова 1–1 000", "Весь
  словарь" for all bands, topic titles or "Все темы") + "ещё N" — and below it the new words
  left in the selection; the accessibility label lists every part) + one merged plan card: stepper (`StepperButton`) +
  composition bar + legend + inline note ("Своих слов не хватает…", shown when the plan's
  `isOwnShort` — the custom section is selected and has new words, but fewer than the session
  size; never with 0 own words, so never in an exhausted selection, where only the exhausted
  note shows;
  its "добавим N из словаря" is the plan's `dictionary`, same as the bar and legend, and is
  omitted when it is 0; text from `getPlanNoteText()`). "Новых доступно" in the plan card is the
  selection's count; the stat strip "Новые" and the empty state ("Новые слова закончились",
  `totalNew === 0`) stay global. Exhausted selection (`isSelectionExhausted()`: 0 new words in
  the selection, > 0 globally): "Начать сессию" is a disabled `Button` (Pressable reports
  `disabled` to screen readers) and a note under the plan card says "В выбранных разделах не
  осталось новых слов. Выберите другие разделы."
- "Сегодня" block (above the "Разделы" row): a header row from `getDailyProgressParts()` —
  title left ("Новых слов сегодня", from N >= G a check icon + "Цель выполнена"), count right
  ("N из G", from N >= G "G из G" plus an amber "+(N − G)" when over the goal) — over a bar in
  the plan-bar style (`planBar` + `planBarEmpty` track, `planBarSegment` fill) that is full at
  N >= G; the width animates like the composition bar (first value instant, then 220 ms,
  instant with Reduce Motion). The block is one accessible element: role `progressbar`, label =
  `formatDailyProgress()` ("Новых слов сегодня: N из G" / "Цель на день выполнена: G из G[, ещё
  K сверх цели]"),
  `accessibilityValue` `{ min: 0, max: G, now: min(N, G) }`. The goal never changes the session
  size or the plan.
- The composition split mirrors what `getSessionWords(selection, size)` will load — computed by
  the pure `getSessionPlan(sessionSize, available)` (`src/utils/sessionPlan.ts`, tested), where
  `available` = `getSelectionAvailability(selection)`: one query over the same selection filter
  as the session query, counting DISTINCT new words of the union (own / dictionary apart) —
  never a sum of per-section counts, since topics overlap bands and each other. Stats, the
  selection with its availability and today's progress are loaded together (`loadLearnData`) on
  every focus, so returning from the picker refreshes the plan. Returning from the background does not fire focus, so while
  Learn is focused it also listens to `AppState` and reloads on `"active"` (the subscription
  lives in the same `useFocusEffect` and is removed on blur) — the day rolls over after midnight.

**Sections (Learn → `/categories`)**
- New words come only from the selected sections, three kinds: "custom" (`is_custom = 1`,
  "Свои слова"), frequency bands over `words.rank` (dictionary rows only; rank NULL is in no
  band) and topics (`word_topics`, dictionary rows only). The band table `BANDS` and the topic
  table `TOPICS` (`[slug, Russian title, emoji]`, in `topics.json` order; the emoji is the
  tile icon only, hidden from screen readers; the tie test requires a non-empty one) live in
  `src/utils/categories.ts` (sections themselves are not stored): bands 1–500, 501–1000,
  1001–2000, 2001–3000, 3001–5000, 5001–10000, 10001–20000, 20001+ (open-ended); 21 topics
  (food "Еда и напитки" … travel "Путешествия"). Keys: `"custom"`, `band:<from>-<to>`,
  `band:<from>-` for the open band, `topic:<slug>`; band titles are generated
  ("Слова 10 001–20 000", NBSP digit groups via `formatNumber`; the chip shows only the range,
  `formatBandRange()`: "10 001–20 000", "20 001+"). Sections have no descriptions.
- **Union semantics:** the selected sections combine by OR in ONE `WHERE` (`selectionFilter`),
  so a word in several selected sections (a band and a topic, two topics) appears once. A topic
  filter is `words.dict_key IN (SELECT t.dict_key FROM word_topics t WHERE t.topic = ?)` — same
  meaning as a correlated `EXISTS`, but SQLite builds the subquery's index once per query
  (measured on the real data with `node:sqlite`: ~3.5 ms vs ~170 ms for custom + all 21 topics).
- Selection: `app_settings.learn_categories` = JSON array of keys in registry order. Absent =
  all sections (custom + all bands + all topics) — selecting everything deletes the key, so a
  section added later is selected for those users automatically. `parseSelection` drops unknown
  keys and dedupes; empty, unparsable or non-array → all. The picker never deselects the last
  section (`isLastSelected` / `toggleCategory`, `canDeselectGroup` / `deselectGroup`).
- Session order (`buildNewWordsQuery`, `src/db/categoryQueries.ts`): own words first (random
  order, as before), then dictionary words by ascending rank; `LIMIT` = session size; no top-up
  from outside the selection. Counts: `buildCategoryCountsQuery()` — one query with
  `total_<i>` / `remaining_<i>` per section: custom and bands as `COUNT(CASE …)` in one pass over
  `words`, each topic as a scalar `(SELECT COUNT(*) FROM words WHERE <topic filter>)` (driven by
  the `dict_key` index; ~30 ms in all on the real data vs ~520 ms with topic conditions in the
  pass). Each section uses the same filter as the session query, so `remaining` (status `'new'`)
  always equals what the session query picks for that section alone (tested). Selection
  availability: `buildSelectionAvailabilityQuery(selection)` (see Learn screen).
- Adding a band: add a row to `BANDS` keeping it contiguous from 1 with an open last band
  (`validateCategories` test fails otherwise). Changing a band's bounds changes its key — old keys
  in saved selections are dropped by `parseSelection` (falls back to all if nothing remains).
  Adding a topic: see "Topic pipeline" (build_topics.py + `TOPICS` entry + the tie test).
- Picker (`src/screens/CategoriesScreen.tsx`, route `src/app/categories.tsx`): root Stack screen
  with `presentation: "fullScreenModal"`, `animation: "slide_from_bottom"`, no header — the same
  full-screen slide-up look as `WordFormModal` (top padding `max(insets.top, 24)`); closed by
  its "Закрыть" icon button, "Готово" or Android back. Layout (one visual language — chips and
  tiles share the selected look): fixed title row; a `ScrollView` with a one-line muted
  subtitle "Новые слова берутся из выбранных разделов." (its accessibility label adds the union
  and last-section rules — not visible), one chip "Свои слова" (no header — the custom group of
  `CATEGORY_GROUPS` is rendered outside the groups), group "Частота" with 8 band chips (label =
  range, then the remaining new-word count), group "Темы" with a 2-column grid of tiles
  (emoji 24 pt in a 30 pt box, name 14/600 wrapping, count below; min height 64, grows with
  the font; check icon top-right with reserved right padding). Below the ScrollView, in the
  normal layout flow (so nothing is hidden under it), a bottom bar: opaque `pageBackground`,
  hairline top border, padding 16 + `insets.bottom`: "N новых слов" (`formatNewWords`) +
  muted "из выбранных разделов" (one accessible element, `accessibilityLiveRegion="polite"`),
  and the "Готово" `Button`. N = `getSelectionAvailability(selection)` own + dictionary —
  the same union count as Learn's plan; reloaded after every saved change, the previous number
  stays until the answer arrives, stale answers are dropped (request counter), a failed
  recount keeps the old number (`console.error`). Dimension constants (chip 40 pt + hitSlop 2,
  tile 64, emoji, check sizes, gaps) live at the top of the file. Selected chip/tile:
  `selectedTint` background, `orangeAccent` border, `amberAccent` label and count (the count is
  dimmed by weight, not opacity, to keep 4.5:1), `checkmark-circle` icon (chips: left of the
  label). Unselected: `surface`, 1 px `border`, normal text, `textMuted` count. Group headers
  (role `header`, uppercase tracked; the row wraps at large font sizes; `minHeight` 44) of a
  group with more than one section (`hasGroupActions(group)`) have "Все" (selects every section
  of the group; disabled when all are selected) and "Нет" (deselects the group; disabled when
  none of it is selected or when nothing would remain — then its hint says "Должен быть выбран
  хотя бы один раздел"); labels "Выбрать все разделы группы <title>" / "Снять все разделы
  группы <title>", `accessibilityState={{ disabled }}`. Every toggle and group action is saved
  first and applied on success (`showErrorAlert()` and the old state on failure; one save at a
  time). Chips and tiles: role checkbox, `accessibilityState={{ checked }}`, label from
  `formatCategoryAccessibilityLabel()` ("Еда и напитки, 464 новых слова", "Слова 10 001–20 000,
  осталось 9 884 из 10 001"; no emoji); the last selected one has a hint, and tapping it
  announces "Должен быть выбран хотя бы один раздел". Loading: background only, then
  `FadeInView`; a failed load shows the icon + "Не удалось загрузить данные" + "Повторить"
  (no bottom bar).
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
  (`getNotificationPermission()`: `granted` / `askable` / `blocked` (no system prompt any more) /
  `unavailable` (Expo Go Android)). Without permission an enabled flag is turned off silently
  (`console.error` on failure) and `replanReminders()` cancels what is scheduled; no permission
  is requested. The schedule itself is not checked (a replan may be rewriting it).
- "НАПОМИНАНИЯ": one card — the "Ежедневные напоминания" switch (subtitle "N раз(а) в день";
  off: "Выключены", or "Уведомления запрещены в настройках устройства" when `blocked`); turning
  it on asks for permission (`requestNotificationPermission()`, channel first on Android), a
  refusal shows an alert with "Открыть настройки" (`Linking.openSettings()`). While on, the card
  lists the times (hairline-separated rows: tap opens `TimePickerModal`, label "Напоминание в
  HH:MM"; a 44 pt trash button "Удалить напоминание в HH:MM", hidden when one time is left),
  then a secondary `Button` "Добавить время" (disabled at 3 with the visible note "Можно задать
  не больше трёх напоминаний в день."; the picker starts at `suggestReminderTime()`, the nearest
  free whole hour around 20:00) and a muted note on the goal and the one-week stop. A picked time
  that already exists changes nothing, silently. Every change is saved first (`setReminderTimes`),
  then shown and replanned; `showErrorAlert()` and the old list on failure.
- `TimePickerModal` (`src/components/`, 24 h): shown while mounted. Android — the Material 3
  time dialog of `@expo/ui/community/datetime-picker` ("Готово" / "Отмена"); iOS — a bottom
  sheet over the `scrim` token with a wheel (`TimeWheel`, `locale="ru_RU"`, `amberAccent` tint),
  "Готово" and "Отмена"; tapping the scrim cancels. `TimeWheel.ios.tsx` builds the wheel from
  `@expo/ui/swift-ui` (`Host alignment="center"` + `DatePicker` with `datePickerStyle("wheel")`):
  since SDK 58 `<Host>` aligns its content `topLeading` and the community wrapper does not pass
  `alignment`, so its wheel sat on the left. `TimeWheel.tsx` (other platforms, web) is the
  community spinner.
- "ОБУЧЕНИЕ" section (before "НАПОМИНАНИЯ"): "Цель на день" row with − / + `StepperButton`s
  (5–50, step 5, `stepDailyGoal`), disabled at the limits. The row is one accessible element:
  role `adjustable`, value text "N новых слов", `increment` / `decrement` actions. Each step is
  saved first (`setDailyGoal`), then shown; on failure `showErrorAlert()` and the old value;
  further taps are ignored while saving. Selection haptic on success.

**Components**
- `FlipCard`: fixed height 370; the back face content is in a `ScrollView` (tap flips, drag
  scrolls); the front term uses `numberOfLines` + `adjustsFontSizeToFit`.
- Big digits (Learn counter and stat strip, Profile numbers) set `maxFontSizeMultiplier`; the Words
  search field uses `minHeight`, not `height`.
- `WordFormModal` top padding comes from safe-area insets (min 24).

**Accessibility**
- `PressableScale` defaults to `accessibilityRole="button"`. Icon-only buttons need a Russian
  `accessibilityLabel`. Selectable controls (Words filter chips) set
  `accessibilityState={{ selected }}`; section picker chips and tiles are checkboxes
  (`accessibilityState={{ checked }}`). Small touch targets use `hitSlop` to reach 44pt.
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
- Loading/error states: on launch the native splash covers the DB gate until init succeeds or
  fails (see "App icon, notification icon and splash screen"); the gate's own spinner is seen
  only during a retry, and on failure "Не удалось открыть базу
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
- `orangeAccent` is `#D97706` in both themes and is only for fills (buttons, the plan bar
  segment and legend dot), the tab bar tint, confetti and the border of a selected section
  chip/tile. Orange TEXT or icons
  on surfaces use `amberAccent`. `textMutedHint` and `statAmber` no longer exist — use
  `textMuted` / `amberAccent`.
- `selectedTint` (light `#FFF7E8`, dark `#3A2E18`) is the selected section chip/tile fill;
  `amberAccent` on it is ≥ 4.5:1 in both themes (light 4.72, dark 6.17) — keep that when
  changing either.
- White text on `#D97706` is ~3.2:1 — accepted consciously for bold button labels; do not "fix" it
  without asking.
- The scheme is decided in one place: `useColorSchemeName()` (`src/theme/useTheme.ts`).
- The user's appearance preference (System/Light/Dark, default System) is stored in `app_settings`
  and applied via `applyThemePreference()` before the app is shown (in the DB init flow).
  `userInterfaceStyle` in app.json is `"automatic"`.
