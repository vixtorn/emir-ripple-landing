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

function supportsWebGL() {
  try {
    const canvas = document.createElement("canvas");

    return Boolean(
      canvas.getContext("webgl2") || canvas.getContext("webgl"),
    );
  } catch {
    return false;
  }
}

export default function RippleHero() {
  const reducedMotion = useReducedMotion();
  const isTouch = usePointerType();

  const [supported, setSupported] = useState(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  const heroElement = useRef<HTMLElement | null>(null);

  const pointer = useRef<PointerData>({
    u: 0.5,
    v: 0.5,
    active: false,
    movementId: 0,
    lastMovementTime: 0,
  });

  const lastInputPosition = useRef({
    u: 0.5,
    v: 0.5,
    initialized: false,
  });

  const activeContact = useRef<{
    pointerId: number;
    pointerType: "touch" | "pen";
  } | null>(null);

  const imageAspect = useRef<number | null>(null);

  useEffect(() => {
    queueMicrotask(() => setSupported(supportsWebGL()));
  }, []);

  const updatePointer = useCallback(
    (
      event: React.PointerEvent<HTMLElement>,
      recordMovement: boolean,
    ) => {
      if (!imageAspect.current) {
        pointer.current.active = false;
        return false;
      }

      const heroBounds =
        event.currentTarget.getBoundingClientRect();

      const {
        width: planeWidth,
        height: planeHeight,
      } = containedSize(
        heroBounds.width,
        heroBounds.height,
        imageAspect.current,
      );

      const planeLeft =
        heroBounds.left +
        (heroBounds.width - planeWidth) / 2;

      const planeTop =
        heroBounds.top +
        (heroBounds.height - planeHeight) / 2;

      const u =
        (event.clientX - planeLeft) / planeWidth;

      const v =
        1 - (event.clientY - planeTop) / planeHeight;

      const inside =
        u >= 0 &&
        u <= 1 &&
        v >= 0 &&
        v <= 1;

      pointer.current.active = inside;

      if (!inside) {
        lastInputPosition.current.initialized = false;
        return false;
      }

      const clampedU = Math.min(1, Math.max(0, u));
      const clampedV = Math.min(1, Math.max(0, v));

      const last = lastInputPosition.current;

      pointer.current.u = clampedU;
      pointer.current.v = clampedV;

      if (!last.initialized) {
        last.u = clampedU;
        last.v = clampedV;
        last.initialized = true;

        /*
         * Pointer enter veya texture hazırlığı kaçırılmış olsa bile
         * ilk gerçek hareketi trail hareketi olarak kaydeder.
         */
        if (recordMovement) {
          pointer.current.movementId += 1;
          pointer.current.lastMovementTime =
            performance.now();
        }

        return true;
      }

      const movement = Math.hypot(
        clampedU - last.u,
        clampedV - last.v,
      );

      const isRealMovement =
        recordMovement &&
        movement >=
          rippleConfig.trailMovementEpsilon;

      if (!recordMovement || isRealMovement) {
        last.u = clampedU;
        last.v = clampedV;
      }

      if (isRealMovement) {
        pointer.current.movementId += 1;
        pointer.current.lastMovementTime =
          performance.now();
      }

      return true;
    },
    [],
  );

  const resetPointer = useCallback(
    (releaseCapture: boolean) => {
      const contact = activeContact.current;
      const hero = heroElement.current;

      if (
        releaseCapture &&
        contact &&
        hero?.hasPointerCapture(contact.pointerId)
      ) {
        hero.releasePointerCapture(contact.pointerId);
      }

      activeContact.current = null;
      pointer.current.active = false;
      lastInputPosition.current.initialized = false;
    },
    [],
  );

  const onPointerEnter = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (event.pointerType === "mouse") {
        updatePointer(event, false);
      }
    },
    [updatePointer],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (event.pointerType === "mouse") {
        updatePointer(event, true);
        return;
      }

      if (
        event.pointerType !== "touch" &&
        event.pointerType !== "pen"
      ) {
        return;
      }

      const contact = activeContact.current;

      if (
        !contact ||
        contact.pointerId !== event.pointerId ||
        contact.pointerType !== event.pointerType
      ) {
        return;
      }

      if (
        event.pointerType === "pen" &&
        event.buttons === 0 &&
        event.pressure === 0
      ) {
        return;
      }

      updatePointer(event, true);
    },
    [updatePointer],
  );

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (event.pointerType === "mouse") {
        updatePointer(event, false);
        return;
      }

      if (
        event.pointerType !== "touch" &&
        event.pointerType !== "pen"
      ) {
        return;
      }

      if (
        activeContact.current &&
        activeContact.current.pointerId !==
          event.pointerId
      ) {
        return;
      }

      const inside = updatePointer(event, false);

      if (!inside) {
        return;
      }

      activeContact.current = {
        pointerId: event.pointerId,
        pointerType: event.pointerType,
      };

      event.currentTarget.setPointerCapture(
        event.pointerId,
      );
    },
    [updatePointer],
  );

  const onPointerEnd = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      const contact = activeContact.current;

      if (contact?.pointerId === event.pointerId) {
        resetPointer(true);
      }
    },
    [resetPointer],
  );

  const onPointerLeave = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (event.pointerType === "mouse") {
        resetPointer(false);
        return;
      }

      const contact = activeContact.current;

      if (contact?.pointerId === event.pointerId) {
        resetPointer(true);
      }
    },
    [resetPointer],
  );

  const onLostPointerCapture = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (
        activeContact.current?.pointerId ===
        event.pointerId
      ) {
        resetPointer(false);
      }
    },
    [resetPointer],
  );

  useEffect(() => {
    const stopPaintingWhenHidden = () => {
      if (document.hidden) {
        resetPointer(true);
      }
    };

    const resetAfterResize = () => {
      resetPointer(true);
    };

    document.addEventListener(
      "visibilitychange",
      stopPaintingWhenHidden,
    );

    window.addEventListener(
      "resize",
      resetAfterResize,
    );

    return () => {
      document.removeEventListener(
        "visibilitychange",
        stopPaintingWhenHidden,
      );

      window.removeEventListener(
        "resize",
        resetAfterResize,
      );
    };
  }, [resetPointer]);

  const syncTextureDimensions = useCallback(
    (
      base: { width: number; height: number },
      helmet: { width: number; height: number },
    ) => {
      if (
        base.width > 0 &&
        base.height > 0 &&
        helmet.width > 0 &&
        helmet.height > 0
      ) {
        imageAspect.current =
          base.width / base.height;
      }
    },
    [],
  );

  const showCanvas =
    supported &&
    !reducedMotion &&
    !failed;

  return (
    <main
      ref={heroElement}
      id="top"
      className="hero"
      onPointerEnter={onPointerEnter}
      onPointerMove={onPointerMove}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onPointerLeave={onPointerLeave}
      onLostPointerCapture={onLostPointerCapture}
    >
      <Image
        className={`fallback-portrait ${
          ready && showCanvas
            ? "is-covered"
            : ""
        }`}
        src={portraitAssets.baseTexture}
        alt="Portrait of Emir Duman"
        fill
        priority
        sizes="100vw"
        onLoad={(event) => {
          const image = event.currentTarget;

          if (
            image.naturalWidth > 0 &&
            image.naturalHeight > 0
          ) {
            imageAspect.current =
              image.naturalWidth /
              image.naturalHeight;
          }
        }}
      />

      {showCanvas && (
        <RippleCanvas
          pointer={pointer}
          onTextureDimensions={
            syncTextureDimensions
          }
          onReady={() => setReady(true)}
          onFailure={() => {
            setFailed(true);
            setReady(true);
          }}
        />
      )}

      <div className="hero-ui">
        <HeroHeader />
        <HeroCopy />

        <div className="hero-footer">
          <span>(Scroll)</span>

          <span>
            {isTouch
              ? "Drag to reveal"
              : "Move your cursor"}
          </span>
        </div>
      </div>

      {!ready && <HeroStatus ready={ready} />}
    </main>
  );
}