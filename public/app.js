const API_BASE = '';

const SUB_TYPES = {
  restaurant: ['火锅', '中餐', '烧烤', '奶茶', '咖啡', '甜品', '日料', '西餐'],
  beauty: ['美甲', '美睫', '美容', '美发', '皮肤管理', '半永久', '身体护理'],
  education: ['K12辅导', '艺术培训', '体育培训', '语言培训', '职业培训', '早教'],
  entertainment: ['密室逃脱', '剧本杀', 'KTV', '电玩城', '桌游', '轰趴馆', '电竞馆'],
  fitness: ['健身房', '瑜伽馆', '普拉提', '搏击馆', '舞蹈室', '游泳馆'],
  retail: ['服装店', '饰品店', '家居店', '美妆店', '母婴店', '文创店'],
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

let currentResults = {};
let currentMenuData = null;
let manualMenuItems = [];

// ============================================================
// 初始化
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  initIndustryGrid();
  initGenerateButton();
  initCopyButtons();
  initRegenerateButtons();
  initDownloadButtons();
  initShopSelector();
  initShopSearch();
  initShopNameSync();
  initMenuImport();
  initEditableFields();
  initResultTabs();
  checkApiStatus();
  loadShopList();
  updateSubTypes('restaurant');
});

// ============================================================
// API 状态
// ============================================================

async function checkApiStatus() {
  try {
    const res = await fetch(`${API_BASE}/api/status`);
    const data = await res.json();
    const statusEl = $('#apiStatus');
    const toggle = $('#demoMode');

    if (!data.apiConfigured) {
      statusEl.classList.add('error');
      statusEl.querySelector('.status-text').textContent = 'API 未配置';
      toggle.checked = true;
      toggle.dataset.locked = 'true';
    } else {
      statusEl.classList.add('connected');
      statusEl.querySelector('.status-text').textContent = data.model || '已连接';
      toggle.checked = false;
      toggle.dataset.locked = 'false';
    }

    toggle.addEventListener('change', () => {
      if (toggle.dataset.locked === 'true') toggle.checked = true;
    });
  } catch {
    const statusEl = $('#apiStatus');
    statusEl.classList.add('error');
    statusEl.querySelector('.status-text').textContent = '连接失败';
  }
}

// ============================================================
// 行业切换
// ============================================================

function initIndustryGrid() {
  $$('#industryGrid .industry-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('#industryGrid .industry-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const industry = btn.dataset.value;
      $('#industry').value = industry;
      updateSubTypes(industry);
    });
  });
}

function updateSubTypes(industry) {
  const select = $('#subType');
  const types = SUB_TYPES[industry] || [];
  select.innerHTML = types.map(t => `<option value="${t}">${t}</option>`).join('');
}

// ============================================================
// 商家管理
// ============================================================

function initShopSelector() {
  const select = $('#shopSelect');
  const btnDelete = $('#btnDeleteShop');

  select.addEventListener('change', () => {
    const val = select.value;
    btnDelete.style.display = val ? 'flex' : 'none';
    if (val) {
      loadShop(val);
    } else {
      resetForm();
    }
  });

  btnDelete.addEventListener('click', () => deleteShop(select.value));
}

async function loadShopList() {
  try {
    const res = await fetch(`${API_BASE}/api/shops`);
    const data = await res.json();
    const select = $('#shopSelect');
    const current = select.value;
    select.innerHTML = '<option value="">+ 新建商家</option>';
    (data.shops || []).forEach(shop => {
      const opt = document.createElement('option');
      opt.value = shop.name;
      opt.textContent = shop.name;
      select.appendChild(opt);
    });
    if (current) select.value = current;
  } catch {}
}

