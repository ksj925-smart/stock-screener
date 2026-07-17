// QR 테스트 이슈 3건 수정 검증 스크린샷 (375×812)
//  1) 정렬 바텀시트 (이슈 2)
//  2) RSI 높은 순 정렬 상단 — 거래정지 RSI 100 종목 제거 확인 (이슈 1)
//  3) 즐겨찾기 별 탭 후 포커스 링 없음 (이슈 3)
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
  defaultViewport: { width: 375, height: 812, deviceScaleFactor: 1 },
});
const page = await browser.newPage();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = async (name) => {
  await wait(450);
  await page.screenshot({ path: `${OUT}/${name}` });
  console.log("saved", name);
};

await page.goto(URL, { waitUntil: "networkidle2", timeout: 60000 });
await page.waitForSelector(".fcard.res", { timeout: 30000 });

// 목데이터 여부 확인 (실데이터로 검증해야 함)
const isMock = await page.evaluate(() => !!document.querySelector(".mock"));
console.log("isMock:", isMock);

// 1) 정렬 바텀시트 열기
await page.evaluate(() => {
  document.querySelector(".sortbtn").scrollIntoView({ block: "center" });
});
await wait(300);
await page.click(".sortbtn");
await wait(400);
await shot("fix2_sort_bottomsheet.png");

// 2) RSI 높은 순 선택 → 결과 상단
await page.evaluate(() => {
  const opt = [...document.querySelectorAll(".sheet-opt")].find((o) =>
    o.textContent.includes("RSI 높은 순"),
  );
  opt.click();
});
await wait(500);
await page.evaluate(() => {
  document.querySelector(".rbar").scrollIntoView({ block: "start" });
  window.scrollBy(0, -8);
});
await shot("fix1_rsi_desc_top.png");
const top3 = await page.evaluate(() =>
  [...document.querySelectorAll(".fcard.res")].slice(0, 3).map((c) => ({
    name: c.querySelector(".n1").textContent,
    chips: [...c.querySelectorAll(".chip")].map((x) => x.textContent.trim()),
  })),
);
console.log("RSI 높은 순 TOP3:", JSON.stringify(top3));

// 3) 별 탭 → 포커스 링 확인
const star = await page.$(".fcard.res .st");
await star.click(); // 실제 마우스 클릭 (탭과 동일하게 :focus 유발)
await wait(300);
const focusState = await page.evaluate(() => {
  const el = document.querySelector(".fcard.res .st");
  const cs = getComputedStyle(el);
  return {
    isFocused: document.activeElement === el,
    focusVisible: el.matches(":focus-visible"),
    outlineStyle: cs.outlineStyle,
    starOn: el.classList.contains("on"),
  };
});
console.log("별 탭 후 포커스 상태:", JSON.stringify(focusState));
await shot("fix3_star_no_focus_ring.png");
// 즐겨찾기 해제(상태 원복)
await star.click();
await wait(200);

// (참고) 키보드 포커스에서는 링이 보여야 함
await page.keyboard.press("Tab");
const kb = await page.evaluate(() => {
  const el = document.activeElement;
  return {
    tag: el.tagName,
    cls: el.className,
    focusVisible: el.matches(":focus-visible"),
    outline: getComputedStyle(el).outlineStyle,
  };
});
console.log("키보드 Tab 포커스:", JSON.stringify(kb));

await browser.close();
console.log("DONE");
