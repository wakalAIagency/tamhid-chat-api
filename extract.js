// extract.js
import fs from "fs";
import puppeteer from "puppeteer";

const startUrl = "https://tamhid.sa/";

const visited = new Set();
const domain = new URL(startUrl).origin;
const out = [];

const isSameSite = (u) => {
  try { const x = new URL(u, domain); return x.origin === domain; } catch { return false; }
};

async function scrape(page, url) {
  if (visited.has(url)) return;
  visited.add(url);

  await page.goto(url, { waitUntil: "networkidle2", timeout: 120000 });

  // Get visible text
  const text = await page.evaluate(() => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const chunks = [];
    while (walker.nextNode()) {
      const n = walker.currentNode;
      const s = n.textContent.replace(/\s+/g, " ").trim();
      if (!s) continue;
      // Skip hidden text
      const el = n.parentElement;
      const style = el && window.getComputedStyle(el);
      if (style && (style.visibility === "hidden" || style.display === "none")) continue;
      chunks.push(s);
    }
    return chunks.join("\n");
  });

  out.push(`\n===== ${url} =====\n${text}\n`);

  // queue internal links
  const links = await page.$$eval("a[href]", as => as.map(a => a.href));
  for (const href of links) {
    if (isSameSite(href)) await scrape(page, new URL(href, domain).toString());
  }
}

(async () => {
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  await scrape(page, startUrl);
  await browser.close();
  const clean = out
    .join("\n")
    // remove duplicate empty lines
    .replace(/\n{3,}/g, "\n\n");
  fs.writeFileSync("tamhid_plaintext.txt", clean, "utf8");
  console.log("Saved tamhid_plaintext.txt");
})();
