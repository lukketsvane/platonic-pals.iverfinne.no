import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { PALS, useStore } from "../store";
import { Pal } from "./Pal";
import { Lights } from "./Lights";
import { useTheme } from "./useTheme";

/**
 * Crisp, square pixel glitter that matches the pixelated render.
 *
 *  - Particles are pushed around by a soft, gusty "wind" — a slow ambient
 *    breeze plus a kick whenever the figure is orbited or scrolled, then they
 *    wrap around a bounding box so the field never drains.
 *  - Each particle blinks on a fast cycle, so specks appear and disappear very
 *    quickly rather than smoothly twinkling.
 *  - In light mode the colour is the section's bold complementary accent and
 *    the alpha is resolved with an animated ordered-dither (a crawling Bayer
 *    matrix), giving a shimmering halftone instead of a flat tint.
 */
function Glitter({ color, light }: { color: string; light: boolean }) {
  const COUNT = 90;
  const mat = useRef<THREE.ShaderMaterial>(null);
  const wind = useRef(new THREE.Vector2(0, 0));
  const prevAz = useRef(0);
  const prevScroll = useRef(0);

  const geometry = useMemo(() => {
    const pos = new Float32Array(COUNT * 3);
    const phase = new Float32Array(COUNT);
    const size = new Float32Array(COUNT);
    const rate = new Float32Array(COUNT);
    const seed = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 5.5;
      pos[i * 3 + 1] = -0.4 + Math.random() * 3.6;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 4;
      phase[i] = Math.random();
      size[i] = 1 + Math.floor(Math.random() * 3); // 1..3 px squares
      rate[i] = 2.5 + Math.random() * 5.5; // fast blink, ~2.5..8 Hz
      seed[i] = Math.random();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aPhase", new THREE.BufferAttribute(phase, 1));
    g.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
    g.setAttribute("aRate", new THREE.BufferAttribute(rate, 1));
    g.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
    return g;
  }, []);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(color) },
      uWind: { value: new THREE.Vector2(0, 0) },
      uLight: { value: light ? 1 : 0 },
    }),
    []
  );

  const target = useMemo(() => new THREE.Color(color), []);

  useFrame((s, dt) => {
    const st = useStore.getState();
    const t = s.clock.elapsedTime;

    // Wind = a slow, gusty ambient breeze, plus a kick from orbiting/scrolling.
    const dAz = st.azimuth - prevAz.current;
    prevAz.current = st.azimuth;
    let dSc = st.scroll - prevScroll.current;
    prevScroll.current = st.scroll;
    if (Math.abs(dSc) > 1) dSc = 0; // ignore the loop teleport's big jump

    const breeze = Math.sin(t * 0.27) + 0.6 * Math.sin(t * 0.11 + 1.3);
    const vx = breeze * 0.22 + dAz * 3.5; // orbit drags the air sideways
    const vy = -dSc * 1.5 + Math.sin(t * 0.4) * 0.06;
    wind.current.x += vx * dt;
    wind.current.y += vy * dt;
    // Keep the accumulator inside one wrap period so it never grows unbounded.
    const PX = 5.5; // == 2 * BOUND.x in the shader
    const PY = 4.0; // == 2 * BOUND.y in the shader
    wind.current.x = ((wind.current.x % PX) + PX) % PX;
    wind.current.y = ((wind.current.y % PY) + PY) % PY;

    if (mat.current) {
      const u = mat.current.uniforms;
      u.uTime.value = t;
      u.uWind.value.copy(wind.current);
      u.uLight.value = light ? 1 : 0;
      // Ease between section accents instead of snapping.
      target.set(color);
      u.uColor.value.lerp(target, 1 - Math.pow(0.002, dt));
    }
  });

  return (
    <points geometry={geometry} frustumCulled={false}>
      <shaderMaterial
        ref={mat}
        transparent
        depthWrite={false}
        uniforms={uniforms}
        vertexShader={`
          attribute float aPhase;
          attribute float aSize;
          attribute float aRate;
          attribute float aSeed;
          uniform float uTime;
          uniform vec2 uWind;
          uniform float uLight;
          varying float vVis;
          void main() {
            vec3 BOUND = vec3(2.75, 2.0, 2.0);
            vec3 ORIG  = vec3(0.0, 1.4, 0.0);
            vec3 p = position;
            // Per-particle turbulence so the breeze never looks uniform.
            p.x += sin(uTime * 0.9 + aSeed * 30.0) * 0.16;
            p.y += sin(uTime * 0.7 + aSeed * 22.0) * 0.10;
            // Wind drift, then wrap inside the box so the field stays full.
            p.x += uWind.x;
            p.y += uWind.y;
            vec3 rel = mod(p - ORIG + BOUND, 2.0 * BOUND);
            p = rel - BOUND + ORIG;
            // Very quick appear / disappear: a short visible window per cycle.
            float c = fract(uTime * aRate + aPhase);
            float vis = smoothstep(0.0, 0.06, c) * (1.0 - smoothstep(0.10, 0.20, c));
            vVis = vis;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
            gl_PointSize = (aSize + uLight * 1.5) * (0.5 + 0.9 * vis);
          }
        `}
        fragmentShader={`
          uniform vec3 uColor;
          uniform float uLight;
          uniform float uTime;
          varying float vVis;

          // 4x4 ordered-dither threshold (bit-reversal Bayer construction).
          float bayer4x4(vec2 p) {
            vec2 t = floor(mod(p, 4.0));
            return (mod(t.x, 2.0) * 8.0 + mod(t.y, 2.0) * 4.0
                  + mod(floor(t.x / 2.0), 2.0) * 2.0
                  + mod(floor(t.y / 2.0), 2.0)) / 16.0;
          }

          void main() {
            if (vVis < 0.05) discard;
            if (uLight > 0.5) {
              // Animated dithering: crawl the Bayer threshold across the pixels.
              vec2 dc = gl_FragCoord.xy + vec2(floor(uTime * 7.0), floor(uTime * 5.0));
              if (vVis < bayer4x4(dc)) discard;
              gl_FragColor = vec4(uColor, 1.0); // bold, full colour
            } else {
              gl_FragColor = vec4(uColor, vVis * 0.9);
            }
          }
        `}
      />
    </points>
  );
}

