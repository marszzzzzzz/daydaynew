import { describe, expect, it } from "vitest";
import { placeCard, spotlightRect } from "./tourPlacement";

const viewport = { width: 1000, height: 800 };
const card = { width: 320, height: 200 };

describe("spotlightRect", () => {
  it("pads the target on every side", () => {
    expect(spotlightRect({ top: 100, left: 50, width: 200, height: 40 }, 8)).toEqual({ top: 92, left: 42, width: 216, height: 56 });
  });
});

describe("placeCard", () => {
  it("places the card below a target near the top, centred horizontally", () => {
    const p = placeCard({ top: 100, left: 400, width: 200, height: 50 }, card, viewport);
    expect(p.side).toBe("bottom");
    expect(p.top).toBe(100 + 50 + 16);
    expect(p.left).toBe(400 + 100 - 160);
  });
  it("places the card above when there is no room below", () => {
    const p = placeCard({ top: 650, left: 400, width: 200, height: 100 }, card, viewport);
    expect(p.side).toBe("top");
    expect(p.top).toBe(650 - 16 - 200);
  });
  it("clamps inside the viewport margins", () => {
    expect(placeCard({ top: 100, left: 0, width: 40, height: 40 }, card, viewport).left).toBe(12);
    expect(placeCard({ top: 100, left: 980, width: 20, height: 20 }, card, viewport).left).toBe(1000 - 320 - 12);
  });
  it("overlays the bottom of the screen when the target is taller than the viewport", () => {
    const p = placeCard({ top: -50, left: 0, width: 1000, height: 1200 }, card, viewport);
    expect(p.side).toBe("overlay");
    expect(p.top).toBe(800 - 200 - 12);
  });
});
