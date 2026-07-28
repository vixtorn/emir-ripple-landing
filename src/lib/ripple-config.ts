export const portraitAssets = {
  baseTexture: "/images/hero/emir-base-wide-v2.png",
  helmetTexture: "/images/hero/emir-helmet-wide-v2.png",
} as const;

const trailPointHoldMs = 100;
const trailPointFadeMs = 1700;

export const rippleEdgePalettes = {
  blue: {
    primary: "#2478FF",
    highlight: "#59E6FF",
    accent: "#8B5CFF",
  },
  orange: {
    primary: "#FF681F",
    highlight: "#FF9E3D",
    accent: "#FFD29A",
  },
} as const;

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
  rippleEdgeTheme: "blue" as keyof typeof rippleEdgePalettes,
  rippleEdgeThreshold: 0.16,
  rippleEdgeWidth: 0.055,
  rippleEdgeStrength: 0.56,
  rippleGlowWidth: 0.13,
  rippleGlowStrength: 0.12,
  rippleFlowSpeed: 0.65,
  rippleFlowFrequency: { x: 18, y: 13 },
  rippleNoiseAmount: 0.7,
  rippleHighlightSharpness: 6,
  maxDpr: 1.5,
} as const;
