import { create } from "zustand";

export type Pal = {
  id: string;
  name: string;
  url: string;
  /** Target on-screen height in world units once normalized. */
  height: number;
};

export const PALS: Pal[] = [
  { id: "seed", name: "Seed", url: "/models/polypal_seed.glb", height: 1.8 },
  { id: "cuboid", name: "Cuboid", url: "/models/polypal_cuboid.glb", height: 1.8 },
  { id: "flywheel", name: "Flywheel", url: "/models/polypal_flywheel.glb", height: 1.8 },
  { id: "iridescent", name: "Iridescent", url: "/models/polypal_iridescent.glb", height: 1.8 },
  { id: "neodynium", name: "Neodynium", url: "/models/polypal_neodynium.glb", height: 1.8 },
  { id: "juxtaposed", name: "Juxtaposed", url: "/models/polypal_juxtaposed.glb", height: 1.8 },
  { id: "docu", name: "Docu", url: "/models/polypal_docu.glb", height: 1.8 },
];

type State = {
  /** Continuous scroll position, in figure units (0 .. PALS.length-1). */
  scroll: number;
  /** User-driven azimuth (radians) added to the autonomous spin. */
  azimuth: number;
  /** Two-finger light-rig offset, in world units. */
  light: { x: number; y: number };
  ready: boolean;

  /** Whether the centered figure is lifted off the floor and hovering. */
  hover: boolean;
  /** Bumped on every figure tap; carries the tap point in NDC space. */
  tapNonce: number;
  tapNDC: { x: number; y: number };

  setScroll: (v: number) => void;
  addAzimuth: (d: number) => void;
  addLight: (dx: number, dy: number) => void;
  setReady: (v: boolean) => void;
  tap: (x: number, y: number) => void;
  setHover: (v: boolean) => void;
};

export const useStore = create<State>((set) => ({
  scroll: 0,
  azimuth: 0,
  light: { x: 0, y: 0 },
  ready: false,
  hover: false,
  tapNonce: 0,
  tapNDC: { x: 0, y: 0 },

  setScroll: (v) => set({ scroll: v }),
  addAzimuth: (d) => set((s) => ({ azimuth: s.azimuth + d })),
  addLight: (dx, dy) =>
    set((s) => ({
      light: {
        // Clamp so the rig stays sane and never flips behind the floor.
        x: clamp(s.light.x + dx, -6, 6),
        y: clamp(s.light.y + dy, -3, 5),
      },
    })),
  setReady: (v) => set({ ready: v }),
  tap: (x, y) => set((s) => ({ tapNonce: s.tapNonce + 1, tapNDC: { x, y } })),
  setHover: (v) => set({ hover: v }),
}));

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}
