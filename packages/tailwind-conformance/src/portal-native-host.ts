// Real Native portal source with React/native hosts injected, not a portal model.
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { transformSync } from 'esbuild'
import type { ComponentType, ReactNode } from 'react'

const require = createRequire(import.meta.url)

export function loadNativePortal(native: { View: unknown }) {
  const module = { exports: {} }
  const source = readFileSync(
    new URL('../../behaviors/src/portal.native.tsx', import.meta.url),
    'utf8',
  )
  const { code } = transformSync(source, { loader: 'tsx', jsx: 'automatic', format: 'cjs' })
  new Function('require', 'module', 'exports', code)(
    (name: string) => {
      if (name === 'react' || name === 'react/jsx-runtime') return require(name)
      if (name === 'react-native') return native
      throw new Error(`Unexpected Native portal dependency: ${name}`)
    },
    module,
    module.exports,
  )
  return module.exports as {
    Portal: ComponentType<{ children?: ReactNode; disabled?: boolean }>
    PortalProvider: ComponentType<{ children?: ReactNode }>
    PortalHost: ComponentType<{ items?: Map<string, ReactNode> }>
  }
}
