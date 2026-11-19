import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { type Compiler, type PreparedModule, TAILWIND_SCALAR_ORDER_POLICY } from '@hozo/compiler'
import { formatDiagnostic } from '@hozo/compiler/diagnostics'
import { SourceProvenance } from '@hozo/compiler/lower'
import {
  classesMissingFromRuntimeMap,
  type NativeTextInheritance,
  type OwnerContractRequest,
  type OwnerManifestLease,
  prepareInstanceOwnerCallers,
  type StylexModuleCache,
  TailwindCandidateUniverse,
  TailwindProjectSession,
} from '@hozo/compiler/project'
import { restoreTailwindStylesheet } from '@hozo/tailwind'
import { composeNativeOwnerCaller } from './owner-caller-compose.ts'
import { candidateModulePath, type MetroTailwindReference } from './project.ts'
import { transformHozoSourceOrPrepare } from './transform.ts'

/** Read once per worker/epoch. A broken transfer is an error, not permission
 * to re-read newer CSS beside an older generated project candidate module.
 */
export async function readTailwindTransfer(reference: MetroTailwindReference) {
  const content = readFileSync(reference.file, 'utf8')
  if (createHash('sha256').update(content).digest('hex') !== reference.sha256) {
    throw new Error('[hozo] Metro Tailwind snapshot hash mismatch; restart Metro')
  }
  const data = JSON.parse(content)
  if (
    data?.schema !== 1 ||
    data.orderingPolicy !== TAILWIND_SCALAR_ORDER_POLICY ||
    typeof data.stylesheet !== 'string' ||
    !Array.isArray(data.candidates) ||
    data.candidates.some((name: unknown) => typeof name !== 'string')
  ) {
    throw new Error('[hozo] Invalid Metro Tailwind snapshot; restart Metro')
  }
  const nativeRuntime = data.nativeRuntime
  if (
    Object.hasOwn(data, 'nativeRuntime') &&
    (!nativeRuntime ||
      typeof nativeRuntime !== 'object' ||
      typeof nativeRuntime.sha256 !== 'string' ||
      !/^[a-f0-9]{64}$/.test(nativeRuntime.sha256) ||
      !Array.isArray(nativeRuntime.candidates) ||
      nativeRuntime.candidates.some((name: unknown) => typeof name !== 'string' || !name) ||
      new Set(nativeRuntime.candidates).size !== nativeRuntime.candidates.length)
  )
    throw new Error('[hozo] Invalid Metro Native runtime inventory; restart Metro')
  if (
    Object.hasOwn(data, 'runtimeCandidates') &&
    (!Array.isArray(data.runtimeCandidates) ||
      data.runtimeCandidates.some((name: unknown) => typeof name !== 'string'))
  )
    throw new Error('[hozo] Invalid Metro runtime candidate list; restart Metro')
  if (
    Object.hasOwn(data, 'markerClasses') &&
    (!Array.isArray(data.markerClasses) ||
      data.markerClasses.some((name: unknown) => typeof name !== 'string'))
  )
    throw new Error('[hozo] Invalid Metro marker class list; restart Metro')
  return {
    snapshot: await restoreTailwindStylesheet(data.stylesheet),
    candidates: data.candidates as string[],
    ...(data.runtimeCandidates && { runtimeCandidates: data.runtimeCandidates as string[] }),
    ...(data.markerClasses && { markerClasses: data.markerClasses as string[] }),
    ...(nativeRuntime && {
      nativeRuntime: {
        sha256: nativeRuntime.sha256 as string,
        candidates: nativeRuntime.candidates as string[],
      },
    }),
  }
}

/** One platform's compiler/session, never shared mutable StyleX bindings
 * between iOS, Android and Web while an async preparation is suspended.
 */
export class MetroTailwindWorker {
  readonly compiler: Compiler
  readonly session: TailwindProjectSession
  #names: Set<string>
  #universe: TailwindCandidateUniverse
  readonly #nativeRuntime?: { sha256: string; candidates: ReadonlySet<string> }
  /** What the on-device class map holds, from the same startup scan. */
  readonly #runtimeCandidates?: ReadonlySet<string>
  readonly #markerClasses?: readonly string[]

