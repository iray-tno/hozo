export interface SceneRenderEvidence {
  renderCalls: number
  textureCountDelta: number
}

/** A completed sample may stop drawing while the harness operates its control. */
export function sceneEvidenceReady(
  evidence: SceneRenderEvidence,
  animation?: { frames: number; angle: number },
) {
  return (
    Number.isFinite(evidence.renderCalls) &&
    evidence.renderCalls > 0 &&
    (!animation ||
      (Number.isFinite(animation.frames) &&
        animation.frames >= 2 &&
        Number.isFinite(animation.angle) &&
        animation.angle > 0.01))
  )
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
