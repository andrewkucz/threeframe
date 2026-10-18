import { Backdrop, useAsset } from "@threeframe/core";
import { SpineSprite, type SpineSpriteHandle } from "@threeframe/spine";
import { useEffect, useMemo, useRef, useState } from "react";
import { spineboy, spineboyBinary, valley } from "../demo";
import { Controls, options } from "../docs/Controls";
import { CodeBlock, Disclosure, DocsExample, Preview } from "../docs/DocsExample";
import { code, componentExample, jsx, printValue, sceneHost, sharedAssets } from "../docs/examples";
import { spineControls, spineDefaults, spineReference } from "../docs/options";
import { LabScene } from "../LabScene";
import { Icon } from "../ui";

function AnimationCatalog({
  binary,
  onAnimations,
}: {
  binary: boolean;
  onAnimations: (names: string[]) => void;
}) {
  const { data } = useAsset(binary ? spineboyBinary : spineboy);
  useEffect(
    () => onAnimations(data.animations.map((animation) => animation.name)),
    [data, onAnimations],
  );
  return null;
}
export default function SpineSpritePage() {
  const ref = useRef<SpineSpriteHandle>(null);
  const [settings, setSettings] = useState(spineDefaults);
  const [animations, setAnimations] = useState(["idle", "walk", "run", "jump"]);
  const [events, setEvents] = useState<string[]>([]);
  const binary = settings.format === "binary";
  const assets = useMemo(() => [binary ? spineboyBinary : spineboy, valley], [binary]);
  const { format: _format, ...sprite } = settings;
  const props = { ...sprite, position: [0, -270, 0] as [number, number, number] };
  const listener = useMemo(
    () => ({
      start: (entry: { animation: { name: string } | null }) =>
        setEvents((previous) => [`start: ${entry.animation?.name}`, ...previous].slice(0, 5)),
      complete: (entry: { animation: { name: string } | null }) =>
        setEvents((previous) => [`complete: ${entry.animation?.name}`, ...previous].slice(0, 5)),
    }),
    [],
  );
  const specs = spineControls.map((spec) =>
    spec.key === "animation" ? { ...spec, options: options(...animations) } : spec,
  );
  const assetDeclaration = `const spineboy = spineAsset(${printValue({ skeleton: `/assets/spineboy/spineboy-pro.${binary ? "skel" : "json"}`, atlas: "/assets/spineboy/spineboy.atlas", format: binary ? "binary" : "json" })});`;
  const usage = componentExample(
    `import { SpineSprite, spineAsset } from "@threeframe/spine";\n\n${assetDeclaration}`,
    jsx("SpineSprite", { asset: code("spineboy"), ...props }),
  );
  return (
    <div className="docs-layout">
      <div className="example-column">
        <Preview
          label="SpineSprite preview"
          actions={
            <button
              className="text-button"
              onClick={() => ref.current?.play(settings.animation, settings.loop)}
            >
              <Icon name="reset" size={14} />
              Replay
            </button>
          }
          footer={
            <>
              <span className="preview-caption">Spineboy · Spine 4.3</span>
              <button
                className="small-button"
                onClick={() => {
                  ref.current?.play("jump", false);
                  ref.current?.queue(settings.animation, settings.loop);
                }}
              >
                Queue a jump
                <Icon name="arrow" size={14} />
              </button>
            </>
          }
        >
          <LabScene assets={assets}>
            <Backdrop asset={valley} />
            <AnimationCatalog binary={binary} onAnimations={setAnimations} />
            <SpineSprite
              ref={ref}
              asset={binary ? spineboyBinary : spineboy}
              {...props}
              listener={listener}
            />
          </LabScene>
        </Preview>
        <DocsExample
          usage={usage}
          setup={[
            { name: "assets.ts", source: sharedAssets },
            { name: "App.tsx", source: sceneHost({ font: false }) },
          ]}
          reference={spineReference}
          note="Put the JSON or binary skeleton, atlas, and atlas images in public/assets/spineboy. The 4.3 runtime requires matching exports. This wrapper provides the canvas and asset cache."
          recipes={[
            {
              name: "Animation tracks",
              source: `const sprite = useRef<SpineSpriteHandle>(null);\n// Pass ref={sprite} to SpineSprite.\nsprite.current?.play("jump", false);\nsprite.current?.queue(${JSON.stringify(settings.animation)}, ${settings.loop});\nsprite.current?.play("shoot", false, 1);\nsprite.current?.clear(1, ${settings.mixDuration});`,
            },
          ]}
        />
        <Disclosure title="Animation events">
          <CodeBlock
            file={{
              name: "Listen to animations",
              source:
                "<SpineSprite\n  asset={spineboy}\n  listener={{\n    complete: (entry) => console.log(entry.animation?.name),\n    event: (_, event) => console.log(event.data.name),\n  }}\n/>",
            }}
          />
          <ol className="event-list">
            {events.map((event, index) => (
              <li key={`${index}-${event}`}>
                <code>{event}</code>
              </li>
            ))}
          </ol>
        </Disclosure>
      </div>
      <Controls
        specs={specs}
        values={settings}
        onChange={(key, value) => setSettings((previous) => ({ ...previous, [key]: value }))}
        onReset={() => {
          setSettings(spineDefaults);
          setEvents([]);
          ref.current?.play("idle", true);
        }}
      />
    </div>
  );
}
