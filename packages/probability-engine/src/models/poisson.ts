function logFactorial(n: number): number {
  let sum = 0;
  for (let i = 2; i <= n; i++) sum += Math.log(i);
  return sum;
}

/**
 * P(X = k) para X ~ Poisson(lambda). Se calcula en espacio logarítmico para no
 * desbordar con valores de k relativamente altos (córners, tarjetas).
 */
export function poissonPmf(k: number, lambda: number): number {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  if (k < 0 || !Number.isInteger(k)) return 0;

  const logPmf = -lambda + k * Math.log(lambda) - logFactorial(k);
  return Math.exp(logPmf);
}

/** P(X <= k) para X ~ Poisson(lambda). */
export function poissonCdf(k: number, lambda: number): number {
  let sum = 0;
  for (let i = 0; i <= k; i++) sum += poissonPmf(i, lambda);
  return sum;
}
