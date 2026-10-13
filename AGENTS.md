This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

## Expo docs

Expo APIs change between SDKs. Check the docs only when you are about to use an API you are not sure about.

Rules:
- Start from the index: https://docs.expo.dev/llms.txt — search titles/keywords, then open only those URLs.
- **Never invent or guess documentation paths.** If a URL 404s, stop and use llms.txt or the verified list below.
- Fetch each doc page at most once per session. Never re-fetch a page already fetched.
- If the task prompt provides verified facts or exact API signatures, treat them as ground truth and do not re-fetch them.
- Never re-read a file already read in this session unless you edited it.

Verified pages (prefer these over guessing):
- Color themes / userInterfaceStyle / useColorScheme:
  https://docs.expo.dev/develop/user-interface/color-themes/
- Native tabs (ThemeProvider, white flash, tint, icons):
  https://docs.expo.dev/router/advanced/native-tabs/
- Stack + ThemeProvider:
  https://docs.expo.dev/router/advanced/stack/
- Expo UI overview:
  https://docs.expo.dev/versions/latest/sdk/ui/
- Expo UI Host (colorScheme, seedColor):
  https://docs.expo.dev/versions/latest/sdk/ui/universal/host/
- Index: https://docs.expo.dev/llms.txt

Note: `useColorScheme` and `Appearance` are from `react-native`, not a separate Expo runtime doc page.

## Commands

Use `bunx` instead of `npx` if the project uses bun (`bun.lock` present).

```bash
npx expo install <package>  # ALWAYS use instead of npm/yarn/pnpm/bun add — resolves SDK-compatible versions
npx expo start              # start the dev server
npx expo lint               # lint
npx tsc --noEmit            # typecheck
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
```

Run lint and typecheck before declaring any task done.

### Dictionary pipeline (Python, build-time only)

`src/assets/dictionary.json` is generated — never edit it by hand. Run from the repo root; on
Windows use the `py` launcher (bare `python` may hit the WindowsApps alias). The venv lives in
`scripts/.venv` (gitignored); dependencies are pinned in `scripts/requirements.txt`.

```bash
py -V:3.14 -m venv scripts/.venv                                        # once
scripts/.venv/Scripts/python.exe -m pip install -r scripts/requirements.txt
scripts/.venv/Scripts/python.exe scripts/convert_freedict.py <path>/freedict-eng-rus-2025.11.23.src.tar.xz src/assets/dictionary.json
scripts/.venv/Scripts/python.exe scripts/build_topics.py src/assets/dictionary.json src/assets/topics.json
scripts/.venv/Scripts/python.exe -m unittest discover -s scripts -v     # Python tests
```

Converter rules (details in CLAUDE.md): single-word headwords; content parts of speech plus
closed-class function words (pronoun, preposition, postposition, conjunction, determiner,
numeral, interjection, particle); entries grouped by lowercase headword, lowercase spelling
wins over capitalised; translations merged round-robin across a group's entries, deduped
ignoring the U+0301 stress mark (stressed variant kept), capped at 5. Transcription follows the
`ACCENT_PREFERENCE` constant in `convert_freedict.py` (General American: the first pronunciation
labelled GA/GenAm, else the first one). Hand-written transcriptions are General American,
phonemic `/…/`: `ɹ`, `ɡ`, no length marks, `oʊ`, `ɑ`, `ɝ`/`ɚ`, `ʌ`, `ɛ`, `ˈ` only on
multi-syllable words, no dots/parentheses/off-glide marks, tied affricates (`t͡ʃ`, `d͡ʒ`).

Build order: cards → exclusions → ranks → hand corrections, so ranks stay dense and corrections
never change a rank. Offensive vocabulary (profanity, slurs, abusive insults, explicit sexual
acts / sex toys / porn, obsolete racial typology — 156 keys) is removed from the dictionary
entirely via `scripts/data/excluded_terms.json`, one `{ "key", "reason" }` per line; the build
fails loudly on an unknown or duplicate key, an empty reason, unknown fields or a key that is
also in `card_overrides.json`. Remove such keys from `topic_overrides.json` too; a jest test
checks that no excluded key is in `dictionary.json` or `topics.json`, and the removed-word count
in the `manual-corrections` source entry is checked by a Python test. Ordinary words whose
translation only had a crude item keep the card, cleaned by a hand correction. Corrections
live in `scripts/data/card_overrides.json`, one object per line:
`{ "key", "translations"?, "transcription"?, "term"?, "reason" }` keyed by the lowercase term,
replacing only the given fields (translations: 1..5 items, no duplicates). After editing, update
the counts in the `manual-corrections` entry of `src/data/sources.json` (a Python test checks
them). The build fails loudly, listing every problem, on an unknown or duplicate key, a stale
override (identical to the generated card), a `term` that differs from the key other than by
case, an empty `reason`, unknown fields or invalid values.

