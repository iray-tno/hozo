// The normalizer is the load-bearing part of the whole comparison: if it
// mis-resolves, every reported match and diff downstream is suspect. These
// pin its behavior directly, including the cases where it must refuse to
// resolve rather than guess.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { normalize } from './normalize.ts'

const vars = new Map<string, string>([
  ['--spacing', '0.25rem'],
  ['--color-blue-500', 'oklch(62.3% 0.214 259.815)'],
  ['--text-xl', '1.25rem'],
  ['--text-xl--line-height', 'calc(1.75 / 1.25)'],
  ['--radius-lg', '0.5rem'],
])

function decls(block: string) {
  return Object.fromEntries(normalize(block, vars).declarations)
}

test('resolves var() and calc() into pixels', () => {
  assert.deepEqual(decls('padding: calc(var(--spacing) * 4);'), {
    'padding-top': '16px',
    'padding-right': '16px',
    'padding-bottom': '16px',
    'padding-left': '16px',
  })
})

test('expands the flex shorthand so 1 and 1 1 0% agree', () => {
  assert.deepEqual(decls('flex: 1;'), decls('flex: 1 1 0%;'))
  assert.deepEqual(decls('flex: auto;'), {
    'flex-grow': '1',
    'flex-shrink': '1',
    'flex-basis': 'auto',
  })
  assert.deepEqual(decls('flex: none;'), {
    'flex-grow': '0',
    'flex-shrink': '0',
    'flex-basis': 'auto',
  })
})

test('expands box shorthands to longhands, including 2-value form', () => {
  assert.deepEqual(decls('margin: 4px 8px;'), {
    'margin-top': '4px',
    'margin-right': '8px',
    'margin-bottom': '4px',
    'margin-left': '8px',
  })
  assert.deepEqual(decls('inset: 0px;'), { top: '0', right: '0', bottom: '0', left: '0' })
})

test('a shorthand and its longhands normalize identically', () => {
  assert.deepEqual(
    decls('padding: 16px;'),
    decls('padding-top: 16px; padding-right: 16px; padding-bottom: 16px; padding-left: 16px;'),
  )
})

test('resolves color custom properties', () => {
  assert.deepEqual(decls('background-color: var(--color-blue-500);'), {
    'background-color': 'oklch(62.3% 0.214 259.815)',
  })
})

test('folds a unitless line-height ratio against the font size in the same rule', () => {
  // Tailwind's text-xl: font-size 1.25rem, line-height calc(1.75/1.25).
  assert.deepEqual(
    decls(
      'font-size: var(--text-xl); line-height: var(--tw-leading, var(--text-xl--line-height));',
    ),
    { 'font-size': '20px', 'line-height': '28px' },
  )
})

test('resolves --tw-border-style to its registered initial value', () => {
  assert.deepEqual(decls('border-style: var(--tw-border-style); border-width: 1px;'), {
    'border-top-style': 'solid',
    'border-right-style': 'solid',
    'border-bottom-style': 'solid',
    'border-left-style': 'solid',
    'border-top-width': '1px',
    'border-right-width': '1px',
    'border-bottom-width': '1px',
    'border-left-width': '1px',
  })
})

test('expands the border-style shorthand to per-side longhands', () => {
  // Tailwind writes the shorthand; Hozo emits per-side longhands so that
  // `border-t` can scope its style to one edge.
  assert.deepEqual(
    decls('border-style: solid;'),
    decls(
      'border-top-style: solid; border-right-style: solid; border-bottom-style: solid; border-left-style: solid;',
    ),
  )
})

test('treats zero as unit-agnostic', () => {
  assert.deepEqual(decls('top: 0px;'), decls('top: 0;'))
})

test('normalizes rem to px', () => {
  assert.deepEqual(decls('border-radius: var(--radius-lg);'), { 'border-radius': '8px' })
})

test('reports unresolvable values instead of guessing', () => {
  // An unknown custom property with no fallback must not resolve to
  // something invented. It yields no declaration either way; what matters
  // is which kind of nothing it is.
  //
  // A `--tw-*` register with no default is a slot another utility fills,
  // so the declaration is inert rather than unknown -- see
  // `unfilledRegisters`. That distinction is the whole point: inert is a
  // claim (this paints nothing), unknown is a refusal to claim.
  const inert = normalize('box-shadow: var(--tw-shadow);', vars)
  assert.equal(inert.declarations.size, 0)
  assert.deepEqual(inert.unresolved, [])

  // Anything else unresolved is still reported, so a resolution bug can't
  // hide as "it paints nothing". It is now *also* kept as a declaration,
  // resolved as far as it goes: a value only a browser can reduce still
  // says something, and two sides that reduce to the same text agree.
  // `unresolved` names it so the comparison can say the agreement was
  // textual.
  const unknown = normalize('box-shadow: var(--shadow-of-doubt);', vars)
  assert.deepEqual([...unknown.declarations], [['box-shadow', 'var(--shadow-of-doubt)']])
  assert.deepEqual(unknown.unresolved, ['box-shadow'])
})

test('an irreducible value is still compared, in the shorthand it expands to', () => {
  // `margin: var(--x)` and four `margin-*: var(--x)` are one declaration
  // written two ways, and Tailwind writes the first where Hozo writes the
  // second. Neither reduces to a number and both reduce to the same four.
  assert.deepEqual(
    normalize('margin: var(--x);', vars).declarations,
    new Map([
      ['margin-top', 'var(--x)'],
      ['margin-right', 'var(--x)'],
      ['margin-bottom', 'var(--x)'],
      ['margin-left', 'var(--x)'],
    ]),
  )
})

