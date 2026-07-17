// 버그 수정 검증용 캡처: ① 소형주 시총(작은 순) ② 그룹사 PBR/PER
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
  defaultViewport: { width: 375, height: 812, deviceScaleFactor: 2 },
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

// 렌더 부하 절감: 결과 카드 40개 이후 숨김
const hideTail = () =>
  page.evaluate(() => {
    // 정렬로 DOM 순서가 바뀌어도 앞 40장은 항상 보이도록 매번 리셋 후 숨김
    [...document.querySelectorAll(".fcard.res")].forEach((el, i) => {
      el.style.display = i >= 40 ? "none" : "";
    });
  });
await hideTail();

// ① 시총 작은 순 정렬 → 소형주 시총이 실제 값(억 단위)으로 구분되는지
await page.evaluate(() => {
  const b = [...document.querySelectorAll("button")].find((x) =>
    (x.getAttribute("aria-label") || "").includes("정렬")
  );
  b.click();
});
await wait(400);
await page.evaluate(() => {
  const o = [...document.querySelectorAll("button,[role=option],li")].find(
    (e) => e.textContent.trim() === "시가총액 작은 순"
  );
  o.click();
});
await wait(500);
await hideTail();
await page.evaluate(() => {
  const rb = document.querySelector(".rbar");
  if (rb) rb.scrollIntoView({ block: "start" });
});
await shot("05_smallcap_sorted.png");

// ② 시총 큰 순으로 되돌려 그룹사(현대차·기아) PBR/PER 확인
await page.evaluate(() => {
  const b = [...document.querySelectorAll("button")].find((x) =>
    (x.getAttribute("aria-label") || "").includes("정렬")
  );
  b.click();
});
await wait(400);
await page.evaluate(() => {
  const o = [...document.querySelectorAll("button,[role=option],li")].find(
    (e) => e.textContent.trim() === "시가총액 큰 순"
  );
  o.click();
});
await wait(500);
await hideTail();
await page.evaluate(() => {
  const rows = [...document.querySelectorAll(".fcard.res")];
  const hyundai = rows.find((r) => r.textContent.includes("현대차"));
  if (hyundai) hyundai.scrollIntoView({ block: "start" });
  window.scrollBy(0, -8);
});
await shot("06_groupstock_pbr_per.png");

await browser.close();
console.log("done");