async function loadShop(name) {
  if (!name) return;
  try {
    const res = await fetch(`${API_BASE}/api/shops/${encodeURIComponent(name)}`);
    const data = await res.json();
    const p = data.profile;

    if (p.industry) {
      $('#industry').value = p.industry;
      $$('#industryGrid .industry-btn').forEach(b => b.classList.toggle('active', b.dataset.value === p.industry));
      updateSubTypes(p.industry);
    }
    if (p.subType) $('#subType').value = p.subType;
    if (p.shopName) {
      $('#shopName').value = p.shopName;
      $('#shopSearch').value = p.shopName;
    }
    if (p.address) $('#address').value = p.address;
    if (p.avgPrice) $('#avgPrice').value = p.avgPrice;
    if (p.phone) $('#phone').value = p.phone;
    if (p.sellingPoints) $('#sellingPoints').value = p.sellingPoints;
    if (p.specials) $('#specials').value = p.specials;

    if (data.menuData) {
      currentMenuData = data.menuData;
      loadMenuIntoManual(data.menuData);
    }

    if (p.generationHistory && p.generationHistory.length > 0) {
      const last = p.generationHistory[0];
      currentResults = last.results;
      renderResults(last.results);
    }
  } catch (e) {
    alert('加载失败: ' + e.message);
  }
}

async function deleteShop(name) {
  if (!name) return;
  if (!confirm(`确定删除「${name}」的所有数据？`)) return;
  try {
    await fetch(`${API_BASE}/api/shops/${encodeURIComponent(name)}`, { method: 'DELETE' });
    loadShopList();
    resetForm();
  } catch (e) {
    alert('删除失败: ' + e.message);
  }
}

function resetForm() {
  $('#shopName').value = '';
  $('#shopSearch').value = '';
  $('#address').value = '';
  $('#avgPrice').value = '';
  $('#phone').value = '';
  $('#sellingPoints').value = '';
  $('#specials').value = '';
  currentMenuData = null;
  manualMenuItems = [];
  renderMenuList();
  showEmpty();
}

// ============================================================
// 地图搜索
// ============================================================

let searchTimer = null;

function initShopSearch() {
  const input = $('#shopSearch');
  const dropdown = $('#searchDropdown');
  const loading = $('#searchLoading');
  const wrapper = $('#searchWrapper');

  if (!input) return;

  input.addEventListener('input', () => {
    clearTimeout(searchTimer);
    const keyword = input.value.trim();
    if (keyword.length < 2) {
      dropdown.style.display = 'none';
      return;
    }
    loading.style.display = 'block';
    searchTimer = setTimeout(() => doMapSearch(keyword), 300);
  });

  input.addEventListener('focus', () => {
    wrapper.classList.add('focused');
    const keyword = input.value.trim();
    // 有上次搜索结果时，直接显示下拉框
    if (dropdown.children.length > 0 && dropdown._tips && dropdown._tips.length > 0) {
      dropdown.style.display = 'block';
    } else if (keyword.length >= 2) {
      dropdown.style.display = 'block';
    }
  });

  // 点击外部关闭下拉
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-section')) {
      dropdown.style.display = 'none';
      wrapper.classList.remove('focused');
    }
  });
}

async function doMapSearch(keyword) {
  const dropdown = $('#searchDropdown');
  const loading = $('#searchLoading');

  try {
    const res = await fetch(`${API_BASE}/api/map/search?keywords=${encodeURIComponent(keyword)}`);
    const data = await res.json();
    loading.style.display = 'none';

    if (data.error && (!data.tips || data.tips.length === 0)) {
      // 无 API key 时，展示手动输入提示
      dropdown.innerHTML = `<div class="search-item"><div class="search-item-info"><div class="search-item-name" style="color:var(--text-secondary);font-weight:400">${data.error}</div></div></div>`;
      dropdown.style.display = 'block';
      return;
    }

    if (!data.tips || data.tips.length === 0) {
      dropdown.innerHTML = `<div class="search-item"><div class="search-item-info"><div class="search-item-name" style="color:var(--text-secondary);font-weight:400">未找到相关店铺</div></div></div>`;
      dropdown.style.display = 'block';
      return;
    }

    dropdown.innerHTML = data.tips.map((tip, i) => {
      const icon = getCategoryIcon(tip.type);
      const tel = tip.tel ? `<span class="search-item-type">${tip.tel}</span>` : '';
      const selected = dropdown._selectedName === tip.name ? ' selected' : '';
      return `<div class="search-item${selected}" data-index="${i}">
        <span class="search-item-icon">${icon}</span>
        <div class="search-item-info">
          <div class="search-item-name">${escapeHtml(tip.name)}</div>
          <div class="search-item-addr">${escapeHtml(tip.address || tip.city + tip.district)}</div>
          ${tel}
        </div>
      </div>`;
    }).join('');

    // 存储数据
    dropdown._tips = data.tips;

    // 绑定点击
    dropdown.querySelectorAll('.search-item').forEach(item => {
      item.addEventListener('click', () => {
        const idx = parseInt(item.dataset.index);
        const tip = dropdown._tips[idx];
        dropdown._selectedName = tip.name;
        selectMapResult(tip);
        dropdown.style.display = 'none';
      });
    });

    dropdown.style.display = 'block';
  } catch (e) {
    loading.style.display = 'none';
    dropdown.innerHTML = `<div class="search-item"><div class="search-item-info"><div class="search-item-name" style="color:var(--danger)">搜索出错</div></div></div>`;
    dropdown.style.display = 'block';
  }
}