JSON shape: array of `{ term, translation, transcription, example, rank }`, one per lowercase
`term` (= `dict_key`), in the order of each group's first source entry. Fresh-install ids
therefore differ from upgraded installs — match dictionary rows by `dict_key`, never by id.
`rank` is 1..N: plain lowercase words known to wordfreq first, then everything else; within each
group by frequency, then term. `src/assets/dictionary.test.ts` guards the shape. Every data
source must be listed in `src/data/sources.json` before its data ships.

`src/assets/dictionary.version.json` is the data version: the first 16 hex chars of sha256 over
the bytes of `dictionary.json`, a single `"\n"`, then the bytes of `topics.json` (CRLF normalised
to LF in both). One shared writer, `scripts/data_version.py`, runs at the end of BOTH
`convert_freedict.py` and `build_topics.py`, each using the other file as it currently exists.
Commit `dictionary.json`, `topics.json` and `dictionary.version.json` together; a jest guard and
a Python test recompute the hash and fail ("rerun …") when they diverge.

### Topic pipeline (Python, build-time only)

`scripts/build_topics.py src/assets/dictionary.json src/assets/topics.json [--review <path>]`
maps dictionary cards to 21 topics (food, animal, … travel) with Open English WordNet 2025
(`oewn:2025`) and the sense counts of `omw-en:2.0`, both downloaded by `wn==1.1.1` into the
gitignored `scripts/.wn_data/`. Roots are stable OEWN synset ids (a missing id fails the build);
only cards with rank ≤ `RANK_CUTOFF` (20000) come from the automatic mapping. Hand decisions live
in `scripts/data/topic_overrides.json`, one `{ "topic", "key", "action": "add"|"remove",
"reason" }` per line (reasons: wrong-sense, translation-mismatch, slang, rare-jargon, off-topic,
vulgar, missed-member, calendar); the build fails loudly on unknown topics, unknown keys,
duplicates, stale adds/removes or unknown reasons. A word belongs to a topic only if its common
sense and its card translation both fit; vulgar, sexual, offensive or slur items are never
included. Topics under `MIN_TOPIC_SIZE` (40) are not written. Output `src/assets/topics.json`
(slug → sorted keys, LF, deterministic) is guarded by `src/assets/topics.test.ts` (every key
exists in dictionary.json) and synced by the app into `word_topics`; each topic is a Learn
section `topic:<slug>`. Update the topic-decision counts in the `manual-corrections` entry of
`src/data/sources.json` after editing the overrides (a Python test checks them).

To add a topic: add it to `TOPICS` in `build_topics.py`, curate and rebuild, then add
`[slug, Russian title]` to `TOPICS` in `src/utils/categories.ts` at the same position. A jest test
ties the registry to `topics.json` (same slugs, same order) — it also fails when a topic drops
out of the file, and then its registry entry must go.

### Database schema v5 and dictionary sync

`PRAGMA user_version` = 5; `words.rank` (INTEGER, NULL for custom words) defines the frequency
sections and the order of new dictionary words (see below); `daily_progress` (v4) counts new
words per local day (see "Daily goal"); `word_topics (topic, dict_key)` (v5, `PRIMARY KEY (topic,
dict_key) WITHOUT ROWID`) holds topic membership of dictionary words. On start the app migrates
the schema (`planMigration`: fresh / v1 → v5 / v2 → v5 / v3 → v5 / v4 → v5, each in one
exclusive transaction; v4 → v5 is a plain `CREATE TABLE word_topics`; newer than 5 →
`DatabaseTooNewError`), then syncs when `app_settings.dictionary_version` differs from
`dictionary.version.json` — a fresh install is filled by the same sync, and since the version
now covers `topics.json` too, every upgraded install syncs once. Sync rules, one exclusive
transaction (`src/db/dictionarySync.ts`): match rows **only by `dict_key`**, update
term/translation/transcription/example/rank, never touch `id`, `status`, `is_custom` or custom
words; rows absent from the new JSON are deleted only if `status = 'new'`, rows with progress
are kept; then `word_topics` is rewritten completely from `topics.json` (DELETE all rows, insert
in batches; a key without a dictionary row is skipped — none with the shipped files); the
version is written last, so a failed sync stores nothing and shows the DB error screen with
retry. Re-running the sync leaves the same content. Both JSON files are `require`d lazily, only
when a sync is needed.

