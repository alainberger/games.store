// Auto-generated parallel implementation for runtime usage (mirrors biohash.ts)
const projectionCache = new Map();

function fnv1a32(input) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function createRng(seed) {
  let state = fnv1a32(seed) || 0xdeadbeef;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) / 0xffffffff);
  };
}

function gaussianSample(rng) {
  let u = 0, v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

function generateProjection(seed, dimension) {
  const cacheKey = `${seed}:${dimension}`;
  const cached = projectionCache.get(cacheKey);
  if (cached) return cached;

  const rng = createRng(seed);
  const matrix = Array.from({ length: dimension }, () => new Float64Array(dimension));

  for (let i = 0; i < dimension; i++) {
    for (let j = 0; j < dimension; j++) {
      matrix[i][j] = gaussianSample(rng);
    }
  }

  for (let i = 0; i < dimension; i++) {
    for (let j = 0; j < i; j++) {
      let dot = 0;
      for (let k = 0; k < dimension; k++) {
        dot += matrix[i][k] * matrix[j][k];
      }
      for (let k = 0; k < dimension; k++) {
        matrix[i][k] -= dot * matrix[j][k];
      }
    }
    let norm = 0;
    for (let k = 0; k < dimension; k++) norm += matrix[i][k] * matrix[i][k];
    norm = Math.sqrt(norm) || 1;
    for (let k = 0; k < dimension; k++) matrix[i][k] /= norm;
  }

  const result = matrix.map((row) => Float32Array.from(row));
  projectionCache.set(cacheKey, result);
  return result;
}

export function applyBiohash(embedding, userSeed) {
  if (!Array.isArray(embedding) && !(embedding instanceof Float32Array)) {
    throw new Error('embedding must be an array of numbers');
  }
  const dim = embedding.length;
  if (dim !== 512) {
    throw new Error('embedding must have 512 dimensions');
  }
  if (!userSeed) {
    throw new Error('userSeed required');
  }
  const projection = generateProjection(userSeed, dim);
  const output = new Float32Array(dim);
  for (let i = 0; i < dim; i++) {
    let sum = 0;
    const row = projection[i];
    for (let j = 0; j < dim; j++) {
      sum += row[j] * embedding[j];
    }
    output[i] = sum;
  }
  let norm = 0;
  for (let i = 0; i < dim; i++) norm += output[i] * output[i];
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < dim; i++) output[i] = output[i] / norm;
  return output;
}

export function clearProjectionCache() {
  projectionCache.clear();
}
