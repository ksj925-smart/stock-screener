import puppeteer from "puppeteer-core";
import fs from "fs";

// 앱인토스 콘솔 세로형 규격: 정확히 636 × 1048 px
// 앱은 max-width 480px로 렌더되므로, CSS 480폭으로 렌더한 뒤
// deviceScaleFactor로 636폭까지 확대해 프레임을 꽉 채우고 선명하게 찍는다.
const TARGET_W = 636;
const TARGET_H = 1048;
const CSS_W = 480;
const DSF = TARGET_W / CSS_W; // 1.325
const CSS_H = Math.round(TARGET_H / DSF); // ≈ 791

const EXE = "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe";
const URL = "http://localhost:5173/";
const OUT = "screenshots";
fs.mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: EXE,
  headless: true,
  args: ["--no-sandbox", "--hide-scrollbars"],
  defaultViewport: { width: CSS_W, height: CSS_H, deviceScaleFactor: DSF },
});
const page = await browser.newPage();

const setRanges = (pairs) =>
  page.evaluate((pairs) => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    ).set;
    const inputs = [...document.querySelectorAll("input[type=range]")];
    for (const [label, val] of pairs) {
      const el = inputs.find((i) => i.getAttribute("aria-label") === label);
      if (el) {
        setter.call(el, String(val));
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }
  }, pairs);

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// PNG IHDR에서 실제 픽셀 크기를 읽어 검증
const dims = (path) => {
  const b = fs.readFileSync(path);
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
};

const shot = async (name) => {
  await wait(500);
  const path = `${OUT}/${name}`;
  await page.screenshot({ path });
  const [w, h] = dims(path);
  const ok = w === TARGET_W && h === TARGET_H;
  console.log(`saved ${name}  ${w}x${h}  ${ok ? "OK" : "!! MISMATCH"}`);
};

await page.goto(URL, { waitUntil: "networkidle2", timeout: 60000 });
await page.waitForSelector(".row", { timeout: 30000 });

// 1) 조회 탭 초기 화면: 슬라이더+히스토그램, 하단 카운트바에 전체 종목 수
await page.evaluate(() => window.scrollTo(0, 0));
await shot("01_search_home.png");

// 2) 필터 적용: RSI(28~52) + PBR 상한 → 히스토그램 색 분리 + 카운트바 조건요약/축소수
await setRanges([
  ["많이 떨어졌나 하한", 28],
  ["많이 떨어졌나 상한", 52],
  ["자산 대비 주가 상한", 55],
]);
await page.evaluate(() => window.scrollTo(0, 0));
await shot("02_filter_applied.png");

// 3) 즐겨찾기 탭: 종목 4개 시드 후 새로고침 → 즐겨찾기 탭 진입
await page.evaluate(() =>
  localStorage.setItem(
    "screener.favorites.v1",
    JSON.stringify(["005930", "000660", "402340", "009150"]),
  ),
);
await page.reload({ waitUntil: "networkidle2" });
await page.waitForSelector("nav", { timeout: 15000 });
await page.evaluate(() => {
  const b = [...document.querySelectorAll("nav button")].find((x) =>
    x.textContent.includes("즐겨찾기"),
  );
  if (b) b.click();
});
await page.evaluate(() => window.scrollTo(0, 0));
await shot("03_favorites.png");

await browser.close();
console.log(`done (target ${TARGET_W}x${TARGET_H}, css ${CSS_W}x${CSS_H}, dsf ${DSF})`);