const VSPREAD = 6.6; // vertical world-distance between consecutive figures
const ROT_PER_PAGE = Math.PI * 2; // exactly one full turn per scroll page
const BASE_YAW = -Math.PI * 0.3 - Math.PI / 3; // rest orientation, +60° from before
const LOOK_AT = new THREE.Vector3(0, 1.2, 0); // framing target (figure sits lower)
const GROUND_Y = -0.6; // floor sits lower in the frame
const MODEL_RAISE = 0.5; // constant hover gap between the figure and its shadow
const LIFT = 0.55; // extra float once popped
const TAP_ENERGY = 0.34; // energy added per tap (~3 quick taps to pop)
const ENERGY_DECAY = 3.0; // energy bleeds away fast, so taps must keep a tempo
const WINDOW = 1; // figures kept alive on each side of the active one

// Continuous scroll runs in an unbounded index space (it keeps climbing as the
// list loops); this folds any index back onto a real figure.
const wrap = (i: number) => ((i % PALS.length) + PALS.length) % PALS.length;

export function Scene() {
  // Only a small window of figures is ever mounted, so the heavy models never
  // pile up in GPU memory (which crashes iOS Safari). `active` drives it and is
  // a *continuous* index — it can grow past the list length as the loop turns.
  const [active, setActive] = useState(0);
  const activeRef = useRef(0);
  const theme = useTheme();
  const glitterColor = theme === "dark" ? "#ffffff" : PALS[wrap(active)].accent;

  const groups = useRef(new Map<number, THREE.Group>());
  const dispScroll = useRef(0);
  const dispAzim = useRef(0);

  // Tap / hover animation state.
  const lastTap = useRef(0);
  const energy = useRef(0); // builds up from rapid taps, decays between them
  const launched = useRef(false); // has it popped & started floating?
  const floatAmt = useRef(0); // 0..1 smoothed float height
  const pop = useRef(0); // short, sharp "pop" impulse (drives the squash)

  const { camera, raycaster } = useThree();

  // Free the geometry/textures of every figure outside the live window.
  useEffect(() => {
    const liveUrls = new Set<string>();
    for (let i = active - WINDOW; i <= active + WINDOW; i++) {
      liveUrls.add(PALS[wrap(i)].url);
    }
    PALS.forEach((p) => {
      if (!liveUrls.has(p.url)) useGLTF.clear(p.url);
    });
  }, [active]);

  useFrame((state, dt) => {
    const s = useStore.getState();
    const t = state.clock.elapsedTime;
    const N = PALS.length;

    // The DOM scroller silently reseats its clone pages by ±N to loop forever.
    // Collapse that whole-loop jump into the smoothed value so the wrap is
    // invisible (we only ever ease across the short residual).
    let tgt = s.scroll;
    while (tgt - dispScroll.current > N / 2) dispScroll.current += N;
    while (dispScroll.current - tgt > N / 2) dispScroll.current -= N;
    dispScroll.current += (tgt - dispScroll.current) * (1 - Math.pow(0.0015, dt));
    dispAzim.current += (s.azimuth - dispAzim.current) * (1 - Math.pow(0.002, dt));
    camera.lookAt(LOOK_AT);

    const a = Math.round(dispScroll.current);
    if (a !== activeRef.current) {
      activeRef.current = a;
      launched.current = false; // scrolling away lands the previous figure
      energy.current = 0;
      setActive(a); // remount the window around the new figure
    }

    // Energy bleeds away, so you have to tap-tap-tap within a tempo to build it.
    energy.current *= Math.exp(-dt * ENERGY_DECAY);

    // A fresh tap on the centered figure.
    if (s.tapNonce !== lastTap.current) {
      lastTap.current = s.tapNonce;
      const g = groups.current.get(activeRef.current);
      if (g) {
        raycaster.setFromCamera(s.tapNDC as THREE.Vector2, camera);
        if (raycaster.intersectObject(g, true).length > 0) {
          if (launched.current) {
            // Tap again while floating -> settle gently back down.
            launched.current = false;
            energy.current = 0;
            pop.current = Math.max(pop.current, 0.3);
          } else {
            energy.current += TAP_ENERGY;
            pop.current = Math.max(pop.current, 0.28); // tiny tick per tap
            if (energy.current >= 1) {
              launched.current = true; // it (almost) pops...
              energy.current = 0;
              pop.current = 1; // ...with a sharp little squash
            }
          }
        }
      }
    }

    // Float height: a slow rise once launched, a slightly quicker settle down.
    const target = launched.current ? 1 : 0;
    const rising = target > floatAmt.current;
    floatAmt.current +=
      (target - floatAmt.current) * (1 - Math.pow(rising ? 0.5 : 0.16, dt));

    // The pop is a short, sharp impulse that barely lifts but reads as a punch.
    pop.current *= Math.exp(-dt * 7);

    groups.current.forEach((g, i) => {
      // d > 0 once scrolled past: figure rises and exits the top while the next
      // enters from below — i.e. normal scrolling. Indices are continuous, and
      // because ROT_PER_PAGE is exactly one turn, a looped figure lands at the
      // identical orientation as its real twin, so the wrap stays seamless.
      const d = dispScroll.current - i;
      const isActive = i === activeRef.current;
      // Pop barely moves it vertically; the float carries it slowly upward.
      const lift = isActive ? floatAmt.current * LIFT + pop.current * 0.08 : 0;
      const bob = isActive ? Math.sin(t * 1.3) * 0.03 * floatAmt.current : 0;

      g.position.y = GROUND_Y + MODEL_RAISE + d * VSPREAD + lift + bob;
      g.rotation.y = BASE_YAW + d * ROT_PER_PAGE + dispAzim.current;
      g.rotation.z = 0;
      const p = isActive ? pop.current : 0;
      g.scale.set(1 - p * 0.06, 1 + p * 0.1, 1 - p * 0.06);
    });
  });

  // The continuous indices currently kept alive around the active figure.
  const live: number[] = [];
  for (let i = active - WINDOW; i <= active + WINDOW; i++) live.push(i);

  return (
    <>
      <Lights />

      {/* Wind-blown pixel glitter; bold dithered accent in light mode. */}
      <Glitter color={glitterColor} light={theme === "light"} />

      {/* Shadow-only floor: no tone/value on the ground, just the hard shadow. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, GROUND_Y, 0]} receiveShadow>
        <planeGeometry args={[80, 80]} />
        <shadowMaterial transparent opacity={0.34} color="#000000" />
      </mesh>

      {live.map((i) => {
        const pal = PALS[wrap(i)];
        return (
          <group
            key={i}
            ref={(el) => {
              if (el) groups.current.set(i, el);
              else groups.current.delete(i);
            }}
          >
            <Suspense fallback={null}>
              <Pal url={pal.url} height={pal.height} />
            </Suspense>
          </group>
        );
      })}
    </>
  );
}
