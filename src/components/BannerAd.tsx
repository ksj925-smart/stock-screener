import { useEffect, useRef } from "react";
import { TossAds } from "@apps-in-toss/web-framework";

// ⚠️ 광고는 1차 출시 범위에서 제외됨 (2026-07-18 검토 반려 대응).
//   - 인앱 광고는 사업자 등록이 필요한데 현재 미등록이라 실제 광고그룹 ID를
//     발급받을 수 없고, 출시 번들에 테스트 ID를 넣을 수 없음.
//   - 이 컴포넌트는 App에서 사용하지 않아 번들에 포함되지 않으며(tree-shake),
//     사업자 등록 후 VITE_AD_GROUP_ID 설정 + App에서 <BannerAd /> 복원으로
//     후속 업데이트에서 다시 붙인다. ID를 소스에 하드코딩하지 말 것.
const BANNER_AD_GROUP_ID: string = import.meta.env.VITE_AD_GROUP_ID ?? "";

let initialized = false;

/**
 * 앱인토스 배너 광고 (SPEC: 외부 광고 네트워크 금지, 앱인토스 광고만 허용).
 * 토스 앱/샌드박스 밖(일반 브라우저)에서는 아무것도 렌더링하지 않아요.
 */
export function BannerAd() {
  const slotRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = slotRef.current;
    if (!el) return;
    let destroyed: (() => void) | undefined;
    try {
      if (!BANNER_AD_GROUP_ID) return; // 광고그룹 ID 미설정 시 아무것도 하지 않음
      if (!TossAds.attachBanner.isSupported()) return;
      if (!initialized) {
        TossAds.initialize({});
        initialized = true;
      }
      const result = TossAds.attachBanner(BANNER_AD_GROUP_ID, el, {
        theme: "dark",
      });
      destroyed = result?.destroy;
    } catch (e) {
      console.info("배너 광고를 사용할 수 없는 환경이에요:", e);
    }
    return () => {
      try {
        destroyed?.();
      } catch {
        /* noop */
      }
    };
  }, []);

  return <div ref={slotRef} className="ad-slot" />;
}
