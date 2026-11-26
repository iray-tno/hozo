// Audits Hozo's Native arbitrary-value results in both directions:
//
// 1. Numerator honesty (`validCovered` vs `unresolvableCovered`):
//    `compareNativeCandidate` marks any class that emits a style or prop as
//    COVERED. For string-valued React Native properties (`backgroundColor`,
//    `filter`, `boxShadow`, `backgroundImage`, `transformOrigin`, etc.), raw
//    arbitrary text like `var(--x)`, `nonsense`, `calc(100% - 2rem)`, or an
//    out-of-grammar argument (`blur(#ff0000)`, `borderColor: '50%'`) reaches
//    React Native without a diagnostic and is silently ignored on device.
//    Counting those as covered inflates the score; this audit separates them
//    explicitly, the same way `canvas.ts` separates `UNRESOLVABLE`.
//
// 2. Denominator honesty (breaking down the 2,192 refusals):
//    `arbitrary-catalog.ts` crosses every Tailwind prefix with 12 probe values
//    and keeps whatever Tailwind emits a rule for (Tailwind validates arbitrary
//    values not at all). Lumping all refusals into one number hides the real
//    React Native ceiling. Each refusal is placed into exactly one bucket:
//    - `contextCovered`: already lowers cleanly in `<View className="grid ...">`
//      or `<Svg><Svg.Rect ... /></Svg>`, which `PROBE_CONTEXTS` does not supply.
//    - `implementable`: valid CSS directly expressible in RN 0.87.1 with zero
//      layout measurement (the real Phase 2 gap list).
//    - `layoutMeasurable`: `%`-mixed `calc()` on an RN-backed length/dimension
//      property, reachable only via opt-in `onLayout` / Fabric measurement.
//    - `dynamicCss`: valid CSS depending on unresolved runtime state outside
//      this scope (`var(--x)`, non-typography `em`, parent `%` font-size,
//      non-layout `vh`).
//    - `webOnly`: CSS property, selector, at-rule, or value with no RN
//      counterpart (checked against RN's `.d.ts` via `auditRefusal`).
//    - `invalidCss`: syntactically or type-invalid CSS produced only because
//      Tailwind accepts unvalidated arbitrary text (e.g. `w-[#ff0000]`,
//      `z-[10px]`, `rounded-[nonsense]`).

import { compileNative } from '@hozo/compiler'
import { auditRefusal } from './audit.ts'
import type { NativeComparison } from './native.ts'

export type ArbitraryNativeAuditBucket =
  | 'validCovered'
  | 'unresolvableCovered'
  | 'contextCovered'
  | 'implementable'
  | 'layoutMeasurable'
  | 'dynamicCss'
  | 'webOnly'
  | 'invalidCss'
  | 'noOp'
  | 'silent'

export interface ArbitraryNativeAuditEntry {
  candidate: string
  bucket: ArbitraryNativeAuditBucket
  reason: string
}

export interface ArbitraryNativeAuditSummary {
  candidates: number
  validCovered: number
  unresolvableCovered: number
  contextCovered: number
  implementable: number
  layoutMeasurable: number
  dynamicCss: number
  webOnly: number
  invalidCss: number
  noOp: number
  silent: number
}

const NAMED_GAPS = new Set([
  'WEB_ONLY_PROPERTY_ON_NATIVE',
  'NOT_WIRED_ON_NATIVE',
  'UNREADABLE_ARBITRARY_VALUE',
])

const NAMED_COLORS = new Set([
  'transparent',
  'currentcolor',
  'black',
  'white',
  'red',
  'green',
  'blue',
  'yellow',
  'orange',
  'purple',
  'pink',
  'gray',
  'grey',
  'cyan',
  'magenta',
  'rebeccapurple',
])

