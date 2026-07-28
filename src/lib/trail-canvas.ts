import type { Texture } from "three";
import { SRGBColorSpace } from "three";
import { rippleConfig } from "./ripple-config";

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
export function fadeTrail(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, amount: number) { ctx.save(); ctx.globalCompositeOperation = "destination-out"; ctx.fillStyle = `rgba(0,0,0,${amount})`; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.restore(); }
export function stampTrail(ctx: CanvasRenderingContext2D, brush: HTMLCanvasElement, x: number, y: number) { ctx.drawImage(brush, x - brush.width / 2, y - brush.height / 2); }
export function markTextureForUpdate(texture: Texture) { texture.needsUpdate = true; }
