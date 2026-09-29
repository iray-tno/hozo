export const NATIVE_SCENE_CORPUS_IDS = [
  'flat-labelled-diagram',
  'wireframe-cad',
  'points-and-sprite',
  'instancing-and-morph',
  'gltf-pbr',
]

export function collectNativeSceneCorpus(events, platform) {
  return NATIVE_SCENE_CORPUS_IDS.map((id) => {
    const result = events.find(
      ({ event, fixtureId }) => event === 'scene_corpus_fixture' && fixtureId === id,
    )
    if (!result) throw new Error(`Native GPU probe did not run scene corpus fixture ${id}`)
    if (result.status !== 'useful' || result.renderCalls < 1 || result.semanticControls < 1) {
      throw new Error(`Native GPU scene corpus fixture ${id} was not useful`)
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
      activation: result.activation,
    }
  })
}
