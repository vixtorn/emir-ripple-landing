import type { Texture } from "three";
import { SRGBColorSpace } from "three";
import { rippleConfig } from "./ripple-config";

export type TrailPoint = {
  x: number;
  y: number;
  createdAtMs: number;
  radius: number;
  strength: number;
};

export function configureColorTexture(texture: Texture) { texture.colorSpace = SRGBColorSpace; texture.needsUpdate = true; }
export function textureDimensions(texture: Texture) { const image = texture.image as HTMLImageElement; return { width: image.naturalWidth || image.width, height: image.naturalHeight || image.height }; }
export function containedSize(containerWidth: number, containerHeight: number, imageAspect: number) {
  const containerAspect = containerWidth / containerHeight;
  return imageAspect > containerAspect
    ? { width: containerWidth, height: containerWidth / imageAspect }
    : { width: containerHeight * imageAspect, height: containerHeight };
}
export function resizeTrail(canvas: HTMLCanvasElement, imageAspect: number) {
  canvas.height = rippleConfig.trailResolution;
  canvas.width = Math.round(canvas.height * imageAspect);
  const context = canvas.getContext("2d", { alpha: true });
  context?.clearRect(0, 0, canvas.width, canvas.height);
  return context;
}
export function resizeMetaballField(canvas: HTMLCanvasElement, imageAspect: number) {
  canvas.height = rippleConfig.metaballFieldResolution;
  canvas.width = Math.round(canvas.height * imageAspect);
  const context = canvas.getContext("2d", { alpha: true });
  context?.clearRect(0, 0, canvas.width, canvas.height);
  return context;
}
export function prepareTrailBrush(canvas: HTMLCanvasElement, radius: number) {
  const size = Math.ceil(radius * 2);
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d", { alpha: true });
  if (!context) return;
  context.clearRect(0, 0, size, size);
  const center = size / 2;
  const gradient = context.createRadialGradient(center, center, 0, center, center, radius);
  gradient.addColorStop(0, "rgba(255,255,255,.95)");
  gradient.addColorStop(rippleConfig.hardness, "rgba(255,255,255,.7)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
}
export function prepareMetaballFieldBrush(canvas: HTMLCanvasElement, radius: number) {
  const size = Math.ceil(radius * 2);
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d", { alpha: true });
  if (!context) return;
  context.clearRect(0, 0, size, size);
  const center = size / 2;
  const gradient = context.createRadialGradient(center, center, 0, center, center, radius);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(
    rippleConfig.metaballFieldInnerStop,
    `rgba(255,255,255,${rippleConfig.metaballFieldInnerStrength})`,
  );
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
}
export function stampTrail(ctx: CanvasRenderingContext2D, brush: HTMLCanvasElement, point: TrailPoint, alpha: number) {
  const diameter = point.radius * 2;
  ctx.globalAlpha = alpha;
  ctx.drawImage(brush, point.x - point.radius, point.y - point.radius, diameter, diameter);
}
export function stampMetaballField(
  ctx: CanvasRenderingContext2D,
  brush: HTMLCanvasElement,
  point: TrailPoint,
  alpha: number,
  positionScaleX: number,
  positionScaleY: number,
) {
  const radius = point.radius * positionScaleY;
  const diameter = radius * 2;
  const x = point.x * positionScaleX;
  const y = point.y * positionScaleY;
  ctx.globalAlpha = alpha * rippleConfig.metaballFieldStrength;
  ctx.drawImage(brush, x - radius, y - radius, diameter, diameter);
}
export function markTextureForUpdate(texture: Texture) { texture.needsUpdate = true; }
