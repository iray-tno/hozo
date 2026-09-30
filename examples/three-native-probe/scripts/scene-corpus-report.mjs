export const NATIVE_SCENE_CORPUS_IDS = [
  'flat-labelled-diagram',
  'wireframe-cad',
  'points-and-sprite',
  'instancing-and-morph',
  'product-viewer-gltf',
  'gltf-pbr',
  'kumimono',
]

export function collectNativeSceneCorpus(events, platform) {
  return NATIVE_SCENE_CORPUS_IDS.map((id) => {
    const result = events.find(
      ({ event, fixtureId }) => event === 'scene_corpus_fixture' && fixtureId === id,
    )
    if (!result) throw new Error(`Native GPU probe did not run scene corpus fixture ${id}`)
    if (result.status !== 'useful' || result.renderCalls < 1 || result.semanticControls < 1) {
      throw new Error(
        `Native GPU scene corpus fixture ${id} was not useful${result.reason ? `: ${result.reason}` : ''}`,
      )
    }
    if (
      id === 'product-viewer-gltf' &&
      (!Number.isFinite(result.textureCountDelta) || result.textureCountDelta < 1)
    ) {
      throw new Error('Native GPU product viewer did not allocate a texture')
    }
    if (id === 'product-viewer-gltf') {
      if (result.imageDecoding !== 'host')
        throw new Error('Native GPU product viewer did not decode its PNG with the host loader')
      if (
        !Number.isFinite(result.animationFrames) ||
        result.animationFrames < 2 ||
        !Number.isFinite(result.animationAngle) ||
        result.animationAngle <= 0.01
      ) {
        throw new Error('Native GPU product viewer did not animate across rendered frames')
      }
    }
    if (id === 'kumimono') {
      if (!Number.isFinite(result.textureCountDelta) || result.textureCountDelta < 2)
        throw new Error('Native Kumimono did not allocate both timber textures')
      if (
        !Number.isFinite(result.animationFrames) ||
        result.animationFrames < 2 ||
        !Number.isFinite(result.animationAngle) ||
        result.animationAngle <= 0.01
      )
        throw new Error('Native Kumimono did not assemble across rendered frames')
    }
    const expectedActivation = platform === 'android' ? 'measured' : 'not-run'
    if (result.activation !== expectedActivation) {
      throw new Error(`Native GPU scene corpus fixture ${id} has invalid activation evidence`)
    }
    return {
      id,
      status: result.status,
      renderCalls: result.renderCalls,
      semanticControls: result.semanticControls,
      textureCountDelta: result.textureCountDelta,
      imageDecoding: result.imageDecoding,
      animationFrames: result.animationFrames,
      animationAngle: result.animationAngle,
      activation: result.activation,
    }
  })
}
