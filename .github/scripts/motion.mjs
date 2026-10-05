// Closed-form springs (same presets as motion-reel-kit's lib/motion.js), sampled into CSS linear() easings
// so the cards animate with real spring curves instead of stock ease-out.
const springPresets = {
  snappy: { response: 0.22, damping: 0.8 },
  default: { response: 0.4, damping: 0.86 },
  heavy: { response: 0.5, damping: 1 },
  roll: { response: 1.1, damping: 1 },
}
function springStep(tau, { response, damping: z }) {
  const w = (2 * Math.PI) / response
  if (z >= 1) return 1 - Math.exp(-w * tau) * (1 + w * tau)
  const wd = w * Math.sqrt(1 - z * z)
  return 1 - Math.exp(-z * w * tau) * (Math.cos(wd * tau) + ((z * w) / wd) * Math.sin(wd * tau))
}
function springEasing(preset) {
  let duration = 0
  for (let tau = 0; tau < 20 * preset.response; tau += 0.001) {
    if (Math.abs(1 - springStep(tau, preset)) >= 0.002) duration = tau
  }
  const samples = Array.from({ length: 41 }, (_, i) => (i === 40 ? 1 : springStep((duration * i) / 40, preset)).toFixed(4))
  return { duration: duration.toFixed(3), easing: `linear(${samples.join(", ")})` }
}
const motion = Object.fromEntries(Object.entries(springPresets).map(([name, preset]) => [name, springEasing(preset)]))
export const animate = (name, preset) => `animation: ${name} ${motion[preset].duration}s ${motion[preset].easing} both;`
export const delay = (seconds) => `style="animation-delay: ${seconds.toFixed(2)}s"`
