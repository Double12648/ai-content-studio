const OpenAI = require('openai');
const https = require('https');
const http = require('http');
const logger = require('../utils/logger');

async function downloadImage(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    client.get(url, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

// 检查是否配置了图片生成
function hasImageSupport() {
  const imageModel = process.env.OPENAI_IMAGE_MODEL;
  return imageModel && imageModel !== 'none';
}

// 获取图片生成客户端（可能是独立的图片 API）
function getImageClient() {
  const imageApiKey = process.env.IMAGE_API_KEY;
  const imageApiUrl = process.env.IMAGE_API_URL;

  if (imageApiKey && imageApiUrl) {
    return new OpenAI({ apiKey: imageApiKey, baseURL: imageApiUrl });
  }

  // 回退到主 API
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey === 'sk-your-api-key-here') {
    return null;
  }
  return new OpenAI({
    apiKey,
    baseURL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
  });
}

async function generateImage(prompt, options = {}) {
  const { size = '1024x1024', quality = 'standard', n = 1 } = options;

  // 检查是否有独立的图片 API
  const imageModel = process.env.IMAGE_MODEL || process.env.OPENAI_IMAGE_MODEL;

  if (!imageModel || imageModel === 'none') {
    logger.warn('未配置图片生成 API，跳过图片生成');
    logger.info('提示: 可在 .env 中配置 IMAGE_API_KEY 和 IMAGE_API_URL 启用图片生成');
    return null;
  }

  const client = getImageClient();
  if (!client) {
    logger.warn('图片 API 未配置');
    return null;
  }

  try {
    const response = await client.images.generate({
      model: imageModel,
      prompt,
      n,
      size,
      quality: quality === 'hd' ? 'hd' : 'standard',
    });
    return response.data[0];
  } catch (err) {
    logger.error(`图片生成失败: ${err.message}`);
    return null;
  }
}

async function generatePosterImage(shopName, style, description) {
  const prompt = `为"${shopName}"设计一张商业海报。风格：${style}。内容：${description}。要求：专业商业设计风格，适合线下商家宣传使用，中文排版，色彩鲜明吸引眼球。`;
  logger.info('正在生成海报图片...');
  return generateImage(prompt, { size: '1024x1792', quality: 'hd' });
}

async function generateXhsImage(shopName, content) {
  const prompt = `为小红书帖子设计一张配图。商家：${shopName}。内容主题：${content}。要求：小红书风格，清新美观，适合年轻女性用户，带文字点缀，竖版构图。`;
  logger.info('正在生成小红书配图...');
  return generateImage(prompt, { size: '1024x1024', quality: 'standard' });
}

async function generateMenuImage(shopName, dishes) {
  const prompt = `为"${shopName}"设计一张精美的菜单海报。菜品：${dishes}。要求：美食摄影风格，高饱和度，让人食欲大开，包含价格标注区域，专业餐饮设计。`;
  logger.info('正在生成菜单图片...');
  return generateImage(prompt, { size: '1024x1792', quality: 'hd' });
}

module.exports = { generatePosterImage, generateXhsImage, generateMenuImage, downloadImage, hasImageSupport };
