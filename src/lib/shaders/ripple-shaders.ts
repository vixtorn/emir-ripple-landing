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
