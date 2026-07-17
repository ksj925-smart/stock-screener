// 출처 문구(재무 기준 시점) 검증 캡처
import puppeteer from "puppeteer-core";
import fs from "fs";

const EXE = "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe";
const browser = await puppeteer.launch({
  executablePath: EXE,
  headless: true,
  args: ["--no-sandbox", "--hide-scrollbars", "--force-device-scale-factor=1"],
  defaultViewport: { width: 375, height: 812, deviceScaleFactor: 2 },
});
const page = await browser.newPage();
await page.goto("http://localhost:5173/", { waitUntil: "networkidle2", timeout: 60000 });
await page.waitForSelector("footer", { timeout: 30000 });
await new Promise((r) => setTimeout(r, 800));
const text = await page.evaluate(() => {
  document.querySelector("footer").scrollIntoView({ block: "center" });
  return document.querySelector("footer").innerText;
});
console.log(text.includes("확정 연간재무(2025년)") ? "FOOTER_OK" : "FOOTER_MISSING");
await new Promise((r) => setTimeout(r, 450));
fs.mkdirSync("screenshots", { recursive: true });
await page.screenshot({ path: "screenshots/07_footer_fin_basis.png" });
console.log("saved 07_footer_fin_basis.png");
await browser.close();
