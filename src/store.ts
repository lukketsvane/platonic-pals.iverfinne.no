import { create } from "zustand";

export type Pal = {
  id: string;
  name: string;
  url: string;
  /** Target on-screen height in world units once normalized. */
  height: number;
  /**
   * Bold, fully-saturated colour that is complementary to the figure's own
   * dominant hue. Used for the light-mode glitter so each section pops with
   * its own pairing (the opposite of the model's palette).
   */
  accent: string;
  /** Procedural background texture for this section (see Backdrop in Scene). */
  pattern: number; // 0 diamond · 1 checker · 2 stars · 3 web · 4 fan · 5 stripes · 6 dots
  bgBase: string; // bold field colour
  bgInk: string; // pattern colour drawn over the field
};

// Figures are normalized to a common height; 2.34 ≈ 30% larger than the old 1.8.
const H = 2.34;

export const PALS: Pal[] = [
  // Olive-green pod      -> magenta
  { id: "seed", name: "Seed", url: "/models/polypal_seed.glb", height: H, accent: "#e01f9b", pattern: 0, bgBase: "#ff2d9e", bgInk: "#eaff66" },
  // Cool grey blocks     -> warm orange
  { id: "cuboid", name: "Cuboid", url: "/models/polypal_cuboid.glb", height: H, accent: "#ff5a1f", pattern: 1, bgBase: "#ff6a00", bgInk: "#2a1500" },
  // Navy-blue flywheel   -> golden amber
  { id: "flywheel", name: "Astrolabium", url: "/models/polypal_flywheel.glb", height: H, accent: "#ffb300", pattern: 2, bgBase: "#2f6bff", bgInk: "#ffffff" },
  // Dark iridescent      -> electric cyan
  { id: "iridescent", name: "Iridescent", url: "/models/polypal_iridescent.glb", height: H, accent: "#00e5ff", pattern: 3, bgBase: "#b06cff", bgInk: "#e9b44c" },
  // Graphite metal       -> crimson
  { id: "neodynium", name: "Neodynium", url: "/models/polypal_neodynium.glb", height: H, accent: "#ff2d4f", pattern: 4, bgBase: "#8a3b2a", bgInk: "#f2e9e0" },
  // Mixed tones          -> vivid violet
  { id: "juxtaposed", name: "Juxtaposed", url: "/models/polypal_juxtaposed.glb", height: H, accent: "#7b5cff", pattern: 5, bgBase: "#6a3df0", bgInk: "#d6ff3b" },
  // Neutral paper        -> lime
  { id: "docu", name: "Docu", url: "/models/polypal_docu.glb", height: H, accent: "#6ee63c", pattern: 6, bgBase: "#19c37d", bgInk: "#04241a" },
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
