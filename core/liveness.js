export function evaluatePassiveSignals(signals = {}) {
  const glare = 1 - Math.min(1, Math.max(0, signals.glareScore ?? 0));
  const moire = 1 - Math.min(1, Math.max(0, signals.moireScore ?? 0));
  const flatness = 1 - Math.min(1, Math.max(0, signals.flatnessScore ?? 0));
  return Math.max(0, Math.min(1, (glare + moire + flatness) / 3));
}

export function evaluateActiveChallenge(result = { blink: false, yaw: false }) {
  const blinkScore = result.blink ? 1 : 0;
  const yawScore = result.yaw ? 1 : 0;
  return (blinkScore + yawScore) / 2;
}

export function combineScores({ cosineSimilarity, passiveScore, activeScore, alpha = 0.7, beta = 0.3 }) {
  const weightedLiveness = (passiveScore * 0.6 + activeScore * 0.4);
  return Math.min(1, Math.max(0, alpha * cosineSimilarity + beta * weightedLiveness));
}
