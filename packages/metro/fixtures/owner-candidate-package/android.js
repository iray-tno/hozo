export { token } from './tokens.js'

export function FixturePanel({ panelClassName, hozoFixturePanelStyle, style }) {
  return {
    type: 'View',
    props: { className: panelClassName, style: [hozoFixturePanelStyle?.({}), style] },
  }
}

if (globalThis.__hozoFixtureRender !== true)
  throw new Error('Android package entry must not execute during analysis')
