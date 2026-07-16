import { useEffect, useRef, useState } from "react";

interface CountBarProps {
  count: number;
  summaryParts: string[];
  onGoResults: () => void;
}

/** 카운트 롤링 애니메이션 (~240ms, SPEC 5-3) */
function useRollingNumber(target: number): number {
  const [display, setDisplay] = useState(target);
  const currentRef = useRef(target);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const from = currentRef.current;
    const diff = target - from;
    if (diff === 0) return;
    const t0 = performance.now();
    const dur = 240;
    const step = (t: number) => {
      const u = Math.min(1, (t - t0) / dur);
      const e = 1 - Math.pow(1 - u, 3);
      const val = Math.round(from + diff * e);
      setDisplay(val);
      currentRef.current = val;
      if (u < 1) rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [target]);

  return display;
}

/** 하단 고정 카운트바 — 슬라이더 조작 피드백의 핵심 (SPEC 5-3) */
export function CountBar({ count, summaryParts, onGoResults }: CountBarProps) {
  const display = useRollingNumber(count);

  return (
    <div id="cbar" className={count === 0 ? "zero" : ""}>
      <div className="in">
        <div className="num">
          <b>{display}</b>
          <i>종목</i>
        </div>
        <div className="cd">
          {summaryParts.length === 0 ? (
            "조건 없음 · 전체 종목"
          ) : (
            summaryParts.map((part, i) => (
              <span key={i}>
                {i > 0 && <span className="sep">·</span>}
                <em>{part}</em>
              </span>
            ))
          )}
        </div>
        <button type="button" className="go" onClick={onGoResults}>
          결과 보기
        </button>
      </div>
    </div>
  );
}
