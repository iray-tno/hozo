import assert from 'node:assert/strict'
import test from 'node:test'

import { createFontFaceCss, defineFonts, fontFamily } from './fonts.ts'

test('one logical family carries Web and platform-specific Native names', () => {
  const fonts = defineFonts({
    body: {
      family: 'Inter',
      nativeFamily: { ios: 'InterVariable', android: 'inter' },
      faces: [
        {
          sources: {
            web: [{ url: '/assets/inter.woff2', format: 'woff2' }],
            ios: './assets/Inter.ttf',
            android: './assets/Inter.ttf',
          },
          weight: '100 900',
        },
      ],
    },
  })

  assert.equal(fontFamily(fonts, 'body', 'web'), 'Inter')
  assert.equal(fontFamily(fonts, 'body', 'ios'), 'InterVariable')
  assert.equal(fontFamily(fonts, 'body', 'android'), 'inter')
  assert.equal(fontFamily(fonts, 'missing', 'web'), undefined)
})

test('Web emission is deterministic, safe, and deduplicated', () => {
  const face = {
    sources: { web: [{ url: '/fonts/inter "latin".woff2', format: 'woff2' as const }] },
    weight: 400,
    style: 'normal' as const,
    display: 'optional' as const,
    unicodeRange: ['U+0000-00FF', 'u+0131'],
  }
  const css = createFontFaceCss(
    defineFonts({
      body: { family: 'Inter', faces: [face, face] },
      heading: { family: 'Inter', faces: [face] },
    }),
  )

  assert.equal(css.match(/@font-face/g)?.length, 1)
  assert.match(css, /font-family: "Inter";/)
  assert.match(css, /url\("\/fonts\/inter \\"latin\\"\.woff2"\) format\("woff2"\)/)
  assert.match(css, /font-weight: 400;/)
  assert.match(css, /font-display: optional;/)
  assert.match(css, /unicode-range: U\+0000-00FF, U\+0131;/)
})

test('externally managed platforms emit and load nothing', () => {
  const fonts = defineFonts({
    body: { family: 'Inter', external: true },
    nativeOnly: {
      family: 'Native Sans',
      external: ['web'],
      faces: [{ sources: { ios: './NativeSans.ttf', android: './NativeSans.ttf' } }],
    },
  })
  assert.equal(createFontFaceCss(fonts), '')
})

test('invalid manifests fail before a build produces partial platform setup', () => {
  assert.throws(() => defineFonts({}), /cannot be empty/)
  assert.throws(
    () => defineFonts({ 'not a key': { family: 'Inter', external: true } }),
    /logical font identifier/,
  )
  assert.throws(
    () => defineFonts({ body: { family: 'Inter', faces: [{ sources: {}, weight: 0 }] } }),
    /integer from 1 through 1000/,
  )
  assert.throws(
    () =>
      defineFonts({
        body: {
          family: 'Inter',
          external: ['web'],
          faces: [{ sources: { web: [{ url: './Inter.woff2' }] } }],
        },
      }),
    /externally managed on Web/,
  )
  assert.throws(
    () =>
      defineFonts({
        body: {
          family: 'Inter',
          faces: [{ sources: { web: [{ url: './Inter.woff2' }] }, unicodeRange: 'latin' }],
        },
      }),
    /Invalid Unicode range/,
  )
})
