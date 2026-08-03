import { useEffect, useState } from "react";
import { track } from "../lib/analytics";

/**
 * 첫 방문자용 사용법 안내.
 *
 * ⚠️ 다크패턴 금지(앱인토스 심사 반려 사유): "진입 즉시 바텀시트"가 강제로
 *    느껴지면 안 된다. 그래서
 *      - 닫기(X)와 "건너뛰기"를 항상 노출하고
 *      - 딤 영역 탭·뒤로가기로도 닫히며(특정 버튼만 눌러야 닫히는 구조 금지)
 *      - 첫 1회만 자동 표시하고 이후에는 절대 자동으로 뜨지 않는다.
 *    닫는 방법이 여러 개인 것 자체가 강제성이 없다는 근거다.
 *
 * ⚠️ 규제 제약(SPEC 3장): 기능 사용법만 설명한다. 투자 판단·추천 표현
 *    ("이런 조건이 좋아요" 등)과 실제 종목명은 절대 넣지 않는다.
 *    예시가 필요하면 가상 이름(A전자)을 쓴다.
 */

const KEY = "screener.tutorial.v1";

/** 첫 방문(=안내를 본 적 없음)인지. localStorage 접근 실패 시 띄우지 않는다. */
export function isFirstVisit(): boolean {
  try {
    return localStorage.getItem(KEY) == null;
  } catch {
    return false;
  }
}

/** 안내를 봤다고 기록 — 이후 자동 표시되지 않는다. */
function markSeen() {
  try {
    localStorage.setItem(KEY, "1");
  } catch {
    // 저장 실패해도 앱은 그대로 동작한다(다음 실행에 다시 뜰 뿐)
  }
}

/** 안내 항목 — 전부 '무엇을 할 수 있는지'만 적는다. 판단·추천 표현 금지. */
const STEPS: { icon: string; title: string; desc: string }[] = [
  {
    icon: "◑",
    title: "슬라이더로 조건 정하기",
    desc: "회사 크기·자산 대비 주가 같은 값의 범위를 움직이면, 그 범위에 드는 종목이 조회돼요.",
  },
  {
    icon: "#",
    title: "하단 숫자는 종목 수",
    desc: "화면 아래 숫자는 지금 조건에 맞는 종목이 몇 개인지 보여줘요.",
  },
  {
    icon: "◠",
    title: "종목을 누르면 차트",
    desc: "종목을 누르면 최근 3개월 종가 흐름을 볼 수 있어요.",
  },
  {
    icon: "☆",
    title: "즐겨찾기와 폴더",
    desc: "☆를 눌러 담아두고, 폴더를 만들어 나눠 둘 수 있어요.",
  },
  {
    icon: "⌕",
    title: "검색으로 바로 찾기",
    desc: "종목명이나 코드를 입력하면 원하는 종목을 바로 찾을 수 있어요. (예: ‘A전자’)",
  },
];

interface TutorialSheetProps {
  open: boolean;
  onClose: () => void;
}

export function TutorialSheet({ open, onClose }: TutorialSheetProps) {
  const [closing, setClosing] = useState(false);

  // 열려 있는 동안 뒤쪽 페이지 스크롤을 잠근다 (다른 시트와 동일 패턴).
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // 표시 사실만 기록한다. 어떤 항목을 봤는지 등 세부는 남기지 않는다.
  useEffect(() => {
    if (open) track("tutorial_view");
  }, [open]);

  if (!open && !closing) return null;

  const close = () => {
    markSeen();
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
        aria-label="앱 사용법 안내"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-handle" aria-hidden="true" />

        <div className="tut-head">
          <div className="tut-title">이렇게 쓸 수 있어요</div>
          {/* 닫기는 항상 보이는 위치에 둔다(강제성 없음). */}
          <button
            type="button"
            className="tut-x"
            aria-label="안내 닫기"
            onClick={close}
          >
            ✕
          </button>
        </div>

        <ul className="tut-list">
          {STEPS.map((s) => (
            <li className="tut-item" key={s.title}>
              <span className="tut-ico" aria-hidden="true">
                {s.icon}
              </span>
              <div>
                <div className="tut-it">{s.title}</div>
                <div className="tut-id">{s.desc}</div>
              </div>
            </li>
          ))}
        </ul>

        <div className="tut-foot">
          <button type="button" className="tut-skip" onClick={close}>
            건너뛰기
          </button>
          <button type="button" className="tut-ok" onClick={close}>
            확인했어요
          </button>
        </div>
      </div>
    </div>
  );
}
