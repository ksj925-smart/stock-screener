import puppeteer from "puppeteer-core";
import fs from "fs";

// 375px 기준 검증 캡처 (선명하게 deviceScaleFactor 2)
const EXE = "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe";
const URL = "http://localhost:5173/";
const OUT = "screenshots";
fs.mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: EXE,
  headless: true,
  args: ["--no-sandbox", "--hide-scrollbars"],
  defaultViewport: { width: 375, height: 812, deviceScaleFactor: 2 },
});
const page = await browser.newPage();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = async (name) => {
  await wait(400);
  await page.screenshot({ path: `${OUT}/${name}` });
  console.log("saved", name);
};

await page.goto(URL, { waitUntil: "networkidle2", timeout: 60000 });
await page.waitForSelector(".fcard", { timeout: 30000 });

// 결과 목록이 무거우니 앞쪽 몇 개만 남겨 화면을 가볍고 깔끔하게
await page.evaluate(() => {
  const st = document.createElement("style");
  st.textContent = ".fcard.res:nth-of-type(n+6){display:none}";
  document.head.appendChild(st);
});

// 1) 결과 카드 디자인(즐겨찾기 카드 스타일) + 정렬 셀렉트를 펼쳐 대칭 목록 노출
await page.evaluate(() => {
  const sel = document.querySelector(".rbar select");
  sel.size = 10; // 네이티브 드롭다운을 인라인 리스트박스로 펼쳐 캡처
  document.querySelector(".rbar").scrollIntoView({ block: "start" });
});
await shot("review_sort_and_cards.png");

// 2) 정렬 셀렉트 원복 후 결과 카드만
await page.evaluate(() => {
  const sel = document.querySelector(".rbar select");
  sel.size = 0;
  document.querySelector(".rbar").scrollIntoView({ block: "start" });
});
await shot("review_result_cards.png");

// 3) 즐겨찾기 탭 (비교용)
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
await shot("review_favorites.png");

await browser.close();
console.log("done");
