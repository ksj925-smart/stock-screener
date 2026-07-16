import { useCallback, useState } from "react";

/**
 * 즐겨찾기 — 1차는 localStorage 저장 (SPEC 6장).
 * 순서는 사용자가 정한 그대로 유지하고, 자동 정렬하지 않는다.
 */
const STORAGE_KEY = "screener.favorites.v1";

function read(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function write(codes: string[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(codes));
  } catch {
    // 저장 실패(용량 등)는 무시 — 세션 내 상태로만 동작
  }
}

export function useFavorites() {
  const [favorites, setFavorites] = useState<string[]>(read);

  const toggle = useCallback((code: string) => {
    setFavorites((prev) => {
      const next = prev.includes(code)
        ? prev.filter((c) => c !== code)
        : [...prev, code];
      write(next);
      return next;
    });
  }, []);

  const reorder = useCallback((from: number, to: number) => {
    setFavorites((prev) => {
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      write(next);
      return next;
    });
  }, []);

  return { favorites, toggle, reorder };
}
