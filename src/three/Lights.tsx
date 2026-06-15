import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useStore } from "../store";

/**
 * A movable rig of real light sources (no environment / IBL). Two-finger drag
 * slides the whole rig, so the hard shadows swing across the floor while the
 * camera stays perfectly still.
 */
export function Lights() {
  const rig = useRef<THREE.Group>(null);
  const target = useRef(new THREE.Object3D());

  useFrame((_, dt) => {
    const { light } = useStore.getState();
    const g = rig.current;
    if (!g) return;
    const k = 1 - Math.pow(0.0001, dt); // frame-rate independent smoothing
    g.position.x += (light.x - g.position.x) * k;
    g.position.y += (light.y - g.position.y) * k;
  });

  return (
    <>
      <primitive object={target.current} position={[0, 1.2, 0]} />
      <group ref={rig}>
        {/* Key — the shadow caster. Hard edges via BasicShadowMap on the canvas. */}
        <directionalLight
          position={[3.4, 6.2, 4.2]}
          intensity={3.1}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-bias={-0.0004}
          shadow-camera-near={0.5}
          shadow-camera-far={30}
          shadow-camera-left={-7}
          shadow-camera-right={7}
          shadow-camera-top={7}
          shadow-camera-bottom={-7}
          target={target.current}
        />
        {/* Cool fill from the opposite side to model the form. */}
        <directionalLight
          position={[-5, 3.4, 2]}
          intensity={0.9}
          color={"#dfe7ff"}
          target={target.current}
        />
        {/* Warm rim from behind for separation. */}
        <directionalLight
          position={[-1.5, 4, -5.5]}
          intensity={1.2}
          color={"#fff0dc"}
          target={target.current}
        />
        {/* A whisper of ambient so the shadow side never crushes to pure black. */}
        <ambientLight intensity={0.12} />
      </group>
    </>
  );
}
