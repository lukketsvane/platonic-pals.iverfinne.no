import { useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";

type Props = { url: string; height: number };

/**
 * Loads a .glb, clones it, normalizes it to a target height and re-seats it so
 * the feet rest exactly on y = 0 (the shadow-catching floor).
 */
export function Pal({ url, height }: Props) {
  const { scene } = useGLTF(url);

  const model = useMemo(() => {
    const root = scene.clone(true);

    root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        const m = o as THREE.Mesh;
        m.castShadow = true;
        m.receiveShadow = true;
        m.frustumCulled = false;
        // Crisper wood: keep real PBR materials, just make sure maps stay sharp.
        const mat = m.material as THREE.MeshStandardMaterial;
        if (mat && mat.map) mat.map.anisotropy = 8;
      }
    });

    // Measure, scale to target height, recenter on the floor.
    const box = new THREE.Box3().setFromObject(root);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);

    const s = height / (size.y || 1);
    root.scale.setScalar(s);
    root.position.set(
      -center.x * s,
      -box.min.y * s,
      -center.z * s
    );

    return root;
  }, [scene, height]);

  return <primitive object={model} />;
}

useGLTF.preload("/models/pal_berry.glb");
useGLTF.preload("/models/pal_cone.glb");
useGLTF.preload("/models/pal_pyramid.glb");
useGLTF.preload("/models/pal_dodeca.glb");
