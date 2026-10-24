// Keep data-driven code rendering out of apps that only use semantic text.

export type { CodeLine, CodeMark, CodeRange, CodeToken } from './code/model.ts'
export { CodeLines, type CodeLinesProps } from './code-lines.tsx'
export * from './text.tsx'
