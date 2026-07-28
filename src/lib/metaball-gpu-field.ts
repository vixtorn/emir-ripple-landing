import {
  AddEquation,
  BufferAttribute,
  Color,
  CustomBlending,
  DynamicDrawUsage,
  HalfFloatType,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  LinearFilter,
  Mesh,
  NoColorSpace,
  OneFactor,
  OrthographicCamera,
  RedFormat,
  Scene,
  ShaderMaterial,
  WebGLRenderTarget,
  type WebGLRenderer,
} from "three";
import { rippleConfig } from "./ripple-config";

const splatVertexShader = /* glsl */ `
attribute vec2 aCenter;
attribute vec2 aRadius;
attribute float aDensity;
varying vec2 vLocalPosition;
varying float vDensity;

void main() {
  vLocalPosition = position.xy;
  vDensity = aDensity;
  vec2 fieldUv = aCenter + position.xy * aRadius;
  gl_Position = vec4(fieldUv * 2.0 - 1.0, 0.0, 1.0);
}
`;

const splatFragmentShader = /* glsl */ `
uniform float uGaussianSharpness;
varying vec2 vLocalPosition;
varying float vDensity;

void main() {
  float radiusSquared = dot(vLocalPosition, vLocalPosition);
  if (radiusSquared >= 1.0) discard;
  float gaussian = exp(-radiusSquared * uGaussianSharpness);
  float radialWindow = 1.0 - smoothstep(0.0, 1.0, radiusSquared);
  float density = gaussian * radialWindow * vDensity;
  gl_FragColor = vec4(density, 0.0, 0.0, 1.0);
}
`;

export type GpuMetaballField = {
  target: WebGLRenderTarget;
  width: number;
  height: number;
  capacity: number;
  centers: Float32Array;
  radii: Float32Array;
  densities: Float32Array;
  centerAttribute: InstancedBufferAttribute;
  radiusAttribute: InstancedBufferAttribute;
  densityAttribute: InstancedBufferAttribute;
  geometry: InstancedBufferGeometry;
  material: ShaderMaterial;
  scene: Scene;
  camera: OrthographicCamera;
  restoreClearColor: Color;
};

export function supportsGpuHalfFloatField(renderer: WebGLRenderer) {
  return renderer.capabilities.isWebGL2
    && renderer.extensions.has("EXT_color_buffer_float")
    && renderer.extensions.has("EXT_float_blend");
}

export function createGpuMetaballField(
  renderer: WebGLRenderer,
  imageAspect: number,
): GpuMetaballField | null {
  if (!supportsGpuHalfFloatField(renderer)) return null;

  try {
    const height = rippleConfig.metaballFieldResolution;
    const width = Math.round(height * imageAspect);
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
    target.texture.name = "metaball-half-float-field";
    const previousTarget = renderer.getRenderTarget();
    renderer.setRenderTarget(target);
    const context = renderer.getContext();
    const framebufferComplete = context.checkFramebufferStatus(context.FRAMEBUFFER)
      === context.FRAMEBUFFER_COMPLETE;
    renderer.setRenderTarget(previousTarget);
    if (!framebufferComplete) {
      target.dispose();
      return null;
    }

    const geometry = new InstancedBufferGeometry();
    geometry.setIndex(new BufferAttribute(new Uint16Array([
      0, 1, 2,
      0, 2, 3,
    ]), 1));
    geometry.setAttribute("position", new BufferAttribute(new Float32Array([
      -1, -1, 0,
      1, -1, 0,
      1, 1, 0,
      -1, 1, 0,
    ]), 3));

    const capacity = rippleConfig.maxTrailPoints;
    const centers = new Float32Array(capacity * 2);
    const radii = new Float32Array(capacity * 2);
    const densities = new Float32Array(capacity);
    const centerAttribute = new InstancedBufferAttribute(centers, 2).setUsage(DynamicDrawUsage);
    const radiusAttribute = new InstancedBufferAttribute(radii, 2).setUsage(DynamicDrawUsage);
    const densityAttribute = new InstancedBufferAttribute(densities, 1).setUsage(DynamicDrawUsage);
    geometry.setAttribute("aCenter", centerAttribute);
    geometry.setAttribute("aRadius", radiusAttribute);
    geometry.setAttribute("aDensity", densityAttribute);
    geometry.instanceCount = 0;

    const material = new ShaderMaterial({
      vertexShader: splatVertexShader,
      fragmentShader: splatFragmentShader,
      uniforms: {
        uGaussianSharpness: { value: rippleConfig.metaballGaussianSharpness },
      },
      transparent: true,
      blending: CustomBlending,
      blendEquation: AddEquation,
      blendSrc: OneFactor,
      blendDst: OneFactor,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    const mesh = new Mesh(geometry, material);
    mesh.frustumCulled = false;
    const scene = new Scene();
    scene.add(mesh);
    const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);

    return {
      target,
      width,
      height,
      capacity,
      centers,
      radii,
      densities,
      centerAttribute,
      radiusAttribute,
      densityAttribute,
      geometry,
      material,
      scene,
      camera,
      restoreClearColor: new Color(),
    };
  } catch {
    return null;
  }
}

export function setGpuMetaballSplat(
  field: GpuMetaballField,
  index: number,
  centerX: number,
  centerY: number,
  radiusX: number,
  radiusY: number,
  density: number,
) {
  const vectorIndex = index * 2;
  field.centers[vectorIndex] = centerX;
  field.centers[vectorIndex + 1] = centerY;
  field.radii[vectorIndex] = radiusX;
  field.radii[vectorIndex + 1] = radiusY;
  field.densities[index] = density;
}

export function renderGpuMetaballField(
  renderer: WebGLRenderer,
  field: GpuMetaballField,
  instanceCount: number,
) {
  field.geometry.instanceCount = instanceCount;
  field.centerAttribute.needsUpdate = true;
  field.radiusAttribute.needsUpdate = true;
  field.densityAttribute.needsUpdate = true;

  const previousTarget = renderer.getRenderTarget();
  renderer.getClearColor(field.restoreClearColor);
  const previousClearAlpha = renderer.getClearAlpha();
  renderer.setRenderTarget(field.target);
  renderer.setClearColor(0x000000, 0);
  renderer.clear(true, false, false);
  if (instanceCount > 0) renderer.render(field.scene, field.camera);
  renderer.setRenderTarget(previousTarget);
  renderer.setClearColor(field.restoreClearColor, previousClearAlpha);
}

export function disposeGpuMetaballField(field: GpuMetaballField) {
  field.target.dispose();
  field.geometry.dispose();
  field.material.dispose();
}
