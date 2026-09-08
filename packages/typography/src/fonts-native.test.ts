import assert from 'node:assert/strict'
import test from 'node:test'
import { defineFonts } from './fonts.ts'
import { createNativeFontPlan } from './fonts-native.ts'

test('creates deterministic bare React Native registration plans', () => {
  const fonts = defineFonts({
    body: {
      family: 'Inter',
      nativeFamily: { ios: 'InterVariable', android: 'inter' },
      faces: [
        {
          sources: { ios: './fonts/Inter.ttf', android: './fonts/Inter.ttf' },
          weight: 'normal',
        },
        {
          sources: { ios: './fonts/Inter-Bold.ttf', android: './fonts/Inter-Bold.ttf' },
          weight: 'bold',
          style: 'italic',
        },
      ],
    },
  })

  assert.deepEqual(createNativeFontPlan(fonts, 'android'), {
    platform: 'android',
    files: ['./fonts/Inter.ttf', './fonts/Inter-Bold.ttf'],
    families: [
      {
        id: 'body',
        family: 'inter',
        faces: [
          { path: './fonts/Inter.ttf', weight: 400, style: 'normal' },
          { path: './fonts/Inter-Bold.ttf', weight: 700, style: 'italic' },
        ],
      },
    ],
  })
})

test('deduplicates files and skips externally registered platform families', () => {
  const fonts = defineFonts({
    shared: {
      family: 'Shared',
      faces: [
        { sources: { ios: './fonts/shared.ttf' } },
        { sources: { ios: './fonts/shared.ttf' }, weight: 700 },
      ],
    },
    system: { family: 'System', external: ['ios'] },
  })

  assert.deepEqual(createNativeFontPlan(fonts, 'ios'), {
    platform: 'ios',
    files: ['./fonts/shared.ttf'],
    families: [
      {
        id: 'shared',
        family: 'Shared',
        faces: [
          { path: './fonts/shared.ttf', weight: 400, style: 'normal' },
          { path: './fonts/shared.ttf', weight: 700, style: 'normal' },
        ],
      },
    ],
  })
})
