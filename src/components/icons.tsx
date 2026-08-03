/**
 * 앱 공용 라인 아이콘 (SVG).
 *
 * ⚠️ 유니코드 기호(⌕, ◠ 등)를 쓰지 않는 이유: 토스 웹뷰의 시스템 폰트에 해당
 *    글리프가 없으면 대체 문자로 떨어져 전혀 다른 기호처럼 보인다.
 *    실제로 검색 아이콘 ⌕가 기기에서 ')'로 표시되는 문제가 있었다.
 *    SVG는 폰트에 의존하지 않으므로 어느 기기에서나 같은 모양이 보장된다.
 *
 * 색은 currentColor를 따르므로 다크·민트 토큰을 그대로 쓴다.
 * 이모지는 사용하지 않는다(앱인토스 가이드 + 디자인 톤).
 */

interface IconProps {
  /** 한 변의 px 크기 */
  size?: number;
  className?: string;
}

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  // React SVG 타입은 focusable을 Booleanish로 좁혀 둔다("false" 문자열 불가)
  focusable: false,
});

/** 검색 — 돋보기. 검색창과 튜토리얼이 같은 아이콘을 쓴다. */
export function IconSearch({ size = 18, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <circle cx="10.5" cy="10.5" r="6.3" />
      <line x1="15.2" y1="15.2" x2="20.4" y2="20.4" />
    </svg>
  );
}

/** 조건 슬라이더 — 손잡이 두 개가 놓인 트랙. 실제 슬라이더 모양 그대로. */
export function IconSlider({ size = 18, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <line x1="3.2" y1="8" x2="20.8" y2="8" />
      <line x1="3.2" y1="16" x2="20.8" y2="16" />
      {/* 손잡이는 배경색으로 채워 트랙이 비쳐 보이지 않게 한다 */}
      <circle cx="8.5" cy="8" r="2.7" fill="var(--card2)" />
      <circle cx="15.5" cy="16" r="2.7" fill="var(--card2)" />
    </svg>
  );
}

/** 종목 수 — 항목이 나열된 목록. 하단 숫자가 이 목록의 개수임을 연상시킨다. */
export function IconList({ size = 18, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <circle cx="5" cy="6.5" r="1.15" fill="currentColor" stroke="none" />
      <circle cx="5" cy="12" r="1.15" fill="currentColor" stroke="none" />
      <circle cx="5" cy="17.5" r="1.15" fill="currentColor" stroke="none" />
      <line x1="9.5" y1="6.5" x2="20" y2="6.5" />
      <line x1="9.5" y1="12" x2="20" y2="12" />
      <line x1="9.5" y1="17.5" x2="20" y2="17.5" />
    </svg>
  );
}

/** 주가 차트 — 종가 꺾은선. ChartSheet의 라인 차트와 같은 형태. */
export function IconChart({ size = 18, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <polyline points="3.5,15.5 9,10 13,13.5 20.5,6" />
      <line x1="3.5" y1="19.5" x2="20.5" y2="19.5" />
    </svg>
  );
}

/** 즐겨찾기 — 별. 목록의 ☆/★와 같은 의미다. */
export function IconStar({ size = 18, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M12 4.1l2.42 4.9 5.41.79-3.92 3.81.93 5.39L12 16.45l-4.84 2.54.93-5.39L4.17 9.79l5.41-.79z" />
    </svg>
  );
}
