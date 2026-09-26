// ==================== 工具 ====================
function esc(s) { if(!s)return''; const d=document.createElement('div'); d.appendChild(document.createTextNode(s)); return d.innerHTML; }
function toast(msg,type){ const c=document.getElementById('toastCtnr'); const t=document.createElement('div'); t.className='toast '+(type||'ok'); t.textContent=msg; c.appendChild(t); setTimeout(()=>{t.style.opacity='0';t.style.transition='opacity .3s';setTimeout(()=>t.remove(),300)},2500); }

let _adminPassword = '';
let _currentTab = 'users';
let _users = [];
let _publicData = null;

// ==================== 管理员登录 ====================
const ADMIN_SESSION_KEY = 'nav_admin_session';

/** 恢复或保存管理员 session */
function saveAdminSession(pwd) {
  if (pwd) localStorage.setItem(ADMIN_SESSION_KEY, pwd);
}
function clearAdminSession() {
  localStorage.removeItem(ADMIN_SESSION_KEY);
}

async function doLogin() {
  const pwd = document.getElementById('lp').value;
  if (!pwd) { document.getElementById('loginErr').textContent = '请输入密码'; return; }
  document.getElementById('loginBtn').disabled = true;
  document.getElementById('loginBtn').textContent = '验证中...';

  const result = await adminLogin(pwd);
  if (result.ok) {
    _adminPassword = pwd;
    saveAdminSession(pwd);
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('adminApp').style.display = 'block';
    await loadUsers();
    await loadPublicData();
  } else {
    document.getElementById('loginErr').textContent = result.error || '密码错误';
    document.getElementById('loginBtn').disabled = false;
    document.getElementById('loginBtn').textContent = '🛡️ 登录';
  }
}

// ==================== 加载用户列表 ====================
async function loadUsers() {
  document.getElementById('userGrid').innerHTML = '<div class="empty-state">加载中...</div>';
  const result = await adminGetUsers(_adminPassword);
  if (result.ok) {
    _users = result.users || [];
    renderUserList();
  } else {
    document.getElementById('userGrid').innerHTML = '<div class="empty-state">❌ ' + esc(result.error||'获取失败') + '</div>';
  }
}

function renderUserList() {
  const grid = document.getElementById('userGrid');
  const bar = document.getElementById('statsBar');
  bar.innerHTML = `<div class="stat-item"><div class="sv">${_users.length}</div><div class="sl">注册用户</div></div>`;
  if (_users.length === 0) {
    grid.innerHTML = '<div class="empty-state">📭 暂无注册用户</div>';
    document.getElementById('batchBar').style.display = 'none';
    return;
  }
  document.getElementById('batchBar').style.display = 'flex';
  document.getElementById('selectAllCb').checked = false;
  document.getElementById('batchDelBtn').style.display = 'none';
  grid.innerHTML = '';
  _users.forEach(username => {
    const card = document.createElement('div');
    card.className = 'user-card';
    card.innerHTML = `<label class="uc-cb"><input type="checkbox" class="user-cb" value="${esc(username)}" onchange="updateBatchBtn()" /></label>
      <div class="uc-body">
        <div class="uc-name">${esc(username)}</div>
        <div class="uc-info">用户数据存储在云端</div>
        <div class="uc-actions">
          <button onclick="viewUserData('${esc(username)}')">👁️ 查看数据</button>
          <button class="del" onclick="deleteUserConfirm('${esc(username)}')">🗑️ 删除</button>
        </div>
      </div>`;
    grid.appendChild(card);
  });
}

function toggleSelectAll(checked) {
  document.querySelectorAll('.user-cb').forEach(cb => cb.checked = checked);
  updateBatchBtn();
}

function updateBatchBtn() {
  const checked = document.querySelectorAll('.user-cb:checked');
  const btn = document.getElementById('batchDelBtn');
  btn.style.display = checked.length > 0 ? 'inline-block' : 'none';
  btn.textContent = '🗑️ 删除选中 (' + checked.length + ')';
}

async function batchDeleteUsers() {
  const checked = document.querySelectorAll('.user-cb:checked');
  if (checked.length === 0) return;
  const names = Array.from(checked).map(cb => cb.value);
  if (!confirm('确定删除选中的 ' + names.length + ' 个用户？此操作不可恢复。')) return;
  let lastOk = false;
  for (const name of names) {
    const result = await adminDeleteUser(name, _adminPassword);
    if (result.ok) {
      lastOk = true;
      // 直接使用 Worker 返回的最新列表更新 UI
      if (result.users) {
        _users = result.users;
        renderUserList();
      }
    } else {
      toast('删除「' + name + '」失败', 'err');
    }
  }
  toast('批量删除完成');
  if (!lastOk || !_users.length) await loadUsers();
}

