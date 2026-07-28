"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { CanvasTexture, LinearFilter, ShaderMaterial, Texture } from "three";
import { rippleConfig } from "@/lib/ripple-config";
import { rippleFragmentShader, rippleVertexShader } from "@/lib/shaders/ripple-shaders";
import { containedSize, fadeTrail, markTextureForUpdate, resizeTrail, stampTrail, textureDimensions } from "@/lib/trail-canvas";
import type { PointerData } from "./RippleScene";

export default function RipplePlane({ baseTexture, helmetTexture, pointer }: { baseTexture: Texture; helmetTexture: Texture; pointer: React.MutableRefObject<PointerData> }) {
  const { viewport } = useThree();
  const baseDimensions = textureDimensions(baseTexture);
  const imageAspect = baseDimensions.width / baseDimensions.height;
  const trailCanvas = useMemo(() => document.createElement("canvas"), []);
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

  useEffect(() => { context.current = resizeTrail(trailCanvas, imageAspect); }, [imageAspect, trailCanvas]);
  useEffect(() => () => { trailTexture.dispose(); material.dispose(); }, [material, trailTexture]);

  useFrame((_, delta) => {
    const ctx = context.current;
    if (!ctx || document.hidden) return;

    const fadeAmount = 1 - 2 ** (-delta / rippleConfig.trailFadeHalfLife);
    fadeTrail(ctx, trailCanvas, fadeAmount);
    if (pointer.current.active) {
      const x = pointer.current.u * trailCanvas.width;
      const y = (1 - pointer.current.v) * trailCanvas.height;
      const radius = rippleConfig.radius * trailCanvas.height;
      stampTrail(ctx, trailCanvas, x, y, radius);
    }
    markTextureForUpdate(trailTexture);
  });

  const { width: planeWidth, height: planeHeight } = containedSize(viewport.width, viewport.height, imageAspect);
  return <mesh scale={[planeWidth, planeHeight, 1]}><planeGeometry args={[1, 1]} /><primitive object={material} attach="material" /></mesh>;
}
