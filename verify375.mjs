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
  await wait(400);
  await page.screenshot({ path: `${OUT}/${name}` });
  console.log("saved", name);
};

await page.goto(URL, { waitUntil: "networkidle2", timeout: 60000 });
await page.waitForSelector(".row", { timeout: 30000 });

// 슬라이더 실제 폭 측정 (이슈 1 검증)
const metrics = await page.evaluate(() => {
  const rg = document.querySelector(".rg");
  const wrap = document.querySelector(".wrap");
  const r = (el) => { const b = el.getBoundingClientRect(); return { left: Math.round(b.left), right: Math.round(b.right), width: Math.round(b.width) }; };
  return { vw: window.innerWidth, rg: r(rg), wrap: r(wrap), sliderPct: Math.round((r(rg).width / window.innerWidth) * 1000) / 10 };
});
console.log("METRICS", JSON.stringify(metrics));

// 1) 조회 홈 (375px, 슬라이더 폭 넓어짐)
await page.evaluate(() => window.scrollTo(0, 0));
await shot("verify_375_home.png");

// 2) 즐겨찾기 (375px, 하단 흰 여백 확인)
await page.evaluate(() =>
  localStorage.setItem("screener.favorites.v1", JSON.stringify(["005930", "000660", "402340", "009150"]))
);
await page.reload({ waitUntil: "networkidle2" });
await page.waitForSelector("nav", { timeout: 15000 });
await page.evaluate(() => {
  const b = [...document.querySelectorAll("nav button")].find((x) => x.textContent.includes("즐겨찾기"));
  if (b) b.click();
});
await shot("verify_375_favorites.png");

// 흰 여백 검증: body 배경 vs #root 높이
const bg = await page.evaluate(() => ({
  bodyBg: getComputedStyle(document.body).backgroundColor,
  rootBg: getComputedStyle(document.getElementById("root")).backgroundColor,
  rootHeight: Math.round(document.getElementById("root").getBoundingClientRect().height),
  vh: window.innerHeight,
  rootCoversViewport: document.getElementById("root").getBoundingClientRect().height >= window.innerHeight,
}));
console.log("BG", JSON.stringify(bg));

await browser.close();
console.log("done");
