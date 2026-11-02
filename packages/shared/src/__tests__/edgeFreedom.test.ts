import { describe, expect, it } from "vitest";
import { autoEdgeFreedom } from "../api.js";
import type { HeldSubject } from "../api.js";
import { createMotion, upsertKey } from "../motion.js";
import type { Point } from "../media.js";
import type { Rect, Scale } from "../motion.js";

const canvas = { width: 1440, height: 704 };
/** A subject whose anchor sits at its centre, moved from there to `to` over the clip; a solid box unless `mask` says otherwise. */
function subject(width: number, height: number, to: Point & Partial<Scale> = { x: 900, y: 400 }, mask?: (x: number, y: number) => boolean): HeldSubject {
  const anchor = { x: 400, y: 400 }, bounds: Rect = { x: anchor.x - width / 2, y: anchor.y - height / 2, width, height };
  const held: HeldSubject = { bounds, motion: upsertKey(createMotion(anchor), 123, to, "end")!.motion };
  if (!mask) return held;
  const data = new Uint8Array(canvas.width * canvas.height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data[(bounds.y + y) * canvas.width + bounds.x + x] = mask(x, y) ? 255 : 0;
  return { ...held, mask: { data, width: canvas.width } };
}
const auto = (...subjects: HeldSubject[]) => autoEdgeFreedom(subjects, canvas, canvas);

describe("automatic edge freedom", () => {
  it("keeps the default for subjects with room for two tokens to spare", () => {
    expect(auto(subject(200, 150))).toBe(16);
  });
  it("leaves two tokens' worth, 80 × 48 px, snapped down to the slider step", () => {
    expect(auto(subject(96, 64))).toBe(8);
    expect(auto(subject(104, 72))).toBe(12);
    expect(auto(subject(64, 150))).toBe(8);
  });
  it("prefers keeping a second token to freeing the edges", () => {
    // One token could spare 16 px here, but only 0 px keeps two.
    expect(auto(subject(82, 82))).toBe(0);
  });
  it("settles for one token, 48 × 48 px, when two never fit", () => {
    expect(auto(subject(60, 60))).toBe(4);
    expect(auto(subject(40, 100))).toBe(0);
  });
  it("measures the shape, not its bounds", () => {
    // An L of 40 px arms fills a 150 px box that would spare the default, but holds no 48 px square.
    expect(auto(subject(150, 150, undefined, (x, y) => x < 40 || y >= 110))).toBe(0);
    expect(auto(subject(150, 150, undefined, () => true))).toBe(16);
  });
  it("measures in generation pixels", () => {
    expect(autoEdgeFreedom([subject(200, 136)], { width: 2880, height: 1408 }, canvas)).toBe(8);
  });
  it("measures the subject at its smallest scale", () => {
    expect(auto(subject(200, 150, { x: 900, y: 400, sx: .5, sy: .5 }))).toBe(8);
  });
  it("ignores frames where the edge cuts the subject off", () => {
    expect(auto(subject(200, 150, { x: 900, y: -60 }))).toBe(16);
  });
  it("suits the smallest of several subjects, which share one mask", () => {
    expect(auto(subject(200, 150), subject(60, 60))).toBe(4);
  });
});