function selectMapResult(tip) {
  $('#shopName').value = tip.name || '';
  $('#address').value = tip.address || (tip.city + tip.district) || '';
  if (tip.tel) $('#phone').value = tip.tel;

  // 智能匹配行业
  const matchedIndustry = matchIndustry(tip.type);
  if (matchedIndustry) {
    $('#industry').value = matchedIndustry;
    $$('#industryGrid .industry-btn').forEach(b => b.classList.toggle('active', b.dataset.value === matchedIndustry));
    updateSubTypes(matchedIndustry);
  }

  // 搜索框显示选中的店铺名称，保持两个字段一致
  $('#shopSearch').value = tip.name || '';
}

function matchIndustry(typeCode) {
  if (!typeCode) return null;
  const code = String(typeCode);
  // 高德 typecode 前缀: 05=餐饮, 06=购物, 07=生活, 08=体育, 09=医疗, 11=住宿, 15=教育
  if (code.startsWith('05')) return 'restaurant';
  if (code.startsWith('06')) return 'retail';
  if (code.startsWith('07')) return 'beauty';
  if (code.startsWith('08')) return 'fitness';
  if (code.startsWith('15')) return 'education';
  if (code.startsWith('16') || code.startsWith('03')) return 'entertainment';
  return null;
}

function getCategoryIcon(typeCode) {
  if (!typeCode) return '📍';
  const code = String(typeCode);
  if (code.startsWith('05')) return '🍜';
  if (code.startsWith('06')) return '🛍';
  if (code.startsWith('07')) return '💅';
  if (code.startsWith('08')) return '💪';
  if (code.startsWith('15')) return '📚';
  if (code.startsWith('16') || code.startsWith('03')) return '🎮';
  return '📍';
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function initShopNameSync() {
  const shopNameInput = $('#shopName');
  const searchInput = $('#shopSearch');
  if (!shopNameInput || !searchInput) return;

  shopNameInput.addEventListener('input', () => {
    searchInput.value = shopNameInput.value;
  });
}

// ============================================================
// 菜单管理
// ============================================================

function initMenuImport() {
  $('#btnAddItem').addEventListener('click', addManualItem);
  $('#newItemName').addEventListener('keydown', (e) => { if (e.key === 'Enter') addManualItem(); });
  $('#newItemPrice').addEventListener('keydown', (e) => { if (e.key === 'Enter') addManualItem(); });
  $('#btnClearMenu').addEventListener('click', clearMenu);

  const dropzone = $('#dropzone');
  const fileInput = $('#fileInput');
  if (dropzone && fileInput) {
    dropzone.addEventListener('click', () => fileInput.click());
    dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('drag-over'); });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-over'));
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('drag-over');
      if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
    });
    fileInput.addEventListener('change', () => {
      if (fileInput.files[0]) handleFile(fileInput.files[0]);
      fileInput.value = '';
    });
  }
}

