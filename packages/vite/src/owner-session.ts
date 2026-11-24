// Owner-contract capture, manifest carrier closure, and graph validation for
// one Vite plugin instance. Keeps the build-time freeze and mid-build invalidation
// invariants in one place instead of spreading nine mutable fields across hooks.

import { createHash } from 'node:crypto'
import path from 'node:path'
import { inspectStaticModuleImports } from '@hozo/compiler'
import type { LowerModuleOptions } from '@hozo/compiler/lower'
import {
  type CarrierClosure,
  type CarrierTrip,
  carrierGuard,
  carrierOwnerRoutes,
  carrierSourceFiles,
  carrierSources,
  carrierTripMessage,
  discoverOwnerPackageCallers,
  discoverSources,
  type HozoProjectOptions,
  locateDeclaredPackage,
  type OwnerContractRequest,
  type OwnerPackageContributions,
  readBoundedUtf8File,
  requireCarrierClosure,
  scanProject,
} from '@hozo/compiler/project'
import type { ResolvedConfig } from 'vite'
import type { ViteCandidateInventory } from './candidate-inventory.ts'
import { captureViteOwnerCandidates, type ViteOwnerCandidatePlan } from './owner-candidates.ts'
import { ViteOwnerPreflightUnavailable } from './owner-preflight.ts'
import { discoverViteOwnerSourcePlan, guardViteOwnerFallbackRoots } from './owner-source-plan.ts'
import type { ViteTailwindEpoch } from './tailwind-epoch.ts'

const BUILT_IN_OWNER_PACKAGES = ['@hozo/patterns', '@hozo/form']

export type ViteOwnerPreflightPolicy = 'strict' | 'ordinary-fallback'

export interface ViteOwnerSessionConfig {
  ownerPlan?: ViteOwnerCandidatePlan
  callerBindings: readonly Omit<OwnerContractRequest, 'entry'>[]
  discoverCallers: boolean
  discoverOwnerSources: boolean
  ownerPreflight: ViteOwnerPreflightPolicy
}

export type ViteModuleResolve = (
  specifier: string,
  importer: string,
) => Promise<{ id: string; external?: boolean | 'absolute' } | null | undefined>

type CapturedOwners = Awaited<ReturnType<typeof captureViteOwnerCandidates>>
type OwnerGraph = Parameters<CapturedOwners['validateGraph']>[0]

export interface ViteOwnerCallerSelection {
  owners: CapturedOwners
  requests: readonly OwnerContractRequest[]
}

export interface ViteOwnerInitializeParams {
  root: string
  options: HozoProjectOptions
  resolvedConfig: ResolvedConfig | undefined
  current: ViteTailwindEpoch
  inventory: ViteCandidateInventory | undefined
  resolve: ViteModuleResolve
  addWatchFile: (file: string) => void
  warn: (message: string) => void
}

export class ViteOwnerSession {
  readonly #config: ViteOwnerSessionConfig
  // The frozen package manifests this build's candidates came from, and the
  // guard for every module loaded after them (#2047).
  #carriers: CarrierClosure | undefined
  #ownerRoutes: ReturnType<typeof carrierOwnerRoutes> | undefined
  #changedOwnerInput: string | undefined
  #guard: ((file: string) => CarrierTrip | undefined) | undefined
  // Source those packages ship for this build to compile, admitted from the
  // capture rather than from the walk's file list.
  #carrierSource: (file: string) => boolean = () => false
  #owners: CapturedOwners | undefined
  #ownerSourceFiles: readonly string[] | undefined
  #ownerCallerFiles = new Set<string>()
  #ownerFallback: ViteOwnerPreflightUnavailable | undefined

  constructor(config: ViteOwnerSessionConfig) {
    this.#config = config
  }

  get discoverOwnerSources(): boolean {
    return this.#config.discoverOwnerSources
  }

