require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const express = require('express');
const path = require('path');
const logger = require('./utils/logger');
const pipeline = require('./core/content-pipeline');
const shopManager = require('./core/shop-manager');
const menuImporter = require('./core/menu-importer');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

const PORT = process.env.PORT || 3000;
const WEBHOOK_TOKEN = process.env.WEBHOOK_TOKEN || '';
const AMAP_KEY = process.env.AMAP_KEY || '';

// ============================================================
// 健康检查 & 状态
// ============================================================

app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

app.get('/api/status', (req, res) => {
  const apiKey = process.env.OPENAI_API_KEY;
  const configured = apiKey && apiKey !== 'sk-your-api-key-here';
  res.json({
    apiConfigured: !!configured,
    model: process.env.OPENAI_MODEL || 'not set',
    baseUrl: process.env.OPENAI_BASE_URL || 'not set',
    imageModel: process.env.OPENAI_IMAGE_MODEL || 'none',
    mapConfigured: !!AMAP_KEY,
  });
});

// ============================================================
// 地图搜索代理 (高德 POI)
// ============================================================

app.get('/api/map/search', async (req, res) => {
  const { keywords, city } = req.query;
  if (!keywords) return res.json({ tips: [] });

  if (!AMAP_KEY) {
    // 无 key 时返回提示
    return res.json({ tips: [], error: '地图搜索未配置，请在 .env 中设置 AMAP_KEY' });
  }

  try {
    const url = `https://restapi.amap.com/v3/assistant/inputtips?key=${AMAP_KEY}&keywords=${encodeURIComponent(keywords)}&city=${encodeURIComponent(city || '')}&datatype=poi&citylimit=false`;
    const resp = await fetch(url);
    const data = await resp.json();

    if (data.status === '1' && data.tips) {
      // 只返回有坐标的 POI
      const tips = data.tips
        .filter(t => t.location && t.location.length > 0)
        .map(t => ({
          name: t.name,
          address: t.address,
          location: t.location, // "lng,lat"
          type: t.typecode,
          city: t.cityname || '',
          district: t.adname || '',
          tel: t.tel || '',
        }));
      res.json({ tips });
    } else {
      res.json({ tips: [] });
    }
  } catch (e) {
    logger.error('地图搜索失败', e);
    res.json({ tips: [], error: '搜索服务暂时不可用' });
  }
});

// ============================================================
// 商家管理 API
// ============================================================

