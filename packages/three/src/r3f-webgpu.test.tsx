import assert from 'node:assert/strict'
import test from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'

import { type R3FRendererFactoryProps, ThreeCanvas } from './r3f.tsx'

test('R3F accepts an async WebGPU renderer factory without retaining it in the default adapter', () => {
  let calls = 0
  const createWebGPURenderer = async ({ canvas }: R3FRendererFactoryProps) => {
    calls += 1
    const { WebGPURenderer } = await import('three/webgpu')
    const renderer = new WebGPURenderer({
      antialias: true,
      canvas: canvas as HTMLCanvasElement,
    })
    await renderer.init()
    return renderer
  }

  const html = renderToStaticMarkup(<ThreeCanvas decorative gl={createWebGPURenderer} />)

  assert.match(html, /data-hozo-three-r3f=""/)
  assert.equal(calls, 0, 'server rendering eagerly created a browser GPU renderer')
})
