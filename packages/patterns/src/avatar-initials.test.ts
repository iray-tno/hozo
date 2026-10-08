import assert from 'node:assert/strict'
import { test } from 'node:test'
import { avatarInitials } from './avatar-initials.ts'

test('a name in words gives the first letters of its first and last words', () => {
  assert.equal(avatarInitials('Ada Lovelace'), 'AL')
  assert.equal(avatarInitials('  grace   brewster murray hopper '), 'GH')
  assert.equal(avatarInitials('Tanao'), 'T')
})

test('a name written without spaces gives its first character', () => {
  assert.equal(avatarInitials('田中太郎'), '田')
  assert.equal(avatarInitials('김민준'), '김')
  // With a space, as Japanese names are sometimes written in Latin order.
  assert.equal(avatarInitials('田中 太郎'), '田太')
})

test('a letter is a grapheme, not a code unit', () => {
  assert.equal(avatarInitials('Émile Zola'), 'ÉZ')
  // `E` followed by a combining acute accent: one letter, kept whole.
  assert.equal(avatarInitials('E\u0301mile Zola'), 'E\u0301Z')
  assert.equal(avatarInitials('👩‍💻 Dev'), '👩‍💻D')
})

test('case follows the locale', () => {
  assert.equal(avatarInitials('ilker ibrahim', 'tr'), 'İİ')
})

test('nothing to abbreviate gives nothing', () => {
  assert.equal(avatarInitials(''), '')
  assert.equal(avatarInitials('   '), '')
})
