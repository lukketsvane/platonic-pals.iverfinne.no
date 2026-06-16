import { useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useFBO } from "@react-three/drei";
import * as THREE from "three";

/**
 * Global post-process. The whole scene is rendered to an offscreen buffer and
 * then composited through several passes:
 *
 *   1. bright-pass → blur → bloom, so the lit figures glow and pop off the busy
 *      patterned backdrops,
 *   2. a vignette that focuses the centred figure,
 *   3. a faint hand-drawn edge "ink" on the figures,
 *   4. LAYERED dithering — two ordered (Bayer) scales plus blue-noise — then a
 *      posterize, for a rich halftone,
 *   5. animated grain.
 *
 * Everything runs at the low-res buffer; the crisp nearest-neighbor upscale
 * (CSS `image-rendering: pixelated`) is the final layer on top, so the whole
 * frame — figures included — reads as pixelated.
 */
const VERT = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

export function Dither() {
  const { gl, scene, camera, size, viewport } = useThree();
  const dpr = viewport.dpr;
  const w = Math.max(2, Math.floor(size.width * dpr));
  const h = Math.max(2, Math.floor(size.height * dpr));
  const bw = Math.max(2, Math.floor(w / 2));
  const bh = Math.max(2, Math.floor(h / 2));

  // Main buffer carries a depth texture so the post pass can tell figures
  // (which write depth) from the backdrop/glitter/floor (which don't).
  const main = useMemo(() => {
    const t = new THREE.WebGLRenderTarget(w, h, { depthBuffer: true, stencilBuffer: false });
    t.depthTexture = new THREE.DepthTexture(w, h);
    return t;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const bloomA = useFBO(bw, bh, { depthBuffer: false, stencilBuffer: false });
  const bloomB = useFBO(bw, bh, { depthBuffer: false, stencilBuffer: false });

  const ctx = useMemo(() => {
    const quadGeo = new THREE.PlaneGeometry(2, 2);
    const scn = new THREE.Scene();
    const cam = new THREE.Camera();
    const mesh = new THREE.Mesh(quadGeo);
    mesh.frustumCulled = false;
    scn.add(mesh);

    // Bright-pass: keep only the brightest highlights for the bloom.
    const bright = new THREE.ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      uniforms: { tDiffuse: { value: null as THREE.Texture | null } },
      vertexShader: VERT,
      fragmentShader: `
        uniform sampler2D tDiffuse;
        varying vec2 vUv;
        void main() {
          vec3 c = texture2D(tDiffuse, vUv).rgb;
          float l = dot(c, vec3(0.299, 0.587, 0.114));
          gl_FragColor = vec4(c * smoothstep(0.55, 1.1, l), 1.0);
        }
      `,
    });

    // Separable Gaussian blur.
    const blur = new THREE.ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tDiffuse: { value: null as THREE.Texture | null },
        uDir: { value: new THREE.Vector2(1, 0) },
        uRes: { value: new THREE.Vector2(1, 1) },
      },
      vertexShader: VERT,
      fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform vec2 uDir;
        uniform vec2 uRes;
        varying vec2 vUv;
        void main() {
          vec2 o = uDir / uRes;
          vec3 s = texture2D(tDiffuse, vUv).rgb * 0.227;
          s += texture2D(tDiffuse, vUv + o * 1.0).rgb * 0.316;
          s += texture2D(tDiffuse, vUv - o * 1.0).rgb * 0.316;
          s += texture2D(tDiffuse, vUv + o * 2.5).rgb * 0.070;
          s += texture2D(tDiffuse, vUv - o * 2.5).rgb * 0.070;
          gl_FragColor = vec4(s, 1.0);
        }
      `,
    });

    // Final composite: bloom + vignette + edge ink + layered dither + grain.
    const final = new THREE.ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tMain: { value: null as THREE.Texture | null },
        tBloom: { value: null as THREE.Texture | null },
        tDepth: { value: null as THREE.Texture | null },
        uRes: { value: new THREE.Vector2(1, 1) },
        uTime: { value: 0 },
      },
      vertexShader: VERT,
      fragmentShader: `
        uniform sampler2D tMain;
        uniform sampler2D tBloom;
        uniform sampler2D tDepth;
        uniform vec2 uRes;
        uniform float uTime;
        varying vec2 vUv;

        float bayer4x4(vec2 p) {
          vec2 t = floor(mod(p, 4.0));
          float v = mod(t.x, 2.0) * 8.0 + mod(t.y, 2.0) * 4.0
                  + mod(floor(t.x / 2.0), 2.0) * 2.0
                  + mod(floor(t.y / 2.0), 2.0);
          return (v + 0.5) / 16.0;
        }
        float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
        float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

        void main() {
          vec2 uv = vUv;
          vec2 px = 1.0 / uRes;
          vec2 fc = gl_FragCoord.xy;

          // Bloom add (in linear), then to display space.
          vec3 lin = texture2D(tMain, uv).rgb + texture2D(tBloom, uv).rgb * 0.9;
          vec3 c = pow(max(lin, 0.0), vec3(1.0 / 2.2));

          // Hand-drawn edge ink.
          float lx = luma(texture2D(tMain, uv + vec2(px.x, 0.0)).rgb)
                   - luma(texture2D(tMain, uv - vec2(px.x, 0.0)).rgb);
          float ly = luma(texture2D(tMain, uv + vec2(0.0, px.y)).rgb)
                   - luma(texture2D(tMain, uv - vec2(0.0, px.y)).rgb);
          float edge = clamp(length(vec2(lx, ly)) * 2.0, 0.0, 1.0);
          c = mix(c, c * 0.5, edge * 0.3);

          // Vignette to focus the centred figure.
          vec2 vd = uv - 0.5; vd.x *= uRes.x / uRes.y;
          float vig = smoothstep(1.15, 0.35, length(vd));
          c *= mix(0.72, 1.0, vig);

          // 'c' so far is the clean lit image (bloom + ink + vignette, no
          // dither). Build the fully-dithered version on top of it.
          vec3 dithered = c;
          float d1 = bayer4x4(fc);
          float d2 = bayer4x4(fc * 0.5 + 11.0);
          float d3 = hash(floor(fc) + floor(uTime * 50.0));
          float d = d1 * 0.5 + d2 * 0.3 + d3 * 0.2;
          float levels = 5.0;
          dithered += (d - 0.5) / levels;
          dithered = floor(dithered * levels + 0.5) / levels;
          dithered += (hash(floor(fc) + floor(uTime * 37.0)) - 0.5) * 0.03;

          // Let a bit of the original (un-dithered) model show through where the
          // depth buffer marks a figure; the backdrop stays fully dithered.
          float isModel = step(texture2D(tDepth, uv).r, 0.9999);
          c = mix(dithered, c, isModel * 0.5);

          gl_FragColor = vec4(c, 1.0);
        }
      `,
    });

    return { scn, cam, mesh, bright, blur, final };
  }, []);

  useFrame((_, dt) => {
    const { scn, cam, mesh, bright, blur, final } = ctx;
    if (main.width !== w || main.height !== h) main.setSize(w, h);
    main.texture.colorSpace = THREE.LinearSRGBColorSpace;

    // 1. Whole scene into the main buffer (linear).
    gl.setRenderTarget(main);
    gl.render(scene, camera);

    // 2. Bright-pass into the half-res bloom buffer.
    mesh.material = bright;
    bright.uniforms.tDiffuse.value = main.texture;
    gl.setRenderTarget(bloomA);
    gl.render(scn, cam);

    // 3. Blur horizontally, then vertically.
    mesh.material = blur;
    blur.uniforms.uRes.value.set(bw, bh);
    blur.uniforms.tDiffuse.value = bloomA.texture;
    blur.uniforms.uDir.value.set(1, 0);
    gl.setRenderTarget(bloomB);
    gl.render(scn, cam);
    blur.uniforms.tDiffuse.value = bloomB.texture;
    blur.uniforms.uDir.value.set(0, 1);
    gl.setRenderTarget(bloomA);
    gl.render(scn, cam);

    // 4. Composite + dither to the screen.
    mesh.material = final;
    final.uniforms.tMain.value = main.texture;
    final.uniforms.tBloom.value = bloomA.texture;
    final.uniforms.tDepth.value = main.depthTexture;
    final.uniforms.uRes.value.set(w, h);
    final.uniforms.uTime.value += dt;
    gl.setRenderTarget(null);
    gl.render(scn, cam);
  }, 1);

  return null;
}
