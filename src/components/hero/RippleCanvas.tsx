"use client";

import { Canvas } from "@react-three/fiber";
import { Component, Suspense } from "react";
import { NoToneMapping, SRGBColorSpace } from "three";
import { rippleConfig } from "@/lib/ripple-config";
import RippleScene, { type PointerData } from "./RippleScene";

class CanvasBoundary extends Component<{ onFailure: () => void; children: React.ReactNode }> { componentDidCatch() { this.props.onFailure(); } render() { return this.props.children; } }
export default function RippleCanvas({ pointer, onTextureDimensions, onReady, onFailure }: { pointer: React.MutableRefObject<PointerData>; onTextureDimensions: (base: { width: number; height: number }, helmet: { width: number; height: number }) => void; onReady: () => void; onFailure: () => void }) {
  return <div className="ripple-canvas" aria-hidden="true"><CanvasBoundary onFailure={onFailure}><Canvas orthographic flat dpr={[1, rippleConfig.maxDpr]} gl={{ powerPreference: "high-performance", antialias: false, alpha: true, toneMapping: NoToneMapping, outputColorSpace: SRGBColorSpace }} camera={{ position: [0, 0, 1], near: 0.1, far: 10, zoom: 1 }} onCreated={({ gl }) => { gl.setClearColor(0x000000, 0); gl.domElement.addEventListener("webglcontextlost", onFailure, { once: true }); }}><Suspense fallback={null}><RippleScene pointer={pointer} onTextureDimensions={onTextureDimensions} onReady={onReady} /></Suspense></Canvas></CanvasBoundary></div>;
}
