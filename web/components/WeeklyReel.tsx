"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { EditionTicket } from "@/components/EditionTicket";
import type { WeeklyReelItem } from "@/lib/weeklyReel";

type Props = {
  items: WeeklyReelItem[];
  isAdmin?: boolean;
};

const BEHIND = 3;
const HIT_MARGIN = 24;

export function WeeklyReel({ items, isAdmin = false }: Props) {
  const [index, setIndex] = useState(0);
  const stageRef = useRef<HTMLDivElement>(null);
  const lockRef = useRef(false);
  const indexRef = useRef(0);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const last = items.length - 1;

  indexRef.current = index;

  function moveTo(next: number) {
    const clamped = Math.min(last, Math.max(0, next));
    if (clamped === indexRef.current || lockRef.current) return false;
    lockRef.current = true;
    setIndex(clamped);
    window.setTimeout(() => {
      lockRef.current = false;
    }, 480);
    return true;
  }

  function step(dir: 1 | -1) {
    return moveTo(indexRef.current + dir);
  }

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    // Card rects move mid-animation, so the zone is kept relative to the
    // stage's untransformed box and only ever grows until the next resize.
    let zone: { left: number; right: number; top: number; bottom: number } | null = null;

    const measureZone = () => {
      const cards = stage.querySelectorAll<HTMLElement>(
        ".rolodex-card:not(.is-gone):not(.is-hidden)"
      );
      if (cards.length === 0) return;
      const base = stage.getBoundingClientRect();
      let left = Infinity;
      let right = -Infinity;
      let top = Infinity;
      let bottom = -Infinity;
      for (const card of cards) {
        const r = card.getBoundingClientRect();
        left = Math.min(left, r.left - base.left);
        right = Math.max(right, r.right - base.left);
        top = Math.min(top, r.top - base.top);
        bottom = Math.max(bottom, r.bottom - base.top);
      }
      zone = zone
        ? {
            left: Math.min(zone.left, left),
            right: Math.max(zone.right, right),
            top: Math.min(zone.top, top),
            bottom: Math.max(zone.bottom, bottom),
          }
        : { left, right, top, bottom };
    };

    const inTicketZone = (x: number, y: number) => {
      if (!lockRef.current) measureZone();
      if (!zone) return false;
      const base = stage.getBoundingClientRect();
      return (
        x >= base.left + zone.left - HIT_MARGIN &&
        x <= base.left + zone.right + HIT_MARGIN &&
        y >= base.top + zone.top - HIT_MARGIN &&
        y <= base.top + zone.bottom + HIT_MARGIN
      );
    };

    const onWheel = (event: WheelEvent) => {
      if (!inTicketZone(event.clientX, event.clientY)) return;
      event.preventDefault();
      const delta =
        Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
      if (Math.abs(delta) < 12) return;
      step(delta > 0 ? 1 : -1);
    };

    const onResize = () => {
      zone = null;
    };

    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("resize", onResize);
    };
  }, [last]);

  if (!items[index]) return null;

  return (
    <div className="rolodex">
      <div
        ref={stageRef}
        className="rolodex-stage"
        role="region"
        aria-roledescription="carousel"
        aria-label="Earlier week recaps"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowRight") {
            event.preventDefault();
            step(1);
          }
          if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
            event.preventDefault();
            step(-1);
          }
        }}
        onTouchStart={(event) => {
          const t = event.touches[0];
          touchStart.current = t ? { x: t.clientX, y: t.clientY } : null;
        }}
        onTouchEnd={(event) => {
          const start = touchStart.current;
          touchStart.current = null;
          const t = event.changedTouches[0];
          if (!start || !t) return;
          const dx = start.x - t.clientX;
          const dy = start.y - t.clientY;
          const delta = Math.abs(dx) > Math.abs(dy) ? dx : dy;
          if (Math.abs(delta) < 36) return;
          step(delta > 0 ? 1 : -1);
        }}
      >
        {items.map((item, itemIndex) => {
          const pos = itemIndex - index;
          if (pos < -1 || pos > BEHIND + 1) return null;
          const isFront = pos === 0;
          const className = [
            "rolodex-card",
            isFront ? "is-front" : "",
            pos < 0 ? "is-gone" : "",
            pos > BEHIND ? "is-hidden" : "",
          ]
            .filter(Boolean)
            .join(" ");

          return (
            <article
              key={item.slug}
              className={className}
              aria-hidden={!isFront}
              style={
                {
                  "--pos": Math.min(Math.max(pos, 0), BEHIND),
                  zIndex: 10 - pos,
                } as CSSProperties
              }
            >
              <EditionTicket item={item} isAdmin={isAdmin} focusable={isFront} />
              {pos > 0 ? (
                <button
                  type="button"
                  className="rolodex-pull"
                  tabIndex={-1}
                  aria-label={`Show ${item.label}`}
                  onClick={() => moveTo(itemIndex)}
                />
              ) : null}
            </article>
          );
        })}
      </div>

      <div className="rolodex-controls">
        <button
          type="button"
          className="rolodex-nav"
          onClick={() => step(-1)}
          disabled={index === 0}
        >
          Newer
        </button>
        <span className="rolodex-current" aria-live="polite">
          {items[index].tabLabel}
        </span>
        <button
          type="button"
          className="rolodex-nav"
          onClick={() => step(1)}
          disabled={index === last}
        >
          Older
        </button>
      </div>
    </div>
  );
}
