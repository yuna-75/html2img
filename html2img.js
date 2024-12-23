require('dotenv').config();
const express = require("express");
const puppeteer = require("puppeteer-core");
const chromium = require("@sparticuz/chromium");

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
    const executablePath = process.env.CHROME_PATH || await chromium.executablePath();
    
    const options = {
      args: [
        ...chromium.args,
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--single-process'
      ],
      executablePath,
      headless: chromium.headless,
      ignoreHTTPSErrors: true,
      defaultViewport: null
    };

    // 在 Vercel 环境中使用特殊配置
    if (process.env.VERCEL) {
      options.args = chromium.args;
      options.executablePath = await chromium.executablePath();
      options.headless = chromium.headless;
    }

    browserInstance = await puppeteer.launch(options);
  }
  return browserInstance;
}

async function ensureBrowser() {
  try {
    if (!browserInstance) {
      return await initBrowser();
    }
    // 测试浏览器实例是否还活着
    await browserInstance.version();
    return browserInstance;
  } catch (e) {
    // 如果出错，关闭旧实例并创建新实例
    try {
      if (browserInstance) {
        await browserInstance.close();
      }
    } catch (err) {
      console.error("Error closing browser:", err);
    }
    browserInstance = null;
    return await initBrowser();
  }
}

app.post("/generate-image", async (req, res) => {
  const { html, width = 720, height = 960 } = req.body;

  if (!html || typeof html !== "string") {
    console.error("Invalid or missing HTML content.");
    return res.status(400).send({ error: "Invalid or missing HTML content." });
  }

  let page = null;

  try {
    // 获取或创建浏览器实例
    const browser = await ensureBrowser();
    
    // 创建新页面
    page = await browser.newPage();

    // 设置视口大小
    const viewportWidth = Math.min(width, 1920);
    const viewportHeight = Math.min(height, 1080);
    
    await page.setViewport({
      width: viewportWidth,
      height: viewportHeight,
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
            html, body {
              width: ${viewportWidth}px;
              height: ${viewportHeight}px;
              background: white;
            }
          </style>
        </head>
        <body>
          ${html}
        </body>
      </html>
    `;

    // 设置页面内容
    await page.setContent(wrappedHtml, {
      timeout: 30000,
      waitUntil: 'networkidle0'
    });

    const screenshot = await page.screenshot({
      type: "png",
      timeout: 30000
    });

    res.set("Content-Type", "image/png");
    res.send(screenshot);

  } catch (error) {
    console.error("Error generating image:", error.message);
    console.error("Stack trace:", error.stack);

    // 如果发生错误，重置浏览器实例
    try {
      if (browserInstance) {
        await browserInstance.close();
      }
      browserInstance = null;
    } catch (e) {
      console.error("Error closing browser:", e);
    }

    res.status(500).send({
      error: "Failed to generate image.",
      details: error.message,
    });

  } finally {
    if (page) {
      try {
        await page.close().catch(() => {});
      } catch (e) {
        console.error("Error closing page:", e);
      }
    }
  }
});

// 优雅关闭
process.on('SIGTERM', async () => {
  if (browserInstance) {
    await browserInstance.close();
  }
  process.exit(0);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});