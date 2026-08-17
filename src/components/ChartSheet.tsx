import { useEffect, useRef, useState } from "react";
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
 * 종목 3개월 종가 차트 + 지표 상세 바텀시트.
 *
 * 규제 원칙: SPEC.md 3장 참고. 매수/매도 마커, 목표가·지지/저항선, "저점·고점·
 * 매수 구간" 등 판단 라벨, 특정 구간 색 강조는 절대 넣지 않는다.
 *
 * 2026-08-XX 앱인토스 승인(SPEC.md 부록 A)으로 볼린저밴드 오버레이(밴드 선만,
 * 중앙 이동평균선은 미표시)와 지표 8종(RSI20·MFI·CCI·ADX·+DI·-DI·ATR·
 * 볼린저 %B)이 허용됨(%B는 설계 단계 누락 후 재확인돼 추가, +DI는 최초
 * 승인 범위 불명확으로 보류됐다가 상담원 재확인 후 추가).
 * 2026-08-11: RSI(14)/(20)·MFI(14)/(20) 병기 추가(SPEC.md 부록 A, 운영자
 * 직접 판단 — 새 지표가 아니라 기존 RSI20·MFI를 다른 기간으로 한 번 더
 * 계산해 나란히 보여주는 것). UI는 개별 행이 아니라 상위 항목(RSI/MFI)
 * 안에 기간별로 묶어서 표시한다(indicatorRows()의 kind:"group" 참고).
 * 이 컴포넌트는 마커·강조색을 위한 prop을 아예 두지 않는다 — 나중에 마커를
 * 추가하려면 컴포넌트 코드를 직접 고쳐야만 하도록(=데이터만 바꿔서 마커가
 * 켜지는 경로가 존재하지 않도록) 구조적으로 막는다. Recharts의
 * ReferenceDot/ReferenceLine/Customized(마커·주석용)는 이 파일에서 쓰지 않는다.
 *
 * 밴드 선은 종가 라인과 같은 민트(--acc) 계열이되 옅게(strokeOpacity)만
 * 구분한다. 상승·하락에 빨강/파랑을 쓰면 색 자체가 방향 판단을 유도하므로,
 * 시총·PBR 슬라이더를 중립색으로 둔 것과 같은 원칙을 적용한다.
 */

interface ChartSheetProps {
  /** 열 종목. null이면 닫힌 상태 */
  stock: Stock | null;
  onClose: () => void;
}

type Phase = "loading" | "ok" | "few" | "error";

/** 단일 값 지표 행(CCI/ADX/+DI/-DI/ATR/볼린저 %B) — 지금까지와 동일한 구조. */
interface SingleIndicatorRow {
  kind: "single";
  label: string;
  value: number | null | undefined;
  fmt: (v: number) => string;
  desc: string;
}

/** 같은 지표를 기간별로 병기하는 하위 항목 하나(예: "RSI(14)"). */
interface IndicatorPeriodItem {
  periodLabel: string;
  value: number | null | undefined;
  fmt: (v: number) => string;
  desc: string;
}

/** RSI/MFI처럼 상위 항목 하나 아래 기간별 값을 묶어서 보여주는 행
 * (2026-08-11, RSI(14)/(20)·MFI(14)/(20) 병기, SPEC.md 부록 A). 펼치면
 * 개별 기간이 아니라 items 전부가 한 번에 나란히 보인다 — 기간별로
 * 따로 접고 펴는 게 아니라 상위 항목(RSI/MFI) 단위로만 열고 닫는다. */
interface GroupIndicatorRow {
  kind: "group";
  label: string;
  items: IndicatorPeriodItem[];
}

type IndicatorRow = SingleIndicatorRow | GroupIndicatorRow;

