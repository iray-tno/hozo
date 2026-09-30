import { ACESFilmicToneMapping, PCFSoftShadowMap, SRGBColorSpace, type WebGLRenderer } from 'three'

export { createKumimonoScene } from './scene.ts'
export { createTimberTextures } from './textures.ts'

export function configureKumimonoRenderer(renderer: WebGLRenderer) {
  renderer.outputColorSpace = SRGBColorSpace
  renderer.toneMapping = ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.07
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = PCFSoftShadowMap
}
