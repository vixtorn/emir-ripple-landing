export const portraitAssets = {
  baseTexture: "/images/hero/emir-base-wide-v2.png",
  helmetTexture: "/images/hero/emir-helmet-wide-v2.png",
} as const;

export const rippleConfig = {
  trailResolution: 768,
  radius: 0.09,
  hardness: 0.18,
  // Exponential mask decay rate, in inverse seconds.
  trailDecayRatePerSecond: 5.5,
  // Break interpolation when real pointer movements are farther apart than this.
  trailIdleTimeoutMs: 250,
  // Minimum real pointer movement in normalized portrait UV units.
  trailMovementEpsilon: 0.0005,
  // Remaining mask visibility below this value is cleared completely.
  trailVisibilityCutoff: 0.0003,
  maxDpr: 1.5,
} as const;
