import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  HalfFloatType,
  LinearFilter,
  Mesh,
  NoColorSpace,
  OrthographicCamera,
  RedFormat,
  Scene,
  ShaderMaterial,
  Vector2,
  WebGLRenderTarget,
  type Texture,
  type WebGLRenderer,
} from "three";
import { rippleConfig } from "./ripple-config";

const temporalVertexShader = /* glsl */ `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const temporalFragmentShader = /* glsl */ `
uniform sampler2D uPreviousDensity;
uniform sampler2D uSourceDensity;
uniform float uDeltaSeconds;
uniform vec2 uPointerUv;
uniform vec2 uVelocity;
uniform float uPointerActivity;
uniform vec2 uSourceTexelSize;
uniform float uAdvectionStrength;
uniform float uDiffusionStrength;
uniform float uDissipationPerSecond;
uniform float uInjectionStrength;
uniform float uSourceAttraction;
uniform float uVelocityInfluenceRadius;
uniform float uEnvelopeThreshold;
uniform float uEnvelopeSoftness;
varying vec2 vUv;

float previousDensity(vec2 uv) {
  return texture2D(uPreviousDensity, clamp(uv, vec2(0.0), vec2(1.0))).r;
}

float sourceDensity(vec2 uv) {
  return texture2D(uSourceDensity, clamp(uv, vec2(0.0), vec2(1.0))).r;
}

