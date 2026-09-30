export interface SceneRenderEvidence {
  renderCalls: number
  textureCountDelta: number
}

/** Called from successive frames; an early zero is not a permanent verdict. */
export function sampleSceneRenderEvidence(
  previous: SceneRenderEvidence,
  info: { render: { calls: number }; memory: { textures: number } },
  initialTextures: number,
): SceneRenderEvidence {
  return {
    renderCalls: Math.max(previous.renderCalls, info.render.calls),
    textureCountDelta: Math.max(
      previous.textureCountDelta,
      info.memory.textures - initialTextures,
      0,
    ),
  }
}
