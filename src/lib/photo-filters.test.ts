import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { applyFilter, FILTERS, type Op } from "./photo-filters.ts";

/** One pixel, as the canvas would hand it over. */
const px = (r: number, g: number, b: number) => new Uint8ClampedArray([r, g, b, 255]);
const run = (data: Uint8ClampedArray, ops: Op[]) => {
  applyFilter(data, ops);
  return [data[0], data[1], data[2]];
};

describe("applyFilter", () => {
  test("no ops leaves the pixel untouched", () => {
    assert.deepEqual(run(px(10, 20, 30), []), [10, 20, 30]);
  });

  test("grayscale collapses to one luminance", () => {
    const [r, g, b] = run(px(255, 0, 0), [{ op: "grayscale" }]);
    assert.equal(r, g);
    assert.equal(g, b);
    // Rec. 709 puts pure red near 54.
    assert.ok(Math.abs(r - 54) <= 1, `got ${r}`);
  });

  test("invert flips each channel", () => {
    assert.deepEqual(run(px(0, 128, 255), [{ op: "invert" }]), [255, 127, 0]);
  });

  test("brightness scales, and clamps rather than wrapping", () => {
    assert.deepEqual(run(px(100, 100, 100), [{ op: "brightness", amount: 1.5 }]), [150, 150, 150]);
    assert.deepEqual(run(px(200, 200, 200), [{ op: "brightness", amount: 2 }]), [255, 255, 255]);
  });

  test("contrast pushes away from mid grey and leaves it alone", () => {
    assert.deepEqual(run(px(128, 128, 128), [{ op: "contrast", amount: 2 }]), [128, 128, 128]);
    const [dark] = run(px(64, 64, 64), [{ op: "contrast", amount: 2 }]);
    assert.ok(dark < 64, `contrast should darken a dark pixel, got ${dark}`);
  });

  test("saturate at 0 is grey, and above 1 pushes colour out", () => {
    const [r, g, b] = run(px(200, 100, 50), [{ op: "saturate", amount: 0 }]);
    assert.equal(r, g);
    assert.equal(g, b);
    const [hot] = run(px(200, 100, 50), [{ op: "saturate", amount: 2 }]);
    assert.ok(hot > 200, `got ${hot}`);
  });

  test("sepia warms a grey pixel", () => {
    const [r, g, b] = run(px(128, 128, 128), [{ op: "sepia" }]);
    assert.ok(r > g && g > b, `sepia should read warm: ${r},${g},${b}`);
  });

  test("hue rotation leaves grey grey", () => {
    const [r, g, b] = run(px(128, 128, 128), [{ op: "hueRotate", deg: 170 }]);
    assert.ok(Math.abs(r - 128) <= 2 && Math.abs(g - 128) <= 2 && Math.abs(b - 128) <= 2);
  });

  test("ops apply in order", () => {
    // Brightness and contrast do not commute: one scales about zero, the other about
    // mid grey. (Grayscale and invert would be a bad pair to test with — the luminance
    // weights sum to 1, so both orders come to 255 minus the luminance.)
    const first = run(px(100, 100, 100), [
      { op: "brightness", amount: 1.2 },
      { op: "contrast", amount: 1.5 },
    ]);
    const second = run(px(100, 100, 100), [
      { op: "contrast", amount: 1.5 },
      { op: "brightness", amount: 1.2 },
    ]);
    assert.notDeepEqual(first, second, `${first} vs ${second}`);
  });

  test("grayscale and invert genuinely commute", () => {
    const a = run(px(10, 200, 90), [{ op: "invert" }, { op: "grayscale" }]);
    const b = run(px(10, 200, 90), [{ op: "grayscale" }, { op: "invert" }]);
    assert.deepEqual(a, b);
  });

  test("every shipped filter changes a mid-tone pixel, except Normal", () => {
    for (const filter of FILTERS) {
      const before = [128, 100, 90];
      const after = run(px(128, 100, 90), filter.ops);
      if (filter.name === "Normal") {
        assert.deepEqual(after, before);
      } else {
        assert.notDeepEqual(after, before, `${filter.name} did nothing`);
      }
    }
  });

  test("a whole image is processed, alpha untouched", () => {
    const data = new Uint8ClampedArray([10, 20, 30, 200, 40, 50, 60, 100]);
    applyFilter(data, [{ op: "invert" }]);
    assert.deepEqual([...data], [245, 235, 225, 200, 215, 205, 195, 100]);
  });
});
