import { Analytics } from "@apps-in-toss/web-framework";

/**
 * 사용자 행동 이벤트 로깅 — 토스 콘솔 '핵심 지표'의 전환 지표용.
 *
 * ⚠️ 개발자센터의 "사용자 행동 기록 Analytics" 문서(Analytics.init /
 * Analytics.Area / Analytics.Impression)는 React Native 전용이다.
 * 이 앱은 WebView라 @apps-in-toss/web-analytics가 re-export하는
 * screen / impression / click 3개 메서드만 쓸 수 있고, init은 필요 없다.
 *
 * 개인정보 원칙: 종목코드는 절대 넣지 않는다. 종목코드 자체는 공개
 * 정보지만 디바이스 단위로 누적되면 "사용자의 금융 관심 종목 프로파일"이
 * 된다. 전환 지표는 유저 수만 세면 되므로 집계값(개수·시장 구분)만 남긴다.
 */

/** params는 평면 key-value만 허용된다(객체·배열 불가). */
type TrackParams = Record<string, string | number | boolean>;

/**
 * 이벤트 1건을 기록한다. 실패해도 절대 호출부로 예외를 흘리지 않는다.
 *
 * 라이브 서비스이므로 로깅이 기존 기능을 깨뜨리면 안 된다. Analytics.click은
 * 동기 throw뿐 아니라 Promise를 반환할 수도 있어서, try-catch만으로는
 * 거부된 Promise가 unhandledrejection으로 새어나간다. 둘 다 막는다.
 */
export function track(logName: string, params: TrackParams = {}) {
  if (import.meta.env.DEV) {
    // 개발 중 발화 시점 검증용. Vite가 프로덕션 빌드에서 이 블록을
    // 정적으로 제거하므로 출시 번들에는 남지 않는다.
    console.log("[analytics]", logName, params);
  }

  try {
    Analytics.click({ log_name: logName, ...params })?.catch(() => {
      // 전송 실패는 무시 — 지표 하나 때문에 앱이 멈추면 안 된다
    });
  } catch {
    // SDK 미주입 환경(브라우저 직접 실행 등)에서도 조용히 넘어간다
  }
}
