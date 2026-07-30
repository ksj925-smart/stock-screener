import { useEffect, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Stock } from "../types";
import { loadSeries, MIN_POINTS, shortDate } from "../data/loadSeries";
import type { SeriesData } from "../data/loadSeries";
import { formatBaseDate } from "../data/loadScreener";
import { track } from "../lib/analytics";

/**
 * 종목 3개월 종가 차트 바텀시트.
 *
 * ⚠️ 규제 제약(SPEC 3장 · v1.3 확정) — 아래는 절대 넣지 않는다:
 *   볼린저밴드·이동평균선 등 오버레이, 매수/매도 마커, 목표가·지지/저항선,
 *   "저점·고점·매수 구간" 등 판단 라벨, 특정 구간 색 강조.
 *   허용: 종가 라인 / 날짜 축 / 가격 축 / 기준일 표기. 주석 없는 맨 차트.
 *
 * 선은 방향성 없는 민트 단색(--acc)만 쓴다. 상승·하락에 빨강/파랑을 쓰면
 * 색 자체가 방향 판단을 유도하므로, 시총·PBR 슬라이더를 중립색으로 둔 것과
 * 같은 원칙을 적용한다.
 */

interface ChartSheetProps {
  /** 열 종목. null이면 닫힌 상태 */
  stock: Stock | null;
  onClose: () => void;
}

type Phase = "loading" | "ok" | "few" | "error";

export function ChartSheet({ stock, onClose }: ChartSheetProps) {
  const [closing, setClosing] = useState(false);
  const [phase, setPhase] = useState<Phase>("loading");
  const [series, setSeries] = useState<SeriesData | null>(null);

  const open = stock != null;

  // 열려 있는 동안 뒤쪽 페이지 스크롤을 잠근다 (SortSheet와 동일 패턴).
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // 종목이 바뀔 때마다 해당 시계열만 fetch.
  useEffect(() => {
    if (!stock) return;
    let alive = true; // 빠르게 다른 종목을 열었을 때 늦게 온 응답이 덮어쓰지 않도록
    setPhase("loading");
    setSeries(null);

    // 종목코드는 넣지 않는다 — 디바이스 단위로 누적되면 관심종목
    // 프로파일이 된다(analytics.ts의 개인정보 원칙).
    track("chart_view");

    loadSeries(stock.c).then((data) => {
      if (!alive) return;
      if (!data) {
        setPhase("error");
      } else if (data.p.length < MIN_POINTS) {
        setSeries(data);
        setPhase("few");
      } else {
        setSeries(data);
        setPhase("ok");
      }
    });

    return () => {
      alive = false;
    };
  }, [stock]);

  if (!open && !closing) return null;

  const close = () => {
    setClosing(true);
    window.setTimeout(() => {
      setClosing(false);
      onClose();
    }, 180);
  };

  // recharts가 먹는 형태로 변환. 파생 지표 없이 날짜·종가만 담는다.
  const rows =
    series?.d.map((d, i) => ({ d, label: shortDate(d), p: series.p[i] })) ?? [];

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
        aria-label={stock ? `${stock.n} 최근 3개월 주가 차트` : "주가 차트"}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-handle" aria-hidden="true" />

        {stock && (
          <div className="ch-head">
            <div className="ch-name">{stock.n}</div>
            <div className="ch-sub">
              {stock.c} · {stock.m ? "코스닥" : "코스피"} ·{" "}
              {stock.p.toLocaleString()}원
            </div>
          </div>
        )}

        <div className="ch-body">
          {phase === "loading" && (
            <div className="ch-skel" aria-label="차트를 불러오는 중">
              <div className="ch-skel-bar" />
            </div>
          )}

          {phase === "error" && (
            <div className="ch-msg">차트를 불러올 수 없어요.</div>
          )}

          {phase === "few" && (
            <div className="ch-msg">데이터가 충분하지 않아요.</div>
          )}

          {phase === "ok" && series && (
            <>
              {/* 순수 종가 라인 1개. 밴드·이평·마커·구간강조 없음. */}
              <div className="ch-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={rows}
                    margin={{ top: 8, right: 8, bottom: 4, left: 4 }}
                  >
                    <CartesianGrid stroke="#252c39" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fill: "#68728a", fontSize: 11 }}
                      tickLine={false}
                      axisLine={{ stroke: "#252c39" }}
                      minTickGap={28}
                    />
                    <YAxis
                      domain={["dataMin", "dataMax"]}
                      tick={{ fill: "#68728a", fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      /* 7자리 종가(예: 1,401,000)도 잘리지 않을 폭.
                         이전 52px에서는 "0,924.523"처럼 앞이 잘려 나갔다. */
                      width={58}
                      /* 주가는 원 단위 정수다. 파이프라인에서 이미 반올림하지만
                         구버전 배포본이 캐시돼 있어도 소수가 보이지 않도록 방어한다. */
                      tickFormatter={(v: number) => Math.round(v).toLocaleString()}
                    />
                    {/* 툴팁은 "날짜 + 종가"까지만. 판단 문구를 넣지 않는다. */}
                    <Tooltip
                      contentStyle={{
                        background: "#1c222d",
                        border: "1px solid #252c39",
                        borderRadius: 10,
                        color: "#eaeef5",
                        fontSize: 13,
                      }}
                      labelStyle={{ color: "#98a1b2", fontSize: 12 }}
                      cursor={{ stroke: "#2e3644" }}
                      labelFormatter={(_l, payload) =>
                        payload?.[0]?.payload?.d ?? ""
                      }
                      formatter={(v) => [
                        `${Math.round(Number(v)).toLocaleString()}원`,
                        "종가",
                      ]}
                    />
                    <Line
                      type="linear"
                      dataKey="p"
                      stroke="#2bd9a8"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 3, fill: "#2bd9a8" }}
                      isAnimationActive={false}
                      name="종가"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="ch-foot">
                최근 {rows.length}거래일 종가 · {formatBaseDate(series.b)} 기준
              </div>
            </>
          )}
        </div>

        <button type="button" className="ch-close" onClick={close}>
          닫기
        </button>
      </div>
    </div>
  );
}
