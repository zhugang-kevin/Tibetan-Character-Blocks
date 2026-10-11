// utils/cloud-progress.js — 学习进度云端同步（D93）
//
// ## 它解决什么问题
//   学习进度 / 收藏的文化卡 / 灯火数 目前**只存在本机 storage** —— **换手机就全丢**。
//   本模块把这三样同步到云端，用户换设备后能拿回来。
//
// ## 为什么必须登录
//   官方**强制鉴权闸门**：读写「用户级」数据前必须先有会话，
//   且**绝不允许**用匿名登录 / 假会话 / localStorage-only 用户去把受保护的数据「弄成能读」。
//   表 `progress` 的行由 `owner_id TEXT NOT NULL DEFAULT auth.uid()` 归属，RLS 策略
//   `progress_own` 要求 `owner_id = auth.uid()` 才能读写 —— **隔离在数据库层，不靠前端自觉**。
//
// ## 两条必须遵守的规则
//   ① 前端**绝不发送 `owner_id`**：数据库会用 `DEFAULT auth.uid()` 填，发过去反而被 RLS 拒。
//   ② 更新/删除后要检查返回的行数：**空数组 = RLS 拦住了，不是成功** —— 这两种情况报错信息一样。

var cloudMod = require('./cloud');
var cloud = cloudMod.cloud;

// ---------- 登录 ----------

/**
 * 微信登录。成功后有会话，才能读写用户级数据。
 * ⚠️ appid 必须取**当前运行时**的（试用版与正式版是不同的 appid），不能写死，
 *    也不能拿 WorkBuddy 的 applicationId（wbapp_…）冒充。
 */
function signIn() {
  return new Promise(function (resolve) {
    wx.login({
      success: function (res) {
        var appid;
        try {
          appid = wx.getAccountInfoSync().miniProgram.appId;
        } catch (e) {
          return resolve({ ok: false, reason: 'appid_unavailable', message: '无法获取小程序 appid' });
        }
        cloud.auth.signInWithWechat(res.code, appid).then(function (r) {
          if (r.error) {
            // 不打印原始 error 对象、code 或 session
            console.error('[WorkBuddy Cloud] login failed', JSON.stringify({
              stage: 'wechat-login-handler', message: r.error.message
            }));
            return resolve({ ok: false, reason: 'login_failed', message: r.error.message });
          }
          resolve({ ok: true, user: r.data && r.data.user });
        }).catch(function (e) {
          console.error('[WorkBuddy Cloud] login failed', JSON.stringify({
            stage: 'wechat-login-handler',
            message: (e && e.message) || '微信登录失败，请重试'
          }));
          resolve({ ok: false, reason: 'exception', message: '微信登录失败，请重试' });
        });
      },
      fail: function (e) {
        console.error('[WorkBuddy Cloud] login failed', JSON.stringify({
          stage: 'wx.login', message: e.errMsg
        }));
        resolve({ ok: false, reason: 'wx_login_failed', message: e.errMsg });
      }
    });
  });
}

/** 当前会话；无会话返回 null（调用方据此决定是渲染登录入口还是数据） */
function getSession() {
  return cloud.auth.getSession().then(function (r) {
    return (r.error || !r.data) ? null : r.data;
  }).catch(function () { return null; });
}

// ---------- 数据读写（一切都要过闸门）----------

/**
 * 拉取云端进度。
 * @returns {Promise<{ok:boolean, reason?:string, row?:object}>}
 */
function pull(userFallbackName) {
  return getSession().then(function (session) {
    if (!session) return { ok: false, reason: 'not_signed_in' };
    return cloud.database
      .from('progress')
      .select('done_stages, lamps, cards, owner_name, updated_at')
      .limit(1)
      .maybeSingle()
      .then(function (r) {
        if (r.error) return { ok: false, reason: mapError(r.error), message: r.error.message };
        return { ok: true, row: r.data || null };
      });
  }).catch(function (e) {
    return { ok: false, reason: 'network', message: (e && e.message) || '网络异常' };
  });
}

/**
 * 推送本地进度到云端（有则更新、无则插入）。
 * ⚠️ 不发送 owner_id —— 由数据库 DEFAULT auth.uid() 填，发过去会被 RLS 拒。
 */
function push(data) {
  var payload = {
    done_stages: data.doneStages || '',
    lamps: data.lamps || 0,
    cards: data.cards || 0,
    updated_at: new Date().toISOString()
  };
  if (data.ownerName) payload.owner_name = data.ownerName;

  return getSession().then(function (session) {
    if (!session) return { ok: false, reason: 'not_signed_in' };
    // 先查有没有自己的行（RLS 已保证只能看到自己的）
    return cloud.database.from('progress').select('id').limit(1).maybeSingle().then(function (q) {
      if (q.error) return { ok: false, reason: mapError(q.error), message: q.error.message };
      var op = q.data && q.data.id
        ? cloud.database.from('progress').update(payload).eq('id', q.data.id).select()
        : cloud.database.from('progress').insert(payload).select();
      return op.then(function (r) {
        if (r.error) return { ok: false, reason: mapError(r.error), message: r.error.message };
        // ⚠️ 空数组 = RLS 拦住了，**不是成功**
        var rows = Array.isArray(r.data) ? r.data : [];
        if (!rows.length) return { ok: false, reason: 'rls_blocked', message: '这条记录不属于你，未做改动' };
        return { ok: true, row: rows[0] };
      });
    });
  }).catch(function (e) {
    return { ok: false, reason: 'network', message: (e && e.message) || '网络异常' };
  });
}

// 把 Postgres / HTTP 错误翻译成人能看懂的话。
// 顺带把「平台凭证被拒」和应用 bug 分开 —— 前者在 SQL 里修不了。
function mapError(error) {
  if (!error) return 'unknown';
  if (error.code === '42P01') return 'table_missing';      // 表没建
  if (error.code === '42501') return 'permission_denied';  // 未授权 / 被 RLS 过滤
  if (error.code === '23505') return 'duplicate';          // 唯一约束冲突
  if (!error.code) return 'credential_rejected';           // HTTP 401，非应用 bug
  return 'db_error';
}

// 给用户看的话术（不泄露任何内部细节）
var MESSAGES = {
  not_signed_in: '登录后可以把进度保存到云端',
  table_missing: '云端还没准备好，请稍后再试',
  permission_denied: '没有权限操作这条记录',
  rls_blocked: '这条记录不属于你',
  duplicate: '记录已存在',
  credential_rejected: '云端连接异常，请稍后再试',
  network: '网络不太好，稍后再试',
  db_error: '保存失败，请稍后再试',
  unknown: '保存失败，请稍后再试'
};
function userMessage(result) {
  return MESSAGES[result && result.reason] || MESSAGES.unknown;
}

module.exports = {
  signIn: signIn,
  getSession: getSession,
  pull: pull,
  push: push,
  userMessage: userMessage,
  mapError: mapError
};
