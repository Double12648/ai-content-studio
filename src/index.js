#!/usr/bin/env node
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const inquirer = require('inquirer');
const chalk = require('chalk');
const logger = require('./utils/logger');
const pipeline = require('./core/content-pipeline');

const INDUSTRIES = [
  { name: '餐饮（中餐/火锅/烧烤/奶茶/咖啡等）', value: 'restaurant' },
  { name: '美业（美甲/美睫/美容/美发等）', value: 'beauty' },
  { name: '教培（辅导班/艺术/体育/语言等）', value: 'education' },
];

const SUB_TYPES = {
  restaurant: ['中餐', '火锅', '烧烤', '奶茶', '咖啡', '甜品', '日料', '西餐'],
  beauty: ['美甲', '美睫', '美容', '美发', '皮肤管理', '半永久', '身体护理'],
  education: ['K12辅导', '艺术培训', '体育培训', '语言培训', '职业培训', '早教'],
};

async function collectShopInfo() {
  logger.title('AI 内容工作室 — 一人公司自动化工具');

  const { industry } = await inquirer.prompt([{
    type: 'list',
    name: 'industry',
    message: '选择商家行业：',
    choices: INDUSTRIES,
  }]);

  const subTypes = SUB_TYPES[industry] || [];
  const { subType } = await inquirer.prompt([{
    type: 'list',
    name: 'subType',
    message: '选择细分类型：',
    choices: subTypes,
  }]);

  const answers = await inquirer.prompt([
    { type: 'input', name: 'name', message: '店铺名称：', validate: v => v.trim() ? true : '请输入店铺名称' },
    { type: 'input', name: 'address', message: '店铺地址（选填，回车跳过）：' },
    { type: 'input', name: 'avgPrice', message: '人均消费（选填，如：50）：' },
    { type: 'input', name: 'sellingPoints', message: '核心卖点（选填，如：食材新鲜、秘制配方）：' },
    { type: 'input', name: 'specials', message: '特色产品（选填，如：招牌烤鱼）：' },
    { type: 'input', name: 'phone', message: '联系电话（选填）：' },
  ]);

  return { ...answers, industry, subType };
}

async function selectContent() {
  const { contents } = await inquirer.prompt([{
    type: 'checkbox',
    name: 'contents',
    message: '选择要生成的内容（空格选择，回车确认）：',
    choices: [
      { name: '小红书图文（含AI配图）', value: 'xiaohongshu', checked: true },
      { name: '抖音视频脚本', value: 'douyin', checked: true },
      { name: '海报设计（含AI图片）', value: 'poster', checked: true },
      { name: '团购套餐方案', value: 'tuangou', checked: true },
    ],
  }]);

  if (contents.length === 0) {
    logger.warn('至少选择一项内容！');
    return selectContent();
  }
  return contents;
}

async function displayResult(type, data) {
  logger.divider();
  switch (type) {
    case 'xiaohongshu':
      logger.title('小红书图文');
      console.log(chalk.yellow('标题：') + data.title);
      console.log(chalk.yellow('正文：'));
      console.log(data.content);
      console.log(chalk.yellow('标签：') + (data.tags || []).map(t => `#${t}`).join(' '));
      console.log(chalk.yellow('封面文案：') + (data.cover_texts || []).join(' | '));
      if (data.imageUrl) console.log(chalk.yellow('配图：') + data.imageUrl);
      break;

    case 'douyin':
      logger.title('抖音视频脚本');
      console.log(chalk.yellow('标题：') + data.title);
      console.log(chalk.yellow('开头钩子：') + data.hook);
      console.log(chalk.yellow('分镜：'));
      (data.scenes || []).forEach((s, i) => {
        console.log(chalk.gray(`  镜头${i + 1} [${s.duration}] `) + s.visual);
        console.log(chalk.white(`    文字：${s.text}`));
        console.log(chalk.white(`    旁白：${s.voiceover}`));
      });
      console.log(chalk.yellow('行动号召：') + data.cta);
      console.log(chalk.yellow('配乐：') + data.music);
      break;

    case 'poster':
      logger.title('海报设计');
      console.log(chalk.yellow('主标题：') + data.main_title);
      console.log(chalk.yellow('副标题：') + data.subtitle);
      console.log(chalk.yellow('促销信息：') + data.promo);
      console.log(chalk.yellow('详细信息：'));
      (data.details || []).forEach(d => console.log(`  ${d}`));
      if (data.imageUrl) console.log(chalk.yellow('海报图片：') + data.imageUrl);
      break;

    case 'tuangou':
      logger.title('团购套餐方案');
      (data.packages || []).forEach((pkg, i) => {
        console.log(chalk.cyan(`\n套餐${i + 1}：${pkg.name}`));
        console.log(chalk.red(`  原价：¥${pkg.original_price} → 团购价：¥${pkg.suggested_price}`));
        console.log(chalk.white('  包含：'));
        (pkg.items || []).forEach(item => console.log(`    • ${item}`));
        console.log(chalk.white('  卖点：') + (pkg.highlights || []).join(' | '));
      });
      if (data.promotion_tips) {
        console.log(chalk.yellow('\n推广建议：') + data.promotion_tips);
      }
      break;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const isDemo = args.includes('--demo');

  if (isDemo) {
    logger.info('🎭 演示模式 — 不调用真实API，使用模板生成示例内容');
  }

  try {
    const shopInfo = await collectShopInfo();
    const contents = await selectContent();

    const { confirm } = await inquirer.prompt([{
      type: 'confirm',
      name: 'confirm',
      message: `确认为「${shopInfo.name}」生成 ${contents.length} 项内容？`,
      default: true,
    }]);

    if (!confirm) {
      logger.info('已取消');
      return;
    }

    const results = {};
    for (let i = 0; i < contents.length; i++) {
      const type = contents[i];
      logger.step(i + 1, contents.length, `生成${type}中...`);

      switch (type) {
        case 'xiaohongshu':
          results.xiaohongshu = await pipeline.generateXiaohongshu(shopInfo, { demo: isDemo });
          break;
        case 'douyin':
          results.douyin = await pipeline.generateDouyin(shopInfo, { demo: isDemo });
          break;
        case 'poster':
          results.poster = await pipeline.generatePoster(shopInfo, { demo: isDemo });
          break;
        case 'tuangou':
          results.tuangou = await pipeline.generateTuangou(shopInfo, { demo: isDemo });
          break;
      }
    }

    logger.title('生成完成！');
    for (const type of contents) {
      await displayResult(type, results[type]);
    }

    const saved = pipeline.saveResults(shopInfo.name, results);
    logger.success(`\n所有文件已保存到 output/ 目录`);

    const { again } = await inquirer.prompt([{
      type: 'confirm',
      name: 'again',
      message: '是否继续为其他商家生成内容？',
      default: false,
    }]);

    if (again) await main();

  } catch (err) {
    if (err.message?.includes('closed') || err.message?.includes('interrupt')) {
      logger.info('\n已退出');
    } else {
      logger.error(err.message);
      if (isDemo) {
        logger.info('如果是演示模式下出错，请检查输入信息是否完整');
      }
    }
  }
}

main();
