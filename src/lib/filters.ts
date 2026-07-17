import type { Stock } from "../types";

const L = Math.log10;

export const BINS = 32;
export const HIST_HEIGHT = 38;

export type FilterKey = "cap" | "rsi" | "pbr" | "per" | "r";

export interface FilterDef {
  k: FilterKey;
  name: string;
  term: string;
  short: string;
  /** 방향성(파랑→빨강 heat) 여부 */
  dir: boolean;
  tip: string;
  log: boolean;
  min: number;
  max: number;
  fmt: (v: number) => string;
  ticks: string[];
}

/** 슬라이더 명세 (SPEC 5장) — 배당수익률은 라이선스 문제로 제외 */
export const FILTERS: FilterDef[] = [
  {
    k: "cap",
    name: "회사 크기",
    term: "시가총액",
    short: "시총",
    dir: false,
    tip: "회사의 전체 가치예요. 주가 × 발행 주식 수로 계산해요. 클수록 대기업입니다.",
    log: true,
    min: L(0.01),
    max: L(500),
    fmt: (v) =>
      v >= 1
        ? v >= 100
          ? Math.round(v) + "조"
          : v.toFixed(1) + "조"
        : Math.round(v * 10000) + "억",
    ticks: ["100억", "1천억", "1조", "10조", "100조+"],
  },
  {
    k: "rsi",
    name: "많이 떨어졌나",
    term: "RSI",
    short: "RSI",
    dir: true,
    tip: "최근 주가가 오른 날과 내린 날의 힘을 비교한 값이에요. 0에 가까울수록 많이 팔려서 떨어진 상태(파란쪽), 100에 가까울수록 많이 사들여서 오른 상태(빨간쪽)로 봐요. 보통 30 아래를 과매도, 70 위를 과열이라고 부릅니다.",
    log: false,
    min: 0,
    max: 100,
    fmt: (v) => String(Math.round(v)),
    ticks: ["0", "30 과매도", "50", "70 과열", "100"],
  },
  {
    k: "pbr",
    name: "자산 대비 주가",
    term: "PBR",
    short: "PBR",
    dir: false,
    tip: "회사가 가진 순자산에 비해 주가가 몇 배인지예요. 1배면 자산만큼의 가격, 1배 아래면 자산보다 싸게 거래되는 중입니다.",
    log: true,
    min: L(0.1),
    max: L(10),
    fmt: (v) => (v >= 9.9 ? "10배+" : v.toFixed(v < 1 ? 2 : 1) + "배"),
    ticks: ["0.1배", "0.5배", "1배", "3배", "10배+"],
  },
  {
    k: "per",
    name: "이익 대비 주가",
    term: "PER",
    short: "PER",
    dir: false,
    tip: "회사가 1년에 버는 이익에 비해 주가가 몇 배인지예요. 낮을수록 벌어들이는 돈에 비해 주가가 싸다는 뜻입니다.",
    log: true,
    min: L(1),
    max: L(200),
    fmt: (v) => (v >= 198 ? "200배+" : Math.round(v) + "배"),
    ticks: ["1배", "5배", "20배", "60배", "200배+"],
  },
  {
    k: "r",
    name: "최근 등락률",
    term: "전일 대비",
    short: "등락률",
    dir: true,
    tip: "전 영업일 종가와 비교한 주가 변동 폭이에요. 파란쪽이 하락, 빨간쪽이 상승입니다.",
    log: false,
    min: -30,
    max: 30,
    fmt: (v) => (v > 0 ? "+" : "") + v.toFixed(0) + "%",
    ticks: ["-30%", "-10%", "0%", "+10%", "+30%"],
  },
];

/** 슬라이더 위치(0~100%) → 실제 값 */
export function toVal(f: FilterDef, p: number): number {
  const t = f.min + ((f.max - f.min) * p) / 100;
  return f.log ? Math.pow(10, t) : t;
}

/** 실제 값 → 슬라이더 위치(0~100%) */
export function toPos(f: FilterDef, v: number): number {
  const t = f.log ? Math.log10(Math.max(v, 1e-6)) : v;
  return Math.max(0, Math.min(100, ((t - f.min) / (f.max - f.min)) * 100));
}

