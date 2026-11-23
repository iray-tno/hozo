export { token } from './tokens.js'

export function FixturePanel({ panelClassName, style }) {
  return { type: 'div', props: { className: panelClassName, style } }
}

if (globalThis.__hozoFixtureRender !== true)
  throw new Error('package entries must not execute during analysis')
