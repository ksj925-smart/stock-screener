/** screener.json 스키마 (SPEC 7-1) */

export interface Stock {
  /** 종목코드 (6자리) */
  c: string;
  /** 종목명 */
  n: string;
  /** 시장: 0=KOSPI, 1=KOSDAQ */
  m: 0 | 1;
  /** 종가(원) */
  p: number;
  /** 전일 대비 등락률(%) */
  r: number;
  /** 시가총액(조 단위) */
  cap: number;
  /** RSI(14). 결측이면 null */
  rsi: number | null;
  /** PBR. 결측이면 null */
  pbr: number | null;
  /** PER. 적자면 음수 또는 null */
  per: number | null;
}

export interface ScreenerMeta {
  base_date: string;
  updated_at: string;
  count: number;
  excluded: number;
  /** PBR·PER 계산에 채택된 최신 확정 결산연도 (예: "2025"). 구버전 데이터엔 없음 */
  fin_year?: string | null;
}

export interface ScreenerData {
  meta: ScreenerMeta;
  t: Stock[];
}

export type SortKey =
  | "cap"
  | "capa"
  | "rsi"
  | "rsid"
  | "pbr"
  | "pbrd"
  | "per"
  | "perd"
  | "r"
  | "ra";
export type MarketFilter = "all" | "0" | "1";
