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
scripts/.venv/Scripts/python.exe -m unittest discover -s scripts -v     # Python tests
```

JSON shape: array of `{ term, translation, transcription, example, rank }` in source order
(never reorder — fresh-install ids depend on it); `rank` is 1..N by wordfreq frequency.
`src/assets/dictionary.test.ts` guards the shape. Every data source must be listed in
`src/data/sources.json` before its data ships.

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
