import assert from 'node:assert/strict'
import test from 'node:test'
import { activeCaption, prepareCues } from './caption-timeline.ts'
import { parsePlainTextWebVTT, WebVTTParseError } from './webvtt.ts'

const vtt =
  'WEBVTT Original\n\nNOTE comment\nnot a cue\n\nfirst\n00:00.125 --> 00:02.000\nHello &amp; welcome\n日本語\n\n00:01.000 --> 00:03.250\nSecond\n'

test('plain WebVTT handles BOM, LF/CRLF/CR, identifiers, comments, overlap and optional final newline', () => {
  const expected = [
    { start: 0.125, end: 2, text: 'Hello & welcome\n日本語' },
    { start: 1, end: 3.25, text: 'Second' },
  ]
  for (const separator of ['\n', '\r\n', '\r'])
    for (const bom of ['', '\uFEFF'])
      for (const lastNewline of [true, false]) {
        const input = (lastNewline ? vtt : vtt.trimEnd()).replaceAll('\n', separator)
        assert.deepEqual(parsePlainTextWebVTT(bom + input), expected)
      }
  assert.deepEqual(parsePlainTextWebVTT('WEBVTT\n\n'), [])
  assert.deepEqual(parsePlainTextWebVTT('WEBVTT\tcomment\n\nNOTE only comment\n'), [])
  const cues = prepareCues(parsePlainTextWebVTT(vtt))
  assert.equal(
    activeCaption(
      {
        src: 'clip',
        cues: [],
        accessibilityLabel: 'Captions',
        status: {
          src: 'clip',
          status: 'ready',
          playing: false,
          buffering: false,
          currentTime: 1,
          duration: null,
          error: null,
        },
      },
      cues,
    ),
    'Hello & welcome\n日本語\nSecond',
  )
})

test('timestamps retain millisecond precision and accept hour offsets with equal cue starts', () => {
  assert.deepEqual(
    parsePlainTextWebVTT(`WEBVTT

01:02:03.004\t-->\t01:02:04.005
Hour

01:02:03.004 --> 100:00:00.000
Long overlapping cue
`),
    [
      { start: 3723.004, end: 3724.005, text: 'Hour' },
      { start: 3723.004, end: 360000, text: 'Long overlapping cue' },
    ],
  )
})

function failure(input: string, code: WebVTTParseError['code'], line: number) {
  assert.throws(
    () => parsePlainTextWebVTT(input),
    (error: unknown) => {
      assert.ok(error instanceof WebVTTParseError)
      assert.equal(error.name, 'WebVTTParseError')
      assert.equal(error.code, code)
      assert.equal(error.line, line)
      assert.match(error.message, new RegExp(`WebVTT line ${line}:`))
      return true
    },
  )
}

test('invalid signatures, timestamps, ordering, identifiers and missing block separators retain line numbers', () => {
  for (const input of ['', 'webvtt\n\n', ' WEBVTT\n\n', 'WEBVTTsuffix\n\n', 'WEBVTT -->\n\n'])
    failure(input, 'invalid-webvtt', 1)
  failure('WEBVTT\n00:00.000 --> 00:01.000\ntext', 'invalid-webvtt', 2)
  for (const start of [
    '0:01.000',
    '60:00.000',
    '00:60.000',
    '00:01.00',
    '-00:01.000',
    '1:00:00.000',
    '99999999999999:00:00.000',
  ])
    failure(`WEBVTT\n\n${start} --> 00:02.000\ntext`, 'invalid-webvtt', 3)
  for (const timing of [
    '00:01.000-->00:02.000',
    '00:02.000 --> 00:01.000',
    '00:01.000 --> 00:01.000',
  ])
    failure(`WEBVTT\n\n${timing}\ntext`, 'invalid-webvtt', 3)
  failure('WEBVTT\n\nid\nnot timings\ntext', 'invalid-webvtt', 4)
  failure('WEBVTT\n\n00:00.000 --> 00:01.000\n', 'invalid-webvtt', 4)
  failure('WEBVTT\n\n00:00.000 --> 00:01.000\n \t', 'invalid-webvtt', 4)
  failure('WEBVTT\n\n00:00.000 --> 00:01.000\nx\n00:01.000 --> 00:02.000\ny', 'invalid-webvtt', 5)
  failure('WEBVTT\n\nNOTE malformed\n00:00.000 --> 00:01.000', 'invalid-webvtt', 4)
  failure('WEBVTT\n\n00:01.000 --> 00:02.000\na\n\n00:00.000 --> 00:01.000\nb', 'invalid-webvtt', 6)
  failure(
    'WEBVTT\n\nid\n00:00.000 --> 00:01.000\na\n\nid\n00:01.000 --> 00:02.000\nb',
    'invalid-webvtt',
    7,
  )
  failure('WEBVTT\n\n00:00.000 --> 00:01.000\nx\0y', 'invalid-webvtt', 4)
})

test('unsupported layout, markup, karaoke and header mappings never return a partially accepted track', () => {
  const prefix = 'WEBVTT\n\n00:00.000 --> 00:01.000\nvalid first cue\n\n'
  for (const block of ['STYLE\n::cue { color: red }', 'REGION\nid:region'])
    failure(prefix + block, 'unsupported-webvtt', 6)
  for (const settings of [
    'line:0',
    'align:start',
    'position:50%',
    'size:50%',
    'vertical:rl',
    'region:a',
  ])
    failure(`${prefix}00:01.000 --> 00:02.000 ${settings}\ntext`, 'unsupported-webvtt', 6)
  for (const text of [
    '<b>Bold</b>',
    '<v Speaker>Hello',
    '<ruby>語<rt>ご</rt></ruby>',
    'One <00:01.500>two',
    '<script>alert(1)</script>',
  ])
    failure(`${prefix}00:01.000 --> 00:02.000\n${text}`, 'unsupported-webvtt', 7)
  failure('WEBVTT\nX-TIMESTAMP-MAP=LOCAL:00:00:00.000,MPEGTS:900000\n\n', 'unsupported-webvtt', 2)
})

test('six named references decode exactly once and never turn escaped text into markup', () => {
  assert.equal(
    parsePlainTextWebVTT(
      'WEBVTT\n\n00:00.000 --> 00:01.000\n&amp;&lt;b&gt;&nbsp;&lrm;&rlm; &amp;lt;',
    )[0]!.text,
    '&<b>\u00a0\u200e\u200f &lt;',
  )
  for (const text of ['&copy;', '&#38;', '&#x26;', '&amp', 'raw & text'])
    failure(`WEBVTT\n\n00:00.000 --> 00:01.000\n${text}`, 'unsupported-webvtt', 4)
})
