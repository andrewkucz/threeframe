import { useId, type ReactNode } from "react";
import { Icon } from "../ui";
import type { PropDoc } from "./examples";

export type ControlValue = string | number | boolean;
export interface ControlSpec<T> extends PropDoc {
  key: Extract<keyof T, string>;
  group: string;
  kind: "select" | "range" | "toggle" | "color";
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  options?: readonly { value: string; label: string }[];
}
export const options = (...values: string[]) => values.map((value) => ({ value, label: value }));

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
      ) : spec.kind === "color" ? (
        <div className="color-input">
          <input
            id={id}
            type="color"
            aria-describedby={`${id}-help`}
            value={String(value)}
            onChange={(event) => onChange(event.target.value)}
          />
          <span>{value}</span>
        </div>
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
  children,
}: {
  specs: readonly ControlSpec<T>[];
  values: T;
  onChange: (key: Extract<keyof T, string>, value: ControlValue) => void;
  onReset: () => void;
  children?: ReactNode;
}) {
  const groups = [...new Set(specs.map((spec) => spec.group))];
  return (
    <aside className="controls-panel" aria-label="Component controls">
      <div className="controls-header">
        <h2>
          Controls <span>{specs.length}</span>
        </h2>
        <button className="text-button" onClick={onReset}>
          <Icon name="reset" size={14} />
          Reset
        </button>
      </div>
      <div className="controls-body">
        {groups.map((group) => (
          <fieldset key={group}>
            <legend>{group}</legend>
            {specs
              .filter((spec) => spec.group === group)
              .map((spec) => (
                <Control
                  key={spec.key}
                  spec={spec}
                  value={values[spec.key] as ControlValue}
                  onChange={(value) => onChange(spec.key, value)}
                />
              ))}
          </fieldset>
        ))}
        {children}
      </div>
    </aside>
  );
}
