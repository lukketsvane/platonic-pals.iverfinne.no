import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useStore } from "../store";
import { useTheme } from "./useTheme";

/**
 * A movable rig of real light sources (no environment / IBL). Two-finger drag
 * slides the whole rig, so the hard shadows swing across the floor while the
 * camera stays perfectly still.
 */
export function Lights() {
  const rig = useRef<THREE.Group>(null);
  const target = useRef(new THREE.Object3D());
  // The light theme gets noticeably brighter light.
  const b = useTheme() === "light" ? 1.4 : 1;

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
      <primitive object={target.current} position={[0, 0.7, 0]} />
      <group ref={rig}>
        {/* 1 — Key: the shadow caster. Hard edges via BasicShadowMap. */}
        <directionalLight
          position={[3.4, 6.2, 4.2]}
          intensity={3.4 * b}
          color={"#fff7ec"}
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
        {/* 2 — Fill: soft, cool, opposite side to round out the form. */}
        <directionalLight
          position={[-4.6, 2.4, 2.6]}
          intensity={0.85 * b}
          color={"#dfe8ff"}
          target={target.current}
        />
        {/* 3 — Rim: warm, from behind, for crisp separation from the ground. */}
        <directionalLight
          position={[-1.5, 4.2, -5.5]}
          intensity={1.5 * b}
          color={"#fff0dc"}
          target={target.current}
        />
        {/* Faint ambient floor so shadow sides keep some readable detail. */}
        <ambientLight intensity={0.22 * b} />
      </group>
    </>
  );
}