// ==================== 查看用户数据 ====================
async function viewUserData(username) {
  const result = await adminGetUserData(username, _adminPassword);
  if (!result.ok || !result.data) {
    toast('获取用户数据失败', 'err');
    return;
  }
  const data = result.data;
  const body = document.getElementById('modalBody');
  let catsInfo = '';
  if (data.categories) {
    data.categories.forEach(c => {
      catsInfo += `<div class="pub-cat"><div class="pub-cat-hd"><span>${esc(c.icon||'📁')} ${esc(c.name)}</span><span>${(c.links||[]).length} 个链接</span></div>`;
      if (c.links) {
        c.links.forEach(l => {
          catsInfo += `<div class="pub-link"><span class="pl-title">🔗 ${esc(l.title)}</span><span style="font-size:0.72rem;color:rgba(255,255,255,0.3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:200px;">${esc(l.url)}</span></div>`;
        });
      }
      catsInfo += '</div>';
    });
  }
  body.innerHTML = `<h3>👤 ${esc(username)} 的导航数据</h3>
    <div style="font-size:0.82rem;color:rgba(255,255,255,0.4);margin-bottom:12px;">共 ${data.categories ? data.categories.length : 0} 个分类，${data.categories ? data.categories.reduce((s,c)=>s+(c.links?c.links.length:0),0) : 0} 个链接</div>
    ${catsInfo || '<div style="color:rgba(255,255,255,0.3);">无数据</div>'}
    <div class="modal-actions">
      <button class="btn-sec" onclick="closeModal()">关闭</button>
    </div>`;
  document.getElementById('modalOv').classList.add('active');
}

// ==================== 删除用户 ====================
async function deleteUserConfirm(username) {
  if (!confirm('确定删除用户「' + username + '」？此操作不可恢复。')) return;
  document.getElementById('userGrid').innerHTML = '<div class="empty-state">处理中...</div>';
  const result = await adminDeleteUser(username, _adminPassword);
  if (result.ok) {
    toast('用户「' + username + '」已删除');
    // 直接使用 Worker 返回的最新列表更新 UI，避免 KV 最终一致性问题
    if (result.users) {
      _users = result.users;
      renderUserList();
    } else {
      await loadUsers();
    }
  } else {
    toast(result.error || '删除失败', 'err');
    await loadUsers();
  }
}

// ==================== 公共导航编辑 ====================
async function loadPublicData() {
  const data = await getPublicData();
  if (data) {
    _publicData = JSON.parse(JSON.stringify(data));
    renderPublicEditor();
  } else {
    document.getElementById('publicEditor').innerHTML = '<div class="empty-state">❌ 加载失败</div>';
  }
}