function addManualItem() {
  const catInput = $('#newItemCategory');
  const nameInput = $('#newItemName');
  const priceInput = $('#newItemPrice');

  const category = catInput.value.trim() || '其他';
  const name = nameInput.value.trim();
  const price = parseFloat(priceInput.value);

  if (!name) { nameInput.focus(); return; }
  if (isNaN(price) || price <= 0) { priceInput.focus(); return; }

  manualMenuItems.push({ category, name, price });
  nameInput.value = '';
  priceInput.value = '';
  nameInput.focus();

  renderMenuList();
  saveMenuToServer();
}

function removeManualItem(index) {
  manualMenuItems.splice(index, 1);
  renderMenuList();
  saveMenuToServer();
}

function renderMenuList() {
  const list = $('#menuList');
  const footer = $('#menuFooter');
  const badge = $('#menuCountBadge');

  if (manualMenuItems.length === 0) {
    list.innerHTML = '';
    footer.style.display = 'none';
    badge.style.display = 'none';
    currentMenuData = null;
    return;
  }

  badge.style.display = 'inline-flex';
  badge.textContent = manualMenuItems.length;
  footer.style.display = 'flex';

  const groups = {};
  manualMenuItems.forEach((item, idx) => {
    if (!groups[item.category]) groups[item.category] = [];
    groups[item.category].push({ ...item, idx });
  });

  let html = '';
  for (const [cat, items] of Object.entries(groups)) {
    html += `<div class="menu-group"><div class="menu-group-title">${cat}</div>`;
    items.forEach(item => {
      html += `<div class="menu-item-row">
        <span class="menu-item-name">${item.name}</span>
        <span class="menu-item-price">¥${item.price}</span>
        <button class="btn-remove" onclick="removeManualItem(${item.idx})">×</button>
      </div>`;
    });
    html += '</div>';
  }
  list.innerHTML = html;

  const total = manualMenuItems.reduce((s, i) => s + i.price, 0);
  const avg = Math.round(total / manualMenuItems.length);
  $('#menuAvgPrice').textContent = avg;

  buildMenuDataFromManual();
}

function buildMenuDataFromManual() {
  const categories = {};
  manualMenuItems.forEach(item => {
    if (!categories[item.category]) categories[item.category] = [];
    categories[item.category].push({
      name: item.name,
      price: item.price,
      originalPrice: null,
      description: '',
      tags: [],
    });
  });

  const cats = Object.entries(categories).map(([name, items]) => ({
    name,
    items: items.map((item, i) => ({ id: `item_${i}`, ...item })),
  }));

  const total = manualMenuItems.length;
  const prices = manualMenuItems.map(i => i.price);
  const avg = Math.round(prices.reduce((s, p) => s + p, 0) / total);

  currentMenuData = {
    categories: cats,
    summary: {
      totalItems: total,
      avgPrice: avg,
      priceRange: { min: Math.min(...prices), max: Math.max(...prices) },
      topItems: manualMenuItems.slice(0, 5).map(i => i.name),
    },
  };

  if (!$('#avgPrice').value) {
    $('#avgPrice').value = avg;
  }
}

async function saveMenuToServer() {
  const shopName = $('#shopName').value.trim();
  if (!shopName || !currentMenuData) return;

  try {
    await fetch(`${API_BASE}/api/menu/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        shopName,
        fileName: 'manual.json',
        content: JSON.stringify(currentMenuData),
      }),
    });
    saveCurrentProfile();
  } catch {}
}

async function handleFile(file) {
  const shopName = $('#shopName').value.trim();
  if (!shopName) { alert('请先填写店铺名称'); return; }

  try {
    const content = await file.text();
    const res = await fetch(`${API_BASE}/api/menu/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shopName, fileName: file.name, content }),
    });

    if (!res.ok) { const err = await res.json(); throw new Error(err.error); }

    const data = await res.json();

    if (data.menuData?.categories) {
      data.menuData.categories.forEach(cat => {
        cat.items.forEach(item => {
          manualMenuItems.push({ category: cat.name, name: item.name, price: item.price });
        });
      });
      renderMenuList();
    }

    if (!$('#avgPrice').value && data.autoAvgPrice) {
      $('#avgPrice').value = data.autoAvgPrice;
    }
  } catch (e) {
    alert('导入失败: ' + e.message);
  }
}

