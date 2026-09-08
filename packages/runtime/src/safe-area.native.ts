// The insets a notch, a home indicator and a status bar take out of the
// window, read from the package every React Native app already has.
//
// `pt-[env(safe-area-inset-top)]` is a class Tailwind itself produces, and
// on Web it needs nothing from Hozo: the browser resolves `env()`. On React
// Native there is no cascade to resolve it in, and -- this is the part that
// decided the design -- no way to read the real number from React Native's
// core either. Core exposes a deprecated iOS-only `SafeAreaView`, which
// applies padding rather than reporting a value, and an Android-only
// `StatusBar.currentHeight`, which is the status bar and not the cutout.
// `safeAreaInsets` appears nowhere in its JavaScript.
//
// So the value needs native code: `UIView.safeAreaInsets` on iOS,
// `WindowInsets` on Android. Hozo could ship that itself, and chose not to.
// `@hozo/*` is a compiler and JavaScript today, which means a project can
// add it without a rebuild, without autolinking, and without leaving Expo
// Go; shipping a native module to avoid one dependency would trade that
// away for every user in order to save one `pnpm add` for some of them.
//
// `react-native-safe-area-context` is that dependency, and it is not an
// obscure one: `@react-navigation` pulls it in, so most applications with
// more than one screen already have it.

/** The four insets, in the shape the compiled style reads them. */
export interface HozoSafeAreaInsets {
  top: number
  right: number
  bottom: number
  left: number
}

type InsetsHook = () => HozoSafeAreaInsets

const NONE: HozoSafeAreaInsets = { top: 0, right: 0, bottom: 0, left: 0 }

/**
 * The package's hook, or a hook-shaped constant when it is not installed.
 *
 * Resolved at module load, which is both the simple answer and the correct
 * one. Simple, because a hook chosen once is a hook called unconditionally
 * afterwards -- selecting per render would be calling a hook inside a
 * branch, which is the rule React does not bend even when the branch is
 * decided by the bundle and never changes.
 *
 * Correct, because this module is only loaded when the compiler emitted a
 * safe-area class. A project that writes none never imports it, never
 * resolves anything, and never sees the warning; a project that writes one
 * sees it exactly once, at startup, when there is still time to act.
 */
function resolveInsetsHook(): InsetsHook {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const module = require('react-native-safe-area-context') as {
      useSafeAreaInsets?: InsetsHook
    }
    if (typeof module.useSafeAreaInsets === 'function') return module.useSafeAreaInsets
  } catch {
    // Not installed. Fall through to the warning: an optional dependency
    // that throws on absence is not optional.
  }
  console.warn(
    '[hozo] a safe-area class needs `react-native-safe-area-context`, which is not installed. ' +
      'Insets are zero until it is: add it, then wrap the app in its `<SafeAreaProvider>`. ' +
      'Hozo ships no native code of its own, and the real inset is `UIView.safeAreaInsets` on ' +
      'iOS and `WindowInsets` on Android -- neither of which React Native exposes to JavaScript.',
  )
  // Zeros rather than a throw, because of what each costs: a missing inset
  // draws content under a notch, which is ugly and recoverable, and a
  // thrown error is a blank app. The warning is what makes the ugly one
  // findable.
  return () => NONE
}

const useInsets = resolveInsetsHook()

/**
 * The current safe-area insets. Drives `pt-[env(safe-area-inset-top)]` and
 * the other three sides, the way `useHozoViewport` drives `h-screen`.
 *
 * A wrapper with no logic in it is the point: the number belongs to the
 * platform, this package's job is to make one spelling reach both, and
 * anything clever here would be Hozo having an opinion about a value it
 * cannot measure.
 */
export function useHozoSafeArea(): HozoSafeAreaInsets {
  return useInsets()
}
