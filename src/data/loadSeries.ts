/**
 * 종목별 3개월(최대 60영업일) 종가 시계열 로더.
 *
 * 파이프라인(build_series.py)이 docs/series/{code}.json으로 생성해
 * Pages 아티팩트로 배포한다. 종목을 클릭할 때만 해당 파일 1개(~1KB)를
 * 받으므로 첫 로딩(screener.json)은 그대로 가볍다.
 *
 * ⚠️ 규제 제약(SPEC 3장): 순수 종가만 다룬다. 이동평균·밴드 등 파생값을
 *    여기서 계산하지 않는다. 계산하는 순간 조회 도구가 아니게 된다.
 */

/** series/{code}.json 스키마 — b:기준일, d:날짜 축, p:종가 */
export interface SeriesData {
  b: string;
  d: string[];
  p: number[];
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