function clearMenu() {
  manualMenuItems = [];
  currentMenuData = null;
  renderMenuList();
  const shopName = $('#shopName').value.trim();
  if (shopName) {
    try { fetch(`${API_BASE}/api/menu/${encodeURIComponent(shopName)}`, { method: 'DELETE' }); } catch {}
  }
}

function loadMenuIntoManual(menuData) {
  if (!menuData?.categories) return;
  manualMenuItems = [];
  menuData.categories.forEach(cat => {
    cat.items.forEach(item => {
      manualMenuItems.push({ category: cat.name, name: item.name, price: item.price });
    });
  });
  renderMenuList();
}

async function saveCurrentProfile() {
  const shopInfo = collectShopInfo();
  try {
    await fetch(`${API_BASE}/api/shops`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(shopInfo),
    });
    loadShopList();
  } catch {}
}

// ============================================================
// 生成
// ============================================================

function initGenerateButton() {
  $('#btnGenerate').addEventListener('click', handleGenerate);
}

function collectShopInfo() {
  return {
    name: $('#shopName').value.trim(),
    industry: $('#industry').value,
    subType: $('#subType').value,
    address: $('#address').value.trim(),
    avgPrice: $('#avgPrice').value.trim(),
    sellingPoints: $('#sellingPoints').value.trim(),
    specials: $('#specials').value.trim(),
    phone: $('#phone').value.trim(),
  };
}

