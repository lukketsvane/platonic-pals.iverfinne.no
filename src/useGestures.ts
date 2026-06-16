import { useEffect } from "react";
import { useStore } from "./store";

/**
 * Wires up all touch / pointer gestures on the scroll layer:
 *
 *  - vertical 1-finger drag  -> native page scroll (figure to figure)
 *  - horizontal 1-finger drag -> orbit the figure (azimuth) with inertia
 *  - 2-finger drag            -> move the light rig (camera untouched)
 *  - wheel / trackpad         -> native scroll
 *
 * There is deliberately no zoom and no pan.
 */
export function useGestures(el: HTMLElement | null) {
  useEffect(() => {
    if (!el) return;

    const { setScroll, addAzimuth, addLight, tap } = useStore.getState();

    const ORBIT_K = 0.006; // px -> radians
    const LIGHT_K = 0.014; // px -> world units
    const AXIS_LOCK = 8; // px before we commit to orbit vs scroll
    const TAP_MOVE = 9; // max px of travel still counted as a tap
    const TAP_TIME = 300; // max ms still counted as a tap

    // A still, brief touch that never escalated to a drag = a tap on the figure.
    const fireTap = (cx: number, cy: number, downAt: number, moved: number) => {
      if (moved > TAP_MOVE || performance.now() - downAt > TAP_TIME) return;
      tap((cx / window.innerWidth) * 2 - 1, -(cy / window.innerHeight) * 2 + 1);
    };

    // ---- scroll position ------------------------------------------------
    const onScroll = () => {
      const h = el.clientHeight || window.innerHeight;
      setScroll(el.scrollTop / h);
    };

    // ---- shared single-finger / mouse orbit state -----------------------
    let mode: "idle" | "pending" | "orbit" | "light" = "idle";
    let startX = 0;
    let startY = 0;
    let lastX = 0;
    let lastMid = { x: 0, y: 0 };
    let velocity = 0;
    let inertia = 0;
    let downAt = 0; // timestamp of the current press (for tap detection)

    const stopInertia = () => {
      if (inertia) cancelAnimationFrame(inertia);
      inertia = 0;
    };

    const runInertia = () => {
      velocity *= 0.93;
      if (Math.abs(velocity) < 0.00018) {
        velocity = 0;
        inertia = 0;
        return;
      }
      addAzimuth(velocity);
      inertia = requestAnimationFrame(runInertia);
    };

    // ---- touch ----------------------------------------------------------
    const mid = (t: TouchList) => ({
      x: (t[0].clientX + t[1].clientX) / 2,
      y: (t[0].clientY + t[1].clientY) / 2,
    });

    const onTouchStart = (e: TouchEvent) => {
      stopInertia();
      if (e.touches.length >= 2) {
        mode = "light";
        lastMid = mid(e.touches);
        return;
      }
      mode = "pending";
      startX = lastX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      downAt = performance.now();
      velocity = 0;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (mode === "light" && e.touches.length >= 2) {
        const m = mid(e.touches);
        addLight((m.x - lastMid.x) * LIGHT_K, -(m.y - lastMid.y) * LIGHT_K);
        lastMid = m;
        e.preventDefault();
        return;
      }
      if (e.touches.length !== 1) return;

      const x = e.touches[0].clientX;
      const y = e.touches[0].clientY;

      if (mode === "pending") {
        const dx = x - startX;
        const dy = y - startY;
        if (Math.hypot(dx, dy) < AXIS_LOCK) return;
        // Horizontal intent -> orbit; vertical intent -> hand back to scroll.
        mode = Math.abs(dx) > Math.abs(dy) ? "orbit" : "idle";
      }

      if (mode === "orbit") {
        const d = (x - lastX) * ORBIT_K;
        velocity = d;
        addAzimuth(d);
        lastX = x;
        e.preventDefault(); // keep the page from scrolling while orbiting
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (mode === "orbit" && Math.abs(velocity) > 0.001) runInertia();
      if (mode === "pending") {
        const t = e.changedTouches[0];
        fireTap(t.clientX, t.clientY, downAt, Math.hypot(t.clientX - startX, t.clientY - startY));
      }
      mode = "idle";
    };

    // ---- mouse (desktop) ------------------------------------------------
    const onMouseDown = (e: MouseEvent) => {
      stopInertia();
      // Right button or Alt -> move lights; otherwise orbit.
      if (e.button === 2 || e.altKey) {
        mode = "light";
        lastMid = { x: e.clientX, y: e.clientY };
      } else {
        mode = "orbit";
        startX = lastX = e.clientX;
        startY = e.clientY;
        downAt = performance.now();
        velocity = 0;
      }
      e.preventDefault();
    };

    const onMouseMove = (e: MouseEvent) => {
      if (mode === "light") {
        addLight(
          (e.clientX - lastMid.x) * LIGHT_K,
          -(e.clientY - lastMid.y) * LIGHT_K
        );
        lastMid = { x: e.clientX, y: e.clientY };
      } else if (mode === "orbit") {
        const d = (e.clientX - lastX) * ORBIT_K;
        velocity = d;
        addAzimuth(d);
        lastX = e.clientX;
      }
    };

    const onMouseUp = (e: MouseEvent) => {
      if (mode === "orbit") {
        fireTap(e.clientX, e.clientY, downAt, Math.hypot(e.clientX - startX, e.clientY - startY));
        if (Math.abs(velocity) > 0.001) runInertia();
      }
      mode = "idle";
    };

    const noMenu = (e: Event) => e.preventDefault();

    el.addEventListener("scroll", onScroll, { passive: true });
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    el.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    el.addEventListener("contextmenu", noMenu);

    return () => {
      stopInertia();
      el.removeEventListener("scroll", onScroll);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      el.removeEventListener("contextmenu", noMenu);
    };
  }, [el]);
}
