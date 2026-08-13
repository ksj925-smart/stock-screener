/**
 * 종목별 3개월(최대 60영업일) 종가 시계열 로더.
 *
 * 파이프라인(build_series.py)이 docs/series/{code}.json으로 생성해
 * Pages 아티팩트로 배포한다. 종목을 클릭할 때만 해당 파일 1개(~1KB)를
 * 받으므로 첫 로딩(screener.json)은 그대로 가볍다.
 *
 * 규제 원칙: SPEC.md 3장 참고. 2026-08-XX 승인(SPEC.md 부록 A)으로
 *    볼린저밴드 필드 추가가 예외적으로 허용됨 — 그 외 파생값(마커·목표가 등)은
 *    여전히 여기서 계산하지 않는다. 계산하는 순간 조회 도구가 아니게 된다.
 */

/**
 * series/{code}.json 스키마 — b:기준일, d:날짜 축, p:종가.
 *
 * rsi14~bpb(지표 상세 테이블용, 기준일 시점 스냅샷 1개씩)와 bm/bu/bl(볼린저밴드,
 * d/p와 같은 길이의 병렬 배열)은 2026-08 승인(SPEC.md 부록 A)으로 추가됐다.
 * bpb(볼린저 %B)는 원래 승인 목록에 있었으나 설계 단계에서 누락됐다가
 * 재확인 후 추가됐다. pdi(+DI)는 최초 설계 시 승인 범위가 불명확해 계산은
 * 하되 반환하지 않았다가, 앱인토스 상담원 재확인으로 표시 가능함이 확인돼
 * 추가됐다 — 배포 캐시에 아직 이 필드가 없는 구버전 JSON이 있을
 * 수 있으므로 다른 스냅샷 지표와 동일하게 optional로 둔다.
 * rsi14·mfi20은 RSI(14)/(20)·MFI(14)/(20) 병기(SPEC.md 부록 A, 2026-08-11,
 * 운영자 직접 판단)로 추가됐다 — 새 지표가 아니라 기존 rsi()/mfi()를 다른
 * 기간으로 한 번 더 호출한 값이다.
 * 전부 optional로 둔 이유: 배포 캐시에 이 필드가 없던 구버전 JSON이 브라우저에
 * 남아있을 수 있어서다 — 없으면 "그 지표는 표시 안 함"으로만 처리하고 죽지
 * 않아야 한다(신규 fetch 실패해도 앱이 죽으면 안 된다는 원칙과 같은 맥락).
 */
export interface SeriesData {
  b: string;
  d: string[];
  p: number[];
  /** RSI(14) — screener.json 필터가 쓰는 것과 동일한 공식(기간 14). RSI(20)과
   * 병기(SPEC.md 부록 A, 2026-08-11)하며 새 계산 로직이 아니라 기존 rsi()를
   * 다른 기간으로 한 번 더 호출한 값이다. */
  rsi14?: number | null;
  rsi20?: number | null;
  mfi?: number | null;
  /** MFI(20) — RSI(14)/(20) 병기 전례를 그대로 적용해 추가(SPEC.md 부록 A,
   * 2026-08-11). mfi()가 이미 period를 받으므로 새 함수 없이 기간만 다르게
   * 호출한 값이다. */
  mfi20?: number | null;
  cci?: number | null;
  adx?: number | null;
  /** +DI — 상승 방향 움직임의 강도(0~100). ADX 계산 과정에서 나오는 값을
   * -DI(mdi)와 함께 반환한다(pipeline/indicators.py의 adx() 참고). */
  pdi?: number | null;
  mdi?: number | null;
  atr?: number | null;
  /** 볼린저 %B — (종가-하단)/(상단-하단), 0~1 스케일(범위 밖도 가능).
   * 원래 승인 목록에 있었으나 설계 단계에서 누락됐다가 재추가됨(SPEC.md 부록 A). */
  bpb?: number | null;
  bm?: (number | null)[];
  bu?: (number | null)[];
  bl?: (number | null)[];
}

/** 차트에 필요한 최소 포인트 수. 이보다 적으면 "데이터가 충분하지 않아요". */
export const MIN_POINTS = 5;

/**
 * screener.json URL에서 형제 경로인 series/ 를 유도한다.
 * (.../screener.json → .../series/005930.json)
 * 별도 환경변수를 새로 두지 않아 배포 URL이 한 곳에서만 관리된다.
 */
function seriesUrl(code: string): string | undefined {
  const base: string | undefined = import.meta.env.VITE_SCREENER_URL;
  if (!base) return undefined;
  return base.replace(/[^/]+$/, `series/${encodeURIComponent(code)}.json`);
}

/** 같은 종목을 다시 열 때 재요청하지 않도록 세션 내 메모리 캐시. */
const cache = new Map<string, SeriesData>();

/**
 * 종목 시계열을 가져온다. 실패하면 null을 반환한다(throw하지 않음).
 * 차트 하나 때문에 앱이 죽으면 안 되므로 모든 예외를 여기서 흡수한다.
 */
export async function loadSeries(code: string): Promise<SeriesData | null> {
  const cached = cache.get(code);
  if (cached) return cached;

  const url = seriesUrl(code);
  if (!url) return null; // URL 미설정(로컬 목데이터 모드)

  try {
    const res = await fetch(url, { cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as SeriesData;
    // 스키마 방어: 배열 길이가 어긋나면 그리지 않는다(축이 밀려 잘못 표시됨)
    if (
      !Array.isArray(json?.d) ||
      !Array.isArray(json?.p) ||
      json.d.length !== json.p.length ||
      json.p.length === 0
    ) {
      throw new Error("unexpected schema");
    }
    // 밴드 배열은 길이가 안 맞으면(구버전 파일 등) 통째로 버린다 — 종가
    // 라인은 정상 표시하고 밴드만 조용히 생략한다(앱이 죽으면 안 된다).
    for (const key of ["bm", "bu", "bl"] as const) {
      const arr = json[key];
      if (arr !== undefined && (!Array.isArray(arr) || arr.length !== json.p.length)) {
        delete json[key];
      }
    }
    cache.set(code, json);
    return json;
  } catch (e) {
    console.error("series 로드 실패:", code, e);
    return null;
  }
}

/** "2026-07-16" → "7.16" (차트 x축 라벨용, 짧게) */
export function shortDate(d: string): string {
  const m = d.match(/^\d{4}-(\d{2})-(\d{2})$/);
  return m ? `${Number(m[1])}.${Number(m[2])}` : d;
}