  assertBuildCommand(command: ResolvedConfig['command']) {
    if ((this.#config.ownerPlan || this.#config.discoverOwnerSources) && command !== 'build')
      throw new Error('[hozo] owner candidates require a production build')
  }

  reset() {
    this.#owners?.invalidate()
    this.#owners = undefined
    this.#ownerRoutes = undefined
    this.#changedOwnerInput = undefined
    this.#ownerSourceFiles = undefined
    this.#ownerCallerFiles.clear()
    this.#ownerFallback?.invalidate()
    this.#ownerFallback = undefined
    this.#carriers = undefined
    this.#guard = undefined
    this.#carrierSource = () => false
  }

  invalidateOwners() {
    this.#owners?.invalidate()
  }

  validateBeforePublish() {
    this.#owners?.validate()
  }

  hasCarriers(): boolean {
    return this.#carriers !== undefined
  }

  carrierContributions(): CarrierClosure['contributions'] | undefined {
    return this.#carriers?.carriers.length ? this.#carriers.contributions : undefined
  }

  carrierSourceFiles(): readonly string[] {
    return this.#carriers ? carrierSourceFiles(this.#carriers) : []
  }

  ownerContributions(): OwnerPackageContributions | undefined {
    return this.#owners?.contributions
  }

  hasActiveGraphGuard(): boolean {
    return Boolean(this.#owners || this.#ownerFallback)
  }

  admits(file: string): boolean {
    return this.#ownerCallerFiles.has(file) || this.#carrierSource(file)
  }

  guardLoad(id: string): string | undefined {
    const trip = this.#guard?.(id)
    return trip ? carrierTripMessage(this.#carriers!, trip) : undefined
  }

  /**
   * Captures the current owner/fallback epochs at transform start so an async
   * invalidation during compilation refuses to publish stale output.
   */
  captureRequestGuard(): () => void {
    const ownerEpoch = this.#owners
    const fallbackEpoch = this.#ownerFallback
    return () => {
      ownerEpoch?.check()
      fallbackEpoch?.check()
      if (this.#changedOwnerInput)
        throw new Error(
          `[hozo] owner manifest input changed: ${this.#changedOwnerInput}; restart Vite`,
        )
    }
  }

  async initialize({
    root,
    options,
    resolvedConfig,
    current,
    inventory,
    resolve,
    addWatchFile,
    warn,
  }: ViteOwnerInitializeParams) {
    // Automatic assessment uses the SAME source discovery/scan as normal
    // compilation, captured before asynchronous resolution and CSS output.
    const discoveredProject = this.#config.discoverOwnerSources
      ? scanProject(root, options.content, options.sources)
      : undefined
    if (discoveredProject) this.#ownerSourceFiles = [...discoveredProject.files]

    let selectedPlan: ViteOwnerCandidatePlan | undefined
    try {
      selectedPlan = this.#config.discoverOwnerSources
        ? discoverViteOwnerSourcePlan(discoveredProject!.files)
        : this.#config.ownerPlan
      if (selectedPlan) {
        if (!current.snapshot)
          throw new Error('[hozo] owner candidates require a Tailwind snapshot')
        const context = createHash('sha256')
          .update(
            JSON.stringify([
              'vite-owner-candidates-0',
              root,
              selectedPlan.context,
              current.snapshot.serialize(),
              options.sources,
              options.classHelpers,
              options.fontAvailability,
              options.preflight,
              resolvedConfig?.resolve.conditions,
              resolvedConfig?.resolve.alias,
            ]),
          )
          .digest('hex')
        this.#owners = await captureViteOwnerCandidates(
          selectedPlan,
          async ({ importer, specifier }) => resolve(specifier, importer),
          context,
        )
      }
    } catch (error) {
      if (
        this.#config.ownerPreflight !== 'ordinary-fallback' ||
        !(error instanceof ViteOwnerPreflightUnavailable)
      )
        throw error
      this.#ownerFallback = selectedPlan
        ? error
        : guardViteOwnerFallbackRoots(discoveredProject!.files, error)
      this.#ownerFallback.validate()
      for (const file of this.#ownerFallback.watchFiles) addWatchFile(file)
      warn(`[hozo] owner preflight ${error.reason}; using ordinary lowering before output`)
    }

    if (this.#owners) {
      for (const file of this.#owners.watchFiles) addWatchFile(file)
      if (this.#config.discoverOwnerSources) {
        // Discovery is not permission to transform every dependency. Only
        // snapshotted physical callers with selected manifest contracts
        // borrow the existing ordinary transform/companion-CSS path.
        for (const file of this.#owners.sourceFiles)
          if (
            discoverOwnerPackageCallers(this.#owners.lease, file, this.#owners.sourceImports(file))
              .requests.length
          )
            this.#ownerCallerFiles.add(path.resolve(file))
      }
      inventory?.observeOwnerPackages(this.#owners.contributions)
    }

    // The packages with a Hozo manifest this app can reach (#2047), captured
    // before any module is resolved. Their manifests' candidates are the only
    // ones packages contribute, and an incomplete capture throws before any
    // output. The experimental owner paths above bring their own; an explicit
    // `content.packages` names sources to scan.
    this.#carriers =
      this.#config.ownerPlan || (this.#config.discoverOwnerSources && !this.#ownerFallback)
        ? undefined
        : requireCarrierClosure(root, options.content, {
            platform: 'web',
            epoch: 'vite-carriers-0',
          })
    this.#guard = this.#carriers && carrierGuard(this.#carriers)
    this.#ownerRoutes =
      this.#carriers && carrierOwnerRoutes(this.#carriers, BUILT_IN_OWNER_PACKAGES)
    for (const file of this.#ownerRoutes?.inputs.keys() ?? []) addWatchFile(file)
    this.#carrierSource = this.#carriers ? carrierSources(this.#carriers) : () => false

    return discoveredProject
  }

  handleWatchChange(id: string): 'owner-input-changed' | 'handled' | 'unhandled' {
    const absolute = path.resolve(id)
    if (this.#ownerRoutes?.inputs.has(absolute)) {
      this.#changedOwnerInput = absolute
      return 'owner-input-changed'
    }
    if (this.#ownerFallback?.watchFiles.includes(absolute)) {
      this.#ownerFallback.invalidate()
      return 'handled'
    }
    if (this.#owners?.watches(id)) {
      this.#owners.invalidate()
      return 'handled'
    }
    return 'unhandled'
  }

  async resolveAuditedOwners(
    source: string,
    absoluteFile: string,
    resolve: ViteModuleResolve,
  ): Promise<NonNullable<LowerModuleOptions['auditedOwners']>> {
    // An empty selection is authoritative, including a pre-output fallback.
    // Vite never switches to the standalone catalog.
    const routes = this.#ownerRoutes
    if (!routes?.specifiers.some((specifier) => source.includes(specifier))) return []
    const imports = new Set(
      inspectStaticModuleImports(source, absoluteFile).bindings.map(({ source }) => source),
    )
    const selected = await Promise.all(
      routes.specifiers
        .filter((specifier) => imports.has(specifier))
        .map(async (specifier) => {
          const entry = await resolve(specifier, absoluteFile)
          if (!entry) return []
          // SSR can leave the bare import for Node rather than return a file.
          // Use that importer's Node package, not the app root.
          const physical =
            entry.external && entry.id === specifier
              ? locateDeclaredPackage(path.dirname(absoluteFile), specifier)
              : entry.id
          return physical ? routes.forResolvedImport(physical, specifier) : []
        }),
    )
    return selected.flat()
  }

  resolveCallerSelection(absoluteFile: string, id: string): ViteOwnerCallerSelection | undefined {
    if (id.includes('?')) return undefined
    const bindings = this.#config.callerBindings.length
      ? this.#config.callerBindings.filter((binding) => binding.importer === absoluteFile)
      : undefined
    const discovered =
      this.#config.discoverCallers && this.#owners
        ? discoverOwnerPackageCallers(
            this.#owners.lease,
            absoluteFile,
            this.#owners.sourceImports(absoluteFile),
          ).requests
        : undefined
    if (!bindings?.length && !discovered?.length) return undefined
    if (!this.#owners)
      throw new Error('[hozo] owner callers require a captured stylesheet and package epoch')
    const selectedOwners = this.#owners
    const requests =
      discovered ??
      bindings!.map((binding) => {
        const captured = selectedOwners.lease.capture.bindings.find(
          (edge) => edge.importer === binding.importer && edge.specifier === binding.specifier,
        )
        if (!captured) throw new Error('[hozo] owner caller edge was not captured')
        return { ...binding, entry: captured.entry }
      })
    return { owners: selectedOwners, requests }
  }

  deliveryMeta(
    selectedOwners: CapturedOwners,
    owners: readonly {
      identity: unknown
      preview: { contextFingerprint?: unknown; findings: unknown }
    }[],
  ) {
    if (!this.#config.discoverOwnerSources) return undefined
    return {
      schema: 1,
      scope: 'configured-static-source-capture',
      capture: {
        fingerprint: selectedOwners.lease.capture.fingerprint,
        sources: selectedOwners.sourceObservations,
        unassessedImports: selectedOwners.unassessedImports,
        edges: selectedOwners.lease.capture.bindings.map(({ importer, specifier, entry }) => ({
          importer,
          specifier,
          entry,
        })),
      },
      owners: owners.map((owner) => ({
        identity: owner.identity,
        fingerprint: owner.preview.contextFingerprint,
        findings: owner.preview.findings,
      })),
    }
  }

  admissionMeta() {
    if (!this.#config.discoverOwnerSources) return undefined
    return this.#ownerFallback
      ? { schema: 1, route: 'ordinary-fallback', reason: this.#ownerFallback.reason }
      : { schema: 1, route: 'captured', fingerprint: this.#owners?.lease.capture.fingerprint }
  }

  validateGraph(graph: OwnerGraph, root: string, content: HozoProjectOptions['content']) {
    if (
      this.#ownerSourceFiles &&
      JSON.stringify(discoverSources(root, content)) !== JSON.stringify(this.#ownerSourceFiles)
    )
      throw new Error('[hozo] owner configured source set changed; rebuild before publication')
    this.#owners?.validateGraph(graph)
    this.#ownerFallback?.validate()
    for (const [file, hash] of this.#ownerRoutes?.inputs ?? []) {
      let actual: string | undefined
      try {
        actual = createHash('sha256').update(readBoundedUtf8File(file, 65_536)).digest('hex')
      } catch {}
      if (actual !== hash)
        throw new Error(
          `[hozo] owner manifest input changed during the build: ${file}; restart or rebuild`,
        )
    }
  }
}
