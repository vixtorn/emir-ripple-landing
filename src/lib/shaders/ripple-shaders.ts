import type {
  Camera,
  Scene,
  ShaderMaterial,
  WebGLRenderer,
} from "three";

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
uniform sampler2D uTemporalSourceField;
uniform vec2 uMetaballFieldTexelSize;
uniform float uMetaballFieldBackend;
uniform float uMetaballFieldDebugExposure;
uniform float uTemporalFieldDebugExposure;
uniform float uTemporalDebugView;
uniform vec2 uTemporalPointerUv;
uniform vec2 uTemporalVelocity;
uniform float uTemporalMaxVelocity;
uniform float uTemporalVelocityInfluenceRadius;
uniform float uTemporalEnvelopeThreshold;
uniform float uTemporalEnvelopeSoftness;
#ifdef USE_MERCURY_SHELL
uniform float uMercuryShellEnabled;
uniform float uMercuryShellThreshold;
uniform float uMercuryShellSoftness;
uniform float uMercuryCoreThreshold;
uniform float uMercuryCoreSoftness;
uniform float uMercuryHeightBaseThreshold;
uniform float uMercuryHeightGain;
uniform float uMercuryNormalStrength;
uniform float uMercuryReflectionStrength;
uniform float uMercuryShellOpacity;
uniform float uMercuryCoreSurfaceOverlay;
uniform float uMercuryFresnelStrength;
uniform float uMercuryFresnelPower;
uniform float uMercurySpecularStrength;
uniform float uMercurySpecularPower;
uniform float uMercuryEdgeDistortionStrength;
uniform vec3 uMercuryDarkColor;
uniform vec3 uMercuryMidColor;
uniform vec3 uMercuryPrimaryHighlight;
uniform vec3 uMercurySecondaryHighlight;
uniform float uMercuryDebugView;
#ifdef USE_MERCURY_SURFACE_POLISH
uniform float uMercuryThicknessGain;
uniform float uMercuryThicknessLow;
uniform float uMercuryThicknessHigh;
uniform vec3 uMercuryEnvironmentDark;
uniform vec3 uMercuryEnvironmentMid;
uniform vec3 uMercuryEnvironmentFloor;
uniform float uMercuryOverheadSoftboxStrength;
uniform float uMercurySidePanelStrength;
uniform float uMercuryStripLightStrength;
uniform float uMercuryFloorBounceStrength;
uniform float uMercuryHorizonStrength;
uniform float uMercuryBroadSpecularStrength;
uniform float uMercuryBroadSpecularPower;
uniform float uMercurySharpSpecularStrength;
uniform float uMercurySharpSpecularPower;
uniform vec3 uMercurySharpLightDirection;
uniform float uMercuryCurvatureStrength;
uniform float uMercuryCurvatureLow;
uniform float uMercuryCurvatureHigh;
uniform float uMercuryThinFresnelBoost;
uniform float uMercuryMicroReflectionStrength;
uniform float uMercuryEdgeRefractionStrength;
uniform float uMercurySurfaceDebugView;
#endif
#ifdef USE_RAYMARCHED_MERCURY
uniform sampler2D uRaymarchPrimitives;
uniform float uRaymarchPrimitiveCount;
uniform float uRaymarchPrimitiveTexelSize;
uniform float uPortraitAspect;
uniform float uRaymarchSmoothUnion;
uniform float uRaymarchDepthScale;
uniform float uRaymarchCameraDepth;
uniform float uRaymarchNearDepth;
uniform float uRaymarchFarDepth;
uniform float uRaymarchHitEpsilon;
uniform float uRaymarchNormalEpsilon;
uniform float uRaymarchMinimumStep;
uniform float uRaymarchMaximumStep;
uniform float uRaymarchShellEarlyOut;
uniform float uRaymarchBlend;
uniform float uRaymarchVelocityBulgeStrength;
uniform float uRaymarchDebugView;
#endif
#endif
uniform float uMetaballHeightBaseThreshold;
uniform float uMetaballHeightCompression;
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

float sampleField(vec2 uv) {
  vec4 fieldSample = texture2D(uMetaballField, uv);
  return mix(fieldSample.a, fieldSample.r, uMetaballFieldBackend);
}

float sampleTemporalSource(vec2 uv) {
  vec4 fieldSample = texture2D(
    uTemporalSourceField,
    clamp(uv, vec2(0.0), vec2(1.0))
  );
  return mix(fieldSample.a, fieldSample.r, uMetaballFieldBackend);
}

