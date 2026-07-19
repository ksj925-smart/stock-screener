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
  /**
   * 1이면 최근 3주(15영업일) 가격 무변동 — 거래정지 '추정'.
   * 시세 API에 거래정지 플래그가 없어 가격 무변동을 프록시로 쓴다.
   * 평시 종목은 필드 자체가 없다(용량 절감).
   */
  h?: 1;
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
