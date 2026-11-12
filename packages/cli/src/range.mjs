// Enough of npm's version ranges to check a peer floor, without a
// dependency: `hozo --help` loads nothing, and `square` should stay as
// light. It reads `*`, `x`, `^`, `~`, the comparators, partial versions
// (`>=0.87`), space for "and" and `||` for "or". Anything else is
// `undefined`, which the caller reports as unreadable rather than guessing.
//
// A prerelease compares as its release: `0.87.0-rc.1` meets `>=0.87`. npm
// would refuse it, but a project on a release candidate wants its floor
// checked, not a finding about the range syntax.

const PART = String.raw`(\d+|[xX*])`
const VERSION = new RegExp(
  String.raw`^v?${PART}(?:\.${PART})?(?:\.${PART})?(?:-[\w.-]+)?(?:\+[\w.-]+)?$`,
)

/** `[major, minor, patch]`, or `undefined` for something that is not a version. */
export function parseVersion(text) {
  const match = VERSION.exec(text.trim())
  if (!match || match.slice(1).some((part) => part !== undefined && !/^\d+$/.test(part)))
    return undefined
  return match.slice(1).map((part) => Number(part ?? 0))
}

const compare = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]

/** A partial version: its numbers, and how many of the three were given. */
function partial(text) {
  const match = VERSION.exec(text)
  if (!match) return undefined
  const given = []
  for (const part of match.slice(1)) {
    if (part === undefined || !/^\d+$/.test(part)) break
    given.push(Number(part))
  }
  return { numbers: [...given, 0, 0, 0].slice(0, 3), given: given.length }
}

/** The version just past every version `partial` matches: `1.2` -> `1.3.0`. */
function next({ numbers, given }) {
  if (given === 0) return undefined
  const bumped = numbers.slice(0, given)
  bumped[given - 1] += 1
  return [...bumped, 0, 0].slice(0, 3)
}

/** Comparators `[operator, version]` that must all hold, or `undefined`. */
function comparators(text) {
  const result = []
  for (const token of text.trim().split(/\s+/).filter(Boolean)) {
    const [, operator = '', rest] = /^(\^|~|>=|<=|>|<|=)?(.*)$/.exec(token)
    const version = partial(rest)
    if (!version) return undefined
    const upper = next(version)
    if (operator === '^') {
      // The first non-zero part given is the one that may not change.
      const fixed = version.numbers.findIndex((number) => number !== 0)
      const at = fixed === -1 || fixed >= version.given ? version.given : fixed + 1
      result.push(['>=', version.numbers])
      if (at > 0) result.push(['<', next({ numbers: version.numbers, given: at })])
    } else if (operator === '~') {
      result.push(['>=', version.numbers])
      if (version.given > 0)
        result.push(['<', next({ numbers: version.numbers, given: Math.min(version.given, 2) })])
    } else if (operator === '>=') result.push(['>=', version.numbers])
    else if (operator === '>') {
      if (version.given < 3) {
        if (upper) result.push(['>=', upper])
        else return undefined // `>*` matches nothing; not a real peer range
      } else result.push(['>', version.numbers])
    } else if (operator === '<=') {
      if (version.given < 3) {
        if (upper) result.push(['<', upper])
      } else result.push(['<=', version.numbers])
    } else if (operator === '<') result.push(['<', version.numbers])
    else {
      result.push(['>=', version.numbers])
      if (upper)
        result.push([
          version.given === 3 ? '<=' : '<',
          version.given === 3 ? version.numbers : upper,
        ])
    }
  }
  return result
}

const holds = (version, [operator, bound]) => {
  const order = compare(version, bound)
  return operator === '>='
    ? order >= 0
    : operator === '>'
      ? order > 0
      : operator === '<='
        ? order <= 0
        : order < 0
}

/**
 * Whether `version` is in `range`: `true`, `false`, or `undefined` when either
 * cannot be read.
 */
export function satisfies(version, range) {
  const parsed = parseVersion(version)
  if (!parsed) return undefined
  const alternatives = range.split('||').map(comparators)
  if (alternatives.some((alternative) => alternative === undefined)) return undefined
  return alternatives.some((alternative) => alternative.every((bound) => holds(parsed, bound)))
}
