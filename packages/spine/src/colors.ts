import { Color, type Skeleton } from "@esotericsoftware/spine-threejs";

/**
 * Recolors grayscale art with Spine's two-color tint: a texel of gray value `g` is drawn as
 * `dark + g × (light − dark)`. The chosen color lands on gray `mid`; the art's black and white map
 * to that color `range` CIE L* units darker and proportionally lighter, so shading and highlights
 * keep their contrast in any color. Slots need "Tint black" enabled in Spine (a `dark` color).
 */
export interface SpineGradientShading {
  /** Gray value (0–1) the art uses for the base color. */
  mid: number;
  /** Lightness (CIE L*, 0–100) spanned by the art's grays from 0 to 1. */
  range: number;
}
/**
 * A named color shared by several slots, such as `hair` or `skin`. Without `gradient` the color
 * multiplies the art (white takes the color, black stays black), which suits flat-colored art.
 */
export interface SpineColorGroup {
  slots: readonly string[];
  /** Color shown when none is chosen; the art's own colors when omitted. */
  default?: string;
  /** Named choices for pickers, e.g. `{ blonde: "#c1b01c" }`. */
  presets?: Readonly<Record<string, string>>;
  gradient?: SpineGradientShading;
}
export type SpineColorGroups = Readonly<Record<string, SpineColorGroup>>;
/** Chosen colors by group name, or by slot name for slots outside any group. */
export type SpineColors = Readonly<Record<string, string>>;

/** A slot's two-color tint; `dark` is null for a plain multiply. */
export interface SpineSlotTint {
  light: Color;
  dark: Color | null;
}

/** Parses `#rgb`, `#rrggbb` or `#rrggbbaa`. Throws on anything else. */
export function parseColor(value: string): Color {
  const hex = value.trim().replace(/^#/, "");
  const full = hex.length === 3 ? hex.replace(/./g, (c) => c + c) : hex;
  if (!/^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(full)) throw new Error(`Invalid color: ${value}`);
  return new Color().setFromString(full);
}

// sRGB <-> CIE L*a*b* (D65), enough to shift a color's lightness.
const WHITE = [0.95047, 1, 1.08883];
const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = (c: number) =>
  c <= 0.0031308 ? c * 12.92 : 1.055 * Math.max(c, 0) ** (1 / 2.4) - 0.055;
const labF = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116);
const labFInverse = (t: number) => (t ** 3 > 216 / 24389 ? t ** 3 : (116 * t - 16) / (24389 / 27));

function toLab({ r, g, b }: Color): [number, number, number] {
  const [lr, lg, lb] = [r, g, b].map(toLinear);
  const x = (0.4124 * lr + 0.3576 * lg + 0.1805 * lb) / WHITE[0];
  const y = (0.2126 * lr + 0.7152 * lg + 0.0722 * lb) / WHITE[1];
  const z = (0.0193 * lr + 0.1192 * lg + 0.9505 * lb) / WHITE[2];
  const [fx, fy, fz] = [x, y, z].map(labF);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
function fromLab([l, a, b]: [number, number, number]): Color {
  const fy = (l + 16) / 116;
  const x = labFInverse(fy + a / 500) * WHITE[0];
  const y = labFInverse(fy) * WHITE[1];
  const z = labFInverse(fy - b / 200) * WHITE[2];
  const channel = (value: number) => Math.min(1, Math.max(0, toGamma(value)));
  return new Color(
    channel(3.2406 * x - 1.5372 * y - 0.4986 * z),
    channel(-0.9689 * x + 1.8758 * y + 0.0415 * z),
    channel(0.0557 * x - 0.204 * y + 1.057 * z),
    1,
  );
}

/** The light and dark tint colors that draw `color` the way `group` expects its art. */
export function colorTint(color: string, group?: Pick<SpineColorGroup, "gradient">): SpineSlotTint {
  const base = parseColor(color);
  const shading = group?.gradient;
  if (!shading) return { light: base, dark: null };
  const mid = Math.min(0.99, Math.max(0.01, shading.mid));
  const [l, a, b] = toLab(base);
  const shifted = fromLab([l - mid * shading.range, a, b]);
  // Light continues the line from dark through the base color, so gray `mid` draws exactly the
  // base. Where light clips at white, dark moves to keep the line through the base.
  const clamp = (value: number) => Math.min(1, Math.max(0, value));
  const channel = (key: "r" | "g" | "b") => {
    const light = clamp(base[key] + ((1 - mid) / mid) * (base[key] - shifted[key]));
    return [light, clamp((base[key] - mid * light) / (1 - mid))];
  };
  const [[lr, dr], [lg, dg], [lb, db]] = [channel("r"), channel("g"), channel("b")];
  const light = new Color(lr, lg, lb, base.a);
  const dark = new Color(dr, dg, db, 1);
  return { light, dark };
}

/**
 * Resolves chosen colors to per-slot tints. Keys name a group, or a slot directly; groups with a
 * `default` apply even when nothing is chosen. Unknown slots are skipped.
 */
export function slotTints(
  groups: SpineColorGroups | undefined,
  colors: SpineColors | undefined,
): Map<string, SpineSlotTint> {
  const tints = new Map<string, SpineSlotTint>();
  for (const [name, group] of Object.entries(groups ?? {})) {
    const color = colors?.[name] ?? group.default;
    if (!color) continue;
    const tint = colorTint(color, group);
    for (const slot of group.slots) tints.set(slot, tint);
  }
  for (const [name, color] of Object.entries(colors ?? {}))
    if (!groups?.[name]) tints.set(name, colorTint(color));
  return tints;
}

/** Applies tints to a skeleton's current slot pose (call after anything that resets it). */
export function applySlotTints(skeleton: Skeleton, tints: ReadonlyMap<string, SpineSlotTint>) {
  for (const [name, tint] of tints) {
    const slot = skeleton.findSlot(name);
    if (!slot) continue;
    const pose = slot.pose;
    const alpha = pose.color.a;
    pose.color.setFromColor(tint.light);
    pose.color.a = alpha;
    if (pose.darkColor) pose.darkColor.setFromColor(tint.dark ?? new Color(0, 0, 0, 1));
  }
}