### Learn sections

New words for a Learn session come only from the sections the user selected on `/categories`.
Sections are defined in code, not in the database: `"custom"` (own words, `is_custom = 1`),
frequency bands over `words.rank` from the `BANDS` table in `src/utils/categories.ts`
(1–500, 501–1000, 1001–2000, 2001–3000, 3001–5000, 5001–10000, 10001–20000, 20001+; keys
`band:<from>-<to>`, the open last band `band:<from>-`) and 21 topics from its `TOPICS` table
(keys `topic:<slug>`, Russian titles, no description; membership from `word_topics`). Rows with
rank NULL belong to no band. Selected sections combine by **union (OR)** in one `WHERE`, so a
word in several sections appears once; a topic filter is `words.dict_key IN (SELECT t.dict_key
FROM word_topics t WHERE t.topic = ?)` (equivalent to a correlated `EXISTS`, ~50× faster on the
real data). The selection is `app_settings.learn_categories`, a JSON array of keys; no row means
all sections — custom + all bands + all topics (choosing all deletes the row), unknown keys are
dropped, empty or broken values mean all, and the last section can never be deselected. A
session takes own new words first (random order), then dictionary new words by ascending rank,
never from outside the selection. SQL lives in `src/db/categoryQueries.ts` (pure, tested on
`node:sqlite`): per-section counts (`remaining` equals what the session query picks for that
section alone) and `buildSelectionAvailabilityQuery` — the DISTINCT new words of the union, own
and dictionary apart (never a sum of section counts: topics overlap). The plan card numbers
come from `getSessionPlan(sessionSize, await getSelectionAvailability(selection))`.

The picker groups its rows under headers "Свои слова", "Словарь по частотности" and "Темы"
(`CATEGORY_GROUPS`, role `header`). Each header has "Все" (select the whole group) and "Нет"
(deselect it — disabled when nothing would remain, with a hint why), ≥ 44 pt, labelled
"Выбрать все разделы группы …" / "Снять все разделы группы …", saved immediately like a row tap.

When the selected sections have no new words left but other sections do
(`isSelectionExhausted`), "Начать сессию" is disabled and a note asks to pick other sections.

To add a band, add a row to `BANDS`; the bands must start at 1, stay contiguous and end with an
open band (`validateCategories`, checked by a test). To add a topic, see "Topic pipeline". The picker route is a root Stack screen with
`presentation: "fullScreenModal"` and no header; after adding a route, regenerate the gitignored
typed routes (`.expo/types/router.d.ts`, command in CLAUDE.md) so tsc knows the new href.

### Daily goal

`daily_progress (local_day, introduced)` counts words that left `'new'` per local day. Only
`markWordAsReview()` (Learn "Далее", `new → review`) counts: in the same exclusive transaction
and only if its `AND status = 'new'` UPDATE changed a row, so repeated calls never double count;
own words count too. `review → learned` (`markWordAsLearned()`, guarded to `'review'`) and
deletions never count. `local_day` is `toLocalDay(new Date())` — local date components, never
UTC — passed as a parameter (no SQLite `'localtime'`). Both resets clear `daily_progress` in their
transaction; the dictionary sync never touches it. The goal is `app_settings.daily_goal`
(integer text, 5–50 step 5, default 10, anything else reads as 10). Learn shows a "Сегодня" block
("Новых слов сегодня: N из G" / "Цель на день выполнена: N из G", progressbar role) and reloads it
on focus and when the app returns to the foreground; Profile has a "Цель на день" stepper
(adjustable role). The goal does not change the session size or the plan. SQL lives in
`src/db/progressQueries.ts`, pure helpers in `src/utils/dailyGoal.ts`; both are tested.

## Navigation & Routing

- Use **Expo Router** for all navigation. Routes live in `src/app/` — every file there is a screen, `_layout.tsx` files define navigators. Keep non-route code (components, hooks, utils) outside `src/app/`.
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`.
- Docs: https://docs.expo.dev/router/introduction.md

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) — no local Xcode or Android Studio required. Run EAS CLI as `bunx eas-cli <command>` in Bun projects, or `npx eas-cli@latest <command>` otherwise; substitute that for bare `eas` in docs examples.
Docs: https://docs.expo.dev/eas/index.md

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md