/** 지표 상세 테이블 정의 — 값·정의 문구만. 매매판단 표현 금지(SPEC.md 부록 A). */
function indicatorRows(series: SeriesData): IndicatorRow[] {
  const pctFmt = (v: number) => String(Math.round(v));
  return [
    {
      kind: "group",
      label: "RSI",
      items: [
        {
          periodLabel: "RSI(14)",
          value: series.rsi14,
          fmt: pctFmt,
          desc: "최근 14거래일 동안 상승한 폭과 하락한 폭의 비율로, 0~100 사이 값이에요.",
        },
        {
          periodLabel: "RSI(20)",
          value: series.rsi20,
          fmt: pctFmt,
          desc: "최근 20거래일 동안 상승한 폭과 하락한 폭의 비율로, 0~100 사이 값이에요.",
        },
      ],
    },
    {
      kind: "group",
      label: "MFI",
      items: [
        {
          periodLabel: "MFI(14)",
          value: series.mfi,
          fmt: pctFmt,
          desc: "최근 14거래일 동안의 가격과 거래량을 함께 반영한 자금 흐름 비율로, 0~100 사이 값이에요.",
        },
        {
          periodLabel: "MFI(20)",
          value: series.mfi20,
          fmt: pctFmt,
          desc: "최근 20거래일 동안의 가격과 거래량을 함께 반영한 자금 흐름 비율로, 0~100 사이 값이에요.",
        },
      ],
    },
    {
      kind: "single",
      label: "CCI(20)",
      value: series.cci,
      fmt: (v: number) => v.toFixed(1),
      desc: "최근 20거래일 평균 가격에서 현재 가격이 얼마나 벗어났는지를 나타낸 값이에요.",
    },
    {
      kind: "single",
      label: "ADX",
      value: series.adx,
      fmt: (v: number) => v.toFixed(1),
      desc: "최근 가격 움직임의 추세 강도를 0~100 사이 값으로 나타내요. 방향은 나타내지 않아요.",
    },
    {
      kind: "single",
      label: "+DI",
      value: series.pdi,
      fmt: (v: number) => v.toFixed(1),
      desc: "상승 방향 움직임의 강도를 0~100 사이 값으로 나타내요.",
    },
    {
      kind: "single",
      label: "-DI",
      value: series.mdi,
      fmt: (v: number) => v.toFixed(1),
      desc: "하락 방향 움직임의 강도를 0~100 사이 값으로 나타내요.",
    },
    {
      kind: "single",
      label: "ATR",
      value: series.atr,
      fmt: (v: number) => `${Math.round(v).toLocaleString()}원`,
      desc: "최근 가격이 하루 동안 평균적으로 얼마나 움직였는지를 원 단위로 나타낸 값이에요.",
    },
    {
      kind: "single",
      label: "볼린저 %B",
      value: series.bpb,
      fmt: (v: number) => v.toFixed(2),
      desc: "종가가 볼린저밴드의 하단(0)과 상단(1) 사이 어디에 위치하는지를 나타낸 값이에요. 0보다 작거나 1보다 클 수도 있어요.",
    },
  ];
}

