/**
 * app.js - 前端渲染（毛玻璃导航）
 * 依赖 data.js
 */

const $ = (sel, ctx) => (ctx || document).querySelector(sel);
const $$ = (sel, ctx) => Array.from((ctx || document).querySelectorAll(sel));

/** 公共首页随机标签缓存 */
let _publicRandomTags = [];
let _isPublicPage = false;

function escHtml(str) {
  if (!str) return '';
  const d = document.createElement('div');
  d.appendChild(document.createTextNode(str));
  return d.innerHTML;
}

function getFaviconUrl(url) {
  return getCachedFaviconUrl(url);
}

/** 取标题首字做后备图标（支持中英文） */
function getFirstChar(title) {
  if (!title) return '🔗';
  const c = title.trim()[0];
  return c || '🔗';
}

/** 站标 2000ms 超时：加载超时直接显示首字后备，减少等待感 */
function startFaviconTimer() {
  const imgs = document.querySelectorAll('.ico img');
  imgs.forEach(img => {
    if (img.complete && img.naturalWidth > 0) return;
    // 图片加载成功 → 立即移除定时器
    img.addEventListener('load', function handler() {
      clearTimeout(this._favTimer);
      this.removeEventListener('load', handler);
    });
    img._favTimer = setTimeout(() => {
      if (!img.complete || img.naturalWidth === 0) {
        const fb = img.getAttribute('data-fallback') || '🔗';
        img.outerHTML = '<span class="ico-fallback" data-fb="'+fb+'">'+fb+'</span>';
        colorizeFallbacks();
      }
    }, 2000);
  });
}

/** 给所有后备图标分配随机渐变色 */
function colorizeFallbacks() {
  const gradients = [
    'linear-gradient(135deg,#667eea,#764ba2)',
    'linear-gradient(135deg,#f093fb,#f5576c)',
    'linear-gradient(135deg,#4facfe,#00f2fe)',
    'linear-gradient(135deg,#43e97b,#38f9d7)',
    'linear-gradient(135deg,#fa709a,#fee140)',
    'linear-gradient(135deg,#a18cd1,#fbc2eb)',
    'linear-gradient(135deg,#fccb90,#d57eeb)',
    'linear-gradient(135deg,#e0c3fc,#8ec5fc)',
    'linear-gradient(135deg,#667eea,#43e97b)',
    'linear-gradient(135deg,#f5576c,#4facfe)',
  ];
  document.querySelectorAll('.ico-fallback').forEach(el => {
    if (el.style.background) return; // 已上色跳过
    el.style.background = gradients[Math.floor(Math.random() * gradients.length)];
  });
}

// ==================== 书签点击统计（高频标签）====================
const CLICK_KEY = 'nav_click_stats';

function getClickStats() {
  try { return JSON.parse(localStorage.getItem(CLICK_KEY) || '{}'); }
  catch { return {}; }
}

function saveClickStats(stats) {
  localStorage.setItem(CLICK_KEY, JSON.stringify(stats));
}

function trackClick(url, title) {
  if (!url) return;
  const stats = getClickStats();
  const key = url.split('#')[0].split('?')[0]; // 去除锚点和查询参数
  if (stats[key]) {
    stats[key].c = (stats[key].c || 0) + 1;
  } else {
    stats[key] = { t: title || '未知', c: 1 };
  }
  saveClickStats(stats);
}

function getTopClicks(n) {
  const stats = getClickStats();
  return Object.entries(stats)
    .sort((a, b) => (b[1].c || 0) - (a[1].c || 0))
    .slice(0, n)
    .map(([url, data]) => ({ url, title: data.t, count: data.c }));
}

