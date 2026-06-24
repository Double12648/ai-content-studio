const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const PROMPTS_DIR = path.join(process.cwd(), 'config', 'prompts');

const INDUSTRY_MAP = {
  restaurant: 'restaurant',
  beauty: 'beauty',
  education: 'education',
  entertainment: 'entertainment',
  fitness: 'fitness',
  retail: 'retail',
};

const promptBuilder = {
  loadFile(filePath) {
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, 'utf-8').trim();
    }
    return '';
  },

  loadBasePrompt(contentType) {
    const basePath = path.join(PROMPTS_DIR, 'base', `${contentType}.txt`);
    const legacyPath = path.join(PROMPTS_DIR, `${contentType}.txt`);

    if (fs.existsSync(basePath)) {
      return this.loadFile(basePath);
    }
    if (fs.existsSync(legacyPath)) {
      return this.loadFile(legacyPath);
    }
    return '';
  },

  loadIndustryPrompt(industry, type) {
    const industryDir = INDUSTRY_MAP[industry] || industry;
    const filePath = path.join(PROMPTS_DIR, 'industries', industryDir, `${type}.txt`);
    return this.loadFile(filePath);
  },

  loadGuard(name) {
    const filePath = path.join(PROMPTS_DIR, 'guards', `${name}.txt`);
    return this.loadFile(filePath);
  },

  buildSystemPrompt(contentType, industry, templateData) {
    const basePrompt = this.loadBasePrompt(contentType);
    const industrySystem = this.loadIndustryPrompt(industry, 'system');
    const industryVocab = this.loadIndustryPrompt(industry, 'vocabulary');
    const industryStyle = this.loadIndustryPrompt(industry, 'style');
    const antiHallucination = this.loadGuard('anti-hallucination');

    let assembled = '';

    if (industrySystem) {
      assembled += industrySystem + '\n\n';
    }

    assembled += '## 任务\n' + basePrompt + '\n\n';

    if (industryVocab) {
      assembled += '## 行业词汇库（优先使用以下词汇）\n' + industryVocab + '\n\n';
    }

    if (industryStyle) {
      assembled += '## 写作风格指南\n' + industryStyle + '\n\n';
    }

    if (templateData) {
      assembled += '## 行业参考数据\n' + this._formatTemplateData(templateData) + '\n\n';
    }

    if (antiHallucination) {
      assembled += '## 真实性约束（严格遵守）\n' + antiHallucination + '\n';
    }

    return assembled;
  },

  _formatTemplateData(template) {
    let text = '';

    if (template.xhs_tags) {
      text += `小红书参考标签：${template.xhs_tags.join('、')}\n`;
    }
    if (template.common_selling_points) {
      text += `常见卖点：${template.common_selling_points.join('、')}\n`;
    }
    if (template.video_hooks) {
      text += `视频钩子模板：${template.video_hooks.join(' | ')}\n`;
    }
    if (template.poster_styles) {
      text += `海报设计风格参考：${JSON.stringify(template.poster_styles)}\n`;
    }
    if (template.tuangou_template) {
      text += `套餐模板：${JSON.stringify(template.tuangou_template)}\n`;
    }

    return text;
  },
};

module.exports = promptBuilder;