  constructor(compiler: Compiler, transfer: Awaited<ReturnType<typeof readTailwindTransfer>>) {
    this.compiler = compiler
    this.#names = new Set(transfer.candidates)
    this.#universe = new TailwindCandidateUniverse(this.#names)
    if (transfer.runtimeCandidates) this.#runtimeCandidates = new Set(transfer.runtimeCandidates)
    this.#markerClasses = transfer.markerClasses
    if (transfer.nativeRuntime)
      this.#nativeRuntime = {
        sha256: transfer.nativeRuntime.sha256,
        candidates: new Set(transfer.nativeRuntime.candidates),
      }
    this.session = new TailwindProjectSession(compiler, async (names, signal) =>
      JSON.stringify((await transfer.snapshot.prepareOrder(names, signal)).snapshot),
    )
  }

  /** @internal Explicit one-owner worker. Mixed output may compose only where
   * the actual Native transform preserves the caller's source coordinates. */
  async transformOwnerCaller(
    source: string,
    filename: string,
    root: string,
    lease: OwnerManifestLease,
    request: OwnerContractRequest,
    disposition: 'prepared-partial' | 'prepared-literal',
    stylexModules?: StylexModuleCache,
    aliases: readonly string[] = [],
  ) {
    const file = path.resolve(root, filename)
    if (request.importer !== file || !['ios', 'android'].includes(lease.capture.platform))
      throw new Error('METRO_OWNER_CALLER_REQUEST_MISMATCH')
    lease.check()
    const runtime = this.#nativeRuntime
    if (!runtime) return this.transform(source, filename, root, stylexModules, 'compiled')
    const checkRuntime = () => {
      if (
        createHash('sha256')
          .update(readFileSync(candidateModulePath(root)))
          .digest('hex') !== runtime.sha256
      )
        throw new Error('METRO_OWNER_CALLER_RUNTIME_CHANGED')
    }
    checkRuntime()
    const output = await this.session.runModule(file, this.#universe, (compiler, context) => {
      const provenance = new SourceProvenance(source)
      // The owner-caller experiment composes over ordinary output as it was
      // assessed, so it keeps the compiled route rather than decision 013's.
      const ordinary = transformHozoSourceOrPrepare(
        source,
        filename,
        root,
        compiler,
        context,
        stylexModules,
        (input, edits) => provenance.apply(input, edits),
        'compiled',
      )
      let owner: ReturnType<typeof prepareInstanceOwnerCallers>
      try {
        owner = prepareInstanceOwnerCallers(
          lease,
          source,
          compiler,
          request,
          disposition === 'prepared-partial',
          aliases,
        )
      } catch (error) {
        if (ordinary.kind === 'prepared') ordinary.module.dispose()
        throw error
      }
      if (!owner.candidates.every((candidate) => runtime.candidates.has(candidate))) {
        owner.dispose()
        return ordinary
      }
      const ownedOrdinary = ordinary.kind === 'prepared' ? ordinary.module : undefined
      const module: PreparedModule<string | null> = {
        candidates: [
          ...new Set([...owner.candidates, ...(ownedOrdinary?.candidates ?? [])]),
        ].sort(),
        emit(context) {
          const lowered = ownedOrdinary
            ? ownedOrdinary.emit(context)
            : ordinary.kind === 'complete'
              ? ordinary.output
              : null
          const { preview } = owner.emit(context)
          if (
            !preview.findings.some((finding) => finding.disposition === disposition) ||
            preview.findings.some(
              (finding) =>
                finding.disposition !== 'retained' && finding.disposition !== disposition,
            )
          )
            return lowered
          return composeNativeOwnerCaller(source, lowered, provenance, preview)
        },
        dispose() {
          owner.dispose()
          ownedOrdinary?.dispose()
        },
      }
      return { kind: 'prepared', module }
    })
    lease.check()
    checkRuntime()
    return output
  }

  transform(
    source: string,
    filename: string,
    root: string,
    stylexModules?: StylexModuleCache,
    textInheritance: NativeTextInheritance = 'unified',
  ) {
    this.reportMissingRuntimeClasses(source, filename)
    return this.session.runModule(
      path.resolve(root, filename),
      this.#universe,
      (compiler, context) => {
        const result = transformHozoSourceOrPrepare(
          source,
          filename,
          root,
          compiler,
          context,
          stylexModules,
          undefined,
          textInheritance,
        )
        if (result.kind === 'prepared') {
          let changed = false
          for (const name of result.module.candidates) {
            if (!this.#names.has(name)) {
              this.#names.add(name)
              changed = true
            }
          }
          // Actual post-Canvas parse is authoritative even for new/derived
          // modules that were not in the startup lexical scan. No reparse.
          if (changed) this.#universe = new TailwindCandidateUniverse(this.#names)
        }
        return result
      },
    )
  }

  /** A carried class the run-time map does not hold does not apply (#2048).
   * Not for a dependency's files, whose classes the app's author cannot
   * change, matching the compiler's own diagnostics. */
  reportMissingRuntimeClasses(source: string, filename: string, warn = console.warn) {
    if (!this.#runtimeCandidates || /[\\/]node_modules[\\/]/.test(filename)) return
    if (!/\.[cm]?[jt]sx?$/.test(filename)) return
    for (const diagnostic of classesMissingFromRuntimeMap(
      source,
      filename,
      this.#runtimeCandidates,
      this.compiler,
      this.compiler.sources,
      this.#markerClasses,
    ))
      warn(formatDiagnostic(diagnostic))
  }

  invalidate() {
    this.session.invalidate()
  }
}
