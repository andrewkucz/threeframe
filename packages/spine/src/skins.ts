import { Skin, type SkeletonData, type SkinEntry } from "@esotericsoftware/spine-threejs";

/** A skin listed under its folder. */
export interface SpineSkinInfo {
  /** Full skin name, as passed to `skin`. */
  name: string;
  /** Last path segment of the name. */
  label: string;
}
/**
 * Skins that share a folder in the Spine editor, such as every skin named `clothes/top/…`.
 * Folders are the conventional mix-and-match categories: pick one skin from each.
 */
export interface SpineSkinFolder {
  /** Folder path without a trailing slash; `""` for skins at the top level. */
  path: string;
  /** Last segment of the folder path; `""` at the top level. */
  label: string;
  skins: SpineSkinInfo[];
}
export interface SpineSkinFolderOptions {
  /** List the default skin too. It is otherwise omitted, since the runtime always falls back to it. */
  includeDefault?: boolean;
  /** Skin names to leave out, e.g. an asset's `flipSkins`, which sprites add on their own. */
  exclude?: readonly string[];
}

/** Groups a skeleton's skins by editor folder, keeping the export's order. */
export function skinFolders(
  data: SkeletonData,
  { includeDefault = false, exclude = [] }: SpineSkinFolderOptions = {},
): SpineSkinFolder[] {
  const folders = new Map<string, SpineSkinFolder>();
  for (const skin of data.skins) {
    if (!includeDefault && skin === data.defaultSkin) continue;
    if (exclude.includes(skin.name)) continue;
    const slash = skin.name.lastIndexOf("/");
    const path = slash < 0 ? "" : skin.name.slice(0, slash);
    let folder = folders.get(path);
    if (!folder) {
      folder = { path, label: path.slice(path.lastIndexOf("/") + 1), skins: [] };
      folders.set(path, folder);
    }
    folder.skins.push({ name: skin.name, label: skin.name.slice(slash + 1) });
  }
  return [...folders.values()];
}

/** Every name in `skin` as a list; `null`/`undefined` means none. */
export function skinNames(skin: string | readonly string[] | null | undefined): string[] {
  return skin == null ? [] : typeof skin === "string" ? [skin] : [...skin];
}

/**
 * Resolves skin names to one runtime skin. No names gives the default skin, one name gives that
 * skin, and several are combined in order into a new skin, so later skins win where they overlap.
 * Throws on unknown names.
 */
export function resolveSkin(
  data: SkeletonData,
  skin: string | readonly string[] | null | undefined,
): Skin | null {
  const names = skinNames(skin);
  const find = (name: string) => {
    const found = data.findSkin(name);
    if (!found) throw new Error(`Unknown Spine skin: ${name}`);
    return found;
  };
  if (!names.length) return data.defaultSkin;
  if (names.length === 1) return find(names[0]);
  const combined = new Skin(names.join("+"));
  for (const name of names) combined.addSkin(find(name));
  return combined;
}

/** The attachments a slot can show with a given skin. */
export interface SpineSlotAttachments {
  slot: string;
  /** Bone the slot is attached to. */
  bone: string;
  /** Attachment shown in the setup pose, or null if the slot starts empty. */
  setup: string | null;
  /** Placeholder names available to `skeleton.setAttachment`, from the skin and the default skin. */
  attachments: string[];
}
/**
 * Lists each slot's available attachments for a skin (defaults to the default skin), in draw
 * order. Attachments from the default skin are included, matching the runtime's fallback.
 */
export function slotAttachments(
  data: SkeletonData,
  skin?: string | readonly string[] | Skin | null,
): SpineSlotAttachments[] {
  const resolved = skin instanceof Skin ? skin : resolveSkin(data, skin);
  const sources = [resolved, data.defaultSkin].filter(
    (value, index, all): value is Skin => !!value && all.indexOf(value) === index,
  );
  const entries: SkinEntry[] = [];
  return data.slots.map((slot) => {
    const names = new Set<string>();
    for (const source of sources) {
      entries.length = 0;
      source.getAttachmentsForSlot(slot.index, entries);
      for (const entry of entries) names.add(entry.placeholder);
    }
    return {
      slot: slot.name,
      bone: slot.boneData.name,
      setup: slot.attachmentName,
      attachments: [...names],
    };
  });
}

/** Slot names to hide, by the skin name or skin folder that hides them. */
export type SpineSlotHides = Readonly<Record<string, readonly string[]>>;

/** Values of `rules` whose key (a skin name or skin folder) matches a worn skin, in rule order. */
function matching(
  rules: Readonly<Record<string, readonly string[]>> | undefined,
  skin: string | readonly string[] | null | undefined,
): string[] {
  const names = skinNames(skin);
  const found = new Set<string>();
  for (const [key, values] of Object.entries(rules ?? {})) {
    const folder = `${key.replace(/\/$/, "")}/`;
    if (names.some((name) => name === key || name.startsWith(folder)))
      for (const value of values) found.add(value);
  }
  return [...found];
}

/** The slots `hides` hides for the worn skins (matched by full name or by folder). */
export function hiddenSlots(
  hides: SpineSlotHides | undefined,
  skin: string | readonly string[] | null | undefined,
): string[] {
  return matching(hides, skin);
}

/**
 * Skins worn only while a sprite is flipped horizontally, by the skin name or skin folder they go
 * with. Mirroring moves parts that belong to one side of a character, such as a hair clip on her
 * left, to the other side; a flip skin puts them back, or shows or hides them:
 * `{ "body/hair/bob": ["flipped/body/hair/bob"] }`.
 */
export type SpineFlipSkins = Readonly<Record<string, readonly string[]>>;

/** The skins `flipSkins` adds to the worn skins while flipped (matched by full name or folder). */
export function flippedSkins(
  flipSkins: SpineFlipSkins | undefined,
  skin: string | readonly string[] | null | undefined,
): string[] {
  return matching(flipSkins, skin);
}
