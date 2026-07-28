import assert from "node:assert/strict";
import test from "node:test";
import {
  mergeCoordinateDrafts,
  mergeHamletCoordinateDrafts,
} from "../map-marker-state";

test("coordinate draft only changes the matching marker", () => {
  const markers = [
    { id: "a", lat: 13.1, lng: 109.1 },
    { id: "b", lat: null, lng: null },
  ];

  assert.deepEqual(
    mergeCoordinateDrafts(markers, { b: { lat: 13.2, lng: 109.2 } }),
    [
      markers[0],
      { id: "b", lat: 13.2, lng: 109.2 },
    ],
  );
  assert.deepEqual(markers[1], { id: "b", lat: null, lng: null });
});

test("moving a verified hamlet invalidates verification until ADMIN verifies again", () => {
  const hamlets = [
    { id: "hamlet-1", lat: 13.1, lng: 109.1, verified: true },
  ];

  assert.deepEqual(
    mergeHamletCoordinateDrafts(hamlets, {
      "hamlet-1": { lat: 13.3, lng: 109.3 },
    }),
    [{ id: "hamlet-1", lat: 13.3, lng: 109.3, verified: false }],
  );
});
