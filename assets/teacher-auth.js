(function (global) {
  'use strict';

  var SUPABASE_URL = 'https://bangdbhqpphqqdwcledg.supabase.co';
  var SUPABASE_KEY = 'sb_publishable_dE9d1KIbpgYaQkaS2MSrlg_-7SiRJuT';
  var LOGIN_DOMAIN = 'shueguk.internal';
  var STORAGE_KEY = 'shueguk_teacher_session_v2';
  var LOGIN_PAGE = 'login.html';
  var script = document.currentScript;
  var mode = script && script.dataset.mode ? script.dataset.mode : 'protected';
  var showToolbar = !!(script && script.dataset.toolbar === 'on');
  var rawFetch = global.fetch.bind(global);
  var sessionTask = null;
  var teacherTask = null;

  function nowSeconds() {
    return Math.floor(Date.now() / 1000);
  }

  function readSession() {
    try {
      var value = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      return value && value.access_token && value.refresh_token ? value : null;
    } catch (_) {
      return null;
    }
  }

  function saveSession(value) {
    var session = {
      access_token: value.access_token,
      refresh_token: value.refresh_token,
      expires_at: Number(value.expires_at || (nowSeconds() + Number(value.expires_in || 3600))),
      user: value.user || null
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    return session;
  }

  function clearSession() {
    localStorage.removeItem(STORAGE_KEY);
    sessionTask = null;
    teacherTask = null;
  }

  function authRequest(grantType, body) {
    return rawFetch(SUPABASE_URL + '/auth/v1/token?grant_type=' + grantType, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    }).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (data) {
        if (!response.ok || !data.access_token) {
          var error = new Error('아이디 또는 비밀번호를 확인하십시오.');
          error.code = data.error_code || data.error || 'auth_failed';
          throw error;
        }
        return saveSession(data);
      });
    });
  }

  function refreshSession() {
    var current = readSession();
    if (!current || !current.refresh_token) return Promise.reject(new Error('로그인이 필요합니다.'));
    return authRequest('refresh_token', { refresh_token: current.refresh_token }).catch(function (error) {
      clearSession();
      throw error;
    });
  }

  function validSession(forceRefresh) {
    var current = readSession();
    if (!forceRefresh && current && current.expires_at > nowSeconds() + 90) return Promise.resolve(current);
    if (sessionTask) return sessionTask;
    sessionTask = refreshSession().then(function (session) {
      sessionTask = null;
      return session;
    }, function (error) {
      sessionTask = null;
      throw error;
    });
    return sessionTask;
  }

  function teacherProfile(session) {
    var userId = session && session.user && session.user.id;
    if (!userId) return Promise.reject(new Error('교사 계정을 확인하지 못했습니다.'));
    var url = SUPABASE_URL + '/rest/v1/teacher_accounts'
      + '?select=user_id,login_id,display_name,active,role'
      + '&user_id=eq.' + encodeURIComponent(userId)
      + '&active=is.true&limit=1';
    return rawFetch(url, {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: 'Bearer ' + session.access_token
      }
    }).then(function (response) {
      if (!response.ok) {
        var error = new Error(response.status === 404
          ? '교사 계정 설정이 아직 완료되지 않았습니다.'
          : '교사 권한을 확인하지 못했습니다.');
        error.code = 'teacher_check_failed';
        throw error;
      }
      return response.json();
    }).then(function (rows) {
      if (!rows || !rows.length) {
        var error = new Error('사용할 수 없는 교사 계정입니다. 관리자에게 문의하십시오.');
        error.code = 'not_teacher';
        throw error;
      }
      return rows[0];
    });
  }

  function requireTeacher(options) {
    options = options || {};
    if (teacherTask && !options.forceRefresh) return teacherTask;
    teacherTask = validSession(!!options.forceRefresh).then(function (session) {
      return teacherProfile(session).then(function (profile) {
        return { session: session, profile: profile };
      });
    }).catch(function (error) {
      teacherTask = null;
      if (error && error.code === 'not_teacher') clearSession();
      throw error;
    });
    return teacherTask;
  }

  function requestUrl(input) {
    return typeof input === 'string' ? input : ((input && input.url) || '');
  }

  function isProtectedSupabaseRequest(input) {
    var url = requestUrl(input);
    return url.indexOf(SUPABASE_URL + '/rest/v1/') === 0
      || url.indexOf(SUPABASE_URL + '/storage/v1/') === 0
      || url.indexOf(SUPABASE_URL + '/functions/v1/') === 0;
  }

  function authorizedOptions(input, options, token) {
    var headers = {};
    if (input && typeof input !== 'string' && input.headers && input.headers.forEach) {
      input.headers.forEach(function (value, key) { headers[key] = value; });
    }
    var source = (options && options.headers) || {};
    if (source.forEach) source.forEach(function (value, key) { headers[key] = value; });
    else Object.keys(source).forEach(function (key) { headers[key] = source[key]; });
    headers.apikey = SUPABASE_KEY;
    headers.Authorization = 'Bearer ' + token;
    var next = {};
    Object.keys(options || {}).forEach(function (key) { next[key] = options[key]; });
    next.headers = headers;
    return next;
  }

  global.fetch = function (input, options) {
    if (!isProtectedSupabaseRequest(input) || mode === 'login') return rawFetch(input, options);
    return requireTeacher().then(function (context) {
      return rawFetch(input, authorizedOptions(input, options, context.session.access_token));
    }).then(function (response) {
      if (response.status !== 401) return response;
      teacherTask = null;
      return requireTeacher({ forceRefresh: true }).then(function (context) {
        return rawFetch(input, authorizedOptions(input, options, context.session.access_token));
      });
    });
  };

  function normalizeLoginId(value) {
    var id = String(value || '').trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9._-]{1,39}$/.test(id)) {
      throw new Error('아이디는 영문 소문자·숫자·점·밑줄·하이픈으로 입력하십시오.');
    }
    return id;
  }

  function login(loginId, password) {
    var id = normalizeLoginId(loginId);
    if (!password) return Promise.reject(new Error('비밀번호를 입력하십시오.'));
    clearSession();
    return authRequest('password', {
      email: id + '@' + LOGIN_DOMAIN,
      password: String(password)
    }).then(function () {
      return requireTeacher();
    }).catch(function (error) {
      clearSession();
      throw error;
    });
  }

  function safeNext(value) {
    var next = String(value || '');
    var path = next.split(/[?#]/, 1)[0];
    var unsafePath = !/^[A-Za-z0-9][A-Za-z0-9._\/-]*\.html$/.test(path)
      || path.indexOf('//') >= 0
      || path.indexOf('\\') >= 0
      || /(^|\/)\.\.?($|\/)/.test(path);
    if (!next || unsafePath || /[\r\n]/.test(next)) return 'index.html';
    return next;
  }

  function loginUrl(reason) {
    var here = location.pathname.split('/').pop() + location.search + location.hash;
    var url = LOGIN_PAGE + '?next=' + encodeURIComponent(safeNext(here || 'index.html'));
    if (reason) url += '&reason=' + encodeURIComponent(reason);
    return url;
  }

  function logout() {
    var current = readSession();
    var task = current && current.access_token
      ? rawFetch(SUPABASE_URL + '/auth/v1/logout', {
          method: 'POST',
          headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + current.access_token }
        }).catch(function () {})
      : Promise.resolve();
    clearSession();
    return task.then(function () { location.replace(LOGIN_PAGE); });
  }

  function addToolbar(profile) {
    if (!showToolbar) return;
    function render() {
      if (document.getElementById('teacherAuthBar')) return;
      var bar = document.createElement('div');
      bar.id = 'teacherAuthBar';
      bar.setAttribute('aria-label', '로그인 정보');
      var name = document.createElement('span');
      var roleLabel = profile.role === 'assistant' ? '조교' : (profile.role === 'admin' ? '관리자' : '선생님');
      name.textContent = (profile.display_name || profile.login_id) + ' ' + roleLabel;
      var button = document.createElement('button');
      button.type = 'button';
      button.textContent = '로그아웃';
      button.addEventListener('click', logout);
      bar.appendChild(name);
      if (profile.role === 'admin') {
        var adminLink = document.createElement('a');
        adminLink.href = 'teacher_accounts.html';
        adminLink.textContent = '계정 관리';
        bar.appendChild(adminLink);
      }
      bar.appendChild(button);
      document.body.appendChild(bar);
      var style = document.createElement('style');
      style.textContent = '#teacherAuthBar{position:fixed;z-index:9999;right:14px;top:12px;display:flex;align-items:center;gap:9px;padding:7px 9px 7px 12px;border:1px solid #D7E3DD;border-radius:999px;background:rgba(255,255,255,.94);box-shadow:0 5px 18px rgba(42,51,47,.08);color:#4F5C56;font:13px/1.2 "Gowun Dodum","Malgun Gothic",sans-serif}#teacherAuthBar a,#teacherAuthBar button{border:0;border-radius:999px;padding:6px 10px;background:#EDE4F4;color:#5A4A6A;font:inherit;text-decoration:none;cursor:pointer}#teacherAuthBar a:hover,#teacherAuthBar button:hover{background:#E3D7EE}@media(max-width:560px){#teacherAuthBar span{display:none}}';
      document.head.appendChild(style);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render, { once: true });
    else render();
  }

  function protectPage() {
    document.documentElement.setAttribute('data-teacher-auth', 'checking');
    var style = document.createElement('style');
    style.id = 'teacherAuthGuardStyle';
    style.textContent = 'html[data-teacher-auth="checking"] body{visibility:hidden!important}';
    document.head.appendChild(style);
    return requireTeacher().then(function (context) {
      document.documentElement.setAttribute('data-teacher-auth', 'ready');
      addToolbar(context.profile);
      return context;
    }).catch(function (error) {
      clearSession();
      location.replace(loginUrl(error && error.code ? error.code : 'login_required'));
      throw error;
    });
  }

  var api = {
    login: login,
    logout: logout,
    requireTeacher: requireTeacher,
    readSession: readSession,
    safeNext: safeNext,
    config: { url: SUPABASE_URL, publishableKey: SUPABASE_KEY, loginDomain: LOGIN_DOMAIN }
  };
  global.TeacherAuth = api;
  api.ready = mode === 'protected' ? protectPage() : Promise.resolve(null);
})(window);
