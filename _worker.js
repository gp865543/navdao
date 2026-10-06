/**
 * ========================================
 * Cloudflare Pages Worker
 * - REST API 用于云端数据持久化（KV 存储）
 * - 托管静态文件
 * ========================================
 *
 * 部署前需要在 Cloudflare 创建 KV namespace 并绑定：
 *   绑定变量名: NAV_KV
 */

// -------------------- 密码与会话安全 --------------------
const PASSWORD_ITERATIONS = 600000;
const SESSION_TTL = 60 * 60 * 24 * 7;
function bytesToHex(bytes){return Array.from(bytes).map(b=>b.toString(16).padStart(2,'0')).join('');}
function hexToBytes(hex){const out=new Uint8Array(hex.length/2);for(let i=0;i<out.length;i++)out[i]=parseInt(hex.slice(i*2,i*2+2),16);return out;}
function randomHex(size=16){const b=new Uint8Array(size);crypto.getRandomValues(b);return bytesToHex(b);}
async function pbkdf2Hash(password,saltHex,iterations=PASSWORD_ITERATIONS){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt:hexToBytes(saltHex),iterations,hash:'SHA-256'},key,256);return bytesToHex(new Uint8Array(bits));}
async function hashPassword(password){const salt=randomHex(16);return JSON.stringify({v:2,algo:'PBKDF2-SHA256',iterations:PASSWORD_ITERATIONS,salt,hash:await pbkdf2Hash(password,salt)});}
async function verifyPassword(password,stored){try{const r=JSON.parse(stored);if(r&&r.v===2&&r.salt&&r.hash)return (await pbkdf2Hash(password,r.salt,r.iterations||PASSWORD_ITERATIONS))===r.hash;}catch{}const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(password));return bytesToHex(new Uint8Array(d))===stored;}
async function upgradePasswordIfLegacy(env,key,password,stored){if(stored&&stored.length===64&&/^[0-9a-f]+$/i.test(stored))await env.NAV_KV.put(key,await hashPassword(password));}
function getCookie(request,name){const p=name+'=';const v=(request.headers.get('Cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(p));return v?decodeURIComponent(v.slice(p.length)):'';}
async function getSession(env,request){const t=getCookie(request,'nav_session');if(!t)return null;const raw=await env.NAV_KV.get('nav:session:'+t,'text');if(!raw)return null;try{return{token:t,...JSON.parse(raw)}}catch{return null}}
async function createSession(env,username,role='user'){const token=randomHex(32);await env.NAV_KV.put('nav:session:'+token,JSON.stringify({username,role,createdAt:Date.now()}),{expirationTtl:SESSION_TTL});return token;}
async function destroySession(env,request){const t=getCookie(request,'nav_session');if(t)await env.NAV_KV.delete('nav:session:'+t);}
function sessionCookie(token){return 'nav_session='+encodeURIComponent(token)+'; Max-Age='+SESSION_TTL+'; Path=/; HttpOnly; Secure; SameSite=Lax';}
function clearSessionCookie(){return 'nav_session=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax';}
function withCookie(response,cookie){const h=new Headers(response.headers);h.append('Set-Cookie',cookie);return new Response(response.body,{status:response.status,headers:h});}
async function verifyAdminPassword(env,password){if(!password)return false;const key='nav:pass:admin';const stored=await env.NAV_KV.get(key,'text');if(!stored){await env.NAV_KV.put(key,await hashPassword(password));return true;}const ok=await verifyPassword(password,stored);if(ok)await upgradePasswordIfLegacy(env,key,password,stored);return ok;}
async function requireAdmin(env,request){const s=await getSession(env,request);return s&&s.role==='admin'?s:null;}

// -------------------- 默认导航数据 --------------------
const DEFAULT_NAV_DATA = {
  title: '毛玻璃导航',
  subtitle: '优雅 · 简洁 · 实用',
  categories: [
    {
      name: '搜索引擎', icon: '🔍',
      links: [
        { title: 'Google', url: 'https://www.google.com', desc: '全球最大的搜索引擎', icon: '' },
        { title: 'Bing', url: 'https://www.bing.com', desc: '微软必应搜索', icon: '' },
        { title: '百度', url: 'https://www.baidu.com', desc: '中文搜索引擎', icon: '' },
      ]
    },
    {
      name: '常用工具', icon: '🛠️',
      links: [
        { title: 'GitHub', url: 'https://github.com', desc: '代码托管', icon: '' },
        { title: 'Cloudflare', url: 'https://cloudflare.com', desc: 'CDN 和安全', icon: '' },
      ]
    },
    {
      name: 'AI 工具', icon: '🤖',
      links: [
        { title: 'ChatGPT', url: 'https://chat.openai.com', desc: 'AI 对话助手', icon: '' },
        { title: 'DeepSeek', url: 'https://chat.deepseek.com', desc: 'AI 助手', icon: '' },
      ]
    },
  ],
  quickTags: ['Google', 'GitHub', 'ChatGPT'],
  announcement: '',
  background: { type: 'gradient', value: 'linear-gradient(135deg, #0f0c29, #302b63, #24243e)' }
};

// -------------------- 用户列表管理 --------------------
async function getUsersList(env) {
  const data = await env.NAV_KV.get('nav:users', 'text');
  return data ? JSON.parse(data) : [];
}
async function addUserToList(env, username) {
  const users = await getUsersList(env);
  if (!users.includes(username)) {
    users.push(username);
    await env.NAV_KV.put('nav:users', JSON.stringify(users));
  }
}
async function removeUserFromList(env, username) {
  const users = await getUsersList(env);
  const idx = users.indexOf(username);
  if (idx >= 0) {
    users.splice(idx, 1);
    await env.NAV_KV.put('nav:users', JSON.stringify(users));
  }
}

// -------------------- CORS 头 --------------------
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Credentials': 'true',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

// -------------------- 路由 --------------------
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // OPTIONS 预检
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS });
    }

    // =============================================
    // API: 获取当前登录用户数据
    // GET /api/@me
    // =============================================
    if (path === '/api/@me' && request.method === 'GET') {
      try {
        const session = await getSession(env, request);
        if (!session) return json({ ok: false, error: '未登录' }, 401);
        const raw = await env.NAV_KV.get('nav:user:' + session.username, 'text');
        if (!raw) return json({ ok: false, error: '用户不存在' }, 404);
        return json({ ok: true, data: JSON.parse(raw), username: session.username, isAdmin: session.role === 'admin' });
      } catch (e) { return json({ ok: false, error: e.message }, 500); }
    }

    // =============================================
    // API: 用户登录 / 注册 / 获取数据
    // POST /api/@me  { username, password }
    // =============================================
    if (path === '/api/@me' && request.method === 'POST') {
      try {
        const { username, password } = await request.json();
        if (!username || !password) {
          return json({ ok: false, error: '缺少用户名或密码' }, 400);
        }
        const userKey = `nav:user:${username}`;
        const passKey = `nav:pass:${username}`;
        const existingData = await env.NAV_KV.get(userKey, 'text');
        const storedHash = await env.NAV_KV.get(passKey, 'text');

        if (storedHash) {
          // 已有用户：验证密码
          if (!await verifyPassword(password, storedHash)) return json({ ok: false, error: '密码错误' });
          await upgradePasswordIfLegacy(env, passKey, password, storedHash);
          const data = existingData ? JSON.parse(existingData) : DEFAULT_NAV_DATA;
          const token = await createSession(env, username, username === 'admin' ? 'admin' : 'user');
          return withCookie(json({ ok: true, data, isAdmin: username === 'admin' }), sessionCookie(token));
        } else {
          // 新用户：创建
          const passwordHash = await hashPassword(password);
          await env.NAV_KV.put(passKey, passwordHash);
          await env.NAV_KV.put(userKey, JSON.stringify(DEFAULT_NAV_DATA));
          await addUserToList(env, username);
          const token = await createSession(env, username, username === 'admin' ? 'admin' : 'user');
          return withCookie(json({ ok: true, data: JSON.parse(JSON.stringify(DEFAULT_NAV_DATA)), isNew: true, isAdmin: username === 'admin' }), sessionCookie(token));
        }
      } catch (e) {
        return json({ ok: false, error: e.message }, 500);
      }
    }

    // =============================================
    // API: 保存当前用户数据
    // PUT /api/@me  { username, password, data }
    // =============================================
    if (path === '/api/@me' && request.method === 'PUT') {
      try {
        const { data } = await request.json();
        const session = await getSession(env, request);
        if (!session) return json({ ok: false, error: '未登录' }, 401);
        if (!data) return json({ ok: false, error: '缺少数据' }, 400);
        await env.NAV_KV.put('nav:user:' + session.username, JSON.stringify(data));
        return json({ ok: true });
      } catch (e) { return json({ ok: false, error: e.message }, 500); }
    }

    // =============================================
    // API: 删除自己账户
    // DELETE /api/@me  { username, password }
    // =============================================
    if (path === '/api/@me' && request.method === 'DELETE') {
      try {
        const session = await getSession(env, request);
        if (!session) return json({ ok: false, error: '未登录' }, 401);
        await env.NAV_KV.delete('nav:user:' + session.username);
        await env.NAV_KV.delete('nav:pass:' + session.username);
        await env.NAV_KV.delete('nav:session:' + session.token);
        await removeUserFromList(env, session.username);
        return withCookie(json({ ok: true }), clearSessionCookie());
      } catch (e) { return json({ ok: false, error: e.message }, 500); }
    }

    // =============================================
    // API: 获取公共导航
    // GET /api/public
    // =============================================
    if (path === '/api/public' && request.method === 'GET') {
      try {
        const stored = await env.NAV_KV.get('nav:public', 'text');
        if (stored) return json({ ok: true, data: JSON.parse(stored) });
        return json({ ok: true, data: DEFAULT_NAV_DATA });
      } catch (e) {
        return json({ ok: false, error: e.message }, 500);
      }
    }

    // =============================================
    // API: 保存公共导航（管理员）
    // PUT /api/public  { password, data }
    // =============================================
    if (path === '/api/public' && request.method === 'PUT') {
      try {
        const { data } = await request.json();
        if (!data) return json({ ok: false, error: '缺少数据' }, 400);
        if (!await requireAdmin(env, request)) return json({ ok: false, error: '管理员未登录' }, 401);
        await env.NAV_KV.put('nav:public', JSON.stringify(data));
        return json({ ok: true });
      } catch (e) {
        return json({ ok: false, error: e.message }, 500);
      }
    }

    // =============================================
    // API: 管理员登录验证
    // POST /api/admin/login  { password }
    // =============================================
    if (path === '/api/admin/login' && request.method === 'POST') {
      try {
        const { password } = await request.json();
        if (!password) return json({ ok: false, error: '缺少密码' }, 400);
        const ok = await verifyAdminPassword(env, password);
        if (!ok) return json({ ok: false, error: '管理员密码错误' });
        const token = await createSession(env, 'admin', 'admin');
        return withCookie(json({ ok: true }), sessionCookie(token));
      } catch (e) {
        return json({ ok: false, error: e.message }, 500);
      }
    }

    // =============================================
    // API: 获取所有用户列表（管理员）
    // GET /api/admin/users?password=xxx
    // =============================================
    if (path === '/api/admin/users' && request.method === 'GET') {
      try {
        if (!await requireAdmin(env, request)) return json({ ok: false, error: '管理员未登录' }, 401);
        const users = await getUsersList(env);
        // 排除 admin 自身
        const normalUsers = users.filter(u => u !== 'admin');
        return json({ ok: true, users: normalUsers });
      } catch (e) {
        return json({ ok: false, error: e.message }, 500);
      }
    }

    // =============================================
    // API: 获取指定用户数据（管理员）
    // GET /api/admin/user/{username}?password=xxx
    // =============================================
    const userMatch = path.match(/^\/api\/admin\/user\/([^/]+)$/);
    if (userMatch && request.method === 'GET') {
      try {
        const targetUser = decodeURIComponent(userMatch[1]);
        const password = url.searchParams.get('password');
        if (!await requireAdmin(env, request)) return json({ ok: false, error: '管理员未登录' }, 401);
        const data = await env.NAV_KV.get(`nav:user:${targetUser}`, 'text');
        if (!data) return json({ ok: false, error: '用户不存在' }, 404);
        return json({ ok: true, data: JSON.parse(data) });
      } catch (e) {
        return json({ ok: false, error: e.message }, 500);
      }
    }

    // =============================================
    // API: 更新指定用户数据（管理员）
    // PUT /api/admin/user/{username}  { password, data }
    // =============================================
    if (userMatch && request.method === 'PUT') {
      try {
        const targetUser = decodeURIComponent(userMatch[1]);
        const body = await request.json();
        if (!await requireAdmin(env, request)) return json({ ok: false, error: '管理员未登录' }, 401);
        if (!body.data) return json({ ok: false, error: '缺少数据' }, 400);
        // 检查用户是否存在
        const passKey = `nav:pass:${targetUser}`;
        const storedHash = await env.NAV_KV.get(passKey, 'text');
        if (!storedHash) return json({ ok: false, error: '用户不存在' }, 404);
        await env.NAV_KV.put(`nav:user:${targetUser}`, JSON.stringify(body.data));
        return json({ ok: true });
      } catch (e) {
        return json({ ok: false, error: e.message }, 500);
      }
    }

    // =============================================
    // API: 删除指定用户（管理员）
    // DELETE /api/admin/user/{username}?password=xxx
    // =============================================
    if (userMatch && request.method === 'DELETE') {
      try {
        const targetUser = decodeURIComponent(userMatch[1]);
        const password = url.searchParams.get('password');
        if (!await requireAdmin(env, request)) return json({ ok: false, error: '管理员未登录' }, 401);
        if (targetUser === 'admin') return json({ ok: false, error: '不能删除管理员账户' }, 400);
        // 无论数据是否存在，直接删除所有相关 KV 键并移除用户列表
        const userKey = `nav:user:${targetUser}`;
        const passKey = `nav:pass:${targetUser}`;
        await Promise.all([
          env.NAV_KV.delete(userKey).catch(() => {}),
          env.NAV_KV.delete(passKey).catch(() => {}),
        ]);
        await removeUserFromList(env, targetUser);
        // 返回最新用户列表，避免 KV 最终一致性导致的读取延迟
        const updatedList = (await getUsersList(env)).filter(u => u !== 'admin');
        return json({ ok: true, users: updatedList });
      } catch (e) {
        return json({ ok: false, error: e.message }, 500);
      }
    }

    // =============================================
    // API: 登出
    // POST /api/logout
    // =============================================
    if (path === '/api/logout' && request.method === 'POST') {
      await destroySession(env, request);
      return withCookie(json({ ok: true }), clearSessionCookie());
    }

    // =============================================
    // API: 获取建站起始时间（所有人统一）
    // GET /api/site/start
    // =============================================
    if (path === '/api/site/start') {
      try {
        let start = await env.NAV_KV.get('nav:site_start', 'text');
        if (!start) {
          // 首次：以当前时间倒推 322 天 6 小时 46 分钟 33 秒作为建站时间
          const offset = 322 * 86400000 + 6 * 3600000 + 46 * 60000 + 33000;
          start = String(Date.now() - offset);
          await env.NAV_KV.put('nav:site_start', start);
        }
        return json({ ok: true, start: parseInt(start, 10) });
      } catch (e) {
        return json({ ok: false, error: e.message }, 500);
      }
    }

    // =============================================
    // API: 管理员修改密码
    // PUT /api/admin/password  { oldPass, newPass }
    // =============================================
    if (path === '/api/admin/password' && request.method === 'PUT') {
      try {
        const session = await requireAdmin(env, request);
        if (!session) return json({ ok: false, error: '管理员未登录' }, 401);
        const { newPass } = await request.json();
        if (!newPass || newPass.length < 8) return json({ ok: false, error: '新密码至少 8 位' }, 400);
        await env.NAV_KV.put('nav:pass:admin', await hashPassword(newPass));
        await env.NAV_KV.delete('nav:session:' + session.token);
        return withCookie(json({ ok: true }), clearSessionCookie());
      } catch (e) {
        return json({ ok: false, error: e.message }, 500);
      }
    }

    // =============================================
    // API: 健康检查
    // GET /api/ping
    // =============================================
    if (path === '/api/ping') {
      return json({ ok: true, kv: !!env.NAV_KV });
    }

    // =============================================
    // API: 获取已缓存的背景视频（暂时用本地文件）
    // GET /videos/bg.mp4
    // =============================================
    // =============================================
    try {
      const response = await env.ASSETS.fetch(request);
      if (response.status !== 404) return response;
    } catch {
      // 忽略 ASSETS 不可用的情况
    }

    return new Response('Not Found', { status: 404 });
  },
};
