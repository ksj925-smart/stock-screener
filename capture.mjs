import puppeteer from "puppeteer-core";
import fs from "fs";

const EXE = "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe";
const URL = "http://localhost:5173/";
const OUT = "screenshots";
fs.mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: EXE,
  headless: true,
  args: ["--no-sandbox", "--hide-scrollbars", "--force-device-scale-factor=1"],
  defaultViewport: { width: 636, height: 1048, deviceScaleFactor: 1 },
});
const page = await browser.newPage();

const setRanges = (pairs) =>
  page.evaluate((pairs) => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value"
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
const shot = async (name) => {
  await wait(450);
  await page.screenshot({ path: `${OUT}/${name}` });
  console.log("saved", name);
};

await page.goto(URL, { waitUntil: "networkidle2", timeout: 60000 });
await page.waitForSelector(".row", { timeout: 30000 });

// 1) 조회 홈 (기본, 슬라이더 5종 + 히스토그램)
await page.evaluate(() => window.scrollTo(0, 0));
await shot("01_search_home.png");

// 2) 필터 적용 (RSI 28~52, PBR 상한 → 색 분리 + 카운트바 갱신)
await setRanges([
  ["많이 떨어졌나 하한", 28],
  ["많이 떨어졌나 상한", 52],
  ["자산 대비 주가 상한", 55],
]);
await page.evaluate(() => window.scrollTo(0, 0));
await shot("02_filter_applied.png");

// 3) 결과 목록 (필터 초기화 후 결과 리스트로 스크롤)
await setRanges([
  ["많이 떨어졌나 하한", 0],
  ["많이 떨어졌나 상한", 100],
  ["자산 대비 주가 상한", 100],
]);
await page.evaluate(() => {
  const s = document.createElement("style");
  s.textContent = ".row:nth-of-type(n+40){display:none}";
  document.head.appendChild(s);
  const rb = document.querySelector(".rbar");
  if (rb) rb.scrollIntoView({ block: "start" });
});
await shot("03_result_list.png");

// 4) 즐겨찾기 (localStorage 시드 후 새로고침 → 즐겨찾기 탭)
await page.evaluate(() =>
  localStorage.setItem(
    "screener.favorites.v1",
    JSON.stringify(["005930", "000660", "402340", "009150"])
  )
);
await page.reload({ waitUntil: "networkidle2" });
await page.waitForSelector("nav", { timeout: 15000 });
await page.evaluate(() => {
  const b = [...document.querySelectorAll("nav button")].find((x) =>
    x.textContent.includes("즐겨찾기")
  );
  if (b) b.click();
});
await shot("04_favorites.png");

await browser.close();
console.log("done");
