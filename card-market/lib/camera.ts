// Camera geometry, kept free of the DOM so it can be tested.

export interface Rect { left: number; top: number; width: number; height: number }

/**
 * The part of the video under the on-screen frame, in video pixels.
 * `video` is the <video> element's getBoundingClientRect(): it already includes any CSS transform (the
 * digital zoom is a CSS scale), so the zoom must not be applied again. The video is drawn object-cover,
 * centred inside that rect.
 */
export function frameToVideo(video: Rect, frame: Rect, videoWidth: number, videoHeight: number) {
  const s = Math.max(video.width / videoWidth, video.height / videoHeight);
  const ox = (video.width - videoWidth * s) / 2, oy = (video.height - videoHeight * s) / 2;
  const sx = Math.max(0, (frame.left - video.left - ox) / s), sy = Math.max(0, (frame.top - video.top - oy) / s);
  return { sx, sy, sw: Math.min(videoWidth - sx, frame.width / s), sh: Math.min(videoHeight - sy, frame.height / s) };
}
