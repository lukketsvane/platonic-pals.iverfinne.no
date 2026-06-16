import { Suspense, useEffect, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { useProgress } from "@react-three/drei";
import * as THREE from "three";
import { PALS } from "./store";
import { Scene } from "./three/Scene";
import { useTheme } from "./three/useTheme";
import { useGestures } from "./useGestures";

function Veil() {
  const { active } = useProgress();
  const [gone, setGone] = useState(false);

  useEffect(() => {
    if (!active) {
      const t = setTimeout(() => setGone(true), 400);
      return () => clearTimeout(t);
    }
  }, [active]);

  if (gone) return null;
  return (
    <div className={`veil ${active ? "" : "hidden"}`}>
      <div className="dot" />
    </div>
  );
}

export default function App() {
  const theme = useTheme();
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);

  useGestures(scroller);
  useEffect(() => setScroller(ref.current), []);

  const bg = theme === "dark" ? "#000000" : "#ffffff";

  return (
    <>
      <div className="stage">
        <Canvas
          shadows="basic"
          dpr={0.25}
          gl={{
            antialias: false,
            toneMapping: THREE.ACESFilmicToneMapping,
            toneMappingExposure: 1.25,
            powerPreference: "high-performance",
          }}
          camera={{ position: [0, 1.5, 9.6], fov: 30, near: 0.1, far: 100 }}
        >
          <color attach="background" args={[bg]} />
          <Suspense fallback={null}>
            <Scene />
          </Suspense>
        </Canvas>
      </div>

      {/* Native vertical paging: one snap page per figure. */}
      <div className="scroller" ref={ref}>
        {PALS.map((p) => (
          <section className="page" key={p.id} aria-label={p.name} />
        ))}
      </div>

      <Veil />
    </>
  );
}
