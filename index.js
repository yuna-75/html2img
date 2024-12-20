const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer');
const app = express();

// 中间件配置
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// HTML 转图片的 API 端点
app.post('/api/html2img', async (req, res) => {
    try {
        const { 
            html,           // HTML 内容
            width = 800,    // 页面宽度
            height = 600,   // 页面高度
            type = 'png',   // 输出格式：png 或 jpeg
            quality = 80    // 图片质量(仅对 jpeg 有效)
        } = req.body;

        if (!html) {
            return res.status(400).json({
                status: 'error',
                message: '缺少 HTML 内容'
            });
        }

        // 启动浏览器
        const browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        // 创建新页面
        const page = await browser.newPage();
        
        // 设置视窗大小
        await page.setViewport({
            width: parseInt(width),
            height: parseInt(height)
        });

        // 设置 HTML 内容
        await page.setContent(html, {
            waitUntil: 'networkidle0'
        });

        // 生成截图
        const screenshot = await page.screenshot({
            type: type,
            quality: type === 'jpeg' ? quality : undefined,
            encoding: 'base64'
        });

        // 关闭浏览器
        await browser.close();

        // 返回响应
        res.json({
            status: 'success',
            data: {
                image: `data:image/${type};base64,${screenshot}`,
                width: width,
                height: height
            }
        });

    } catch (error) {
        console.error('转换错误:', error);
        res.status(500).json({
            status: 'error',
            message: '转换过程中发生错误'
        });
    }
});

// 健康检查端点
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

// 启动服务器
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`服务器运行在 http://localhost:${PORT}`);
}); 