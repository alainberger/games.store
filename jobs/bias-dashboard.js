import fs from 'fs';
import path from 'path';

const METRIC_PATH = path.join(process.cwd(), 'storage', 'bias-metrics.json');

function ensureStore() {
  if (!fs.existsSync(METRIC_PATH)) fs.writeFileSync(METRIC_PATH, JSON.stringify({ groups: {} }, null, 2));
}

export function recordOutcome(group, outcome) {
  ensureStore();
  const data = JSON.parse(fs.readFileSync(METRIC_PATH, 'utf-8'));
  if (!data.groups[group]) {
    data.groups[group] = { trueAccept: 0, falseReject: 0, attempts: 0 };
  }
  data.groups[group].attempts++;
  if (outcome === 'true_accept') data.groups[group].trueAccept++;
  if (outcome === 'false_reject') data.groups[group].falseReject++;
  fs.writeFileSync(METRIC_PATH, JSON.stringify(data, null, 2));
}

export function scheduleBiasDashboardJob(logger = console) {
  const interval = 6 * 60 * 60 * 1000;
  setInterval(() => {
    ensureStore();
    const data = JSON.parse(fs.readFileSync(METRIC_PATH, 'utf-8'));
    const entries = Object.entries(data.groups);
    if (entries.length < 2) return;
    const ratios = entries.map(([group, stats]) => {
      const far = stats.attempts ? stats.falseReject / stats.attempts : 0;
      const tar = stats.attempts ? stats.trueAccept / stats.attempts : 0;
      const ratio = far === 0 ? Infinity : tar / far;
      return { group, tar, far, ratio };
    });
    ratios.sort((a, b) => b.ratio - a.ratio);
    const max = ratios[0].ratio;
    const min = ratios[ratios.length - 1].ratio;
    if (max / (min || 1) > 1.5) {
      logger.error('[bias] Alert: TAR/FAR disparity detected', ratios);
    }
  }, interval).unref();
}
