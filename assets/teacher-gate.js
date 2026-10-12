/* 교사 페이지 로그인 게이트 — 허브 밖 저장소(리포트·클리닉·주말·어휘·문법·H WORK)의 교사 화면용 (2026-10-12 원장님 "전부")
 *
 * 쓰는 법: 각 교사 페이지 <head> 맨 앞(다른 스크립트보다 먼저)에
 *   <script src="https://coke4497-sys.github.io/shueguk-hub/assets/teacher-gate.js"></script>
 *
 * · 허브 개인 로그인(localStorage 'shueguk_teacher_session_v2', assets/teacher-auth.js)이 없거나 교사 계정이 아니면
 *   허브 login.html로 보내고, 로그인하면 원래 주소(next)로 돌아온다. 같은 github.io 한 출처라 저장소가 달라도 읽힌다.
 * · teacher-auth.js와 달리 window.fetch를 바꾸지 않는다 — 이 페이지들은 공용 교사 계정 조각이 따로 fetch를 감싼다.
 *   (개인 토큰으로 바꿔 붙이면 어느 계정으로 쓰는지가 달라져 RLS·기록 경로가 흔들린다.) 확인 요청은 원래 fetch로만.
 * · 확인하는 동안 body를 숨기고, 통과하면 data-teacher-auth="ready". 이름이 필요한 화면은 teacher-name.js를 따로 쓴다.
 * · github.io 에서만 작동한다 — 127.0.0.1·localhost(검증 스크립트·로컬 미리보기)에서는 그냥 지나간다.
 *   검사용으로 억지로 켜려면 script 태그에 data-force="on". 세션이 만료 직전이면 refresh로 이어 간다.
 * · 통신이 끊겨 교사 확인 요청 자체가 실패하면(응답 없음) 막지 않는다 — 학원 망이 잠깐 끊겨도 출석을 찍을 수 있게.
 *   세션이 아예 없거나(로그인 안 함) 교사 표에 없으면(not_teacher) 막는다. */
(function (global) {
  'use strict';
  var SUPABASE_URL = 'https://bangdbhqpphqqdwcledg.supabase.co';
  var SUPABASE_KEY = 'sb_publishable_dE9d1KIbpgYaQkaS2MSrlg_-7SiRJuT';
  var STORAGE_KEY = 'shueguk_teacher_session_v2';
  var HUB = 'https://coke4497-sys.github.io/shueguk-hub/';
  var script = document.currentScript;
  var force = !!(script && script.dataset && script.dataset.force === 'on');
  var rawFetch = global.fetch.bind(global);
  var doc = document;

  function nowSeconds(){ return Math.floor(Date.now() / 1000); }
  function readSession(){
    try { var v = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); return v && v.access_token && v.refresh_token ? v : null; }
    catch (_) { return null; }
  }
  function saveSession(d, old){
    var s = { access_token: d.access_token, refresh_token: d.refresh_token,
              expires_at: Number(d.expires_at || (nowSeconds() + Number(d.expires_in || 3600))), user: d.user || (old && old.user) || null };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch (_) {}
    return s;
  }
  function clearSession(){ try { localStorage.removeItem(STORAGE_KEY); } catch (_) {} }
  function loginUrl(reason){
    return HUB + 'login.html?next=' + encodeURIComponent(location.href) + (reason ? '&reason=' + encodeURIComponent(reason) : '');
  }
  function toLogin(reason){ location.replace(loginUrl(reason)); }

  function refresh(s){
    return rawFetch(SUPABASE_URL + '/auth/v1/token?grant_type=refresh_token', {
      method: 'POST', headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: s.refresh_token }) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) {
        if (!r.ok || !d.access_token){ var e = new Error('login_required'); e.code = 'login_required'; throw e; }
        return saveSession(d, s);
      }); });
  }
  function validSession(){
    var s = readSession();
    if (!s){ var e = new Error('login_required'); e.code = 'login_required'; return Promise.reject(e); }
    if (s.expires_at > nowSeconds() + 90) return Promise.resolve(s);
    return refresh(s).catch(function (err) { if (err && err.code) { clearSession(); throw err; } return s; });   // 통신 실패면 옛 세션으로 계속
  }
  function teacherProfile(s){
    var uid = s && s.user && s.user.id;
    if (!uid){ var e = new Error('login_required'); e.code = 'login_required'; return Promise.reject(e); }
    return rawFetch(SUPABASE_URL + '/rest/v1/teacher_accounts?select=user_id,login_id,display_name,role&user_id=eq.' + encodeURIComponent(uid) + '&active=is.true&limit=1',
      { headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + s.access_token }, cache: 'no-store' })
      .then(function (r) {
        if (r.status === 401){ var e = new Error('login_required'); e.code = 'login_required'; throw e; }
        if (!r.ok) return null;                       // 서버 오류 — 막지 않는다
        return r.json().then(function (rows) {
          if (!rows || !rows.length){ var e2 = new Error('not_teacher'); e2.code = 'not_teacher'; throw e2; }
          return rows[0];
        });
      }, function () { return null; });              // 통신 끊김 — 막지 않는다
  }

  function guard(){
    var html = doc.documentElement;
    html.setAttribute('data-teacher-auth', 'checking');
    var style = doc.createElement('style');
    style.id = 'teacherGateStyle';
    style.textContent = 'html[data-teacher-auth="checking"] body{visibility:hidden!important}';
    doc.head.appendChild(style);
    return validSession().then(function (s) {
      return teacherProfile(s).then(function (p) { return { session: s, profile: p }; });
    }).then(function (ctx) {
      html.setAttribute('data-teacher-auth', 'ready');
      return ctx;
    }, function (err) {
      var code = (err && err.code) || 'login_required';
      if (code === 'not_teacher') clearSession();
      toLogin(code);
      throw err;
    });
  }

  var active = force || /\.github\.io$/.test(location.hostname);
  global.ShuegukGate = { active: active, loginUrl: loginUrl, readSession: readSession,
                         ready: active ? guard() : Promise.resolve(null) };
  if (active) global.ShuegukGate.ready.catch(function () {});
})(window);
