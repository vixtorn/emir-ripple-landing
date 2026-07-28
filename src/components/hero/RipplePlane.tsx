"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { CanvasTexture, Color, LinearFilter, ShaderMaterial, Texture, Vector2, Vector3 } from "three";
import { metaballDebugViews, rippleConfig } from "@/lib/ripple-config";
import { rippleFragmentShader, rippleVertexShader } from "@/lib/shaders/ripple-shaders";
import { containedSize, markTextureForUpdate, prepareMetaballFieldBrush, prepareTrailBrush, resizeMetaballField, resizeTrail, stampMetaballField, stampTrail, textureDimensions, type TrailPoint } from "@/lib/trail-canvas";
import type { PointerData } from "./RippleScene";

const metaballDebugView = process.env.NODE_ENV === "development"
  ? rippleConfig.metaballDebugView
  : "final";
const debugMetaballSinglePoint = process.env.NODE_ENV === "development"
  && rippleConfig.debugMetaballSinglePoint;

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
  const metaballFieldCanvas = useMemo(() => document.createElement("canvas"), []);
  const metaballFieldBrush = useMemo(() => document.createElement("canvas"), []);
  const trailPoints = useMemo(() => new TrailPointRingBuffer(rippleConfig.maxTrailPoints), []);
  const trailTexture = useMemo(() => {
    const texture = new CanvasTexture(trailCanvas);
    texture.minFilter = LinearFilter;
    texture.magFilter = LinearFilter;
    return texture;
  }, [trailCanvas]);
  const metaballFieldTexture = useMemo(() => {
    const texture = new CanvasTexture(metaballFieldCanvas);
    texture.minFilter = LinearFilter;
    texture.magFilter = LinearFilter;
    texture.generateMipmaps = false;
    return texture;
  }, [metaballFieldCanvas]);
  const context = useRef<CanvasRenderingContext2D | null>(null);
  const metaballFieldContext = useRef<CanvasRenderingContext2D | null>(null);
  const revealModeUniform = useRef({ value: rippleConfig.revealMode === "metaball" ? 1 : 0 });
  const material = useMemo(() => new ShaderMaterial({
    transparent: true,
    vertexShader: rippleVertexShader,
    fragmentShader: rippleFragmentShader,
    uniforms: {
      uBaseTexture: { value: baseTexture },
      uHelmetTexture: { value: helmetTexture },
      uTrailTexture: { value: trailTexture },
      uMetaballField: { value: metaballFieldTexture },
      uMetaballFieldTexelSize: { value: new Vector2(1 / Math.round(rippleConfig.metaballFieldResolution * imageAspect), 1 / rippleConfig.metaballFieldResolution) },
      uRevealMode: { value: rippleConfig.revealMode === "metaball" ? 1 : 0 },
      uDebugCompareRevealModes: { value: rippleConfig.debugCompareRevealModes ? 1 : 0 },
      uMetaballDebugView: { value: metaballDebugViews[metaballDebugView] },
      uMetaballThreshold: { value: rippleConfig.metaballThreshold },
      uMetaballSoftness: { value: rippleConfig.metaballSoftness },
      uMetaballNormalStrength: { value: rippleConfig.metaballNormalStrength },
      uMetaballLightDirection: { value: new Vector3(rippleConfig.metaballLightDirection.x, rippleConfig.metaballLightDirection.y, rippleConfig.metaballLightDirection.z).normalize() },
      uMetaballDiffuseStrength: { value: rippleConfig.metaballDiffuseStrength },
      uMetaballSpecularStrength: { value: rippleConfig.metaballSpecularStrength },
      uMetaballSpecularPower: { value: rippleConfig.metaballSpecularPower },
      uMetaballFresnelStrength: { value: rippleConfig.metaballFresnelStrength },
      uMetaballFresnelPower: { value: rippleConfig.metaballFresnelPower },
      uMetaballRefractionStrength: { value: rippleConfig.metaballRefractionStrength },
      uMetaballPrimaryHighlight: { value: new Color(rippleConfig.metaballPrimaryHighlight) },
      uMetaballSecondaryHighlight: { value: new Color(rippleConfig.metaballSecondaryHighlight) },
    },
  }), [baseTexture, helmetTexture, imageAspect, metaballFieldTexture, trailTexture]);
  const lifecycle = useRef({
    canvasHasMask: false,
    fieldHasDensity: false,
    hasLastStamp: false,
    lastMovementId: 0,
    lastMovementTime: 0,
    lastStampU: 0,
    lastStampV: 0,
  });

  useEffect(() => {
    context.current = resizeTrail(trailCanvas, imageAspect);
    metaballFieldContext.current = resizeMetaballField(metaballFieldCanvas, imageAspect);
    prepareTrailBrush(trailBrush, rippleConfig.radius * trailCanvas.height);
    prepareMetaballFieldBrush(metaballFieldBrush, rippleConfig.radius * metaballFieldCanvas.height);
    trailPoints.clear();
    lifecycle.current.canvasHasMask = false;
    lifecycle.current.fieldHasDensity = false;
    lifecycle.current.hasLastStamp = false;
    lifecycle.current.lastMovementId = pointer.current.movementId;
    markTextureForUpdate(trailTexture);
    markTextureForUpdate(metaballFieldTexture);
  }, [imageAspect, metaballFieldBrush, metaballFieldCanvas, metaballFieldTexture, pointer, trailBrush, trailCanvas, trailPoints, trailTexture]);
  useEffect(() => {
    revealModeUniform.current = material.uniforms.uRevealMode;
    revealModeUniform.current.value = rippleConfig.revealMode === "metaball" && metaballFieldContext.current ? 1 : 0;
    return () => {
      trailTexture.dispose();
      metaballFieldTexture.dispose();
      material.dispose();
    };
  }, [material, metaballFieldTexture, trailTexture]);
  useEffect(() => {
    const clearHiddenFields = () => {
      if (!document.hidden) return;
      const trailContext = context.current;
      const fieldContext = metaballFieldContext.current;
      trailContext?.clearRect(0, 0, trailCanvas.width, trailCanvas.height);
      fieldContext?.clearRect(0, 0, metaballFieldCanvas.width, metaballFieldCanvas.height);
      markTextureForUpdate(trailTexture);
      markTextureForUpdate(metaballFieldTexture);
      lifecycle.current.canvasHasMask = false;
      lifecycle.current.fieldHasDensity = false;
    };
    document.addEventListener("visibilitychange", clearHiddenFields);
    return () => document.removeEventListener("visibilitychange", clearHiddenFields);
  }, [metaballFieldCanvas, metaballFieldTexture, trailCanvas, trailTexture]);

  useFrame(() => {
    const ctx = context.current;
    if (!ctx) return;
    const fieldCtx = metaballFieldContext.current;
    const metaballEnabled = rippleConfig.revealMode === "metaball" && Boolean(fieldCtx);
    const compareModes = rippleConfig.debugCompareRevealModes && Boolean(fieldCtx);
    const debugClassic = metaballDebugView === "classic";
    const debugMetaballStage = metaballDebugView !== "final" && !debugClassic;
    revealModeUniform.current.value = metaballEnabled ? 1 : 0;
    const drawClassicMask = !metaballEnabled || compareModes || debugClassic;
    const drawMetaballField = (metaballEnabled && !debugClassic) || compareModes || debugMetaballStage;
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
      if (trail.fieldHasDensity && fieldCtx) {
        fieldCtx.clearRect(0, 0, metaballFieldCanvas.width, metaballFieldCanvas.height);
        markTextureForUpdate(metaballFieldTexture);
        trail.fieldHasDensity = false;
      }
      return;
    }

    if (drawClassicMask) {
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
    } else if (trail.canvasHasMask) {
      ctx.clearRect(0, 0, trailCanvas.width, trailCanvas.height);
      markTextureForUpdate(trailTexture);
      trail.canvasHasMask = false;
    }

    if (drawMetaballField && fieldCtx) {
      fieldCtx.clearRect(0, 0, metaballFieldCanvas.width, metaballFieldCanvas.height);
      fieldCtx.globalCompositeOperation = "lighter";
      const positionScaleX = metaballFieldCanvas.width / trailCanvas.width;
      const positionScaleY = metaballFieldCanvas.height / trailCanvas.height;
      const firstFieldPointIndex = debugMetaballSinglePoint ? trailPoints.count - 1 : 0;
      for (let index = firstFieldPointIndex; index < trailPoints.count; index += 1) {
        const point = trailPoints.at(index);
        if (!point) continue;
        const alpha = pointAlpha(point, nowMs);
        if (alpha >= rippleConfig.metaballVisibilityCutoff) {
          stampMetaballField(fieldCtx, metaballFieldBrush, point, alpha, positionScaleX, positionScaleY);
        }
      }
      fieldCtx.globalAlpha = 1;
      fieldCtx.globalCompositeOperation = "source-over";
      markTextureForUpdate(metaballFieldTexture);
      trail.fieldHasDensity = true;
    } else if (trail.fieldHasDensity && fieldCtx) {
      fieldCtx.clearRect(0, 0, metaballFieldCanvas.width, metaballFieldCanvas.height);
      markTextureForUpdate(metaballFieldTexture);
      trail.fieldHasDensity = false;
    }
  });

  const { width: planeWidth, height: planeHeight } = containedSize(viewport.width, viewport.height, imageAspect);
  return <mesh scale={[planeWidth, planeHeight, 1]}><planeGeometry args={[1, 1]} /><primitive object={material} attach="material" /></mesh>;
}
