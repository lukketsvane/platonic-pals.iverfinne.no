import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
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

export function Scene() {
  const groups = useRef<(THREE.Group | null)[]>([]);
  const dispScroll = useRef(0);
  const dispAzim = useRef(0);

  // Tap / hover animation state (kept in refs so it never re-renders React).
  const lastTap = useRef(0);
  const lastActive = useRef(0);
  const charge = useRef(0); // smoothed lift amount (0..1)
  const chargeTo = useRef(0); // target lift the taps are building toward
  const chargeVel = useRef(0);
  const wobble = useRef(0);
  const wobbleT = useRef(0);

  const { camera, raycaster } = useThree();

  useFrame((state, dt) => {
    const s = useStore.getState();
    const t = state.clock.elapsedTime;

    dispScroll.current += (s.scroll - dispScroll.current) * (1 - Math.pow(0.0015, dt));
    dispAzim.current += (s.azimuth - dispAzim.current) * (1 - Math.pow(0.002, dt));
    camera.lookAt(LOOK_AT);

    const active = Math.max(0, Math.min(PALS.length - 1, Math.round(dispScroll.current)));

    // Scrolling to another figure gently lands the current one again.
    if (active !== lastActive.current) {
      chargeTo.current = 0;
      lastActive.current = active;
    }

    // Each tap on the centered figure nudges it a little higher; once it is
    // fully hovering, a further tap eases it back down. Takes several taps.
    if (s.tapNonce !== lastTap.current) {
      lastTap.current = s.tapNonce;
      const g = groups.current[active];
      if (g) {
        raycaster.setFromCamera(s.tapNDC as THREE.Vector2, camera);
        if (raycaster.intersectObject(g, true).length > 0) {
          chargeTo.current =
            chargeTo.current >= 0.999 ? 0 : Math.min(1, chargeTo.current + TAP_STEP);
          wobble.current = Math.max(wobble.current, 0.4); // subtle nudge
          wobbleT.current = 0;
        }
      }
    }

    // Gentle, critically-damped spring toward the target — smooth, no bounce.
    const stiff = 42;
    const damp = 13;
    chargeVel.current += (stiff * (chargeTo.current - charge.current) - damp * chargeVel.current) * dt;
    charge.current += chargeVel.current * dt;

    // Soft, slowly-decaying wobble.
    wobble.current *= Math.exp(-dt * 4);
    wobbleT.current += dt;
    const wob = Math.sin(wobbleT.current * 16) * wobble.current;

    for (let i = 0; i < groups.current.length; i++) {
      const g = groups.current[i];
      if (!g) continue;
      const d = i - dispScroll.current;
      const far = Math.abs(d) > 1.35;
      g.visible = !far;
      if (far) continue;

      const isActive = i === active;
      const lift = isActive ? charge.current * LIFT : 0;
      const float = isActive ? Math.sin(t * 1.3) * 0.045 * charge.current : 0;

      g.position.y = d * VSPREAD + lift + float;
      g.rotation.y = BASE_YAW - d * ROT_PER_PAGE + dispAzim.current;
      g.rotation.z = isActive ? wob * 0.05 : 0;
      const squash = isActive ? 1 - wob * 0.025 : 1;
      const widen = isActive ? 1 + wob * 0.015 : 1;
      g.scale.set(widen, squash, widen);
    }
  });

  return (
    <>
      <Lights />

      {/* Shadow-only floor: no tone/value on the ground, just the hard shadow. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[80, 80]} />
        <shadowMaterial transparent opacity={0.34} color="#000000" />
      </mesh>

      {PALS.map((p, i) => (
        <group key={p.id} ref={(el) => (groups.current[i] = el)}>
          <Pal url={p.url} height={p.height} />
        </group>
      ))}
    </>
  );
}
