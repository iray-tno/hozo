import assert from 'node:assert/strict'
import test from 'node:test'
import { formatFileSize, isAccepted, sortFiles } from './file-rules.ts'

const file = (name: string, size: number, type = '') => ({ name, size, type })

test('accept takes a MIME type, a family, or an extension, and no accept takes anything', () => {
  assert.equal(isAccepted(file('a.png', 1, 'image/png'), ['image/png']), true)
  assert.equal(isAccepted(file('a.jpg', 1, 'image/jpeg'), ['image/*']), true)
  assert.equal(
    isAccepted(file('A.PDF', 1, ''), ['.pdf']),
    true,
    'by name, ignoring case, when there is no type',
  )
  assert.equal(isAccepted(file('a.gif', 1, 'image/gif'), ['image/png', '.pdf']), false)
  assert.equal(isAccepted(file('a.gif', 1, 'image/gif'), undefined), true)
})

test('a pick is sorted into files kept and reasons, in order', () => {
  const { accepted, rejected } = sortFiles(
    [
      file('photo.png', 2_400_000, 'image/png'),
      file('anim.gif', 10, 'image/gif'),
      file('huge.png', 20_000_000, 'image/png'),
      file('empty.png', 0, 'image/png'),
      file('second.png', 100, 'image/png'),
    ],
    { accept: ['image/png'], maxSize: 10_000_000, minSize: 1, multiple: true, maxFiles: 1 },
  )
  assert.deepEqual(
    accepted.map((f) => f.name),
    ['photo.png'],
  )
  assert.deepEqual(
    rejected.map((r) => [r.file.name, r.reason]),
    [
      ['anim.gif', 'type'],
      ['huge.png', 'too-large'],
      ['empty.png', 'too-small'],
      ['second.png', 'too-many'],
    ],
  )
})

test('without multiple, one file is kept and the rest are too many', () => {
  const { accepted, rejected } = sortFiles([file('a.txt', 1), file('b.txt', 1)], {})
  assert.deepEqual(
    accepted.map((f) => f.name),
    ['a.txt'],
  )
  assert.deepEqual(
    rejected.map((r) => r.reason),
    ['too-many'],
  )
})

test('sizes are said in decimal units, one decimal above a kilobyte', () => {
  assert.equal(formatFileSize(900, 'en-US'), '900 byte')
  assert.equal(formatFileSize(2_400_000, 'en-US'), '2.4 MB')
  assert.equal(formatFileSize(1_500, 'en-US'), '1.5 kB')
  assert.equal(formatFileSize(3_000_000_000, 'en-US'), '3 GB')
})
