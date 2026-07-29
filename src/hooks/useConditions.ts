import { useCallback, useRef, useState } from "react";
import { track } from "../lib/analytics";
import { DEFAULT_RANGES, type FilterKey, type Ranges } from "../lib/filters";
import type { MarketFilter } from "../types";

/**
 * 조건 저장/불러오기 — 슬라이더 5개 + 시장 탭 + 토글 2개 상태를 최대 3개까지
 * localStorage에 저장한다(즐겨찾기와 동일하게 토스 로그인 불필요).
 * 슬롯 이름은 사용자가 직접 입력한다(앱이 이름을 제안하지 않는다).
 */
const KEY = "screener.conditions.v1";
export const CONDITION_LIMIT = 3;

export interface ConditionSnapshot {
  market: MarketFilter;
  noLoss: boolean;
  noHalt: boolean;
  ranges: Ranges;
}

export interface SavedCondition extends ConditionSnapshot {
  id: string;
  name: string;
}

/** 저장된 ranges를 방어적으로 정규화한다(손상/구버전 데이터 대비). */
function sanitizeRanges(r: unknown): Ranges {
  const out: Ranges = { ...DEFAULT_RANGES };
  if (r && typeof r === "object") {
    const obj = r as Record<string, unknown>;
    for (const k of Object.keys(DEFAULT_RANGES) as FilterKey[]) {
      const v = obj[k];
      if (
        Array.isArray(v) &&
        v.length === 2 &&
        typeof v[0] === "number" &&
        typeof v[1] === "number"
      ) {
        const a = Math.max(0, Math.min(100, v[0]));
        const b = Math.max(0, Math.min(100, v[1]));
        out[k] = [Math.min(a, b), Math.max(a, b)];
      }
    }
  }
  return out;
}

function read(): SavedCondition[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.slice(0, CONDITION_LIMIT).map((c: Record<string, unknown>, i) => ({
      id: typeof c?.id === "string" ? (c.id as string) : `c${i}`,
      name: typeof c?.name === "string" ? (c.name as string) : "저장된 조건",
      market:
        c?.market === "0" || c?.market === "1"
          ? (c.market as MarketFilter)
          : "all",
      noLoss: !!c?.noLoss,
      noHalt: !!c?.noHalt,
      ranges: sanitizeRanges(c?.ranges),
    }));
  } catch {
    return [];
  }
}

function write(list: SavedCondition[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // 저장 실패는 무시
  }
}

export function useConditions() {
  const [conditions, setConditions] = useState<SavedCondition[]>(read);
  const ref = useRef(conditions);

  const apply = useCallback((next: SavedCondition[]) => {
    ref.current = next;
    write(next);
    setConditions(next);
  }, []);

  /** 현재 조건을 이름과 함께 저장한다. 한도 초과·빈 이름이면 false. */
  const save = useCallback(
    (name: string, snapshot: ConditionSnapshot): boolean => {
      const n = name.trim();
      if (!n) return false;
      const cur = ref.current;
      if (cur.length >= CONDITION_LIMIT) return false;
      const id = `s${Date.now().toString(36)}`;
      apply([...cur, { id, name: n, ...snapshot }]);
      // 발생 사실만 기록 — 슬롯 이름·조건값은 로깅하지 않는다.
      track("condition_save");
      return true;
    },
    [apply],
  );

  const remove = useCallback(
    (id: string) => {
      apply(ref.current.filter((c) => c.id !== id));
    },
    [apply],
  );

  return { conditions, save, remove };
}