function renderPublicEditor() {
  const editor = document.getElementById('publicEditor');
  if (!_publicData) { editor.innerHTML = '<div class="empty-state">加载中...</div>'; return; }
  let html = '';
  // 标题区
  html += `<div style="margin-bottom:14px;display:flex;gap:8px;align-items:center;">
    <label style="margin:0;white-space:nowrap;">标题</label>
    <input id="pubTitle" value="${esc(_publicData.title||'')}" style="flex:1;" />
    <label style="margin:0;white-space:nowrap;">副标题</label>
    <input id="pubSubtitle" value="${esc(_publicData.subtitle||'')}" style="flex:1;" />
  </div>`;
  // Quick Tags
  html += `<div style="margin-bottom:14px;">
    <label>快捷标签（逗号分隔）</label>
    <input id="pubTags" value="${(_publicData.quickTags||[]).join(', ')}" />
  </div>
  <div style="margin-bottom:14px;">
    <label>滚动公告</label>
    <input id="pubAnnouncement" value="${esc(_publicData.announcement||'')}" placeholder="留空则不显示，如：📢 本站将于本周日 02:00-04:00 维护" />
  </div>
  <div class="public-header" style="margin-bottom:8px;">
    <span style="font-size:0.9rem;">分类与链接</span>
    <button onclick="showPublicAddCat()" style="padding:5px 12px;border-radius:8px;border:1px solid rgba(255,255,255,0.08);background:rgba(255,255,255,0.04);color:#4facfe;cursor:pointer;font-size:0.78rem;">+ 添加分类</button>
  </div>`;

  // Categories
  if (_publicData.categories) {
    _publicData.categories.forEach((cat, ci) => {
      html += `<div class="pub-cat"><div class="pub-cat-hd">
        <span><input value="${esc(cat.icon)}" style="width:40px;padding:2px 4px;font-size:0.8rem;" onchange="updatePublicCat(${ci},'icon',this.value)" placeholder="📁" /> ${esc(cat.name)}</span>
        <span>
          <button onclick="editPublicCatName(${ci})" style="background:none;border:none;color:rgba(255,255,255,0.4);cursor:pointer;font-size:0.72rem;">✏️</button>
          <button onclick="deletePublicCat(${ci})" style="background:none;border:none;color:#f5576c;cursor:pointer;font-size:0.72rem;">🗑️</button>
          <button onclick="addPublicLink(${ci})" style="background:rgba(79,172,254,0.1);border:none;color:#4facfe;cursor:pointer;font-size:0.72rem;padding:2px 8px;border-radius:6px;">+ 链接</button>
        </span>
      </div>`;
      if (cat.links) {
        cat.links.forEach((link, li) => {
          html += `<div class="pub-link">
            <span style="flex:1;display:flex;gap:4px;align-items:center;flex-wrap:wrap;">
              <input value="${esc(link.title)}" style="width:120px;padding:2px 6px;font-size:0.78rem;" onchange="updatePublicLink(${ci},${li},'title',this.value)" />
              <input value="${esc(link.url)}" style="width:180px;padding:2px 6px;font-size:0.78rem;" onchange="updatePublicLink(${ci},${li},'url',this.value)" />
              <input value="${esc(link.desc||'')}" style="width:130px;padding:2px 6px;font-size:0.78rem;" onchange="updatePublicLink(${ci},${li},'desc',this.value)" placeholder="描述" />
            </span>
            <button onclick="deletePublicLink(${ci},${li})" style="background:none;border:none;color:#f5576c;cursor:pointer;font-size:0.72rem;">✕</button>
          </div>`;
        });
      }
      html += '</div>';
    });
  }
  editor.innerHTML = html;
}

// ==================== 公共导航编辑辅助函数 ====================

/** 根据分类名称自动匹配 Emoji 图标（与 dashboard.html 一致） */
function guessCatIcon(name) {
  const map = [
    [['搜','找','查','百度','谷歌','bing','google','yandex'], '🔍'],
    [['工具','实用','工','具'], '🛠️'],
    [['技术','编程','开发','代码','程序','github','git','开源','码','IT'], '💻'],
    [['社交','社区','论坛','贴吧','微博','微信','qq','群','bbs','reddit'], '💬'],
    [['视频','影视','电影','电视','b站','bilibili','youtube','抖音','快手','直播','番'], '🎬'],
    [['音乐','音频','听歌','网易云','spotify','播客'], '🎵'],
    [['娱乐','搞笑','趣','游戏','play','steam','玩'], '🎮'],
    [['新闻','资讯','头条','日报','新闻'], '📰'],
    [['购物','买','商城','电商','淘宝','京东','拼多多','亚马逊','amazon'], '🛒'],
    [['学习','教育','课程','学','知识','大学','mooc','coursera'], '📚'],
    [['邮箱','邮件','mail','gmail','outlook'], '📧'],
    [['AI','人工智能','gpt','chatgpt','deepseek','ai','机器','模型'], '🤖'],
    [['设计','图片','ps','photoshop','ui','figma','canva','绘画','美'], '🎨'],
    [['收藏','书签','我的'], '⭐'],
    [['阅读','读书','小说','文','书','文学'], '📖'],
    [['网盘','云盘','云存储','onedrive','icloud','百度网盘','阿里云盘'], '☁️'],
    [['服务器','主机','vps','部署','运维','docker','linux','nginx'], '🖥️'],
    [['安全','密码','登录','账号','隐私'], '🔒'],
    [['博客','文章','专栏','medium','博客园','csdn'], '✍️'],
    [['工作','办公','文档','excel','word','ppt','wps','公司'], '📊'],
    [['金融','银行','支付','支付宝','微信支付','理财'], '💰'],
    [['地图','导航','出行','定位','路线'], '🗺️'],
    [['天气','气候','温度'], '🌤️'],
    [['生活','家居','日常'], '🏠'],
    [['旅行','机票','酒店','旅游','航空'], '✈️'],
    [['美食','菜谱','外卖','吃'], '🍜'],
    [['健康','医疗','健身','运动','跑步'], '💪'],
    [['摄影','相机','拍照','照片'], '📷'],
    [['外语','英语','日语','翻译','语言'], '🌐'],
    [['下载','资源','分享','torrent','磁力'], '📥'],
    [['国家','政府','官方','中国','美国','日本'], '🏛️'],
    [['默认','其他','一般'], '📁'],
  ];
  const lower = name.toLowerCase();
  for (const [keywords, emoji] of map) {
    for (const kw of keywords) {
      if (lower.includes(kw.toLowerCase())) return emoji;
    }
  }
  return '📁';
}

