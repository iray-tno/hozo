// The class lists in `hozo show` (RFC 011 §5): for each `className` (or class
// slot), how it reaches the output, and what became of each class in it.
//
// Read from evidence the compiler already reports, not inferred from its
// output: the Tailwind plan of a compile against the project's Tailwind
// snapshot (which candidates Tailwind generates a rule for, and which are
// guarded by a condition), and the compiler's own reason React Native refuses
// a class. That compile is for the evidence only. Its output is not what
// `show` prints, which stays the REPL's unordered compile.

const RUNTIME = 'DYNAMIC_CLASS_NAME_NOT_RESOLVED'
const NOT_WIRED = 'NOT_WIRED_ON_NATIVE'

/** `line:column`, 1-based, of a UTF-16 offset. */
function position(text, offset) {
  const before = text.slice(0, offset)
  return {
    line: before.split('\n').length,
    column: offset - (before.lastIndexOf('\n') + 1) + 1,
  }
}

/** The classes of the attribute at `offset`, when it is a string literal. */
function literalClasses(source, offset) {
  const match = /^[\w-]+\s*=\s*(?:\{\s*)?(["'`])([^"'`$]*)\1/.exec(source.slice(offset))
  return match ? match[2].split(/\s+/).filter(Boolean) : undefined
}

/**
 * The class lists of `source`. Resolves to `{ status: 'assessed', lists }`,
 * or `{ status: 'skipped', reason }` when the evidence cannot be had: the
 * rest of the report does not depend on it.
 */
export async function classLists({ source, root, css, diagnostics, nativeDiagnostics, platforms }) {
  let sites
  let refusal
  let owned = []
  let components
  try {
    const [{ loadProjectTailwindSnapshot }, compiler] = await Promise.all([
      import('@hozo/tailwind'),
      import('@hozo/compiler'),
    ])
    const snapshot = await loadProjectTailwindSnapshot(root, css === undefined ? {} : { css })
    const order = await snapshot.prepareOrder(compiler.scanTailwindOrderCandidates(source))
    const planned = compiler.createCompiler({ colors: [], ...snapshot.theme, preflight: true })
    planned.setTailwindOrder(JSON.stringify(order.snapshot))
    sites = planned
      .compile(source, undefined, { tailwindPlan: true })
      .flatMap((component) => component.tailwindPlan?.sites ?? [])
    refusal = compiler.tailwindClassesNativeRefusal
    // Which lists a pattern owner resolves with its own state, as the
    // Native backend emitted them; and which are handed to a component.
    if (platforms.includes('native'))
      owned = planned
        .compileNative(source, undefined, { tailwindPlan: true })
        .flatMap((component) => component.tailwindPlan?.ownerCallbacks ?? [])
    components = planned.componentClassLists(source)
  } catch (error) {
    return {
      status: 'skipped',
      reason: `The compiler's class evidence could not be had: ${String(error?.message ?? error).split('\n')[0]}`,
    }
  }

  // A site spans its element; its blocks name the attribute they came from
  // (`inputStart`), so a list is one attribute's blocks, wherever reported.
  const inputs = new Map()
  for (const site of sites)
    for (const block of site.blocks) {
      if (block.inputStart === undefined || !block.candidate) continue
      const input = inputs.get(block.inputStart) ?? { site, blocks: new Map() }
      input.blocks.set(block.candidate, block)
      inputs.set(block.inputStart, input)
    }

  const lists = []
  for (const [offset, input] of inputs) {
    const candidates = [...input.blocks.values()]
    const written = literalClasses(source, offset)
    // A class React Native cannot draw in isolation may still be lowered in
    // context (`grid` on a View becomes HozoGrid), so a refusal counts only
    // when this compile's Native diagnostics say it.
    const refused = refusal(candidates.map((block) => block.candidate)).map((reason) =>
      reason && nativeDiagnostics.some(({ message }) => message.startsWith(reason)) ? reason : null,
    )
    // A variant the element cannot answer on Native (`hover:` on a View) is
    // said once per element, at its opening tag: the innermost site that
    // starts before this attribute and contains it.
    const element = sites
      .filter(({ spanStart, spanEnd }) => spanStart < offset && offset < spanEnd)
      .reduce(
        (inner, next) => (inner && inner.spanStart > next.spanStart ? inner : next),
        undefined,
      )
    const unwired = (candidate) => {
      // Every variant in the chain: `md:hover:` is unwired by its `hover:`.
      const variants = candidate.split(':').slice(0, -1)
      return nativeDiagnostics.find(
        ({ code, spanStart, message }) =>
          code === NOT_WIRED &&
          spanStart === element?.spanStart &&
          variants.some((variant) => message.startsWith(`\`${variant}:\``)),
      )
    }
    const classes = candidates.map((block, index) => {
      const generated = block.status === 'described'
      const entry = { class: block.candidate, conditional: block.guarded }
      const notWired = platforms.includes('native') && generated && unwired(block.candidate)
      if (platforms.includes('web')) entry.web = generated ? 'compiled' : 'not-generated'
      if (platforms.includes('native'))
        entry.native = !generated
          ? 'not-generated'
          : refused[index]
            ? 'refused'
            : notWired
              ? 'not-wired'
              : 'compiled'
      if (!generated) entry.reason = 'Tailwind generates no rule for it with this theme'
      else if (platforms.includes('native') && refused[index]) entry.reason = refused[index]
      else if (notWired) entry.reason = notWired.message.split(';')[0]
      return entry
    })
    // A literal class Tailwind does not know: kept in the Web class
    // attribute for the project's own CSS; React Native has no class names.
    const known = new Set(candidates.map((block) => block.candidate))
    for (const name of written ?? [])
      if (!known.has(name)) {
        const entry = { class: name, conditional: false }
        if (platforms.includes('web')) entry.web = 'passed-through'
        if (platforms.includes('native')) entry.native = 'ignored'
        entry.reason =
          'Not a Tailwind class: the Web keeps it for your own CSS, Native has no classes'
        classes.push(entry)
      }
    const { site } = input
    lists.push({
      offset,
      ...position(source, offset),
      prop: site.classProp,
      route: owned.some(
        (callback) =>
          callback.classProp === site.classProp && callback.spanStart === site.spanStart,
      )
        ? 'owner-callback'
        : candidates.some((block) => block.guarded)
          ? 'compiled-conditional'
          : 'compiled',
      classes,
    })
  }
  // What the compiler could not read has no blocks: its own diagnostic says
  // where, and each backend says it once.
  const runtime = new Set(
    diagnostics.filter(({ code }) => code === RUNTIME).map(({ spanStart }) => spanStart),
  )
  for (const offset of runtime)
    lists.push({
      offset,
      ...position(source, offset),
      prop: 'className',
      route: 'runtime',
      classes: [],
    })
  // Handed to a component the compiler does not lower: the component
  // resolves it, in its own file's compile or on device.
  for (const list of components)
    lists.push({
      offset: list.spanStart,
      ...position(source, list.spanStart),
      prop: list.prop,
      route: 'component',
      component: list.element,
      classes: [],
    })
  lists.sort((a, b) => a.offset - b.offset)
  for (const list of lists) delete list.offset
  return { status: 'assessed', lists }
}

const ROUTES = {
  compiled: 'compiled',
  'compiled-conditional': 'compiled, some under a condition',
  'owner-callback': "compiled; its pattern owner applies it with the owner's state",
  component: 'handed to <%>, which resolves it',
  runtime: 'resolved at runtime: the compiler cannot read it',
}

/** The text report's section: each list, and each class not compiled everywhere. */
export function classListLines(evidence) {
  if (evidence.status === 'skipped') return [`  ${evidence.reason}`]
  if (!evidence.lists.length) return ['  none']
  const lines = []
  for (const list of evidence.lists) {
    const clean = list.classes.filter((entry) =>
      ['web', 'native'].every((platform) => (entry[platform] ?? 'compiled') === 'compiled'),
    )
    const count = list.classes.length
    lines.push(
      `  ${list.line}:${list.column} ${list.prop}: ${ROUTES[list.route].replace('%', list.component)}${
        count ? `; ${clean.length} of ${count} class${count === 1 ? '' : 'es'} compiled` : ''
      }`,
    )
    for (const entry of list.classes) {
      if (clean.includes(entry)) continue
      const where = ['web', 'native']
        .filter((platform) => entry[platform] && entry[platform] !== 'compiled')
        .map((platform) => `${platform === 'web' ? 'Web' : 'Native'} ${entry[platform]}`)
        .join(', ')
      lines.push(`    ${entry.class}: ${where} -- ${entry.reason}`)
    }
  }
  return lines
}
