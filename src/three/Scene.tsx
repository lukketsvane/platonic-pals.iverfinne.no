import { Suspense, useEffect, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { PALS, useStore } from "../store";
import { Pal } from "./Pal";
import { Lights } from "./Lights";

const VSPREAD = 6.6; // vertical world-distance between consecutive figures
const ROT_PER_PAGE = Math.PI; // how far a figure turns across one scroll page
const BASE_YAW = -Math.PI * 0.3; // rest orientation: a 3/4 front view, not side-on
const LOOK_AT = new THREE.Vector3(0, 1.2, 0); // framing target (figure sits lower)
const GROUND_Y = -0.6; // floor (and figures) sit lower in the frame
const LIFT = 0.45; // gentle float once popped — small vertical movement
const TAP_ENERGY = 0.34; // energy added per tap (~3 quick taps to pop)
const ENERGY_DECAY = 3.0; // energy bleeds away fast, so taps must keep a tempo
const WINDOW = 1; // figures kept alive on each side of the active one

const clampIdx = (i: number) => Math.max(0, Math.min(PALS.length - 1, i));

export function Scene() {
  // Only a small window of figures is ever mounted, so the heavy models never
  // pile up in GPU memory (which crashes iOS Safari). `active` drives it.
  const [active, setActive] = useState(0);
  const activeRef = useRef(0);

  const groups = useRef(new Map<number, THREE.Group>());
  const dispScroll = useRef(0);
  const dispAzim = useRef(0);

  // Tap / hover animation state.
  const lastTap = useRef(0);
  const energy = useRef(0); // builds up from rapid taps, decays between them
  const launched = useRef(false); // has it popped & started floating?
  const floatAmt = useRef(0); // 0..1 smoothed float height
  const pop = useRef(0); // short, sharp "pop" impulse (drives the squash)

  const { camera, raycaster } = useThree();

  // Free the geometry/textures of every figure outside the live window.
  useEffect(() => {
    const lo = clampIdx(active - WINDOW);
    const hi = clampIdx(active + WINDOW);
    PALS.forEach((p, i) => {
      if (i < lo || i > hi) useGLTF.clear(p.url);
    });
  }, [active]);

  useFrame((state, dt) => {
    const s = useStore.getState();
    const t = state.clock.elapsedTime;

    dispScroll.current += (s.scroll - dispScroll.current) * (1 - Math.pow(0.0015, dt));
    dispAzim.current += (s.azimuth - dispAzim.current) * (1 - Math.pow(0.002, dt));
    camera.lookAt(LOOK_AT);

    const a = clampIdx(Math.round(dispScroll.current));
    if (a !== activeRef.current) {
      activeRef.current = a;
      launched.current = false; // scrolling away lands the previous figure
      energy.current = 0;
      setActive(a); // remount the window around the new figure
    }

    // Energy bleeds away, so you have to tap-tap-tap within a tempo to build it.
    energy.current *= Math.exp(-dt * ENERGY_DECAY);

    // A fresh tap on the centered figure.
    if (s.tapNonce !== lastTap.current) {
      lastTap.current = s.tapNonce;
      const g = groups.current.get(activeRef.current);
      if (g) {
        raycaster.setFromCamera(s.tapNDC as THREE.Vector2, camera);
        if (raycaster.intersectObject(g, true).length > 0) {
          if (launched.current) {
            // Tap again while floating -> settle gently back down.
            launched.current = false;
            energy.current = 0;
            pop.current = Math.max(pop.current, 0.3);
          } else {
            energy.current += TAP_ENERGY;
            pop.current = Math.max(pop.current, 0.28); // tiny tick per tap
            if (energy.current >= 1) {
              launched.current = true; // it (almost) pops...
              energy.current = 0;
              pop.current = 1; // ...with a sharp little squash
            }
          }
        }
      }
    }

    // Float height: a slow rise once launched, a slightly quicker settle down.
    const target = launched.current ? 1 : 0;
    const rising = target > floatAmt.current;
    floatAmt.current +=
      (target - floatAmt.current) * (1 - Math.pow(rising ? 0.5 : 0.16, dt));

    // The pop is a short, sharp impulse that barely lifts but reads as a punch.
    pop.current *= Math.exp(-dt * 7);

    groups.current.forEach((g, i) => {
      // d > 0 once scrolled past: figure rises and exits the top while the next
      // enters from below — i.e. normal scrolling.
      const d = dispScroll.current - i;
      const isActive = i === activeRef.current;
      // Pop barely moves it vertically; the float carries it slowly upward.
      const lift = isActive ? floatAmt.current * LIFT + pop.current * 0.08 : 0;
      const bob = isActive ? Math.sin(t * 1.3) * 0.03 * floatAmt.current : 0;

      g.position.y = GROUND_Y + d * VSPREAD + lift + bob;
      g.rotation.y = BASE_YAW + d * ROT_PER_PAGE + dispAzim.current;
      g.rotation.z = 0;
      const p = isActive ? pop.current : 0;
      g.scale.set(1 - p * 0.06, 1 + p * 0.1, 1 - p * 0.06);
    });
  });

  // The indices currently kept alive around the active figure.
  const lo = clampIdx(active - WINDOW);
  const hi = clampIdx(active + WINDOW);
  const live: number[] = [];
  for (let i = lo; i <= hi; i++) live.push(i);

  return (
    <>
      <Lights />

      {/* Shadow-only floor: no tone/value on the ground, just the hard shadow. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, GROUND_Y, 0]} receiveShadow>
        <planeGeometry args={[80, 80]} />
        <shadowMaterial transparent opacity={0.34} color="#000000" />
      </mesh>

      {live.map((i) => (
        <group
          key={PALS[i].id}
          ref={(el) => {
            if (el) groups.current.set(i, el);
            else groups.current.delete(i);
          }}
        >
          <Suspense fallback={null}>
            <Pal url={PALS[i].url} height={PALS[i].height} />
          </Suspense>
        </group>
      ))}
    </>
  );
}
