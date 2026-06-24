const fs = require('fs');
const path = require('path');
const fileManager = require('../utils/file-manager');

const SHOPS_DIR = path.join(process.cwd(), 'data', 'shops');

const shopManager = {
  ensureShopsDir() {
    fileManager.ensureDir(SHOPS_DIR);
  },

  getShopDir(shopName) {
    const safeName = shopName.replace(/[^a-zA-Z0-9一-龥]/g, '_');
    return path.join(SHOPS_DIR, safeName);
  },

  saveProfile(shopInfo) {
    this.ensureShopsDir();
    const shopDir = this.getShopDir(shopInfo.name);
    fileManager.ensureDir(shopDir);

    const profilePath = path.join(shopDir, 'profile.json');
    let profile = {};

    if (fs.existsSync(profilePath)) {
      profile = JSON.parse(fs.readFileSync(profilePath, 'utf-8'));
    }

    profile = {
      ...profile,
      ...shopInfo,
      shopName: shopInfo.name || profile.shopName,
      updatedAt: new Date().toISOString(),
      createdAt: profile.createdAt || new Date().toISOString(),
    };

    fs.writeFileSync(profilePath, JSON.stringify(profile, null, 2), 'utf-8');
    return profile;
  },

  loadProfile(shopName) {
    const profilePath = path.join(this.getShopDir(shopName), 'profile.json');
    if (!fs.existsSync(profilePath)) return null;
    return JSON.parse(fs.readFileSync(profilePath, 'utf-8'));
  },

  listShops() {
    this.ensureShopsDir();
    const dirs = fs.readdirSync(SHOPS_DIR);
    return dirs.map(dir => {
      const profilePath = path.join(SHOPS_DIR, dir, 'profile.json');
      if (fs.existsSync(profilePath)) {
        const profile = JSON.parse(fs.readFileSync(profilePath, 'utf-8'));
        return {
          name: profile.shopName || dir,
          industry: profile.industry,
          subType: profile.subType,
          lastUpdated: profile.updatedAt,
          menuImported: profile.menuImported || false,
        };
      }
      return null;
    }).filter(Boolean);
  },

  saveGeneration(shopName, results, types) {
    const profile = this.loadProfile(shopName);
    if (!profile) return null;

    if (!profile.generationHistory) {
      profile.generationHistory = [];
    }

    profile.generationHistory.unshift({
      id: `gen_${Date.now()}`,
      timestamp: new Date().toISOString(),
      types,
      results,
    });

    if (profile.generationHistory.length > 10) {
      profile.generationHistory = profile.generationHistory.slice(0, 10);
    }

    this.saveProfile(profile);
    return profile;
  },

  deleteShop(shopName) {
    const shopDir = this.getShopDir(shopName);
    if (fs.existsSync(shopDir)) {
      fs.rmSync(shopDir, { recursive: true, force: true });
    }
  },
};

module.exports = shopManager;
