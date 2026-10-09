import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { getCompilerBindingIdentity } from '@hozo/compiler'

const require = createRequire(import.meta.url)

export function sha256(contents) {
  return createHash('sha256').update(contents).digest('hex')
}

export function toolchainEvidence() {
  const binding = getCompilerBindingIdentity()
  const themeRequire = createRequire(require.resolve('@hozo/tailwind/package.json'))
  const compilerRequire = createRequire(require.resolve('@hozo/compiler/package.json'))
  return {
    auditVersion: JSON.parse(readFileSync(new URL('../package.json', import.meta.url))).version,
    compilerVersion: require('@hozo/compiler/package.json').version,
    themeLoaderVersion: themeRequire('@hozo/tailwind/package.json').version,
    tailwindVersion: themeRequire('tailwindcss/package.json').version,
    cssParserVersion: themeRequire('postcss/package.json').version,
    configParserVersion: compilerRequire('jsonc-parser/package.json').version,
    nodeVersion: process.version,
    binding: { ...binding, sha256: sha256(readFileSync(binding.path)) },
  }
}

export function recordAnalysis(report, analysis, file, source, platform) {
  if (Object.values(analysis.targets).some((target) => target.status === 'failed')) {
    report._compileFailures.add(file)
  }
  report.files.push({
    file,
    platform,
    sourceSha256: sha256(source),
    bindingsStatus: analysis.bindings ? 'completed' : 'failed',
    reactNativeUsage: analysis.reactNativeUsage ?? { status: 'failed', bindings: [] },
    targets: Object.fromEntries(
      Object.entries(analysis.targets).map(([target, { code: _code, ...outcome }]) => [
        target,
        outcome,
      ]),
    ),
    stages: analysis.stages,
  })
  // Count compiler-resolved authored references, not spelling matches or
  // dependency survival. Import movement will be a separate compiler fact.
  const usage = analysis.reactNativeUsage
  const census = (report.reactNativeUsage ??= {
    mode: 'authored-esm-symbols',
    rewriteDecisions: 'web-imports-jsx-tags-and-unchanged-module-values',
    limitations: [
      'CommonJS require, dynamic import, TS import-equals, and indirect wrapper modules are not inventoried.',
      'No alias/data-flow propagation beyond the directly imported symbol.',
      'Observed members are not adapter compatibility, build, dependency-removal, or runtime evidence.',
    ],
    filesAssessed: 0,
    filesNotAssessed: 0,
    importBindings: 0,
    explicitTypeImports: 0,
    importsUsedOnlyAsTypes: 0,
    unusedValueImports: 0,
    runtimeReferences: 0,
    typeReferences: 0,
    dynamicMemberReferences: 0,
    runtimeReexports: 0,
    typeReexports: 0,
    sideEffectImports: 0,
  })
  if (usage?.status === 'completed') {
    census.filesAssessed += 1
    for (const binding of usage.bindings) {
      const runtime = binding.references.filter((reference) => reference.kind === 'runtime')
      const types = binding.references.filter((reference) => reference.kind === 'type')
      census.runtimeReferences += runtime.length
      census.typeReferences += types.length
      census.dynamicMemberReferences += runtime.filter(
        (reference) => reference.access === 'dynamic-member',
      ).length
      if (binding.kind === 'reexport')
        census[binding.typeOnly ? 'typeReexports' : 'runtimeReexports'] += 1
      else if (binding.kind === 'side-effect') census.sideEffectImports += 1
      else {
        census.importBindings += 1
        if (binding.typeOnly) census.explicitTypeImports += 1
        else if (runtime.length === 0 && types.length > 0) census.importsUsedOnlyAsTypes += 1
        else if (runtime.length === 0) census.unusedValueImports += 1
      }
    }
  } else census.filesNotAssessed += 1
  if (analysis.targets.web) {
    recordValueDecisions(report, analysis, file)
    const references = (report.reactNativeReferenceDecisions ??= {
      scope: 'web-jsx-tag-emissions',
      nonJsxReferences: 'not-assessed',
      memberCompatibility: 'not-assessed',
      dependencyRemoval: 'not-assessed',
      filesCompleted: 0,
      filesPartial: 0,
      filesFailed: 0,
      filesNotAssessed: 0,
      replacedJsxTags: 0,
      preservedJsxTags: 0,
      removedJsxTags: 0,
      notAssessedReferences: 0,
      unmappedTags: 0,
    })
    const referenceJournal = analysis.targets.web.reactNativeReferences
    const referenceStatus =
      referenceJournal?.status ??
      (analysis.targets.web.status === 'failed' ? 'failed' : 'not-assessed')
    references[
      {
        completed: 'filesCompleted',
        partial: 'filesPartial',
        failed: 'filesFailed',
        'not-assessed': 'filesNotAssessed',
      }[referenceStatus]
    ] += 1
    references.unmappedTags += referenceJournal?.unmappedTags ?? 0
    if (referenceStatus === 'completed') {
      for (const outcome of referenceJournal.outcomes) {
        references[
          {
            'replaced-jsx-tag': 'replacedJsxTags',
            'preserved-jsx-tag': 'preservedJsxTags',
            'removed-jsx-tag': 'removedJsxTags',
            'not-assessed': 'notAssessedReferences',
          }[outcome.disposition]
        ] += 1
      }
    }
    const imports = (report.reactNativeImportDecisions ??= {
      scope: 'web-import-declarations',
      semanticReferences: 'not-assessed',
      memberCompatibility: 'not-assessed',
      dependencyRemoval: 'not-assessed',
      filesCompleted: 0,
      filesPartial: 0,
      filesFailed: 0,
      filesNotAssessed: 0,
      rewrittenBindings: 0,
      retainedBindings: 0,
      typeOnlyBindings: 0,
      notAssessedEdges: 0,
      unmappedDecisions: 0,
    })
    const journal = analysis.targets.web.reactNativeImports
    const status =
      journal?.status ?? (analysis.targets.web.status === 'failed' ? 'failed' : 'not-assessed')
    imports[
      {
        completed: 'filesCompleted',
        partial: 'filesPartial',
        failed: 'filesFailed',
        'not-assessed': 'filesNotAssessed',
      }[status]
    ] += 1
    imports.unmappedDecisions += journal?.unmappedDecisions ?? 0
    // Failed/partial runs retain the journal in JSON, but must not pad the
    // headline successful rewrite counts with edits from an aborted pipeline.
    if (status === 'completed') {
      for (const outcome of journal.outcomes) {
        imports[
          {
            'rewritten-to-hozo': 'rewrittenBindings',
            'retained-react-native': 'retainedBindings',
            'type-only': 'typeOnlyBindings',
            'not-assessed': 'notAssessedEdges',
          }[outcome.disposition]
        ] += 1
      }
    }
  }
  for (const stage of analysis.stages) {
    const key = `${stage.backend}:${stage.stage}`
    report.analysis.stageDurationMs[key] =
      (report.analysis.stageDurationMs[key] ?? 0) + stage.durationMs
    if (stage.status === 'failed') report._compileFailures.add(file)
  }
  for (const finding of analysis.findings) {
    // This is a content hint for later baseline matching, not a unique ID.
    // Identical findings can intentionally share it; location is display data.
    const fingerprint = sha256(
      JSON.stringify([file, finding.backend, finding.code, finding.message, finding.subject]),
    )
    report.findings.push({ file, ...finding, fingerprint })
    const { code, severity } = finding
    report.diagnostics.byCode[code] = (report.diagnostics.byCode[code] ?? 0) + 1
    report.diagnostics.bySeverity[severity] = (report.diagnostics.bySeverity[severity] ?? 0) + 1
    if (severity === 'error') report._filesWithErrors.add(file)
    else if (severity === 'warning') report._filesWithWarnings.add(file)
    const samples = (report.samples[`diagnostic:${code}`] ??= [])
    if (samples.length < 12 && !samples.includes(file)) samples.push(file)
    if (code === 'ANALYSIS_FAILED') {
      const failures = (report.samples.parseOrCompileFailures ??= [])
      if (failures.length < 12)
        failures.push(`${file} [${finding.backend}]: ${finding.message.split('\n')[0]}`)
    }
  }
}

