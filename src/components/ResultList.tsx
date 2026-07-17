import { useState } from "react";
import type { SortKey, Stock } from "../types";
import { capf } from "../lib/filters";
import { SortSheet, sortLabel } from "./SortSheet";

interface ResultListProps {
  stocks: Stock[];
  favorites: string[];
  sortBy: SortKey;
  noLoss: boolean;
  excludedMissing: number;
  onSortChange: (v: SortKey) => void;
  onToggleFavorite: (code: string) => void;
  listRef: React.Ref<HTMLDivElement>;
}

const numOr = (v: number | null, fmt: (n: number) => string) =>
  v == null ? "—" : fmt(v);

export function ResultList({
  stocks,
  favorites,
  sortBy,
  noLoss,
  excludedMissing,
  onSortChange,
  onToggleFavorite,
  listRef,
}: ResultListProps) {
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <>
      <div className="rbar">
        <div className="ttl">조회 결과 {stocks.length}종목</div>
        <button
          type="button"
          className="sortbtn"
          aria-label={`정렬 기준: ${sortLabel(sortBy)}`}
          aria-haspopup="listbox"
          onClick={() => setSheetOpen(true)}
        >
          {sortLabel(sortBy)}
          <span className="caret" aria-hidden="true">
            ▾
          </span>
        </button>
      </div>
      <SortSheet
        open={sheetOpen}
        value={sortBy}
        onSelect={onSortChange}
        onClose={() => setSheetOpen(false)}
      />
      <div ref={listRef}>
        {stocks.length === 0 ? (
          <div className="empty">
            조건에 맞는 종목이 없어요.
            <br />
            막대가 모여 있는 구간으로 슬라이더를 옮겨 보세요.
          </div>
        ) : (
          stocks.map((s) => {
            const cls = s.r > 0 ? "up" : s.r < 0 ? "down" : "flat";
            const on = favorites.includes(s.c);
            return (
              <div className="fcard res" key={s.c}>
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
                  className={`st${on ? " on" : ""}`}
                  aria-label={on ? `${s.n} 즐겨찾기 해제` : `${s.n} 즐겨찾기 담기`}
                  onClick={() => onToggleFavorite(s.c)}
                >
                  {on ? "★" : "☆"}
                </button>
              </div>
            );
          })
        )}
      </div>
      <div className="excl">
        {[
          noLoss ? "적자 회사는 결과에서 제외했어요" : "",
          excludedMissing > 0
            ? `재무 데이터 없는 ${excludedMissing}개 종목 제외`
            : "",
        ]
          .filter(Boolean)
          .join(" · ")}
      </div>
    </>
  );
}
