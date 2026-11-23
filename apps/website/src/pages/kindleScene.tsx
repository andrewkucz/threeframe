import { useFrame } from "@react-three/fiber";
import { defineCustomScene, type CustomSceneProps } from "@threeframe/engine";
import { useEffect, useRef } from "react";
import type { Group } from "three";

interface KindleProps {
  embers: number;
}

/** Where ember `i` drifts at `time`, in stage design units. */
const drift = (i: number, time: number) => [
  Math.sin(time * (0.5 + i * 0.13) + i * 2.1) * 360,
  Math.cos(time * (0.4 + i * 0.11) + i * 1.3) * 150 + 60,
];

function Kindle({ props, scene }: CustomSceneProps<KindleProps>) {
  const [caught, setCaught] = scene.useSaved<number[]>("caught", []);
  const [, setCourage] = scene.useVariable<number>("courage");
  const groups = useRef<(Group | null)[]>([]);
  const time = useRef(0);

  useEffect(() => {
    if (!scene.restored) void scene.dialogue("intro");
  }, [scene.handle]);

  useFrame((_, delta) => {
    if (!scene.paused) time.current += delta;
    groups.current.forEach((group, i) => {
      if (!group) return;
      const [x, y] = drift(i, time.current);
      group.position.set(x, y, 30);
      group.scale.setScalar(1 + Math.sin(time.current * 6 + i) * 0.12);
    });
  });

  const catchEmber = async (i: number) => {
    if (scene.paused || scene.talking || caught.includes(i)) return;
    const next = [...caught, i];
    setCaught(next);
    setCourage((value) => value + 1);
    void scene.directive("flash", [], { color: "ffd58a", duration: 0.3 });
    if (next.length === props.embers) {
      await scene.dialogue("lit");
      scene.complete("lit");
    }
  };

  return (
    <>
      {Array.from({ length: props.embers }, (_, i) =>
        caught.includes(i) ? null : (
          <group
            key={i}
            ref={(node) => {
              groups.current[i] = node;
            }}
          >
            <mesh onPointerDown={() => void catchEmber(i)}>
              <circleGeometry args={[26, 24]} />
              <meshBasicMaterial color="#ffb347" transparent opacity={0.35} toneMapped={false} />
            </mesh>
            <mesh>
              <circleGeometry args={[11, 20]} />
              <meshBasicMaterial color="#fff1c4" toneMapped={false} />
            </mesh>
          </group>
        ),
      )}
    </>
  );
}

function KindleOverlay({ props, scene }: CustomSceneProps<KindleProps>) {
  const [caught] = scene.useSaved<number[]>("caught", []);
  return scene.talking ? null : (
    <p className="kindle-count">
      Embers caught: {caught.length} / {props.embers}
    </p>
  );
}

/** A tiny minigame for the demo: click drifting embers to carry the flame up the tower. */
export const kindle = defineCustomScene<KindleProps>({
  id: "kindle",
  name: "Kindle",
  props: { embers: { type: "number", default: 3, min: 1, max: 8 } },
  outcomes: ["lit"],
  knots: ["intro", "lit"],
  Component: Kindle,
  Overlay: KindleOverlay,
});
