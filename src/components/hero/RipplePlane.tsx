"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { CanvasTexture, Color, LinearFilter, ShaderMaterial, Texture, Vector2, Vector3 } from "three";
import { rippleConfig, rippleEdgePalettes, rippleGradientMapPalette } from "@/lib/ripple-config";
import { rippleFragmentShader, rippleVertexShader } from "@/lib/shaders/ripple-shaders";
import { containedSize, markTextureForUpdate, prepareTrailBrush, resizeTrail, stampTrail, textureDimensions, type TrailPoint } from "@/lib/trail-canvas";
import type { PointerData } from "./RippleScene";

const edgePalette = rippleEdgePalettes[rippleConfig.rippleEdgeTheme];
const gradientPalette = rippleGradientMapPalette;

class TrailPointRingBuffer {
  private readonly points: Array<TrailPoint | undefined>;
  private head = 0;
  count = 0;

  constructor(private readonly capacity: number) {
    this.points = new Array<TrailPoint | undefined>(capacity);
  }

  append(point: TrailPoint) {
    if (this.count === this.capacity) {
      this.points[this.head] = point;
      this.head = (this.head + 1) % this.capacity;
      return;
    }
    this.points[(this.head + this.count) % this.capacity] = point;
    this.count += 1;
  }

  oldest() {
    return this.count > 0 ? this.points[this.head] : undefined;
  }

  removeOldest() {
    if (this.count === 0) return;
    this.points[this.head] = undefined;
    this.head = (this.head + 1) % this.capacity;
    this.count -= 1;
  }

  at(index: number) {
    return index < this.count ? this.points[(this.head + index) % this.capacity] : undefined;
  }

  clear() {
    while (this.count > 0) this.removeOldest();
    this.head = 0;
  }
}

function pointAlpha(point: TrailPoint, nowMs: number) {
  const ageMs = Math.max(0, nowMs - point.createdAtMs);
  if (ageMs < rippleConfig.trailPointHoldMs) return point.strength;
  const progress = Math.min(1, (ageMs - rippleConfig.trailPointHoldMs) / rippleConfig.trailPointFadeMs);
  const smoothProgress = progress * progress * (3 - 2 * progress);
  return point.strength * (1 - smoothProgress);
}

