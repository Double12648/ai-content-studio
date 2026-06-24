#!/usr/bin/env node
/**
 * 演示脚本 — 不调用 API，验证整个工作流
 * 运行: node scripts/demo.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const pipeline = require('../src/core/content-pipeline');
const logger = require('../src/utils/logger');

const DEMO_SHOP = {
  name: '张记老灶火锅',
  industry: 'restaurant',
  subType: '火锅',
  address: '市中心步行街88号',
  avgPrice: '78',
  sellingPoints: '秘制锅底、鲜切牛肉、24小时营业',
  specials: '秘制麻辣锅底、手切鲜牛肉、虾滑',
  phone: '0571-88888888',
};

async function runDemo() {
  logger.title('AI 内容工作室 — 演示模式');
  logger.info('使用示例商家数据，验证工作流...\n');

  try {
    // 生成全套内容
    const results = await pipeline.generateAll(DEMO_SHOP, { demo: true });

    // 显示结果
    logger.divider();
    logger.title('小红书帖子');
    console.log('标题:', results.xiaohongshu.title);
    console.log('标签:', results.xiaohongshu.tags?.map(t => '#' + t).join(' '));
    console.log('正文预览:', results.xiaohongshu.content?.slice(0, 200) + '...');

    logger.divider();
    logger.title('抖音脚本');
    console.log('标题:', results.douyin.title);
    console.log('钩子:', results.douyin.hook);
    console.log('镜头数:', results.douyin.scenes?.length);

    logger.divider();
    logger.title('海报文案');
    console.log('主标题:', results.poster.main_title);
    console.log('副标题:', results.poster.subtitle);
    console.log('促销:', results.poster.promo);

    logger.divider();
    logger.title('团购方案');
    results.tuangou.packages?.forEach(pkg => {
      console.log(`${pkg.name}: ¥${pkg.original_price} → ¥${pkg.suggested_price}`);
    });

    // 保存文件
    const saved = pipeline.saveResults(DEMO_SHOP.name, results);
    logger.success('\n所有文件已保存到 output/ 目录');

    // 显示统计
    logger.divider();
    logger.title('生成统计');
    console.log(`商家: ${DEMO_SHOP.name}`);
    console.log(`内容类型: ${Object.keys(results).length} 项`);
    console.log(`文件数量: ${Object.keys(saved).length} 个`);
    logger.success('\n✅ 演示完成！工作流运行正常。');

  } catch (err) {
    logger.error(`演示失败: ${err.message}`);
    console.error(err);
  }
}

runDemo();