/** 渲染高频标签：已登录用户显示个人点击前5，未登录显示公共随机5个 */
function renderTopTags() {
  const container = document.getElementById('tagsContainer');
  if (!container) return;

  // 未登录 → 公共随机标签
  if (_isPublicPage) {
    if (_publicRandomTags.length === 0) {
      container.style.display = 'none';
      return;
    }
    container.style.display = 'flex';
    container.innerHTML = _publicRandomTags.map(t => `
      <span class="tag" data-url="${escHtml(t.url)}">${escHtml(t.title)}</span>
    `).join('');
    return;
  }

  // 已登录 → 个人点击前五
  const top = getTopClicks(5);
  if (top.length === 0) {
    container.innerHTML = '';
    container.style.display = 'none';
    return;
  }
  container.style.display = 'flex';
  container.innerHTML = top.map(t => `
    <span class="tag" data-url="${escHtml(t.url)}">${escHtml(t.title)}</span>
  `).join('');
}

// ==================== 网站运行计时器（从服务器获取统一建站时间）====================
/** 从服务器获取建站起始时间戳 */
let _siteStart = null;
async function fetchSiteStart() {
  try {
    const res = await fetch('/api/site/start');
    const data = await res.json();
    if (data.ok && data.start) {
      _siteStart = data.start;
      return;
    }
  } catch {}
  // 降级：从 localStorage 读取
  const saved = localStorage.getItem('nav_site_start');
  if (saved) {
    _siteStart = parseInt(saved, 10);
  } else {
    // 兜底：当前时间倒推 322 天
    const offset = 322 * 86400000 + 6 * 3600000 + 46 * 60000 + 33000;
    _siteStart = Date.now() - offset;
    localStorage.setItem('nav_site_start', String(_siteStart));
  }
}

function startRunTimer() {
  const el = document.getElementById('runTimer');
  if (!el) return;
  function update() {
    if (!_siteStart) return;
    const diff = Date.now() - _siteStart;
    const totalSec = Math.floor(diff / 1000);
    const d = Math.floor(totalSec / 86400);
    const h = String(Math.floor((totalSec % 86400) / 3600)).padStart(2, '0');
    const m = String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0');
    const s = String(totalSec % 60).padStart(2, '0');
    el.textContent = `本网站已持续运行 ${d} 天 ${h} 小时 ${m} 分钟 ${s} 秒`;
  }
  // 等 _siteStart 加载完毕后再开始更新
  const waitAndStart = () => {
    if (_siteStart) {
      update();
      setInterval(update, 1000);
    } else {
      setTimeout(waitAndStart, 200);
    }
  };
  waitAndStart();
}

// ==================== 渲染入口 ====================
async function render() {
  const currentUser = getCurrentUsername();

  // 后台拉取统一建站时间（不阻塞渲染）
  fetchSiteStart();

  if (currentUser) {
    // 有本地登录态 → 显示个人导航
    if (!isCloudMode()) {
      return renderDashboard();
    }
    // 云模式：如果 session 数据完整，直接用
    if (_cloudSession.data && _cloudSession.data.categories) {
      return renderDashboard();
    }
    // 云模式：有用户名但数据缺失（session 过期等），降级到公共页
  }

  // 未登录 / 云 session 过期 → 加载公共导航
  const publicData = await getPublicData();
  if (publicData) {
    renderPublicDashboard(publicData);
  } else {
    renderLoginScreen();
  }
}

