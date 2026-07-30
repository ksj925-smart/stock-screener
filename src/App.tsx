import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import "./App.css";

import type { LoadResult } from "./data/loadScreener";
import { formatBaseDate, loadScreenerData } from "./data/loadScreener";
import {
  DEFAULT_RANGES,
  FILTERS,
  SORTERS,
  applyFilters,
  computeHistograms,
  searchStocks,
  toVal,
  type FilterKey,
  type Ranges,
} from "./lib/filters";
import type { MarketFilter, SortKey, Stock } from "./types";
import { FAV_LIMIT, useFavorites } from "./hooks/useFavorites";
import { useConditions, type SavedCondition } from "./hooks/useConditions";
import { track } from "./lib/analytics";
import { SearchBar } from "./components/SearchBar";
import { FilterSlider } from "./components/FilterSlider";
import { CountBar } from "./components/CountBar";
import { ResultList } from "./components/ResultList";
import { FavList } from "./components/FavList";
import { ConditionSheet } from "./components/ConditionSheet";
import { ChartSheet } from "./components/ChartSheet";
import { Toast } from "./components/Toast";
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
  // 거래정지 추정(h) 제외 토글. v1.2에서 기본 ON으로 변경 — 거래정지 종목이
  // 결과에 섞이면 혼란을 주기 때문. 사용자가 끌 수 있는 토글은 그대로 유지한다.
  const [noHalt, setNoHalt] = useState(true);
  const [haltTipOpen, setHaltTipOpen] = useState(false);
  const [sortBy, setSortBy] = useState<SortKey>("cap");
  const [ranges, setRanges] = useState<Ranges>(DEFAULT_RANGES);
  const [query, setQuery] = useState("");
  const [condSheetOpen, setCondSheetOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  /** 3개월 주가 차트를 열 종목. null이면 시트가 닫힌 상태 */
  const [chartStock, setChartStock] = useState<Stock | null>(null);
  const {
    favorites,
    favItems,
    categories,
    toggle,
    reorderVisible,
    setCategory,
    createCategory,
    deleteCategory,
  } = useFavorites();
  const { conditions, save: saveCondition, remove: removeCondition } =
    useConditions();
  const listRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // 검색어를 입력한 뒤 슬라이더·토글·탭 등 필터 컨트롤을 만지기 시작하면,
  // 검색 input의 포커스를 명시적으로 놓아 모바일 키보드가 다시 튀어나오지
  // 않게 한다(조건 조작 = 입력 종료로 간주). 검색어(query) 상태는 그대로 두므로
  // 입력값은 유지되고, 검색창을 다시 탭하면 정상적으로 키보드가 올라온다.
  // 오직 검색 input만 blur한다(다른 활성 요소는 건드리지 않음). 검색창 안쪽을
  // 탭할 때는 포커스를 놓지 않는다.
  const blurSearchOnFilterInteract = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if ((e.target as HTMLElement).closest(".searchbar")) return;
      searchRef.current?.blur();
    },
    [],
  );

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

  const searching = query.trim().length > 0;

  // 검색만 적용한 부분집합(시장 탭 범위는 존중, 슬라이더·토글 무시).
  // "'삼성' 포함 N종목"의 N과, 빈 상태(매칭 0 vs 조건이 다 걸러냄) 구분에 쓴다.
  const searchMatched = useMemo(
    () => (searching ? searchStocks(stocks, market, query) : null),
    [searching, stocks, market, query],
  );
  const searchMatchCount = searchMatched?.length ?? 0;

  // 실제 결과 M = (검색 부분집합 또는 전체) 에 슬라이더·토글·시장 조건을 적용.
  // 검색어가 있으면 "검색 AND 조건", 없으면 순수 조건 필터. 정렬은 공통.
  const { out, excludedMissing } = useMemo(() => {
    const base = searchMatched ?? stocks;
    const res = applyFilters(base, ranges, market, noLoss, noHalt);
    res.out.sort(SORTERS[sortBy]);
    return res;
  }, [searchMatched, stocks, ranges, market, noLoss, noHalt, sortBy]);

  // 조건 요약(시장 제외) — 검색 시 "N종목 중 …" 뒤에 붙인다.
  const conditionParts = useMemo(() => {
    const parts: string[] = [];
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
  }, [ranges, noLoss, noHalt]);

  // 하단 카운트바·필터 로깅용 전체 요약(시장 포함).
  const summaryParts = useMemo(() => {
    const parts: string[] = [];
    if (market !== "all") parts.push(market === "0" ? "코스피" : "코스닥");
    return [...parts, ...conditionParts];
  }, [market, conditionParts]);

  // ── 이벤트 로깅 (토스 콘솔 전환 지표용) ─────────────────────────────
  // 조건 필터 적용: summaryParts 길이를 "지금 걸린 조건 수"로 쓴다.
  // input[type=range] 드래그로 onChange가 수십 번 터지므로 500ms 디바운스.
  const filterCount = summaryParts.length;
  const filterKey = summaryParts.join("|");
  const initialFilterKeyRef = useRef(filterKey);

  useEffect(() => {
    if (filterKey === initialFilterKeyRef.current) return; // 사용자 조작이 아님
    if (filterCount === 0) return; // 조건을 모두 푼 상태는 '적용'이 아니다
    const id = setTimeout(() => {
      track("filter_apply", { filter_count: filterCount });
    }, 500);
    return () => clearTimeout(id);
  }, [filterKey, filterCount]);

  // 개별 종목 검색: 세션당 1회, 검색어는 로깅하지 않는다(개인정보 원칙).
  const searchLoggedRef = useRef(false);
  useEffect(() => {
    if (!searchLoggedRef.current && query.trim()) {
      searchLoggedRef.current = true;
      // 검색어 문자열은 넣지 않는다 — 매칭 종목 개수만 기록(개인정보 원칙).
      track("search_use", { match_count: searchMatchCount });
    }
  }, [query, searchMatchCount]);

  // 결과 목록 조회: 세션당 1회. 버튼과 스크롤 도달 중 먼저 발생한 쪽만 발화.
  const resultViewedRef = useRef(false);
  const outCountRef = useRef(0);

  useEffect(() => {
    outCountRef.current = out.length;
  }, [out.length]);

  const trackResultView = useCallback(() => {
    if (resultViewedRef.current) return;
    resultViewedRef.current = true;
    track("result_view", { result_count: outCountRef.current });
  }, []);

  useEffect(() => {
    const el = listRef.current;
    if (!el || resultViewedRef.current) return;
    if (typeof IntersectionObserver === "undefined") return; // 구형 WebView 방어
    // threshold 0: 전종목 목록처럼 높이가 큰 요소는 1%(threshold 0.01)에도
    // 도달하지 못해 영원히 발화하지 않는다. 한 픽셀이라도 걸치면 발화.
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          trackResultView();
          io.disconnect();
        }
      },
      { threshold: 0 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [page, loaded, trackResultView]);
  // ────────────────────────────────────────────────────────────────

  const setRange = (k: FilterKey, r: [number, number]) =>
    setRanges((prev) => ({ ...prev, [k]: r }));

  const resetFilters = () => setRanges(DEFAULT_RANGES);

  // 즐겨찾기 담기 — 20개 한도에 걸리면 토스트로 안내(앱은 죽지 않는다).
  const handleToggleFavorite = useCallback(
    (code: string) => {
      if (toggle(code) === "limit") {
        setToast(`즐겨찾기는 최대 ${FAV_LIMIT}개까지 담을 수 있어요.`);
      }
    },
    [toggle],
  );

  // 저장된 조건 불러오기 — 검색은 해제하고 필터 상태를 통째로 교체한다.
  const applyCondition = useCallback((c: SavedCondition) => {
    setMarket(c.market);
    setNoLoss(c.noLoss);
    setNoHalt(c.noHalt);
    setRanges(c.ranges);
    setQuery("");
    track("condition_load"); // 발생 사실만
  }, []);

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

  // 검색 시 두 단계 노출: "'삼성' 포함 N종목 중" + 조건 요약. 큰 숫자(M)와
  // 합쳐 "N종목 중 조건 만족 M종목"으로 읽힌다.
  const countSummary = searching
    ? [`'${query.trim()}' 포함 ${searchMatchCount}종목 중`, ...conditionParts]
    : summaryParts;

  return (
    <>
      <div
        className={`wrap${page === "fav" ? " fav" : ""}`}
        onPointerDownCapture={blurSearchOnFilterInteract}
      >
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
            <SearchBar value={query} onChange={setQuery} inputRef={searchRef} />

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

            <div className="actionrow">
              <button type="button" className="reset" onClick={resetFilters}>
                조건 초기화
              </button>
              <button
                type="button"
                className="reset condbtn"
                onClick={() => setCondSheetOpen(true)}
              >
                내 조건
                {conditions.length > 0 && (
                  <em className="cbadge">{conditions.length}</em>
                )}
              </button>
            </div>

            <ResultList
              stocks={out}
              favorites={favorites}
              sortBy={sortBy}
              noLoss={noLoss}
              excludedMissing={excludedMissing}
              query={searching ? query.trim() : undefined}
              searchMatchCount={searchMatchCount}
              onSortChange={setSortBy}
              onToggleFavorite={handleToggleFavorite}
              onSelectStock={setChartStock}
              listRef={listRef}
            />
          </>
        ) : (
          <FavList
            favItems={favItems}
            categories={categories}
            byCode={byCode}
            onToggleFavorite={handleToggleFavorite}
            onSelectStock={setChartStock}
            onReorder={reorderVisible}
            onSetCategory={setCategory}
            onCreateCategory={createCategory}
            onDeleteCategory={deleteCategory}
          />
        )}

        <DataFooter finYear={loaded.data.meta.fin_year} />
      </div>

      {page === "search" && (
        <CountBar
          count={out.length}
          summaryParts={countSummary}
          onGoResults={() => {
            trackResultView();
            listRef.current?.scrollIntoView({
              behavior: "smooth",
              block: "start",
            });
          }}
        />
      )}

      <ConditionSheet
        open={condSheetOpen}
        conditions={conditions}
        onLoad={applyCondition}
        onDelete={removeCondition}
        onSave={(name) =>
          saveCondition(name, { market, noLoss, noHalt, ranges })
        }
        onClose={() => setCondSheetOpen(false)}
      />

      <ChartSheet stock={chartStock} onClose={() => setChartStock(null)} />

      <Toast message={toast} onDone={() => setToast(null)} />

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
