import { defineConfig } from "@apps-in-toss/web-framework/config";

export default defineConfig({
  appName: "stock-screener", // 콘솔 등록 appName과 일치
  brand: {
    // 콘솔 앱 정보 등록값과 정확히 일치해야 함 (검토 반려 사유 #3):
    // 한국어 앱 이름 "내 조건 주식찾기" / 영어 앱 이름 "Stock Screener"(콘솔 측 등록)
    displayName: "내 조건 주식찾기",
    primaryColor: "#1E9E7A", // 프로토타입 accent(민트) 계열
    // 콘솔에 등록한 아이콘(로고)과 동일한 이미지 URL (검토 반려 사유 #1 대응)
    icon: "https://static.toss.im/appsintoss/58745/a84ff1d3-988e-467e-b417-ae29e5dd732a.png",
  },
  web: {
    host: "localhost",
    port: 5173,
    commands: {
      dev: "vite dev",
      build: "vite build",
    },
  },
  permissions: [],
  outdir: "dist",
});