async function handleGenerate() {
  const shopInfo = collectShopInfo();
  if (!shopInfo.name) { alert('请输入店铺名称'); $('#shopName').focus(); return; }

  const selectedTypes = [...$$('input[name="type"]:checked')].map(cb => cb.value);
  if (selectedTypes.length === 0) { alert('请至少选择一项内容类型'); return; }

  const demo = $('#demoMode').checked;
  setLoading(true, shopInfo.name);

  try {
    const res = await fetch(`${API_BASE}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shopInfo, types: selectedTypes, demo }),
    });

    if (!res.ok) { const err = await res.json(); throw new Error(err.error); }

    const data = await res.json();
    currentResults = data.results;
    renderResults(data.results);
    saveCurrentProfile();
  } catch (e) {
    alert('生成失败: ' + e.message);
    showEmpty();
  } finally {
    setLoading(false);
  }
}

async function handleRegenerate(type) {
  const shopInfo = collectShopInfo();
  if (!shopInfo.name) { alert('请先填写店铺名称'); return; }

  const demo = $('#demoMode').checked;
  const panel = $(`#panel${capitalize(type)}`);
  panel.style.opacity = '0.5';
  panel.style.pointerEvents = 'none';

  try {
    const res = await fetch(`${API_BASE}/api/generate/${type}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shopInfo, demo }),
    });

    if (!res.ok) { const err = await res.json(); throw new Error(err.error); }

    const data = await res.json();
    currentResults[type] = data.result;
    renderSingleResult(type, data.result);
  } catch (e) {
    alert('重新生成失败: ' + e.message);
  } finally {
    panel.style.opacity = '';
    panel.style.pointerEvents = '';
  }
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function initRegenerateButtons() {
  $$('.btn-regenerate').forEach(btn => {
    btn.addEventListener('click', () => handleRegenerate(btn.dataset.type));
  });
}

// ============================================================
// 结果标签页
// ============================================================

function initResultTabs() {
  $$('.result-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      $$('.result-tab').forEach(t => t.classList.remove('active'));
      $$('.result-panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      const panelId = 'panel' + capitalize(tab.dataset.type);
      const panel = document.getElementById(panelId);
      if (panel) panel.classList.add('active');
    });
  });
}

// ============================================================
// UI 状态
// ============================================================

function setLoading(loading, shopName) {
  const btn = $('#btnGenerate');
  if (loading) {
    btn.disabled = true;
    btn.querySelector('.btn-text').style.display = 'none';
    btn.querySelector('.btn-loading').style.display = 'flex';
    $('#emptyState').style.display = 'none';
    $('#resultsContainer').style.display = 'none';
    $('#loadingState').style.display = 'flex';
    $('#loadingShopName').textContent = shopName;
  } else {
    btn.disabled = false;
    btn.querySelector('.btn-text').style.display = 'flex';
    btn.querySelector('.btn-loading').style.display = 'none';
    $('#loadingState').style.display = 'none';
  }
}

function showEmpty() {
  $('#emptyState').style.display = 'flex';
  $('#loadingState').style.display = 'none';
  $('#resultsContainer').style.display = 'none';
}

// ============================================================
// 渲染结果
// ============================================================

function renderResults(results) {
  $('#emptyState').style.display = 'none';
  $('#loadingState').style.display = 'none';
  $('#resultsContainer').style.display = 'flex';

  if (results.xiaohongshu) renderXiaohongshu(results.xiaohongshu);
  if (results.douyin) renderDouyin(results.douyin);
  if (results.poster) renderPoster(results.poster);
  if (results.tuangou) renderTuangou(results.tuangou);

  // 激活第一个有内容的标签
  const firstTab = $$('.result-tab').find(t => results[t.dataset.type]);
  if (firstTab) {
    $$('.result-tab').forEach(t => t.classList.remove('active'));
    $$('.result-panel').forEach(p => p.classList.remove('active'));
    firstTab.classList.add('active');
    const panelId = 'panel' + capitalize(firstTab.dataset.type);
    document.getElementById(panelId)?.classList.add('active');
  }
}

function renderSingleResult(type, data) {
  switch (type) {
    case 'xiaohongshu': renderXiaohongshu(data); break;
    case 'douyin': renderDouyin(data); break;
    case 'poster': renderPoster(data); break;
    case 'tuangou': renderTuangou(data); break;
  }
}

function renderXiaohongshu(data) {
  setEditableValue('xhsTitle', data.title || '');
  setEditableValue('xhsContent', data.content || '');
  $('#xhsTags').innerHTML = (data.tags || []).map(t => `<span class="tag">#${t}</span>`).join('');
  $('#xhsCoverTexts').innerHTML = (data.cover_texts || []).map(t => `<div class="cover-item">${t}</div>`).join('');
}

function renderDouyin(data) {
  setEditableValue('dyTitle', data.title || '');
  setEditableValue('dyHook', data.hook || '');
  setEditableValue('dyCta', data.cta || '');
  setEditableValue('dyMusic', data.music || '');

  $('#dyScenes').innerHTML = (data.scenes || []).map((s) => `
    <div class="scene-item">
      <div class="scene-meta"><span class="scene-duration">${s.duration || ''}</span><span class="scene-shot">${s.shot || ''}</span></div>
      <div class="scene-visual">${s.visual || ''}</div>
      <div class="scene-text">${s.text || ''}</div>
      <div class="scene-voiceover">旁白：${s.voiceover || ''}</div>
    </div>
  `).join('');
}

function renderPoster(data) {
  setEditableValue('posterMainTitle', data.main_title || '');
  setEditableValue('posterSubtitle', data.subtitle || '');
  setEditableValue('posterPromo', data.promo || '');
  $('#posterDetails').innerHTML = (data.details || []).map(d => `<div class="detail-item">${d}</div>`).join('');
}

function renderTuangou(data) {
  $('#tgPackages').innerHTML = (data.packages || []).map(pkg => `
    <div class="package-card">
      <div class="package-header">
        <span class="package-name">${pkg.name}</span>
        <div class="package-price"><span class="price-original">¥${pkg.original_price}</span><span class="price-current">¥${pkg.suggested_price}</span></div>
      </div>
      <div class="package-body">
        <div class="package-items">${(pkg.items || []).map(item => `<div class="package-item">${item}</div>`).join('')}</div>
        <div class="package-highlights">${(pkg.highlights || []).map(h => `<span class="highlight-tag">${h}</span>`).join('')}</div>
      </div>
    </div>
  `).join('');

  const tipsField = $('#tgTipsField');
  if (data.promotion_tips) {
    tipsField.style.display = 'block';
    setEditableValue('tgTips', data.promotion_tips);
  } else {
    tipsField.style.display = 'none';
  }
}

// ============================================================
// 可编辑字段
// ============================================================

function initEditableFields() {
  document.addEventListener('click', (e) => {
    const display = e.target.closest('.editable-display');
    if (!display) return;

    const field = display.closest('.editable-field');
    if (!field) return;

    const input = field.querySelector('.editable-input, .editable-textarea');
    if (!input) return;

    display.style.display = 'none';
    input.style.display = 'block';
    input.value = display.textContent;
    input.focus();

    const hint = field.querySelector('.edit-hint');
    if (hint) hint.style.display = 'none';
  });

  document.addEventListener('blur', (e) => {
    const input = e.target.closest('.editable-input, .editable-textarea');
    if (!input) return;

    const field = input.closest('.editable-field');
    if (!field) return;

    const display = field.querySelector('.editable-display');
    const hint = field.querySelector('.edit-hint');

    display.textContent = input.value;
    display.style.display = '';
    input.style.display = 'none';
    if (hint) hint.style.display = '';

    const key = field.dataset.key;
    if (key) updateResultValue(key, input.value);
  }, true);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const input = e.target.closest('.editable-input, .editable-textarea');
      if (input) input.blur();
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      const input = e.target.closest('.editable-input');
      if (input) input.blur();
    }
  });
}

function setEditableValue(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function updateResultValue(key, value) {
  for (const [type, data] of Object.entries(currentResults)) {
    if (data && key in data) {
      data[key] = value;
      break;
    }
  }
}

// ============================================================
// 复制
// ============================================================

function initCopyButtons() {
  $$('.btn-copy').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.target;
      const text = formatForCopy(type);
      navigator.clipboard.writeText(text).then(() => {
        btn.textContent = '✅ 已复制';
        btn.classList.add('copied');
        setTimeout(() => {
          btn.textContent = '📋 复制';
          btn.classList.remove('copied');
        }, 2000);
      }).catch(() => {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        btn.textContent = '✅ 已复制';
        btn.classList.add('copied');
        setTimeout(() => {
          btn.textContent = '📋 复制';
          btn.classList.remove('copied');
        }, 2000);
      });
    });
  });
}