// ==================== 公共导航页 ====================
function renderPublicDashboard(data) {
  if (!data) return;
  const app = document.getElementById('app');
  const bg = data.background || { type: 'gradient', value: 'linear-gradient(135deg, #0f0c29, #302b63, #24243e)' };
  applyBackground(bg);

  const cats = data.categories || [];

  app.innerHTML = `
    <div class="wrap">
      <div class="bar">
        <div class="logo"><b>${getCurrentUsername() ? `${escHtml(getCurrentUsername())}的导航站` : escHtml(data.title)}</b> ${getCurrentUsername() ? '<span class="nb pv">个人</span>' : '<span class="nb pb">公共</span>'} <span style="opacity:.45;font-weight:300;font-size:.92rem">${escHtml(data.subtitle || '')}</span></div>
        <div class="bar-actions">
          <div class="login-btn" id="loginBtnTop" onclick="showLoginModal()" title="登录查看个人导航">👤</div>
          <div class="user-menu" id="userMenu" style="display:none;">
            <span class="um-name" id="umName"></span>
            <a href="dashboard.html" class="bar-btn" style="padding:5px 12px">⚙️ 管理</a>
            <span class="bar-btn" onclick="doFrontLogout()" style="cursor:pointer;color:#f5576c;">退出登录</span>
          </div>
          <div id="clock" class="clock-digital"></div>
        </div>
      </div>

      ${data.announcement ? `<div class="ann-bar"><marquee behavior="scroll" direction="left" scrollamount="3">${escHtml(data.announcement)}</marquee></div>` : ''}

      <div class="hero">
        <div id="clockDisplay" class="clock-main"></div>
        <div id="dateDisplay" class="date-display"></div>
        <div class="search-form">
          <div class="sicon">🔍</div>
          <input id="sinp" class="sinp" type="text" placeholder="搜索书签，或输入内容后回车搜必应..." autocomplete="off" />
          <button class="sbtn" id="sbtn" onclick="clearSearch()">✕</button>
        </div>
        <div class="tags" id="tagsContainer"></div>
      </div>

      ${cats.map(cat => `
        <div class="sec" data-cat="${escHtml(cat.name)}">
          <div class="sec-hd">
            <span class="dot"></span>
            <span class="sec-title">${cat.icon && (cat.icon.startsWith('http://')||cat.icon.startsWith('https://')) ? `<img src="${escHtml(cat.icon)}" style="width:22px;height:22px;object-fit:contain;vertical-align:middle;border-radius:4px;" onerror="this.style.display='none'" />` : (typeof isAnimatedEmoji!=='undefined' && isAnimatedEmoji(cat.icon) ? `<img src="${getAnimatedSvgUrl(cat.icon,22)}" style="width:22px;height:22px;object-fit:contain;vertical-align:middle;border-radius:4px;" />` : escHtml(cat.icon))} ${escHtml(cat.name)}</span>
            <span class="sec-line"></span>
          </div>
          <div class="grid">
            ${(cat.links || []).map(link => `
              <a class="card" href="${escHtml(link.url)}" target="_blank" rel="noopener" title="${escHtml(link.title)}${link.desc ? ' - ' + escHtml(link.desc) : ''}\n${escHtml(link.url)}">
                <span class="ico">${link.icon && !link.icon.includes('/favicon.ico') ? (link.icon.startsWith('http') ? '<img src="'+link.icon+'" data-fallback="'+escHtml(getFirstChar(link.title))+'" onerror="this.outerHTML=\'<span class=ico-fallback>\'+(this.getAttribute(\'data-fallback\')||\'🔗\')+\'</span>\'" />' : link.icon) : '<img src="'+getFaviconUrl(link.url)+'" data-fallback="'+escHtml(getFirstChar(link.title))+'" onerror="this.outerHTML=\'<span class=ico-fallback>\'+(this.getAttribute(\'data-fallback\')||\'🔗\')+\'</span>\'" />'}</span>
                <span class="inf">
                  <span class="nm">${escHtml(link.title)}</span>
                  ${link.desc ? `<span class="ds">${escHtml(link.desc)}</span>` : ''}
                </span>
              </a>
            `).join('')}
          </div>
        </div>
      `).join('')}

      <div class="no-result" id="noResult">
        <div class="nr-icon">🔍</div>
        <div class="nr-text">没有找到匹配的链接</div>
      </div>

      <div class="bing-entry" id="bingEntry">
        <a id="bingLink" href="https://www.bing.com/search" target="_blank">🌐 在必应搜索 <span id="bingQuery"></span> →</a>
      </div>

      <div class="foot">
        <div class="foot-brand">那时那影 · 个人导航</div>
        <div class="foot-desc">网站开发 by 那时那影 · 一个专业的免费的个人导航页网站</div>
        <div class="foot-run" id="runTimer"></div>
        <div class="foot-divider">✦</div>
        <div class="foot-links">
          <a href="dashboard.html">⚙️ 管理导航</a>
          ${getCurrentUsername() === 'admin' ? '<a href="admin.html">🔐 超级管理员</a>' : ''}
        </div>
      </div>
    </div>
  `;

  // 如果已登录，显示用户菜单
  const _cu = getCurrentUsername();
  if (_cu) {
    const lbtn = document.getElementById('loginBtnTop');
    if (lbtn) lbtn.style.display = 'none';
    const menu = document.getElementById('userMenu');
    if (menu) menu.style.display = 'flex';
    const nm = document.getElementById('umName');
    if (nm) nm.textContent = _cu;
  }

  bindEvents();
  startClock();
  startRunTimer();
  startFaviconTimer();

  // 判断是否为公共首页（未登录）
  _isPublicPage = !getCurrentUsername();
  if (_isPublicPage) {
    // 从公共导航数据中随机取5个不同书签
    const allLinks = [];
    (data.categories || []).forEach(cat => {
      (cat.links || []).forEach(link => {
        allLinks.push({ title: link.title, url: link.url });
      });
    });
    // 洗牌取前5
    const shuffled = [...allLinks];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    _publicRandomTags = shuffled.slice(0, 5);
  } else {
    _isPublicPage = false;
  }

  // 兜底：给 onerror 触发的后备也上色
  setTimeout(colorizeFallbacks, 200);
  setTimeout(colorizeFallbacks, 1500);
}

