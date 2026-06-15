import { create } from "zustand";

export type Pal = {
  id: string;
  name: string;
  url: string;
  /** Target on-screen height in world units once normalized. */
  height: number;
};

export const PALS: Pal[] = [
  { id: "berry", name: "Berry", url: "/models/pal_berry.glb", height: 3.0 },
  { id: "cone", name: "Cone", url: "/models/pal_cone.glb", height: 3.0 },
  { id: "pyramid", name: "Pyramid", url: "/models/pal_pyramid.glb", height: 3.0 },
  { id: "dodeca", name: "Dodeca", url: "/models/pal_dodeca.glb", height: 2.7 },
];

type State = {
  /** Continuous scroll position, in figure units (0 .. PALS.length-1). */
  scroll: number;
  /** User-driven azimuth (radians) added to the autonomous spin. */
  azimuth: number;
  /** Two-finger light-rig offset, in world units. */
  light: { x: number; y: number };
  ready: boolean;

  setScroll: (v: number) => void;
  addAzimuth: (d: number) => void;
  addLight: (dx: number, dy: number) => void;
  setReady: (v: boolean) => void;
};

export const useStore = create<State>((set) => ({
  scroll: 0,
  azimuth: 0,
  light: { x: 0, y: 0 },
  ready: false,

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
}));

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}
