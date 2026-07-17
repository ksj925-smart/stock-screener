import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";

import type { LoadResult } from "./data/loadScreener";
import { formatBaseDate, loadScreenerData } from "./data/loadScreener";
import {
  DEFAULT_RANGES,
  FILTERS,
  SORTERS,
  applyFilters,
  computeHistograms,
  toVal,
  type FilterKey,
  type Ranges,
} from "./lib/filters";
import type { MarketFilter, SortKey, Stock } from "./types";
import { useFavorites } from "./hooks/useFavorites";
import { FilterSlider } from "./components/FilterSlider";
import { CountBar } from "./components/CountBar";
import { ResultList } from "./components/ResultList";
import { FavList } from "./components/FavList";
import { DataFooter } from "./components/DataFooter";
import { BannerAd } from "./components/BannerAd";

type Page = "search" | "fav";

const MARKET_TABS: { value: MarketFilter; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "0", label: "코스피" },
  { value: "1", label: "코스닥" },
];

function App() {
  const [loaded, setLoaded] = useState<LoadResult | null>(null);
  const [page, setPage] = useState<Page>("search");
  const [market, setMarket] = useState<MarketFilter>("all");
  const [noLoss, setNoLoss] = useState(true);
  const [sortBy, setSortBy] = useState<SortKey>("cap");
  const [ranges, setRanges] = useState<Ranges>(DEFAULT_RANGES);
  const { favorites, toggle, reorder } = useFavorites();
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadScreenerData().then(setLoaded);
  }, []);

  const stocks: Stock[] = loaded?.data.t ?? [];

  const byCode = useMemo(() => {
    const m: Record<string, Stock> = {};
    for (const s of stocks) m[s.c] = s;
    return m;
  }, [stocks]);

  const histograms = useMemo(
    () => computeHistograms(stocks, market, noLoss),
    [stocks, market, noLoss],
  );

  const { out, excludedMissing } = useMemo(() => {
    const res = applyFilters(stocks, ranges, market, noLoss);
    res.out.sort(SORTERS[sortBy]);
    return res;
  }, [stocks, ranges, market, noLoss, sortBy]);

  const summaryParts = useMemo(() => {
    const parts: string[] = [];
    if (market !== "all") parts.push(market === "0" ? "코스피" : "코스닥");
    for (const f of FILTERS) {
      const [a, b] = ranges[f.k];
      if (a === 0 && b === 100) continue;
      const lo = f.fmt(toVal(f, a));
      const hi = f.fmt(toVal(f, b));
      parts.push(
        a === 0
          ? `${f.short} ${hi}↓`
          : b === 100
            ? `${f.short} ${lo}↑`
            : `${f.short} ${lo}~${hi}`,
      );
    }
    if (noLoss) parts.push("적자 제외");
    return parts;
  }, [ranges, market, noLoss]);

  const setRange = (k: FilterKey, r: [number, number]) =>
    setRanges((prev) => ({ ...prev, [k]: r }));

  const resetFilters = () => setRanges(DEFAULT_RANGES);

  const switchPage = (p: Page) => {
    setPage(p);
    window.scrollTo(0, 0);
  };

  if (!loaded) {
    return (
      <div className="wrap">
        <div className="loading">불러오는 중…</div>
      </div>
    );
  }

  return (
    <>
      <div className={`wrap${page === "fav" ? " fav" : ""}`}>
        {loaded.isMock && (
          <div className="mock">데이터 준비 중 · 아래 종목은 목데이터입니다</div>
        )}

        <header>
          <h1>{page === "fav" ? "즐겨찾기" : "주식 조건 조회"}</h1>
          <div className="basis">
            {formatBaseDate(loaded.data.meta.base_date)} 종가 기준 · 실시간 아님
          </div>
        </header>

        {page === "search" ? (
          <>
            <div className="tabs" role="tablist" aria-label="시장 선택">
              {MARKET_TABS.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  role="tab"
                  aria-selected={market === t.value}
                  className={`tab${market === t.value ? " on" : ""}`}
                  onClick={() => setMarket(t.value)}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="filters">
              {FILTERS.map((f) => (
                <FilterSlider
                  key={f.k}
                  def={f}
                  range={ranges[f.k]}
                  histogram={histograms[f.k]}
                  onChange={(r) => setRange(f.k, r)}
                />
              ))}
              <div className="f">
                <div className="tg">
                  <span>적자 회사 빼고 보기</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={noLoss}
                    aria-label="적자 회사 빼고 보기"
                    className={`sw${noLoss ? " on" : ""}`}
                    onClick={() => setNoLoss((v) => !v)}
                  />
                </div>
              </div>
            </div>

            <button type="button" className="reset" onClick={resetFilters}>
              조건 초기화
            </button>

            <BannerAd />

            <ResultList
              stocks={out}
              favorites={favorites}
              sortBy={sortBy}
              noLoss={noLoss}
              excludedMissing={excludedMissing}
              onSortChange={setSortBy}
              onToggleFavorite={toggle}
              listRef={listRef}
            />
          </>
        ) : (
          <FavList
            favorites={favorites}
            byCode={byCode}
            onToggleFavorite={toggle}
            onReorder={reorder}
          />
        )}

        <DataFooter finYear={loaded.data.meta.fin_year} />
      </div>

      {page === "search" && (
        <CountBar
          count={out.length}
          summaryParts={summaryParts}
          onGoResults={() =>
            listRef.current?.scrollIntoView({
              behavior: "smooth",
              block: "start",
            })
          }
        />
      )}

      <nav>
        <button
          type="button"
          className={page === "search" ? "on" : ""}
          onClick={() => switchPage("search")}
        >
          <span aria-hidden="true">⌕</span>조회
        </button>
        <button
          type="button"
          className={page === "fav" ? "on" : ""}
          onClick={() => switchPage("fav")}
        >
          <span aria-hidden="true">★</span>즐겨찾기
          {favorites.length > 0 && (
            <em className="badge">{favorites.length}</em>
          )}
        </button>
      </nav>
    </>
  );
}

export default App;
