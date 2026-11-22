import { useId, useRef, useState } from "react";
import { Icon } from "../ui";

export interface PresetOption {
  id: string;
  name: string;
  description: string;
}

/** Preset picker with clipboard export and textarea import. Rendered above the controls. */
export function Presets({
  presets,
  selected,
  importedName,
  modified,
  exportText,
  onSelect,
  onImport,
  onRestore,
}: {
  presets: readonly PresetOption[];
  /** Id of the preset the settings started from, or null for an imported preset. */
  selected: string | null;
  importedName?: string | null;
  modified: boolean;
  exportText: () => string;
  onSelect: (id: string) => void;
  /** Applies the text, returning warnings to show; throws when nothing could be applied. */
  onImport: (text: string) => string[];
  /** Re-applies the selected preset, discarding tweaks. */
  onRestore: () => void;
}) {
  const id = useId();
  const [mode, setMode] = useState<"idle" | "import" | "export">("idle");
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState<{ tone: "ok" | "warn" | "error"; text: string } | null>(
    null,
  );
  const area = useRef<HTMLTextAreaElement>(null);
  const current = presets.find((preset) => preset.id === selected);

  const copy = async () => {
    const text = exportText();
    try {
      await navigator.clipboard.writeText(text);
      setMode("idle");
      setStatus({ tone: "ok", text: "Preset JSON copied." });
    } catch {
      // Clipboard can be unavailable (permissions, insecure origin): show the text instead.
      setDraft(text);
      setMode("export");
      setStatus({ tone: "warn", text: "Clipboard unavailable. Copy the selected JSON below." });
      requestAnimationFrame(() => area.current?.select());
    }
  };
  const apply = () => {
    try {
      const warnings = onImport(draft);
      setMode("idle");
      setDraft("");
      setStatus(
        warnings.length
          ? {
              tone: "warn",
              text: `Imported with ${warnings.length} warning(s): ${warnings.join(" ")}`,
            }
          : { tone: "ok", text: "Preset imported." },
      );
    } catch (error) {
      setStatus({ tone: "error", text: error instanceof Error ? error.message : String(error) });
    }
  };

  return (
    <section className="presets" aria-labelledby={`${id}-title`}>
      <div className="presets-header">
        <h2 id={`${id}-title`}>Presets</h2>
        <div className="presets-actions">
          <button className="text-button" onClick={() => void copy()}>
            <Icon name="copy" size={13} />
            Export
          </button>
          <button
            className="text-button"
            aria-expanded={mode === "import"}
            onClick={() => {
              setMode(mode === "import" ? "idle" : "import");
              setDraft("");
              setStatus(null);
            }}
          >
            Import
          </button>
        </div>
      </div>
      <label className="sr-only" htmlFor={`${id}-select`}>
        Preset
      </label>
      <div className="presets-picker">
        <select
          id={`${id}-select`}
          value={selected ?? ""}
          aria-describedby={`${id}-help`}
          onChange={(event) => {
            onSelect(event.target.value);
            setStatus(null);
          }}
        >
          {selected === null && (
            <option value="">
              {importedName || "Imported preset"}
              {modified ? " (modified)" : ""}
            </option>
          )}
          {presets.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.name}
              {preset.id === selected && modified ? " (modified)" : ""}
            </option>
          ))}
        </select>
        <button
          className="icon-button"
          disabled={!modified}
          aria-label="Restore preset"
          title={modified ? "Restore preset, discarding changes" : "No changes to restore"}
          onClick={() => {
            onRestore();
            setStatus(null);
          }}
        >
          <Icon name="reset" size={14} />
        </button>
      </div>
      <p id={`${id}-help`} className="control-help">
        {modified
          ? selected === null
            ? "Tweaked from the imported preset. ↺ restores it."
            : "Tweaked from this preset. ↺ restores it."
          : (current?.description ?? "Loaded from JSON.")}
      </p>
      {mode !== "idle" && (
        <div className="presets-editor">
          <label className="sr-only" htmlFor={`${id}-json`}>
            {mode === "import" ? "Preset JSON to import" : "Exported preset JSON"}
          </label>
          <textarea
            id={`${id}-json`}
            ref={area}
            className="source-editor presets-json"
            value={draft}
            readOnly={mode === "export"}
            spellCheck={false}
            placeholder='{ "name": "My preset", "preset": { "theme": { "accentColor": "#ff8fb1" } } }'
            onChange={(event) => setDraft(event.target.value)}
          />
          <div className="presets-editor-actions">
            <button className="small-button" onClick={() => setMode("idle")}>
              {mode === "import" ? "Cancel" : "Done"}
            </button>
            {mode === "import" && (
              <button className="primary-button" disabled={!draft.trim()} onClick={apply}>
                Apply
              </button>
            )}
          </div>
        </div>
      )}
      {status && (
        <p className={`presets-status presets-status-${status.tone}`} role="status">
          {status.text}
        </p>
      )}
    </section>
  );
}
