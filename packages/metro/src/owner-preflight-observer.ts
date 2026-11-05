import path from 'node:path'
import {
  collectMetroOwnerPreflight,
  type MetroOwnerPreflight,
  type OwnerMetroContext,
} from './owner-manifest-preflight.ts'

type CaptureOptions = Parameters<typeof collectMetroOwnerPreflight>[2]
type Resolution = { type: string; filePath?: string }

/** @internal One observation per ordinary build. It never changes a resolver
 * return value, config, or worker state. The caller must wait for the ordinary
 * build to succeed before considering the observation for a later build. */
export function observeMetroOwnerPreflight(
  anchor: { importer: string; specifier: string },
  capture: CaptureOptions,
) {
  let attempted = false
  let observed: MetroOwnerPreflight | undefined

  function resolve<Context extends OwnerMetroContext, Result extends Resolution>(
    context: Context,
    specifier: string,
    platform: string | null,
    delegate: (context: Context, name: string, platform: string | null) => Result,
  ): Result {
    const result = delegate(context, specifier, platform)
    if (
      attempted ||
      platform !== capture.platform ||
      context.originModulePath !== anchor.importer ||
      specifier !== anchor.specifier ||
      result.type !== 'sourceFile' ||
      !result.filePath
    )
      return result

    // Set before walking the closure, so this cannot recurse even if an
    // upstream resolver routes a nested lookup through this observer.
    attempted = true
    const preflight = collectMetroOwnerPreflight(
      context,
      (current, name, target) => delegate({ ...context, ...current }, name, target),
      capture,
    )
    if (
      preflight.status === 'complete' &&
      !preflight.routes.some(
        (row) =>
          row.importer === anchor.importer &&
          row.specifier === anchor.specifier &&
          row.entry === path.resolve(result.filePath!),
      )
    ) {
      observed = Object.freeze({
        status: 'incomplete',
        reason: 'untrusted',
        issues: Object.freeze(['Metro owner preflight disagrees with the live resolver edge']),
      })
    } else observed = preflight
    return result
  }

  return { resolve, result: () => observed }
}
