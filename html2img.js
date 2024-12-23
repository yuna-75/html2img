require('dotenv').config();
const express = require("express");
const puppeteer = require("puppeteer-core");
const chrome = require("chrome-aws-lambda");

const app = express();

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

app.use(express.json({ limit: "10mb" }));

let browserInstance = null;

async function initBrowser() {
  if (!browserInstance) {
    const options = {
      args: chrome.args,
      executablePath: process.env.CHROME_PATH || await chrome.executablePath,
      headless: chrome.headless,
      ignoreHTTPSErrors: true
    };

    browserInstance = await puppeteer.launch(options);
  }
  return browserInstance;
}

app.post("/generate-image", async (req, res) => {
  const { html, width = 720, height = 960 } = req.body;

  if (!html || typeof html !== "string") {
    return res.status(400).send({ error: "Invalid or missing HTML content." });
  }

  let page = null;
  let browser = null;

  try {
    browser = await initBrowser();
    page = await browser.newPage();

    await page.setViewport({
      width: Math.min(width, 1920),
      height: Math.min(height, 1080),
      deviceScaleFactor: 1
    });

    await page.setContent(html, { waitUntil: 'networkidle0' });

    const screenshot = await page.screenshot({
      type: "png",
      fullPage: true
    });

    res.set("Content-Type", "image/png");
    res.send(screenshot);

  } catch (error) {
    console.error(error);
    res.status(500).send({
      error: "Failed to generate image.",
      details: error.message
    });

  } finally {
    if (page) await page.close().catch(console.error);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

process.on('SIGTERM', async () => {
  if (browserInstance) await browserInstance.close();
  process.exit(0);
});