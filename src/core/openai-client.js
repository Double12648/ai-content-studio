const OpenAI = require('openai');
const logger = require('../utils/logger');

let client = null;

function getClient() {
  if (!client) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey || apiKey === 'sk-your-api-key-here') {
      throw new Error('请在 .env 文件中配置 OPENAI_API_KEY');
    }
    client = new OpenAI({
      apiKey,
      baseURL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    });
  }
  return client;
}

async function chat(systemPrompt, userPrompt, options = {}) {
  const { model, temperature = 0.8, maxTokens = 2000 } = options;
  const actualModel = model || process.env.OPENAI_MODEL || 'gpt-4o';

  try {
    const response = await getClient().chat.completions.create({
      model: actualModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature,
      max_tokens: maxTokens,
    });
    return response.choices[0].message.content;
  } catch (err) {
    logger.error(`OpenAI API 调用失败: ${err.message}`);
    throw err;
  }
}

async function generateImage(prompt, options = {}) {
  const { size = '1024x1024', quality = 'standard', n = 1 } = options;
  const model = process.env.OPENAI_IMAGE_MODEL || 'dall-e-3';

  try {
    const response = await getClient().images.generate({
      model,
      prompt,
      n,
      size,
      quality,
    });
    return response.data[0];
  } catch (err) {
    logger.error(`图片生成失败: ${err.message}`);
    throw err;
  }
}

module.exports = { chat, generateImage, getClient };
