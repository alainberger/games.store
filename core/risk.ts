export interface RiskInput {
  ip?: string;
  asn?: number | string;
  geo?: { country?: string; region?: string; city?: string } | null;
  deviceFingerprint?: string;
  newDevice?: boolean;
  velocityCounters?: { logins?: number; actions?: number; rejections?: number };
  abuseFlags?: string[];
}

export interface RiskResult {
  riskScore: number;
  reasons: string[];
  requireLiveness: boolean;
  block: boolean;
}

const highRiskASNs = new Set([
  'AS14061', 'AS9009', 'AS206092', 'AS202425', 'AS200052'
]);

const sanctionedCountries = new Set(['KP', 'SY', 'IR']);

function scoreIp(ip?: string): { score: number; reasons: string[] } {
  if (!ip) return { score: 0, reasons: [] };
  if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip)) {
    return { score: 5, reasons: ['private_ip'] };
  }
  if (/^127\./.test(ip)) return { score: 10, reasons: ['loopback_ip'] };
  if (/^(?:5\.255|23\.129|91\.\d{1,3}|178\.\d{1,3})\./.test(ip)) {
    return { score: 25, reasons: ['tor_or_hosting_range'] };
  }
  return { score: 0, reasons: [] };
}

export function evaluateRisk(input: RiskInput): RiskResult {
  const reasons: string[] = [];
  let score = 0;

  const ipEval = scoreIp(input.ip);
  score += ipEval.score;
  reasons.push(...ipEval.reasons);

  if (input.asn) {
    const asnStr = typeof input.asn === 'string' ? input.asn.toUpperCase() : `AS${input.asn}`;
    if (highRiskASNs.has(asnStr)) {
      score += 25;
      reasons.push('high_risk_asn');
    }
  }

  if (input.geo?.country && sanctionedCountries.has(input.geo.country)) {
    score += 40;
    reasons.push('sanctioned_geo');
  }

  if (input.newDevice) {
    score += 15;
    reasons.push('untrusted_device');
  }

  if (input.velocityCounters) {
    if ((input.velocityCounters.logins || 0) > 5) {
      score += 20;
      reasons.push('login_velocity');
    }
    if ((input.velocityCounters.actions || 0) > 50) {
      score += 15;
      reasons.push('action_velocity');
    }
    if ((input.velocityCounters.rejections || 0) > 3) {
      score += 20;
      reasons.push('rejection_spike');
    }
  }

  if (input.abuseFlags?.length) {
    score += 30;
    reasons.push('abuse_history');
  }

  if (!input.deviceFingerprint) {
    score += 10;
    reasons.push('missing_device_fp');
  }

  score = Math.min(100, Math.max(0, score));

  const requireLiveness = score >= 70;
  const block = score >= 85;

  return { riskScore: score, reasons, requireLiveness, block };
}