export function ChartSheet({ stock, onClose }: ChartSheetProps) {
  const [closing, setClosing] = useState(false);
  const [phase, setPhase] = useState<Phase>("loading");
  const [series, setSeries] = useState<SeriesData | null>(null);
  // 지표 상세 아코디언 — 라벨(문자열)을 키로 열림 상태를 추적한다. 여러 항목
  // 동시 오픈을 허용한다(라디오처럼 하나만 열리게 강제하지 않음).
  const [openRows, setOpenRows] = useState<Set<string>>(() => new Set());
  // 볼린저밴드 표시 여부 — 기본 켜짐. 종목을 바꿔도 사용자가 고른 값을
  // 유지한다(브라우저 storage는 쓰지 않고 컴포넌트 state로만, 세션 내 유지).
  const [showBands, setShowBands] = useState(true);

  // ── 아래로 드래그해서 닫기 ──────────────────────────────────────────
  // 시트 상단 고정 영역(.ch-drag-zone: 핸들·이름/코드·차트·토글)에서만
  // 반응한다 — .ch-scroll(지표 목록)은 자체 세로 스크롤을 써야 하므로
  // 이 드래그 핸들러를 아예 붙이지 않는다(충돌 원천 차단).
  //
  // transform이 아니라 별도 CSS 프로�터티인 translate로 움직인다 —
  // .sheet의 열기/닫기 애니메이션(sheetUp/sheetDown, App.css)이 이미
  // transform을 쓰고 있어서, 같은 속성을 인라인으로 건드리면 CSS
  // 애니메이션이 인라인 스타일보다 캐스케이드 우선순위가 높아 드래그가
  // 무시되거나(애니메이션이 계속 이기거나) 버튼/딤 클릭으로 닫을 때
  // 충돌할 위험이 있다. translate는 transform과 별개로 합성되는
  // 속성이라 서로 안 건드리면서 공존한다.
  const sheetRef = useRef<HTMLDivElement>(null);
  const [dragY, setDragY] = useState(0); // 0 = 제자리, 양수 = 아래로 끌린 픽셀
  const [dragging, setDragging] = useState(false); // true인 동안만 transition 없이 손가락을 1:1로 따라간다
  const dragYRef = useRef(0); // pointerup 시점에 최신 값을 확실히 읽기 위한 동기 저장소(state는 배치돼서 늦을 수 있음)
  const dragTrackRef = useRef<{
    startY: number;
    startedDrag: boolean;
    pointerId: number;
  } | null>(null);

  const DRAG_START_PX = 8; // 이보다 적게 움직이면 탭으로 간주해 토글 등 클릭이 정상 동작하게 둔다
  const DRAG_CLOSE_RATIO = 0.25; // 시트 높이의 1/4 이상 끌면 닫힘

  function setDrag(y: number) {
    dragYRef.current = y;
    setDragY(y);
  }

  function handleDragPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    dragTrackRef.current = {
      startY: e.clientY,
      startedDrag: false,
      pointerId: e.pointerId,
    };
  }

  function handleDragPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const track = dragTrackRef.current;
    if (!track || track.pointerId !== e.pointerId) return;
    const delta = e.clientY - track.startY;
    if (!track.startedDrag) {
      if (Math.abs(delta) < DRAG_START_PX) return; // 아직 탭인지 드래그인지 모호한 구간
      if (delta <= 0) {
        // 위로 움직이기 시작했다 — 닫기 제스처가 아니므로 추적을 그만둔다
        dragTrackRef.current = null;
        return;
      }
      track.startedDrag = true;
      setDragging(true);
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    e.preventDefault();
    setDrag(Math.max(0, delta));
  }

  function handleDragPointerEnd() {
    const track = dragTrackRef.current;
    dragTrackRef.current = null;
    if (!track || !track.startedDrag) return;
    setDragging(false);
    const sheetHeight = sheetRef.current?.getBoundingClientRect().height ?? 0;
    if (sheetHeight > 0 && dragYRef.current > sheetHeight * DRAG_CLOSE_RATIO) {
      // 놓은 위치에서 이어서 화면 밖까지 애니메이션한 뒤 닫는다(점프 없이)
      setDrag(sheetHeight + 40);
      window.setTimeout(() => {
        setDrag(0);
        onClose();
      }, 200);
    } else {
      setDrag(0); // 임계값 미만 — 제자리로 스냅백
    }
  }
  // ── /아래로 드래그해서 닫기 ─────────────────────────────────────────

  const open = stock != null;

  function toggleRow(label: string) {
    setOpenRows((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

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
    setOpenRows(new Set()); // 종목이 바뀌면 아코디언은 항상 전부 접힌 상태로 시작
    setDrag(0); // 이전에 드래그하다 만 상태가 다음에 열 때 남아있지 않도록
    setDragging(false);

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

  // recharts가 먹는 형태로 변환. 밴드는 상/하단 값만 싣는다(중앙선 미표시,
  // SPEC.md 부록 A). null→undefined로 정규화해 recharts가 그 구간을 자연스럽게
  // 건너뛰게 한다(신규상장 등으로 밴드 계산에 필요한 과거 구간이 부족한 날들).
  const rows =
    series?.d.map((d, i) => ({
      d,
      label: shortDate(d),
      p: series.p[i],
      bu: series.bu?.[i] ?? undefined,
      bl: series.bl?.[i] ?? undefined,
    })) ?? [];
  // 밴드 데이터가 아예 없는 종목(상장 초기 등 20일 이평 계산 불가)이면
  // 토글 자체를 보여줄 이유가 없다 — ch-foot의 밴드 문구 노출 조건과 동일하게 맞춘다.
  const hasBandData = (series?.bu ?? []).some((v) => v != null);

  return (
    <div
      className={`sheet-dim${closing ? " out" : ""}`}
      onClick={close}
      role="presentation"
    >
      <div
        ref={sheetRef}
        className={`sheet ch-sheet${closing ? " out" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={stock ? `${stock.n} 최근 3개월 주가 차트` : "주가 차트"}
        onClick={(e) => e.stopPropagation()}
        style={
          dragY !== 0
            ? {
                translate: `0 ${dragY}px`,
                transition: dragging ? "none" : undefined,
              }
            : undefined
        }
      >
        {/* 아래로 드래그해서 닫는 영역 — 핸들·이름/코드·차트·토글까지만
            포함한다. .ch-scroll(지표 목록)은 일부러 이 밖에 둬서 목록을
            스크롤하려는 동작이 시트 닫기로 오인되지 않게 한다. */}
        <div
          className="ch-drag-zone"
          onPointerDown={handleDragPointerDown}
          onPointerMove={handleDragPointerMove}
          onPointerUp={handleDragPointerEnd}
          onPointerCancel={handleDragPointerEnd}
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
              {/* 종가 라인 + 볼린저밴드(상/하단 선만, 중앙 이평선 미표시). 밴드는
                  종가보다 얇고 옅게 그려 종가 라인이 시각적 주인공을 유지한다.
                  마커·구간강조는 여전히 없음(SPEC.md 부록 A). */}
              <div className="ch-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={rows}
                    /* top을 8→20으로: Y축 domain이 ["dataMin","dataMax"]라
                       최고값 눈금이 플롯 영역 맨 위 경계에 그려지는데, 8px는
                       11px 폰트 눈금 라벨 높이의 절반(세로 중앙 정렬 기준
                       위로 삐져나오는 부분)을 넉넉히 못 받쳐 최고값 라벨이
                       가려지기 쉬웠다(App.css .sheet의 overflow 수정과는
                       별개 원인 — 이건 SVG 내부 여백 문제). */
                    margin={{ top: 20, right: 8, bottom: 4, left: 4 }}
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
                    {/* 툴팁은 "날짜 + 종가(+상단·하단)"까지만. 판단 문구를 넣지 않는다.
                        itemSorter로 표시 순서만 "종가 → 상단 → 하단"으로 바꾼다 —
                        렌더링 순서(아래 Line 컴포넌트 순서)는 층 쌓임(종가가
                        맨 위에 그려지도록) 때문에 그대로 둬야 해서, 시각적 순서와
                        툴팁 순서를 독립적으로 제어한다. */}
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
                      formatter={(v, name) => [
                        `${Math.round(Number(v)).toLocaleString()}원`,
                        name,
                      ]}
                      itemSorter={(item) =>
                        item.dataKey === "p" ? 0 : item.dataKey === "bu" ? 1 : 2
                      }
                    />
                    {/* 밴드(상/하단)를 종가보다 먼저 그려 아래 레이어에 두고,
                        dot·activeDot 없이 얇은 선으로만 표시한다. showBands가
                        꺼지면 아예 렌더링하지 않아 밴드 선과 툴팁의 상단/하단
                        항목이 함께 사라진다(종가 라인만 남음). */}
                    {showBands && (
                      <Line
                        type="linear"
                        dataKey="bu"
                        stroke="#2bd9a8"
                        strokeOpacity={0.35}
                        strokeWidth={1}
                        dot={false}
                        activeDot={false}
                        isAnimationActive={false}
                        connectNulls={false}
                        name="상단"
                      />
                    )}
                    {showBands && (
                      <Line
                        type="linear"
                        dataKey="bl"
                        stroke="#2bd9a8"
                        strokeOpacity={0.35}
                        strokeWidth={1}
                        dot={false}
                        activeDot={false}
                        isAnimationActive={false}
                        connectNulls={false}
                        name="하단"
                      />
                    )}
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
                {hasBandData && " · 볼린저밴드(20일 평균 ±2표준편차)"}
              </div>
            </>
          )}
        </div>

        {/* 볼린저밴드 온/오프 — 차트 바로 아래(범례 자리)에 둔다. 기본 켜짐.
            밴드 데이터가 아예 없는 종목이면 토글 자체를 숨긴다. ch-body는
            높이가 고정(232px)이라 토글은 그 밖의 형제 요소로 둬 차트 높이에
            영향을 주지 않는다. */}
        {phase === "ok" && series && hasBandData && (
          <div className="tg">
            <span>볼린저밴드 표시</span>
            <button
              type="button"
              role="switch"
              aria-checked={showBands}
              aria-label="볼린저밴드 표시"
              className={`sw${showBands ? " on" : ""}`}
              onClick={() => setShowBands((v) => !v)}
            />
          </div>
        )}
        </div>
        {/* /ch-drag-zone */}

        {/* 이름/코드(ch-head)·차트(ch-body)·볼린저밴드 토글은 위에서 이미
            고정 영역으로 렌더됐다. 세로로 늘어나는 지표 테이블만 별도
            스크롤 영역(.ch-scroll, App.css)에 담아 시트 상단은 고정한 채
            지표 목록만 위아래로 움직이게 한다. 닫기 버튼은 이 스크롤
            영역의 형제 요소라 스크롤과 무관하게 항상 하단에 보인다. */}
        {phase === "ok" && series && (
          <div className="ch-scroll">
            <div className="ch-ind">
              {/* 지표 상세 아코디언 — 기본 전부 접힘(이름만), 탭하면 값+설명이
                  펼쳐진다. 여러 항목 동시 오픈 허용(하나만 열리게 강제하지
                  않음). 계산된 수치와 객관적 정의만. 매매판단 문구 없음
                  (SPEC.md 부록 A). RSI/MFI는 상위 항목 하나 아래 기간별
                  값(14·20)을 묶어서 보여준다(2026-08-11, SPEC.md 부록 A) —
                  개별 기간이 아니라 상위 항목 단위로 열고 닫는다. */}
              {indicatorRows(series).map((row) => {
                const isOpen = openRows.has(row.label);
                return (
                  <div
                    className={`ch-ind-row${isOpen ? " open" : ""}`}
                    key={row.label}
                  >
                    <button
                      type="button"
                      className="ch-ind-top"
                      onClick={() => toggleRow(row.label)}
                      aria-expanded={isOpen}
                    >
                      <span className="ch-ind-label">{row.label}</span>
                      {isOpen && row.kind === "single" && (
                        <span className="ch-ind-val">
                          {row.value == null ? "—" : row.fmt(row.value)}
                        </span>
                      )}
                      <span className="ch-ind-arrow" aria-hidden="true" />
                    </button>
                    {isOpen && row.kind === "single" && (
                      <p className="ch-ind-desc">{row.desc}</p>
                    )}
                    {isOpen && row.kind === "group" && (
                      <div className="ch-ind-sub">
                        {row.items.map((item) => (
                          <div className="ch-ind-subrow" key={item.periodLabel}>
                            <div className="ch-ind-subtop">
                              <span className="ch-ind-sublabel">
                                {item.periodLabel}
                              </span>
                              <span className="ch-ind-val">
                                {item.value == null ? "—" : item.fmt(item.value)}
                              </span>
                            </div>
                            <p className="ch-ind-desc">{item.desc}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <button type="button" className="ch-close" onClick={close}>
          닫기
        </button>
      </div>
    </div>
  );
}