function formatForCopy(type) {
  const data = currentResults[type];
  if (!data) return '';

  switch (type) {
    case 'xiaohongshu':
      return [data.title, '', data.content, '', (data.tags || []).map(t => '#' + t).join(' ')].join('\n');
    case 'douyin':
      return [
        `标题：${data.title}`, `钩子：${data.hook}`, '',
        '分镜脚本：',
        ...(data.scenes || []).map((s, i) => `镜头${i+1} [${s.duration}] ${s.visual}\n  文字：${s.text}\n  旁白：${s.voiceover}`),
        '', `行动号召：${data.cta}`, `配乐：${data.music}`,
      ].join('\n');
    case 'poster':
      return [data.main_title, data.subtitle, '', data.promo, '', ...(data.details || [])].join('\n');
    case 'tuangou':
      return [
        ...(data.packages || []).map(pkg => [
          pkg.name, `原价：¥${pkg.original_price} → 团购价：¥${pkg.suggested_price}`,
          '包含：', ...(pkg.items || []).map(item => `  ${item}`),
          `卖点：${(pkg.highlights || []).join('、')}`, '',
        ].join('\n')),
        data.promotion_tips ? `推广建议：${data.promotion_tips}` : '',
      ].join('\n');
    default:
      return JSON.stringify(data, null, 2);
  }
}

// ============================================================
// 下载
// ============================================================

function initDownloadButtons() {
  $$('.btn-download').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.target;
      const data = currentResults[type];
      if (!data) { alert('没有可下载的内容'); return; }

      const text = formatForCopy(type);
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;

      const names = {
        xiaohongshu: '小红书',
        douyin: '抖音',
        poster: '海报',
        tuangou: '团购',
      };
      const shopName = $('#shopName').value.trim() || '商家';
      a.download = `${shopName}_${names[type] || type}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  });
}
