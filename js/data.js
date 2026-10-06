/**
 * data.js - 数据层（毛玻璃导航）
 * 统一 API：云端模式（Cloudflare KV）和本地模式（localStorage）
 */

const API_BASE = '/api';

// ==================== 云端模式 ====================
let _isCloud = false;
/** 当前登录用户的 session 数据 */
let _cloudSession = { username: '', data: null, isAdmin: false };

async function apiCall(method, body) {
  try {
    const res = await fetch(`${API_BASE}/@me`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body || {}),
    });
    return await res.json();
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/** 检测是否为云端模式 */
async function checkCloudMode() {
  try {
    const res = await fetch(`${API_BASE}/ping`);
    if (res.ok) {
      const r = await res.json();
      _isCloud = !!(r && r.ok && r.kv);
    } else {
      _isCloud = false;
    }
  } catch {
    _isCloud = false;
  }
  // 如果是云模式，尝试恢复 session
  if (_isCloud) {
    return _isCloud;
}

// ==================== 本地模式（localStorage）====================
function getUsers() {
  try { return JSON.parse(localStorage.getItem('nav_users') || '[]'); } catch { return []; }
}
function saveUsers(users) {
  localStorage.setItem('nav_users', JSON.stringify(users));
}
function getCurrentUser() {
  return localStorage.getItem('nav_current_user') || '';
}
function setCurrentUser(username) {
  if (username) localStorage.setItem('nav_current_user', username);
  else localStorage.removeItem('nav_current_user');
}
function getUserPassword(username) {
  try {
    const data = JSON.parse(localStorage.getItem(`nav_pass_${username}`) || '""');
    return data;
  } catch { return ''; }
}
function setUserPassword(username, pwd) {
  localStorage.setItem(`nav_pass_${username}`, JSON.stringify(pwd));
}
function createUser(username, password) {
  const users = getUsers();
  if (!users.includes(username)) {
    users.push(username);
    saveUsers(users);
  }
  setUserPassword(username, password);
  saveNavDataForUser(username, null);
}
function deleteUser(username) {
  let users = getUsers();
  users = users.filter(u => u !== username);
  saveUsers(users);
  localStorage.removeItem(`nav_data_${username}`);
  localStorage.removeItem(`nav_pass_${username}`);
  localStorage.removeItem(`nav_bg_${username}`);
}
function getNavDataForUser(username) {
  try {
    return JSON.parse(localStorage.getItem(`nav_data_${username}`) || 'null') || getDefaultNavData();
  } catch { return getDefaultNavData(); }
}
function saveNavDataForUser(username, data) {
  if (data) localStorage.setItem(`nav_data_${username}`, JSON.stringify(data));
  else localStorage.removeItem(`nav_data_${username}`);
}
function flushNavData(data) {
  const user = getCurrentUser();
  if (user) saveNavDataForUser(user, data);
}

function getDefaultNavData() {
  return {
    title: '毛玻璃导航',
    subtitle: '优雅 · 简洁 · 实用',
    categories: [],
    quickTags: [],
    announcement: '',
    notes: '',
    background: { type: 'gradient', value: 'linear-gradient(135deg, #0f0c29, #302b63, #24243e)' }
  };
}

// ==================== 云 API 函数 ====================
async function cloudLogin(username, password) {
  const result = await apiCall('POST', { username, password });
  if (result.ok) {
    _cloudSession = { username, data: result.data, isAdmin: !!result.isAdmin, _pass: password };
    localStorage.setItem('_cloudSession', JSON.stringify(_cloudSession));
  }
  return result;
}

function cloudGetData() {
  return _cloudSession.data ? { ok: true, data: _cloudSession.data } : { ok: false };
}

async function cloudSaveData(data) {
  if (!_cloudSession.username) return { ok: false, error: '未登录' };
  return await apiCall('PUT', { data });
}

async function cloudDeleteUser() { return await apiCall('DELETE', {}); }

async function cloudLogout() {
  try { await fetch(API_BASE + '/logout', { method: 'POST', credentials: 'include' }); } catch {}
  _cloudSession = { username: '', data: null, isAdmin: false };
}

// ==================== 公共导航（云）====================
function getPublicCache() {
  try { return JSON.parse(localStorage.getItem('_pubCache') || 'null'); } catch { return null; }
}
function setPublicCache(data) {
  localStorage.setItem('_pubCache', JSON.stringify({ ts: Date.now(), data }));
}
async function getPublicDataCloud() {
  // 优先用本地缓存，秒开
  const cached = getPublicCache();
  if (cached && Date.now() - cached.ts < 300000) { // 5 分钟内有效
    // 后台静默刷新（不阻塞渲染）
    setTimeout(refreshPublicCache, 200);
    return cached.data;
  }
  // 缓存过期或没有 → 同步拉取
  const data = await refreshPublicCache();
  return data;
}
async function refreshPublicCache() {
  try {
    const res = await fetch(`${API_BASE}/public`);
    if (res.ok) {
      const r = await res.json();
      if (r.ok && r.data) {
        setPublicCache(r.data);
        return r.data;
      }
    }
  } catch {}
  // 降级用旧缓存
  const old = getPublicCache();
  return old ? old.data : null;
}

async function savePublicDataCloud(password, data) {
  try {
    const res = await fetch(`${API_BASE}/public`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password, data }),
    });
    if (res.ok) {
      const result = await res.json();
      if (result && result.ok) {
        // 管理员保存成功后立即更新本地缓存，用户下次打开秒看新内容
        setPublicCache(data);
        return { ok: true };
      }
      return { ok: false, error: result.error || '保存失败' };
    }
    return { ok: false, error: 'HTTP ' + res.status };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ==================== 管理员 API ====================
