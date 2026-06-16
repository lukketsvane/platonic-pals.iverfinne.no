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
const LIFT = 1.35; // how high the figure floats when tapped

export function Scene() {
  const groups = useRef<(THREE.Group | null)[]>([]);
  const dispScroll = useRef(0);
  const dispAzim = useRef(0);

  // Tap / hover animation state (kept in refs so it never re-renders React).
  const lastTap = useRef(0);
  const lastActive = useRef(0);
  const hoverAmt = useRef(0);
  const hoverVel = useRef(0);
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

    // Scrolling to another figure lands the current one again.
    if (active !== lastActive.current) {
      if (s.hover) s.setHover(false);
      lastActive.current = active;
    }

    // A fresh tap that lands on the centered figure toggles its hover state.
    if (s.tapNonce !== lastTap.current) {
      lastTap.current = s.tapNonce;
      const g = groups.current[active];
      if (g) {
        raycaster.setFromCamera(s.tapNDC as THREE.Vector2, camera);
        if (raycaster.intersectObject(g, true).length > 0) {
          s.setHover(!s.hover);
          wobble.current = 1; // kick off the take-off / retract wobble
          wobbleT.current = 0;
        }
      }
    }

    // Spring the lift: loose & bouncy on take-off, snappy on the way down (SHWOOP).
    const target = s.hover ? 1 : 0;
    const stiff = s.hover ? 130 : 260;
    const damp = s.hover ? 12 : 30;
    hoverVel.current += (stiff * (target - hoverAmt.current) - damp * hoverVel.current) * dt;
    hoverAmt.current += hoverVel.current * dt;

    // Decaying wobble oscillation.
    wobble.current *= Math.exp(-dt * 5.5);
    wobbleT.current += dt;
    const wob = Math.sin(wobbleT.current * 21) * wobble.current;

    for (let i = 0; i < groups.current.length; i++) {
      const g = groups.current[i];
      if (!g) continue;
      const d = i - dispScroll.current;
      const far = Math.abs(d) > 1.35;
      g.visible = !far;
      if (far) continue;

      const isActive = i === active;
      const lift = isActive ? hoverAmt.current * LIFT : 0;
      const float = isActive ? Math.sin(t * 1.5) * 0.06 * hoverAmt.current : 0;

      g.position.y = d * VSPREAD + lift + float;
      g.rotation.y = BASE_YAW - d * ROT_PER_PAGE + dispAzim.current;
      g.rotation.z = isActive ? wob * 0.13 : 0;
      const squash = isActive ? 1 - wob * 0.06 : 1;
      g.scale.set(1 + wob * 0.04 * (isActive ? 1 : 0), squash, 1 + wob * 0.04 * (isActive ? 1 : 0));
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
