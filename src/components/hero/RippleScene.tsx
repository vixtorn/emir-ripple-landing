"use client";

import { useLoader } from "@react-three/fiber";
import { useEffect } from "react";
import { TextureLoader } from "three";
import { portraitAssets } from "@/lib/ripple-config";
import { configureColorTexture, textureDimensions } from "@/lib/trail-canvas";
import RipplePlane from "./RipplePlane";

export type PointerData = {
  u: number;
  v: number;
  active: boolean;
  movementId: number;
  lastMovementTime: number;
};
const textureUrls = [portraitAssets.baseTexture, portraitAssets.helmetTexture];

export default function RippleScene({ pointer, onTextureDimensions, onReady }: { pointer: React.MutableRefObject<PointerData>; onTextureDimensions: (base: { width: number; height: number }, helmet: { width: number; height: number }) => void; onReady: () => void }) {
  const [baseTexture, helmetTexture] = useLoader(TextureLoader, textureUrls);
  useEffect(() => {
    configureColorTexture(baseTexture);
    configureColorTexture(helmetTexture);
    onTextureDimensions(textureDimensions(baseTexture), textureDimensions(helmetTexture));
    onReady();
  }, [baseTexture, helmetTexture, onReady, onTextureDimensions]);
  return <RipplePlane baseTexture={baseTexture} helmetTexture={helmetTexture} pointer={pointer} />;
}