float temporalSourceEnvelope(vec2 uv) {
  float source = sampleTemporalSource(uv);
  float blurredSource = source * 0.5 + (
    sampleTemporalSource(uv - vec2(uMetaballFieldTexelSize.x, 0.0))
    + sampleTemporalSource(uv + vec2(uMetaballFieldTexelSize.x, 0.0))
    + sampleTemporalSource(uv - vec2(0.0, uMetaballFieldTexelSize.y))
    + sampleTemporalSource(uv + vec2(0.0, uMetaballFieldTexelSize.y))
  ) * 0.125;
  return smoothstep(
    uTemporalEnvelopeThreshold - uTemporalEnvelopeSoftness,
    uTemporalEnvelopeThreshold + uTemporalEnvelopeSoftness,
    blurredSource
  );
}

#ifdef USE_MERCURY_SHELL
float mercuryShellMaskFromDensity(float density) {
  return smoothstep(
    uMercuryShellThreshold - uMercuryShellSoftness,
    uMercuryShellThreshold + uMercuryShellSoftness,
    density
  );
}

float mercuryCoreMaskFromDensity(float density) {
  return smoothstep(
    uMercuryCoreThreshold - uMercuryCoreSoftness,
    uMercuryCoreThreshold + uMercuryCoreSoftness,
    density
  );
}

float mercuryHeightFromDensity(float density) {
  float shellAboveBase = max(
    density - uMercuryHeightBaseThreshold,
    0.0
  );
  float shellHeight = 1.0 - exp(
    -shellAboveBase * uMercuryHeightGain
  );
  return shellHeight * mercuryShellMaskFromDensity(density);
}

float sampleMercuryHeight(vec2 uv) {
  return mercuryHeightFromDensity(sampleField(
    clamp(uv, vec2(0.0), vec2(1.0))
  ));
}

vec3 proceduralStudioReflection(vec3 reflectionDirection) {
  vec3 direction = normalize(reflectionDirection);
  float overheadSoftbox = smoothstep(0.08, 0.72, direction.y)
    * (1.0 - smoothstep(0.28, 0.88, abs(direction.x)));
  float leftStrip = (
    1.0 - smoothstep(0.025, 0.14, abs(direction.x + 0.72))
  ) * smoothstep(-0.5, 0.42, direction.y);
  float rightStrip = (
    1.0 - smoothstep(0.025, 0.12, abs(direction.x - 0.68))
  ) * smoothstep(-0.42, 0.5, direction.y);
  float horizonGlow = 1.0 - smoothstep(
    0.04,
    0.42,
    abs(direction.y + 0.08)
  );
  float upperEnvironment = smoothstep(-0.72, 0.5, direction.y);

  vec3 darkEnvironment = mix(
    uMercuryDarkColor,
    uMercuryMidColor,
    0.08 + horizonGlow * 0.24 + upperEnvironment * 0.08
  );
  vec3 environment = darkEnvironment
    + uMercuryPrimaryHighlight * (
      overheadSoftbox * 0.68
      + leftStrip * 0.42
      + rightStrip * 0.34
    )
    + uMercurySecondaryHighlight * horizonGlow * 0.1;
  return min(environment, vec3(0.94));
}

#ifdef USE_MERCURY_SURFACE_POLISH
vec3 buildPolishedStudioEnvironment(vec3 reflectionDirection) {
  vec3 direction = normalize(reflectionDirection);
  float overheadSoftbox = smoothstep(0.06, 0.74, direction.y)
    * (1.0 - smoothstep(0.32, 0.9, abs(direction.x)));
  float broadSidePanel = (
    1.0 - smoothstep(0.18, 0.72, abs(direction.x + 0.28))
  ) * smoothstep(-0.62, 0.48, direction.y);
  float leftStrip = (
    1.0 - smoothstep(0.02, 0.11, abs(direction.x + 0.74))
  ) * smoothstep(-0.52, 0.48, direction.y);
  float rightStrip = (
    1.0 - smoothstep(0.02, 0.1, abs(direction.x - 0.7))
  ) * smoothstep(-0.46, 0.52, direction.y);
  float floorBounce = 1.0 - smoothstep(
    -0.72,
    -0.12,
    direction.y
  );
  float horizon = 1.0 - smoothstep(
    0.035,
    0.34,
    abs(direction.y + 0.055)
  );

  vec3 environment = uMercuryEnvironmentDark
    + uMercuryPrimaryHighlight
      * overheadSoftbox
      * uMercuryOverheadSoftboxStrength
    + uMercuryEnvironmentMid
      * broadSidePanel
      * uMercurySidePanelStrength
    + uMercuryPrimaryHighlight
      * leftStrip
      * uMercuryStripLightStrength
    + uMercurySecondaryHighlight
      * rightStrip
      * uMercuryStripLightStrength
    + uMercuryEnvironmentFloor
      * floorBounce
      * uMercuryFloorBounceStrength
    + uMercurySecondaryHighlight
      * horizon
      * uMercuryHorizonStrength;
  return min(environment, vec3(0.92));
}
#endif
#ifdef USE_RAYMARCHED_MERCURY
vec2 raymarchLocalPosition(vec2 uv) {
  return vec2(
    (uv.x - 0.5) * uPortraitAspect,
    uv.y - 0.5
  );
}

