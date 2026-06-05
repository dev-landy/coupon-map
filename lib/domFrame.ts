/** requestAnimationFrame with a setTimeout fallback for non-browser/legacy envs. */
export function requestFrame(callback: FrameRequestCallback): number {
  if (typeof window.requestAnimationFrame === 'function') {
    return window.requestAnimationFrame(callback);
  }

  return window.setTimeout(() => callback(window.performance.now()), 0);
}

export function cancelFrame(frame: number) {
  if (typeof window.cancelAnimationFrame === 'function') {
    window.cancelAnimationFrame(frame);
    return;
  }

  window.clearTimeout(frame);
}
