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

export const rippleGradientMapPalette = {
  dark: "#000000",
  purple: "#8A05DB",
  pink: "#DE37CC",
  light: "#E7EE9D",
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
  gradientMapEnabled: true,
  gradientMapMix: 0.7,
  gradientMapPhase: 0,
  gradientMapScale: 1,
  gradientMapFlowSpeed: 0.08,
  gradientMapDriftAmount: 0.025,
  gradientMapStops: { darkEnd: 0.25, purple: 0.55, pink: 0.78 },
  maskBlurRadiusPx: 1.5,
  edgeThreshold: 0.16,
  edgeWidth: 0.018,
  edgeStrength: 0.65,
  auraWidth: 0.1,
  auraStrength: 0.25,
  auraVioletMix: 0.65,
  noiseScale: 3,
  noiseSpeed: 0.16,
  noiseAmount: 0.35,
  distortionStrength: 0.008,
  auraDistortionInfluence: 0.35,
  chromaticOffset: 0.0045,
  chromaticStrength: 0.65,
  chromaticAuraInfluence: 0.35,
  edgeFlowSpeed: 0.45,
  edgeFlowFrequency: { x: 14, y: 10 },
  edgeHighlightSharpness: 5,
  maxDpr: 1.5,
} as const;
