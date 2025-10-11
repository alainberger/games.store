export interface PassiveSignals {
  glareScore?: number;
  moireScore?: number;
  flatnessScore?: number;
}

export interface ActiveChallengeResult {
  blink: boolean;
  yaw: boolean;
}

export function evaluatePassiveSignals(signals: PassiveSignals = {}): number {
  const glare = 1 - Math.min(1, Math.max(0, signals.glareScore ?? 0));
  const moire = 1 - Math.min(1, Math.max(0, signals.moireScore ?? 0));
  const flatness = 1 - Math.min(1, Math.max(0, signals.flatnessScore ?? 0));
  return Math.max(0, Math.min(1, (glare + moire + flatness) / 3));
}

export function evaluateActiveChallenge(result: ActiveChallengeResult): number {
  const blinkScore = result.blink ? 1 : 0;
  const yawScore = result.yaw ? 1 : 0;
  return (blinkScore + yawScore) / 2;
}

export function combineScores(options: {
  cosineSimilarity: number;
  passiveScore: number;
  activeScore: number;
  alpha?: number;
  beta?: number;
}): number {
  const alpha = options.alpha ?? 0.7;
  const beta = options.beta ?? 0.3;
  const weightedLiveness = (options.passiveScore * 0.6 + options.activeScore * 0.4);
  return Math.min(1, Math.max(0, alpha * options.cosineSimilarity + beta * weightedLiveness));
}
