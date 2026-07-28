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
uniform float uEdgeThreshold;
uniform float uEdgeWidth;
uniform float uEdgeStrength;
uniform float uGlowWidth;
uniform float uGlowStrength;
uniform float uFlowSpeed;
uniform vec2 uFlowFrequency;
uniform float uNoiseAmount;
uniform float uHighlightSharpness;
uniform float uTime;
varying vec2 vUv;

void main() {
  vec4 base = texture2D(uBaseTexture, vUv);
  vec4 helmet = texture2D(uHelmetTexture, vUv);
  float trailMask = clamp(texture2D(uTrailTexture, vUv).r, 0.0, 1.0);
  vec4 portrait = mix(base, helmet, trailMask);

  float edgeOuter = smoothstep(uEdgeThreshold - uEdgeWidth, uEdgeThreshold, trailMask);
  float edgeInner = smoothstep(uEdgeThreshold, uEdgeThreshold + uEdgeWidth, trailMask);
  float edgeBand = clamp(edgeOuter - edgeInner, 0.0, 1.0);

  float glowOuter = smoothstep(uEdgeThreshold - uGlowWidth, uEdgeThreshold, trailMask);
  float glowInner = smoothstep(uEdgeThreshold, uEdgeThreshold + uGlowWidth, trailMask);
  float glowBand = clamp(glowOuter - glowInner, 0.0, 1.0);

  float spatialNoise = sin(dot(vUv, uFlowFrequency.yx)) * uNoiseAmount;
  float flow = sin(
    dot(vUv, uFlowFrequency) + uTime * uFlowSpeed + spatialNoise
  ) * 0.5 + 0.5;
  vec3 edgeColor = mix(uEdgePrimary, uEdgeAccent, flow);
  float highlight = pow(max(0.0, 1.0 - abs(flow * 2.0 - 1.0)), uHighlightSharpness);
  edgeColor = mix(edgeColor, uEdgeHighlight, highlight);

  float edgeAmount = clamp(
    edgeBand * uEdgeStrength + glowBand * uGlowStrength,
    0.0,
    1.0
  ) * portrait.a;
  portrait.rgb = clamp(
    portrait.rgb + edgeColor * edgeAmount * (1.0 - portrait.rgb),
    0.0,
    1.0
  );

  gl_FragColor = portrait;
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