/** 파랑→보라→빨강 heat 색상 (t: 0~1) */
export function heat(t: number): string {
  const A = [76, 141, 255];
  const M = [140, 127, 196];
  const B = [245, 69, 92];
  const mx = (x: number, y: number, u: number) => Math.round(x + (y - x) * u);
  let c: number[];
  if (t < 0.5) {
    const u = t / 0.5;
    c = [mx(A[0], M[0], u), mx(A[1], M[1], u), mx(A[2], M[2], u)];
  } else {
    const u = (t - 0.5) / 0.5;
    c = [mx(M[0], B[0], u), mx(M[1], B[1], u), mx(M[2], B[2], u)];
  }
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

/** 시가총액(조) 표시 */
export const capf = (v: number) =>
  v >= 1 ? v.toFixed(1) + "조" : Math.round(v * 10000) + "억";

export type Ranges = Record<FilterKey, [number, number]>;

export const DEFAULT_RANGES: Ranges = {
  cap: [0, 100],
  rsi: [0, 100],
  pbr: [0, 100],
  per: [0, 100],
  r: [0, 100],
};

/** 결측 지표가 하나라도 있는 종목인지 */
export function hasMissing(s: Stock): boolean {
  return s.rsi == null || s.pbr == null || s.per == null;
}

/**
 * 필터 적용.
 * - 슬라이더 끝(0/100)은 해당 방향 제한 없음 (SPEC 5-1)
 * - 결측 지표는 해당 필터가 걸려 있을 때 제외
 */
export function applyFilters(
  stocks: Stock[],
  ranges: Ranges,
  market: "all" | "0" | "1",
  noLoss: boolean,
): { out: Stock[]; excludedMissing: number } {
  const rng = {} as Record<FilterKey, [number, number]>;
  for (const f of FILTERS) {
    rng[f.k] = [toVal(f, ranges[f.k][0]), toVal(f, ranges[f.k][1])];
  }
  let excludedMissing = 0;
  const out = stocks.filter((s) => {
    if (market !== "all" && s.m !== +market) return false;
    if (noLoss && (s.per == null || s.per <= 0)) return false;
    for (const f of FILTERS) {
      const [a, b] = rng[f.k];
      const [pa, pb] = ranges[f.k];
      const active = pa !== 0 || pb !== 100;
      const v = s[f.k];
      if (!active) continue;
      if (v == null) {
        excludedMissing++;
        return false;
      }
      if (pa !== 0 && v < a) return false;
      if (pb !== 100 && v > b) return false;
    }
    return true;
  });
  return { out, excludedMissing };
}

/** 히스토그램 bin 계산 (시장/적자 필터만 적용된 universe 기준) */
export function computeHistograms(
  stocks: Stock[],
  market: "all" | "0" | "1",
  noLoss: boolean,
): Record<FilterKey, number[]> {
  const uni = stocks.filter((s) => {
    if (market !== "all" && s.m !== +market) return false;
    if (noLoss && (s.per == null || s.per <= 0)) return false;
    return true;
  });
  const hd = {} as Record<FilterKey, number[]>;
  for (const f of FILTERS) {
    const c = new Array(BINS).fill(0);
    for (const s of uni) {
      const v = s[f.k];
      if (v == null) continue;
      let b = Math.floor((toPos(f, v) / 100) * BINS);
      if (b >= BINS) b = BINS - 1;
      if (b < 0) b = 0;
      c[b]++;
    }
    hd[f.k] = c;
  }
  return hd;
}

/**
 * 정렬 함수. RSI·PBR·PER은 낮은 순/높은 순을 대칭으로 제공한다.
 * 앱이 "낮은 값이 좋다"는 가치 판단을 내장하지 않기 위함 (판단하지 않는 조회 도구).
 * 결측(null)은 방향과 무관하게 항상 맨 뒤로 보낸다.
 */
export const SORTERS: Record<string, (x: Stock, y: Stock) => number> = {
  cap: (x, y) => y.cap - x.cap, // 시총 큰 순
  capa: (x, y) => x.cap - y.cap, // 시총 작은 순
  rsi: (x, y) => (x.rsi ?? Infinity) - (y.rsi ?? Infinity), // RSI 낮은 순
  rsid: (x, y) => (y.rsi ?? -Infinity) - (x.rsi ?? -Infinity), // RSI 높은 순
  pbr: (x, y) => (x.pbr ?? Infinity) - (y.pbr ?? Infinity), // PBR 낮은 순
  pbrd: (x, y) => (y.pbr ?? -Infinity) - (x.pbr ?? -Infinity), // PBR 높은 순
  per: (x, y) => (x.per ?? Infinity) - (y.per ?? Infinity), // PER 낮은 순
  perd: (x, y) => (y.per ?? -Infinity) - (x.per ?? -Infinity), // PER 높은 순
  r: (x, y) => y.r - x.r, // 등락률 높은 순
  ra: (x, y) => x.r - y.r, // 등락률 낮은 순
};