async function adminLogin(password) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(`${API_BASE}/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    return await res.json();
  } catch (e) {
    return { ok: false, error: e.name === 'AbortError' ? '请求超时，请检查网络或 Worker 状态' : e.message };
  }
}

async function adminGetUsers(password) {
  try {
    const res = await fetch(`${API_BASE}/admin/users?password=${encodeURIComponent(password)}`);
    return await res.json();
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function adminGetUserData(username, password) {
  try {
    const res = await fetch(`${API_BASE}/admin/user/${encodeURIComponent(username)}?password=${encodeURIComponent(password)}`);
    return await res.json();
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function adminUpdateUserData(username, password, data) {
  try {
    const res = await fetch(`${API_BASE}/admin/user/${encodeURIComponent(username)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password, data }),
    });
    return await res.json();
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function adminDeleteUser(username, password) {
  try {
    const res = await fetch(`${API_BASE}/admin/user/${encodeURIComponent(username)}?password=${encodeURIComponent(password)}`, {
      method: 'DELETE',
    });
    return await res.json();
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ==================== 公共数据（本地）====================
function getPublicDataLocal() {
  try {
    return JSON.parse(localStorage.getItem('nav_public_data') || 'null') || getDefaultNavData();
  } catch { return getDefaultNavData(); }
}
function savePublicDataLocal(data) {
  localStorage.setItem('nav_public_data', JSON.stringify(data));
}
function getAdminPassLocal() {
  return localStorage.getItem('nav_admin_pass') || 'admin';
}
function setAdminPassLocal(pwd) {
  localStorage.setItem('nav_admin_pass', pwd);
}

// ==================== 模式检测 ====================
async function initDataMode() {
  _isCloud = await checkCloudMode();
}
function isCloudMode() { return _isCloud; }

// ==================== 用户登录 / 注册（统一入口）====================
async function loginUser(username, password, mode) {
  if (_isCloud) {
    const r = await cloudLogin(username, password);
    // 注册模式下，如果用户已存在则禁止注册
    if (mode === 'register') {
      if (r.ok && !r.isNew) return { ok: false, error: '用户名已存在' };
      if (!r.ok && r.error === '密码错误') return { ok: false, error: '用户名已存在' };
    }
    return r;
  } else {
    const users = getUsers();
    if (users.includes(username)) {
      // 注册时发现用户已存在
      if (mode === 'register') return { ok: false, error: '用户名已存在' };
      // 登录模式
      if (password !== getUserPassword(username)) {
        return { ok: false, error: '密码错误' };
      }
      setCurrentUser(username);
      return { ok: true, data: getNavDataForUser(username), isAdmin: username === 'admin' };
    } else {
      // 登录模式下用户不存在
      if (mode === 'login') return { ok: false, error: '用户不存在' };
      // 注册新用户
      if (password.length < 4) return { ok: false, error: '密码至少 4 位' };
      createUser(username, password);
      setCurrentUser(username);
      return { ok: true, data: getNavDataForUser(username), isNew: true, isAdmin: username === 'admin' };
    }
  }
}

// ==================== 获取当前用户数据 ====================
function getData() {
  if (_isCloud) {
    if (_cloudSession.data) return { ok: true, data: _cloudSession.data };
    return { ok: false };
  }
  const user = getCurrentUser();
  if (user) {
    return { ok: true, data: getNavDataForUser(user) };
  }
  return { ok: false };
}

// ==================== 获取公共导航 ====================
async function getPublicData() {
  if (_isCloud) {
    return await getPublicDataCloud();
  }
  return getPublicDataLocal();
}

// ==================== 保存公共导航（管理员）====================
async function savePublicData(password, data) {
  if (_isCloud) {
    return await savePublicDataCloud(password, data);
  }
  const localPass = getAdminPassLocal();
  if (password !== localPass) return { ok: false, error: '管理员密码错误' };
  savePublicDataLocal(data);
  return { ok: true };
}

// ==================== 检查管理员密码 ====================
function checkAdminPass(password) {
  if (_isCloud) return true; // 云模式在服务端验证
  return password === getAdminPassLocal();
}

// ==================== 修改管理员密码 ====================
async function changeAdminPass(oldPass, newPass) {
  if (_isCloud) {
    try {
      const res = await fetch(`${API_BASE}/admin/password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldPass, newPass }),
      });
      return await res.json();
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }
  if (oldPass !== getAdminPassLocal()) return { ok: false, error: '原密码错误' };
  setAdminPassLocal(newPass);
  return { ok: true };
}

// ==================== 保存个人数据 ====================
async function savePersonalData(data) {
  if (_isCloud) {
    return await cloudSaveData(data);
  }
  const user = getCurrentUser();
  if (!user) return { ok: false, error: '未登录' };
  saveNavDataForUser(user, data);
  return { ok: true };
}

// ==================== 登出 ====================
function logoutUser() {
  if (_isCloud) {
    cloudLogout();
  }
  setCurrentUser('');
}

// ==================== 删除账户 ====================
async function removeUser(username, password) {
  if (_isCloud) {
    return await cloudDeleteUser(username, password);
  }
  deleteUser(username);
  if (getCurrentUser() === username) setCurrentUser('');
  return { ok: true };
}

// ==================== 当前用户 ====================
function getCurrentUsername() {
  if (_isCloud) return _cloudSession.username || '';
  return getCurrentUser();
}

// ==================== 用户背景 ====================
function getUserBg(username) {
  try {
    const data = getNavDataForUser(username);
    return data && data.background ? data.background : null;
  } catch { return null; }
}
function saveUserBg(username, bgSettings) {
  const data = getNavDataForUser(username);
  data.background = bgSettings;
  saveNavDataForUser(username, data);
}

// ==================== Favicon 缓存（本地 localStorage，永久有效直到用户清理浏览器缓存）====================
const FAVICON_CACHE_KEY = 'nav_favicon_cache';

function getFaviconCache() {
  try { return JSON.parse(localStorage.getItem(FAVICON_CACHE_KEY) || '{}'); }
  catch { return {}; }
}

function saveFaviconCache(cache) {
  localStorage.setItem(FAVICON_CACHE_KEY, JSON.stringify(cache));
}

function getCachedFaviconUrl(url, title) {
  if (!url) return '';
  try {
    // 自动补协议（防止 new URL 对没有协议头的网址抛异常）
    let normalizedUrl = url.trim();
    if (!/^https?:\/\//i.test(normalizedUrl)) {
      normalizedUrl = 'https://' + normalizedUrl.replace(/^\/+/, '');
    }
    const domain = new URL(normalizedUrl).origin;
    const hostname = new URL(normalizedUrl).hostname;
    const cache = getFaviconCache();
    // 从缓存读取，忽略旧版（非 favicon.vip 的缓存，如 /favicon.ico）
    if (cache[domain] && cache[domain].url) {
      if (cache[domain].url.includes('favicon.vip')) {
        return cache[domain].url;
      }
      // 旧版缓存（/favicon.ico 等）→ 丢弃，重新用 favicon.vip
    }
    // 未命中缓存或缓存已过期 → 使用国内公益 favicon 服务
    const favUrl = 'https://www.favicon.vip/get.php?url=' + hostname;
    cache[domain] = { url: favUrl };
    saveFaviconCache(cache);
    return favUrl;
  } catch {
    return '';
  }
}

// ==================== 动态 Emoji (SVG 动画 data URL) ====================
/** emoji → 动画类型映射 */
const _animatedEmojiMap = {
  '❤':'pulse','💖':'pulse','🌙':'pulse','🎯':'pulse','📌':'pulse','🔍':'pulse','☕':'pulse','🐱':'pulse',
  '🎉':'bounce','🎊':'bounce','🚀':'bounce','🎵':'bounce','🎶':'bounce','👻':'bounce','💩':'bounce',
  '👍':'bounce','👏':'bounce','🙌':'bounce','🍰':'bounce','🐶':'bounce','🐼':'bounce','🍔':'bounce',
  '⭐':'spin','☀':'spin','😎':'spin','🍀':'spin','🦄':'spin',
  '🔥':'flicker','⚡':'flicker',
  '🌟':'glow','💡':'glow','💎':'glow',
  '💥':'shake','🔔':'shake','📢':'shake','🔑':'shake','🗑':'shake',
  '✈':'fly','🦋':'fly',
  '🌸':'float','🌻':'float',
  '✨':'sparkle',
  '🌈':'wave','🌊':'wave',
};

/** 判断某个 emoji 是否有动画（公用） */
function isAnimatedEmoji(emoji) {
  return !!_animatedEmojiMap[emoji];
}

/** 生成带 CSS 动画的 SVG data URL，不依赖任何外部资源 */
function getAnimatedSvgUrl(emoji, size) {
  const anim = _animatedEmojiMap[emoji] || 'pulse';
  // 根据目标尺寸等比缩放 viewBox
  const s = size || 28;
  const vw = Math.max(20, Math.ceil(s * 100 / 28));
  const fs = Math.ceil(vw * 0.62);
  const y = Math.ceil(vw * 0.74);
  const cssMap = {
    'pulse':    '@keyframes a{0%,100%{transform:scale(1)}50%{transform:scale(1.35)}}text{animation:a 1s ease-in-out infinite;transform-origin:'+(vw/2)+'px '+(vw/2)+'px}',
    'bounce':   '@keyframes a{0%,100%{transform:translateY(0)}50%{transform:translateY(-'+(vw*0.08)+'px)}}text{animation:a .8s ease-in-out infinite}',
    'spin':     '@keyframes a{to{transform:rotate(360deg)}}text{animation:a 2s linear infinite;transform-origin:'+(vw/2)+'px '+(vw/2)+'px}',
    'flicker':  '@keyframes a{0%,100%{opacity:1}50%{opacity:0.15}}text{animation:a .8s ease-in-out infinite}',
    'glow':     '@keyframes a{0%,100%{filter:brightness(1)}50%{filter:brightness(1.6)}}text{animation:a 1s ease-in-out infinite}',
    'shake':    '@keyframes a{0%,100%{transform:rotate(0)}25%{transform:rotate(18deg)}75%{transform:rotate(-18deg)}}text{animation:a .5s ease-in-out infinite;transform-origin:'+(vw/2)+'px '+(vw/2)+'px}',
    'wave':     '@keyframes a{0%,100%{transform:translateX(0)}50%{transform:translateX('+(vw*0.05)+'px)}}text{animation:a 1.2s ease-in-out infinite}',
    'fly':      '@keyframes a{0%{transform:translateY(0) rotate(0)}50%{transform:translateY(-'+(vw*0.08)+'px) rotate(12deg)}100%{transform:translateY(0) rotate(0)}}text{animation:a 1.5s ease-in-out infinite;transform-origin:'+(vw/2)+'px '+(vw/2)+'px}',
    'float':    '@keyframes a{0%,100%{transform:translateY(0)}50%{transform:translateY(-'+(vw*0.05)+'px)}}text{animation:a 1.8s ease-in-out infinite}',
    'sparkle':  '@keyframes a{0%,100%{transform:scale(1) rotate(0)}50%{transform:scale(1.25) rotate(18deg)}}text{animation:a .9s ease-in-out infinite;transform-origin:'+(vw/2)+'px '+(vw/2)+'px}',
  };
  const css = cssMap[anim] || cssMap['pulse'];
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="'+s+'" height="'+s+'" viewBox="0 0 '+vw+' '+vw+'"><style>'+css+'</style><text x="'+(vw/2)+'" y="'+y+'" text-anchor="middle" font-size="'+fs+'">'+emoji+'</text></svg>';
  return 'data:image/svg+xml,' + encodeURIComponent(svg);
}

/**
 * 云端刷新：打开后台/手动刷新时调用，重新拉取云端最新个人数据。
 * 解决多浏览器/多设备各自用本地旧快照导致数据不一致的问题。
 * @returns {object|null} 云端的最新数据；无登录态或网络失败时返回 null
 */
async function cloudRefreshData() {
  if (!isCloudMode()) return null;
  try {
    const res = await fetch(API_BASE + '/@me', { credentials: 'include' });
    const json = await res.json();
    if (json.ok && json.data) {
      _cloudSession.data = json.data;
      _cloudSession.username = json.username || _cloudSession.username;
      _cloudSession.isAdmin = !!json.isAdmin;
      return json.data;
    }
  } catch (e) { console.warn('cloudRefreshData 失败:', e.message); }
  return null;
}