float raymarchSphereDistance(vec3 point, vec3 center, float radius) {
  return length(point - center) - radius;
}

float raymarchCapsuleDistance(
  vec3 point,
  vec3 start,
  vec3 end,
  float radius
) {
  vec3 segment = end - start;
  float segmentLengthSquared = dot(segment, segment);
  if (segmentLengthSquared < 0.0000001) {
    return raymarchSphereDistance(point, start, radius);
  }
  float alongSegment = clamp(
    dot(point - start, segment) / segmentLengthSquared,
    0.0,
    1.0
  );
  return length(point - (start + segment * alongSegment)) - radius;
}

float raymarchSmoothMinimum(float first, float second, float smoothing) {
  if (smoothing <= 0.00001) return min(first, second);
  float blend = max(smoothing - abs(first - second), 0.0) / smoothing;
  return min(first, second) - blend * blend * smoothing * 0.25;
}

float raymarchSceneDistance(vec3 point) {
  float compressedDepth = max(uRaymarchDepthScale, 0.001);
  vec3 distancePoint = vec3(point.xy, point.z / compressedDepth);
  float sceneDistance = 1000.0;

  for (int segmentIndex = 0; segmentIndex < RAYMARCH_MAX_SEGMENTS; segmentIndex++) {
    if (float(segmentIndex) >= uRaymarchPrimitiveCount) break;
    float firstTexel = (float(segmentIndex * 2) + 0.5)
      * uRaymarchPrimitiveTexelSize;
    float secondTexel = firstTexel + uRaymarchPrimitiveTexelSize;
    vec4 endpoints = texture2D(
      uRaymarchPrimitives,
      vec2(firstTexel, 0.5)
    );
    vec4 attributes = texture2D(
      uRaymarchPrimitives,
      vec2(secondTexel, 0.5)
    );
    if (attributes.z < 0.5) continue;

    float radius = max(
      attributes.x
        * (1.0 + attributes.y * uRaymarchVelocityBulgeStrength),
      0.0001
    );
    float primitiveDistance = raymarchCapsuleDistance(
      distancePoint,
      vec3(endpoints.xy, 0.0),
      vec3(endpoints.zw, 0.0),
      radius
    ) * min(compressedDepth, 1.0);
    sceneDistance = raymarchSmoothMinimum(
      sceneDistance,
      primitiveDistance,
      uRaymarchSmoothUnion
    );
  }
  return sceneDistance;
}

vec3 raymarchSceneNormal(vec3 point) {
  float epsilon = max(uRaymarchNormalEpsilon, 0.0001);
  vec2 offset = vec2(1.0, -1.0) * epsilon;
  vec3 gradient =
    offset.xyy * raymarchSceneDistance(point + offset.xyy)
      + offset.yyx * raymarchSceneDistance(point + offset.yyx)
      + offset.yxy * raymarchSceneDistance(point + offset.yxy)
      + offset.xxx * raymarchSceneDistance(point + offset.xxx);
  float gradientLengthSquared = dot(gradient, gradient);
  if (!(gradientLengthSquared > 0.0000001)) {
    return vec3(0.0, 0.0, 1.0);
  }
  return gradient * inversesqrt(gradientLengthSquared);
}
#endif
#endif

float heightFromField(float density) {
  float canvasSurfaceFloor = max(0.0, uMetaballThreshold - uMetaballSoftness);
  float canvasNormalizedHeight = clamp(
    (density - canvasSurfaceFloor) / max(1.0 - canvasSurfaceFloor, 0.0001),
    0.0,
    1.0
  );
  float canvasHeight = canvasNormalizedHeight * canvasNormalizedHeight
    * (3.0 - 2.0 * canvasNormalizedHeight);
  float aboveThreshold = max(density - uMetaballHeightBaseThreshold, 0.0);
  float gpuHeight = aboveThreshold / max(
    aboveThreshold + uMetaballHeightCompression,
    0.0001
  );
  return mix(canvasHeight, gpuHeight, uMetaballFieldBackend);
}

