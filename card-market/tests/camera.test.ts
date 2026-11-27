import { describe, expect, it } from 'vitest';
import { frameToVideo } from '@/lib/camera';

// A 1920×1080 video shown object-cover in a 400×800 portrait screen, with a 300×419 frame in the middle.
const screen = { left: 0, top: 0, width: 400, height: 800 };
const frame = { left: 50, top: 190.5, width: 300, height: 419 };

/** The <video> rect as getBoundingClientRect() reports it under a CSS scale(z) about its centre. */
const zoomed = (z: number) => ({ left: 200 - 200 * z, top: 400 - 400 * z, width: 400 * z, height: 800 * z });

describe('frameToVideo', () => {
  it('maps the frame to the middle of the video at 1×', () => {
    const r = frameToVideo(screen, frame, 1920, 1080);
    const s = 800 / 1080; // object-cover: the height fills the screen
    expect(r.sw).toBeCloseTo(300 / s);
    expect(r.sh).toBeCloseTo(419 / s);
    expect(r.sx + r.sw / 2).toBeCloseTo(960);
    expect(r.sy + r.sh / 2).toBeCloseTo(540);
  });

  it('regression: at 2× it takes half the size, not a quarter (the zoom was counted twice)', () => {
    const one = frameToVideo(zoomed(1), frame, 1920, 1080);
    const two = frameToVideo(zoomed(2), frame, 1920, 1080);
    expect(two.sw).toBeCloseTo(one.sw / 2);
    expect(two.sh).toBeCloseTo(one.sh / 2);
    expect(two.sx + two.sw / 2).toBeCloseTo(960); // still centred
    expect(two.sy + two.sh / 2).toBeCloseTo(540);
  });

  it('never reaches outside the video', () => {
    const r = frameToVideo(screen, { left: -2000, top: -100, width: 5000, height: 2000 }, 1920, 1080);
    expect(r.sx).toBe(0);
    expect(r.sy).toBe(0);
    expect(r.sx + r.sw).toBeLessThanOrEqual(1920);
    expect(r.sy + r.sh).toBeLessThanOrEqual(1080);
  });
});
