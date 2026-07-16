import { defineConfig } from "@apps-in-toss/web-framework/config";

export default defineConfig({
  appName: "stock-screener",
  brand: {
    displayName: "주식 조건 조회", // 콘솔에 등록한 앱 이름과 일치해야 해요.
    primaryColor: "#1E9E7A", // 프로토타입 accent(민트) 계열
    icon: "", // TODO: 콘솔에 업로드한 아이콘 이미지 URL을 넣어주세요.
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