function valueKey(row) {
  return JSON.stringify([row.imported, row.access, row.member, row.disposition, row.replacement])
}

function recordValueDecisions(report, analysis, file) {
  const values = (report.reactNativeValueDecisions ??= {
    scope: 'web-non-jsx-unchanged-module-runs',
    generatedExpressions: 'not-assessed',
    memberCompatibility: 'not-assessed',
    dependencyRemoval: 'not-assessed',
    filesCompleted: 0,
    filesPartial: 0,
    filesFailed: 0,
    filesNotAssessed: 0,
    rewrittenReferences: 0,
    retainedReferences: 0,
    notAssessedReferences: 0,
    typeReferencesExcluded: 0,
    inventory: [],
  })
  const journal = analysis.targets.web.reactNativeValues
  const status =
    journal?.status ?? (analysis.targets.web.status === 'failed' ? 'failed' : 'not-assessed')
  values[
    {
      completed: 'filesCompleted',
      partial: 'filesPartial',
      failed: 'filesFailed',
      'not-assessed': 'filesNotAssessed',
    }[status]
  ] += 1
  // Counts/inventory have the same completed-file denominator. Incomplete
  // journals are preserved per file, never promoted into success or retention.
  if (status !== 'completed') return
  values.typeReferencesExcluded += journal.typeReferencesExcluded
  const fileKeys = new Set()
  for (const outcome of journal.outcomes) {
    values[
      {
        'rewritten-to-hozo': 'rewrittenReferences',
        'remains-react-native': 'retainedReferences',
        'not-assessed': 'notAssessedReferences',
      }[outcome.disposition]
    ] += 1
    const binding = analysis.reactNativeUsage.bindings[outcome.bindingIndex]
    const reference = binding.references[outcome.referenceIndex]
    const identity = {
      imported: binding.imported,
      access: reference.access,
      ...(reference.member !== undefined ? { member: reference.member } : {}),
      disposition: outcome.disposition,
      ...(outcome.replacement ? { replacement: outcome.replacement } : {}),
    }
    const key = valueKey(identity)
    let row = values.inventory.find((item) => valueKey(item) === key)
    if (!row) {
      row = { ...identity, references: 0, files: 0, samples: [] }
      values.inventory.push(row)
    }
    row.references += 1
    if (!fileKeys.has(key)) {
      row.files += 1
      fileKeys.add(key)
      if (row.samples.length < 12) row.samples.push(file)
    }
  }
}

export function escapeMarkdown(text) {
  return String(text)
    .replace(/[\\`*_{}[\]<>()#!|]/g, '\\$&')
    .replace(/\r?\n/g, ' ')
}

export function findingDetails(report, details) {
  const findings = report.findings ?? []
  if (!details) {
    return `${findings.length} complete finding records are available in JSON. Use --details to expand Markdown findings.`
  }
  return (
    findings
      .map((finding) => {
        const { location } = finding
        const where =
          location.status === 'authored'
            ? `${finding.file}:${location.line}:${location.column}`
            : `${finding.file} (${location.status === 'file' ? 'module-wide' : 'authored location unmapped'})`
        return `- ${escapeMarkdown(where)} — ${finding.backend}/${finding.stage}, ${finding.severity}, ${escapeMarkdown(finding.code)}: ${escapeMarkdown(finding.message).replace(/\r?\n/g, ' ')}${finding.subject?.snippet ? `\n  - Authored evidence: ${escapeMarkdown(finding.subject.snippet)}` : ''}`
      })
      .join('\n') || 'No findings.'
  )
}
