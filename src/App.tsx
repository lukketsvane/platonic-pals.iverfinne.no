import { Suspense, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { useProgress } from "@react-three/drei";
import * as THREE from "three";
import { PALS, useStore } from "./store";
import { Scene } from "./three/Scene";
import { Dither } from "./three/Dither";
import { useGestures } from "./useGestures";

/** Pixelated editorial HUD: wordmark, index counter, big figure name. */
function Hud() {
  const scroll = useStore((s) => s.scroll);
  // Continuous scroll loops past the ends, so fold it back onto a real figure.
  const i = ((Math.round(scroll) % PALS.length) + PALS.length) % PALS.length;
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    <div className="hud">
      <div className="hud-top">PLATONIC&nbsp;PALS</div>
      <div className="hud-bottom">
        <div className="hud-idx">
          {pad(i + 1)}
          <span>&nbsp;/&nbsp;{pad(PALS.length)}</span>
        </div>
        <div className="hud-name">{PALS[i].name}</div>
      </div>
    </div>
  );
}

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
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);

  useGestures(scroller);
  useEffect(() => setScroller(ref.current), []);

  // Start on the first real page (page index 1) — page 0 is the leading clone
  // of the last figure that makes the upward wrap seamless.
  useLayoutEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.clientHeight;
  }, []);

  return (
    <>
      <div className="stage">
        {/* Transparent canvas so the gradient backdrop shows through. */}
        <Canvas
          shadows="basic"
          dpr={0.5}
          gl={{
            alpha: true,
            antialias: false,
            toneMapping: THREE.ACESFilmicToneMapping,
            toneMappingExposure: 1.25,
            powerPreference: "high-performance",
          }}
          camera={{ position: [0, 1.5, 9.6], fov: 30, near: 0.1, far: 100 }}
        >
          <Suspense fallback={null}>
            <Scene />
          </Suspense>
          {/* Global dither / halftone post-process over the whole frame. */}
          <Dither />
        </Canvas>
      </div>

      {/* Native vertical paging: one snap page per figure, plus a clone of the
          last figure before and the first after so scrolling loops forever. */}
      <div className="scroller" ref={ref}>
        <section className="page" aria-hidden="true" />
        {PALS.map((p) => (
          <section className="page" key={p.id} aria-label={p.name} />
        ))}
        <section className="page" aria-hidden="true" />
      </div>

      <Hud />
      <Veil />
    </>
  );
}
