const fs = require('fs');
const path = require('path');

const fileManager = {
  ensureDir(dir) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  },

  getOutputDir(shopName, type) {
    const date = new Date().toISOString().slice(0, 10);
    const safeName = shopName.replace(/[^a-zA-Z0-9一-龥]/g, '_');
    const dir = path.join(process.cwd(), 'output', safeName, date, type);
    this.ensureDir(dir);
    return dir;
  },

  saveText(dir, filename, content) {
    const filePath = path.join(dir, filename);
    fs.writeFileSync(filePath, content, 'utf-8');
    return filePath;
  },

  saveBuffer(dir, filename, buffer) {
    const filePath = path.join(dir, filename);
    fs.writeFileSync(filePath, buffer);
    return filePath;
  },

  saveJson(dir, filename, data) {
    const filePath = path.join(dir, filename);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    return filePath;
  },

  loadJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  },

  listTemplates() {
    const dir = path.join(process.cwd(), 'config', 'templates');
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir).filter(f => f.endsWith('.json')).map(f => ({
      name: f.replace('.json', ''),
      path: path.join(dir, f),
    }));
  },
};

module.exports = fileManager;
