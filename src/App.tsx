import { Suspense, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { useProgress } from "@react-three/drei";
import * as THREE from "three";
import { PALS, useStore } from "./store";
import { Scene } from "./three/Scene";
import { useTheme, type Theme } from "./three/useTheme";
import { useGestures } from "./useGestures";

/**
 * Drives the page background. Instead of a flat white/black, the backdrop is a
 * soft vertical gradient whose hue is a blend of the surrounding sections'
 * accent colours, so it glides elegantly from one figure to the next as you
 * scroll. The accents are only lightly tinted toward white (light) or black
 * (dark) — never pure white or black.
 */
function useBackdrop(theme: Theme) {
  useEffect(() => {
    const N = PALS.length;
    const wrap = (i: number) => ((i % N) + N) % N;
    const accents = PALS.map((p) => new THREE.Color(p.accent));
    const base = new THREE.Color();
    const top = new THREE.Color();
    const bot = new THREE.Color();
    const white = new THREE.Color("#ffffff");
    const black = new THREE.Color("#000000");
    const root = document.documentElement.style;
    let raf = 0;

    const tick = () => {
      const sc = useStore.getState().scroll;
      const fl = Math.floor(sc);
      const f = sc - fl;
      base.copy(accents[wrap(fl)]).lerp(accents[wrap(fl + 1)], f);
      if (theme === "light") {
        top.copy(base).lerp(white, 0.93);
        bot.copy(base).lerp(white, 0.82);
      } else {
        top.copy(base).lerp(black, 0.8);
        bot.copy(base).lerp(black, 0.92);
      }
      root.setProperty("--bg-top", `#${top.getHexString()}`);
      root.setProperty("--bg-bottom", `#${bot.getHexString()}`);
      root.setProperty("--bg", `#${bot.getHexString()}`);
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [theme]);
}

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
  const theme = useTheme();
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);

  useGestures(scroller);
  useEffect(() => setScroller(ref.current), []);
  useBackdrop(theme);

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
