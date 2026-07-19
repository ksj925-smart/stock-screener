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
// 광고(BannerAd)는 1차 출시 범위에서 제외 — 사업자 등록 후 후속 업데이트로 복원
// (import하지 않아야 테스트 광고 관련 코드가 번들에서 완전히 빠진다)

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
  // 거래정지 추정(h) 제외 토글. 기본 OFF — 적자 제외와 달리 지표가 성립하지
  // 않는 경우가 아니라 '추정'이므로, 켤지는 사용자가 정한다.
  const [noHalt, setNoHalt] = useState(false);
  const [haltTipOpen, setHaltTipOpen] = useState(false);
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
    () => computeHistograms(stocks, market, noLoss, noHalt),
    [stocks, market, noLoss, noHalt],
  );

  const { out, excludedMissing } = useMemo(() => {
    const res = applyFilters(stocks, ranges, market, noLoss, noHalt);
    res.out.sort(SORTERS[sortBy]);
    return res;
  }, [stocks, ranges, market, noLoss, noHalt, sortBy]);

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
    if (noHalt) parts.push("거래없음 제외");
    return parts;
  }, [ranges, market, noLoss, noHalt]);

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
          <h1>{page === "fav" ? "즐겨찾기" : "내 조건 주식찾기"}</h1>
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
              {/* 토글 2개를 한 줄에 나란히 — 세로 스크롤 부담을 줄인다.
                  각 셀은 [라벨(+ⓘ)] 위 / [스위치] 아래 구조라 375px에서도
                  라벨이 잘리지 않는다. */}
              <div className="f tgrid">
                <div className="tgcell">
                  <div className="tglab">적자 회사 빼기</div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={noLoss}
                    aria-label="적자 회사 빼기"
                    className={`sw${noLoss ? " on" : ""}`}
                    onClick={() => setNoLoss((v) => !v)}
                  />
                </div>
                <div className="tgcell">
                  <div className="tglab">
                    거래 없는 종목 빼기
                    <button
                      type="button"
                      className={`info${haltTipOpen ? " on" : ""}`}
                      aria-label={`거래 없는 종목 빼기 설명 ${haltTipOpen ? "닫기" : "보기"}`}
                      aria-expanded={haltTipOpen}
                      onClick={() => setHaltTipOpen((v) => !v)}
                    >
                      i
                    </button>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={noHalt}
                    aria-label="거래 없는 종목 빼기"
                    className={`sw${noHalt ? " on" : ""}`}
                    onClick={() => setNoHalt((v) => !v)}
                  />
                </div>
                {haltTipOpen && (
                  <div className="tip on tgtip">
                    최근 3주 동안 주가가 한 번도 변하지 않은 종목이에요. 거래정지
                    상태일 수 있어요.
                  </div>
                )}
              </div>
            </div>

            <button type="button" className="reset" onClick={resetFilters}>
              조건 초기화
            </button>

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
