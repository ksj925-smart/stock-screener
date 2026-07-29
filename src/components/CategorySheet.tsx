import { useEffect, useState } from "react";
import type { FavCategory } from "../hooks/useFavorites";

interface CategorySheetProps {
  /** 대상 종목코드. null이면 시트를 닫은 상태 */
  code: string | null;
  /** 대상 종목명(제목 표시용) */
  name: string;
  /** 현재 대상의 카테고리 id (미분류면 null) */
  currentCat: string | null;
  categories: FavCategory[];
  onSelect: (cat: string | null) => void;
  /** 이름으로 카테고리 생성 후 그 id 반환(중복 이름이면 기존 id) */
  onCreate: (name: string) => string | null;
  onClose: () => void;
}

/**
 * 특정 즐겨찾기 종목의 카테고리(폴더)를 지정/해제/생성하는 바텀시트.
 * 카테고리 색은 순수 시각 구분용 중립 색이며 의미를 담지 않는다.
 */
export function CategorySheet({
  code,
  name,
  currentCat,
  categories,
  onSelect,
  onCreate,
  onClose,
}: CategorySheetProps) {
  const [closing, setClosing] = useState(false);
  const [newName, setNewName] = useState("");

  const open = code != null;

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (open) setNewName("");
  }, [open, code]);

  if (!open && !closing) return null;

  const close = () => {
    setClosing(true);
    window.setTimeout(() => {
      setClosing(false);
      onClose();
    }, 180);
  };

  const pick = (cat: string | null) => {
    onSelect(cat);
    close();
  };

  const handleCreate = () => {
    const id = onCreate(newName);
    if (id) {
      onSelect(id);
      setNewName("");
      close();
    }
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
        aria-label={`${name} 폴더 지정`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-handle" aria-hidden="true" />
        <div className="sheet-title">폴더 지정</div>

        <div role="listbox" aria-label="폴더 선택">
          <button
            type="button"
            role="option"
            aria-selected={currentCat == null}
            className={`sheet-opt${currentCat == null ? " on" : ""}`}
            onClick={() => pick(null)}
          >
            <span>미분류</span>
            {currentCat == null && (
              <span className="sheet-check" aria-hidden="true">
                ✓
              </span>
            )}
          </button>
          {categories.map((c) => {
            const on = c.id === currentCat;
            return (
              <button
                key={c.id}
                type="button"
                role="option"
                aria-selected={on}
                className={`sheet-opt${on ? " on" : ""}`}
                onClick={() => pick(c.id)}
              >
                <span className="cat-optname">
                  <span
                    className="cat-dot"
                    style={{ background: c.color }}
                    aria-hidden="true"
                  />
                  {c.name}
                </span>
                {on && (
                  <span className="sheet-check" aria-hidden="true">
                    ✓
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="cond-saverow">
          <input
            type="text"
            className="txtin"
            value={newName}
            placeholder="새 폴더 이름"
            aria-label="새 폴더 이름"
            maxLength={12}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreate();
            }}
          />
          <button
            type="button"
            className="txtin-btn"
            disabled={!newName.trim()}
            onClick={handleCreate}
          >
            만들기
          </button>
        </div>
      </div>
    </div>
  );
}
