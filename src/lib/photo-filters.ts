/**
 * Photo Booth-style effects, done twice on purpose.
 *
 * The preview is a CSS filter on the video, which every browser does. The capture is the
 * same effect as pixel maths, because Safari's canvas has no `filter` property — relying
 * on it meant the picker had to be hidden on the one platform this app is built for.
 * The two live in the same table so they cannot drift apart.
 */

export type Op =
  | { op: "grayscale" }
  | { op: "sepia" }
  | { op: "saturate"; amount: number }
  | { op: "contrast"; amount: number }
  | { op: "brightness"; amount: number }
  | { op: "invert" }
  | { op: "hueRotate"; deg: number };

export interface PhotoFilter {
  name: string;
  /** For the live preview. */
  css: string;
  /** The same thing, for the captured pixels. */
  ops: Op[];
}

export const FILTERS: PhotoFilter[] = [
  { name: "Normal", css: "none", ops: [] },
  {
    name: "Mono",
    css: "grayscale(1) contrast(1.15)",
    ops: [{ op: "grayscale" }, { op: "contrast", amount: 1.15 }],
  },
  {
    name: "Sepia",
    css: "sepia(0.85) contrast(1.05)",
    ops: [{ op: "sepia" }, { op: "contrast", amount: 1.05 }],
  },
  {
    name: "Pop",
    css: "saturate(2.4) contrast(1.3)",
    ops: [{ op: "saturate", amount: 2.4 }, { op: "contrast", amount: 1.3 }],
  },
  {
    name: "Noir",
    css: "grayscale(1) contrast(1.7) brightness(0.9)",
    ops: [{ op: "grayscale" }, { op: "contrast", amount: 1.7 }, { op: "brightness", amount: 0.9 }],
  },
  {
    name: "Thermal",
    css: "invert(1) hue-rotate(170deg) saturate(3)",
    ops: [{ op: "invert" }, { op: "hueRotate", deg: 170 }, { op: "saturate", amount: 3 }],
  },
  {
    name: "X-Ray",
    css: "invert(1) grayscale(1) contrast(1.4)",
    ops: [{ op: "invert" }, { op: "grayscale" }, { op: "contrast", amount: 1.4 }],
  },
  {
    name: "Glow",
    css: "brightness(1.2) saturate(1.5)",
    ops: [{ op: "brightness", amount: 1.2 }, { op: "saturate", amount: 1.5 }],
  },
];

/** Rec. 709, the same weighting CSS filters use. */
function luminance(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function clamp(value: number): number {
  return value < 0 ? 0 : value > 255 ? 255 : value;
}

/** Applies one op to a single pixel, returned as a fresh triple. */
function pixel(op: Op, r: number, g: number, b: number): [number, number, number] {
  switch (op.op) {
    case "grayscale": {
      const l = luminance(r, g, b);
      return [l, l, l];
    }
    case "sepia":
      return [
        0.393 * r + 0.769 * g + 0.189 * b,
        0.349 * r + 0.686 * g + 0.168 * b,
        0.272 * r + 0.534 * g + 0.131 * b,
      ];
    case "saturate": {
      const l = luminance(r, g, b);
      const s = op.amount;
      return [l + s * (r - l), l + s * (g - l), l + s * (b - l)];
    }
    case "contrast": {
      const c = op.amount;
      return [(r - 127.5) * c + 127.5, (g - 127.5) * c + 127.5, (b - 127.5) * c + 127.5];
    }
    case "brightness":
      return [r * op.amount, g * op.amount, b * op.amount];
    case "invert":
      return [255 - r, 255 - g, 255 - b];
    case "hueRotate": {
      // The standard hue-rotation matrix from the filter effects spec.
      const rad = (op.deg * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      return [
        r * (0.213 + cos * 0.787 - sin * 0.213) +
          g * (0.715 - cos * 0.715 - sin * 0.715) +
          b * (0.072 - cos * 0.072 + sin * 0.928),
        r * (0.213 - cos * 0.213 + sin * 0.143) +
          g * (0.715 + cos * 0.285 + sin * 0.14) +
          b * (0.072 - cos * 0.072 - sin * 0.283),
        r * (0.213 - cos * 0.213 - sin * 0.787) +
          g * (0.715 - cos * 0.715 + sin * 0.715) +
          b * (0.072 + cos * 0.928 + sin * 0.072),
      ];
    }
  }
}

/** Applies the ops in order, in place. Alpha is left alone. */
export function applyFilter(data: Uint8ClampedArray, ops: Op[]): void {
  if (ops.length === 0) {
    return;
  }
  for (let i = 0; i < data.length; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];
    for (const op of ops) {
      [r, g, b] = pixel(op, r, g, b);
    }
    data[i] = clamp(r);
    data[i + 1] = clamp(g);
    data[i + 2] = clamp(b);
  }
}
