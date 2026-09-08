# Native device acceptance

The automated suite proves that this source passes the real Metro transformer, that generated modules evaluate against the Native component contract, and that measured Grid state settles under synthetic `onLayout` events. A simulator or device is still required for the platform behaviors below.

## Production bundle measurement

Run `pnpm measure:production` in this directory. It creates minified, non-development Android Metro bundles for the full acceptance app and for a matched pair of small screens: one authored with Hozo and one with React Native styles directly. Raw and gzip sizes plus the Hozo-minus-Native delta are written to the ignored `dist/bundle-sizes.json` file.

The reference measurement on 2026-08-18 was:

| Bundle | Raw | gzip |
| --- | ---: | ---: |
| Full acceptance app | 895,433 B | 216,573 B |
| Matched Hozo screen | 889,580 B | 215,092 B |
| Matched Native screen | 889,438 B | 215,064 B |
| Hozo increment | **142 B** | **28 B** |

The matched pair deliberately uses only compile-away features. It is a guard against the compiler or an accidental runtime dependency entering every app bundle, not a claim that runtime-backed features such as Grid or Native interaction transitions cost zero.

There is a host now. `android/` is a React Native 0.87 project that registers `HozoNativeDemo` from `index.js`, and the `native` workflow builds a release APK, boots it on an emulator, and fails if it does not come up (#297). Run the same thing locally with an emulator attached:

```sh
cd android && ./gradlew assembleRelease -PreactNativeArchitectures=x86_64
bash ../scripts/android-smoke.sh
```

There is an iOS host now too. `ios/` is the same project from React Native's own template, renamed, and the workflow's `ios` job installs the pods, builds it for a simulator, boots it and fails if it did not come up. Locally, on a Mac:

```sh
cd ios && pod install
xcodebuild -workspace HozoNativeDemo.xcworkspace -scheme HozoNativeDemo \
  -configuration Release -sdk iphonesimulator -derivedDataPath build \
  CODE_SIGNING_ALLOWED=NO build
bash ../scripts/ios-smoke.sh
```

Both jobs now read the accessibility tree, which is where every defect this workflow has found came from — an invisible `Separator`, a `Progress` with no box, a `Dialog` with no `testID`, a `Del` that threw, and a `Pressable` whose transition took its background with it.

They read it differently, because the platforms offer different things. Android uses `uiautomator dump`, which needs nothing installed. iOS has no equivalent, so the tree comes from an XCUITest target in `ios/` — Apple's own tool, reading the hierarchy from outside the process — which prints it to the build log between markers for `scripts/extract-trees.mjs` to cut out. Run it locally on a Mac with:

```sh
xcodebuild test -workspace ios/HozoNativeDemo.xcworkspace -scheme HozoNativeDemo \
  -configuration Release -sdk iphonesimulator \
  -destination 'platform=iOS Simulator,name=iPhone 16' \
  -derivedDataPath ios/build CODE_SIGNING_ALLOWED=NO | tee ios-uitest.log
node scripts/extract-trees.mjs ios-uitest.log
```

`-configuration Release` is not optional: the Xcode phase skips bundling in Debug, so a Debug app comes up looking for a Metro server that is not running.

The iOS job also keeps a screenshot and checks it is not one flat colour, which the tree does not answer — an app that renders an accessibility tree it never draws is a real shape, and the Continue button that was there in the tree and invisible on screen is what proved it.

Everything below is still with-your-own-eyes on both.

## Visual and interaction pass

_Both jobs now keep a screenshot, and the compiled Continue button being invisible in one of them (#334) is what those artifacts are for. The judgement about what a screenshot shows is still a person's._

- `smoke-image`: the remote logo loads, is 80×80, cropped, and rounded.
- `smoke-horizontal-scroll`: a horizontal gesture reaches cards three and four without vertical-axis capture.
- `smoke-grid`: the tall tile spans both measured rows; the displayed width is non-zero and updates after rotation.
- `smoke-list`: rows scroll smoothly and retain their content after recycling.
- `smoke-interaction`: pointer hover changes color where supported; keyboard focus has a visible color; pressing opens the dialog.
- Dialog: Android Back requests close and focus does not escape the modal.

## Screen-reader pass

_The tree these announce from is machine-readable on both platforms now, and `native-tree.ts` asserts the Android one against the contract in #260; the iOS half of that comparison is the next change. What a screen reader says out loud stays here._

- VoiceOver and TalkBack announce the acceptance screen as a list and each virtual row once.
- The logo is announced as “React Native logo”.
- The input is announced as “Email address”, followed by its hint; the placeholder is not used as its name.
- Continue is announced as a button named “Review email address”.
- Opening the dialog announces “Confirm your address”; dismissing it returns focus to Continue.

Record OS, device/simulator, screen reader, result, and any failing `testID`. Do not mark the device gate complete from the Metro bundle alone.
