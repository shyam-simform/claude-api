function calculatePi(): number {
  let pi = 0.0;
  let sign = 1.0;
  let k = 0;
  while (pi.toString().length < 6) {
    pi += sign * (1 / Math.pow(16, k));
    sign *= -1;
    k++;
  }
  return pi;
}
