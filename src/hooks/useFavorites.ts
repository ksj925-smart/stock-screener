import { useCallback, useRef, useState } from "react";
import { track } from "../lib/analytics";

/**
 * 즐겨찾기 — localStorage 저장 (SPEC 6장, 토스 로그인 불필요).
 *
 * v1.2에서 스키마를 v1(string[])에서 v2(items+categories)로 확장했다.
 * - 최대 20개 (신규 담기에만 적용 — 마이그레이션은 유실 없이 전부 보존)
 * - 사용자가 만든 카테고리(폴더)로 분류. 카테고리 없이도 동작한다.
 * - 순서는 사용자가 정한 그대로 유지하고 자동 정렬하지 않는다.
 */
const KEY_V2 = "screener.favorites.v2";
const KEY_V1 = "screener.favorites.v1";

export const FAV_LIMIT = 20;

export interface FavItem {
  code: string;
  /** 소속 카테고리 id. 미분류면 null */
  cat: string | null;
}

export interface FavCategory {
  id: string;
  name: string;
  /** 순수 시각 구분용 중립 색. 의미(위험/매수 등)를 담지 않는다 */
  color: string;
}

interface FavState {
  items: FavItem[];
  categories: FavCategory[];
}

export type ToggleResult = "added" | "removed" | "limit";

// 중립 색만 — 파랑·보라·민트·슬레이트·청록 계열. 빨강/초록/주황은 이 앱에서
// 등락·손익·매수 신호로 읽히므로 카테고리 색으로 쓰지 않는다.
const CAT_COLORS = [
  "#4c8dff",
  "#8c7fc4",
  "#2bd9a8",
  "#68728a",
  "#3fb6d3",
  "#b39ddb",
];

function writeState(s: FavState) {
  try {
    localStorage.setItem(
      KEY_V2,
      JSON.stringify({ v: 2, items: s.items, categories: s.categories }),
    );
  } catch {
    // 저장 실패(용량 등)는 무시 — 세션 내 상태로만 동작
  }
}

/**
 * 저장된 즐겨찾기를 읽는다. v2 → (없으면) v1 마이그레이션 → (없으면) 빈 상태.
 * 어떤 경로에서 파싱이 실패해도 예외를 밖으로 흘리지 않는다.
 */
function readState(): FavState {
  // 1) v2 우선
  try {
    const raw = localStorage.getItem(KEY_V2);
    if (raw) {
      const p = JSON.parse(raw);
      if (p && Array.isArray(p.items)) {
        const categories: FavCategory[] = (
          Array.isArray(p.categories) ? p.categories : []
        )
          .filter(
            (c: unknown): c is FavCategory =>
              !!c &&
              typeof (c as FavCategory).id === "string" &&
              typeof (c as FavCategory).name === "string",
          )
          .map((c: FavCategory, i: number) => ({
            id: c.id,
            name: c.name,
            color:
              typeof c.color === "string"
                ? c.color
                : CAT_COLORS[i % CAT_COLORS.length],
          }));
        const validIds = new Set(categories.map((c) => c.id));
        const items: FavItem[] = p.items
          .filter(
            (x: unknown): x is FavItem =>
              !!x && typeof (x as FavItem).code === "string",
          )
          .map((x: FavItem) => ({
            code: x.code,
            // 삭제된 카테고리를 가리키는 참조는 미분류로 정리
            cat:
              typeof x.cat === "string" && validIds.has(x.cat) ? x.cat : null,
          }));
        return { items, categories };
      }
    }
  } catch {
    // v2 파싱 실패 → v1 마이그레이션 시도
  }

  // 2) v1(string[]) 마이그레이션 — 구 데이터는 지우지 않고 보존(롤백 안전)
  try {
    const raw = localStorage.getItem(KEY_V1);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        const codes = arr.filter((x): x is string => typeof x === "string");
        // 기존 사용자가 20개를 넘겨 담아뒀더라도 전부 보존한다(유실 금지).
        // 20개 제한은 '신규 담기'에만 적용된다.
        const state: FavState = {
          items: codes.map((c) => ({ code: c, cat: null })),
          categories: [],
        };
        writeState(state); // v2 키만 새로 기록, v1 키는 그대로 둔다
        return state;
      }
    }
  } catch {
    // v1도 실패 → 빈 상태
  }

  return { items: [], categories: [] };
}