function updatePublicCat(catIdx, field, value) {
  if (field === 'icon') _publicData.categories[catIdx].icon = value;
}
function editPublicCatName(catIdx) {
  const newName = prompt('输入新分类名称：', _publicData.categories[catIdx].name);
  if (newName && newName.trim()) {
    _publicData.categories[catIdx].name = newName.trim();
    // 自动匹配图标
    _publicData.categories[catIdx].icon = guessCatIcon(newName.trim());
    renderPublicEditor();
  }
}
function deletePublicCat(catIdx) {
  if (!confirm('确定删除此分类？')) return;
  _publicData.categories.splice(catIdx, 1);
  renderPublicEditor();
}
function addPublicLink(catIdx) {
  if (!_publicData.categories[catIdx].links) _publicData.categories[catIdx].links = [];
  _publicData.categories[catIdx].links.push({ title: '新链接', url: 'https://', desc: '' });
  renderPublicEditor();
}
function updatePublicLink(catIdx, linkIdx, field, value) {
  _publicData.categories[catIdx].links[linkIdx][field] = value;
}
function deletePublicLink(catIdx, linkIdx) {
  _publicData.categories[catIdx].links.splice(linkIdx, 1);
  renderPublicEditor();
}
function showPublicAddCat() {
  const name = prompt('输入分类名称：');
  if (name && name.trim()) {
    if (!_publicData.categories) _publicData.categories = [];
    // 自动匹配图标
    const icon = guessCatIcon(name.trim());
    _publicData.categories.push({ name: name.trim(), icon, links: [] });
    renderPublicEditor();
  }
}
function showPublicBgSettings() {
  const body = document.getElementById('modalBody');
  const bg = _publicData.background || { type: 'gradient', value: '' };
  const overlay = bg.overlay !== undefined ? bg.overlay : 0.5;
  // 找出当前视频索引
  let videoIdx = 1;
  if (bg.value) {
    const m = bg.value.match(/bg_(\d+)\.mp4/);
    if (m) videoIdx = parseInt(m[1]);
  }
  // 生成视频选择下拉
  let videoOpts = '';
  for (let i = 1; i <= 100; i++) {
    videoOpts += `<option value="${i}" ${i === videoIdx ? 'selected' : ''}>背景 ${i}</option>`;
  }
  body.innerHTML = `<h3>🎨 公共导航背景</h3>
    <label>类型</label>
    <select id="mBgType" onchange="updateBgExample()"><option value="gradient" ${bg.type==='gradient'?'selected':''}>渐变</option><option value="color" ${bg.type==='color'?'selected':''}>纯色</option><option value="image" ${bg.type==='image'?'selected':''}>图片</option><option value="video" ${bg.type==='video'?'selected':''}>视频</option></select>
    <div id="videoSelectRow" style="display:${bg.type==='video'?'block':'none'};margin-top:8px;">
      <label>选择背景视频</label>
      <select id="mBgVideoSelect" style="width:100%;padding:8px 12px;border-radius:8px;border:1px solid rgba(255,255,255,0.08);background:rgba(255,255,255,0.03);color:#e0e0e0;font-size:0.88rem;outline:none;margin-bottom:6px;" onchange="updateVideoPreview(this.value)">${videoOpts}</select>
      <div id="videoPreview" style="width:100%;height:120px;border-radius:8px;overflow:hidden;background:rgba(0,0,0,0.2);display:${bg.type==='video'?'block':'none'};">
        ${bg.type==='video' ? `<video src="/videos/bg/bg_${videoIdx}.mp4" autoplay loop muted style="width:100%;height:100%;object-fit:cover;" />` : ''}
      </div>
    </div>
    <label>数值</label>
    <textarea id="mBgVal" placeholder="输入渐变/颜色值或图片URL" style="display:${bg.type==='video'?'none':'block'};">${bg.type==='video' ? '/videos/bg/bg_' + videoIdx + '.mp4' : esc(bg.value||'')}</textarea>
    <div id="bgExample" style="font-size:0.72rem;color:rgba(255,255,255,0.3);margin-top:6px;">${bg.type==='video' ? '从 100 个动态背景中选择' : '渐变示例: linear-gradient(135deg, #0f0c29, #302b63, #24243e)'}</div>
    <div id="overlayRow" style="display:${bg.type==='video'||bg.type==='image'?'block':'none'};margin-top:10px;padding:10px;background:rgba(255,255,255,0.03);border-radius:8px;">
      <label style="font-size:0.82rem;color:rgba(255,255,255,0.4);display:flex;justify-content:space-between;">
        <span>遮罩透明度</span>
        <span id="overlayVal">${overlay}</span>
      </label>
      <input type="range" id="overlaySlider" min="0" max="1" step="0.05" value="${overlay}" style="width:100%;" oninput="document.getElementById('overlayVal').textContent=this.value" />
    </div>
    <div class="modal-actions">
      <button class="btn-sec" onclick="closeModal()">取消</button>
      <button class="btn-pri" onclick="confirmPublicBg()">保存</button>
    </div>`;
  document.getElementById('modalOv').classList.add('active');
  updateBgExample();
}
function updateBgExample() {
  const type = document.getElementById('mBgType').value;
  const textarea = document.getElementById('mBgVal');
  const hint = document.getElementById('bgExample');
  const overlayRow = document.getElementById('overlayRow');
  const videoRow = document.getElementById('videoSelectRow');
  const videoPreview = document.getElementById('videoPreview');
  
  overlayRow.style.display = (type === 'video' || type === 'image') ? 'block' : 'none';
  
  if (type === 'video') {
    hint.textContent = '从 100 个动态背景中选择（视频文件已内置在项目中）';
    textarea.style.display = 'none';
    if (videoRow) videoRow.style.display = 'block';
    if (videoPreview) videoPreview.style.display = 'block';
  } else {
    if (videoRow) videoRow.style.display = 'none';
    if (videoPreview) videoPreview.style.display = 'none';
    textarea.style.display = 'block';
    if (type === 'gradient') {
      hint.textContent = '渐变示例: linear-gradient(135deg, #0f0c29, #302b63, #24243e)';
      textarea.placeholder = '输入渐变色值';
      if (!textarea.value) textarea.value = 'linear-gradient(135deg, #0f0c29, #302b63, #24243e)';
    } else if (type === 'color') {
      hint.textContent = '纯色示例: #302b63 或 rgb(48,43,99)';
      textarea.placeholder = '输入颜色值';
      if (!textarea.value) textarea.value = '#302b63';
    } else if (type === 'image') {
      hint.textContent = '图片示例: https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1920';
      textarea.placeholder = '输入图片URL（建议 ≥1920×1080）';
      if (!textarea.value) textarea.value = 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1920';
    }
  }
}
function updateVideoPreview(idx) {
  const textarea = document.getElementById('mBgVal');
  const preview = document.getElementById('videoPreview');
  if (textarea) textarea.value = '/videos/bg/bg_' + idx + '.mp4';
  if (preview) {
    preview.innerHTML = `<video src="/videos/bg/bg_${idx}.mp4" autoplay loop muted style="width:100%;height:100%;object-fit:cover;" />`;
  }
}
// ==================== 修改管理员密码 ====================
function showChangePassword() {
  const body = document.getElementById('modalBody');
  body.innerHTML = `<h3>🔑 修改管理员密码</h3>
    <label>原密码</label><input id="mOldPass" type="password" placeholder="输入当前密码" />
    <label>新密码</label><input id="mNewPass" type="password" placeholder="输入新密码（至少6位）" />
    <label>确认新密码</label><input id="mNewPass2" type="password" placeholder="再次输入新密码" />
    <div class="modal-actions">
      <button class="btn-sec" onclick="closeModal()">取消</button>
      <button class="btn-pri" onclick="confirmChangePassword()">确认修改</button>
    </div>`;
  document.getElementById('modalOv').classList.add('active');
}
async function confirmChangePassword() {
  const oldPass = document.getElementById('mOldPass').value;
  const newPass = document.getElementById('mNewPass').value;
  const newPass2 = document.getElementById('mNewPass2').value;
  if (!oldPass || !newPass) { toast('请填写完整', 'err'); return; }
  if (newPass.length < 6) { toast('新密码至少6位', 'err'); return; }
  if (newPass !== newPass2) { toast('两次新密码不一致', 'err'); return; }
  const result = await changeAdminPass(oldPass, newPass);
  if (result.ok) {
    closeModal();
    _adminPassword = newPass;
    toast('密码已修改 ✅');
  } else {
    toast(result.error || '修改失败', 'err');
  }
}
function confirmPublicBg() {
  const type = document.getElementById('mBgType').value;
  const value = document.getElementById('mBgVal').value;
  const overlay = parseFloat(document.getElementById('overlaySlider')?.value || '0.5');
  const newVer = (_publicData.bgVer || 0) + 1;
  _publicData.background = { type, value, overlay, ver: type === 'video' ? newVer : 0 };
  if (type === 'video') _publicData.bgVer = newVer;
  closeModal();
  // 立即保存到云端
  savePublicData(_adminPassword, _publicData).then(r => {
    if (r && r.ok) {
      toast('背景已更新 ✅');
    } else {
      toast('背景保存失败', 'err');
    }
  });
}

