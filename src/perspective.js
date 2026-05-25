export function orderQuadPoints(points) {
  if (!Array.isArray(points) || points.length !== 4) {
    throw new Error("Perspective correction requires exactly four points.");
  }

  const sorted = [...points].sort((a, b) => a.y - b.y);
  const top = sorted.slice(0, 2).sort((a, b) => a.x - b.x);
  const bottom = sorted.slice(2).sort((a, b) => a.x - b.x);

  return [top[0], top[1], bottom[1], bottom[0]];
}

export function getQuadOutputSize(points) {
  const [topLeft, topRight, bottomRight, bottomLeft] = orderQuadPoints(points);
  const topWidth = distance(topLeft, topRight);
  const bottomWidth = distance(bottomLeft, bottomRight);
  const leftHeight = distance(topLeft, bottomLeft);
  const rightHeight = distance(topRight, bottomRight);

  return {
    width: Math.max(1, Math.round(Math.max(topWidth, bottomWidth))),
    height: Math.max(1, Math.round(Math.max(leftHeight, rightHeight))),
  };
}

export function createPerspectiveTransform(sourcePoints, width, height) {
  const [topLeft, topRight, bottomRight, bottomLeft] = orderQuadPoints(sourcePoints);

  return function mapTargetToSource(x, y) {
    const u = width <= 1 ? 0 : x / (width - 1);
    const v = height <= 1 ? 0 : y / (height - 1);
    return bilinearPoint(topLeft, topRight, bottomRight, bottomLeft, u, v);
  };
}

function bilinearPoint(topLeft, topRight, bottomRight, bottomLeft, u, v) {
  const top = interpolate(topLeft, topRight, u);
  const bottom = interpolate(bottomLeft, bottomRight, u);
  return interpolate(top, bottom, v);
}

function interpolate(a, b, t) {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  };
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
