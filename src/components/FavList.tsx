import { useEffect, useMemo, useRef, useState } from "react";
import type { Stock } from "../types";
import type { FavCategory, FavItem } from "../hooks/useFavorites";
import { capf } from "../lib/filters";
import { CategorySheet } from "./CategorySheet";

interface FavListProps {
  favItems: FavItem[];
  categories: FavCategory[];
  byCode: Record<string, Stock>;
  onToggleFavorite: (code: string) => void;
  /** 화면에 보이는 목록 안에서 from→to 재정렬 */
  onReorder: (visibleCodes: string[], from: number, to: number) => void;
  onSetCategory: (code: string, cat: string | null) => void;
  onCreateCategory: (name: string) => string | null;
  onDeleteCategory: (id: string) => void;
}

const numOr = (v: number | null, fmt: (n: number) => string) =>
  v == null ? "—" : fmt(v);

// 전체 / 미분류 / 개별 카테고리 id
type CatFilter = "all" | "none" | string;

/**
 * 즐겨찾기 목록 — grip 드래그로 순서 변경(터치·마우스), 카테고리 필터·지정 (SPEC 6장 + v1.2).
 * 자동 정렬 없음: 순서는 오직 사용자가 정한다.
 */
export function FavList({
  favItems,
  categories,
  byCode,
  onToggleFavorite,
  onReorder,
  onSetCategory,
  onCreateCategory,
  onDeleteCategory,
}: FavListProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState<CatFilter>("all");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  // 카테고리 지정 시트 대상 종목코드
  const [catTarget, setCatTarget] = useState<string | null>(null);

  const catById = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  );

  // 선택한 카테고리가 삭제되면 전체로 되돌린다
  useEffect(() => {
    if (filter !== "all" && filter !== "none" && !catById.has(filter)) {
      setFilter("all");
    }
  }, [filter, catById]);

  // 화면에 실제로 렌더되는 항목 = 카테고리 필터 통과 + 현재 데이터에 종목 존재
  const displayed = useMemo(
    () =>
      favItems.filter((it) => {
        if (!byCode[it.code]) return false;
        if (filter === "all") return true;
        if (filter === "none") return it.cat == null;
        return it.cat === filter;
      }),
    [favItems, byCode, filter],
  );

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
      if (cur !== from) {
        // 현재 보이는 목록 기준의 인덱스를 전달한다
        onReorder(
          displayed.map((i) => i.code),
          from,
          cur,
        );
      }
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

  const confirmCreate = () => {
    const id = onCreateCategory(newName);
    if (id) {
      setNewName("");
      setCreating(false);
      setFilter(id);
    }
  };

  if (favItems.length === 0) {
    return (
      <div className="empty">
        즐겨찾기한 종목이 없어요.
        <br />
        조회 화면에서 ☆를 눌러 담아 보세요.
      </div>
    );
  }

  const catTargetItem =
    catTarget != null ? favItems.find((i) => i.code === catTarget) : undefined;

  return (
    <>
      {/* 카테고리(폴더) 필터 칩 — 분류는 선택 사항, 기본은 전체 */}
      <div className="catbar" role="tablist" aria-label="폴더 선택">
        <button
          type="button"
          role="tab"
          aria-selected={filter === "all"}
          className={`catchip${filter === "all" ? " on" : ""}`}
          onClick={() => setFilter("all")}
        >
          전체
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={filter === "none"}
          className={`catchip${filter === "none" ? " on" : ""}`}
          onClick={() => setFilter("none")}
        >
          미분류
        </button>
        {categories.map((c) => (
          <button
            key={c.id}
            type="button"
            role="tab"
            aria-selected={filter === c.id}
            className={`catchip${filter === c.id ? " on" : ""}`}
            onClick={() => setFilter(c.id)}
          >
            <span
              className="cat-dot"
              style={{ background: c.color }}
              aria-hidden="true"
            />
            {c.name}
          </button>
        ))}
        <button
          type="button"
          className="catchip add"
          aria-label="새 폴더 만들기"
          onClick={() => setCreating((v) => !v)}
        >
          ＋ 폴더
        </button>
      </div>

      {creating && (
        <div className="cond-saverow catcreate">
          <input
            type="text"
            className="txtin"
            value={newName}
            placeholder="새 폴더 이름"
            aria-label="새 폴더 이름"
            maxLength={12}
            autoFocus
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") confirmCreate();
            }}
          />
          <button
            type="button"
            className="txtin-btn"
            disabled={!newName.trim()}
            onClick={confirmCreate}
          >
            만들기
          </button>
        </div>
      )}

      {/* 특정 폴더를 보는 중이면 삭제 가능 (종목은 미분류로 돌아감) */}
      {filter !== "all" && filter !== "none" && catById.has(filter) && (
        <button
          type="button"
          className="catdel"
          onClick={() => {
            onDeleteCategory(filter);
            setFilter("all");
          }}
        >
          ‘{catById.get(filter)!.name}’ 폴더 삭제
        </button>
      )}

      <div className="hint">
        손잡이를 잡고 위아래로 끌어 순서를 바꿀 수 있어요.
      </div>

      {displayed.length === 0 ? (
        <div className="empty">이 폴더에 담긴 종목이 없어요.</div>
      ) : (
        <div ref={listRef}>
          {displayed.map((it) => {
            const s = byCode[it.code];
            const cls = s.r > 0 ? "up" : s.r < 0 ? "down" : "flat";
            const cat = it.cat ? catById.get(it.cat) : undefined;
            return (
              <div className="fcard fav-row" key={it.code}>
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
                    {s.c} · {s.m ? "코스닥" : "코스피"} ·{" "}
                    {s.p.toLocaleString()}원{" "}
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
                    <button
                      type="button"
                      className={`chip catpill${cat ? " set" : ""}`}
                      aria-label={`${s.n} 폴더 지정`}
                      onClick={() => setCatTarget(it.code)}
                    >
                      {cat ? (
                        <>
                          <span
                            className="cat-dot"
                            style={{ background: cat.color }}
                            aria-hidden="true"
                          />
                          {cat.name}
                        </>
                      ) : (
                        "＋ 폴더"
                      )}
                    </button>
                  </div>
                </div>
                <button
                  type="button"
                  className="st on"
                  aria-label={`${s.n} 즐겨찾기 해제`}
                  onClick={() => onToggleFavorite(it.code)}
                >
                  ★
                </button>
              </div>
            );
          })}
        </div>
      )}

      <CategorySheet
        code={catTarget}
        name={catTarget != null ? (byCode[catTarget]?.n ?? "") : ""}
        currentCat={catTargetItem?.cat ?? null}
        categories={categories}
        onSelect={(cat) => {
          if (catTarget != null) onSetCategory(catTarget, cat);
        }}
        onCreate={onCreateCategory}
        onClose={() => setCatTarget(null)}
      />
    </>
  );
}
