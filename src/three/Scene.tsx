import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { PALS, useStore } from "../store";
import { Pal } from "./Pal";
import { Lights } from "./Lights";
import { Theme } from "./useTheme";

const VSPREAD = 6.2; // vertical world-distance between consecutive figures
const SPIN_SPEED = 0.16; // autonomous spin around the vertical axis (rad/s)

export function Scene({ theme }: { theme: Theme }) {
  const groups = useRef<(THREE.Group | null)[]>([]);
  const spin = useRef(0);
  const dispScroll = useRef(0);
  const dispAzim = useRef(0);

  useFrame((_, dt) => {
    const { scroll, azimuth } = useStore.getState();
    spin.current += dt * SPIN_SPEED;

    // Smooth the scroll + orbit for that buttery transition.
    const k = 1 - Math.pow(0.0015, dt);
    dispScroll.current += (scroll - dispScroll.current) * k;
    dispAzim.current += (azimuth - dispAzim.current) * (1 - Math.pow(0.002, dt));

    const rot = spin.current + dispAzim.current;

    for (let i = 0; i < groups.current.length; i++) {
      const g = groups.current[i];
      if (!g) continue;
      const d = i - dispScroll.current;
      const far = Math.abs(d) > 1.35;
      g.visible = !far;
      if (far) continue;

      g.position.y = d * VSPREAD;
      g.rotation.y = rot;
      // Outgoing figures ease back slightly for depth during the hand-off.
      const s = 1 - Math.min(Math.abs(d), 1) * 0.12;
      g.scale.setScalar(s);
    }
  });

  const floor = theme === "dark" ? "#000000" : "#ffffff";

  return (
    <>
      <Lights />

      {/* Real ground plane, tinted to the background, catching hard shadows. */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0, 0]}
        receiveShadow
      >
        <planeGeometry args={[80, 80]} />
        <meshStandardMaterial color={floor} roughness={0.92} metalness={0} />
      </mesh>

      {PALS.map((p, i) => (
        <group key={p.id} ref={(el) => (groups.current[i] = el)}>
          <Pal url={p.url} height={p.height} />
        </group>
      ))}
    </>
  );
}
