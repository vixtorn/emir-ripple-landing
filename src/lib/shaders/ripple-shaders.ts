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
uniform sampler2D uMetaballField;
uniform vec2 uMetaballFieldTexelSize;
uniform float uRevealMode;
uniform float uDebugCompareRevealModes;
uniform float uMetaballThreshold;
uniform float uMetaballSoftness;
uniform float uMetaballNormalStrength;
uniform vec3 uMetaballLightDirection;
uniform float uMetaballDiffuseStrength;
uniform float uMetaballSpecularStrength;
uniform float uMetaballSpecularPower;
uniform float uMetaballFresnelStrength;
uniform float uMetaballFresnelPower;
uniform float uMetaballRefractionStrength;
uniform vec3 uMetaballPrimaryHighlight;
uniform vec3 uMetaballSecondaryHighlight;
varying vec2 vUv;

void main() {
  float classicMask = clamp(texture2D(uTrailTexture, vUv).r, 0.0, 1.0);
  float fieldValue = clamp(texture2D(uMetaballField, vUv).r, 0.0, 1.0);
  float metaballMask = smoothstep(
    uMetaballThreshold - uMetaballSoftness,
    uMetaballThreshold + uMetaballSoftness,
    fieldValue
  );

  float leftField = texture2D(
    uMetaballField,
    vUv - vec2(uMetaballFieldTexelSize.x, 0.0)
  ).r;
  float rightField = texture2D(
    uMetaballField,
    vUv + vec2(uMetaballFieldTexelSize.x, 0.0)
  ).r;
  float bottomField = texture2D(
    uMetaballField,
    vUv - vec2(0.0, uMetaballFieldTexelSize.y)
  ).r;
  float topField = texture2D(
    uMetaballField,
    vUv + vec2(0.0, uMetaballFieldTexelSize.y)
  ).r;
  float dx = rightField - leftField;
  float dy = topField - bottomField;
  vec3 surfaceNormal = normalize(vec3(
    -dx * uMetaballNormalStrength,
    -dy * uMetaballNormalStrength,
    1.0
  ));

  float metaballMode = uRevealMode;
  if (uDebugCompareRevealModes > 0.5) {
    metaballMode = step(0.5, vUv.x);
  }
  float revealMask = mix(classicMask, metaballMask, metaballMode);
  float surfaceBand = clamp(4.0 * metaballMask * (1.0 - metaballMask), 0.0, 1.0);
  vec2 refractedUv = clamp(
    vUv + surfaceNormal.xy * uMetaballRefractionStrength * surfaceBand,
    vec2(0.0),
    vec2(1.0)
  );

  vec4 base = texture2D(uBaseTexture, vUv);
  vec4 helmet = texture2D(
    uHelmetTexture,
    mix(vUv, refractedUv, metaballMode)
  );
  vec4 portrait = mix(base, helmet, revealMask);

  vec3 viewDirection = vec3(0.0, 0.0, 1.0);
  float diffuse = max(dot(surfaceNormal, uMetaballLightDirection), 0.0);
  float specular = pow(
    max(dot(reflect(-uMetaballLightDirection, surfaceNormal), viewDirection), 0.0),
    uMetaballSpecularPower
  );
  float fresnel = pow(
    1.0 - max(dot(surfaceNormal, viewDirection), 0.0),
    uMetaballFresnelPower
  );
  vec3 surfaceLight =
    uMetaballPrimaryHighlight * (
      diffuse * uMetaballDiffuseStrength +
      specular * uMetaballSpecularStrength
    ) +
    uMetaballSecondaryHighlight * fresnel * uMetaballFresnelStrength;
  float lightingInfluence = metaballMode * surfaceBand * portrait.a;
  portrait.rgb = clamp(
    portrait.rgb + surfaceLight * lightingInfluence * (1.0 - portrait.rgb),
    0.0,
    1.0
  );

  gl_FragColor = portrait;
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
