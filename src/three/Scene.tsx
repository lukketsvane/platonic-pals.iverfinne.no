import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { PALS, useStore } from "../store";
import { Pal } from "./Pal";
import { Lights } from "./Lights";
import { useTheme } from "./useTheme";

/**
 * Subtle, motion-driven spark dust that matches the pixelated render.
 *
 *  - At rest the field is almost empty. Movement (scrolling or orbiting) raises
 *    an `energy` level; the faster you move, the more sparks cross their
 *    threshold and flicker to life — then it bleeds away and they settle.
 *  - Each spark drifts slowly like floating dust, with a small kick in the
 *    direction of motion that eases back to a gentle ambient sway.
 *  - In light mode the colour is the section's bold complementary accent and
 *    the alpha is resolved with an animated ordered (Bayer) dither.
 */
function Glitter({ color, light }: { color: string; light: boolean }) {
  const COUNT = 140;
  const mat = useRef<THREE.ShaderMaterial>(null);
  const drift = useRef(new THREE.Vector2(0, 0)); // transient motion kick
  const energy = useRef(0); // 0..1 how "stirred up" the dust is
  const prevAz = useRef(0);
  const prevScroll = useRef(0);

  const geometry = useMemo(() => {
    const pos = new Float32Array(COUNT * 3);
    const phase = new Float32Array(COUNT);
    const size = new Float32Array(COUNT);
    const rate = new Float32Array(COUNT);
    const seed = new Float32Array(COUNT);
    const thresh = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 5.5;
      pos[i * 3 + 1] = -0.4 + Math.random() * 3.6;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 4;
      phase[i] = Math.random();
      size[i] = 1 + Math.floor(Math.random() * 2); // 1..2 px sparks
      rate[i] = 0.5 + Math.random() * 1.1; // slow, dusty fade in/out
      seed[i] = Math.random();
      thresh[i] = Math.random(); // movement level needed to wake this spark
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aPhase", new THREE.BufferAttribute(phase, 1));
    g.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
    g.setAttribute("aRate", new THREE.BufferAttribute(rate, 1));
    g.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
    g.setAttribute("aThresh", new THREE.BufferAttribute(thresh, 1));
    return g;
  }, []);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(color) },
      uDrift: { value: new THREE.Vector2(0, 0) },
      uEnergy: { value: 0 },
      uLight: { value: light ? 1 : 0 },
    }),
    []
  );

  const target = useMemo(() => new THREE.Color(color), []);

  useFrame((s, dt) => {
    const st = useStore.getState();
    const t = s.clock.elapsedTime;
    const h = Math.max(dt, 1 / 120);

    // How fast is the figure being moved this frame (orbit + scroll)?
    const dAz = st.azimuth - prevAz.current;
    prevAz.current = st.azimuth;
    let dSc = st.scroll - prevScroll.current;
    prevScroll.current = st.scroll;
    if (Math.abs(dSc) > 1) dSc = 0; // ignore the loop teleport's big jump
    const speed = (Math.abs(dAz) + Math.abs(dSc)) / h;

    // Energy rises quickly with motion, then bleeds away so the dust settles.
    const tgt = Math.min(1, speed * 0.45);
    const k = tgt > energy.current ? 1 - Math.pow(0.0004, dt) : 1 - Math.pow(0.25, dt);
    energy.current += (tgt - energy.current) * k;

    // A small kick in the direction of motion that eases back toward rest.
    drift.current.x += dAz * 1.6;
    drift.current.y += -dSc * 0.6;
    const ease = Math.pow(0.05, dt);
    drift.current.x *= ease;
    drift.current.y *= ease;

    if (mat.current) {
      const u = mat.current.uniforms;
      u.uTime.value = t;
      u.uEnergy.value = energy.current;
      u.uDrift.value.copy(drift.current);
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
          attribute float aThresh;
          uniform float uTime;
          uniform vec2 uDrift;
          uniform float uEnergy;
          uniform float uLight;
          varying float vVis;
          void main() {
            vec3 BOUND = vec3(2.75, 2.0, 2.0);
            vec3 ORIG  = vec3(0.0, 1.4, 0.0);
            vec3 p = position;
            // Slow dust float: gentle ambient sway + the motion kick.
            p.x += sin(uTime * 0.5 + aSeed * 40.0) * 0.22 + uDrift.x;
            p.y += cos(uTime * 0.42 + aSeed * 33.0) * 0.16 + uDrift.y;
            vec3 rel = mod(p - ORIG + BOUND, 2.0 * BOUND);
            p = rel - BOUND + ORIG;
            // Wake only the sparks whose threshold the current energy clears.
            float alive = smoothstep(aThresh, aThresh + 0.2, uEnergy);
            // Soft, dusty flicker (not a hard blink).
            float c = fract(uTime * aRate + aPhase);
            float tw = smoothstep(0.0, 0.15, c) * (1.0 - smoothstep(0.3, 0.7, c));
            vVis = alive * tw;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
            gl_PointSize = (aSize + uLight) * (0.6 + 0.6 * vVis);
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
            if (vVis < 0.04) discard;
            if (uLight > 0.5) {
              // Animated dithering: crawl the Bayer threshold across the pixels.
              vec2 dc = gl_FragCoord.xy + vec2(floor(uTime * 7.0), floor(uTime * 5.0));
              if (vVis < bayer4x4(dc)) discard;
              gl_FragColor = vec4(uColor, 0.75); // subtle, bold colour
            } else {
              gl_FragColor = vec4(uColor, vVis * 0.55);
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
