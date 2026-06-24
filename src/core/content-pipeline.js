const fs = require('fs');
const path = require('path');
const { chat } = require('./openai-client');
const { generateXhsImage, generatePosterImage, generateMenuImage, downloadImage } = require('./image-generator');
const promptBuilder = require('./prompt-builder');
const pricingEngine = require('./pricing-engine');
const menuImporter = require('./menu-importer');
const fileManager = require('../utils/file-manager');
const logger = require('../utils/logger');

function loadTemplate(industry) {
  const templatePath = path.join(process.cwd(), 'config', 'templates', `${industry}.json`);
  if (fs.existsSync(templatePath)) {
    return JSON.parse(fs.readFileSync(templatePath, 'utf-8'));
  }
  return null;
}

function parseJsonResponse(text) {
  const match = text.match(/```json\s*([\s\S]*?)```/);
  if (match) return JSON.parse(match[1]);
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

function buildShopInfoContext(shopInfo, menuData) {
  let ctx = `商家信息：
- 店名：${shopInfo.name}
- 行业：${shopInfo.industry}${shopInfo.subType ? `（${shopInfo.subType}）` : ''}`;

  if (shopInfo.address) ctx += `\n- 地址：${shopInfo.address}`;
  if (shopInfo.avgPrice) ctx += `\n- 人均消费：${shopInfo.avgPrice}元`;
  if (shopInfo.sellingPoints) ctx += `\n- 核心卖点：${shopInfo.sellingPoints}`;
  if (shopInfo.specials) ctx += `\n- 特色产品：${shopInfo.specials}`;
  if (shopInfo.phone) ctx += `\n- 电话：${shopInfo.phone}`;

  if (menuData) {
    ctx += '\n\n' + menuImporter.formatMenuForPrompt(menuData);
  }

  return ctx;
}

async function generateXiaohongshu(shopInfo, options = {}) {
  const { withImage = true, demo = false, menuData = null } = options;
  const template = loadTemplate(shopInfo.industry);

  const systemPrompt = promptBuilder.buildSystemPrompt('xiaohongshu', shopInfo.industry, template);
  const shopContext = buildShopInfoContext(shopInfo, menuData);
  const userPrompt = shopContext + '\n\n请生成一篇小红书种草帖子。';

  let result;
  if (demo) {
    result = {
      title: `✨ ${shopInfo.name}｜这家${shopInfo.subType || shopInfo.industry}绝绝子！`,
      content: `姐妹们！！！我发现了一家宝藏${shopInfo.subType || shopInfo.industry}店！\n\n📍 ${shopInfo.address || '市中心'}\n💰 人均${shopInfo.avgPrice || '50'}元\n\n刚进门就被环境惊艳到了，装修特别有格调～\n\n必点推荐：\n🔥 ${shopInfo.specials || '招牌菜'}\n🔥 秘制甜品\n🔥 特调饮品\n\n服务员态度超好，全程微笑服务～\n\n总结：环境⭐⭐⭐⭐⭐ 口味⭐⭐⭐⭐⭐ 服务⭐⭐⭐⭐⭐\n\n姐妹们冲！绝对不会踩雷！`,
      tags: [shopInfo.name, shopInfo.industry + '推荐', '美食探店', '必吃榜', '宝藏店铺', '今天吃什么', '本地生活'],
      cover_texts: [`人均${shopInfo.avgPrice || '50'}吃到撑`, `这家${shopInfo.subType || ''}绝了`, `本地人都在排队的店`],
      image_prompt: `A beautiful ${shopInfo.subType || shopInfo.industry} restaurant interior, warm lighting, appetizing food presentation, professional food photography style`,
    };
  } else {
    const response = await chat(systemPrompt, userPrompt);
    result = parseJsonResponse(response);
  }

  if (withImage && !demo) {
    try {
      const imgResult = await generateXhsImage(shopInfo.name, result.content?.slice(0, 100) || shopInfo.industry);
      if (imgResult) {
        result.imageUrl = imgResult.url;
        result.imageRevisedPrompt = imgResult.revised_prompt;
      }
    } catch (err) {
      logger.warn(`配图生成失败: ${err.message}`);
    }
  }

  return result;
}

async function generateDouyin(shopInfo, options = {}) {
  const { demo = false, menuData = null } = options;
  const template = loadTemplate(shopInfo.industry);

  const systemPrompt = promptBuilder.buildSystemPrompt('douyin', shopInfo.industry, template);
  const shopContext = buildShopInfoContext(shopInfo, menuData);
  const userPrompt = shopContext + `\n- 视频时长：${shopInfo.videoDuration || '30'}秒\n\n请生成一个抖音探店视频脚本。`;

  if (demo) {
    return {
      title: `${shopInfo.name}｜本地人私藏的${shopInfo.subType || shopInfo.industry}店`,
      hook: `这家店我来了5次了！每次都要排队！`,
      scenes: [
        { duration: '3s', visual: '店铺外观，排队人群', text: '排队也要吃的店！', voiceover: '你们敢信吗，这家店居然要排这么久的队！', shot: '固定+慢推' },
        { duration: '5s', visual: '店内环境，装修细节', text: '环境也太好了吧', voiceover: '但是进来之后我理解了，这环境绝了', shot: '跟拍' },
        { duration: '8s', visual: '菜品特写，热气腾腾', text: `${shopInfo.specials || '招牌菜'}必点！`, voiceover: `这个${shopInfo.specials || '招牌菜'}是他们家的招牌，一上桌我就疯了`, shot: '特写+慢动作' },
        { duration: '5s', visual: '吃播画面，满足表情', text: '好吃到停不下来', voiceover: '入口的瞬间，我整个人都升华了', shot: '固定' },
        { duration: '4s', visual: '价格展示', text: `人均${shopInfo.avgPrice || '50'}`, voiceover: `人均才${shopInfo.avgPrice || '50'}，这个性价比我直接封神`, shot: '固定' },
        { duration: '5s', visual: '店铺全景+地址', text: '📍收藏！', voiceover: '地址我放评论区了，姐妹们冲！', shot: '拉远' },
      ],
      cta: '📍 地址：评论区见\n❤️ 收藏本条视频，到店报暗号打折！',
      music: '推荐热门探店BGM：轻松欢快节奏',
      hashtags: [shopInfo.name, '探店', shopInfo.industry + '推荐', '本地生活', '必吃榜'],
    };
  }

  const response = await chat(systemPrompt, userPrompt);
  return parseJsonResponse(response);
}

async function generatePoster(shopInfo, options = {}) {
  const { withImage = true, demo = false, menuData = null } = options;
  const template = loadTemplate(shopInfo.industry);

  const systemPrompt = promptBuilder.buildSystemPrompt('poster', shopInfo.industry, template);
  const shopContext = buildShopInfoContext(shopInfo, menuData);
  const userPrompt = shopContext + `
- 活动主题：${shopInfo.event || '日常宣传'}
- 优惠信息：${shopInfo.promo || '到店有惊喜'}

请生成海报文案和设计指导。`;

  let result;
  if (demo) {
    result = {
      main_title: shopInfo.event || `${shopInfo.name}`,
      subtitle: shopInfo.promo || `精选${shopInfo.subType || shopInfo.industry}，品质之选`,
      promo: shopInfo.promo || '新店开业 全场8折',
      details: [
        `📍 ${shopInfo.address || '市中心商业街'}`,
        `📞 ${shopInfo.phone || '400-xxx-xxxx'}`,
        '⏰ 营业时间：10:00-22:00',
      ],
      style: template?.poster_styles?.[shopInfo.subType] || '现代简约风格',
      color_scheme: '根据行业自适应',
      image_prompt: `Professional commercial poster for a ${shopInfo.subType || shopInfo.industry} shop named "${shopInfo.name}", modern design, eye-catching layout, Chinese text placeholder, vibrant colors`,
      image_size: '1024x1792',
    };
  } else {
    const response = await chat(systemPrompt, userPrompt);
    result = parseJsonResponse(response);
  }

  if (withImage && !demo) {
    try {
      const imgResult = await generatePosterImage(
        shopInfo.name,
        result.style || '现代商业风格',
        result.main_title + ' ' + (result.subtitle || '')
      );
      if (imgResult) {
        result.imageUrl = imgResult.url;
        result.imageRevisedPrompt = imgResult.revised_prompt;
      }
    } catch (err) {
      logger.warn(`海报图片生成失败: ${err.message}`);
    }
  }

  return result;
}

async function generateTuangou(shopInfo, options = {}) {
  const { demo = false, menuData = null } = options;
  const template = loadTemplate(shopInfo.industry);

  const systemPrompt = promptBuilder.buildSystemPrompt('tuangou', shopInfo.industry, template);
  const shopContext = buildShopInfoContext(shopInfo, menuData);
  let userPrompt = shopContext + '\n\n请生成团购套餐方案。';

  let computedPackages = null;
  if (menuData && menuData.categories) {
    computedPackages = pricingEngine.generatePackageCombos(menuData, shopInfo.name);
    if (computedPackages.length > 0) {
      userPrompt += '\n\n【以下套餐价格由系统计算，请直接使用，只负责优化文案描述】\n';
      userPrompt += JSON.stringify(computedPackages, null, 2);
    }
  }

  if (demo) {
    return {
      packages: [
        {
          name: `${shopInfo.name}超值双人餐`,
          original_price: 198,
          suggested_price: 99,
          items: [
            `${shopInfo.specials || '招牌菜'} x1（原价68元）`,
            '人气小食 x2（原价48元）',
            '精选饮品 x2（原价40元）',
            '餐后甜点 x2（原价42元）',
          ],
          highlights: ['5折超值', '双人份量足', '招牌必点', '无需预约'],
          description: `${shopInfo.name}精选双人套餐，包含招牌菜品和人气小食，原价198元，团购仅需99元！`,
          validity: '购买后30天内有效',
          booking: '无需预约，高峰期可能需等位',
        },
        {
          name: `${shopInfo.name}单人精选餐`,
          original_price: 98,
          suggested_price: 49,
          items: [
            `${shopInfo.specials || '招牌菜'} x1（原价68元）`,
            '精选饮品 x1（原价20元）',
            '餐后甜点 x1（原价10元）',
          ],
          highlights: ['5折优惠', '一人食友好', '快速出餐'],
          description: `${shopInfo.name}单人精选套餐，一个人也要好好吃饭！`,
          validity: '购买后30天内有效',
          booking: '无需预约',
        },
      ],
      promotion_tips: '建议在抖音/小红书发布探店视频时挂载团购链接，利用内容带动转化。新店开业期间可设置限时秒杀价吸引首批用户。',
    };
  }

  const response = await chat(systemPrompt, userPrompt);
  const result = parseJsonResponse(response);

  if (menuData && result.packages && computedPackages) {
    result.packages = result.packages.map((pkg, idx) => {
      const computed = computedPackages[idx];
      if (computed) {
        pkg.original_price = computed.original_price;
        pkg.suggested_price = computed.suggested_price;
        pkg.items = computed.items;
      }
      return pkg;
    });
  }

  return result;
}

async function generateAll(shopInfo, options = {}) {
  const { demo = false, menuData = null } = options;
  logger.title(`开始为「${shopInfo.name}」生成全套内容`);

  const results = {};

  logger.step(1, 4, '生成小红书图文...');
  results.xiaohongshu = await generateXiaohongshu(shopInfo, { ...options, withImage: !demo, menuData });

  logger.step(2, 4, '生成抖音视频脚本...');
  results.douyin = await generateDouyin(shopInfo, { ...options, menuData });

  logger.step(3, 4, '生成海报设计...');
  results.poster = await generatePoster(shopInfo, { ...options, withImage: !demo, menuData });

  logger.step(4, 4, '生成团购方案...');
  results.tuangou = await generateTuangou(shopInfo, { ...options, menuData });

  return results;
}

function saveResults(shopName, results) {
  const dir = fileManager.getOutputDir(shopName, 'full');
  const saved = {};

  for (const [type, data] of Object.entries(results)) {
    saved[type] = fileManager.saveJson(dir, `${type}.json`, data);
    logger.success(`${type} 已保存到 ${saved[type]}`);
  }

  return saved;
}

module.exports = {
  generateXiaohongshu,
  generateDouyin,
  generatePoster,
  generateTuangou,
  generateAll,
  saveResults,
};
