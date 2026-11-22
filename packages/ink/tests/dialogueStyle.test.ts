import { describe, expect, it } from "vite-plus/test";
import {
  defaultDialogueTheme,
  layoutChoiceMenu,
  layoutPanel,
  mergeDefined,
  resolveDialogueStyle,
  resolvePadding,
  type ResolvedChoiceMenu,
} from "../src/dialogueStyle";

describe("dialogue style resolution", () => {
  it("expands padding shorthands and rejects negative values", () => {
    expect(resolvePadding(10)).toEqual({ top: 10, right: 10, bottom: 10, left: 10 });
    expect(resolvePadding([4, 8])).toEqual({ top: 4, right: 8, bottom: 4, left: 8 });
    expect(resolvePadding([1, 2, 3, -4])).toEqual({ top: 1, right: 2, bottom: 3, left: 0 });
  });

  it("ignores undefined overrides", () => {
    expect(mergeDefined({ a: 1, b: 2 }, { a: undefined, b: 3 })).toEqual({ a: 1, b: 3 });
  });

  it("cascades theme tokens into every part", () => {
    const style = resolveDialogueStyle({
      theme: { accentColor: "#f00", fontFamily: "Lora", borderWidth: 3 },
    });
    expect(style.body.fontFamily).toBe("Lora");
    expect(style.panel && style.panel.borderWidth).toBe(3);
    expect(style.nameplate && style.nameplate.color).toBe("#f00");
    const menu = style.choiceMenu as ResolvedChoiceMenu;
    expect(menu.fontFamily).toBe("Lora");
    expect(menu.hover.surface.borderColor).toBe("#f00");
    expect(menu.marker && menu.marker.color).toBe("#f00");
    expect(menu.pager && menu.pager.color).toBe("#f00");
  });

  it("layers part props over tokens and speaker overrides over part props", () => {
    const style = resolveDialogueStyle({
      theme: { textColor: "#111" },
      body: { color: "#222", fontStyle: "italic" },
      nameplate: { color: "#333", placement: "border" },
      speaker: { color: "#0f0", body: { color: "#444" }, panel: { radius: 0 } },
    });
    expect(style.body.color).toBe("#444");
    expect(style.body.fontStyle).toBe("italic");
    expect(style.panel && style.panel.radius).toBe(0);
    // An explicit part color beats the speaker accent; the badge border still follows it.
    expect(style.nameplate && style.nameplate.color).toBe("#333");
    expect(style.nameplate && style.nameplate.surface.borderColor).toBe("#0f0");
  });

  it("hides parts set to false", () => {
    const style = resolveDialogueStyle({
      panel: false,
      nameplate: false,
      prompt: false,
      pageCounter: false,
      choiceMenu: false,
    });
    expect([
      style.panel,
      style.nameplate,
      style.prompt,
      style.pageCounter,
      style.choiceMenu,
    ]).toEqual([false, false, false, false, false]);
    const menu = resolveDialogueStyle({ choiceMenu: { marker: false, pager: false } })
      .choiceMenu as ResolvedChoiceMenu;
    expect(menu.marker).toBe(false);
    expect(menu.pager).toBe(false);
    expect(defaultDialogueTheme.fontSize).toBeGreaterThan(0);
  });
});

describe("dialogue panel layout", () => {
  const options = { width: 600, height: 200, padding: 20, hasName: true };
  it("reserves rows for the inside nameplate and the footer", () => {
    const full = layoutPanel(
      resolveDialogueStyle({ theme: { fontSize: 20, lineHeight: 1 } }),
      options,
    );
    expect(full.nameplateY).not.toBeNull();
    expect(full.footerY).not.toBeNull();
    const bare = layoutPanel(
      resolveDialogueStyle({
        theme: { fontSize: 20, lineHeight: 1 },
        nameplate: false,
        prompt: false,
        pageCounter: false,
      }),
      options,
    );
    expect(bare.bodyTop).toBe(20);
    expect(bare.linesPerPage).toBe(8);
    expect(full.linesPerPage).toBeLessThan(bare.linesPerPage);
    expect(bare.bodyWidth).toBe(560);
  });

  it("does not reserve nameplate space for badges or unnamed lines", () => {
    const badge = layoutPanel(
      resolveDialogueStyle({ nameplate: { placement: "border" } }),
      options,
    );
    const unnamed = layoutPanel(resolveDialogueStyle({}), { ...options, hasName: false });
    expect(badge.nameplateY).toBeNull();
    expect(unnamed.bodyTop).toBe(badge.bodyTop);
  });

  it("always fits at least one line", () => {
    expect(layoutPanel(resolveDialogueStyle({}), { ...options, height: 10 }).linesPerPage).toBe(1);
  });
});

describe("choice menu layout", () => {
  const menu = resolveDialogueStyle({}).choiceMenu as ResolvedChoiceMenu;
  const base = { panelWidth: 1000, panelHeight: 200, menu, pagerHeight: null };

  it("stacks above a low panel in reading order", () => {
    const layout = layoutChoiceMenu({ ...base, panelY: -200, itemHeights: [50, 50] });
    expect(layout.direction).toBe("above");
    const [first, second] = layout.items;
    expect(second.y - second.height / 2).toBe(100 + menu.margin);
    expect(first.y).toBeGreaterThan(second.y);
  });

  it("stacks below a high panel and clears protruding parts", () => {
    const layout = layoutChoiceMenu({
      ...base,
      panelY: 200,
      itemHeights: [50],
      clearance: { above: 0, below: 10 },
    });
    expect(layout.direction).toBe("below");
    expect(layout.items[0].y + 25).toBe(-100 - menu.margin - 10);
  });

  it("aligns, offsets, and splits into columns with uniform row heights", () => {
    const layout = layoutChoiceMenu({
      ...base,
      panelY: 0,
      menu: {
        ...menu,
        placement: "below",
        width: 410,
        columns: 2,
        gap: 10,
        align: "end",
        offset: [5, 0],
      },
      itemHeights: [50, 80, 40],
      pagerHeight: 30,
    });
    expect(layout.itemWidth).toBe(200);
    const [a, b, c] = layout.items;
    expect(a.y).toBe(b.y);
    expect(a.height).toBe(80);
    expect(b.x + b.width / 2).toBe(505);
    expect(c.x).toBe(a.x);
    expect(c.height).toBe(40);
    expect(layout.pager).toMatchObject({ width: 410, height: 30 });
    expect(layout.pager!.y + 15).toBe(c.y - c.height / 2 - 10);
  });
});
