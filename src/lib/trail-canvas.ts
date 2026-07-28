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
export function resizeTrail(canvas: HTMLCanvasElement, imageAspect: number) { canvas.height = rippleConfig.trailResolution; canvas.width = Math.round(canvas.height * imageAspect); return canvas.getContext("2d", { alpha: true }); }
export function fadeTrail(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, amount: number) { ctx.save(); ctx.globalCompositeOperation = "destination-out"; ctx.fillStyle = `rgba(0,0,0,${amount})`; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.restore(); }
export function stampTrail(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, x: number, y: number, radius: number) { const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius); gradient.addColorStop(0, "rgba(255,255,255,.95)"); gradient.addColorStop(rippleConfig.hardness, "rgba(255,255,255,.7)"); gradient.addColorStop(1, "rgba(255,255,255,0)"); ctx.fillStyle = gradient; ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill(); }
export function markTextureForUpdate(texture: Texture) { texture.needsUpdate = true; }
