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
   * Performs `ACTION_ACCESSIBILITY_FOCUS` on the view behind a React tag.
   *
   * Resolves what Android said about the request. `performAccessibilityAction`
   * returns false for a view that will not take accessibility focus at that
   * moment, and that is the one fact only the platform has. A promise rather than
   * a synchronous boolean because the view cannot be resolved off the UI thread,
   * so the answer is a frame away whatever the signature says.
   *
   * It was `void` in the first version, on the reasoning that whether focus
   * landed is TalkBack's answer rather than a return value's. True, and it threw
   * the useful half away: a 5x3 diagnostic restored focus in 2 of 15 dismissals
   * with the action confirmed to be running, and nothing in the evidence said
   * whether those thirteen were refused or accepted and then overridden. Those
   * want different fixes.
   */
  moveAccessibilityFocus(viewTag: number): Promise<boolean>
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
