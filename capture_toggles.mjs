// 2열 토글(적자/거래없음) 레이아웃·동작 검증 캡처 (375×812)
import puppeteer from "puppeteer-core";
import fs from "fs";

const EXE = "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe";
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
  await wait(500);
  await page.screenshot({ path: `${OUT}/${name}` });
  console.log("saved", name);
};

await page.goto("http://localhost:5173/", { waitUntil: "networkidle2", timeout: 60000 });
await page.waitForSelector(".tgcell", { timeout: 30000 });

// 결과 카드는 40개만 남겨 렌더 부하를 줄인다
const hideTail = () =>
  page.evaluate(() => {
    [...document.querySelectorAll(".fcard.res")].forEach((el, i) => {
      el.style.display = i >= 40 ? "none" : "";
    });
  });
await hideTail();

const snap = () =>
  page.evaluate(() => {
    const sws = [...document.querySelectorAll(".tgcell [role=switch]")];
    return {
      적자: sws[0].getAttribute("aria-checked") === "true",
      거래없음: sws[1].getAttribute("aria-checked") === "true",
      카운트바: document.querySelector("#cbar .num b").innerText,
      결과줄: document.querySelector(".rbar .ttl").innerText,
      요약: document.querySelector("#cbar .cd").innerText.replace(/\n/g, " ").trim(),
    };
  });
const toggle = async (i) => {
  await page.evaluate((idx) => {
    document.querySelectorAll(".tgcell [role=switch]")[idx].click();
  }, i);
  await wait(900);
  await hideTail();
};

// 토글 영역이 보이도록 스크롤
await page.evaluate(() => {
  document.querySelector(".tgrid").scrollIntoView({ block: "center" });
});

// ① 기본 상태 (적자 ON / 거래없음 OFF)
console.log("① 기본:", JSON.stringify(await snap()));
await shot("08_toggles_default.png");

// ② ⓘ 설명 펼침
await page.evaluate(() => {
  document.querySelector(".tgcell .info").click();
});
await wait(400);
await page.evaluate(() => document.querySelector(".tgrid").scrollIntoView({ block: "center" }));
await shot("09_toggles_tip.png");
await page.evaluate(() => document.querySelector(".tgcell .info").click());
await wait(300);

// ③ 조합 4가지 카운트 검증
const combos = [];
for (const [a, b] of [[false, false], [true, false], [false, true], [true, true]]) {
  const cur = await snap();
  if (cur.적자 !== a) await toggle(0);
  const cur2 = await snap();
  if (cur2.거래없음 !== b) await toggle(1);
  await wait(600);
  const s = await snap();
  combos.push(s);
  console.log(`  적자=${s.적자} 거래없음=${s.거래없음} → 카운트바 ${s.카운트바} / ${s.결과줄} / 요약: ${s.요약}`);
}

// ④ 둘 다 ON 상태 화면 (조건 요약 확인용)
await page.evaluate(() => document.querySelector(".tgrid").scrollIntoView({ block: "center" }));
await shot("10_toggles_both_on.png");

await browser.close();
console.log("done");
