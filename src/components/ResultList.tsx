import type { SortKey, Stock } from "../types";
import { capf } from "../lib/filters";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "cap", label: "시가총액 큰 순" },
  { value: "capa", label: "시가총액 작은 순" },
  { value: "rsi", label: "RSI 낮은 순" },
  { value: "pbr", label: "PBR 낮은 순" },
  { value: "per", label: "PER 낮은 순" },
  { value: "r", label: "등락률 높은 순" },
  { value: "ra", label: "등락률 낮은 순" },
];

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
  return (
    <>
      <div className="rbar">
        <div className="ttl">조회 결과 {stocks.length}종목</div>
        <select
          value={sortBy}
          aria-label="정렬 기준"
          onChange={(e) => onSortChange(e.target.value as SortKey)}
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
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
              <div className="row" key={s.c}>
                <div className="ic">{s.n[0]}</div>
                <div className="nm">
                  <div className="n1">{s.n}</div>
                  <div className="n2">
                    {s.c} · {s.m ? "코스닥" : "코스피"} · {capf(s.cap)} · RSI{" "}
                    {numOr(s.rsi, (v) => String(Math.round(v)))} · PBR{" "}
                    {numOr(s.pbr, (v) => v.toFixed(2))} · PER{" "}
                    {numOr(s.per, (v) => String(Math.round(v)))}
                  </div>
                </div>
                <div className="pr">
                  <div className="p1">{s.p.toLocaleString()}원</div>
                  <div className={`p2 ${cls}`}>
                    {s.r > 0 ? "+" : ""}
                    {s.r.toFixed(2)}%
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
