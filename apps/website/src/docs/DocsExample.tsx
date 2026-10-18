import { useId, useRef, useState, type ReactNode } from "react";
import { Icon } from "../ui";
import type { ExampleFile, PropDoc } from "./examples";

/** React escapes every token; source text is never injected as HTML. */
function Highlight({ source }: { source: string }) {
  const tokens = source.split(
    /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\/\/[^\n]*|\b(?:import|from|export|default|function|return|const|let|type|async|await|new|if|throw|true|false|undefined|null)\b|\b\d+(?:\.\d+)?\b)/g,
  );
  return (
    <>
      {tokens.map((token, index) => {
        const kind = token.startsWith("//")
          ? "comment"
          : /^["']/.test(token)
            ? "string"
            : /^\d/.test(token)
              ? "number"
              : /^(import|from|export|default|function|return|const|let|type|async|await|new|if|throw|true|false|undefined|null)$/.test(
                    token,
                  )
                ? "keyword"
                : "plain";
        return (
          <span className={`token-${kind}`} key={index}>
            {token}
          </span>
        );
      })}
    </>
  );
}

export function CodeBlock({ file }: { file: ExampleFile }) {
  const [copied, setCopied] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const content = useRef<HTMLElement>(null);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(file.source);
      setCopied(file.source);
      setFailed(false);
    } catch {
      setFailed(true);
      const selection = window.getSelection();
      if (content.current && selection) {
        const range = document.createRange();
        range.selectNodeContents(content.current);
        selection.removeAllRanges();
        selection.addRange(range);
      }
    }
  };
  return (
    <div className="code-file">
      <div className="code-file-header">
        <span>
          <Icon name="code" size={15} />
          {file.name}
        </span>
        <button
          className="text-button"
          onClick={() => void copy()}
          aria-label={`Copy ${file.name}`}
        >
          <Icon name={copied === file.source ? "check" : "copy"} size={14} />
          {copied === file.source ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="code-content" tabIndex={0} aria-label={`${file.name} code`}>
        <code ref={content}>
          {file.language === "ink" ? file.source : <Highlight source={file.source} />}
        </code>
      </pre>
      <span className={failed ? "copy-message" : "sr-only"} role="status">
        {failed
          ? "Clipboard unavailable. The code is selected; use your browser’s copy command."
          : copied === file.source
            ? `${file.name} copied.`
            : ""}
      </span>
    </div>
  );
}

export function DocsExample({
  usage,
  setup,
  reference,
  note,
  recipes,
}: {
  usage: string;
  setup: ExampleFile[];
  reference: readonly PropDoc[];
  note: string;
  recipes?: ExampleFile[];
}) {
  const [tab, setTab] = useState("usage");
  const id = useId();
  const tabs = [
    { id: "usage", label: "Usage" },
    { id: "setup", label: "Setup" },
    { id: "reference", label: "Prop reference" },
  ];
  return (
    <section className="docs-example" aria-label="Component documentation">
      <div className="example-tabs">
        <div role="tablist" aria-label="Example documentation">
          {tabs.map((item, index) => (
            <button
              key={item.id}
              role="tab"
              id={`${id}-${item.id}`}
              aria-selected={tab === item.id}
              aria-controls={`${id}-panel`}
              tabIndex={tab === item.id ? 0 : -1}
              onClick={() => setTab(item.id)}
              onKeyDown={(event) => {
                let next: number | undefined;
                if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
                else if (event.key === "ArrowLeft") next = (index + tabs.length - 1) % tabs.length;
                else if (event.key === "Home") next = 0;
                else if (event.key === "End") next = tabs.length - 1;
                if (next !== undefined) {
                  event.preventDefault();
                  setTab(tabs[next].id);
                  document.getElementById(`${id}-${tabs[next].id}`)?.focus();
                }
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
        <span className="sync-note">
          <i /> Synced with controls
        </span>
      </div>
      <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${tab}`} tabIndex={0}>
        {tab === "usage" ? (
          <CodeBlock file={{ name: "Example.tsx", source: usage }} />
        ) : tab === "setup" ? (
          <div className="setup-files">
            <p className="docs-note">{note}</p>
            {setup.map((file) => (
              <CodeBlock key={file.name} file={file} />
            ))}
          </div>
        ) : (
          <>
            <div className="reference-scroll">
              <table className="prop-table">
                <caption>
                  Defaults are from the package API; the controls show this example’s current
                  values.
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Prop / option</th>
                    <th scope="col">Default</th>
                    <th scope="col">Description</th>
                  </tr>
                </thead>
                <tbody>
                  {reference.map((prop) => (
                    <tr key={prop.name}>
                      <th scope="row">
                        <code>{prop.name}</code>
                        <small>{prop.type}</small>
                      </th>
                      <td>
                        <code>{prop.defaultValue}</code>
                      </td>
                      <td>
                        {prop.description}
                        {prop.example && <code className="prop-example">{prop.example}</code>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {recipes?.map((file) => (
              <CodeBlock key={file.name} file={file} />
            ))}
          </>
        )}
      </div>
    </section>
  );
}

export function Preview({
  children,
  actions,
  footer,
  label = "Live preview",
}: {
  children: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
  label?: string;
}) {
  return (
    <section className="preview-card" aria-label={label}>
      <div className="preview-header">
        <span>
          <i className="live-dot" />
          {label}
        </span>
        <div className="preview-actions">{actions}</div>
      </div>
      {children}
      {footer && <div className="preview-footer">{footer}</div>}
    </section>
  );
}

export function Disclosure({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="docs-disclosure">
      <summary>
        {title}
        <Icon name="chevron" size={14} />
      </summary>
      <div className="disclosure-content">{children}</div>
    </details>
  );
}
