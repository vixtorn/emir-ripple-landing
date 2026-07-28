import {
  DataTexture,
  FloatType,
  NearestFilter,
  NoColorSpace,
  RGBAFormat,
  type WebGLRenderer,
} from "three";

type PrimitiveTrailPoint = {
  x: number;
  y: number;
  createdAtMs: number;
  radius: number;
  strength: number;
};

type ChronologicalTrailPoints = {
  count: number;
  revision: number;
  at: (index: number) => PrimitiveTrailPoint | undefined;
};

export type RaymarchPrimitiveBuffer = {
  data: Float32Array;
  texture: DataTexture;
  selectedIndices: Int32Array;
  cumulativeLengths: Float32Array;
  breakBefore: Uint8Array;
  maxSegments: number;
  primitiveCount: number;
  lastTrailRevision: number;
};

export function supportsRaymarchPrimitives(
  renderer: WebGLRenderer,
) {
  if (!renderer.capabilities.isWebGL2) return false;
  const context = renderer.getContext();
  const precision = context.getShaderPrecisionFormat(
    context.FRAGMENT_SHADER,
    context.HIGH_FLOAT,
  );
  return Boolean(precision && precision.precision > 0);
}

export function createRaymarchPrimitiveBuffer(
  renderer: WebGLRenderer,
  maxSegments: number,
  maxTrailPoints: number,
) {
  if (!supportsRaymarchPrimitives(renderer)) return null;
  const data = new Float32Array(maxSegments * 2 * 4);
  const texture = new DataTexture(
    data,
    maxSegments * 2,
    1,
    RGBAFormat,
    FloatType,
  );
  texture.minFilter = NearestFilter;
  texture.magFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = NoColorSpace;
  texture.name = "raymarch-mercury-primitives";
  texture.needsUpdate = true;

  try {
    renderer.initTexture(texture);
    return {
      data,
      texture,
      selectedIndices: new Int32Array(maxSegments + 1),
      cumulativeLengths: new Float32Array(maxTrailPoints),
      breakBefore: new Uint8Array(maxTrailPoints),
      maxSegments,
      primitiveCount: 0,
      lastTrailRevision: -1,
    } satisfies RaymarchPrimitiveBuffer;
  } catch {
    texture.dispose();
    return null;
  }
}

function writePrimitive(
  buffer: RaymarchPrimitiveBuffer,
  primitiveIndex: number,
  start: PrimitiveTrailPoint,
  end: PrimitiveTrailPoint,
  canvasWidth: number,
  canvasHeight: number,
  portraitAspect: number,
) {
  const startU = start.x / canvasWidth;
  const startV = 1 - start.y / canvasHeight;
  const endU = end.x / canvasWidth;
  const endV = 1 - end.y / canvasHeight;
  const dataIndex = primitiveIndex * 8;
  buffer.data[dataIndex] = (startU - 0.5) * portraitAspect;
  buffer.data[dataIndex + 1] = startV - 0.5;
  buffer.data[dataIndex + 2] = (endU - 0.5) * portraitAspect;
  buffer.data[dataIndex + 3] = endV - 0.5;
  buffer.data[dataIndex + 4] = start.radius / canvasHeight;
  buffer.data[dataIndex + 5] = Math.min(start.strength, end.strength);
  buffer.data[dataIndex + 6] = 1;
  buffer.data[dataIndex + 7] = 0;
}

export function clearRaymarchPrimitiveBuffer(
  buffer: RaymarchPrimitiveBuffer,
  trailRevision: number,
) {
  if (
    buffer.primitiveCount === 0
    && buffer.lastTrailRevision === trailRevision
  ) {
    return false;
  }
  buffer.data.fill(0);
  buffer.primitiveCount = 0;
  buffer.lastTrailRevision = trailRevision;
  buffer.texture.needsUpdate = true;
  return true;
}

