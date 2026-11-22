import { useId, type ReactNode } from "react";
import { Icon } from "../ui";
import type { PropDoc } from "./examples";

export type ControlValue = string | number | boolean;
export interface ControlSpec<T> extends PropDoc {
  key: Extract<keyof T, string>;
  group: string;
  kind: "select" | "range" | "toggle" | "color" | "text";
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  options?: readonly { value: string; label: string }[];
}
export const options = (...values: string[]) => values.map((value) => ({ value, label: value }));

let colorContext: CanvasRenderingContext2D | null | undefined;
/** Normalizes any CSS color through the canvas parser into a swatch hex and an alpha. */
function parseColor(value: string): { hex: string; alpha: number } | null {
  colorContext ??= document.createElement("canvas").getContext("2d");
  if (!colorContext) return null;
  colorContext.fillStyle = "#010203";
  colorContext.fillStyle = value;
  const parsed = colorContext.fillStyle;
  if (parsed === "#010203" && value.trim().toLowerCase() !== "#010203") return null;
  if (parsed.startsWith("#")) return { hex: parsed, alpha: 1 };
  const [r, g, b, a = 1] = parsed.match(/[\d.]+/g)?.map(Number) ?? [];
  const hex = `#${[r, g, b].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
  return { hex, alpha: a };
}
/** Swatch plus free text, so values like rgba() with alpha survive editing. */
function ColorField({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (value: ControlValue) => void;
}) {
  const parsed = parseColor(value);
  return (
    <div className="color-input">
      <input
        type="color"
        aria-label="Pick a color"
        value={parsed?.hex ?? "#000000"}
        onChange={(event) => {
          const hex = event.target.value;
          const alpha = parsed?.alpha ?? 1;
          if (alpha >= 1) onChange(hex);
          else {
            const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
            onChange(`rgba(${r}, ${g}, ${b}, ${alpha})`);
          }
        }}
      />
      <input
        id={id}
        type="text"
        className="text-input"
        aria-describedby={`${id}-help`}
        aria-invalid={parsed ? undefined : true}
        spellCheck={false}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function Control<T>({
  spec,
  value,
  onChange,
}: {
  spec: ControlSpec<T>;
  value: ControlValue;
  onChange: (value: ControlValue) => void;
}) {
  const id = useId();
  return (
    <div className={`control control-${spec.kind}`}>
      <div className="control-label">
        <label htmlFor={id}>
          <code>{spec.name}</code>
        </label>
        {spec.kind === "range" && (
          <output htmlFor={id}>
            {value}
            {spec.unit ? ` ${spec.unit}` : ""}
          </output>
        )}
      </div>
      {spec.kind === "select" ? (
        <select
          id={id}
          aria-describedby={`${id}-help`}
          value={String(value)}
          onChange={(event) => onChange(event.target.value)}
        >
          {spec.options?.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : spec.kind === "toggle" ? (
        <input
          className="toggle-input"
          id={id}
          type="checkbox"
          aria-describedby={`${id}-help`}
          checked={Boolean(value)}
          onChange={(event) => onChange(event.target.checked)}
        />
      ) : spec.kind === "text" ? (
        <input
          className="text-input"
          id={id}
          type="text"
          aria-describedby={`${id}-help`}
          value={String(value)}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : spec.kind === "color" ? (
        <ColorField id={id} value={String(value)} onChange={onChange} />
      ) : (
        <input
          id={id}
          type="range"
          aria-describedby={`${id}-help`}
          min={spec.min}
          max={spec.max}
          step={spec.step ?? 1}
          value={Number(value)}
          onChange={(event) => onChange(Number(event.target.value))}
        />
      )}
      <p id={`${id}-help`} className="control-help">
        {spec.description}
      </p>
    </div>
  );
}

export function Controls<T extends object>({
  specs,
  values,
  onChange,
  onReset,
  collapsible = false,
  preface,
  children,
}: {
  specs: readonly ControlSpec<T>[];
  values: T;
  onChange: (key: Extract<keyof T, string>, value: ControlValue) => void;
  /** Omit to hide the header's Reset button. */
  onReset?: () => void;
  /** Render each group as a disclosure; the first group starts open. */
  collapsible?: boolean;
  /** Rendered as a separate card above the controls, e.g. presets. */
  preface?: ReactNode;
  children?: ReactNode;
}) {
  const groups = [...new Set(specs.map((spec) => spec.group))];
  const panel = (
    <aside className="controls-panel" aria-label="Component controls">
      <div className="controls-header">
        <h2>
          Controls <span>{specs.length}</span>
        </h2>
        {onReset && (
          <button className="text-button" onClick={onReset}>
            <Icon name="reset" size={14} />
            Reset
          </button>
        )}
      </div>
      <div className="controls-body">
        {groups.map((group, index) => {
          const members = specs.filter((spec) => spec.group === group);
          const controls = members.map((spec) => (
            <Control
              key={spec.key}
              spec={spec}
              value={values[spec.key] as ControlValue}
              onChange={(value) => onChange(spec.key, value)}
            />
          ));
          return collapsible ? (
            <details key={group} className="control-group" open={index === 0}>
              <summary>
                {group}
                <span>{members.length}</span>
                <Icon name="chevron" size={13} />
              </summary>
              <fieldset>
                <legend className="sr-only">{group}</legend>
                {controls}
              </fieldset>
            </details>
          ) : (
            <fieldset key={group}>
              <legend>{group}</legend>
              {controls}
            </fieldset>
          );
        })}
        {children}
      </div>
    </aside>
  );
  return preface ? (
    <div className="controls-column">
      {preface}
      {panel}
    </div>
  ) : (
    panel
  );
}