async function savePublicDataGo() {
  // 读取标题和标签
  const title = document.getElementById('pubTitle')?.value || _publicData.title;
  const subtitle = document.getElementById('pubSubtitle')?.value || _publicData.subtitle;
  const tagsInput = document.getElementById('pubTags')?.value || '';
  const announcement = document.getElementById('pubAnnouncement')?.value || '';
  _publicData.title = title;
  _publicData.subtitle = subtitle;
  _publicData.quickTags = tagsInput.split(/[,，]/).map(s => s.trim()).filter(Boolean);
  _publicData.announcement = announcement;

  const result = await savePublicData(_adminPassword, _publicData);
  if (result && result.ok) {
    toast('公共导航已保存 ✅');
  } else if (result && result.error) {
    toast(result.error, 'err');
  } else {
    toast('保存失败', 'err');
  }
}

// ==================== 切换标签 ====================
function switchTab(tab) {
  _currentTab = tab;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.getElementById('tab' + tab.charAt(0).toUpperCase() + tab.slice(1)).classList.add('active');
  document.getElementById('panel' + tab.charAt(0).toUpperCase() + tab.slice(1)).classList.add('active');
  if (tab === 'users') loadUsers();
  else if (tab === 'public') loadPublicData();
}

// ==================== 弹窗 ====================
function closeModal() {
  document.getElementById('modalOv').classList.remove('active');
}