test('a box shorthand splits where CSS splits it, not on every space', () => {
  // `calc(100% - 32px)` is one value carrying two spaces. Splitting there
  // gave a top of `calc(100%`, a right of `-` and a bottom of `32px)`.
  assert.deepEqual(
    normalize('padding: calc(100% - 32px);', vars).declarations,
    new Map([
      ['padding-top', 'calc(100% - 32px)'],
      ['padding-right', 'calc(100% - 32px)'],
      ['padding-bottom', 'calc(100% - 32px)'],
      ['padding-left', 'calc(100% - 32px)'],
    ]),
  )
})

test('folds the factors and terms that need no arithmetic', () => {
  // Tailwind's reversible spacing is `calc(X * var(--tw-space-x-reverse))`
  // and its ring spread is `calc(X + var(--tw-ring-offset-width))`, and
  // both registers are zero unless another utility fills them.
  // `evaluateArithmetic` cannot fold either -- it needs one unit across
  // every term, and `100vh * 0` and `2rem + 0px` have two.
  assert.deepEqual(decls('width: calc(100vh * 0);'), { width: '0' })
  assert.deepEqual(decls('width: calc(100vh * calc(1 - 0));'), { width: '100vh' })
  assert.deepEqual(decls('width: calc(2rem + 0px);'), { width: '32px' })
  assert.deepEqual(decls('width: calc(calc(100% - 32px) + 0px);'), { width: 'calc(100% - 32px)' })
  // A negative number is not a subtraction: CSS requires spaces around a
  // real `-` operator, and this must not read `-0.025em` as one.
  assert.deepEqual(decls('letter-spacing: calc(-0.025em * -1);'), { 'letter-spacing': '0.025em' })
})

test('an unresolvable var does not stop the ones after it', () => {
  // Tailwind's `mask-image` is three registers in a row. Returning at the
  // author's own `var(--x)` inside the first left the other two spelled
  // `--tw-`, `unfilledRegisters` read them as unfilled slots, and the
  // whole declaration was dropped -- so `mask-t-from-[var(--x)]` compared
  // as if Tailwind painted no mask at all.
  const scoped = new Map([['--known', 'red']])
  const out = normalize('color: var(--unknown) var(--known);', scoped)
  assert.deepEqual([...out.declarations], [['color', 'var(--unknown) red']])
})

test('declines to fold calc() mixing incompatible units', () => {
  const result = normalize('width: calc(100% - 4px);', vars)
  assert.equal(result.unresolved.length, 1)
})

test('resolves registers assigned in the same rule that references them', () => {
  // Tailwind sets `--tw-blur` and reads it back in the very next
  // declaration; the assignment isn't output to compare, but it has to be
  // in scope first.
  assert.deepEqual(decls('--tw-blur: blur(8px); filter: var(--tw-blur,) var(--tw-brightness,);'), {
    filter: 'blur(8px)',
  })
})

test('resolves a long var() chain without truncating the tail', () => {
  // Regression: each pass resolves one var(), and Tailwind's `filter`
  // chains nine. A depth cap of 8 left the last one unresolved, which
  // showed up as a bogus SKIP rather than an obviously wrong value.
  const nine = Array.from({ length: 9 }, (_, i) => `var(--slot-${i},)`).join(' ')
  const withVars = new Map(vars)
  withVars.set('--slot-8', 'blur(8px)')
  const result = normalize(`filter: ${nine};`, withVars)
  assert.equal(result.unresolved.length, 0)
  assert.equal(result.declarations.get('filter'), 'blur(8px)')
})

test('drops fully transparent box-shadow layers', () => {
  // Tailwind always splices its ring/inset-ring registers into box-shadow;
  // unset they are `0 0 #0000`, which paints nothing.
  assert.deepEqual(decls('box-shadow: 0 0 #0000, 0 0 #0000, 0 1px 3px 0 rgb(0 0 0 / 0.1);'), {
    'box-shadow': '0 1px 3px 0 rgb(0 0 0 / 0.1)',
  })
})

test('skips Tailwind runtime register declarations', () => {
  // `--tw-*` assignments feed later declarations; they are not output to
  // compare on their own.
  assert.deepEqual(decls('--tw-leading: 1; line-height: 1;'), { 'line-height': '1' })
})

test('folds calc arithmetic in em, where the unit is shared', () => {
  // Every term shares one unit, so the arithmetic is exact whatever that
  // unit means -- no font size needed. Excluding `em` here left all six
  // `-tracking-*` unresolvable on Tailwind's side, which hid a real Hozo
  // gap behind a harness limitation.
  const vars = new Map([['--tracking-tight', '-0.025em']])
  const out = normalize('letter-spacing: calc(var(--tracking-tight) * -1);', vars)
  assert.deepEqual(out.unresolved, [])
  assert.equal(out.declarations.get('letter-spacing'), '0.025em')
})

test('an unfilled --tw- register means the declaration paints nothing', () => {
  // `bg-conic` is `conic-gradient(var(--tw-gradient-stops))`, and the stops
  // only exist once a `from-*` is written beside it. Standalone the
  // declaration is invalid at computed-value time and the browser drops it,
  // so reporting it as inert is what lets the comparison call it
  // composition-only rather than making no claim at all.
  const out = normalize('background-image: conic-gradient(var(--tw-gradient-stops));', new Map())
  assert.deepEqual(out.unresolved, [])
  assert.equal(out.declarations.size, 0)
})

test('a theme variable that fails to resolve is still reported', () => {
  // Only Tailwind's own registers are treated as slots. A missing theme
  // lookup is a resolution bug, and excusing it as "inert" would hide it.
  const out = normalize('color: var(--color-nonexistent);', new Map())
  assert.equal(out.unresolved.length, 1)
})
