import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { BoxGeometry, Mesh, MeshBasicMaterial, PerspectiveCamera, Scene } from 'three'
import { SCENE_CORPUS_SCENES } from '../src/conformance-scenes.ts'
import { ThreeCanvas as WebGLCanvas } from '../src/webgl-renderer.tsx'
import { ThreeCanvas as WebGPUCanvas } from '../src/webgpu.tsx'

type SceneCorpusProbeResult = {
  activated: boolean
  error?: string
  id: string
  renderCalls: number
  semanticControls: number
  status: 'failed' | 'useful'
  textureCountDelta: number
}

type ProbeResult = {
  activated: boolean
  backend: 'classic-webgl' | 'modern-webgl2' | 'webgpu' | 'unknown'
  error?: string
  mode: string
  renderCalls: number
  sceneCorpus?: readonly SceneCorpusProbeResult[]
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
  setTimeout(async () => {
    const button = document.querySelector<HTMLButtonElement>('[data-hozo-three-controls] button')
    button?.click()
    const renderCalls =
      (renderer as { info?: { render?: { calls?: number } } }).info?.render?.calls ?? 0
    const sceneCorpus = await runRendererSceneCorpus()
    finish({
      activated,
      backend: backendName(renderer),
      mode,
      renderCalls,
      sceneCorpus,
      semanticControl: button !== null,
    })
  }, 250)
}

async function runRendererSceneCorpus(): Promise<readonly SceneCorpusProbeResult[]> {
  const gltfSource = fetch('/minimal-pbr.gltf').then(async (response) => {
    if (!response.ok) throw new Error(`glTF fixture request failed: ${response.status}`)
    return response.text()
  })
  const results: SceneCorpusProbeResult[] = []
  for (const definition of SCENE_CORPUS_SCENES) {
    try {
      const fixture = await definition.create(() => gltfSource)
      results.push(await renderSceneFixture(definition.id, fixture))
    } catch (error) {
      results.push({
        activated: false,
        error: error instanceof Error ? error.stack : String(error),
        id: definition.id,
        renderCalls: 0,
        semanticControls: 0,
        status: 'failed',
        textureCountDelta: 0,
      })
    }
  }
  return results
}

function renderSceneFixture(
  id: string,
  fixture: Awaited<ReturnType<(typeof SCENE_CORPUS_SCENES)[number]['create']>>,
): Promise<SceneCorpusProbeResult> {
  return new Promise((resolve) => {
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    let fixtureActivated = false
    let settled = false
    const settle = (result: SceneCorpusProbeResult) => {
      if (settled) return
      settled = true
      root.unmount()
      host.remove()
      resolve(result)
    }
    const timeout = setTimeout(
      () =>
        settle({
          activated: fixtureActivated,
          error: 'fixture timed out',
          id,
          renderCalls: 0,
          semanticControls: 0,
          status: 'failed',
          textureCountDelta: 0,
        }),
      5_000,
    )
    root.render(
      createElement(Canvas, {
        accessibilityLabel: id,
        camera: fixture.camera,
        height: 180,
        onCreated: (renderer: unknown) => {
          const initialTextures =
            (renderer as { info?: { memory?: { textures?: number } } }).info?.memory?.textures ?? 0
          setTimeout(() => {
            clearTimeout(timeout)
            const buttons = host.querySelectorAll<HTMLButtonElement>(
              '[data-hozo-three-controls] button',
            )
            buttons[0]?.click()
            const renderCalls =
              (renderer as { info?: { render?: { calls?: number } } }).info?.render?.calls ?? 0
            const textureCountDelta = Math.max(
              0,
              ((renderer as { info?: { memory?: { textures?: number } } }).info?.memory?.textures ??
                0) - initialTextures,
            )
            const useful =
              renderCalls > 0 &&
              buttons.length > 0 &&
              fixtureActivated &&
              (id !== 'product-viewer-gltf' || textureCountDelta > 0)
            settle({
              activated: fixtureActivated,
              id,
              renderCalls,
              semanticControls: buttons.length,
              status: useful ? 'useful' : 'failed',
              textureCountDelta,
            })
          }, 150)
        },
        onError: (error: unknown) => {
          clearTimeout(timeout)
          settle({
            activated: fixtureActivated,
            error: error instanceof Error ? error.stack : String(error),
            id,
            renderCalls: 0,
            semanticControls: 0,
            status: 'failed',
            textureCountDelta: 0,
          })
        },
        onObjectPress: () => {
          fixtureActivated = true
        },
        pixelRatio: 1,
        rendererOptions:
          mode === 'classic-webgl'
            ? { antialias: false }
            : mode === 'modern-force-webgl2'
              ? { forceWebGL: true }
              : undefined,
        scene: fixture.scene,
        width: 320,
      } as never),
    )
  })
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
