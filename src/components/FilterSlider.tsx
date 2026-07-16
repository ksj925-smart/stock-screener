import { useState } from "react";
import {
  BINS,
  HIST_HEIGHT,
  heat,
  toVal,
  type FilterDef,
} from "../lib/filters";

interface FilterSliderProps {
  def: FilterDef;
  range: [number, number];
  histogram: number[];
  onChange: (range: [number, number]) => void;
}

/** 양방향 range 슬라이더 + 히스토그램 + 용어 설명 ⓘ (SPEC 5장) */
export function FilterSlider({
  def,
  range,
  histogram,
  onChange,
}: FilterSliderProps) {
  const [tipOpen, setTipOpen] = useState(false);
  const [a, b] = range;
  const full = a === 0 && b === 100;
  const maxCount = Math.max(1, ...histogram);

  const handleLow = (v: number) => {
    if (v > b - 3) v = b - 3;
    onChange([v, b]);
  };
  const handleHigh = (v: number) => {
    if (v < a + 3) v = a + 3;
    onChange([a, v]);
  };

  return (
    <div className="f">
      <div className="fhead">
        <div className="fname">
          {def.name}
          <span className="term">{def.term}</span>
          <button
            type="button"
            className={`info${tipOpen ? " on" : ""}`}
            aria-label={`${def.name} 설명 ${tipOpen ? "닫기" : "보기"}`}
            aria-expanded={tipOpen}
            onClick={() => setTipOpen((v) => !v)}
          >
            i
          </button>
        </div>
        <div className={`fval${def.dir ? " dir" : ""}${full ? " all" : ""}`}>
          {full ? "전체" : `${def.fmt(toVal(def, a))} ~ ${def.fmt(toVal(def, b))}`}
        </div>
      </div>
      {tipOpen && <div className="tip on">{def.tip}</div>}
      <div className={`rg${def.dir ? " dir" : ""}`}>
        <div className="hist" aria-hidden="true">
          {Array.from({ length: BINS }, (_, i) => {
            const mid = ((i + 0.5) / BINS) * 100;
            const inRange = mid >= a && mid <= b;
            const background = !inRange
              ? "var(--dim)"
              : def.dir
                ? heat(i / (BINS - 1))
                : "var(--acc)";
            return (
              <div
                key={i}
                className={`hb${inRange ? " in" : ""}`}
                style={{
                  height: Math.max(2, ((histogram[i] ?? 0) / maxCount) * HIST_HEIGHT),
                  background,
                }}
              />
            );
          })}
        </div>
        <div className="track" />
        <div
          className="fill"
          style={{ left: `${a}%`, width: `${b - a}%` }}
        />
        <input
          type="range"
          min={0}
          max={100}
          value={a}
          aria-label={`${def.name} 하한`}
          onChange={(e) => handleLow(+e.target.value)}
        />
        <input
          type="range"
          min={0}
          max={100}
          value={b}
          aria-label={`${def.name} 상한`}
          onChange={(e) => handleHigh(+e.target.value)}
        />
        <div className="scale">
          {def.ticks.map((t) => (
            <span key={t}>{t}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
