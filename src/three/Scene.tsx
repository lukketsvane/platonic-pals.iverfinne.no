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
const LIFT = 1.35; // how high the figure floats at full charge
const TAP_STEP = 0.2; // charge added per tap — ~5 taps to fully lift off
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
  const charge = useRef(0);
  const chargeTo = useRef(0);
  const chargeVel = useRef(0);
  const wobble = useRef(0);
  const wobbleT = useRef(0);

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
      chargeTo.current = 0; // scrolling away lands the previous figure
      setActive(a); // remount the window around the new figure
    }

    // Each tap on the centered figure nudges it a little higher; once fully
    // hovering, a further tap eases it back down. Takes several taps.
    if (s.tapNonce !== lastTap.current) {
      lastTap.current = s.tapNonce;
      const g = groups.current.get(activeRef.current);
      if (g) {
        raycaster.setFromCamera(s.tapNDC as THREE.Vector2, camera);
        if (raycaster.intersectObject(g, true).length > 0) {
          chargeTo.current =
            chargeTo.current >= 0.999 ? 0 : Math.min(1, chargeTo.current + TAP_STEP);
          wobble.current = Math.max(wobble.current, 0.4);
          wobbleT.current = 0;
        }
      }
    }

    // Gentle, critically-damped spring toward the target — smooth, no bounce.
    chargeVel.current +=
      (42 * (chargeTo.current - charge.current) - 13 * chargeVel.current) * dt;
    charge.current += chargeVel.current * dt;

    // Soft, slowly-decaying wobble.
    wobble.current *= Math.exp(-dt * 4);
    wobbleT.current += dt;
    const wob = Math.sin(wobbleT.current * 16) * wobble.current;

    groups.current.forEach((g, i) => {
      const d = i - dispScroll.current;
      const isActive = i === activeRef.current;
      const lift = isActive ? charge.current * LIFT : 0;
      const float = isActive ? Math.sin(t * 1.3) * 0.045 * charge.current : 0;

      g.position.y = d * VSPREAD + lift + float;
      g.rotation.y = BASE_YAW - d * ROT_PER_PAGE + dispAzim.current;
      g.rotation.z = isActive ? wob * 0.05 : 0;
      const squash = isActive ? 1 - wob * 0.025 : 1;
      const widen = isActive ? 1 + wob * 0.015 : 1;
      g.scale.set(widen, squash, widen);
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
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
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
