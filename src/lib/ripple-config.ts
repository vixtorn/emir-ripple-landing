export const portraitAssets = {
  baseTexture: "/images/hero/emir-base-wide-v2.png",
  helmetTexture: "/images/hero/emir-helmet-wide-v2.png",
} as const;

const trailPointHoldMs = 100;
const trailPointFadeMs = 1700;


export const metaballDebugViews = {
  final: 0,
  field: 1,
  mask: 2,
  height: 3,
  normal: 4,
  lighting: 5,
  classic: 6,
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
  revealMode: "metaball" as "classic" | "metaball",
  metaballFieldResolution: 384,
  metaballThreshold: 0.38,
  metaballSoftness: 0.11,
  metaballFieldStrength: 0.9,
  metaballFieldInnerStop: 0.35,
  metaballFieldInnerStrength: 0.85,
  metaballNormalStrength: 8,
  metaballLightDirection: { x: -0.35, y: 0.45, z: 0.82 },
  metaballDiffuseStrength: 0.12,
  metaballSpecularStrength: 0.3,
  metaballSpecularPower: 32,
  metaballFresnelStrength: 0.16,
  metaballFresnelPower: 3,
  metaballRefractionStrength: 0,
  metaballPrimaryHighlight: "#D9F5FF",
  metaballSecondaryHighlight: "#5EC8FF",
  metaballVisibilityCutoff: 0.0003,
  debugCompareRevealModes: false,
  metaballDebugView: "final" as keyof typeof metaballDebugViews,
  debugMetaballSinglePoint: false,
  maxDpr: 1.5,
} as const;
