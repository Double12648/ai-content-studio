const logger = require('../utils/logger');

const pricingEngine = {
  calculateGroupBuyPrice(menuItems, options = {}) {
    const {
      targetDiscount = 0.55,
      packageSize = 4,
      packageName = '',
    } = options;

    if (!menuItems || menuItems.length === 0) {
      return null;
    }

    const selected = this._selectItems(menuItems, packageSize);
    const originalPrice = selected.reduce((sum, item) => sum + item.price, 0);

    let groupBuyPrice = Math.round(originalPrice * targetDiscount);
    groupBuyPrice = this._roundToNice(groupBuyPrice);

    return {
      name: packageName,
      original_price: originalPrice,
      suggested_price: groupBuyPrice,
      items: selected.map(item =>
        `${item.name} x1（原价${item.price}元）`
      ),
      highlights: this._generateHighlights(originalPrice, groupBuyPrice, selected),
      discount: `${Math.round((groupBuyPrice / originalPrice) * 10)}折`,
    };
  },

  generatePackageCombos(menuData, shopName = '') {
    if (!menuData || !menuData.categories) return [];

    const allItems = menuData.categories.flatMap(cat =>
      cat.items.map(item => ({ ...item, category: cat.name }))
    );

    if (allItems.length === 0) return [];

    const combos = [];

    const doublePkg = this._buildPackage(allItems, shopName, '双人', 4, 0.55);
    if (doublePkg) combos.push(doublePkg);

    const quadPkg = this._buildPackage(allItems, shopName, '四人', 7, 0.6);
    if (quadPkg) combos.push(quadPkg);

    const singlePkg = this._buildPackage(allItems, shopName, '单人', 2, 0.65);
    if (singlePkg) combos.push(singlePkg);

    return combos;
  },

  _buildPackage(allItems, shopName, type, size, discount) {
    const selected = this._selectItems(allItems, size);
    if (selected.length === 0) return null;

    const originalPrice = selected.reduce((sum, item) => sum + item.price, 0);
    let groupBuyPrice = Math.round(originalPrice * discount);
    groupBuyPrice = this._roundToNice(groupBuyPrice);

    return {
      name: `${shopName}${type}超值套餐`,
      original_price: originalPrice,
      suggested_price: groupBuyPrice,
      items: selected.map(item => `${item.name} x1（原价${item.price}元）`),
      highlights: this._generateHighlights(originalPrice, groupBuyPrice, selected),
      description: `${shopName}精选${type}套餐，原价${originalPrice}元，团购仅需${groupBuyPrice}元！`,
      validity: '购买后30天内有效',
      booking: '无需预约，高峰期可能需等位',
    };
  },

  _selectItems(items, count) {
    if (items.length <= count) return [...items];

    const mainKeywords = ['荤菜', '主菜', '锅底', '肉类', '海鲜', '招牌'];
    const sideKeywords = ['素菜', '小吃', '凉菜', '主食'];
    const drinkKeywords = ['饮品', '酒水', '饮料', '甜品'];

    const mainItems = items.filter(i =>
      mainKeywords.some(k => (i.category || '').includes(k))
    );
    const sideItems = items.filter(i =>
      sideKeywords.some(k => (i.category || '').includes(k))
    );
    const drinkItems = items.filter(i =>
      drinkKeywords.some(k => (i.category || '').includes(k))
    );
    const otherItems = items.filter(i =>
      !mainItems.includes(i) && !sideItems.includes(i) && !drinkItems.includes(i)
    );

    const selected = [];
    const mainCount = Math.max(1, Math.ceil(count * 0.4));
    const sideCount = Math.max(1, Math.floor(count * 0.35));
    const drinkCount = Math.max(0, count - mainCount - sideCount);

    this._pickRandom(mainItems, mainCount).forEach(i => selected.push(i));
    this._pickRandom(sideItems, sideCount).forEach(i => selected.push(i));
    this._pickRandom(drinkItems, drinkCount).forEach(i => selected.push(i));

    if (selected.length < count) {
      this._pickRandom(otherItems, count - selected.length).forEach(i => selected.push(i));
    }

    return selected.slice(0, count);
  },

  _pickRandom(arr, count) {
    if (arr.length === 0) return [];
    const shuffled = [...arr].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, Math.min(count, arr.length));
  },

  _roundToNice(price) {
    if (price <= 10) return price;
    if (price <= 50) return Math.round(price / 5) * 5 - 1;
    if (price <= 100) return Math.ceil(price / 10) * 10 - 1;
    if (price <= 200) return Math.ceil(price / 10) * 10 - 1;
    return Math.ceil(price / 50) * 50 - 1;
  },

  _generateHighlights(original, groupBuy, items) {
    const discount = Math.round((groupBuy / original) * 10);
    const highlights = [`${discount}折超值`];

    if (items.length >= 3) highlights.push(`${items.length}道菜品`);
    highlights.push('无需预约');

    const hasMain = items.some(i =>
      ['荤菜', '主菜', '锅底', '肉类'].some(k => (i.category || '').includes(k))
    );
    if (hasMain) highlights.push('招牌必点');

    return highlights;
  },

  calculateAvgPrice(menuData) {
    if (!menuData || !menuData.categories) return 0;

    const mainKeywords = ['荤菜', '主菜', '锅底', '肉类', '海鲜'];
    const sideKeywords = ['素菜', '小吃', '凉菜', '主食'];
    const drinkKeywords = ['饮品', '酒水', '饮料'];

    let mainSum = 0, mainCount = 0;
    let sideSum = 0, sideCount = 0;
    let drinkSum = 0, drinkCount = 0;

    menuData.categories.forEach(cat => {
      cat.items.forEach(item => {
        const cn = cat.name;
        if (mainKeywords.some(k => cn.includes(k))) {
          mainSum += item.price; mainCount++;
        } else if (sideKeywords.some(k => cn.includes(k))) {
          sideSum += item.price; sideCount++;
        } else if (drinkKeywords.some(k => cn.includes(k))) {
          drinkSum += item.price; drinkCount++;
        }
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

  validatePricing(generatedData, menuData) {
    if (!menuData || !menuData.categories) return { valid: true, warnings: [] };

    const allPrices = {};
    menuData.categories.forEach(cat => {
      cat.items.forEach(item => {
        allPrices[item.name] = item.price;
      });
    });

    const warnings = [];

    if (generatedData.packages) {
      generatedData.packages.forEach(pkg => {
        if (pkg.items) {
          pkg.items.forEach(itemStr => {
            const match = itemStr.match(/(.+?)\s*x\d+.*?(\d+)元/);
            if (match) {
              const itemName = match[1].trim();
              const statedPrice = parseInt(match[2]);
              const actualPrice = allPrices[itemName];
              if (actualPrice && actualPrice !== statedPrice) {
                warnings.push(`${itemName}：AI写了${statedPrice}元，实际${actualPrice}元`);
              }
            }
          });
        }
      });
    }

    return {
      valid: warnings.length === 0,
      warnings,
    };
  },
};

module.exports = pricingEngine;
