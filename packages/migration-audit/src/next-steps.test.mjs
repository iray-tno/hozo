import assert from 'node:assert/strict'
import test from 'node:test'

import { nextSteps, nextStepsMarkdown } from './next-steps.mjs'

function report(overrides = {}) {
  return {
    findings: [],
    lowering: { parseOrCompileFailures: 0, filesWithDirectReactNativeJsxResidueOnWeb: 0 },
    reactNativeJsxResidueImports: {},
    samples: {},
    reactNativeValueDecisions: { inventory: [] },
    ...overrides,
  }
}

function finding(file, code, severity = 'warning', backend = 'web', message = `${code}. More.`) {
  return { file, code, severity, backend, message }
}

test('steps come in the order one unblocks the next, and only the ones that apply', () => {
  const steps = nextSteps(
    report({
      lowering: { parseOrCompileFailures: 1, filesWithDirectReactNativeJsxResidueOnWeb: 1 },
      samples: { parseOrCompileFailures: ['src/broken.tsx [web]: Unexpected token'] },
      reactNativeJsxResidueImports: { SectionList: 2 },
      findings: [
        finding('a.tsx', 'FLEX_DIRECTION_UNSAID'),
        finding('a.tsx', 'RN_COMPAT_NOT_INSTALLED'),
        finding('b.tsx', 'DYNAMIC_PROP_NOT_RESOLVED', 'error'),
      ],
      reactNativeImportDecisions: { rewrittenBindings: 2 },
      reactNativeValueDecisions: {
        inventory: [
          {
            imported: 'Linking',
            member: 'openURL',
            disposition: 'remains-react-native',
            references: 3,
            files: 2,
            memberContract: { nextAction: 'Pick a navigation integration.' },
          },
          {
            imported: 'Platform',
            member: 'OS',
            disposition: 'rewritten-to-hozo',
            references: 5,
            files: 4,
            memberContract: { nextAction: 'Check the Web branch.' },
          },
        ],
      },
    }),
  )
  const heads = steps.map((step) => step.match(/^\*\*(.+?)\*\*/)[1])
  assert.deepEqual(heads, [
    'Make 1 file parse.',
    'Replace the React Native components left in Web output.',
    'Fix the errors.',
    "Add `@hozo/rn-compat` to the application's dependencies.",
    'Decide what replaces the APIs still on React Native.',
    'Review the warnings, most widespread first.',
    'Check the APIs Hozo moved to its own adapters.',
    'Optionally, write the import moves into the source.',
  ])
  assert.match(steps[0], /src\/broken\.tsx \[web\]: Unexpected token/)
  assert.match(steps[1], /`SectionList` \(2\)/)
  assert.match(steps[4], /\| `Linking\.openURL` \| 3 \| 2 \| Pick a navigation integration\. \|/)
  // The compat warning is its own step, not a row among the warnings.
  assert.doesNotMatch(steps[5], /RN_COMPAT_NOT_INSTALLED/)
  assert.match(steps[6], /`Platform\.OS`/)
  assert.match(steps[7], /2 React Native imports .* `--fix --write` applies it/)
})

test('no import moved, no --fix step', () => {
  for (const decisions of [undefined, { rewrittenBindings: 0 }]) {
    assert.deepEqual(nextSteps(report({ reactNativeImportDecisions: decisions })), [])
  }
})

test('a warning raised for both backends in one file counts as one file', () => {
  const [step] = nextSteps(
    report({
      findings: [
        finding('a.tsx', 'FLEX_DIRECTION_UNSAID', 'warning', 'web', 'Say a direction. Long why.'),
        finding('a.tsx', 'FLEX_DIRECTION_UNSAID', 'warning', 'native'),
        finding('b.tsx', 'FLEX_DIRECTION_UNSAID', 'warning', 'web'),
        finding('c.tsx', 'A11Y_DUPLICATE_ID', 'warning', 'web'),
      ],
    }),
  )
  const rows = step.split('\n').filter((line) => line.startsWith('| `'))
  assert.deepEqual(rows, [
    '| `FLEX_DIRECTION_UNSAID` | 2 | native, web | Say a direction. | `a.tsx`, `b.tsx` |',
    '| `A11Y_DUPLICATE_ID` | 1 | web | A11Y\\_DUPLICATE\\_ID. | `c.tsx` |',
  ])
})

test('long lists are cut and say where the rest is', () => {
  const findings = Array.from({ length: 12 }, (_, index) =>
    finding(`f${index}.tsx`, `CODE_${String(index).padStart(2, '0')}`),
  )
  findings.push(...['x.tsx', 'y.tsx', 'z.tsx', 'w.tsx'].map((file) => finding(file, 'CODE_00')))
  const [step] = nextSteps(report({ findings }))
  assert.equal(step.split('\n').filter((line) => line.startsWith('| `')).length, 10)
  assert.match(step, /2 more codes in Diagnostics below\./)
  assert.match(step, /`f0\.tsx`, `w\.tsx`, `x\.tsx` and 2 more/)
})

test('nothing to do says so without claiming the app is correct', () => {
  const markdown = nextStepsMarkdown(report())
  assert.match(markdown, /^## Next steps/)
  assert.match(markdown, /not proof the app renders correctly/)
})

test('tables inside a step stay inside its list item', () => {
  const markdown = nextStepsMarkdown(report({ findings: [finding('a.tsx', 'X')] }))
  const lines = markdown.split('\n')
  const start = lines.findIndex((line) => line.startsWith('1. '))
  for (const line of lines.slice(start + 1)) {
    assert.ok(line === '' || line.startsWith('   '), JSON.stringify(line))
  }
})
