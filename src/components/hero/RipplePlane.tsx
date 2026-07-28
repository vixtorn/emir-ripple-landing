"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { CanvasTexture, LinearFilter, ShaderMaterial, Texture } from "three";
import { rippleConfig } from "@/lib/ripple-config";
import { rippleFragmentShader, rippleVertexShader } from "@/lib/shaders/ripple-shaders";
import { containedSize, fadeTrail, markTextureForUpdate, prepareTrailBrush, resizeTrail, stampTrail, textureDimensions } from "@/lib/trail-canvas";
import type { PointerData } from "./RippleScene";

export default function RipplePlane({ baseTexture, helmetTexture, pointer }: { baseTexture: Texture; helmetTexture: Texture; pointer: React.MutableRefObject<PointerData> }) {
  const { viewport } = useThree();
  const baseDimensions = textureDimensions(baseTexture);
  const imageAspect = baseDimensions.width / baseDimensions.height;
  const trailCanvas = useMemo(() => document.createElement("canvas"), []);
  const trailBrush = useMemo(() => document.createElement("canvas"), []);
  const trailTexture = useMemo(() => {
    const texture = new CanvasTexture(trailCanvas);
    texture.minFilter = LinearFilter;
    texture.magFilter = LinearFilter;
    return texture;
  }, [trailCanvas]);
  const context = useRef<CanvasRenderingContext2D | null>(null);
  const material = useMemo(() => new ShaderMaterial({
    transparent: true,
    vertexShader: rippleVertexShader,
    fragmentShader: rippleFragmentShader,
    uniforms: {
      uBaseTexture: { value: baseTexture },
      uHelmetTexture: { value: helmetTexture },
      uTrailTexture: { value: trailTexture },
    },
  }), [baseTexture, helmetTexture, trailTexture]);
  const lifecycle = useRef({
    hasLastStamp: false,
    lastMovementId: 0,
    lastMovementTime: 0,
    lastStampU: 0,
    lastStampV: 0,
    remainingVisibility: 0,
  });

  useEffect(() => {
    context.current = resizeTrail(trailCanvas, imageAspect);
    prepareTrailBrush(trailBrush, rippleConfig.radius * trailCanvas.height);
    lifecycle.current.hasLastStamp = false;
    lifecycle.current.remainingVisibility = 0;
    markTextureForUpdate(trailTexture);
  }, [imageAspect, trailBrush, trailCanvas, trailTexture]);
  useEffect(() => () => { trailTexture.dispose(); material.dispose(); }, [material, trailTexture]);

  useFrame((_, delta) => {
    const ctx = context.current;
    if (!ctx) return;
    const trail = lifecycle.current;
    let changed = false;

    if (trail.remainingVisibility > 0) {
      const remainingFactor = Math.exp(-rippleConfig.trailDecayRatePerSecond * delta);
      fadeTrail(ctx, trailCanvas, 1 - remainingFactor);
      trail.remainingVisibility *= remainingFactor;
      changed = true;
      if (trail.remainingVisibility <= rippleConfig.trailVisibilityCutoff) {
        ctx.clearRect(0, 0, trailCanvas.width, trailCanvas.height);
        trail.remainingVisibility = 0;
        trail.hasLastStamp = false;
      }
    }

    const currentPointer = pointer.current;
    if (currentPointer.movementId !== trail.lastMovementId) {
      trail.lastMovementId = currentPointer.movementId;
      const movementIsFresh = performance.now() - currentPointer.lastMovementTime <= rippleConfig.trailIdleTimeoutMs;
      if (currentPointer.active && movementIsFresh) {
        const shouldInterpolate = trail.hasLastStamp
          && currentPointer.lastMovementTime - trail.lastMovementTime <= rippleConfig.trailIdleTimeoutMs;
        const startU = shouldInterpolate ? trail.lastStampU : currentPointer.u;
        const startV = shouldInterpolate ? trail.lastStampV : currentPointer.v;
        const distanceX = (currentPointer.u - startU) * trailCanvas.width;
        const distanceY = (currentPointer.v - startV) * trailCanvas.height;
        const spacing = trailBrush.width * 0.35;
        const steps = Math.max(1, Math.ceil(Math.hypot(distanceX, distanceY) / spacing));
        for (let step = 1; step <= steps; step += 1) {
          const progress = step / steps;
          const u = startU + (currentPointer.u - startU) * progress;
          const v = startV + (currentPointer.v - startV) * progress;
          stampTrail(ctx, trailBrush, u * trailCanvas.width, (1 - v) * trailCanvas.height);
        }
        trail.hasLastStamp = true;
        trail.lastMovementTime = currentPointer.lastMovementTime;
        trail.lastStampU = currentPointer.u;
        trail.lastStampV = currentPointer.v;
        trail.remainingVisibility = 1;
        changed = true;
      } else {
        trail.hasLastStamp = false;
      }
    }

    if (changed) markTextureForUpdate(trailTexture);
  });

  const { width: planeWidth, height: planeHeight } = containedSize(viewport.width, viewport.height, imageAspect);
  return <mesh scale={[planeWidth, planeHeight, 1]}><planeGeometry args={[1, 1]} /><primitive object={material} attach="material" /></mesh>;
}
