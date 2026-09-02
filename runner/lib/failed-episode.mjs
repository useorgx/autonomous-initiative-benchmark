export function makeFailedEpisode({ job, model, error }) {
  return {
    episodeId: job.episodeId,
    baseWorldId: job.world.id,
    seedIndex: job.seedIndex,
    difficulty: job.difficulty ?? null,
    worldId: job.world.id,
    arm: job.arm,
    model,
    failed: true,
    error: error instanceof Error ? error.message : String(error),
    pass: false,
    dimensions: {},
    weg: {
      totalTokens: null,
      costCents: null,
      toolCallCount: 0,
      resourceTelemetryComplete: false,
    },
  };
}
