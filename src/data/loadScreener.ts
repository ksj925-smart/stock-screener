import type { ScreenerData } from "../types";
import { MOCK_DATA } from "./mock";

/**
 * 정적 호스팅된 screener.json 주소.
 * 파이프라인(Phase 1) 배포 후 .env 파일에 VITE_SCREENER_URL을 설정하세요.
 * 예: VITE_SCREENER_URL=https://<username>.github.io/<repo>/screener.json
 */
const SCREENER_URL: string | undefined = import.meta.env.VITE_SCREENER_URL;

export interface LoadResult {
  data: ScreenerData;
  /** 실데이터 로드 실패로 목데이터를 쓰는 중인지 */
  isMock: boolean;
}

export async function loadScreenerData(): Promise<LoadResult> {
  if (!SCREENER_URL) {
    return { data: MOCK_DATA, isMock: true };
  }
  try {
    const res = await fetch(SCREENER_URL, { cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as ScreenerData;
    if (!json?.meta?.base_date || !Array.isArray(json.t)) {
      throw new Error("unexpected schema");
    }
    return { data: json, isMock: false };
  } catch (e) {
    console.error("screener.json 로드 실패, 목데이터로 대체:", e);
    return { data: MOCK_DATA, isMock: true };
  }
}

/** "2026-07-10" → "2026년 7월 10일" */
export function formatBaseDate(baseDate: string): string {
  const m = baseDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return baseDate;
  return `${m[1]}년 ${Number(m[2])}월 ${Number(m[3])}일`;
}
