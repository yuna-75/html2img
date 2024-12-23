require('dotenv').config();
const express = require("express");
const puppeteer = require("puppeteer-core");

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

  try {
    let options = {};
    
    if (process.env.VERCEL) {
      // Vercel 环境
      const chrome = require('chrome-aws-lambda');
      options = {
        args: chrome.args,
        executablePath: await chrome.executablePath,
        headless: chrome.headless,
        ignoreHTTPSErrors: true
      };
    } else {
      // 本地环境
      const chromium = require('@sparticuz/chromium');
      options = {
        args: [
          ...chromium.args,
          '--no-sandbox',
          '--disable-setuid-sandbox'
        ],
        executablePath: process.env.CHROME_PATH || await chromium.executablePath(),
        headless: true,
        ignoreHTTPSErrors: true
      };
    }

    browserInstance = await puppeteer.launch(options);
    return browserInstance;
  } catch (error) {
    console.error('Browser launch error:', error);
    throw error;
  }
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
      waitUntil: ['load', 'networkidle0'],
      timeout: 30000
    });

    const screenshot = await page.screenshot({
      type: "png",
      fullPage: true
    });

    res.set("Content-Type", "image/png");
    res.send(screenshot);

  } catch (error) {
    console.error(error);
    // 如果是浏览器启动错误，重置实例
    if (error.message.includes('launch failed') || 
        error.message.includes('Session closed')) {
      browserInstance = null;
    }
    res.status(500).send({
      error: "Failed to generate image.",
      details: error.message
    });
  } finally {
    if (page) {
      try {
        await page.close();
      } catch (e) {
        console.error('Error closing page:', e);
      }
    }
  }
});

// 优雅关闭
process.on('SIGTERM', async () => {
  if (browserInstance) {
    try {
      await browserInstance.close();
    } catch (e) {
      console.error('Error closing browser:', e);
    }
  }
  process.exit(0);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});