// React Native's C++ string parsers (`filter`, `boxShadow`, `transformOrigin`)
// understand `px` and `0` (not `rem`, `em`, `vh`, or physical units). Typed
// length properties fold `rem`/physical units into JS numbers before emission,
// so any non-px unit surviving inside a quoted RN string is unresolvable.
const RN_STRING_PX_RE = /^-?(?:\d+(?:\.\d+)?|\.\d+)px$|^0$/i
const CSS_LENGTH_RESOLVED_RE = /^-?(?:\d+(?:\.\d+)?|\.\d+)(?:px|rem|in|pc|pt|cm|mm|q)$|^0$/i
const CSS_ANGLE_RE = /^-?(?:\d+(?:\.\d+)?|\.\d+)(?:deg|rad|grad|turn)$|^0$/i
const CSS_NUMBER_OR_PCT_RE = /^-?(?:\d+(?:\.\d+)?|\.\d+)%?$/
const CSS_COLOR_RE =
  /^(?:#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})|(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\([^)]+\))$/i

function isValidCssColorLiteral(value: string): boolean {
  const v = value.trim()
  if (!v || /var\(|calc\(|nonsense/i.test(v)) return false
  if (CSS_COLOR_RE.test(v)) return true
  return NAMED_COLORS.has(v.toLowerCase())
}

function isValidNativeFilter(value: string): boolean {
  const m = /^([a-z-]+)\((.+)\)$/i.exec(value.trim())
  if (!m) return false
  const [, fn, arg] = m
  const a = arg.trim()
  if (/var\(|calc\(|nonsense/i.test(a)) return false
  switch (fn.toLowerCase()) {
    case 'blur':
      return RN_STRING_PX_RE.test(a)
    case 'hue-rotate':
      return CSS_ANGLE_RE.test(a)
    case 'brightness':
    case 'contrast':
    case 'grayscale':
    case 'invert':
    case 'opacity':
    case 'saturate':
    case 'sepia':
      return CSS_NUMBER_OR_PCT_RE.test(a)
    case 'drop-shadow': {
      const parts = a.split(/\s+/)
      return parts.length >= 2 && RN_STRING_PX_RE.test(parts[0]) && RN_STRING_PX_RE.test(parts[1])
    }
    default:
      return false
  }
}

function isValidNativeBoxShadow(value: string): boolean {
  const v = value.trim()
  if (!v || /var\(|calc\(|nonsense/i.test(v)) return false
  const parts = v.split(/\s+/).filter((p) => p.toLowerCase() !== 'inset')
  return parts.length >= 2 && RN_STRING_PX_RE.test(parts[0]) && RN_STRING_PX_RE.test(parts[1])
}

function isValidNativeGradient(value: string): boolean {
  const v = value.trim()
  if (!v || /var\(|calc\(|nonsense/i.test(v)) return false
  // A standalone gradient constructor (`bg-linear-[...]`) emits
  // `linear-gradient(<prelude>, transparent)` or `radial-gradient(<prelude>, transparent)`.
  const m = /^(?:linear|radial)-gradient\(([^,]+),/i.exec(v)
  if (!m) return false
  const prelude = m[1].trim()
  if (/^to\s+(?:top|bottom|left|right)(?:\s+(?:top|bottom|left|right))?$/i.test(prelude)) {
    return true
  }
  if (CSS_ANGLE_RE.test(prelude)) return true
  if (/^(?:circle|ellipse|at\s+)/i.test(prelude)) return true
  return false
}

function isValidNativeTransformOrigin(value: string): boolean {
  const v = value.trim()
  if (!v || /var\(|calc\(|nonsense/i.test(v)) return false
  const keywords = new Set(['top', 'bottom', 'left', 'right', 'center'])
  return v
    .split(/\s+/)
    .every(
      (part) =>
        keywords.has(part.toLowerCase()) ||
        RN_STRING_PX_RE.test(part) ||
        /^-?(?:\d+(?:\.\d+)?|\.\d+)%$/.test(part),
    )
}

/**
 * Checks whether the Native output emitted for a covered candidate contains an
 * unresolvable or invalid value that React Native would silently ignore.
 */
export function findUnresolvableInNativeOutput(styles: string, jsx: string): string | undefined {
  const combined = `${styles}\n${jsx}`
  // Explicit unresolved markers or CSS functions RN cannot evaluate at runtime.
  if (/\bhozo-unresolved:/.test(combined)) return 'emits hozo-unresolved marker'
  if (/['"][^'"]*\bvar\(--[^'"]*['"]/.test(combined)) return 'emits unresolved CSS var()'
  if (/['"][^'"]*\bcalc\([^'"]*['"]/.test(combined)) return 'emits unresolved CSS calc()'
  if (/['"][^'"]*\bnonsense\b[^'"]*['"]/.test(combined)) return 'emits invalid `nonsense` literal'

  // Inspect string-typed RN style pairs inside `StyleSheet.create(...)`.
  const pairRe = /\b([a-zA-Z]+)\s*:\s*'([^']*)'/g
  for (const match of styles.matchAll(pairRe)) {
    const [, key, value] = match
    if (
      key === 'color' ||
      key === 'backgroundColor' ||
      key === 'outlineColor' ||
      key === 'textDecorationColor' ||
      (key.startsWith('border') && key.endsWith('Color'))
    ) {
      if (!isValidCssColorLiteral(value)) {
        return `emits invalid RN color \`${key}: '${value}'\``
      }
    } else if (key === 'filter') {
      if (!isValidNativeFilter(value)) {
        return `emits invalid RN filter \`filter: '${value}'\``
      }
    } else if (key === 'boxShadow') {
      if (!isValidNativeBoxShadow(value)) {
        return `emits invalid RN boxShadow \`boxShadow: '${value}'\``
      }
    } else if (key === 'backgroundImage') {
      if (!isValidNativeGradient(value)) {
        return `emits invalid RN backgroundImage \`backgroundImage: '${value}'\``
      }
    } else if (key === 'transformOrigin') {
      if (!isValidNativeTransformOrigin(value)) {
        return `emits invalid RN transformOrigin \`transformOrigin: '${value}'\``
      }
    } else if ((key === 'translateX' || key === 'translateY') && value === 'auto') {
      return `emits invalid RN transform \`${key}: 'auto'\``
    } else if (key.startsWith('border') && key.endsWith('Width')) {
      return `emits non-numeric RN borderWidth \`${key}: '${value}'\``
    } else if ((key === 'maxWidth' || key === 'maxHeight') && value === 'auto') {
      return `emits invalid CSS \`${key}: 'auto'\``
    }
  }

  // Inspect JSX string color props (`placeholderTextColor`, `cursorColor`, `fill`, `stroke`),
  // emitted as either `prop="value"` or `prop={'value'}`.
  const propRe = /\b(placeholderTextColor|cursorColor|fill|stroke)=(?:"([^"]*)"|\{'([^']*)'\})/g
  for (const match of jsx.matchAll(propRe)) {
    const prop = match[1]
    const value = match[2] ?? match[3] ?? ''
    if (!isValidCssColorLiteral(value)) {
      return `emits invalid RN color prop \`${prop}="${value}"\``
    }
  }

  return undefined
}

const COVERED_PROBES = [
  (c: string) =>
    `import { View } from '@hozo/core'\nexport function C() { return <View className="${c}">x</View> }\n`,
  (c: string) =>
    `import { Text } from '@hozo/core'\nexport function C() { return <Text className="${c}">x</Text> }\n`,
  (c: string) =>
    `import { View, Text } from '@hozo/core'\nexport function C() { return <View className="text-lg"><Text className="${c}">x</Text></View> }\n`,
  (c: string) =>
    `import { TextInput } from '@hozo/core'\nexport function C() { return <TextInput className="${c}" accessibilityLabel="Field" /> }\n`,
]

function inspectCoveredCandidate(candidate: string): string | undefined {
  let sawClean = false
  let firstProblem: string | undefined
  for (const render of COVERED_PROBES) {
    const result = compileNative(render(candidate))[0]
    if (!result) continue
    if (result.diagnostics.some((d) => NAMED_GAPS.has(d.code))) continue
    const problem = findUnresolvableInNativeOutput(result.styles ?? '', result.jsx ?? '')
    if (!problem) {
      sawClean = true
      break
    }
    firstProblem ??= problem
  }
  return sawClean ? undefined : firstProblem
}

function parseCandidate(candidate: string): {
  kind: 'arbitrary-variant' | 'arbitrary-property' | 'var-shorthand' | 'arbitrary-value' | 'other'
  prefix: string
  value: string
} {
  if (candidate.startsWith('[') && candidate.includes(']:')) {
    const cut = candidate.indexOf(']:')
    return {
      kind: 'arbitrary-variant',
      prefix: candidate.slice(0, cut + 1),
      value: candidate.slice(cut + 2),
    }
  }
  if (candidate.startsWith('[') && candidate.endsWith(']')) {
    return { kind: 'arbitrary-property', prefix: candidate, value: candidate }
  }
  const v4 = /^(.+)-\((--.+)\)$/.exec(candidate)
  if (v4) {
    return { kind: 'var-shorthand', prefix: v4[1], value: v4[2] }
  }
  const m = /^(.+)-\[(.+)\]$/.exec(candidate)
  if (m) {
    return { kind: 'arbitrary-value', prefix: m[1], value: m[2] }
  }
  return { kind: 'other', prefix: candidate, value: '' }
}

/**
 * Probes specialized Native contexts (`grid` container and `<Svg>`) that the
 * generic `View`/`Text` conformance probe omits.
 */
function probeSpecializedContext(candidate: string, prefix: string): string | undefined {
  let source: string | undefined
  let label: string | undefined
  if (prefix === 'grid-cols' || prefix === 'grid-rows') {
    label = 'HozoGrid container'
    source =
      `import { View } from '@hozo/core'\n` +
      `export function C() { return <View className="grid ${candidate}"><View /></View> }\n`
  } else if (prefix === 'fill' || prefix === 'stroke') {
    label = '<Svg> shape'
    source =
      `import { Svg } from '@hozo/svg'\n` +
      `export function C() { return <Svg><Svg.Rect className="${candidate}" /></Svg> }\n`
  }
  if (!source || !label) return undefined
  const result = compileNative(source)[0]
  if (!result) return undefined
  if (result.diagnostics.some((d) => NAMED_GAPS.has(d.code))) return undefined
  if (findUnresolvableInNativeOutput(result.styles ?? '', result.jsx ?? '')) return undefined
  // Verify the candidate actually changed output (for grid, HozoGrid appears; for Svg, fill/stroke prop appears).
  if (label === 'HozoGrid container' && !result.jsx.includes('HozoGrid')) return undefined
  if (label === '<Svg> shape' && !/\b(?:fill|stroke|strokeWidth)=/.test(result.jsx)) {
    return undefined
  }
  return label
}

const PADDING_PREFIXES = new Set([
  'p',
  'px',
  'py',
  'pt',
  'pr',
  'pb',
  'pl',
  'ps',
  'pe',
  'pbs',
  'pbe',
])
const GAP_PREFIXES = new Set(['gap', 'gap-x', 'gap-y'])
const ROUNDED_PREFIXES = new Set([
  'rounded',
  'rounded-t',
  'rounded-b',
  'rounded-l',
  'rounded-r',
  'rounded-tl',
  'rounded-tr',
  'rounded-bl',
  'rounded-br',
  'rounded-s',
  'rounded-e',
  'rounded-ss',
  'rounded-se',
  'rounded-es',
  'rounded-ee',
])
const SCALE_PREFIXES = new Set(['scale', 'scale-x', 'scale-y'])
// RN-backed properties whose CSS `<length-percentage>` resolves `%` against
// parent or self box dimensions (eligible for Phase 3 `onLayout` / Fabric `calc()`).
const BOX_LENGTH_PERCENTAGE_RN_PREFIXES = new Set([
  'w',
  'h',
  'size',
  'min-w',
  'min-h',
  'max-w',
  'max-h',
  'min-block',
  'min-inline',
  'max-block',
  'max-inline',
  'block',
  'inline',
  'basis',
  'm',
  'mx',
  'my',
  'mt',
  'mr',
  'mb',
  'ml',
  'ms',
  'me',
  'mbs',
  'mbe',
  'top',
  'right',
  'bottom',
  'left',
  'start',
  'end',
  'inset',
  'inset-x',
  'inset-y',
  'inset-s',
  'inset-e',
  'inset-bs',
  'inset-be',
  ...PADDING_PREFIXES,
  ...GAP_PREFIXES,
  ...ROUNDED_PREFIXES,
  'translate',
  'translate-x',
  'translate-y',
  'space-x',
  'space-y',
  'grid-cols',
  'grid-rows',
])
// RN-backed properties where `%` in `calc()` is valid CSS (`<length-percentage>`)
// but resolves against font metrics or a gradient line rather than box layout.
const NON_BOX_PERCENTAGE_RN_PREFIXES = new Set(['text', 'leading', 'from', 'via', 'to'])
// RN-backed length-only properties: `em` and `vh` are valid CSS `<length>`,
// whereas `%`-mixed `calc(100%-2rem)` is invalid CSS (`<line-width>` / `<length>`).
const LENGTH_ONLY_RN_PREFIXES = new Set([
  'divide-x',
  'divide-y',
  'border',
  'border-t',
  'border-r',
  'border-b',
  'border-l',
  'border-x',
  'border-y',
  'border-s',
  'border-e',
  'border-bs',
  'border-be',
  'outline',
  'outline-offset',
  'ring',
  'inset-ring',
  'ring-offset',
  'tracking',
  'backdrop-blur',
])
const LAYOUT_OR_LENGTH_RN_PREFIXES = new Set([
  ...BOX_LENGTH_PERCENTAGE_RN_PREFIXES,
  ...NON_BOX_PERCENTAGE_RN_PREFIXES,
  ...LENGTH_ONLY_RN_PREFIXES,
])
const STANDALONE_TRANSFORM_OR_SPECIAL = new Set([
  'scale',
  'scale-x',
  'scale-y',
  'translate',
  'translate-x',
  'translate-y',
  'rotate',
  'rotate-x',
  'rotate-y',
  'rotate-z',
  'skew',
  'skew-x',
  'skew-y',
  // Note: CSS `perspective` applies to a container's 3D children, whereas
  // RN's `transform: [{ perspective }]` applies to the element itself
  // (equivalent to `transform: perspective(...)`). Keep `perspective-*`
  // Web-only here, matching named `perspective-dramatic`/`perspective-normal`
  // and StyleX's `perspective`.
  'backdrop-blur',
  'ring-offset',
  'grid-cols',
  'grid-rows',
  'fill',
  'stroke',
  'caret',
  'placeholder',
])

function isValidLengthToken(value: string): boolean {
  return CSS_LENGTH_RESOLVED_RE.test(value) || value === '1.5em' || value === '100vh'
}

function classifyRefusedCandidate(
  candidate: string,
  oracleBlock: string | undefined,
  vars: Map<string, string>,
): ArbitraryNativeAuditEntry {
  const parsed = parseCandidate(candidate)

  if (parsed.kind === 'arbitrary-variant') {
    return {
      candidate,
      bucket: 'webOnly',
      reason: 'CSS selector or at-rule has no React Native counterpart',
    }
  }
  if (parsed.kind === 'arbitrary-property') {
    if (candidate === '[color:red]') {
      return {
        candidate,
        bucket: 'implementable',
        reason: 'known RN StyleSheet property (`color`) written as an arbitrary property',
      }
    }
    return {
      candidate,
      bucket: 'webOnly',
      reason: 'CSS custom property or Web-only property with no RN counterpart',
    }
  }
  if (parsed.kind === 'var-shorthand') {
    return {
      candidate,
      bucket: 'dynamicCss',
      reason: 'CSS custom property (`var(--...)`) has no RN cascade',
    }
  }

  const { prefix, value } = parsed

  // 1. Check specialized contexts (`grid` container / `<Svg>`) first.
  const contextLabel = probeSpecializedContext(candidate, prefix)
  if (contextLabel) {
    return {
      candidate,
      bucket: 'contextCovered',
      reason: `already lowers cleanly inside ${contextLabel}`,
    }
  }

  // 2. Check RN `.d.ts` via `auditRefusal` to identify properties RN lacks altogether.
  const typeAudit = auditRefusal(candidate, oracleBlock, vars)
  const missingStyleKey =
    typeAudit.verdict === 'CONFIRMED' &&
    typeAudit.inexpressible.length > 0 &&
    typeAudit.inexpressible.every((entry) => entry.includes('no such style key'))

  if (missingStyleKey && !STANDALONE_TRANSFORM_OR_SPECIAL.has(prefix)) {
    return {
      candidate,
      bucket: 'webOnly',
      reason: `RN has no style key (${typeAudit.inexpressible[0]})`,
    }
  }

  // Known Web-only features even when RN shares a wider outer style key.
  if (
    prefix === 'bg-conic' ||
    (prefix.startsWith('backdrop-') && prefix !== 'backdrop-blur') ||
    prefix.startsWith('mask-') ||
    prefix === 'mask' ||
    prefix === 'text-shadow' ||
    prefix === 'transition' ||
    prefix === 'scale-z' ||
    prefix === 'translate-z' ||
    prefix === 'underline-offset' ||
    prefix === 'decoration' ||
    prefix === 'accent' ||
    prefix === 'order' ||
    prefix === 'columns' ||
    prefix === 'col-span' ||
    prefix === 'row-span' ||
    prefix === 'indent' ||
    prefix.startsWith('border-spacing') ||
    prefix.startsWith('scroll-') ||
    prefix.startsWith('scrollbar-')
  ) {
    return {
      candidate,
      bucket: 'webOnly',
      reason: `\`${prefix}-*\` has no React Native counterpart`,
    }
  }

  // `bg-[10px|2rem|50%|auto|100vh]` lowers to `background-position` / `background-size` in Tailwind.
  if (prefix === 'bg' && ['10px', '2rem', '50%', 'auto', '100vh'].includes(value)) {
    return {
      candidate,
      bucket: 'webOnly',
      reason: 'resolves to CSS background-position/background-size, which RN lacks',
    }
  }

  // 3. Direct zero-cost RN 0.87.1 implementable gaps (Phase 2 worklist).
  if (
    (PADDING_PREFIXES.has(prefix) && value === '50%') ||
    (GAP_PREFIXES.has(prefix) && value === '50%') ||
    (ROUNDED_PREFIXES.has(prefix) && value === '50%') ||
    (SCALE_PREFIXES.has(prefix) && (value === '1.5' || value === '50%')) ||
    (prefix === 'translate' && (value === '10px' || value === '2rem' || value === '50%')) ||
    (prefix === 'aspect' && value === '1.5') ||
    (prefix === 'opacity' && value === '50%') ||
    (prefix === 'flex' && (value === '1.5' || value === 'auto')) ||
    (prefix === 'align' && value === 'auto') ||
    (prefix === 'cursor' && value === 'auto') ||
    (prefix === 'backdrop-blur' && value === '2rem') ||
    ((prefix === 'grid-cols' || prefix === 'grid-rows') && value === '2rem') ||
    (prefix === 'stroke' && (value === '10px' || value === '2rem')) ||
    (prefix === 'ring-offset' &&
      (value === '10px' || value === '2rem' || value === '#ff0000' || value === 'rgb(0_0_0)'))
  ) {
    return {
      candidate,
      bucket: 'implementable',
      reason: 'valid CSS directly expressible in React Native 0.87.1 without layout measurement',
    }
  }

  // 4. `%`-mixed `calc()` on RN-backed box `<length-percentage>` properties
  //    (Phase 3 opt-in `onLayout` / Fabric measurement).
  if (value === 'calc(100%-2rem)' && BOX_LENGTH_PERCENTAGE_RN_PREFIXES.has(prefix)) {
    return {
      candidate,
      bucket: 'layoutMeasurable',
      reason:
        'requires parent/self layout measurement (`onLayout` / Fabric) to evaluate `%` in `calc()`',
    }
  }
  if (value === 'calc(100%-2rem)' && NON_BOX_PERCENTAGE_RN_PREFIXES.has(prefix)) {
    return {
      candidate,
      bucket: 'dynamicCss',
      reason: '`%` in `calc()` resolves against font metrics or gradient line, not layout box',
    }
  }
  if (value === 'calc(100%-2rem)' && LENGTH_ONLY_RN_PREFIXES.has(prefix)) {
    return {
      candidate,
      bucket: 'invalidCss',
      reason: `\`${prefix}\` accepts CSS <length>, not <length-percentage> \`calc(100%-2rem)\``,
    }
  }

  // 5. Dynamic CSS runtime state outside zero-cost static scope.
  if (value === 'var(--x)') {
    return {
      candidate,
      bucket: 'dynamicCss',
      reason: 'CSS custom property (`var(--x)`) has no RN cascade',
    }
  }
  if (value === '1.5em' && LAYOUT_OR_LENGTH_RN_PREFIXES.has(prefix)) {
    return {
      candidate,
      bucket: 'dynamicCss',
      reason: 'font-relative `em` outside text metrics has no RN font-size context',
    }
  }
  if (prefix === 'text' && value === '50%') {
    return {
      candidate,
      bucket: 'dynamicCss',
      reason: 'percentage `font-size` depends on parent font size',
    }
  }
  if (value === '100vh' && LAYOUT_OR_LENGTH_RN_PREFIXES.has(prefix)) {
    return {
      candidate,
      bucket: 'dynamicCss',
      reason: 'viewport-relative `vh` on non-layout property (out of viewport-hook scope)',
    }
  }
  if (
    value === 'calc(100%-2rem)' &&
    (SCALE_PREFIXES.has(prefix) ||
      prefix.startsWith('rotate') ||
      prefix.startsWith('skew') ||
      prefix === 'opacity' ||
      prefix === 'grow' ||
      prefix === 'shrink' ||
      prefix === 'z' ||
      prefix === 'aspect' ||
      prefix === 'flex' ||
      prefix === 'font' ||
      prefix === 'line-clamp' ||
      prefix === 'transform' ||
      prefix === 'stroke' ||
      prefix === 'fill' ||
      prefix === 'align' ||
      prefix === 'cursor')
  ) {
    // `% - rem` is a length expression, which is type-invalid on unitless/angle/color/keyword props.
    return {
      candidate,
      bucket: 'invalidCss',
      reason: `length \`calc()\` is invalid for \`${prefix}\``,
    }
  }

  // 6. Special Web-only value restrictions on valid CSS keywords.
  if (prefix === 'aspect' && value === 'auto') {
    return {
      candidate,
      bucket: 'webOnly',
      reason: 'React Native `aspectRatio` does not support CSS `auto`',
    }
  }
  if (prefix === 'font' && value === 'auto') {
    return {
      candidate,
      bucket: 'invalidCss',
      reason: '`font-family: auto` is not a valid font family',
    }
  }
  if (prefix === 'bg' && value === '1.5em') {
    return {
      candidate,
      bucket: 'webOnly',
      reason: 'resolves to CSS `background-position`, which RN lacks',
    }
  }
  if (prefix === 'bg' && value === 'calc(100%-2rem)') {
    return {
      candidate,
      bucket: 'webOnly',
      reason: 'resolves to CSS `background-position`, which RN lacks',
    }
  }

  // Everything left on an RN-backed prefix is a synthetic catalog type mismatch
  // (e.g. `nonsense`, color on length, length on z-index/rotate/scale/opacity,
  // bare `1.5` on length, `auto` on padding/radius/gap/line-clamp).
  if (
    value === 'nonsense' ||
    !isValidLengthToken(value) ||
    !LAYOUT_OR_LENGTH_RN_PREFIXES.has(prefix)
  ) {
    return {
      candidate,
      bucket: 'invalidCss',
      reason: `\`${value}\` is not a valid CSS value for \`${prefix}\``,
    }
  }

  return {
    candidate,
    bucket: 'invalidCss',
    reason: `\`${value}\` is invalid for \`${prefix}\``,
  }
}

export function auditArbitraryNative(
  results: NativeComparison[],
  oracleRules: Map<string, string>,
  vars: Map<string, string>,
): { entries: ArbitraryNativeAuditEntry[]; summary: ArbitraryNativeAuditSummary } {
  const entries: ArbitraryNativeAuditEntry[] = []
  const summary: ArbitraryNativeAuditSummary = {
    candidates: results.length,
    validCovered: 0,
    unresolvableCovered: 0,
    contextCovered: 0,
    implementable: 0,
    layoutMeasurable: 0,
    dynamicCss: 0,
    webOnly: 0,
    invalidCss: 0,
    noOp: 0,
    silent: 0,
  }

  for (const result of results) {
    let entry: ArbitraryNativeAuditEntry
    if (result.verdict === 'COVERED') {
      const problem = inspectCoveredCandidate(result.candidate)
      entry = problem
        ? { candidate: result.candidate, bucket: 'unresolvableCovered', reason: problem }
        : { candidate: result.candidate, bucket: 'validCovered', reason: 'valid RN output' }
    } else if (result.verdict === 'NO_OP') {
      entry = {
        candidate: result.candidate,
        bucket: 'noOp',
        reason: result.detail ?? 'paints nothing standalone on either platform',
      }
    } else if (result.verdict === 'SILENT') {
      entry = {
        candidate: result.candidate,
        bucket: 'silent',
        reason: result.detail ?? 'emitted nothing without a diagnostic',
      }
    } else {
      entry = classifyRefusedCandidate(result.candidate, oracleRules.get(result.candidate), vars)
    }
    entries.push(entry)
    summary[entry.bucket] += 1
  }

  return { entries, summary }
}
