import { type TurboModule, TurboModuleRegistry } from 'react-native'

/**
 * The codegen specification, and the only file in this package React Native's
 * build reads.
 *
 * `codegenConfig` in `package.json` points at this directory, and the generator
 * finds this file by its name: `Native*.ts` is the convention, not a choice. It
 * produces `NativeHozoAccessibilitySpec`, the abstract Kotlin class
 * `HozoAccessibilityModule` extends, so the two sides cannot disagree about the
 * signature without failing the Gradle build.
 *
 * `number` rather than a view: a codegen spec's argument types are the ones the
 * bridge can carry, and a React tag is what crosses. The public API in
 * `index.ts` takes the component and does the `findNodeHandle` itself, because
 * asking a caller for a tag would be asking them to know about the bridge.
 */
export interface Spec extends TurboModule {
  /**
   * Asks TalkBack to put its focus on the view behind a React tag, then checks
   * where its focus actually lands, and asks once more if that was elsewhere.
   *
   * The request is the same `TYPE_VIEW_FOCUSED` event React Native's
   * `sendAccessibilityEvent(view, 'focus')` sends -- TalkBack's own source names
   * it as the way an app says where focus should go. What JavaScript cannot do
   * is the second half: React Native passes it nothing about where accessibility
   * focus is, so it cannot tell a request that was honoured from one TalkBack
   * dropped. This method watches for the first `TYPE_VIEW_ACCESSIBILITY_FOCUSED`
   * in the view's window for `watchMs`, and if it lands on another view, sends
   * the event again.
   *
   * Resolves what happened, for diagnostics: `landed`, `resent`, `resent-landed`,
   * `quiet` (nothing landed within the window), `unwatched` (the event was sent
   * but the window could not be watched) or `missing` (no view behind the tag).
   *
   * #491's first version performed `ACTION_ACCESSIBILITY_FOCUS` here instead,
   * and measured worse than sending nothing at all (#484): the action places
   * focus without going through TalkBack, which then restores its own idea of it.
   * This version never places focus itself.
   */
  restoreAccessibilityFocus(viewTag: number, watchMs: number): Promise<string>
}

/**
 * `get` rather than `getEnforcing`.
 *
 * `getEnforcing` throws when the module is missing, and the whole arrangement in
 * `docs/decisions/006-shipping-native-code.md` rests on absence being a
 * degradation rather than a crash. The one case that reaches here with nothing
 * behind it is a JavaScript bundle that has this package but an app binary built
 * before it was installed -- which is exactly the state a developer is in halfway
 * through adding it, and the worst possible moment to throw.
 */
export default TurboModuleRegistry.get<Spec>('HozoAccessibility')
