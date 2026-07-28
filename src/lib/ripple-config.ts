export const portraitAssets = {
  baseTexture: "/images/hero/emir-base-wide-v2.png",
  helmetTexture: "/images/hero/emir-helmet-wide-v2.png",
} as const;

const trailPointHoldMs = 100;
const trailPointFadeMs = 1700;

export const rippleConfig = {
  trailResolution: 768,
  radius: 0.09,
  hardness: 0.18,
  trailPointHoldMs,
  trailPointFadeMs,
  trailPointLifetimeMs: trailPointHoldMs + trailPointFadeMs,
  trailIdleTimeoutMs: 250,
  trailMovementEpsilon: 0.0005,
  trailInterpolationSpacingPx: 48,
  maxTrailPoints: 1024,
  trailVisibilityCutoff: 0.0003,
  maxDpr: 1.5,
} as const;
