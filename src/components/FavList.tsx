import { useRef } from "react";
import type { Stock } from "../types";
import { capf } from "../lib/filters";

interface FavListProps {
  favorites: string[];
  byCode: Record<string, Stock>;
  onToggleFavorite: (code: string) => void;
  onReorder: (from: number, to: number) => void;
}

const numOr = (v: number | null, fmt: (n: number) => string) =>
  v == null ? "—" : fmt(v);

/**
 * 즐겨찾기 목록 — grip 드래그로 순서 변경 (터치·마우스 지원, SPEC 6장).
 * 자동 정렬 없음: 순서는 오직 사용자가 정한다.
 */
export function FavList({
  favorites,
  byCode,
  onToggleFavorite,
  onReorder,
}: FavListProps) {
  const listRef = useRef<HTMLDivElement>(null);

  const startDrag = (
    startY: number,
    card: HTMLElement,
    attach: (move: (y: number) => void, end: () => void) => () => void,
  ) => {
    const list = listRef.current;
    if (!list) return;
    const rows = Array.from(list.querySelectorAll<HTMLElement>(".fav-row"));
    const H = card.offsetHeight + 8;
    const from = rows.indexOf(card);
    let cur = from;

    card.classList.add("drag");
    rows.forEach((r) => {
      if (r !== card) r.classList.add("slide");
    });

    const move = (y: number) => {
      const dy = y - startY;
      card.style.transform = `translateY(${dy}px)`;
      const to = Math.max(
        0,
        Math.min(rows.length - 1, Math.round(from + dy / H)),
      );
      if (to !== cur) {
        cur = to;
        rows.forEach((r, i) => {
          if (r === card) return;
          let sh = 0;
          if (from < cur && i > from && i <= cur) sh = -H;
          else if (from > cur && i < from && i >= cur) sh = H;
          r.style.transform = `translateY(${sh}px)`;
        });
      }
    };

    const end = () => {
      detach();
      rows.forEach((r) => {
        r.classList.remove("drag", "slide");
        r.style.transform = "";
      });
      if (cur !== from) onReorder(from, cur);
    };

    const detach = attach(move, end);
  };

  const onMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    const card = (e.currentTarget as HTMLElement).closest(
      ".fav-row",
    ) as HTMLElement | null;
    if (!card) return;
    startDrag(e.clientY, card, (move, end) => {
      const onMove = (ev: MouseEvent) => move(ev.clientY);
      const onUp = () => end();
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
      return () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      };
    });
  };

  const onTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    const card = (e.currentTarget as HTMLElement).closest(
      ".fav-row",
    ) as HTMLElement | null;
    if (!card) return;
    startDrag(e.touches[0].clientY, card, (move, end) => {
      const onMove = (ev: TouchEvent) => {
        ev.preventDefault();
        move(ev.touches[0].clientY);
      };
      const onEnd = () => end();
      document.addEventListener("touchmove", onMove, { passive: false });
      document.addEventListener("touchend", onEnd);
      return () => {
        document.removeEventListener("touchmove", onMove);
        document.removeEventListener("touchend", onEnd);
      };
    });
  };

  if (favorites.length === 0) {
    return (
      <div className="empty">
        즐겨찾기한 종목이 없어요.
        <br />
        조회 화면에서 ☆를 눌러 담아 보세요.
      </div>
    );
  }

  return (
    <>
      <div className="hint">손잡이를 잡고 위아래로 끌어 순서를 바꿀 수 있어요.</div>
      <div ref={listRef}>
        {favorites.map((code) => {
          const s = byCode[code];
          if (!s) return null;
          const cls = s.r > 0 ? "up" : s.r < 0 ? "down" : "flat";
          return (
            <div className="fcard fav-row" key={code}>
              <div
                className="grip"
                role="button"
                aria-label={`${s.n} 순서 변경`}
                onMouseDown={onMouseDown}
                onTouchStart={onTouchStart}
              >
                <i />
                <i />
                <i />
              </div>
              <div className="nm">
                <div className="n1">{s.n}</div>
                <div className="n2">
                  {s.c} · {s.m ? "코스닥" : "코스피"} · {s.p.toLocaleString()}원{" "}
                  <span className={cls}>
                    {s.r > 0 ? "+" : ""}
                    {s.r.toFixed(2)}%
                  </span>
                </div>
                <div className="fmet">
                  <span className="chip">
                    시총 <b>{capf(s.cap)}</b>
                  </span>
                  <span className="chip">
                    RSI <b>{numOr(s.rsi, (v) => String(Math.round(v)))}</b>
                  </span>
                  <span className="chip">
                    PBR <b>{numOr(s.pbr, (v) => v.toFixed(2))}</b>
                  </span>
                  <span className="chip">
                    PER <b>{numOr(s.per, (v) => String(Math.round(v)))}</b>
                  </span>
                </div>
              </div>
              <button
                type="button"
                className="st on"
                aria-label={`${s.n} 즐겨찾기 해제`}
                onClick={() => onToggleFavorite(code)}
              >
                ★
              </button>
            </div>
          );
        })}
      </div>
    </>
  );
}
