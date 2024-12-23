require('dotenv').config();
const express = require("express");
const puppeteer = require("puppeteer-core");
const chrome = require('chrome-aws-lambda');

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
  if (browserInstance) return browserInstance;

  const options = {
    args: [
      ...chrome.args,
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage'
    ],
    executablePath: process.env.CHROME_PATH || await chrome.executablePath,
    headless: true,
    ignoreHTTPSErrors: true
  };

  browserInstance = await puppeteer.launch(options);
  return browserInstance;
}

app.post("/generate-image", async (req, res) => {
  const { html, width = 720, height = 960 } = req.body;
  let page = null;

  try {
    const browser = await initBrowser();
    page = await browser.newPage();

    await page.setViewport({
      width: Math.min(width, 1920),
      height: Math.min(height, 1080),
      deviceScaleFactor: 1
    });

    const wrappedHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { background: white; }
          </style>
        </head>
        <body>${html}</body>
      </html>
    `;

    await page.setContent(wrappedHtml, {
      waitUntil: 'networkidle0',
      timeout: 5000
    });

    const screenshot = await page.screenshot({
      type: "png"
    });

    res.set("Content-Type", "image/png");
    res.send(screenshot);

  } catch (error) {
    console.error(error);
    browserInstance = null;
    res.status(500).send({
      error: "Failed to generate image.",
      details: error.message
    });
  } finally {
    if (page) await page.close().catch(() => {});
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});