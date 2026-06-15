import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { PALS, useStore } from "../store";
import { Pal } from "./Pal";
import { Lights } from "./Lights";

const VSPREAD = 6.6; // vertical world-distance between consecutive figures
const ROT_PER_PAGE = Math.PI; // how far a figure turns across one scroll page
const LOOK_AT = new THREE.Vector3(0, 1.3, 0); // framing target

export function Scene() {
  const groups = useRef<(THREE.Group | null)[]>([]);
  const dispScroll = useRef(0);
  const dispAzim = useRef(0);
  const camera = useThree((s) => s.camera);

  useFrame((_, dt) => {
    const { scroll, azimuth } = useStore.getState();

    // Buttery smoothing of scroll + orbit (frame-rate independent).
    dispScroll.current += (scroll - dispScroll.current) * (1 - Math.pow(0.0015, dt));
    dispAzim.current += (azimuth - dispAzim.current) * (1 - Math.pow(0.002, dt));

    // Keep the figure framed dead-center, looking slightly down onto the floor.
    camera.lookAt(LOOK_AT);

    for (let i = 0; i < groups.current.length; i++) {
      const g = groups.current[i];
      if (!g) continue;
      const d = i - dispScroll.current;
      const far = Math.abs(d) > 1.35;
      g.visible = !far;
      if (far) continue;

      // Each figure is centered; vertical scroll slides + rotates it. No idle spin.
      g.position.y = d * VSPREAD;
      g.rotation.y = -d * ROT_PER_PAGE + dispAzim.current;
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
