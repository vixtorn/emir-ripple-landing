"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { CanvasTexture, Color, LinearFilter, ShaderMaterial, Texture, Vector2, Vector3 } from "three";
import { mercuryDebugViews, mercurySurfaceDebugViews, metaballDebugViews, rippleConfig, temporalDebugViews } from "@/lib/ripple-config";
import { createGpuMetaballField, disposeGpuMetaballField, renderGpuMetaballField, setGpuMetaballSplat } from "@/lib/metaball-gpu-field";
import { compileMercuryShaderWithFallback, rippleFragmentShader, rippleVertexShader } from "@/lib/shaders/ripple-shaders";
import { clearTemporalMetaballField, createTemporalMetaballField, disposeTemporalMetaballField, renderTemporalMetaballField } from "@/lib/temporal-metaball-field";
import { containedSize, markTextureForUpdate, prepareMetaballFieldBrush, prepareTrailBrush, resizeMetaballField, resizeTrail, stampMetaballField, stampTrail, textureDimensions, type TrailPoint } from "@/lib/trail-canvas";
import type { PointerData } from "./RippleScene";

const metaballDebugView = process.env.NODE_ENV === "development"
  ? rippleConfig.metaballDebugView
  : "final";
const debugMetaballSinglePoint = process.env.NODE_ENV === "development"
  && rippleConfig.debugMetaballSinglePoint;
const temporalDebugView = process.env.NODE_ENV === "development"
  ? rippleConfig.temporalDebugView
  : "final";
const mercuryDebugView = process.env.NODE_ENV === "development"
  ? rippleConfig.mercuryDebugView
  : "final";
const mercurySurfaceDebugView = process.env.NODE_ENV === "development"
  ? rippleConfig.mercurySurfaceDebugView
  : "final";

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

type TemporalMotion = {
  previousU: number;
  previousV: number;
  rawU: number;
  rawV: number;
  smoothedU: number;
  smoothedV: number;
  speed: number;
  lastMovementId: number;
  hasPreviousPosition: boolean;
  wasPointerActive: boolean;
};

function resetTemporalMotion(
  motion: TemporalMotion,
  movementId: number,
) {
  motion.previousU = 0;
  motion.previousV = 0;
  motion.rawU = 0;
  motion.rawV = 0;
  motion.smoothedU = 0;
  motion.smoothedV = 0;
  motion.speed = 0;
  motion.lastMovementId = movementId;
  motion.hasPreviousPosition = false;
  motion.wasPointerActive = false;
}

