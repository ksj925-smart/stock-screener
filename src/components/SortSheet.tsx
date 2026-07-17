import { useEffect, useState } from "react";
import type { SortKey } from "../types";

// 정렬은 낮은 순/높은 순을 대칭으로 제공한다 (특정 방향을 추천하지 않기 위함).
// 기본값은 중립적인 시가총액 큰 순 (App.tsx의 초기값).
export const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "cap", label: "시가총액 큰 순" },
  { value: "capa", label: "시가총액 작은 순" },
  { value: "rsi", label: "RSI 낮은 순" },
  { value: "rsid", label: "RSI 높은 순" },
  { value: "pbr", label: "PBR 낮은 순" },
  { value: "pbrd", label: "PBR 높은 순" },
  { value: "per", label: "PER 낮은 순" },
  { value: "perd", label: "PER 높은 순" },
  { value: "r", label: "등락률 높은 순" },
  { value: "ra", label: "등락률 낮은 순" },
];

export const sortLabel = (v: SortKey) =>
  SORT_OPTIONS.find((o) => o.value === v)?.label ?? "";

interface SortSheetProps {
  open: boolean;
  value: SortKey;
  onSelect: (v: SortKey) => void;
  onClose: () => void;
}

// 네이티브 <select>를 대체하는 커스텀 바텀시트.
// TDS BottomSheet는 라이트 테마 토큰으로 렌더되어 이 앱의 커스텀 다크
// 디자인과 충돌하므로, 앱 CSS 토큰(--card/--line/--acc)으로 직접 구현한다.
export function SortSheet({ open, value, onSelect, onClose }: SortSheetProps) {
  const [closing, setClosing] = useState(false);

  // 열려 있는 동안 뒤쪽 페이지 스크롤을 잠근다.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open && !closing) return null;

  const close = () => {
    setClosing(true);
    window.setTimeout(() => {
      setClosing(false);
      onClose();
    }, 180);
  };

  return (
    <div
      className={`sheet-dim${closing ? " out" : ""}`}
      onClick={close}
      role="presentation"
    >
      <div
        className={`sheet${closing ? " out" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="정렬 기준 선택"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-handle" aria-hidden="true" />
        <div className="sheet-title">정렬 기준</div>
        <div role="listbox" aria-label="정렬 기준">
          {SORT_OPTIONS.map((o) => {
            const on = o.value === value;
            return (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={on}
                className={`sheet-opt${on ? " on" : ""}`}
                onClick={() => {
                  onSelect(o.value);
                  close();
                }}
              >
                <span>{o.label}</span>
                {on && (
                  <span className="sheet-check" aria-hidden="true">
                    ✓
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