// ==================== 登出 ====================
function doLogout() {
  _adminPassword = '';
  clearAdminSession();
  document.getElementById('adminApp').style.display = 'none';
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('lp').value = '';
  document.getElementById('loginBtn').disabled = false;
  document.getElementById('loginBtn').textContent = '🛡️ 登录';
  document.getElementById('loginErr').textContent = '';
}

// ==================== 键盘事件 ====================
document.addEventListener('keydown', function(e) {
  if (e.key === 'Enter' && document.getElementById('loginScreen').style.display !== 'none') {
    e.preventDefault();
    doLogin();
  }
});
document.getElementById('modalOv').addEventListener('click', function(e) {
  if (e.target === this) closeModal();
});

// ==================== 初始化 ====================
async function init() {
  await initDataMode();
  if (!isCloudMode()) {
    document.getElementById('loginScreen').innerHTML = '<div class="login-box"><h1>⚠️</h1><div class="sub">超级管理员后台仅支持云端模式<br/>请部署到 Cloudflare Pages 使用</div></div>';
    return;
  }
  // 尝试恢复上次登录的 session
  const saved = localStorage.getItem(ADMIN_SESSION_KEY);
  if (saved) {
    const result = await adminLogin(saved);
    if (result.ok) {
      _adminPassword = saved;
      document.getElementById('loginScreen').style.display = 'none';
      document.getElementById('adminApp').style.display = 'block';
      await loadUsers();
      await loadPublicData();
      return;
    } else {
      // 密码已失效 → 清除 session
      clearAdminSession();
    }
  }
  document.getElementById('loginScreen').style.display = 'flex';
}
init();