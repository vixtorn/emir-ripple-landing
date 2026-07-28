export const rippleVertexShader = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const rippleFragmentShader = /* glsl */ `
uniform sampler2D uBaseTexture;
uniform sampler2D uHelmetTexture;
uniform sampler2D uTrailTexture;
uniform vec3 uEdgePrimary;
uniform vec3 uEdgeHighlight;
uniform vec3 uEdgeAccent;
uniform vec3 uGradientDark;
uniform vec3 uGradientPurple;
uniform vec3 uGradientPink;
uniform vec3 uGradientLight;
uniform vec3 uGradientMapStops;
uniform float uGradientMapEnabled;
uniform float uGradientMapMix;
uniform float uGradientMapPhase;
uniform float uGradientMapScale;
uniform float uGradientMapFlowSpeed;
uniform float uGradientMapDriftAmount;
uniform vec2 uTrailTexelSize;
uniform float uMaskBlurRadiusPx;
uniform float uEdgeThreshold;
uniform float uEdgeWidth;
uniform float uEdgeStrength;
uniform float uAuraWidth;
uniform float uAuraStrength;
uniform float uAuraVioletMix;
uniform float uNoiseScale;
uniform float uNoiseSpeed;
uniform float uNoiseAmount;
uniform float uDistortionStrength;
uniform float uAuraDistortionInfluence;
uniform float uChromaticOffset;
uniform float uChromaticStrength;
uniform float uChromaticAuraInfluence;
uniform float uEdgeFlowSpeed;
uniform vec2 uEdgeFlowFrequency;
uniform float uEdgeHighlightSharpness;
uniform float uTime;
varying vec2 vUv;

float random2d(vec2 position) {
  return fract(sin(dot(position, vec2(127.1, 311.7))) * 43758.5453);
}

float smoothNoise(vec2 position) {
  vec2 cell = floor(position);
  vec2 local = fract(position);
  vec2 curve = local * local * (3.0 - 2.0 * local);
  float bottom = mix(random2d(cell), random2d(cell + vec2(1.0, 0.0)), curve.x);
  float top = mix(random2d(cell + vec2(0.0, 1.0)), random2d(cell + vec2(1.0, 1.0)), curve.x);
  return mix(bottom, top, curve.y);
}

float fluidNoise(vec2 position) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int octave = 0; octave < 3; octave++) {
    value += smoothNoise(position) * amplitude;
    position = position * 2.03 + vec2(17.1, 9.2);
    amplitude *= 0.5;
  }
  return value;
}

vec3 gradientMap(float luminance) {
  if (luminance < uGradientMapStops.x) return uGradientDark;
  if (luminance < uGradientMapStops.y) {
    float progress = (luminance - uGradientMapStops.x) / (uGradientMapStops.y - uGradientMapStops.x);
    return mix(uGradientDark, uGradientPurple, progress);
  }
  if (luminance < uGradientMapStops.z) {
    float progress = (luminance - uGradientMapStops.y) / (uGradientMapStops.z - uGradientMapStops.y);
    return mix(uGradientPurple, uGradientPink, progress);
  }
  float progress = (luminance - uGradientMapStops.z) / (1.0 - uGradientMapStops.z);
  return mix(uGradientPink, uGradientLight, clamp(progress, 0.0, 1.0));
}

void main() {
  float trailMask = clamp(texture2D(uTrailTexture, vUv).r, 0.0, 1.0);
  vec2 maskOffset = uTrailTexelSize * uMaskBlurRadiusPx;
  float maskLeft = texture2D(uTrailTexture, vUv - vec2(maskOffset.x, 0.0)).r;
  float maskRight = texture2D(uTrailTexture, vUv + vec2(maskOffset.x, 0.0)).r;
  float maskBottom = texture2D(uTrailTexture, vUv - vec2(0.0, maskOffset.y)).r;
  float maskTop = texture2D(uTrailTexture, vUv + vec2(0.0, maskOffset.y)).r;
  float maskBottomLeft = texture2D(uTrailTexture, vUv - maskOffset).r;
  float maskTopRight = texture2D(uTrailTexture, vUv + maskOffset).r;
  float maskTopLeft = texture2D(uTrailTexture, vUv + vec2(-maskOffset.x, maskOffset.y)).r;
  float maskBottomRight = texture2D(uTrailTexture, vUv + vec2(maskOffset.x, -maskOffset.y)).r;
  float visualMask =
    trailMask * 0.20 +
    (maskLeft + maskRight + maskBottom + maskTop) * 0.12 +
    (maskBottomLeft + maskTopRight + maskTopLeft + maskBottomRight) * 0.08;

  float edgeOuter = smoothstep(uEdgeThreshold - uEdgeWidth, uEdgeThreshold, visualMask);
  float edgeInner = smoothstep(uEdgeThreshold, uEdgeThreshold + uEdgeWidth, visualMask);
  float edgeBand = clamp(edgeOuter - edgeInner, 0.0, 1.0);
  float auraOuter = smoothstep(uEdgeThreshold - uAuraWidth, uEdgeThreshold, visualMask);
  float auraInner = smoothstep(uEdgeThreshold, uEdgeThreshold + uAuraWidth, visualMask);
  float auraBand = clamp(auraOuter - auraInner, 0.0, 1.0);

  vec2 animatedNoiseUv = vUv * uNoiseScale + vec2(uTime * uNoiseSpeed, -uTime * uNoiseSpeed * 0.7);
  vec2 fluidOffset = vec2(
    fluidNoise(animatedNoiseUv),
    fluidNoise(animatedNoiseUv + vec2(5.2, 1.7))
  ) * 2.0 - 1.0;
  fluidOffset *= uNoiseAmount;
  float displacementInfluence = clamp(
    edgeBand + auraBand * uAuraDistortionInfluence,
    0.0,
    1.0
  );
  vec2 helmetUv = clamp(
    vUv + fluidOffset * uDistortionStrength * displacementInfluence,
    vec2(0.0),
    vec2(1.0)
  );

  vec2 maskGradient = vec2(maskRight - maskLeft, maskTop - maskBottom);
  vec2 maskNormal = maskGradient / max(length(maskGradient), 0.0001);
  float chromaticInfluence = clamp(
    edgeBand + auraBand * uChromaticAuraInfluence,
    0.0,
    1.0
  ) * uChromaticStrength;
  vec2 chromaticUvOffset = maskNormal * uChromaticOffset;

  vec4 base = texture2D(uBaseTexture, vUv);
  vec4 helmet = texture2D(uHelmetTexture, helmetUv);
  vec3 aberratedHelmet = vec3(
    texture2D(uHelmetTexture, clamp(helmetUv + chromaticUvOffset, vec2(0.0), vec2(1.0))).r,
    helmet.g,
    texture2D(uHelmetTexture, clamp(helmetUv - chromaticUvOffset, vec2(0.0), vec2(1.0))).b
  );
  helmet.rgb = mix(helmet.rgb, aberratedHelmet, chromaticInfluence);

  float helmetLuminance = dot(helmet.rgb, vec3(0.2126, 0.7152, 0.0722));
  float gradientDrift = sin(uTime * uGradientMapFlowSpeed + uGradientMapPhase) * uGradientMapDriftAmount;
  float mappedLuminance = clamp(
    (helmetLuminance - 0.5) * uGradientMapScale + 0.5 + gradientDrift,
    0.0,
    1.0
  );
  vec3 mappedHelmet = gradientMap(mappedLuminance);
  helmet.rgb = mix(
    helmet.rgb,
    mappedHelmet,
    uGradientMapMix * uGradientMapEnabled
  );

  vec4 portrait = mix(base, helmet, trailMask);
  float edgeNoise = fluidNoise(animatedNoiseUv + vec2(2.4, 8.1));
  float edgeFlow = sin(
    dot(vUv, uEdgeFlowFrequency) + uTime * uEdgeFlowSpeed + edgeNoise
  ) * 0.5 + 0.5;
  vec3 edgeColor = mix(uEdgePrimary, uEdgeAccent, edgeFlow);
  float cyanHighlight = pow(
    max(0.0, 1.0 - abs(edgeFlow * 2.0 - 1.0)),
    uEdgeHighlightSharpness
  );
  edgeColor = mix(edgeColor, uEdgeHighlight, cyanHighlight);
  vec3 auraColor = mix(uEdgePrimary, uEdgeAccent, uAuraVioletMix);

  vec3 colorContribution =
    edgeColor * edgeBand * uEdgeStrength +
    auraColor * auraBand * uAuraStrength;
  portrait.rgb = clamp(
    portrait.rgb + colorContribution * portrait.a * (1.0 - portrait.rgb),
    0.0,
    1.0
  );

  gl_FragColor = portrait;
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
