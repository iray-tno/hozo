/** Only an expected pre-output scope refusal may select ordinary lowering.
 * Input invalidation, malformed contracts and compiler/plugin errors must not
 * acquire this type merely because their message happens to look familiar. */
export class ViteOwnerPreflightUnavailable extends Error {
  readonly reason: 'unresolved-import' | 'unsupported-module' | 'source-budget'
  constructor(reason: ViteOwnerPreflightUnavailable['reason'], detail: string) {
    super(`Vite owner candidates INCOMPLETE: ${detail.slice(0, 4096)}`)
    this.name = 'ViteOwnerPreflightUnavailable'
    this.reason = reason
  }
}