export function updateRaymarchPrimitiveBuffer(
  buffer: RaymarchPrimitiveBuffer,
  trailPoints: ChronologicalTrailPoints,
  canvasWidth: number,
  canvasHeight: number,
  portraitAspect: number,
  idleTimeoutMs: number,
  interpolationSpacingPx: number,
) {
  if (buffer.lastTrailRevision === trailPoints.revision) return false;
  if (
    trailPoints.count === 0
    || canvasWidth <= 0
    || canvasHeight <= 0
  ) {
    return clearRaymarchPrimitiveBuffer(
      buffer,
      trailPoints.revision,
    );
  }

  const pointCount = trailPoints.count;
  const cumulativeLengths = buffer.cumulativeLengths;
  const breakBefore = buffer.breakBefore;
  cumulativeLengths[0] = 0;
  breakBefore[0] = 0;
  let totalLength = 0;

  for (let index = 1; index < pointCount; index += 1) {
    const previous = trailPoints.at(index - 1);
    const current = trailPoints.at(index);
    if (!previous || !current) continue;
    const distance = Math.hypot(
      current.x - previous.x,
      current.y - previous.y,
    );
    const disconnected = (
      current.createdAtMs - previous.createdAtMs > idleTimeoutMs
      || distance > interpolationSpacingPx
    );
    breakBefore[index] = disconnected ? 1 : 0;
    if (!disconnected) totalLength += distance;
    cumulativeLengths[index] = totalLength;
  }

  buffer.data.fill(0);
  if (pointCount === 1) {
    const point = trailPoints.at(0);
    if (!point) {
      return clearRaymarchPrimitiveBuffer(
        buffer,
        trailPoints.revision,
      );
    }
    writePrimitive(
      buffer,
      0,
      point,
      point,
      canvasWidth,
      canvasHeight,
      portraitAspect,
    );
    buffer.primitiveCount = 1;
    buffer.lastTrailRevision = trailPoints.revision;
    buffer.texture.needsUpdate = true;
    return true;
  }

  const selectedPointCount = Math.min(
    pointCount,
    buffer.maxSegments + 1,
  );
  const selectedIndices = buffer.selectedIndices;
  selectedIndices[0] = 0;
  selectedIndices[selectedPointCount - 1] = pointCount - 1;

  if (selectedPointCount > 2) {
    if (totalLength <= 0.0001) {
      let previousSelectedIndex = 0;
      for (
        let selectedIndex = 1;
        selectedIndex < selectedPointCount - 1;
        selectedIndex += 1
      ) {
        const remainingSelections = selectedPointCount
          - selectedIndex
          - 1;
        const maximumIndex = pointCount - remainingSelections - 1;
        const evenIndex = Math.round(
          selectedIndex
            * (pointCount - 1)
            / (selectedPointCount - 1),
        );
        const pointIndex = Math.min(
          maximumIndex,
          Math.max(previousSelectedIndex + 1, evenIndex),
        );
        selectedIndices[selectedIndex] = pointIndex;
        previousSelectedIndex = pointIndex;
      }
    } else {
      const arcInterval = totalLength / (selectedPointCount - 1);
      let previousSelectedIndex = 0;
      for (
        let selectedIndex = 1;
        selectedIndex < selectedPointCount - 1;
        selectedIndex += 1
      ) {
        const targetLength = arcInterval * selectedIndex;
        const windowStart = targetLength - arcInterval * 0.5;
        const windowEnd = targetLength + arcInterval * 0.5;
        const remainingSelections = selectedPointCount
          - selectedIndex
          - 1;
        const maximumIndex = pointCount - remainingSelections - 1;
        let bestIndex = previousSelectedIndex + 1;
        let bestScore = -1;

        for (
          let pointIndex = previousSelectedIndex + 1;
          pointIndex <= maximumIndex;
          pointIndex += 1
        ) {
          const pointLength = cumulativeLengths[pointIndex];
          if (pointLength < windowStart) continue;
          if (pointLength > windowEnd && bestScore >= 0) break;
          const point = trailPoints.at(pointIndex);
          const before = trailPoints.at(Math.max(0, pointIndex - 1));
          const after = trailPoints.at(Math.min(
            pointCount - 1,
            pointIndex + 1,
          ));
          if (!point || !before || !after) continue;

          const beforeX = point.x - before.x;
          const beforeY = point.y - before.y;
          const afterX = after.x - point.x;
          const afterY = after.y - point.y;
          const beforeLength = Math.hypot(beforeX, beforeY);
          const afterLength = Math.hypot(afterX, afterY);
          const directionDot = beforeLength > 0 && afterLength > 0
            ? (
              beforeX * afterX + beforeY * afterY
            ) / (beforeLength * afterLength)
            : 1;
          const bendImportance = 1 - Math.max(
            -1,
            Math.min(1, directionDot),
          );
          const centrality = 1 - Math.min(
            1,
            Math.abs(pointLength - targetLength)
              / Math.max(arcInterval * 0.5, 0.0001),
          );
          const score = bendImportance + centrality;
          if (score > bestScore) {
            bestScore = score;
            bestIndex = pointIndex;
          }
        }
        selectedIndices[selectedIndex] = bestIndex;
        previousSelectedIndex = bestIndex;
      }
    }
  }

  let primitiveCount = 0;
  for (
    let selectedIndex = 0;
    selectedIndex < selectedPointCount - 1;
    selectedIndex += 1
  ) {
    const startIndex = selectedIndices[selectedIndex];
    const endIndex = selectedIndices[selectedIndex + 1];
    const start = trailPoints.at(startIndex);
    const end = trailPoints.at(endIndex);
    if (!start || !end) continue;

    let disconnected = false;
    for (
      let pointIndex = startIndex + 1;
      pointIndex <= endIndex;
      pointIndex += 1
    ) {
      if (breakBefore[pointIndex] > 0) {
        disconnected = true;
        break;
      }
    }
    writePrimitive(
      buffer,
      primitiveCount,
      disconnected ? end : start,
      end,
      canvasWidth,
      canvasHeight,
      portraitAspect,
    );
    primitiveCount += 1;
  }

  buffer.primitiveCount = primitiveCount;
  buffer.lastTrailRevision = trailPoints.revision;
  buffer.texture.needsUpdate = true;
  return true;
}

export function disposeRaymarchPrimitiveBuffer(
  buffer: RaymarchPrimitiveBuffer,
) {
  buffer.texture.dispose();
}
