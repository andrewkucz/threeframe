import type { Ease } from "@threeframe/game";

export const easings: Record<Ease, (t: number) => number> = {
  linear: (t) => t,
  in: (t) => t * t * t,
  out: (t) => 1 - (1 - t) ** 3,
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
};

/** Seconds on a monotonic clock shared by every tween. */
export const clock = () => (globalThis.performance?.now() ?? Date.now()) / 1000;

/** One animated number. Retargeting starts from wherever the value is now, so motion never jumps. */
export class Tween {
  private from: number;
  private to: number;
  private start = 0;
  private duration = 0;
  private ease: Ease = "out";

  constructor(value: number) {
    this.from = value;
    this.to = value;
  }

  get target() {
    return this.to;
  }

  /** Animates to `to`, optionally from an explicit starting value (e.g. offstage). */
  set(to: number, duration = 0, ease: Ease = "out", from?: number, now = clock()) {
    const current = from ?? this.at(now);
    this.from = current;
    this.to = to;
    this.start = now;
    this.duration = Math.max(0, duration);
    this.ease = ease;
  }

  /** Jumps to a value with no animation. */
  jump(value: number) {
    this.from = value;
    this.to = value;
    this.duration = 0;
  }

  at(now = clock()) {
    if (this.duration <= 0) return this.to;
    const t = Math.min(1, Math.max(0, (now - this.start) / this.duration));
    return this.from + (this.to - this.from) * easings[this.ease](t);
  }

  done(now = clock()) {
    return this.duration <= 0 || now - this.start >= this.duration;
  }
}
