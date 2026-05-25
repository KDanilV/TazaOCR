import assert from "node:assert/strict";
import test from "node:test";

import { createPerspectiveTransform, getQuadOutputSize, orderQuadPoints } from "../src/perspective.js";

test("orders quad points clockwise from top-left", () => {
  const ordered = orderQuadPoints([
    { x: 10, y: 10 },
    { x: 0, y: 0 },
    { x: 0, y: 10 },
    { x: 10, y: 0 },
  ]);

  assert.deepEqual(ordered, [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
  ]);
});

test("calculates output size from the longest opposite sides", () => {
  assert.deepEqual(
    getQuadOutputSize([
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 18, y: 10 },
      { x: 0, y: 10 },
    ]),
    { width: 20, height: 10 },
  );
});

test("maps output rectangle coordinates into source quad", () => {
  const transform = createPerspectiveTransform(
    [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ],
    11,
    11,
  );

  assert.deepEqual(transform(5, 5), { x: 5, y: 5 });
});
