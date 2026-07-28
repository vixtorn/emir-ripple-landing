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
uniform float uMetaballDebugView;
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

float heightFromField(float density) {
  float surfaceFloor = max(0.0, uMetaballThreshold - uMetaballSoftness);
  float normalizedHeight = clamp(
    (density - surfaceFloor) / max(1.0 - surfaceFloor, 0.0001),
    0.0,
    1.0
  );
  return normalizedHeight * normalizedHeight * (3.0 - 2.0 * normalizedHeight);
}

void main() {
  float classicMask = clamp(texture2D(uTrailTexture, vUv).r, 0.0, 1.0);
  float rawFieldValue = texture2D(uMetaballField, vUv).a;
  float metaballMask = smoothstep(
    uMetaballThreshold - uMetaballSoftness,
    uMetaballThreshold + uMetaballSoftness,
    rawFieldValue
  );
  float metaballHeight = heightFromField(rawFieldValue);

  float leftHeight = heightFromField(texture2D(
    uMetaballField,
    vUv - vec2(uMetaballFieldTexelSize.x, 0.0)
  ).a);
  float rightHeight = heightFromField(texture2D(
    uMetaballField,
    vUv + vec2(uMetaballFieldTexelSize.x, 0.0)
  ).a);
  float bottomHeight = heightFromField(texture2D(
    uMetaballField,
    vUv - vec2(0.0, uMetaballFieldTexelSize.y)
  ).a);
  float topHeight = heightFromField(texture2D(
    uMetaballField,
    vUv + vec2(0.0, uMetaballFieldTexelSize.y)
  ).a);
  float dx = rightHeight - leftHeight;
  float dy = topHeight - bottomHeight;
  vec3 surfaceNormal = normalize(vec3(
    -dx * uMetaballNormalStrength,
    -dy * uMetaballNormalStrength,
    1.0
  ));

  float metaballMode = uRevealMode;
  if (uDebugCompareRevealModes > 0.5) {
    metaballMode = step(0.5, vUv.x);
  }
  if (uMetaballDebugView > 5.5) {
    metaballMode = 0.0;
  }
  float revealMask = mix(classicMask, metaballMask, metaballMode);
  vec2 refractedUv = clamp(
    vUv + surfaceNormal.xy * uMetaballRefractionStrength * metaballMask,
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
  float lightingInfluence = metaballMode * metaballMask * portrait.a;
  portrait.rgb = clamp(
    portrait.rgb + surfaceLight * lightingInfluence * (1.0 - portrait.rgb),
    0.0,
    1.0
  );

  vec4 outputColor = portrait;
  if (uMetaballDebugView > 0.5 && uMetaballDebugView < 1.5) {
    outputColor = vec4(vec3(rawFieldValue), 1.0);
  } else if (uMetaballDebugView < 2.5 && uMetaballDebugView > 1.5) {
    outputColor = vec4(vec3(metaballMask), 1.0);
  } else if (uMetaballDebugView < 3.5 && uMetaballDebugView > 2.5) {
    outputColor = vec4(vec3(metaballHeight), 1.0);
  } else if (uMetaballDebugView < 4.5 && uMetaballDebugView > 3.5) {
    vec3 normalColor = surfaceNormal * 0.5 + 0.5;
    outputColor = vec4(normalColor * metaballMask, 1.0);
  } else if (uMetaballDebugView < 5.5 && uMetaballDebugView > 4.5) {
    outputColor = vec4(clamp(surfaceLight * metaballMask, 0.0, 1.0), 1.0);
  }

  gl_FragColor = outputColor;
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