void main() {
  float classicMask = clamp(texture2D(uTrailTexture, vUv).r, 0.0, 1.0);
  float rawFieldValue = sampleField(vUv);
#ifdef USE_MERCURY_SHELL
  float mercuryShellMask = mercuryShellMaskFromDensity(rawFieldValue);
  float mercuryCoreMask = mercuryCoreMaskFromDensity(rawFieldValue);
  float mercuryShellOnly = mercuryShellMask
    * (1.0 - mercuryCoreMask);
  float mercuryHeight = mercuryHeightFromDensity(rawFieldValue);
  float mercuryLeftHeight = sampleMercuryHeight(
    vUv - vec2(uMetaballFieldTexelSize.x, 0.0)
  );
  float mercuryRightHeight = sampleMercuryHeight(
    vUv + vec2(uMetaballFieldTexelSize.x, 0.0)
  );
  float mercuryBottomHeight = sampleMercuryHeight(
    vUv - vec2(0.0, uMetaballFieldTexelSize.y)
  );
  float mercuryTopHeight = sampleMercuryHeight(
    vUv + vec2(0.0, uMetaballFieldTexelSize.y)
  );
  float mercuryDx = mercuryRightHeight - mercuryLeftHeight;
  float mercuryDy = mercuryTopHeight - mercuryBottomHeight;
  vec3 mercuryNormal = normalize(vec3(
    -mercuryDx * uMercuryNormalStrength,
    -mercuryDy * uMercuryNormalStrength,
    1.0
  ));
#endif
  float metaballMask = smoothstep(
    uMetaballThreshold - uMetaballSoftness,
    uMetaballThreshold + uMetaballSoftness,
    rawFieldValue
  );
  float metaballHeight = heightFromField(rawFieldValue);

  float leftHeight = heightFromField(sampleField(
    vUv - vec2(uMetaballFieldTexelSize.x, 0.0)
  ));
  float rightHeight = heightFromField(sampleField(
    vUv + vec2(uMetaballFieldTexelSize.x, 0.0)
  ));
  float bottomHeight = heightFromField(sampleField(
    vUv - vec2(0.0, uMetaballFieldTexelSize.y)
  ));
  float topHeight = heightFromField(sampleField(
    vUv + vec2(0.0, uMetaballFieldTexelSize.y)
  ));
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
  float diffuseMultiplier = 1.0
    + (diffuse - 0.5) * uMetaballDiffuseStrength;
  vec3 additiveHighlights =
    uMetaballPrimaryHighlight * specular * uMetaballSpecularStrength +
    uMetaballSecondaryHighlight * fresnel * uMetaballFresnelStrength;
  vec3 shadedHelmet = clamp(
    helmet.rgb * diffuseMultiplier + additiveHighlights,
    0.0,
    1.0
  );
  vec4 classicPortrait = mix(base, helmet, classicMask);
  vec4 metaballPortrait = mix(
    base,
    vec4(shadedHelmet, helmet.a),
    metaballMask
  );
  vec4 portrait = mix(classicPortrait, metaballPortrait, metaballMode);
#ifdef USE_MERCURY_SHELL
  vec3 mercuryReflectionDirection = reflect(
    -viewDirection,
    mercuryNormal
  );
#ifdef USE_MERCURY_SURFACE_POLISH
  float densityAboveShell = max(
    rawFieldValue - uMercuryHeightBaseThreshold,
    0.0
  );
  float mercuryThicknessRaw = 1.0 - exp(
    -densityAboveShell * uMercuryThicknessGain
  );
  float mercuryThickness = smoothstep(
    uMercuryThicknessLow,
    uMercuryThicknessHigh,
    mercuryThicknessRaw
  );
  vec3 mercuryBodyColor = mix(
    uMercuryMidColor,
    uMercuryDarkColor,
    mercuryThickness
  );
  vec3 mercuryEnvironment = buildPolishedStudioEnvironment(
    mercuryReflectionDirection
  );
#ifdef USE_MERCURY_MICRO_REFLECTION
  float microReflection = sin(
    (vUv.x + vUv.y) * 18.0
      + rawFieldValue * 2.0
      + mercuryHeight * 4.0
  );
  mercuryEnvironment *= 1.0
    + microReflection * uMercuryMicroReflectionStrength;
#endif
  vec3 mercuryBase = mix(
    mercuryBodyColor,
    mercuryEnvironment,
    uMercuryReflectionStrength
  );
  float broadSpecular = pow(
    max(
      dot(
        reflect(-uMetaballLightDirection, mercuryNormal),
        viewDirection
      ),
      0.0
    ),
    uMercuryBroadSpecularPower
  );
  float sharpSpecular = pow(
    max(
      dot(
        reflect(-uMercurySharpLightDirection, mercuryNormal),
        viewDirection
      ),
      0.0
    ),
    uMercurySharpSpecularPower
  );
  float mercuryCurvature = abs(
    mercuryLeftHeight
      + mercuryRightHeight
      + mercuryTopHeight
      + mercuryBottomHeight
      - 4.0 * mercuryHeight
  );
  float curvatureHighlight = smoothstep(
    uMercuryCurvatureLow,
    uMercuryCurvatureHigh,
    mercuryCurvature
  );
  float mercuryFresnel = pow(
    1.0 - max(dot(mercuryNormal, viewDirection), 0.0),
    uMercuryFresnelPower
  );
  float thicknessFresnelModulation = mix(
    uMercuryThinFresnelBoost,
    1.0,
    mercuryThickness
  );
  float finalMercuryFresnel = mercuryFresnel
    * thicknessFresnelModulation
    * uMercuryFresnelStrength;
  vec3 mercuryColor = min(
    mercuryBase
      + uMercuryPrimaryHighlight
        * broadSpecular
        * uMercuryBroadSpecularStrength
      + uMercuryPrimaryHighlight
        * sharpSpecular
        * uMercurySharpSpecularStrength
      + uMercuryPrimaryHighlight
        * curvatureHighlight
        * uMercuryCurvatureStrength
      + uMercurySecondaryHighlight
        * finalMercuryFresnel,
    vec3(0.94)
  );
  float shellTransitionBand = mercuryShellMask
    * (1.0 - mercuryShellMask)
    * 4.0;
#ifdef USE_MERCURY_EDGE_REFRACTION
  vec2 mercuryEdgeUv = clamp(
    vUv
      + mercuryNormal.xy
        * uMercuryEdgeRefractionStrength
        * shellTransitionBand,
    vec2(0.0),
    vec2(1.0)
  );
  vec3 baseAtMercuryEdge = texture2D(
    uBaseTexture,
    mercuryEdgeUv
  ).rgb;
  vec3 shellBaseColor = mix(
    base.rgb,
    baseAtMercuryEdge,
    shellTransitionBand
  );
#else
  vec3 shellBaseColor = base.rgb;
#endif
  vec3 baseWithShell = mix(
    shellBaseColor,
    mercuryColor,
    mercuryShellOnly * uMercuryShellOpacity
  );
#else
  vec3 mercuryEnvironment = proceduralStudioReflection(
    mercuryReflectionDirection
  );
  vec3 mercuryBase = mix(
    uMercuryDarkColor,
    mercuryEnvironment,
    uMercuryReflectionStrength
  );
  float mercuryFresnel = pow(
    1.0 - max(dot(mercuryNormal, viewDirection), 0.0),
    uMercuryFresnelPower
  );
  float mercurySpecular = pow(
    max(
      dot(
        reflect(-uMetaballLightDirection, mercuryNormal),
        viewDirection
      ),
      0.0
    ),
    uMercurySpecularPower
  );
  vec3 mercuryColor = min(
    mercuryBase
      + uMercuryPrimaryHighlight
        * mercurySpecular
        * uMercurySpecularStrength
      + uMercurySecondaryHighlight
        * mercuryFresnel
        * uMercuryFresnelStrength,
    vec3(0.96)
  );
  float shellTransitionBand = mercuryShellMask
    * (1.0 - mercuryShellMask)
    * (1.0 - mercuryCoreMask)
    * 4.0;
  vec2 shellDistortedUv = clamp(
    vUv
      + mercuryNormal.xy
        * uMercuryEdgeDistortionStrength
        * shellTransitionBand,
    vec2(0.0),
    vec2(1.0)
  );
  float distortedShellMask = mercuryShellMaskFromDensity(
    sampleField(shellDistortedUv)
  );
  mercuryShellOnly = distortedShellMask
    * (1.0 - mercuryCoreMask);
  vec3 baseWithShell = mix(
    base.rgb,
    mercuryColor,
    mercuryShellOnly * uMercuryShellOpacity
  );
#endif
#ifdef USE_RAYMARCHED_MERCURY
  vec2 raymarchLocalUv = raymarchLocalPosition(vUv);
  vec3 raymarchOrigin = vec3(
    raymarchLocalUv,
    uRaymarchCameraDepth
  );
  vec3 raymarchDirection = vec3(0.0, 0.0, -1.0);
  vec3 raymarchHitPosition = raymarchOrigin;
  vec3 raymarchNormal = mercuryNormal;
  vec3 raymarchReflection = mercuryEnvironment;
  vec3 raymarchedMercuryColor = mercuryColor;
  float raymarchHit = 0.0;
  float raymarchDistance = 1000.0;
  float raymarchMinimumDistance = 1000.0;
  float raymarchStepCount = 0.0;
  float raymarchTravel = max(
    uRaymarchCameraDepth - uRaymarchNearDepth,
    0.0
  );
  float raymarchMaximumTravel = max(
    uRaymarchCameraDepth - uRaymarchFarDepth,
    raymarchTravel
  );

  if (
    mercuryShellMask >= uRaymarchShellEarlyOut
    && uRaymarchPrimitiveCount > 0.5
  ) {
    for (int rayStep = 0; rayStep < RAYMARCH_MAX_STEPS; rayStep++) {
      raymarchHitPosition = raymarchOrigin
        + raymarchDirection * raymarchTravel;
      raymarchDistance = raymarchSceneDistance(raymarchHitPosition);
      raymarchMinimumDistance = min(
        raymarchMinimumDistance,
        abs(raymarchDistance)
      );
      raymarchStepCount = float(rayStep + 1);
      if (abs(raymarchDistance) <= uRaymarchHitEpsilon) {
        raymarchHit = 1.0;
        break;
      }
      raymarchTravel += clamp(
        abs(raymarchDistance),
        uRaymarchMinimumStep,
        uRaymarchMaximumStep
      );
      if (
        raymarchTravel > raymarchMaximumTravel
        || raymarchHitPosition.z < uRaymarchFarDepth
      ) break;
    }
  }

  if (raymarchHit > 0.5) {
    raymarchNormal = raymarchSceneNormal(raymarchHitPosition);
    vec3 raymarchReflectionDirection = reflect(
      -viewDirection,
      raymarchNormal
    );
#ifdef USE_MERCURY_SURFACE_POLISH
    raymarchReflection = buildPolishedStudioEnvironment(
      raymarchReflectionDirection
    );
#ifdef USE_MERCURY_MICRO_REFLECTION
    raymarchReflection *= 1.0
      + sin(
        (vUv.x + vUv.y) * 18.0
          + rawFieldValue * 2.0
          + mercuryHeight * 4.0
      ) * uMercuryMicroReflectionStrength;
#endif
    vec3 raymarchBase = mix(
      mercuryBodyColor,
      raymarchReflection,
      uMercuryReflectionStrength
    );
    float raymarchBroadSpecular = pow(
      max(
        dot(
          reflect(-uMetaballLightDirection, raymarchNormal),
          viewDirection
        ),
        0.0
      ),
      uMercuryBroadSpecularPower
    );
    float raymarchSharpSpecular = pow(
      max(
        dot(
          reflect(-uMercurySharpLightDirection, raymarchNormal),
          viewDirection
        ),
        0.0
      ),
      uMercurySharpSpecularPower
    );
    float raymarchFresnel = pow(
      1.0 - max(dot(raymarchNormal, viewDirection), 0.0),
      uMercuryFresnelPower
    ) * thicknessFresnelModulation * uMercuryFresnelStrength;
    raymarchedMercuryColor = min(
      raymarchBase
        + uMercuryPrimaryHighlight
          * raymarchBroadSpecular
          * uMercuryBroadSpecularStrength
        + uMercuryPrimaryHighlight
          * raymarchSharpSpecular
          * uMercurySharpSpecularStrength
        + uMercuryPrimaryHighlight
          * curvatureHighlight
          * uMercuryCurvatureStrength
        + uMercurySecondaryHighlight * raymarchFresnel,
      vec3(0.94)
    );
#else
    raymarchReflection = proceduralStudioReflection(
      raymarchReflectionDirection
    );
    vec3 raymarchBase = mix(
      uMercuryDarkColor,
      raymarchReflection,
      uMercuryReflectionStrength
    );
    float raymarchFresnel = pow(
      1.0 - max(dot(raymarchNormal, viewDirection), 0.0),
      uMercuryFresnelPower
    );
    float raymarchSpecular = pow(
      max(
        dot(
          reflect(-uMetaballLightDirection, raymarchNormal),
          viewDirection
        ),
        0.0
      ),
      uMercurySpecularPower
    );
    raymarchedMercuryColor = min(
      raymarchBase
        + uMercuryPrimaryHighlight
          * raymarchSpecular
          * uMercurySpecularStrength
        + uMercurySecondaryHighlight
          * raymarchFresnel
          * uMercuryFresnelStrength,
      vec3(0.96)
    );
#endif
  }

  float raymarchEnvelope = raymarchHit > 0.5
    ? temporalSourceEnvelope(vUv)
    : 0.0;
  float raymarchVisibility = raymarchHit
    * mercuryShellMask
    * raymarchEnvelope;
  float raymarchWeight = raymarchVisibility * uRaymarchBlend;
  baseWithShell += (
    raymarchedMercuryColor - mercuryColor
  ) * raymarchWeight * mercuryShellOnly * uMercuryShellOpacity;
#endif
  vec3 helmetCore = mix(
    baseWithShell,
    shadedHelmet,
    mercuryCoreMask
  );
  vec3 mercuryComposite = mix(
    helmetCore,
    mercuryColor,
    mercuryCoreMask * uMercuryCoreSurfaceOverlay
  );
  vec4 mercuryPortrait = vec4(
    mercuryComposite,
    mix(base.a, helmet.a, mercuryCoreMask)
  );
  if (
    uMercuryShellEnabled > 0.5
    && metaballMode > 0.5
  ) {
    portrait = mercuryPortrait;
  }
#endif
  vec3 lightingOnly =
    vec3(diffuse * uMetaballDiffuseStrength) +
    additiveHighlights;

  vec4 outputColor = portrait;
  if (uMetaballDebugView > 0.5 && uMetaballDebugView < 1.5) {
    float displayDensity = 1.0 - exp(
      -rawFieldValue * uMetaballFieldDebugExposure
    );
    outputColor = vec4(vec3(displayDensity), 1.0);
  } else if (uMetaballDebugView < 2.5 && uMetaballDebugView > 1.5) {
    outputColor = vec4(vec3(metaballMask), 1.0);
  } else if (uMetaballDebugView < 3.5 && uMetaballDebugView > 2.5) {
    outputColor = vec4(vec3(metaballHeight), 1.0);
  } else if (uMetaballDebugView < 4.5 && uMetaballDebugView > 3.5) {
    vec3 normalColor = surfaceNormal * 0.5 + 0.5;
    outputColor = vec4(normalColor * metaballMask, 1.0);
  } else if (uMetaballDebugView < 5.5 && uMetaballDebugView > 4.5) {
    outputColor = vec4(clamp(lightingOnly * metaballMask, 0.0, 1.0), 1.0);
  }

  if (uTemporalDebugView > 0.5 && uTemporalDebugView < 1.5) {
    float sourceDisplayDensity = 1.0 - exp(
      -sampleTemporalSource(vUv) * uTemporalFieldDebugExposure
    );
    outputColor = vec4(vec3(sourceDisplayDensity), 1.0);
  } else if (uTemporalDebugView > 1.5 && uTemporalDebugView < 2.5) {
    float feedbackDisplayDensity = 1.0 - exp(
      -rawFieldValue * uTemporalFieldDebugExposure
    );
    outputColor = vec4(vec3(feedbackDisplayDensity), 1.0);
  } else if (uTemporalDebugView > 2.5 && uTemporalDebugView < 3.5) {
    outputColor = vec4(vec3(temporalSourceEnvelope(vUv)), 1.0);
  } else if (uTemporalDebugView > 3.5 && uTemporalDebugView < 4.5) {
    float maxVelocity = max(uTemporalMaxVelocity, 0.0001);
    vec2 normalizedVelocity = uTemporalVelocity / maxVelocity;
    float velocityMagnitude = clamp(length(normalizedVelocity), 0.0, 1.0);
    vec2 pointerDelta = vUv - uTemporalPointerUv;
    float influenceRadiusSquared = max(
      uTemporalVelocityInfluenceRadius * uTemporalVelocityInfluenceRadius,
      0.000001
    );
    float velocityInfluence = exp(
      -dot(pointerDelta, pointerDelta) / influenceRadiusSquared
    );
    vec3 velocityColor = vec3(
      normalizedVelocity * 0.5 + 0.5,
      velocityMagnitude
    );
    outputColor = vec4(
      mix(vec3(0.5, 0.5, 0.0), velocityColor, velocityInfluence),
      1.0
    );
  }

#ifdef USE_MERCURY_SHELL
  if (uMercuryDebugView > 0.5 && uMercuryDebugView < 1.5) {
    float mercuryDisplayDensity = 1.0 - exp(
      -rawFieldValue * uMetaballFieldDebugExposure
    );
    outputColor = vec4(vec3(mercuryDisplayDensity), 1.0);
  } else if (uMercuryDebugView > 1.5 && uMercuryDebugView < 2.5) {
    outputColor = vec4(vec3(mercuryShellMask), 1.0);
  } else if (uMercuryDebugView > 2.5 && uMercuryDebugView < 3.5) {
    outputColor = vec4(vec3(mercuryCoreMask), 1.0);
  } else if (uMercuryDebugView > 3.5 && uMercuryDebugView < 4.5) {
    outputColor = vec4(vec3(mercuryHeight), 1.0);
  } else if (uMercuryDebugView > 4.5 && uMercuryDebugView < 5.5) {
    outputColor = vec4(
      (mercuryNormal * 0.5 + 0.5) * mercuryShellMask,
      1.0
    );
  } else if (uMercuryDebugView > 5.5 && uMercuryDebugView < 6.5) {
    outputColor = vec4(mercuryEnvironment * mercuryShellMask, 1.0);
  } else if (uMercuryDebugView > 6.5 && uMercuryDebugView < 7.5) {
    outputColor = vec4(
      mix(baseWithShell, shadedHelmet, mercuryCoreMask),
      mix(base.a, helmet.a, mercuryCoreMask)
    );
  }
#ifdef USE_MERCURY_SURFACE_POLISH
  if (
    uMercurySurfaceDebugView > 0.5
    && uMercurySurfaceDebugView < 1.5
  ) {
    outputColor = vec4(
      vec3(mercuryThickness * mercuryShellMask),
      1.0
    );
  } else if (
    uMercurySurfaceDebugView > 1.5
    && uMercurySurfaceDebugView < 2.5
  ) {
    outputColor = vec4(
      mercuryEnvironment * mercuryShellMask,
      1.0
    );
  } else if (
    uMercurySurfaceDebugView > 2.5
    && uMercurySurfaceDebugView < 3.5
  ) {
    outputColor = vec4(
      vec3(broadSpecular * mercuryShellMask),
      1.0
    );
  } else if (
    uMercurySurfaceDebugView > 3.5
    && uMercurySurfaceDebugView < 4.5
  ) {
    outputColor = vec4(
      vec3(sharpSpecular * mercuryShellMask),
      1.0
    );
  } else if (
    uMercurySurfaceDebugView > 4.5
    && uMercurySurfaceDebugView < 5.5
  ) {
    outputColor = vec4(
      vec3(curvatureHighlight * mercuryShellMask),
      1.0
    );
  } else if (
    uMercurySurfaceDebugView > 5.5
    && uMercurySurfaceDebugView < 6.5
  ) {
    outputColor = vec4(
      vec3(finalMercuryFresnel * mercuryShellMask),
      1.0
    );
  } else if (
    uMercurySurfaceDebugView > 6.5
    && uMercurySurfaceDebugView < 7.5
  ) {
    outputColor = vec4(
      mercuryColor * mercuryShellMask,
      1.0
    );
  }
#endif
#ifdef USE_RAYMARCHED_MERCURY
  if (uRaymarchDebugView > 0.5 && uRaymarchDebugView < 1.5) {
    float projectedDistance = raymarchSceneDistance(
      vec3(raymarchLocalUv, 0.0)
    );
    float primitiveCoverage = 1.0 - smoothstep(
      0.0,
      max(uRaymarchMaximumStep, 0.0001),
      max(projectedDistance, 0.0)
    );
    outputColor = vec4(vec3(primitiveCoverage), 1.0);
  } else if (
    uRaymarchDebugView > 1.5
    && uRaymarchDebugView < 2.5
  ) {
    outputColor = vec4(vec3(raymarchHit), 1.0);
  } else if (
    uRaymarchDebugView > 2.5
    && uRaymarchDebugView < 3.5
  ) {
    float distanceDisplay = 1.0 - clamp(
      raymarchMinimumDistance / max(uRaymarchMaximumStep, 0.0001),
      0.0,
      1.0
    );
    outputColor = vec4(vec3(distanceDisplay), 1.0);
  } else if (
    uRaymarchDebugView > 3.5
    && uRaymarchDebugView < 4.5
  ) {
    outputColor = vec4(
      vec3(raymarchStepCount / float(RAYMARCH_MAX_STEPS)),
      1.0
    );
  } else if (
    uRaymarchDebugView > 4.5
    && uRaymarchDebugView < 5.5
  ) {
    outputColor = vec4(
      (raymarchNormal * 0.5 + 0.5) * raymarchHit,
      1.0
    );
  } else if (
    uRaymarchDebugView > 5.5
    && uRaymarchDebugView < 6.5
  ) {
    outputColor = vec4(
      raymarchReflection * raymarchVisibility,
      1.0
    );
  } else if (
    uRaymarchDebugView > 6.5
    && uRaymarchDebugView < 7.5
  ) {
    vec3 hybridComparison = mix(
      mercuryColor,
      raymarchedMercuryColor,
      raymarchVisibility * uRaymarchBlend
    );
    outputColor = vec4(
      mix(
        mercuryColor,
        hybridComparison,
        step(0.5, vUv.x)
      ) * mercuryShellMask,
      1.0
    );
  }
#endif
#endif

  gl_FragColor = outputColor;
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function compileMercuryShaderWithFallback(
  renderer: WebGLRenderer,
  scene: Scene,
  camera: Camera,
  material: ShaderMaterial,
) {
  const previousShaderErrorHandler = renderer.debug.onShaderError;
  let mercuryShaderVariantFailed = false;
  renderer.debug.onShaderError = (
    context,
    program,
    vertexShader,
    fragmentShader,
  ) => {
    const fragmentSource = context.getShaderSource(fragmentShader) ?? "";
    if (
      fragmentSource.includes(
        "#define USE_RAYMARCHED_MERCURY 1",
      )
      && material.defines?.USE_RAYMARCHED_MERCURY
    ) {
      delete material.defines.USE_RAYMARCHED_MERCURY;
      material.needsUpdate = true;
      mercuryShaderVariantFailed = true;
      return;
    }
    if (
      fragmentSource.includes(
        "#define USE_MERCURY_SURFACE_POLISH 1",
      )
      && material.defines?.USE_MERCURY_SURFACE_POLISH
    ) {
      delete material.defines.USE_MERCURY_SURFACE_POLISH;
      material.needsUpdate = true;
      mercuryShaderVariantFailed = true;
      return;
    }
    if (
      fragmentSource.includes("#define USE_MERCURY_SHELL 1")
      && material.defines
    ) {
      delete material.defines.USE_MERCURY_SHELL;
      material.needsUpdate = true;
      mercuryShaderVariantFailed = true;
      return;
    }
    previousShaderErrorHandler?.(
      context,
      program,
      vertexShader,
      fragmentShader,
    );
  };
  try {
    renderer.compile(scene, camera);
  } finally {
    renderer.debug.onShaderError = previousShaderErrorHandler;
  }
  if (mercuryShaderVariantFailed) renderer.compile(scene, camera);
}
