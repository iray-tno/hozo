// RFC010 shadow vocabulary, deliberately separate from MANIFEST_VERSION=1.
// Parsing a declaration does not audit its host or authorize caller rewriting.
export const OWNER_SHADOW_VERSION = 'rfc010-owner-shadow-0'

type Gate = { eq: [string, boolean] } | { all: Gate[] } | { any: Gate[] }

export interface OwnerShape {
  id: string
  when: Gate
  nativeHost: 'Pressable' | 'View'
  webHost: 'button' | 'div'
  events: ('pressed' | 'hovered' | 'focused' | 'focusVisible')[]
}

/** A bounded first slice, not yet the complete manifest-v2 schema. */
export interface ShadowOwnerContract {
  owner: string
  classProp: string
  audit: 'unknown'
  /** Symbolic booleans supplied by the owner; never JS expressions. */
  bindings: string[]
  abi: { nativePreparedProp: string; webClassProp: string }
  authoredStyles: { prop: string; order: number }[]
  shapes: OwnerShape[]
}

export interface OwnerContractShadow {
  schema: typeof OWNER_SHADOW_VERSION
  contracts: ShadowOwnerContract[]
}

function fail(at: string): never {
  throw new Error(`Invalid owner shadow: ${at}`)
}

function object(value: unknown, keys: string[], at: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(at)
  const record = value as Record<string, unknown>
  if (
    Object.keys(record).length !== keys.length ||
    !keys.every((key) => Object.hasOwn(record, key))
  )
    fail(`${at} fields`)
  return record
}

function list(value: unknown, max: number, at: string): unknown[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > max) fail(at)
  return value
}

function identifier(value: unknown, at: string): string {
  if (typeof value !== 'string' || !/^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(value)) fail(at)
  return value
}

function unique(values: string[], at: string) {
  if (new Set(values).size !== values.length) fail(`${at} duplicate`)
}

/**
 * Data-only, size/depth/node-bounded reader. Unknown schemas/keys are errors,
 * not empty contracts. No package lookup, config execution or manifest fallback.
 */
