/** Only an expected pre-output scope refusal may select ordinary lowering.
 * Input invalidation, malformed contracts and compiler/plugin errors must not
 * acquire this type merely because their message happens to look familiar. */
export class ViteOwnerPreflightUnavailable extends Error {
  readonly reason: 'unresolved-import' | 'unsupported-module' | 'source-budget'
  readonly watchFiles: readonly string[]
  #validate: () => void
  #retired = false
  constructor(
    reason: ViteOwnerPreflightUnavailable['reason'],
    detail: string,
    snapshot: { watchFiles: readonly string[]; validate(): void },
  ) {
    super(`Vite owner candidates INCOMPLETE: ${detail.slice(0, 4096)}`)
    this.name = 'ViteOwnerPreflightUnavailable'
    this.reason = reason
    this.watchFiles = Object.freeze([...snapshot.watchFiles])
    this.#validate = snapshot.validate
  }
  check() {
    if (this.#retired) throw new Error('VITE_OWNER_PREFLIGHT_INVALIDATED')
  }
  validate() {
    this.check()
    try {
      this.#validate()
    } catch (error) {
      this.invalidate()
      throw error
    }
  }
  invalidate() {
    this.#retired = true
  }
}
