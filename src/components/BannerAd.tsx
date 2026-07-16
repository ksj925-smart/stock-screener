import { useEffect, useRef } from "react";
import { TossAds } from "@apps-in-toss/web-framework";

// TODO: 출시 전에 앱인토스 콘솔에서 발급한 배너 광고그룹 ID로 변경하세요.
const BANNER_AD_GROUP_ID = "ait-ad-test-banner-id";

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