export function parseOwnerContractShadow(text: string): OwnerContractShadow {
  if (text.length > 65_536) fail('size')
  let input: unknown
  try {
    input = JSON.parse(text)
  } catch {
    fail('JSON')
  }
  const root = object(input, ['schema', 'contracts'], 'root')
  if (root.schema !== OWNER_SHADOW_VERSION) fail('schema')
  const contracts = list(root.contracts, 32, 'contracts').map((value, index) => {
    const at = `contracts[${index}]`
    const contract = object(
      value,
      ['owner', 'classProp', 'audit', 'bindings', 'abi', 'authoredStyles', 'shapes'],
      at,
    )
    if (
      typeof contract.owner !== 'string' ||
      !/^[A-Za-z][A-Za-z0-9]*\.[A-Za-z][A-Za-z0-9]*$/.test(contract.owner)
    )
      fail(`${at}.owner`)
    identifier(contract.classProp, `${at}.classProp`)
    // This reader cannot promote package claims into independent audit evidence.
    if (contract.audit !== 'unknown') fail(`${at}.audit`)
    const bindings = list(contract.bindings, 32, `${at}.bindings`).map((binding) =>
      identifier(binding, `${at}.binding`),
    )
    unique(bindings, `${at}.bindings`)
    let nodes = 0
    function gate(value: unknown, depth = 0): Gate {
      if (++nodes > 128 || depth > 8) fail(`${at}.gate budget`)
      if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${at}.gate`)
      const keys = Object.keys(value)
      if (keys.length !== 1) fail(`${at}.gate fields`)
      const op = keys[0]!
      const operand = (value as Record<string, unknown>)[op]
      if (op === 'eq') {
        if (
          !Array.isArray(operand) ||
          operand.length !== 2 ||
          !bindings.includes(operand[0]) ||
          typeof operand[1] !== 'boolean'
        )
          fail(`${at}.gate binding`)
        return { eq: [operand[0], operand[1]] }
      }
      if (op !== 'all' && op !== 'any') fail(`${at}.gate operator`)
      const children = list(operand, 32, `${at}.gate operands`).map((child) =>
        gate(child, depth + 1),
      )
      return op === 'all' ? { all: children } : { any: children }
    }
    const abi = object(contract.abi, ['nativePreparedProp', 'webClassProp'], `${at}.abi`)
    const nativePreparedProp = identifier(abi.nativePreparedProp, `${at}.abi.nativePreparedProp`)
    if (!/^hozo[A-Z]/.test(nativePreparedProp)) fail(`${at}.abi private carrier`)
    if (abi.webClassProp !== contract.classProp) fail(`${at}.abi web carrier`)
    const authoredStyles = list(contract.authoredStyles, 16, `${at}.authoredStyles`).map(
      (value) => {
        const author = object(value, ['prop', 'order'], `${at}.author`)
        const prop = identifier(author.prop, `${at}.author.prop`)
        if (prop === nativePreparedProp || prop === contract.classProp)
          fail(`${at}.author carrier collision`)
        if (!Number.isSafeInteger(author.order) || (author.order as number) < 0)
          fail(`${at}.author.order`)
        return { prop, order: author.order as number }
      },
    )
    unique(
      authoredStyles.map((author) => author.prop),
      `${at}.authors`,
    )
    unique(
      authoredStyles.map((author) => String(author.order)),
      `${at}.author order`,
    )
    const shapes = list(contract.shapes, 16, `${at}.shapes`).map((value): OwnerShape => {
      const shape = object(value, ['id', 'when', 'nativeHost', 'webHost', 'events'], `${at}.shape`)
      const id = identifier(shape.id, `${at}.shape.id`)
      if (
        !['Pressable', 'View'].includes(shape.nativeHost as string) ||
        !['button', 'div'].includes(shape.webHost as string)
      )
        fail(`${at}.shape host`)
      if (!Array.isArray(shape.events) || shape.events.length > 4) fail(`${at}.shape events`)
      const events = shape.events as OwnerShape['events']
      if (
        !events.every((event) => ['pressed', 'hovered', 'focused', 'focusVisible'].includes(event))
      )
        fail(`${at}.shape event`)
      unique(events, `${at}.shape events`)
      // Only this prototype's two supported host pairs have application evidence.
      if (shape.nativeHost === 'View' && (shape.webHost !== 'div' || events.length !== 0))
        fail(`${at}.decoration events/host`)
      if (shape.nativeHost === 'Pressable' && shape.webHost !== 'button') fail(`${at}.control host`)
      return {
        id,
        when: gate(shape.when),
        nativeHost: shape.nativeHost as OwnerShape['nativeHost'],
        webHost: shape.webHost as OwnerShape['webHost'],
        events,
      }
    })
    unique(
      shapes.map((shape) => shape.id),
      `${at}.shapes`,
    )
    return {
      owner: contract.owner,
      classProp: contract.classProp as string,
      audit: 'unknown' as const,
      bindings,
      abi: { nativePreparedProp, webClassProp: abi.webClassProp as string },
      authoredStyles,
      shapes,
    }
  })
  unique(
    contracts.map((contract) => `${contract.owner}:${contract.classProp}`),
    'contracts',
  )
  return { schema: OWNER_SHADOW_VERSION, contracts }
}

export type OwnerShapeSelection =
  | { status: 'selected'; shape: OwnerShape }
  | { status: 'absent' }
  | { status: 'unresolved'; possible: string[] }
  | { status: 'ambiguous'; matching: string[] }
  | { status: 'invalid'; binding: string }

/** Shadow inspection only. It does not evaluate/capture caller expressions. */
export function selectOwnerShape(
  contract: ShadowOwnerContract,
  supplied: Readonly<Record<string, unknown>>,
): OwnerShapeSelection {
  const facts = new Map<string, boolean>()
  for (const binding of contract.bindings) {
    const descriptor = Object.getOwnPropertyDescriptor(supplied, binding)
    if (!descriptor) continue
    // The caller/owner captures expressions, not this shadow inspector.
    // Reject accessors without invoking them; snapshot each data value once.
    if (!('value' in descriptor) || typeof descriptor.value !== 'boolean')
      return { status: 'invalid', binding }
    facts.set(binding, descriptor.value)
  }
  function evaluate(gate: Gate): boolean | undefined {
    if ('eq' in gate) {
      const [binding, expected] = gate.eq
      return facts.has(binding) ? facts.get(binding) === expected : undefined
    }
    const values = ('all' in gate ? gate.all : gate.any).map(evaluate)
    if ('all' in gate)
      return values.includes(false) ? false : values.includes(undefined) ? undefined : true
    return values.includes(true) ? true : values.includes(undefined) ? undefined : false
  }
  const evaluated = contract.shapes.map((shape) => ({ shape, result: evaluate(shape.when) }))
  const matching = evaluated.filter(({ result }) => result === true).map(({ shape }) => shape)
  if (matching.length > 1)
    return { status: 'ambiguous', matching: matching.map((shape) => shape.id) }
  if (evaluated.some(({ result }) => result === undefined))
    return {
      status: 'unresolved',
      possible: evaluated.filter(({ result }) => result !== false).map(({ shape }) => shape.id),
    }
  return matching[0] ? { status: 'selected', shape: matching[0] } : { status: 'absent' }
}
