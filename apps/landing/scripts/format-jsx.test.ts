import assert from 'node:assert/strict'
import { test } from 'node:test'

import { formatJsx } from '../src/scripts/format-jsx.ts'

test('nested elements go one per line, and a text-only child stays on its line', () => {
  assert.equal(
    formatJsx(
      '<div className="hozo-view hozo-0"><span className="hozo-1">Welcome</span><button className="hozo-2" type="button">Continue</button></div>',
    ),
    [
      '<div className="hozo-view hozo-0">',
      '  <span className="hozo-1">Welcome</span>',
      '  <button className="hozo-2" type="button">Continue</button>',
      '</div>',
    ].join('\n'),
  )
})

test('an arrow function inside an attribute is not mistaken for the end of a tag', () => {
  assert.equal(
    formatJsx(
      '<HozoPressable style={({ pressed }) => [a, pressed && b]} accessibilityRole="button"><Text>Continue</Text></HozoPressable>',
    ),
    // 83 characters as one tag, so its attributes take a line each -- and
    // the `>` of `=>` is still inside the braces rather than ending the tag.
    [
      '<HozoPressable',
      '  style={({ pressed }) => [a, pressed && b]}',
      '  accessibilityRole="button"',
      '>',
      '  <Text>Continue</Text>',
      '</HozoPressable>',
    ].join('\n'),
  )
})

test('a tag too wide for the line puts one attribute on each', () => {
  assert.equal(
    formatJsx('<View style={styles.card} accessibilityRole="header" testID="title" />', 40),
    [
      '<View',
      '  style={styles.card}',
      '  accessibilityRole="header"',
      '  testID="title"',
      '/>',
    ].join('\n'),
  )
})

test('spreads, fragments, strings with brackets and expression children survive', () => {
  assert.equal(
    formatJsx(
      '<><input {...hozoDomProps(props)} placeholder="a > b" /><View>{items.map((item) => <Text>{item}</Text>)}</View></>',
    ),
    [
      '<>',
      '  <input {...hozoDomProps(props)} placeholder="a > b" />',
      '  <View>{items.map((item) => <Text>{item}</Text>)}</View>',
      '</>',
    ].join('\n'),
  )
})

test('laying out output that is already laid out changes nothing', () => {
  const once = formatJsx(
    '<div className="a"><p className="b">One two</p><ul><li>First</li><li>Second</li></ul></div>',
  )
  assert.equal(formatJsx(once), once)
})

test('anything it cannot follow comes back exactly as the compiler wrote it', () => {
  for (const code of ['<div><span>', '<div>text</span>', 'const x = <div', '<div a={b></div>']) {
    assert.equal(formatJsx(code), code)
  }
})
