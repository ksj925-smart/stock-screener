// 면책 문구("참고용") 반영 확인 스크린샷 (375×812)
import puppeteer from "puppeteer-core";
import fs from "fs";

const EXE = "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe";
const OUT = "screenshots";
fs.mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: EXE,
  headless: true,
  args: ["--no-sandbox", "--hide-scrollbars", "--force-device-scale-factor=1"],
  defaultViewport: { width: 375, height: 812, deviceScaleFactor: 1 },
});
const page = await browser.newPage();
await page.goto("http://localhost:5173/", {
  waitUntil: "networkidle2",
  timeout: 60000,
});
await page.waitForSelector("footer", { timeout: 30000 });

const text = await page.evaluate(
  () => document.querySelector("footer").innerText,
);
console.log(
  "참고용 문장 포함:",
  text.includes("모든 지표는 참고용으로 제공됩니다"),
);

await page.evaluate(() =>
  document.querySelector("footer").scrollIntoView({ block: "center" }),
);
await new Promise((r) => setTimeout(r, 400));
await page.screenshot({ path: `${OUT}/fix4_disclaimer_footer.png` });
console.log("saved fix4_disclaimer_footer.png");
await browser.close();
