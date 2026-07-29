import { useEffect, useState } from "react";
import { CONDITION_LIMIT, type SavedCondition } from "../hooks/useConditions";

interface ConditionSheetProps {
  open: boolean;
  conditions: SavedCondition[];
  onLoad: (c: SavedCondition) => void;
  onDelete: (id: string) => void;
  /** 이름으로 현재 조건을 저장. 성공하면 true */
  onSave: (name: string) => boolean;
  onClose: () => void;
}

/**
 * 내 조건 저장/불러오기 바텀시트 (SPEC v1.2).
 * SortSheet와 동일한 다크 시트 패턴(.sheet)을 재사용한다.
 */
export function ConditionSheet({
  open,
  conditions,
  onLoad,
  onDelete,
  onSave,
  onClose,
}: ConditionSheetProps) {
  const [closing, setClosing] = useState(false);
  const [name, setName] = useState("");

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // 열릴 때마다 입력값 초기화
  useEffect(() => {
    if (open) setName("");
  }, [open]);

  if (!open && !closing) return null;

  const close = () => {
    setClosing(true);
    window.setTimeout(() => {
      setClosing(false);
      onClose();
    }, 180);
  };

  const full = conditions.length >= CONDITION_LIMIT;

  const handleSave = () => {
    if (onSave(name)) {
      setName("");
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
        aria-label="내 조건"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-handle" aria-hidden="true" />
        <div className="sheet-title">내 조건</div>

        {conditions.length === 0 ? (
          <div className="sheet-empty">저장된 조건이 없어요.</div>
        ) : (
          <div>
            {conditions.map((c) => (
              <div className="cond-row" key={c.id}>
                <button
                  type="button"
                  className="cond-load"
                  onClick={() => {
                    onLoad(c);
                    close();
                  }}
                >
                  <span className="cond-name">{c.name}</span>
                  <span className="cond-apply">불러오기</span>
                </button>
                <button
                  type="button"
                  className="cond-del"
                  aria-label={`${c.name} 삭제`}
                  onClick={() => onDelete(c.id)}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="cond-save">
          {full ? (
            <div className="sheet-note">
              최대 {CONDITION_LIMIT}개까지 저장할 수 있어요. 기존 조건을 지우고
              저장하세요.
            </div>
          ) : (
            <div className="cond-saverow">
              <input
                type="text"
                className="txtin"
                value={name}
                placeholder="조건 이름"
                aria-label="저장할 조건 이름"
                maxLength={20}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSave();
                }}
              />
              <button
                type="button"
                className="txtin-btn"
                disabled={!name.trim()}
                onClick={handleSave}
              >
                저장
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