// ==================== 个人导航页（已登录）====================
function renderDashboard() {
  const data = isCloudMode() ? _cloudSession.data : getData().data;
  if (!data) return renderLoginScreen();
  renderPublicDashboard(data);
}

// ==================== 登录弹窗 ====================
function renderLoginScreen() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="login-overlay">
      <div class="login-card">
        <div class="lc-icon">🧭</div>
        <div class="lc-title">登录</div>
        <div class="lc-sub">登录后可查看你的个人导航</div>
        <div class="lc-form">
          <input id="lcUser" type="text" placeholder="用户名" autocomplete="username" />
          <input id="lcPass" type="password" placeholder="密码" autocomplete="current-password" />
          <div class="lc-err" id="lcErr"></div>
          <button onclick="doFrontLogin()">🔑 登录</button>
          <div style="margin-top:10px;">
            <a href="dashboard.html" style="color:rgba(255,255,255,0.35);font-size:0.8rem;text-decoration:none;">注册 / 管理 →</a>
          </div>
          <div style="margin-top:6px;">
            <a href="#" onclick="event.preventDefault();render();" style="color:rgba(255,255,255,0.25);font-size:0.75rem;text-decoration:none;">🏠 返回首页</a>
          </div>
        </div>
      </div>
    </div>
  `;
  document.getElementById('app').style.background = 'linear-gradient(135deg, #0f0c29, #302b63, #24243e)';
  startClock();
}

// ==================== 前端登录 ====================
function showLoginModal() {
  renderLoginScreen();
}

async function doFrontLogin() {
  const u = document.getElementById('lcUser').value.trim();
  const p = document.getElementById('lcPass').value;
  if (!u || !p) { document.getElementById('lcErr').textContent = '请输入用户名和密码'; return; }
  const btn = document.querySelector('.lc-form button');
  btn.disabled = true; btn.textContent = '登录中...';
  const result = await loginUser(u, p);
  if (result.ok) {
    await render();
  } else {
    document.getElementById('lcErr').textContent = result.error || '登录失败';
    btn.disabled = false; btn.textContent = '🔑 登录';
  }
}

function doFrontLogout() {
  logoutUser();
  location.reload();
}

// ==================== 背景应用 ====================
function applyBackground(bg) {
  const app = document.getElementById('app');
  console.log('[背景] applyBackground 被调用, bg参数:', bg);
  
  // 已登录用户：优先用 localStorage 图片背景 → 其次用云端背景 → 最后用公共背景
  const cu = getCurrentUsername();
  console.log('[背景] 当前用户:', cu);
  if (cu) {
    // ① localStorage 图片背景
    const localBg = localStorage.getItem('nav_user_bg');
    console.log('[背景] localStorage nav_user_bg:', localBg);
    if (localBg) {
      try {
        const parsed = JSON.parse(localBg);
        if (parsed && parsed.type === 'image' && parsed.value) {
          console.log('[背景] 使用 localStorage 图片背景');
          applyBgValue(app, parsed);
          return;
        }
      } catch (e) { console.log('[背景] 解析 localBg 失败:', e); }
    }
    // ② 云端背景（渐变/纯色/视频）
    const userData = isCloudMode() ? _cloudSession.data : null;
    console.log('[背景] 云端用户数据:', userData);
    if (userData && userData.background) {
      console.log('[背景] 使用云端背景:', userData.background);
      applyBgValue(app, userData.background);
      return;
    }
  }
  
  if (!bg) { console.log('[背景] 无背景，使用默认'); app.style.background = 'linear-gradient(135deg, #0f0c29, #302b63, #24243e)'; return; }
  console.log('[背景] 使用公共背景:', bg);
  applyBgValue(app, bg);
}

function applyBgValue(app, bg) {
  console.log('[背景] applyBgValue 被调用, bg:', bg);
  // 移除旧视频元素
  const oldVideo = document.getElementById('bgVideo');
  if (oldVideo) oldVideo.remove();
  
  if (bg.type === 'gradient' || bg.type === 'color') {
    console.log('[背景] 设置渐变/纯色:', bg.value);
    app.style.background = bg.value;
    app.style.position = '';
  } else if (bg.type === 'image') {
    console.log('[背景] 设置图片:', bg.value);
    app.style.background = `url(${bg.value}) center/cover no-repeat fixed`;
    app.style.position = 'relative';
    app.style.backgroundBlendMode = 'normal';
  } else if (bg.type === 'video') {
    console.log('[背景] 设置视频, value:', bg.value, 'ver:', bg.ver);
    // 遮罩层透明度，默认 0.5
    const overlayOpacity = bg.overlay !== undefined ? bg.overlay : 0.5;
    app.style.background = `rgba(0,0,0,${overlayOpacity})`;
    app.style.position = 'relative';
    const video = document.createElement('video');
    video.id = 'bgVideo';
    video.autoplay = true;
    video.loop = true;
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = 'anonymous';
    video.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;object-fit:cover;z-index:-1;';
    video.onerror = function() { console.log('[背景] 视频加载失败'); app.style.background = '#0f0c29'; this.remove(); };
    video.oncanplay = function() { console.log('[背景] 视频可以播放了'); };

    // 从 value 中提取视频索引，兼容新旧数据
    let videoIdx = 1;
    if (bg.videoIndex) {
      videoIdx = bg.videoIndex;
    } else if (bg.value) {
      const m = bg.value.match(/bg_(\d+)\.mp4/);
      if (m) videoIdx = parseInt(m[1]);
    }
    const videoSrc = '/videos/bg/bg_' + videoIdx + '.mp4';
    const bgVer = bg.ver || '0';
    const cacheKey = 'bg_video_' + bgVer + '_' + btoa(videoSrc).slice(0, 30);
    console.log('[背景] 视频源:', videoSrc, '缓存key:', cacheKey, '版本号:', bgVer);

    // 尝试从 Cache API 读取缓存的视频
    if ('caches' in window) {
      caches.open('nav_bg_videos').then(cache => {
        cache.match(cacheKey).then(cached => {
          if (cached) {
            console.log('[背景] 缓存命中，使用缓存视频');
            cached.blob().then(blob => {
              video.src = URL.createObjectURL(blob);
              document.body.insertBefore(video, document.body.firstChild);
            });
          } else {
            console.log('[背景] 缓存未命中，开始下载视频');
            fetch(videoSrc).then(res => {
              console.log('[背景] 下载响应:', res.status, res.ok);
              if (!res.ok) throw new Error('加载失败, status:' + res.status);
              const cloned = res.clone();
              cache.put(cacheKey, cloned);
              res.blob().then(blob => {
                console.log('[背景] 下载完成, blob大小:', blob.size);
                video.src = URL.createObjectURL(blob);
                document.body.insertBefore(video, document.body.firstChild);
              });
            }).catch(e => {
              console.log('[背景] 下载失败:', e);
              video.src = videoSrc;
              document.body.insertBefore(video, document.body.firstChild);
            });
          }
        });
      });
    } else {
      console.log('[背景] 浏览器不支持 Cache API，直接加载');
      video.src = videoSrc;
      document.body.insertBefore(video, document.body.firstChild);
    }
  } else {
    console.log('[背景] 未知背景类型:', bg.type);
  }
  app.style.backgroundBlendMode = 'normal';
}

// ==================== 事件绑定 ====================
function bindEvents() {
  // 搜索框输入 → 过滤书签 + 更新必应入口
  document.getElementById('sinp')?.addEventListener('input', function (e) {
    doSearchFilter(this.value);
  });

  // 回车 → 跳必应搜索
  document.getElementById('sinp')?.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      const val = this.value.trim();
      if (val) {
        window.open('https://www.bing.com/search?q=' + encodeURIComponent(val), '_blank');
      }
    }
  });

  // 书签卡片点击 → 统计 + 无痕跳转（页面保留在当前页）
  document.getElementById('app')?.addEventListener('click', function (e) {
    const card = e.target.closest('.card');
    if (card && card.href) {
      trackClick(card.href, card.querySelector('.nm')?.textContent || '');
      // 延迟一小段时间刷新高频标签，不阻塞跳转
      setTimeout(renderTopTags, 100);
    }
  });

  // 高频标签点击 → 直接打开该链接
  document.getElementById('tagsContainer')?.addEventListener('click', function (e) {
    const tag = e.target.closest('.tag');
    if (tag && tag.dataset.url) {
      e.preventDefault();
      window.open(tag.dataset.url, '_blank');
      trackClick(tag.dataset.url, tag.textContent);
      setTimeout(renderTopTags, 100);
    }
  });

  // 渲染高频标签
  renderTopTags();
}

function doSearchFilter(query) {
  const allCards = $$('.card');
  const allSections = $$('.sec');
  const noResult = document.getElementById('noResult');
  const bingEntry = document.getElementById('bingEntry');
  const bingLink = document.getElementById('bingLink');
  const bingQuery = document.getElementById('bingQuery');
  const trimmed = (query || document.getElementById('sinp')?.value || '').trim().toLowerCase();
  let visibleCount = 0;
  allCards.forEach(card => {
    const title = (card.querySelector('.nm')?.textContent || '').toLowerCase();
    const desc = (card.querySelector('.ds')?.textContent || '').toLowerCase();
    const match = !trimmed || title.includes(trimmed) || desc.includes(trimmed);
    card.style.display = match ? '' : 'none';
    if (match) visibleCount++;
  });
  allSections.forEach(sec => {
    const cards = sec.querySelectorAll('.card');
    const hasVisible = Array.from(cards).some(c => c.style.display !== 'none');
    sec.style.display = hasVisible ? '' : 'none';
  });
  if (noResult) {
    noResult.classList.toggle('show', visibleCount === 0 && trimmed.length > 0);
  }
  // 有输入 → 显示必应搜索入口
  if (bingEntry && bingLink && bingQuery) {
    if (trimmed) {
      bingEntry.style.display = '';
      bingQuery.textContent = '「' + document.getElementById('sinp').value.trim() + '」';
      bingLink.href = 'https://www.bing.com/search?q=' + encodeURIComponent(document.getElementById('sinp').value.trim());
    } else {
      bingEntry.style.display = 'none';
    }
  }
}

function clearSearch() {
  const inp = document.getElementById('sinp');
  if (inp) {
    inp.value = '';
    inp.focus();
    doSearchFilter('');
  }
}

// ==================== 时钟 ====================
function startClock() {
  const el = document.getElementById('clockDisplay');
  const dateEl = document.getElementById('dateDisplay');
  const miniClock = document.getElementById('clock');
  if (!el) return;
  function update() {
    const now = new Date();
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    const s = String(now.getSeconds()).padStart(2, '0');
    el.textContent = h + ':' + m + ':' + s;
    if (miniClock) miniClock.textContent = h + ':' + m;
    if (dateEl) {
      const days = ['日', '一', '二', '三', '四', '五', '六'];
      dateEl.textContent = now.getFullYear() + ' · ' + String(now.getMonth()+1).padStart(2,'0') + ' · ' + String(now.getDate()).padStart(2,'0') + ' · 星期' + days[now.getDay()];
    }
  }
  update();
  setInterval(update, 1000);
}

// ==================== 右键菜单（登录用户快捷编辑）====================
let _ctxData = null; // 当前右键对象：{ type: 'cat'|'link', ci, li }

function createContextMenu() {
  const div = document.createElement('div');
  div.id = 'ctxMenu';
  div.style.cssText = 'display:none;position:fixed;z-index:9999;min-width:150px;background:rgba(20,24,40,.95);backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,.06);border-radius:10px;padding:4px;box-shadow:0 8px 30px rgba(0,0,0,.3);font-size:.85rem;';
  div.innerHTML = `
    <div class="ctx-item" data-action="edit" style="padding:7px 14px;border-radius:6px;cursor:pointer;display:flex;align-items:center;gap:6px;color:rgba(255,255,255,.7);transition:background .12s;" onmouseover="this.style.background='rgba(79,172,254,.12)'" onmouseout="this.style.background='transparent'">✏️ 编辑</div>
    <div class="ctx-item" data-action="delete" style="padding:7px 14px;border-radius:6px;cursor:pointer;display:flex;align-items:center;gap:6px;color:#f5576c;transition:background .12s;" onmouseover="this.style.background='rgba(245,87,108,.1)'" onmouseout="this.style.background='transparent'">🗑️ 删除</div>
    <div style="height:1px;background:rgba(255,255,255,.04);margin:2px 0;"></div>
    <div class="ctx-item" data-action="cancel" style="padding:7px 14px;border-radius:6px;cursor:pointer;display:flex;align-items:center;gap:6px;color:rgba(255,255,255,.3);transition:background .12s;" onmouseover="this.style.background='rgba(255,255,255,.04)'" onmouseout="this.style.background='transparent'">取消</div>
  `;
  div.addEventListener('click', e => {
    const item = e.target.closest('.ctx-item');
    if (!item) return;
    const action = item.dataset.action;
    const ctxData = _ctxData; // 先保存，避免 hideCtxMenu 清空
    hideCtxMenu();
    if (action === 'edit') handleCtxEdit(ctxData);
    else if (action === 'delete') handleCtxDelete(ctxData);
  });
  document.body.appendChild(div);
  return div;
}

function showCtxMenu(x, y, data) {
  _ctxData = data;
  let menu = document.getElementById('ctxMenu');
  if (!menu) menu = createContextMenu();
  menu.style.display = 'block';
  menu.style.left = Math.min(x, window.innerWidth - 160) + 'px';
  menu.style.top = Math.min(y, window.innerHeight - 130) + 'px';
}

function hideCtxMenu() {
  const el = document.getElementById('ctxMenu');
  if (el) el.style.display = 'none';
  _ctxData = null;
}

function handleCtxEdit(ctxData) {
  if (!ctxData) return;
  const { type, ci, li, catName } = ctxData;
  const data = isCloudMode() ? _cloudSession.data : getData().data;
  if (!data) return;

  if (type === 'cat') {
    if (confirm(`编辑分类「${data.categories[ci].name}」？\n点击确定跳转到管理后台。`)) {
      location.href = 'dashboard.html';
    }
  } else if (type === 'link') {
    const cat = data.categories[ci];
    const link = cat.links[li];
    if (!link) return;
    const newTitle = prompt('链接标题：', link.title);
    if (newTitle === null) return;
    const newUrl = prompt('链接地址：', link.url);
    if (newUrl === null) return;
    const newDesc = prompt('描述（可选）：', link.desc || '');
    if (newDesc === null) return;
    link.title = newTitle.trim() || link.title;
    link.url = newUrl.trim() || link.url;
    link.desc = newDesc.trim();
    // 保存到云
    savePersonalData(data).then(r => {
      if (r.ok) {
        // 更新本地 session，保证刷新后显示最新数据
        if (isCloudMode() && _cloudSession) {
          _cloudSession.data = data;
          localStorage.setItem('_cloudSession', JSON.stringify(_cloudSession));
        }
        location.reload();
      } else {
        toast('❌ 保存失败', 'err');
      }
    });
  }
}

function handleCtxDelete(ctxData) {
  if (!ctxData) return;
  const { type, ci, li, catName } = ctxData;
  const data = isCloudMode() ? _cloudSession.data : getData().data;
  if (!data) return;

  if (type === 'cat') {
    if (!confirm(`确定删除分类「${data.categories[ci].name}」及其中所有链接？`)) return;
    data.categories.splice(ci, 1);
    savePersonalData(data).then(r => {
      if (r.ok) {
        if (isCloudMode() && _cloudSession) {
          _cloudSession.data = data;
          localStorage.setItem('_cloudSession', JSON.stringify(_cloudSession));
        }
        location.reload();
      } else {
        toast('❌ 删除失败', 'err');
      }
    });
  } else if (type === 'link') {
    const cat = data.categories[ci];
    const link = cat.links[li];
    if (!link) return;
    if (!confirm(`确定删除链接「${link.title}」？`)) return;
    cat.links.splice(li, 1);
    savePersonalData(data).then(r => {
      if (r.ok) {
        if (isCloudMode() && _cloudSession) {
          _cloudSession.data = data;
          localStorage.setItem('_cloudSession', JSON.stringify(_cloudSession));
        }
        location.reload();
      } else {
        toast('❌ 删除失败', 'err');
      }
    });
  }
}

// 绑定右键事件（在 renderPublicDashboard 中调用）
function bindContextMenu() {
  const cu = getCurrentUsername();
  if (!cu) return; // 未登录不绑定

  // 阻止浏览器默认右键
  document.addEventListener('contextmenu', e => {
    // 只在导航区域阻止
    const wrap = e.target.closest('.wrap');
    if (!wrap) return;
    e.preventDefault();
    // 查找被右键的元素
    const card = e.target.closest('.card');
    const secHd = e.target.closest('.sec-hd');
    const sec = e.target.closest('.sec');

    if (card) {
      // 右键的是链接
      const grid = card.closest('.grid');
      const secEl = card.closest('.sec');
      if (!grid || !secEl) return;
      const ci = Array.from(secEl.parentElement.querySelectorAll('.sec')).indexOf(secEl);
      const li = Array.from(grid.querySelectorAll('.card')).indexOf(card);
      if (ci >= 0 && li >= 0) {
        showCtxMenu(e.clientX, e.clientY, { type: 'link', ci, li });
      }
    } else if (secHd) {
      // 右键的是分类标题
      const secEl = secHd.closest('.sec');
      if (!secEl) return;
      const ci = Array.from(secEl.parentElement.querySelectorAll('.sec')).indexOf(secEl);
      if (ci >= 0) {
        showCtxMenu(e.clientX, e.clientY, { type: 'cat', ci, catName: secEl.dataset.cat });
      }
    }
  });

  // 点击其他地方关闭菜单
  document.addEventListener('click', e => {
    if (!e.target.closest('#ctxMenu')) hideCtxMenu();
  });
}

// Toast 提示（首页用，不依赖 DOM 元素）
let _toastTimer;
function toast(msg, type) {
  const old = document.querySelector('.ctx-toast');
  if (old) old.remove();
  const t = document.createElement('div');
  t.className = 'ctx-toast';
  t.style.cssText = 'position:fixed;bottom:30px;left:50%;transform:translateX(-50%);z-index:99999;padding:10px 24px;border-radius:10px;font-size:.85rem;background:' + (type === 'err' ? '#f5576c' : 'rgba(79,172,254,.9)') + ';color:#fff;box-shadow:0 4px 20px rgba(0,0,0,.3);animation:fadeIn .25s ease-out;';
  t.textContent = msg;
  document.body.appendChild(t);
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; setTimeout(() => t.remove(), 300); }, 2000);
}

// ==================== 初始化 ====================
(async function () {
  await initDataMode();
  await render();
  // 创建右键菜单 DOM + 绑定事件
  createContextMenu();
  bindContextMenu();
})();
// FORCE_DEPLOY//FORCE