export function useFavorites() {
  const [state, setState] = useState<FavState>(readState);
  // setState 업데이터 밖에서 직전 상태를 동기로 알아야 담기/해제/한도를
  // 정확히 판정할 수 있다(업데이터는 순수해야 하며 StrictMode에서 2회 실행).
  const ref = useRef(state);

  const apply = useCallback((next: FavState) => {
    ref.current = next;
    writeState(next);
    setState(next);
  }, []);

  const toggle = useCallback(
    (code: string): ToggleResult => {
      const cur = ref.current;
      const exists = cur.items.some((i) => i.code === code);
      if (exists) {
        apply({ ...cur, items: cur.items.filter((i) => i.code !== code) });
        return "removed";
      }
      if (cur.items.length >= FAV_LIMIT) return "limit";
      const items = [...cur.items, { code, cat: null }];
      apply({ ...cur, items });
      // 담기만 집계. 종목코드는 넣지 않는다(개인정보 원칙) — 집계값이면 충분.
      track("favorite_add", { fav_count: items.length });
      return "added";
    },
    [apply],
  );

  /**
   * 화면에 보이는(카테고리로 걸러진) 목록 안에서 from→to로 재정렬한다.
   * 보이지 않는 항목은 전역 순서에서 제자리를 지킨다.
   */
  const reorderVisible = useCallback(
    (visibleCodes: string[], from: number, to: number) => {
      if (from === to) return;
      const cur = ref.current;
      const nextVisible = [...visibleCodes];
      const [moved] = nextVisible.splice(from, 1);
      nextVisible.splice(to, 0, moved);
      const visibleSet = new Set(visibleCodes);
      const byCode = new Map(cur.items.map((i) => [i.code, i]));
      let vi = 0;
      const items = cur.items.map((it) =>
        visibleSet.has(it.code) ? byCode.get(nextVisible[vi++])! : it,
      );
      apply({ ...cur, items });
    },
    [apply],
  );

  const setCategory = useCallback(
    (code: string, cat: string | null) => {
      const cur = ref.current;
      apply({
        ...cur,
        items: cur.items.map((i) => (i.code === code ? { ...i, cat } : i)),
      });
    },
    [apply],
  );

  /** 카테고리를 만든다(이름은 사용자 입력). 같은 이름이 있으면 그 id를 돌려준다. */
  const createCategory = useCallback(
    (name: string): string | null => {
      const n = name.trim();
      if (!n) return null;
      const cur = ref.current;
      const dup = cur.categories.find((c) => c.name === n);
      if (dup) return dup.id;
      const id = `c${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
      const color = CAT_COLORS[cur.categories.length % CAT_COLORS.length];
      apply({
        ...cur,
        categories: [...cur.categories, { id, name: n, color }],
      });
      return id;
    },
    [apply],
  );

  /** 카테고리를 지운다. 안에 있던 종목은 삭제되지 않고 미분류로 돌아간다. */
  const deleteCategory = useCallback(
    (id: string) => {
      const cur = ref.current;
      apply({
        categories: cur.categories.filter((c) => c.id !== id),
        items: cur.items.map((i) => (i.cat === id ? { ...i, cat: null } : i)),
      });
    },
    [apply],
  );

  // ResultList·네비 배지는 기존처럼 string[]만 필요하므로 파생해 함께 제공한다.
  const favorites = state.items.map((i) => i.code);

  return {
    favorites,
    favItems: state.items,
    categories: state.categories,
    toggle,
    reorderVisible,
    setCategory,
    createCategory,
    deleteCategory,
  };
}
