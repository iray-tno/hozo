import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { BoxGeometry, Mesh, MeshBasicMaterial, PerspectiveCamera, Scene } from 'three'

import { ThreeCanvas as WebGLCanvas } from '../src/webgl.tsx'
import { ThreeCanvas as WebGPUCanvas } from '../src/webgpu.tsx'

type ProbeResult = {
  activated: boolean
  backend: 'classic-webgl' | 'modern-webgl2' | 'webgpu' | 'unknown'
  error?: string
  mode: string
  renderCalls: number
  semanticControl: boolean
}

const mode = new URLSearchParams(location.search).get('mode') ?? 'classic-webgl'
const scene = new Scene()
const mesh = new Mesh(new BoxGeometry(), new MeshBasicMaterial({ color: '#2563eb' }))
mesh.name = 'Conformance cube'
scene.add(mesh)
const camera = new PerspectiveCamera(50, 16 / 9, 0.1, 100)
camera.position.z = 4
let activated = false
let finished = false

function finish(result: ProbeResult) {
  if (finished) return
  finished = true
  document.body.dataset.hozoResult = btoa(JSON.stringify(result))
}

function backendName(renderer: unknown): ProbeResult['backend'] {
  if (mode === 'classic-webgl') return 'classic-webgl'
  const backend = (
    renderer as { backend?: { isWebGLBackend?: boolean; isWebGPUBackend?: boolean } }
  ).backend
  if (backend?.isWebGPUBackend) return 'webgpu'
  if (backend?.isWebGLBackend) return 'modern-webgl2'
  return 'unknown'
}

function inspect(renderer: unknown) {
  setTimeout(() => {
    const button = document.querySelector<HTMLButtonElement>('[data-hozo-three-controls] button')
    button?.click()
    const renderCalls =
      (renderer as { info?: { render?: { calls?: number } } }).info?.render?.calls ?? 0
    finish({
      activated,
      backend: backendName(renderer),
      mode,
      renderCalls,
      semanticControl: button !== null,
    })
  }, 250)
}

addEventListener('error', (event) =>
  finish({
    activated,
    backend: 'unknown',
    error: event.error instanceof Error ? event.error.stack : event.message,
    mode,
    renderCalls: 0,
    semanticControl: false,
  }),
)
addEventListener('unhandledrejection', (event) =>
  finish({
    activated,
    backend: 'unknown',
    error: event.reason instanceof Error ? event.reason.stack : String(event.reason),
    mode,
    renderCalls: 0,
    semanticControl: false,
  }),
)

const Canvas = mode === 'classic-webgl' ? WebGLCanvas : WebGPUCanvas
const rendererOptions = mode === 'modern-force-webgl2' ? { forceWebGL: true } : undefined
createRoot(document.getElementById('app')!).render(
  createElement(Canvas, {
    accessibilityLabel: 'GPU conformance scene',
    camera,
    height: 180,
    onCreated: inspect,
    onError: (error: unknown) =>
      finish({
        activated,
        backend: 'unknown',
        error: error instanceof Error ? error.stack : String(error),
        mode,
        renderCalls: 0,
        semanticControl: false,
      }),
    onObjectPress: () => {
      activated = true
    },
    rendererOptions,
    scene,
    width: 320,
  } as never),
)