void main() {
  float radiusSquared = max(
    uVelocityInfluenceRadius * uVelocityInfluenceRadius,
    0.000001
  );
  vec2 pointerDelta = vUv - uPointerUv;
  float localInfluence = exp(
    -dot(pointerDelta, pointerDelta) / radiusSquared
  ) * uPointerActivity;
  vec2 offset = uVelocity
    * uAdvectionStrength
    * uDeltaSeconds
    * localInfluence;
  vec2 advectedUv = clamp(vUv - offset, vec2(0.0), vec2(1.0));

  float advectedPrevious = previousDensity(advectedUv);
  float neighborAverage = (
    previousDensity(advectedUv - vec2(uSourceTexelSize.x, 0.0))
    + previousDensity(advectedUv + vec2(uSourceTexelSize.x, 0.0))
    + previousDensity(advectedUv - vec2(0.0, uSourceTexelSize.y))
    + previousDensity(advectedUv + vec2(0.0, uSourceTexelSize.y))
  ) * 0.25;
  float diffusedPrevious = mix(
    advectedPrevious,
    neighborAverage,
    uDiffusionStrength
  );
  float decayedPrevious = diffusedPrevious
    * exp(-uDissipationPerSecond * uDeltaSeconds);

  float source = sourceDensity(vUv);
  float injected = max(
    decayedPrevious,
    source * uInjectionStrength
  );
  float combined = mix(injected, source, uSourceAttraction);

  float blurredSource = source * 0.5 + (
    sourceDensity(vUv - vec2(uSourceTexelSize.x, 0.0))
    + sourceDensity(vUv + vec2(uSourceTexelSize.x, 0.0))
    + sourceDensity(vUv - vec2(0.0, uSourceTexelSize.y))
    + sourceDensity(vUv + vec2(0.0, uSourceTexelSize.y))
  ) * 0.125;
  float sourceEnvelope = smoothstep(
    uEnvelopeThreshold - uEnvelopeSoftness,
    uEnvelopeThreshold + uEnvelopeSoftness,
    blurredSource
  );

  gl_FragColor = vec4(combined * sourceEnvelope, 0.0, 0.0, 1.0);
}
`;

export type TemporalMetaballField = {
  targetA: WebGLRenderTarget;
  targetB: WebGLRenderTarget;
  currentTarget: WebGLRenderTarget;
  width: number;
  height: number;
  scene: Scene;
  camera: OrthographicCamera;
  geometry: BufferGeometry;
  material: ShaderMaterial;
  restoreClearColor: Color;
};

function createTemporalTarget(
  width: number,
  height: number,
  name: string,
) {
  const target = new WebGLRenderTarget(width, height, {
    type: HalfFloatType,
    format: RedFormat,
    minFilter: LinearFilter,
    magFilter: LinearFilter,
    generateMipmaps: false,
    depthBuffer: false,
    stencilBuffer: false,
  });
  target.texture.colorSpace = NoColorSpace;
  target.texture.name = name;
  return target;
}

function isFramebufferComplete(
  renderer: WebGLRenderer,
  target: WebGLRenderTarget,
) {
  renderer.setRenderTarget(target);
  const context = renderer.getContext();
  return context.checkFramebufferStatus(context.FRAMEBUFFER)
    === context.FRAMEBUFFER_COMPLETE;
}

export function clearTemporalMetaballField(
  renderer: WebGLRenderer,
  field: TemporalMetaballField,
) {
  const previousTarget = renderer.getRenderTarget();
  renderer.getClearColor(field.restoreClearColor);
  const previousClearAlpha = renderer.getClearAlpha();
  try {
    renderer.setClearColor(0x000000, 0);
    renderer.setRenderTarget(field.targetA);
    renderer.clear(true, false, false);
    renderer.setRenderTarget(field.targetB);
    renderer.clear(true, false, false);
  } finally {
    renderer.setRenderTarget(previousTarget);
    renderer.setClearColor(field.restoreClearColor, previousClearAlpha);
  }
  field.currentTarget = field.targetA;
}

export function createTemporalMetaballField(
  renderer: WebGLRenderer,
  sourceTexture: Texture,
  width: number,
  height: number,
): TemporalMetaballField | null {
  let targetA: WebGLRenderTarget | null = null;
  let targetB: WebGLRenderTarget | null = null;
  let geometry: BufferGeometry | null = null;
  let material: ShaderMaterial | null = null;

  try {
    targetA = createTemporalTarget(
      width,
      height,
      "temporal-metaball-field-a",
    );
    targetB = createTemporalTarget(
      width,
      height,
      "temporal-metaball-field-b",
    );
    const previousTarget = renderer.getRenderTarget();
    let targetAComplete = false;
    let targetBComplete = false;
    try {
      targetAComplete = isFramebufferComplete(renderer, targetA);
      targetBComplete = isFramebufferComplete(renderer, targetB);
    } finally {
      renderer.setRenderTarget(previousTarget);
    }
    if (!targetAComplete || !targetBComplete) {
      targetA.dispose();
      targetB.dispose();
      return null;
    }

    geometry = new BufferGeometry();
    geometry.setIndex([0, 1, 2, 0, 2, 3]);
    geometry.setAttribute("position", new Float32BufferAttribute([
      -1, -1, 0,
      1, -1, 0,
      1, 1, 0,
      -1, 1, 0,
    ], 3));
    geometry.setAttribute("uv", new Float32BufferAttribute([
      0, 0,
      1, 0,
      1, 1,
      0, 1,
    ], 2));

    material = new ShaderMaterial({
      vertexShader: temporalVertexShader,
      fragmentShader: temporalFragmentShader,
      uniforms: {
        uPreviousDensity: { value: targetA.texture },
        uSourceDensity: { value: sourceTexture },
        uDeltaSeconds: { value: 0 },
        uPointerUv: { value: new Vector2(0.5, 0.5) },
        uVelocity: { value: new Vector2() },
        uPointerActivity: { value: 0 },
        uSourceTexelSize: {
          value: new Vector2(1 / width, 1 / height),
        },
        uAdvectionStrength: {
          value: rippleConfig.temporalAdvectionStrength,
        },
        uDiffusionStrength: {
          value: rippleConfig.temporalDiffusionStrength,
        },
        uDissipationPerSecond: {
          value: rippleConfig.temporalDissipationPerSecond,
        },
        uInjectionStrength: {
          value: rippleConfig.temporalInjectionStrength,
        },
        uSourceAttraction: {
          value: rippleConfig.temporalSourceAttraction,
        },
        uVelocityInfluenceRadius: {
          value: rippleConfig.temporalVelocityInfluenceRadius,
        },
        uEnvelopeThreshold: {
          value: rippleConfig.temporalEnvelopeThreshold,
        },
        uEnvelopeSoftness: {
          value: rippleConfig.temporalEnvelopeSoftness,
        },
      },
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    const mesh = new Mesh(geometry, material);
    mesh.frustumCulled = false;
    const scene = new Scene();
    scene.add(mesh);
    const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const field: TemporalMetaballField = {
      targetA,
      targetB,
      currentTarget: targetA,
      width,
      height,
      scene,
      camera,
      geometry,
      material,
      restoreClearColor: new Color(),
    };
    clearTemporalMetaballField(renderer, field);
    return field;
  } catch {
    targetA?.dispose();
    targetB?.dispose();
    geometry?.dispose();
    material?.dispose();
    return null;
  }
}

export function renderTemporalMetaballField(
  renderer: WebGLRenderer,
  field: TemporalMetaballField,
  sourceTexture: Texture,
  deltaSeconds: number,
  pointerU: number,
  pointerV: number,
  velocityU: number,
  velocityV: number,
  pointerActivity: boolean,
) {
  const destination = field.currentTarget === field.targetA
    ? field.targetB
    : field.targetA;
  const uniforms = field.material.uniforms;
  uniforms.uPreviousDensity.value = field.currentTarget.texture;
  uniforms.uSourceDensity.value = sourceTexture;
  uniforms.uDeltaSeconds.value = deltaSeconds;
  uniforms.uPointerUv.value.set(pointerU, pointerV);
  uniforms.uVelocity.value.set(velocityU, velocityV);
  uniforms.uPointerActivity.value = pointerActivity ? 1 : 0;

  const previousTarget = renderer.getRenderTarget();
  try {
    renderer.setRenderTarget(destination);
    renderer.render(field.scene, field.camera);
  } finally {
    renderer.setRenderTarget(previousTarget);
  }
  field.currentTarget = destination;
  return destination.texture;
}

export function disposeTemporalMetaballField(
  field: TemporalMetaballField,
) {
  field.targetA.dispose();
  field.targetB.dispose();
  field.geometry.dispose();
  field.material.dispose();
}
