# platonic pals

A tiny, tactile gallery of "platonic friends" — hand-made wooden figures rendered
in real time, one at a time. Built for iPhone first.

## Idea

Pure focus on the object and the gesture. No chrome, no text, no controls — just
the figure on a floor under real light. The background is 100% white or 100%
black, decided solely by the device's light/dark setting.

## Interaction

- **Swipe vertically** — scroll through the figures, one per page, with a smooth
  hand-off transition.
- **Drag horizontally** — orbit the figure (with inertia). It also spins gently
  on its own around the vertical axis.
- **Two-finger drag** — move the light rig. The hard shadows swing across the
  floor; the camera never moves.
- No zoom, no pan.

## Rendering

Real light sources only (key / fill / rim directional lights plus a whisper of
ambient) — no environment map / IBL. A real ground plane catches hard-edged
shadows via `BasicShadowMap`, with ACES tone mapping for a believable wood look.

## Stack

[Vite](https://vitejs.dev) · [React Three Fiber](https://r3f.docs.pmnd.rs) ·
[drei](https://github.com/pmndrs/drei) · [three.js](https://threejs.org) ·
[zustand](https://github.com/pmndrs/zustand). Deployed on Vercel.

```bash
npm install
npm run dev      # local
npm run build    # production bundle in dist/
```

Figure models live in `public/models/*.glb`.
