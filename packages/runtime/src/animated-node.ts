/**
 * The entire React Native Animated private-node compatibility boundary lives here.
 * Keep callers structural: Animated does not expose a public Web value-reading API.
 */
interface AnimatedNodeCandidate {
  __getValue?: unknown
  addListener?: unknown
  removeListener?: unknown
}

type AnimatedListener = (state: { value: unknown }) => void
type ListenerId = string | number

const warnedCapabilities = new WeakMap<object, Set<string>>()

function isDevelopment() {
  return typeof process === 'undefined' || process.env.NODE_ENV !== 'production'
}

function warnOnce(node: object, code: string, message: string) {
  if (!isDevelopment()) return
  const warnings = warnedCapabilities.get(node) ?? new Set<string>()
  if (warnings.has(code)) return
  warnings.add(code)
  warnedCapabilities.set(node, warnings)
  console.warn(`[hozo:${code}] ${message}`)
}

function asCandidate(value: unknown): (AnimatedNodeCandidate & object) | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const candidate = value as AnimatedNodeCandidate & object
  if (
    '__getValue' in candidate ||
    typeof candidate.addListener === 'function' ||
    typeof candidate.removeListener === 'function'
  ) {
    return candidate
  }
  return undefined
}

function readNode(
  node: AnimatedNodeCandidate & object,
): { ok: true; value: unknown } | { ok: false } {
  if (typeof node.__getValue !== 'function') {
    warnOnce(
      node,
      'ANIMATED_GETTER_MISSING',
      'An Animated-like style value has no callable __getValue(). The value was omitted; use a React Native/RNW-compatible Animated node.',
    )
    return { ok: false }
  }
  try {
    return { ok: true, value: node.__getValue() }
  } catch (error) {
    const detail = error instanceof Error && error.message ? ` (${error.message})` : ''
    warnOnce(
      node,
      'ANIMATED_GETTER_FAILED',
      `An Animated style node threw while Hozo read __getValue()${detail}. The value was omitted.`,
    )
    return { ok: false }
  }
}

function collectCandidates(
  value: unknown,
  nodes: Set<AnimatedNodeCandidate & object>,
  seen: Set<object>,
) {
  const candidate = asCandidate(value)
  if (candidate) {
    nodes.add(candidate)
    return
  }
  if (typeof value !== 'object' || value === null || seen.has(value)) return
  seen.add(value)
  for (const part of Array.isArray(value) ? value : Object.values(value)) {
    collectCandidates(part, nodes, seen)
  }
}

function resolveValue(
  value: unknown,
  seen: Map<object, unknown>,
  resolvingNodes: Set<object>,
): unknown {
  const candidate = asCandidate(value)
  if (candidate) {
    if (resolvingNodes.has(candidate)) {
      warnOnce(
        candidate,
        'ANIMATED_VALUE_CYCLE',
        'An Animated style node resolved to itself. The cyclic value was omitted.',
      )
      return undefined
    }
    const result = readNode(candidate)
    if (!result.ok) return undefined
    resolvingNodes.add(candidate)
    const resolved = resolveValue(result.value, seen, resolvingNodes)
    resolvingNodes.delete(candidate)
    return resolved
  }
  if (typeof value !== 'object' || value === null) return value
  const known = seen.get(value)
  if (known !== undefined) return known
  if (Array.isArray(value)) {
    const resolved: unknown[] = []
    seen.set(value, resolved)
    for (const part of value) resolved.push(resolveValue(part, seen, resolvingNodes))
    return resolved
  }
  const resolved: Record<string, unknown> = {}
  seen.set(value, resolved)
  for (const [key, part] of Object.entries(value)) {
    resolved[key] = resolveValue(part, seen, resolvingNodes)
  }
  return resolved
}

export function resolveAnimatedStyle(value: unknown): unknown {
  return resolveValue(value, new Map(), new Set())
}

/** Subscribe to every structurally compatible node and return one idempotent cleanup. */
export function subscribeAnimatedStyle(value: unknown, redraw: () => void): () => void {
  const nodes = new Set<AnimatedNodeCandidate & object>()
  collectCandidates(value, nodes, new Set())
  const cleanups: Array<() => void> = []

  for (const node of nodes) {
    // Resolution reports this incompatibility. Do not compound it by retaining
    // a listener for a value we cannot ever read.
    if (typeof node.__getValue !== 'function') continue
    if (typeof node.addListener !== 'function') continue
    if (typeof node.removeListener !== 'function') {
      warnOnce(
        node,
        'ANIMATED_REMOVE_LISTENER_MISSING',
        'An Animated style node exposes addListener() without removeListener(). Hozo did not subscribe because the listener could not be cleaned up.',
      )
      continue
    }
    try {
      const addListener = node.addListener as (listener: AnimatedListener) => ListenerId | undefined
      const id = addListener.call(node, () => redraw())
      if (id === undefined) {
        warnOnce(
          node,
          'ANIMATED_LISTENER_ID_MISSING',
          'Animated addListener() returned no listener id. Hozo could not retain a safely removable subscription.',
        )
        continue
      }
      const removeListener = node.removeListener as (id: ListenerId) => void
      let active = true
      cleanups.push(() => {
        if (!active) return
        active = false
        try {
          removeListener.call(node, id)
        } catch (error) {
          const detail = error instanceof Error && error.message ? ` (${error.message})` : ''
          warnOnce(
            node,
            'ANIMATED_REMOVE_LISTENER_FAILED',
            `Animated removeListener() threw during cleanup${detail}.`,
          )
        }
      })
    } catch (error) {
      const detail = error instanceof Error && error.message ? ` (${error.message})` : ''
      warnOnce(node, 'ANIMATED_ADD_LISTENER_FAILED', `Animated addListener() threw${detail}.`)
    }
  }

  return () => {
    for (const cleanup of cleanups) cleanup()
  }
}
