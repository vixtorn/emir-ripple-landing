"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { portraitAssets, rippleConfig } from "@/lib/ripple-config";
import { containedSize } from "@/lib/trail-canvas";
import { usePointerType } from "@/hooks/usePointerType";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import HeroCopy from "./HeroCopy";
import HeroHeader from "./HeroHeader";
import HeroStatus from "./HeroStatus";
import RippleCanvas from "./RippleCanvas";
import type { PointerData } from "./RippleScene";
import "./hero.css";

function supportsWebGL() { try { const canvas = document.createElement("canvas"); return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl")); } catch { return false; } }
export default function RippleHero() {
  const reducedMotion = useReducedMotion(); const isTouch = usePointerType(); const [supported, setSupported] = useState(false); const [ready, setReady] = useState(false); const [failed, setFailed] = useState(false);
  const pointer = useRef<PointerData>({ u: .5, v: .5, active: false, movementId: 0, lastMovementTime: 0 });
  const lastInputPosition = useRef({ u: .5, v: .5, initialized: false });
  const imageAspect = useRef<number | null>(null);
  useEffect(() => { queueMicrotask(() => setSupported(supportsWebGL())); }, []);
  const updatePointer = useCallback((event: React.PointerEvent<HTMLElement>, recordMovement: boolean) => {
    if (!imageAspect.current) {
      pointer.current.active = false;
      return false;
    }
    const heroBounds = event.currentTarget.getBoundingClientRect();
    const { width: planeWidth, height: planeHeight } = containedSize(heroBounds.width, heroBounds.height, imageAspect.current);
    const planeLeft = heroBounds.left + (heroBounds.width - planeWidth) / 2;
    const planeTop = heroBounds.top + (heroBounds.height - planeHeight) / 2;
    const u = (event.clientX - planeLeft) / planeWidth;
    const v = 1 - (event.clientY - planeTop) / planeHeight;
    const inside = u >= 0 && u <= 1 && v >= 0 && v <= 1;
    pointer.current.active = inside;
    if (!inside) return false;

    const clampedU = Math.min(1, Math.max(0, u));
    const clampedV = Math.min(1, Math.max(0, v));
    const last = lastInputPosition.current;
    const movement = Math.hypot(clampedU - last.u, clampedV - last.v);
    const isRealMovement = recordMovement && (!last.initialized || movement >= rippleConfig.trailMovementEpsilon);
    pointer.current.u = clampedU;
    pointer.current.v = clampedV;
    if (!recordMovement || isRealMovement) {
      last.u = clampedU;
      last.v = clampedV;
      last.initialized = true;
    }
    if (isRealMovement) {
      pointer.current.movementId += 1;
      pointer.current.lastMovementTime = performance.now();
    }
    return true;
  }, []);
  const onPointerMove = useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (event.pointerType === "touch" && !pointer.current.active) return;
    updatePointer(event, true);
  }, [updatePointer]);
  const onPointerDown = useCallback((event: React.PointerEvent<HTMLElement>) => {
    const inside = updatePointer(event, false);
    if (event.pointerType === "touch" && inside) event.currentTarget.setPointerCapture(event.pointerId);
  }, [updatePointer]);
  const endPointer = useCallback(() => {
    pointer.current.active = false;
    lastInputPosition.current.initialized = false;
  }, []);
  useEffect(() => {
    const stopPaintingWhenHidden = () => {
      if (document.hidden) endPointer();
    };
    document.addEventListener("visibilitychange", stopPaintingWhenHidden);
    return () => document.removeEventListener("visibilitychange", stopPaintingWhenHidden);
  }, [endPointer]);
  const syncTextureDimensions = useCallback((base: { width: number; height: number }, helmet: { width: number; height: number }) => {
    if (base.width > 0 && base.height > 0 && helmet.width > 0 && helmet.height > 0) {
      imageAspect.current = base.width / base.height;
    }
  }, []);
  const showCanvas = supported && !reducedMotion && !failed;
  return <main id="top" className="hero" onPointerMove={onPointerMove} onPointerDown={onPointerDown} onPointerUp={endPointer} onPointerCancel={endPointer} onPointerLeave={endPointer}>
    <Image className={`fallback-portrait ${ready && showCanvas ? "is-covered" : ""}`} src={portraitAssets.baseTexture} alt="Portrait of Emir Duman" fill priority sizes="100vw" onLoad={(event) => {
      const image = event.currentTarget;
      if (image.naturalWidth > 0 && image.naturalHeight > 0) imageAspect.current = image.naturalWidth / image.naturalHeight;
    }} />
    {showCanvas && <RippleCanvas pointer={pointer} onTextureDimensions={syncTextureDimensions} onReady={() => setReady(true)} onFailure={() => { setFailed(true); setReady(true); }} />}
    <div className="hero-ui"><HeroHeader /><HeroCopy /><div className="hero-footer"><span>(Scroll)</span><span>{isTouch ? "Drag to reveal" : "Move your cursor"}</span></div></div>
    {!ready && <HeroStatus ready={ready} />}
  </main>;
}
