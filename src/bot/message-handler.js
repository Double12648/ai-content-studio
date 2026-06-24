const logger = require('../utils/logger');

// 解析商家信息消息
function parseShopMessage(text) {
  // 格式1: "行业|店名|地址|卖点"
  if (text.includes('|')) {
    const parts = text.split('|').map(s => s.trim());
    return {
      industry: parts[0] || 'restaurant',
      name: parts[1] || '',
      address: parts[2] || '',
      sellingPoints: parts[3] || '',
    };
  }

  // 格式2: 自然语言解析（简单关键词匹配）
  const patterns = [
    { regex: /(?:店名|叫|名叫)[：:]?\s*(.+)/, field: 'name' },
    { regex: /(?:地址|在|位于)[：:]?\s*(.+)/, field: 'address' },
    { regex: /(?:卖点|特色|主打)[：:]?\s*(.+)/, field: 'sellingPoints' },
    { regex: /(?:人均|消费|价格)[：:]?\s*(\d+)/, field: 'avgPrice' },
  ];

  const result = { industry: 'restaurant', name: '' };
  for (const p of patterns) {
    const match = text.match(p.regex);
    if (match) result[p.field] = match[1].trim();
  }

  // 尝试从开头提取店名
  if (!result.name) {
    const nameMatch = text.match(/^(.{2,10?)(?:是|在|的|，|,)/);
    if (nameMatch) result.name = nameMatch[1];
  }

  return result;
}

// 格式化小红书帖子为可发布文本
function formatXhsForPublish(data) {
  let text = data.title + '\n\n';
  text += data.content + '\n\n';
  text += (data.tags || []).map(t => '#' + t).join(' ');
  return text;
}

// 格式化抖音脚本为可读文本
function formatDouyinScript(data) {
  let text = `【${data.title}】\n\n`;
  text += `🎬 开头钩子（3秒）：${data.hook}\n\n`;
  text += '📋 分镜脚本：\n';
  (data.scenes || []).forEach((s, i) => {
    text += `\n镜头${i + 1} [${s.duration}]\n`;
    text += `  画面：${s.visual}\n`;
    text += `  文字：${s.text}\n`;
    text += `  旁白：${s.voiceover}\n`;
    text += `  镜头：${s.shot}\n`;
  });
  text += `\n📢 结尾CTA：${data.cta}`;
  text += `\n🎵 配乐：${data.music}`;
  return text;
}

module.exports = { parseShopMessage, formatXhsForPublish, formatDouyinScript };