app.get('/api/shops', (req, res) => {
  try {
    const shops = shopManager.listShops();
    res.json({ shops });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/shops/:shopName', (req, res) => {
  try {
    const profile = shopManager.loadProfile(req.params.shopName);
    if (!profile) return res.status(404).json({ error: '商家不存在' });

    const menuData = menuImporter.loadMenu(req.params.shopName);
    res.json({ profile, menuData });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/shops', (req, res) => {
  try {
    const profile = shopManager.saveProfile(req.body);
    res.json({ success: true, profile });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/shops/:shopName', (req, res) => {
  try {
    shopManager.deleteShop(req.params.shopName);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// 菜单导入 API
// ============================================================

app.post('/api/menu/import', (req, res) => {
  try {
    const { shopName, fileName, content } = req.body;

    if (!shopName) return res.status(400).json({ error: '缺少商家名称' });
    if (!content) return res.status(400).json({ error: '缺少文件内容' });

    const menuData = menuImporter.processUploadedFile(fileName || 'menu.csv', content);
    menuImporter.saveMenu(shopName, menuData);

    // 更新或创建商家档案
    let profile = shopManager.loadProfile(shopName);
    if (!profile) {
      profile = { name: shopName };
    }
    profile.menuImported = true;
    profile.menuItemCount = menuData.summary.totalItems;
    if (!profile.avgPrice || profile.avgPrice === '') {
      profile.avgPrice = String(menuImporter.calculateAvgPrice(menuData));
    }
    shopManager.saveProfile(profile);

    res.json({
      success: true,
      menuData,
      autoAvgPrice: menuImporter.calculateAvgPrice(menuData),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/menu/:shopName', (req, res) => {
  try {
    const menuData = menuImporter.loadMenu(req.params.shopName);
    if (!menuData) return res.status(404).json({ error: '未找到菜单数据' });
    res.json({ menuData });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/menu/:shopName', (req, res) => {
  try {
    const safeName = req.params.shopName.replace(/[^a-zA-Z0-9一-龥]/g, '_');
    const menuPath = path.join(process.cwd(), 'data', 'shops', safeName, 'menu.json');
    const fs = require('fs');
    if (fs.existsSync(menuPath)) fs.unlinkSync(menuPath);

    const profile = shopManager.loadProfile(req.params.shopName);
    if (profile) {
      profile.menuImported = false;
      profile.menuItemCount = 0;
      shopManager.saveProfile(profile);
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// 内容生成 API
// ============================================================

function isApiConfigured() {
  const apiKey = process.env.OPENAI_API_KEY;
  return apiKey && apiKey !== 'sk-your-api-key-here';
}

function resolveDemo(demo) {
  return demo === false && isApiConfigured() ? false : true;
}

function loadMenuForShop(shopName) {
  if (!shopName) return null;
  try { return menuImporter.loadMenu(shopName); } catch { return null; }
}

app.post('/api/generate', async (req, res) => {
  try {
    const { shopInfo, types, demo } = req.body;

    if (!shopInfo || !shopInfo.name) {
      return res.status(400).json({ error: '缺少商家信息（shopInfo.name 必填）' });
    }

    const requestedTypes = types || ['xiaohongshu', 'douyin', 'poster', 'tuangou'];
    const isDemo = resolveDemo(demo);
    const menuData = loadMenuForShop(shopInfo.name);

    if (!shopInfo.avgPrice && menuData) {
      shopInfo.avgPrice = String(menuImporter.calculateAvgPrice(menuData));
    }

    const opts = { demo: isDemo, menuData };
    const results = {};

    for (const type of requestedTypes) {
      switch (type) {
        case 'xiaohongshu': results.xiaohongshu = await pipeline.generateXiaohongshu(shopInfo, opts); break;
        case 'douyin': results.douyin = await pipeline.generateDouyin(shopInfo, opts); break;
        case 'poster': results.poster = await pipeline.generatePoster(shopInfo, opts); break;
        case 'tuangou': results.tuangou = await pipeline.generateTuangou(shopInfo, opts); break;
      }
    }

    const saved = pipeline.saveResults(shopInfo.name, results);

    // 保存生成记录到商家档案
    try { shopManager.saveGeneration(shopInfo.name, results, requestedTypes); } catch {}

    res.json({ success: true, shopName: shopInfo.name, results, savedFiles: saved });
  } catch (err) {
    logger.error(err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/generate/:type', async (req, res) => {
  try {
    const { type } = req.params;
    const { shopInfo, demo } = req.body;

    if (!shopInfo || !shopInfo.name) {
      return res.status(400).json({ error: '缺少商家信息' });
    }

    const isDemo = resolveDemo(demo);
    const menuData = loadMenuForShop(shopInfo.name);

    if (!shopInfo.avgPrice && menuData) {
      shopInfo.avgPrice = String(menuImporter.calculateAvgPrice(menuData));
    }

    const opts = { demo: isDemo, menuData };
    let result;

    switch (type) {
      case 'xiaohongshu': result = await pipeline.generateXiaohongshu(shopInfo, opts); break;
      case 'douyin': result = await pipeline.generateDouyin(shopInfo, opts); break;
      case 'poster': result = await pipeline.generatePoster(shopInfo, opts); break;
      case 'tuangou': result = await pipeline.generateTuangou(shopInfo, opts); break;
      default: return res.status(400).json({ error: `不支持的内容类型: ${type}` });
    }

    res.json({ success: true, type, result });
  } catch (err) {
    logger.error(err.message);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// 企微 Webhook
// ============================================================

app.post('/webhook/wecom', async (req, res) => {
  try {
    const { msgtype, text } = req.body;

    if (msgtype === 'text') {
      const content = text?.content?.trim() || '';
      logger.info(`收到企微消息: ${content}`);

      const parts = content.split('|').map(s => s.trim());

      if (parts.length >= 2) {
        const shopInfo = {
          industry: parts[0] || 'restaurant',
          name: parts[1],
          address: parts[2] || '',
          sellingPoints: parts[3] || '',
        };

        const results = await pipeline.generateAll(shopInfo, { demo: true });
        const reply = formatReply(results);
        res.json({ msgtype: 'text', text: { content: reply } });
      } else {
        res.json({
          msgtype: 'text',
          text: { content: '请按格式发送：行业|店名|地址|卖点\n例如：餐饮|张记烤鱼|市中心路123号|秘制烤鱼' },
        });
      }
    } else {
      res.json({ msgtype: 'text', text: { content: '目前只支持文本消息' } });
    }
  } catch (err) {
    logger.error(`Webhook 处理失败: ${err.message}`);
    res.json({ msgtype: 'text', text: { content: `生成失败: ${err.message}` } });
  }
});

function formatReply(results) {
  let reply = '✅ 内容生成完成！\n\n';

  if (results.xiaohongshu) {
    reply += '📕 小红书帖子：\n';
    reply += `标题：${results.xiaohongshu.title}\n`;
    reply += `标签：${(results.xiaohongshu.tags || []).map(t => '#' + t).join(' ')}\n\n`;
  }
  if (results.douyin) {
    reply += '🎵 抖音脚本：\n';
    reply += `标题：${results.douyin.title}\n`;
    reply += `钩子：${results.douyin.hook}\n\n`;
  }
  if (results.poster) {
    reply += '🖼 海报文案：\n';
    reply += `主标题：${results.poster.main_title}\n`;
    reply += `副标题：${results.poster.subtitle}\n\n`;
  }
  if (results.tuangou?.packages) {
    reply += '💰 团购方案：\n';
    results.tuangou.packages.forEach(pkg => {
      reply += `${pkg.name}：¥${pkg.original_price}→¥${pkg.suggested_price}\n`;
    });
  }

  reply += '\n📁 完整文件已保存，可随时查看。';
  return reply;
}

app.listen(PORT, () => {
  logger.success(`AI 内容工作室 API 已启动: http://localhost:${PORT}`);
  logger.info(`健康检查: GET http://localhost:${PORT}/health`);
  logger.info(`商家管理: GET/POST/DELETE http://localhost:${PORT}/api/shops`);
  logger.info(`菜单导入: POST http://localhost:${PORT}/api/menu/import`);
  logger.info(`生成内容: POST http://localhost:${PORT}/api/generate`);
});