export default function RipplePlane({ baseTexture, helmetTexture, pointer }: { baseTexture: Texture; helmetTexture: Texture; pointer: React.MutableRefObject<PointerData> }) {
  const { viewport } = useThree();
  const baseDimensions = textureDimensions(baseTexture);
  const imageAspect = baseDimensions.width / baseDimensions.height;
  const trailCanvas = useMemo(() => document.createElement("canvas"), []);
  const trailBrush = useMemo(() => document.createElement("canvas"), []);
  const trailPoints = useMemo(() => new TrailPointRingBuffer(rippleConfig.maxTrailPoints), []);
  const trailTexture = useMemo(() => {
    const texture = new CanvasTexture(trailCanvas);
    texture.minFilter = LinearFilter;
    texture.magFilter = LinearFilter;
    return texture;
  }, [trailCanvas]);
  const context = useRef<CanvasRenderingContext2D | null>(null);
  const timeUniform = useRef({ value: 0 });
  const material = useMemo(() => new ShaderMaterial({
    transparent: true,
    vertexShader: rippleVertexShader,
    fragmentShader: rippleFragmentShader,
    uniforms: {
      uBaseTexture: { value: baseTexture },
      uHelmetTexture: { value: helmetTexture },
      uTrailTexture: { value: trailTexture },
      uEdgePrimary: { value: new Color(edgePalette.primary) },
      uEdgeHighlight: { value: new Color(edgePalette.highlight) },
      uEdgeAccent: { value: new Color(edgePalette.accent) },
      uGradientDark: { value: new Color(gradientPalette.dark) },
      uGradientPurple: { value: new Color(gradientPalette.purple) },
      uGradientPink: { value: new Color(gradientPalette.pink) },
      uGradientLight: { value: new Color(gradientPalette.light) },
      uGradientMapStops: { value: new Vector3(rippleConfig.gradientMapStops.darkEnd, rippleConfig.gradientMapStops.purple, rippleConfig.gradientMapStops.pink) },
      uGradientMapEnabled: { value: rippleConfig.gradientMapEnabled ? 1 : 0 },
      uGradientMapMix: { value: rippleConfig.gradientMapMix },
      uGradientMapPhase: { value: rippleConfig.gradientMapPhase },
      uGradientMapScale: { value: rippleConfig.gradientMapScale },
      uGradientMapFlowSpeed: { value: rippleConfig.gradientMapFlowSpeed },
      uGradientMapDriftAmount: { value: rippleConfig.gradientMapDriftAmount },
      uTrailTexelSize: { value: new Vector2(1 / Math.round(rippleConfig.trailResolution * imageAspect), 1 / rippleConfig.trailResolution) },
      uMaskBlurRadiusPx: { value: rippleConfig.maskBlurRadiusPx },
      uEdgeThreshold: { value: rippleConfig.edgeThreshold },
      uEdgeWidth: { value: rippleConfig.edgeWidth },
      uEdgeStrength: { value: rippleConfig.edgeStrength },
      uAuraWidth: { value: rippleConfig.auraWidth },
      uAuraStrength: { value: rippleConfig.auraStrength },
      uAuraVioletMix: { value: rippleConfig.auraVioletMix },
      uNoiseScale: { value: rippleConfig.noiseScale },
      uNoiseSpeed: { value: rippleConfig.noiseSpeed },
      uNoiseAmount: { value: rippleConfig.noiseAmount },
      uDistortionStrength: { value: rippleConfig.distortionStrength },
      uAuraDistortionInfluence: { value: rippleConfig.auraDistortionInfluence },
      uChromaticOffset: { value: rippleConfig.chromaticOffset },
      uChromaticStrength: { value: rippleConfig.chromaticStrength },
      uChromaticAuraInfluence: { value: rippleConfig.chromaticAuraInfluence },
      uEdgeFlowSpeed: { value: rippleConfig.edgeFlowSpeed },
      uEdgeFlowFrequency: { value: new Vector2(rippleConfig.edgeFlowFrequency.x, rippleConfig.edgeFlowFrequency.y) },
      uEdgeHighlightSharpness: { value: rippleConfig.edgeHighlightSharpness },
      uTime: { value: 0 },
    },
  }), [baseTexture, helmetTexture, imageAspect, trailTexture]);
  const lifecycle = useRef({
    canvasHasMask: false,
    hasLastStamp: false,
    lastMovementId: 0,
    lastMovementTime: 0,
    lastStampU: 0,
    lastStampV: 0,
  });

  useEffect(() => {
    context.current = resizeTrail(trailCanvas, imageAspect);
    prepareTrailBrush(trailBrush, rippleConfig.radius * trailCanvas.height);
    trailPoints.clear();
    lifecycle.current.canvasHasMask = false;
    lifecycle.current.hasLastStamp = false;
    lifecycle.current.lastMovementId = pointer.current.movementId;
    markTextureForUpdate(trailTexture);
  }, [imageAspect, pointer, trailBrush, trailCanvas, trailPoints, trailTexture]);
  useEffect(() => {
    timeUniform.current = material.uniforms.uTime;
    return () => { trailTexture.dispose(); material.dispose(); };
  }, [material, trailTexture]);

  useFrame(({ clock }) => {
    const ctx = context.current;
    if (!ctx) return;
    timeUniform.current.value = clock.elapsedTime;
    const trail = lifecycle.current;
    const currentPointer = pointer.current;
    if (currentPointer.movementId !== trail.lastMovementId) {
      trail.lastMovementId = currentPointer.movementId;
      const nowMs = performance.now();
      const movementIsFresh = nowMs - currentPointer.lastMovementTime <= rippleConfig.trailIdleTimeoutMs;
      if (currentPointer.active && movementIsFresh) {
        const shouldInterpolate = trail.hasLastStamp
          && currentPointer.lastMovementTime - trail.lastMovementTime <= rippleConfig.trailIdleTimeoutMs;
        const startU = shouldInterpolate ? trail.lastStampU : currentPointer.u;
        const startV = shouldInterpolate ? trail.lastStampV : currentPointer.v;
        const distanceX = (currentPointer.u - startU) * trailCanvas.width;
        const distanceY = (currentPointer.v - startV) * trailCanvas.height;
        const steps = Math.max(1, Math.ceil(Math.hypot(distanceX, distanceY) / rippleConfig.trailInterpolationSpacingPx));
        const startTime = shouldInterpolate ? trail.lastMovementTime : currentPointer.lastMovementTime;
        const radius = rippleConfig.radius * trailCanvas.height;
        for (let step = 1; step <= steps; step += 1) {
          const progress = step / steps;
          trailPoints.append({
            x: (startU + (currentPointer.u - startU) * progress) * trailCanvas.width,
            y: (1 - (startV + (currentPointer.v - startV) * progress)) * trailCanvas.height,
            createdAtMs: startTime + (currentPointer.lastMovementTime - startTime) * progress,
            radius,
            strength: 1,
          });
        }
        trail.hasLastStamp = true;
        trail.lastMovementTime = currentPointer.lastMovementTime;
        trail.lastStampU = currentPointer.u;
        trail.lastStampV = currentPointer.v;
      } else {
        trail.hasLastStamp = false;
      }
    }

    const nowMs = performance.now();
    let oldest = trailPoints.oldest();
    while (oldest) {
      const ageMs = nowMs - oldest.createdAtMs;
      if (ageMs < rippleConfig.trailPointLifetimeMs && pointAlpha(oldest, nowMs) >= rippleConfig.trailVisibilityCutoff) break;
      trailPoints.removeOldest();
      oldest = trailPoints.oldest();
    }

    if (trailPoints.count === 0) {
      if (trail.canvasHasMask) {
        ctx.clearRect(0, 0, trailCanvas.width, trailCanvas.height);
        markTextureForUpdate(trailTexture);
        trail.canvasHasMask = false;
      }
      return;
    }

    ctx.clearRect(0, 0, trailCanvas.width, trailCanvas.height);
    for (let index = 0; index < trailPoints.count; index += 1) {
      const point = trailPoints.at(index);
      if (!point) continue;
      const alpha = pointAlpha(point, nowMs);
      if (alpha >= rippleConfig.trailVisibilityCutoff) stampTrail(ctx, trailBrush, point, alpha);
    }
    ctx.globalAlpha = 1;
    markTextureForUpdate(trailTexture);
    trail.canvasHasMask = true;
  });

  const { width: planeWidth, height: planeHeight } = containedSize(viewport.width, viewport.height, imageAspect);
  return <mesh scale={[planeWidth, planeHeight, 1]}><planeGeometry args={[1, 1]} /><primitive object={material} attach="material" /></mesh>;
}
