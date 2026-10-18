import { Link } from "react-router";
import { pages } from "../pages";
import { Icon } from "../ui";

const packages = [
  {
    name: "core",
    summary: "Asset loading and caching, orthographic scenes, and measured text.",
    page: "scene-assets",
    parts: [
      ["Assets", "AssetStore", "textureAsset", "fontAsset", "jsonAsset", "textAsset"],
      ["React", "AssetProvider", "useAsset", "useAssetProgress", "useOwnedAssetStore"],
      ["Scene", "SceneCanvas", "Camera2D", "Backdrop", "CanvasPanel"],
      ["Text", "wrapText", "paginateText", "revealStops"],
    ],
  },
  {
    name: "ink",
    summary: "Ink story runtime, state, and dialogue rendered in the scene.",
    requires: ["core"],
    page: "dialogue",
    parts: [
      ["Stories", "inkAsset", "inkSourceAsset", "compileInk"],
      ["State", "InkController", "InkProvider", "useInk"],
      ["Dialogue", "DialogueBox", "InkDialogue", "InkStory"],
    ],
  },
  {
    name: "spine",
    summary: "Spine 4.3 skeletons as independently animated sprites.",
    requires: ["core"],
    page: "spine-sprite",
    parts: [
      ["Assets", "spineAsset"],
      ["Sprites", "SpineSprite"],
    ],
  },
  {
    name: "engine",
    summary: "A complete narrative game: scenes and characters driven by Ink tags.",
    requires: ["core", "ink", "spine"],
    page: "narrative-game",
    parts: [
      ["Game", "NarrativeGame", "GameDefinition"],
      ["Stage", "GameStage", "applyStageTags", "collectGameAssets"],
    ],
  },
];

export default function OverviewPage() {
  return (
    <div className="overview">
      <p className="overview-flow">
        <code>core</code> → <code>ink</code> · <code>spine</code> → <code>engine</code>
        <span>Each layer works on its own. Peers: React 19, R3F 9, Three 0.184.</span>
      </p>
      <div className="package-grid">
        {packages.map((pkg) => {
          const page = pages.find((entry) => entry.path === pkg.page)!;
          return (
            <section className="package-card" key={pkg.name} aria-labelledby={`pkg-${pkg.name}`}>
              <h2 id={`pkg-${pkg.name}`}>
                <Icon name={page.icon} />
                @threeframe/{pkg.name}
              </h2>
              <p>{pkg.summary}</p>
              <dl>
                {pkg.parts.map(([part, ...exports]) => (
                  <div key={part}>
                    <dt>{part}</dt>
                    <dd>
                      {exports.map((name) => (
                        <code key={name}>{name}</code>
                      ))}
                    </dd>
                  </div>
                ))}
              </dl>
              <footer>
                <span>
                  {pkg.requires ? `Uses ${pkg.requires.join(", ")}` : "No internal dependencies"}
                </span>
                <Link to={`/${page.path}`}>
                  {page.label} example <Icon name="arrow" size={14} />
                </Link>
              </footer>
            </section>
          );
        })}
      </div>
    </div>
  );
}
