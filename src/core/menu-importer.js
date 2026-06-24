const fs = require('fs');
const path = require('path');
const fileManager = require('../utils/file-manager');
const logger = require('../utils/logger');

const SHOPS_DIR = path.join(process.cwd(), 'data', 'shops');

const menuImporter = {
  parseCSV(content) {
    const lines = content.trim().split('\n');
    if (lines.length < 2) throw new Error('CSV 文件至少需要表头和一行数据');

    const header = lines[0].split(',').map(h => h.trim());
    const fieldMap = {
      '分类': 'category', '类别': 'category',
      '菜品名称': 'name', '菜品': 'name', '名称': 'name', '产品名': 'name',
      '价格': 'price', '售价': 'price',
      '原价': 'originalPrice',
      '描述': 'description', '简介': 'description',
      '标签': 'tags',
    };

    const categories = {};

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const values = line.split(',').map(v => v.trim());
      const item = {};

      header.forEach((h, idx) => {
        const field = fieldMap[h] || h;
        item[field] = values[idx] || '';
      });

      if (!item.name) continue;

      const price = parseFloat(item.price);
      if (isNaN(price)) continue;

      const cat = item.category || '其他';
      if (!categories[cat]) categories[cat] = [];

      categories[cat].push({
        name: item.name,
        price,
        originalPrice: item.originalPrice ? parseFloat(item.originalPrice) : null,
        description: item.description || '',
        tags: item.tags ? item.tags.split('|').map(t => t.trim()) : [],
      });
    }

    return this._buildMenuData(categories);
  },

  parseJSON(content) {
    const data = JSON.parse(content);

    if (data.categories && Array.isArray(data.categories)) {
      return this._buildMenuData(data.categories.reduce((acc, cat) => {
        acc[cat.name] = (cat.items || []).map(item => ({
          name: item.name,
          price: parseFloat(item.price),
          originalPrice: item.originalPrice ? parseFloat(item.originalPrice) : null,
          description: item.description || '',
          tags: item.tags || [],
        }));
        return acc;
      }, {}));
    }

    if (Array.isArray(data)) {
      const categories = {};
      data.forEach(item => {
        const cat = item.category || item.分类 || '其他';
        if (!categories[cat]) categories[cat] = [];
        categories[cat].push({
          name: item.name || item.菜品名称,
          price: parseFloat(item.price || item.价格),
          originalPrice: item.originalPrice ? parseFloat(item.originalPrice) : null,
          description: item.description || item.描述 || '',
          tags: item.tags ? (Array.isArray(item.tags) ? item.tags : item.tags.split('|')) : [],
        });
      });
      return this._buildMenuData(categories);
    }

    throw new Error('JSON 格式不正确，需要数组或 {categories: [...]} 结构');
  },

  _buildMenuData(categoriesObj) {
    const categories = [];
    let totalItems = 0;
    let totalPrice = 0;
    let minPrice = Infinity;
    let maxPrice = 0;
    const allItems = [];

    for (const [name, items] of Object.entries(categoriesObj)) {
      const catItems = items.map((item, idx) => ({
        id: `item_${String(totalItems + idx + 1).padStart(3, '0')}`,
        ...item,
      }));

      categories.push({ name, items: catItems });

      catItems.forEach(item => {
        totalItems++;
        totalPrice += item.price;
        if (item.price < minPrice) minPrice = item.price;
        if (item.price > maxPrice) maxPrice = item.price;
        allItems.push(item);
      });
    }

    const sorted = [...allItems].sort((a, b) => b.price - a.price);

    return {
      categories,
      summary: {
        totalItems,
        avgPrice: totalItems > 0 ? Math.round(totalPrice / totalItems) : 0,
        priceRange: {
          min: totalItems > 0 ? minPrice : 0,
          max: totalItems > 0 ? maxPrice : 0,
        },
        topItems: sorted.slice(0, 5).map(i => i.name),
      },
    };
  },

  calculateAvgPrice(menuData) {
    if (!menuData || !menuData.categories) return 0;

    const mainKeywords = ['荤菜', '主菜', '锅底', '肉类', '海鲜', '招牌'];
    const sideKeywords = ['素菜', '小吃', '凉菜', '主食'];
    const drinkKeywords = ['饮品', '酒水', '饮料', '甜品'];

    let mainSum = 0, mainCount = 0;
    let sideSum = 0, sideCount = 0;
    let drinkSum = 0, drinkCount = 0;

    menuData.categories.forEach(cat => {
      const catName = cat.name;
      cat.items.forEach(item => {
        const isMain = mainKeywords.some(k => catName.includes(k));
        const isSide = sideKeywords.some(k => catName.includes(k));
        const isDrink = drinkKeywords.some(k => catName.includes(k));

        if (isMain) { mainSum += item.price; mainCount++; }
        else if (isSide) { sideSum += item.price; sideCount++; }
        else if (isDrink) { drinkSum += item.price; drinkCount++; }
      });
    });

    const avgMain = mainCount > 0 ? mainSum / mainCount : 0;
    const avgSide = sideCount > 0 ? sideSum / sideCount : 0;
    const avgDrink = drinkCount > 0 ? drinkSum / drinkCount : 0;

    if (avgMain > 0) {
      return Math.round(avgMain + avgSide * 1.5 + avgDrink);
    }

    return menuData.summary?.avgPrice || 0;
  },

  saveMenu(shopName, menuData) {
    const safeName = shopName.replace(/[^a-zA-Z0-9一-龥]/g, '_');
    const shopDir = path.join(SHOPS_DIR, safeName);
    fileManager.ensureDir(shopDir);

    const menuPath = path.join(shopDir, 'menu.json');
    fs.writeFileSync(menuPath, JSON.stringify(menuData, null, 2), 'utf-8');
    logger.success(`菜单已保存: ${menuPath}`);
    return menuPath;
  },

  loadMenu(shopName) {
    const safeName = shopName.replace(/[^a-zA-Z0-9一-龥]/g, '_');
    const menuPath = path.join(SHOPS_DIR, safeName, 'menu.json');
    if (!fs.existsSync(menuPath)) return null;
    return JSON.parse(fs.readFileSync(menuPath, 'utf-8'));
  },

  formatMenuForPrompt(menuData) {
    if (!menuData || !menuData.categories) return '';

    let text = '【菜单数据 - 请严格使用以下实际价格，禁止编造】\n\n';

    menuData.categories.forEach(cat => {
      text += `【${cat.name}】\n`;
      cat.items.forEach(item => {
        text += `- ${item.name}：${item.price}元`;
        if (item.originalPrice) text += `（原价${item.originalPrice}元）`;
        if (item.description) text += `，${item.description}`;
        text += '\n';
      });
      text += '\n';
    });

    if (menuData.summary) {
      text += `共 ${menuData.summary.totalItems} 个菜品`;
      if (menuData.summary.priceRange) {
        text += `，价格区间 ${menuData.summary.priceRange.min}-${menuData.summary.priceRange.max} 元`;
      }
    }

    return text;
  },

  processUploadedFile(fileName, content) {
    const ext = path.extname(fileName).toLowerCase();

    if (ext === '.csv') {
      return this.parseCSV(content);
    } else if (ext === '.json') {
      return this.parseJSON(content);
    } else {
      throw new Error(`不支持的文件格式: ${ext}，请使用 .json 或 .csv`);
    }
  },
};

module.exports = menuImporter;
