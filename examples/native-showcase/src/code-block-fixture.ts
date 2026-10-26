import type { CodeLine } from '@hozo/typography/code/model'

export const CODE_BLOCK_COUNTS = [10, 100, 300, 1000] as const

// A fixed token density makes increasing line counts comparable; no highlighter
// or fixture allocation runs inside the measured React update.
export function codeBlockFixture(count: number, revision: number): CodeLine[] {
  return Array.from({ length: count }, (_, index) => ({
    tokens: [
      { text: 'const ', color: '#7c3aed' },
      { text: `item${String(index).padStart(4, '0')}`, color: '#1d4ed8' },
      { text: ' = ', color: '#334155' },
      { text: 'read(', color: '#0369a1' },
      { text: '"value"', color: '#047857' },
      { text: ', ', color: '#334155' },
      { text: String(revision), color: '#b45309' },
      { text: ');', color: '#334155' },
    ],
    mark: index % 10 === 1 ? 'ins' : index % 10 === 2 ? 'del' : undefined,
  }))
}
