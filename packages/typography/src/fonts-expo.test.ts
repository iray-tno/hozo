import assert from 'node:assert/strict'
import test from 'node:test'

import { defineFonts } from './fonts.ts'
import { createExpoFontOptions } from './fonts-expo.ts'

test('derives the official expo-font plugin shape from the shared manifest', () => {
  const options = createExpoFontOptions(
    defineFonts({
      body: {
        family: 'Inter',
        nativeFamily: { android: 'inter' },
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
    }),
  )

  assert.deepEqual(options, {
    ios: { fonts: ['./fonts/Inter.ttf', './fonts/Inter-Bold.ttf'] },
    android: {
      fonts: [
        {
          fontFamily: 'inter',
          fontDefinitions: [
            { path: './fonts/Inter.ttf', weight: 400, style: 'normal' },
            { path: './fonts/Inter-Bold.ttf', weight: 700, style: 'italic' },
          ],
        },
      ],
    },
  })
})

test('deduplicates files and leaves externally owned platforms alone', () => {
  const options = createExpoFontOptions(
    defineFonts({
      body: {
        family: 'Inter',
        external: ['ios'],
        faces: [
          { sources: { android: './fonts/Inter.ttf' } },
          { sources: { android: './fonts/Inter.ttf' } },
        ],
      },
      system: { family: 'system-ui', external: true },
    }),
  )

  assert.equal(options.ios, undefined)
  assert.deepEqual(options.android?.fonts[0]?.fontDefinitions, [
    { path: './fonts/Inter.ttf', weight: 400, style: 'normal' },
  ])
})

test('refuses descriptors Expo Android cannot represent honestly', () => {
  assert.throws(
    () =>
      createExpoFontOptions(
        defineFonts({
          variable: {
            family: 'Variable',
            faces: [{ sources: { android: './Variable.ttf' }, weight: '100 900' }],
          },
        }),
      ),
    /one static face per weight/,
  )
  assert.throws(
    () =>
      createExpoFontOptions(
        defineFonts({
          oblique: {
            family: 'Oblique',
            faces: [{ sources: { android: './Oblique.ttf' }, style: 'oblique' }],
          },
        }),
      ),
    /normal or italic/,
  )
})
