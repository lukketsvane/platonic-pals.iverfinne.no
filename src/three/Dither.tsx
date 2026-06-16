import { useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useFBO } from "@react-three/drei";
import * as THREE from "three";

/**
 * Global post-process. Everything — the patterned backdrop, the figures and
 * the spark dust — is rendered into an offscreen buffer and then run through a
 * single fullscreen pass that applies:
 *
 *   - ordered (Bayer) dither posterization → a unifying halftone/dither look,
 *   - a faint hand-drawn edge "ink" (Sobel) so the figures read as sketched,
 *   - a touch of animated grain, like the airbrushed reference art.
 *
 * Because it samples the rendered frame, it dithers the figures too, not just
 * the background. It takes over the render loop (useFrame priority 1).
 */
export function Dither() {
  const { gl, scene, camera } = useThree();
  const target = useFBO({ depthBuffer: true, stencilBuffer: false });

  const [postScene, postCam, material] = useMemo(() => {
    const uniforms = {
      tDiffuse: { value: null as THREE.Texture | null },
      uRes: { value: new THREE.Vector2(1, 1) },
      uTime: { value: 0 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms,
      depthTest: false,
      depthWrite: false,
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform vec2 uRes;
        uniform float uTime;
        varying vec2 vUv;

        // The buffer is linear; sample and convert to display (sRGB) space.
        vec3 samp(vec2 uv) { return pow(texture2D(tDiffuse, uv).rgb, vec3(1.0 / 2.2)); }

        float bayer4x4(vec2 p) {
          vec2 t = floor(mod(p, 4.0));
          float v = mod(t.x, 2.0) * 8.0 + mod(t.y, 2.0) * 4.0
                  + mod(floor(t.x / 2.0), 2.0) * 2.0
                  + mod(floor(t.y / 2.0), 2.0);
          return (v + 0.5) / 16.0;
        }
        float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

        void main() {
          vec2 uv = vUv;
          vec2 px = 1.0 / uRes;
          vec3 c = samp(uv);

          // Hand-drawn edge ink: Sobel-ish luminance gradient.
          float lx = luma(samp(uv + vec2(px.x, 0.0))) - luma(samp(uv - vec2(px.x, 0.0)));
          float ly = luma(samp(uv + vec2(0.0, px.y))) - luma(samp(uv - vec2(0.0, px.y)));
          float edge = clamp(length(vec2(lx, ly)) * 2.2, 0.0, 1.0);
          c = mix(c, c * 0.5, edge * 0.35);

          // Ordered-dither posterization (the unifying halftone).
          float d = bayer4x4(gl_FragCoord.xy);
          float levels = 5.0;
          c += (d - 0.5) / levels;
          c = floor(c * levels + 0.5) / levels;

          // Faint animated grain.
          float g = fract(sin(dot(floor(gl_FragCoord.xy) + floor(uTime * 50.0),
                    vec2(12.9898, 78.233))) * 43758.5453);
          c += (g - 0.5) * 0.04;

          gl_FragColor = vec4(c, 1.0);
        }
      `,
    });
    const s = new THREE.Scene();
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
    mesh.frustumCulled = false;
    s.add(mesh);
    const cam = new THREE.Camera();
    return [s, cam, mat];
  }, []);

  useFrame((_, dt) => {
    // Render the whole scene into the offscreen buffer in linear space (the
    // post shader does the sRGB conversion so figures and backdrop match)...
    target.texture.colorSpace = THREE.LinearSRGBColorSpace;
    material.uniforms.tDiffuse.value = target.texture;
    material.uniforms.uRes.value.set(target.width, target.height);
    material.uniforms.uTime.value += dt;

    gl.setRenderTarget(target);
    gl.render(scene, camera);
    // ...then dither it to the screen.
    gl.setRenderTarget(null);
    gl.render(postScene, postCam);
  }, 1);

  return null;
}