export default function RipplePlane({ baseTexture, helmetTexture, pointer }: { baseTexture: Texture; helmetTexture: Texture; pointer: React.MutableRefObject<PointerData> }) {
  const { camera, gl, scene, viewport } = useThree();
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
  const gpuMetaballField = useMemo(
    () => rippleConfig.metaballFieldBackend === "gpuHalfFloat"
      ? createGpuMetaballField(gl, imageAspect)
      : null,
    [gl, imageAspect],
  );
  const useGpuMetaballField = rippleConfig.metaballFieldBackend === "gpuHalfFloat"
    && gpuMetaballField !== null;
  const sourceMetaballFieldTexture = gpuMetaballField?.target.texture
    ?? metaballFieldTexture;
  const sourceMetaballFieldWidth = gpuMetaballField?.width
    ?? Math.round(rippleConfig.metaballFieldResolution * imageAspect);
  const sourceMetaballFieldHeight = gpuMetaballField?.height
    ?? rippleConfig.metaballFieldResolution;
  const temporalMetaballField = useMemo(
    () => rippleConfig.temporalViscosityEnabled && gpuMetaballField
      ? createTemporalMetaballField(
        gl,
        gpuMetaballField.target.texture,
        gpuMetaballField.width,
        gpuMetaballField.height,
      )
      : null,
    [gl, gpuMetaballField],
  );
  const useTemporalMetaballField = rippleConfig.temporalViscosityEnabled
    && useGpuMetaballField
    && temporalMetaballField !== null;
  const useMercuryShell = rippleConfig.mercuryShellEnabled
    && useGpuMetaballField;
  const useMercurySurfacePolish = useMercuryShell
    && rippleConfig.mercurySurfacePolishEnabled;
  const useMercuryMicroReflection = useMercurySurfacePolish
    && rippleConfig.mercuryMicroReflectionStrength > 0;
  const useMercuryEdgeRefraction = useMercurySurfacePolish
    && rippleConfig.mercuryEdgeRefractionStrength > 0;
  const initialMetaballFieldTexture = useTemporalMetaballField
    ? temporalMetaballField.currentTarget.texture
    : sourceMetaballFieldTexture;
  const context = useRef<CanvasRenderingContext2D | null>(null);
  const metaballFieldContext = useRef<CanvasRenderingContext2D | null>(null);
  const revealModeUniform = useRef({ value: rippleConfig.revealMode === "metaball" ? 1 : 0 });
  const metaballFieldUniform = useRef({ value: initialMetaballFieldTexture });
  const temporalPointerUvUniform = useRef({ value: new Vector2(0.5, 0.5) });
  const temporalVelocityUniform = useRef({ value: new Vector2() });
  const material = useMemo(() => new ShaderMaterial({
    transparent: true,
    defines: useMercuryShell ? {
      USE_MERCURY_SHELL: 1,
      ...(useMercurySurfacePolish
        ? { USE_MERCURY_SURFACE_POLISH: 1 }
        : {}),
      ...(useMercuryMicroReflection
        ? { USE_MERCURY_MICRO_REFLECTION: 1 }
        : {}),
      ...(useMercuryEdgeRefraction
        ? { USE_MERCURY_EDGE_REFRACTION: 1 }
        : {}),
    } : undefined,
    vertexShader: rippleVertexShader,
    fragmentShader: rippleFragmentShader,
    uniforms: {
      uBaseTexture: { value: baseTexture },
      uHelmetTexture: { value: helmetTexture },
      uTrailTexture: { value: trailTexture },
      uMetaballField: { value: initialMetaballFieldTexture },
      uTemporalSourceField: { value: sourceMetaballFieldTexture },
      uMetaballFieldTexelSize: { value: new Vector2(1 / sourceMetaballFieldWidth, 1 / sourceMetaballFieldHeight) },
      uMetaballFieldBackend: { value: useGpuMetaballField ? 1 : 0 },
      uMetaballFieldDebugExposure: { value: rippleConfig.metaballFieldDebugExposure },
      uTemporalFieldDebugExposure: { value: rippleConfig.temporalFieldDebugExposure },
      uTemporalDebugView: { value: temporalDebugViews[temporalDebugView] },
      uTemporalPointerUv: { value: new Vector2(0.5, 0.5) },
      uTemporalVelocity: { value: new Vector2() },
      uTemporalMaxVelocity: { value: rippleConfig.temporalMaxVelocity },
      uTemporalVelocityInfluenceRadius: { value: rippleConfig.temporalVelocityInfluenceRadius },
      uTemporalEnvelopeThreshold: { value: rippleConfig.temporalEnvelopeThreshold },
      uTemporalEnvelopeSoftness: { value: rippleConfig.temporalEnvelopeSoftness },
      uMercuryShellEnabled: { value: useMercuryShell ? 1 : 0 },
      uMercuryShellThreshold: { value: rippleConfig.mercuryShellThreshold },
      uMercuryShellSoftness: { value: rippleConfig.mercuryShellSoftness },
      uMercuryCoreThreshold: { value: rippleConfig.mercuryCoreThreshold },
      uMercuryCoreSoftness: { value: rippleConfig.mercuryCoreSoftness },
      uMercuryHeightBaseThreshold: { value: rippleConfig.mercuryHeightBaseThreshold },
      uMercuryHeightGain: { value: rippleConfig.mercuryHeightGain },
      uMercuryNormalStrength: { value: rippleConfig.mercuryNormalStrength },
      uMercuryReflectionStrength: { value: rippleConfig.mercuryReflectionStrength },
      uMercuryShellOpacity: { value: rippleConfig.mercuryShellOpacity },
      uMercuryCoreSurfaceOverlay: { value: rippleConfig.mercuryCoreSurfaceOverlay },
      uMercuryFresnelStrength: { value: rippleConfig.mercuryFresnelStrength },
      uMercuryFresnelPower: { value: rippleConfig.mercuryFresnelPower },
      uMercurySpecularStrength: { value: rippleConfig.mercurySpecularStrength },
      uMercurySpecularPower: { value: rippleConfig.mercurySpecularPower },
      uMercuryEdgeDistortionStrength: { value: rippleConfig.mercuryEdgeDistortionStrength },
      uMercuryDarkColor: { value: new Color(rippleConfig.mercuryDarkColor) },
      uMercuryMidColor: { value: new Color(rippleConfig.mercuryMidColor) },
      uMercuryPrimaryHighlight: { value: new Color(rippleConfig.mercuryPrimaryHighlight) },
      uMercurySecondaryHighlight: { value: new Color(rippleConfig.mercurySecondaryHighlight) },
      uMercuryDebugView: { value: mercuryDebugViews[mercuryDebugView] },
      uMercuryThicknessGain: { value: rippleConfig.mercuryThicknessGain },
      uMercuryThicknessLow: { value: rippleConfig.mercuryThicknessLow },
      uMercuryThicknessHigh: { value: rippleConfig.mercuryThicknessHigh },
      uMercuryEnvironmentDark: { value: new Color(rippleConfig.mercuryEnvironmentDark) },
      uMercuryEnvironmentMid: { value: new Color(rippleConfig.mercuryEnvironmentMid) },
      uMercuryEnvironmentFloor: { value: new Color(rippleConfig.mercuryEnvironmentFloor) },
      uMercuryOverheadSoftboxStrength: { value: rippleConfig.mercuryOverheadSoftboxStrength },
      uMercurySidePanelStrength: { value: rippleConfig.mercurySidePanelStrength },
      uMercuryStripLightStrength: { value: rippleConfig.mercuryStripLightStrength },
      uMercuryFloorBounceStrength: { value: rippleConfig.mercuryFloorBounceStrength },
      uMercuryHorizonStrength: { value: rippleConfig.mercuryHorizonStrength },
      uMercuryBroadSpecularStrength: { value: rippleConfig.mercuryBroadSpecularStrength },
      uMercuryBroadSpecularPower: { value: rippleConfig.mercuryBroadSpecularPower },
      uMercurySharpSpecularStrength: { value: rippleConfig.mercurySharpSpecularStrength },
      uMercurySharpSpecularPower: { value: rippleConfig.mercurySharpSpecularPower },
      uMercurySharpLightDirection: { value: new Vector3(rippleConfig.mercurySharpLightDirection.x, rippleConfig.mercurySharpLightDirection.y, rippleConfig.mercurySharpLightDirection.z).normalize() },
      uMercuryCurvatureStrength: { value: rippleConfig.mercuryCurvatureStrength },
      uMercuryCurvatureLow: { value: rippleConfig.mercuryCurvatureLow },
      uMercuryCurvatureHigh: { value: rippleConfig.mercuryCurvatureHigh },
      uMercuryThinFresnelBoost: { value: rippleConfig.mercuryThinFresnelBoost },
      uMercuryMicroReflectionStrength: { value: rippleConfig.mercuryMicroReflectionStrength },
      uMercuryEdgeRefractionStrength: { value: rippleConfig.mercuryEdgeRefractionStrength },
      uMercurySurfaceDebugView: { value: mercurySurfaceDebugViews[mercurySurfaceDebugView] },
      uMetaballHeightBaseThreshold: { value: rippleConfig.metaballHeightBaseThreshold },
      uMetaballHeightCompression: { value: rippleConfig.metaballHeightCompression },
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
  }), [baseTexture, helmetTexture, initialMetaballFieldTexture, sourceMetaballFieldHeight, sourceMetaballFieldTexture, sourceMetaballFieldWidth, trailTexture, useGpuMetaballField, useMercuryEdgeRefraction, useMercuryMicroReflection, useMercuryShell, useMercurySurfacePolish]);
  const lifecycle = useRef({
    canvasHasMask: false,
    fieldHasDensity: false,
    temporalHasDensity: false,
    temporalFailed: false,
    hasLastStamp: false,
    lastMovementId: 0,
    lastMovementTime: 0,
    lastStampU: 0,
    lastStampV: 0,
  });
  const temporalMotion = useRef<TemporalMotion>({
    previousU: 0,
    previousV: 0,
    rawU: 0,
    rawV: 0,
    smoothedU: 0,
    smoothedV: 0,
    speed: 0,
    lastMovementId: pointer.current.movementId,
    hasPreviousPosition: false,
    wasPointerActive: false,
  });

  useEffect(() => {
    revealModeUniform.current = material.uniforms.uRevealMode;
    metaballFieldUniform.current = material.uniforms.uMetaballField;
    temporalPointerUvUniform.current = material.uniforms.uTemporalPointerUv;
    temporalVelocityUniform.current = material.uniforms.uTemporalVelocity;
  }, [material]);
  useLayoutEffect(() => {
    if (!useMercuryShell) return;
    compileMercuryShaderWithFallback(gl, scene, camera, material);
  }, [camera, gl, material, scene, useMercuryShell]);
  useEffect(() => {
    context.current = resizeTrail(trailCanvas, imageAspect);
    metaballFieldContext.current = resizeMetaballField(metaballFieldCanvas, imageAspect);
    prepareTrailBrush(trailBrush, rippleConfig.radius * trailCanvas.height);
    prepareMetaballFieldBrush(metaballFieldBrush, rippleConfig.radius * metaballFieldCanvas.height);
    trailPoints.clear();
    lifecycle.current.canvasHasMask = false;
    lifecycle.current.fieldHasDensity = false;
    lifecycle.current.temporalHasDensity = false;
    lifecycle.current.temporalFailed = false;
    lifecycle.current.hasLastStamp = false;
    lifecycle.current.lastMovementId = pointer.current.movementId;
    resetTemporalMotion(temporalMotion.current, pointer.current.movementId);
    if (temporalMetaballField) {
      clearTemporalMetaballField(gl, temporalMetaballField);
      metaballFieldUniform.current.value = temporalMetaballField.currentTarget.texture;
    } else {
      metaballFieldUniform.current.value = sourceMetaballFieldTexture;
    }
    markTextureForUpdate(trailTexture);
    markTextureForUpdate(metaballFieldTexture);
  }, [gl, imageAspect, metaballFieldBrush, metaballFieldCanvas, metaballFieldTexture, pointer, sourceMetaballFieldTexture, temporalMetaballField, trailBrush, trailCanvas, trailPoints, trailTexture]);
  useEffect(() => {
    revealModeUniform.current.value = rippleConfig.revealMode === "metaball"
      && (useGpuMetaballField || Boolean(metaballFieldContext.current))
      ? 1
      : 0;
    return () => {
      trailTexture.dispose();
      metaballFieldTexture.dispose();
      if (temporalMetaballField) disposeTemporalMetaballField(temporalMetaballField);
      if (gpuMetaballField) disposeGpuMetaballField(gpuMetaballField);
      material.dispose();
    };
  }, [gpuMetaballField, material, metaballFieldTexture, temporalMetaballField, trailTexture, useGpuMetaballField]);
  useEffect(() => {
    const clearHiddenFields = () => {
      if (!document.hidden) return;
      const trailContext = context.current;
      const fieldContext = metaballFieldContext.current;
      trailContext?.clearRect(0, 0, trailCanvas.width, trailCanvas.height);
      fieldContext?.clearRect(0, 0, metaballFieldCanvas.width, metaballFieldCanvas.height);
      if (gpuMetaballField) renderGpuMetaballField(gl, gpuMetaballField, 0);
      if (temporalMetaballField) {
        clearTemporalMetaballField(gl, temporalMetaballField);
        metaballFieldUniform.current.value = temporalMetaballField.currentTarget.texture;
      }
      markTextureForUpdate(trailTexture);
      markTextureForUpdate(metaballFieldTexture);
      lifecycle.current.canvasHasMask = false;
      lifecycle.current.fieldHasDensity = false;
      lifecycle.current.temporalHasDensity = false;
      lifecycle.current.temporalFailed = false;
      resetTemporalMotion(temporalMotion.current, pointer.current.movementId);
    };
    document.addEventListener("visibilitychange", clearHiddenFields);
    return () => document.removeEventListener("visibilitychange", clearHiddenFields);
  }, [gl, gpuMetaballField, metaballFieldCanvas, metaballFieldTexture, pointer, temporalMetaballField, trailCanvas, trailTexture]);
  useEffect(() => {
    const resetTemporalResources = () => {
      resetTemporalMotion(temporalMotion.current, pointer.current.movementId);
      if (!temporalMetaballField) return;
      clearTemporalMetaballField(gl, temporalMetaballField);
      metaballFieldUniform.current.value = temporalMetaballField.currentTarget.texture;
      lifecycle.current.temporalHasDensity = false;
      lifecycle.current.temporalFailed = false;
    };
    const canvas = gl.domElement;
    window.addEventListener("resize", resetTemporalResources);
    canvas.addEventListener("webglcontextrestored", resetTemporalResources);
    return () => {
      window.removeEventListener("resize", resetTemporalResources);
      canvas.removeEventListener("webglcontextrestored", resetTemporalResources);
    };
  }, [gl, pointer, temporalMetaballField]);

  useFrame((_, frameDeltaSeconds) => {
    const ctx = context.current;
    if (!ctx) return;
    const fieldCtx = metaballFieldContext.current;
    const metaballFieldAvailable = useGpuMetaballField || Boolean(fieldCtx);
    const metaballEnabled = rippleConfig.revealMode === "metaball" && metaballFieldAvailable;
    const compareModes = rippleConfig.debugCompareRevealModes && metaballFieldAvailable;
    const debugClassic = metaballDebugView === "classic";
    const debugMetaballStage = metaballDebugView !== "final" && !debugClassic;
    const debugTemporalStage = temporalDebugView !== "final";
    const debugMercuryStage = mercuryDebugView !== "final"
      && useMercuryShell;
    const debugMercurySurfaceStage = mercurySurfaceDebugView !== "final"
      && useMercurySurfacePolish;
    revealModeUniform.current.value = metaballEnabled ? 1 : 0;
    const drawClassicMask = !metaballEnabled || compareModes || debugClassic;
    const drawMetaballField = (metaballEnabled && !debugClassic)
      || compareModes
      || debugMetaballStage
      || debugTemporalStage
      || debugMercuryStage
      || debugMercurySurfaceStage;
    const trail = lifecycle.current;
    const currentPointer = pointer.current;
    const nowMs = performance.now();
    const deltaSeconds = Number.isFinite(frameDeltaSeconds)
      ? Math.min(Math.max(frameDeltaSeconds, 0), 1 / 15)
      : 0;
    const motion = temporalMotion.current;
    const pointerCoordinatesValid = Number.isFinite(currentPointer.u)
      && Number.isFinite(currentPointer.v)
      && currentPointer.u >= 0
      && currentPointer.u <= 1
      && currentPointer.v >= 0
      && currentPointer.v <= 1;
    const pointerActive = currentPointer.active && pointerCoordinatesValid;
    let hasNewVelocitySample = false;
    let resetTemporalFeedback = false;

    if (!pointerActive) {
      if (motion.wasPointerActive || !pointerCoordinatesValid) {
        resetTemporalMotion(motion, currentPointer.movementId);
        resetTemporalFeedback = true;
      } else {
        motion.rawU = 0;
        motion.rawV = 0;
      }
    } else {
      if (!motion.wasPointerActive) {
        motion.hasPreviousPosition = false;
        motion.rawU = 0;
        motion.rawV = 0;
        motion.lastMovementId = currentPointer.movementId;
      }

      if (currentPointer.movementId !== motion.lastMovementId) {
        motion.lastMovementId = currentPointer.movementId;
        const movementIsFresh = nowMs - currentPointer.lastMovementTime
          <= rippleConfig.trailIdleTimeoutMs;
        if (movementIsFresh) {
          if (motion.hasPreviousPosition) {
            const velocityDeltaSeconds = Math.max(deltaSeconds, 1 / 240);
            let rawU = (
              currentPointer.u - motion.previousU
            ) / velocityDeltaSeconds;
            let rawV = (
              currentPointer.v - motion.previousV
            ) / velocityDeltaSeconds;
            const rawSpeed = Math.hypot(rawU, rawV);
            if (rawSpeed > rippleConfig.temporalMaxVelocity) {
              const velocityScale = rippleConfig.temporalMaxVelocity / rawSpeed;
              rawU *= velocityScale;
              rawV *= velocityScale;
            }
            motion.rawU = rawU;
            motion.rawV = rawV;
            hasNewVelocitySample = true;
          } else {
            motion.rawU = 0;
            motion.rawV = 0;
          }
          motion.previousU = currentPointer.u;
          motion.previousV = currentPointer.v;
          motion.hasPreviousPosition = true;
        } else {
          motion.hasPreviousPosition = false;
          motion.rawU = 0;
          motion.rawV = 0;
        }
      } else {
        motion.rawU = 0;
        motion.rawV = 0;
      }

      if (
        nowMs - currentPointer.lastMovementTime
        > rippleConfig.trailIdleTimeoutMs * 2
      ) {
        motion.hasPreviousPosition = false;
      }
    }

    if (resetTemporalFeedback && temporalMetaballField) {
      clearTemporalMetaballField(gl, temporalMetaballField);
      trail.temporalHasDensity = false;
    }

    const velocitySmoothing = 1 - Math.exp(
      -rippleConfig.temporalVelocitySmoothingPerSecond * deltaSeconds,
    );
    const targetVelocityU = hasNewVelocitySample ? motion.rawU : 0;
    const targetVelocityV = hasNewVelocitySample ? motion.rawV : 0;
    motion.smoothedU += (
      targetVelocityU - motion.smoothedU
    ) * velocitySmoothing;
    motion.smoothedV += (
      targetVelocityV - motion.smoothedV
    ) * velocitySmoothing;
    if (
      !hasNewVelocitySample
      && Math.hypot(motion.smoothedU, motion.smoothedV) < 0.0001
    ) {
      motion.smoothedU = 0;
      motion.smoothedV = 0;
    }
    motion.speed = Math.hypot(motion.smoothedU, motion.smoothedV);
    motion.wasPointerActive = pointerActive;
    temporalPointerUvUniform.current.value.set(
      currentPointer.u,
      currentPointer.v,
    );
    temporalVelocityUniform.current.value.set(
      motion.smoothedU,
      motion.smoothedV,
    );

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
      if (trail.fieldHasDensity) {
        if (useGpuMetaballField && gpuMetaballField) {
          renderGpuMetaballField(gl, gpuMetaballField, 0);
        } else if (fieldCtx) {
          fieldCtx.clearRect(0, 0, metaballFieldCanvas.width, metaballFieldCanvas.height);
          markTextureForUpdate(metaballFieldTexture);
        }
        trail.fieldHasDensity = false;
      }
      if (temporalMetaballField && trail.temporalHasDensity) {
        clearTemporalMetaballField(gl, temporalMetaballField);
        metaballFieldUniform.current.value = temporalMetaballField.currentTarget.texture;
        trail.temporalHasDensity = false;
      } else if (!useTemporalMetaballField) {
        metaballFieldUniform.current.value = sourceMetaballFieldTexture;
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

    if (drawMetaballField && useGpuMetaballField && gpuMetaballField) {
      const firstFieldPointIndex = debugMetaballSinglePoint ? trailPoints.count - 1 : 0;
      let instanceCount = 0;
      for (let index = firstFieldPointIndex; index < trailPoints.count; index += 1) {
        const point = trailPoints.at(index);
        if (!point) continue;
        const alpha = pointAlpha(point, nowMs);
        if (alpha >= rippleConfig.metaballVisibilityCutoff) {
          setGpuMetaballSplat(
            gpuMetaballField,
            instanceCount,
            point.x / trailCanvas.width,
            1 - point.y / trailCanvas.height,
            point.radius / trailCanvas.width,
            point.radius / trailCanvas.height,
            alpha * rippleConfig.metaballFieldStrength,
          );
          instanceCount += 1;
        }
      }
      renderGpuMetaballField(gl, gpuMetaballField, instanceCount);
      trail.fieldHasDensity = true;
      if (
        useTemporalMetaballField
        && temporalMetaballField
        && !trail.temporalFailed
      ) {
        const pointerRecentlyMoved = pointerActive
          && nowMs - currentPointer.lastMovementTime
            <= rippleConfig.trailIdleTimeoutMs;
        try {
          metaballFieldUniform.current.value = renderTemporalMetaballField(
            gl,
            temporalMetaballField,
            gpuMetaballField.target.texture,
            deltaSeconds,
            currentPointer.u,
            currentPointer.v,
            motion.smoothedU,
            motion.smoothedV,
            pointerRecentlyMoved,
          );
          trail.temporalHasDensity = true;
        } catch {
          metaballFieldUniform.current.value = gpuMetaballField.target.texture;
          trail.temporalHasDensity = false;
          trail.temporalFailed = true;
        }
      } else {
        metaballFieldUniform.current.value = gpuMetaballField.target.texture;
      }
    } else if (drawMetaballField && fieldCtx) {
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
      metaballFieldUniform.current.value = metaballFieldTexture;
    } else if (trail.fieldHasDensity) {
      if (useGpuMetaballField && gpuMetaballField) {
        renderGpuMetaballField(gl, gpuMetaballField, 0);
      } else if (fieldCtx) {
        fieldCtx.clearRect(0, 0, metaballFieldCanvas.width, metaballFieldCanvas.height);
        markTextureForUpdate(metaballFieldTexture);
      }
      trail.fieldHasDensity = false;
      if (temporalMetaballField && trail.temporalHasDensity) {
        clearTemporalMetaballField(gl, temporalMetaballField);
        trail.temporalHasDensity = false;
      }
      metaballFieldUniform.current.value = useTemporalMetaballField
        && temporalMetaballField
        ? temporalMetaballField.currentTarget.texture
        : sourceMetaballFieldTexture;
    }
  });

  const { width: planeWidth, height: planeHeight } = containedSize(viewport.width, viewport.height, imageAspect);
  return <mesh scale={[planeWidth, planeHeight, 1]}><planeGeometry args={[1, 1]} /><primitive object={material} attach="material" /></mesh>;
}
