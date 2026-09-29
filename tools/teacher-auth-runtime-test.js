#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'assets', 'teacher-auth.js'), 'utf8');
const store = new Map();
let count = 0;
let failed = 0;

function check(value, label) {
  count += 1;
  if (value) console.log('  ✓ ' + label);
  else { failed += 1; console.error('  ✗ ' + label); }
}

function response(status, data) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data)
  };
}

function makeContext(mode, calls) {
  const attrs = {};
  const context = {
    console,
    Promise,
    Date,
    JSON,
    Math,
    Object,
    String,
    Number,
    encodeURIComponent,
    setTimeout,
    clearTimeout,
    location: {
      pathname: '/shueguk-hub/index.html', search: '', hash: '',
      replace(value) { this.replaced = value; }
    },
    localStorage: {
      getItem(key) { return store.has(key) ? store.get(key) : null; },
      setItem(key, value) { store.set(key, value); },
      removeItem(key) { store.delete(key); }
    },
    document: {
      currentScript: { dataset: { mode } },
      documentElement: { setAttribute(key, value) { attrs[key] = value; } },
      head: { appendChild() {} },
      createElement() { return { style: {}, appendChild() {}, addEventListener() {}, setAttribute() {} }; },
      getElementById() { return null; },
      readyState: 'complete',
      addEventListener() {},
      body: { appendChild() {} }
    },
    fetch(url, options) {
      calls.push({ url: String(url), options: options || {} });
      if (String(url).includes('/auth/v1/token')) {
        return Promise.resolve(response(200, {
          access_token: 'teacher-access-token',
          refresh_token: 'teacher-refresh-token',
          expires_in: 3600,
          user: { id: '11111111-1111-1111-1111-111111111111' }
        }));
      }
      if (String(url).includes('/teacher_accounts')) {
        return Promise.resolve(response(200, [{
          user_id: '11111111-1111-1111-1111-111111111111',
          login_id: 'teacher.one',
          display_name: '첫째',
          active: true,
          role: 'admin'
        }]));
      }
      return Promise.resolve(response(200, []));
    }
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(source, context, { filename: 'teacher-auth.js' });
  return { context, attrs };
}

(async function () {
  store.clear();
  const loginCalls = [];
  const login = makeContext('login', loginCalls).context;
  const result = await login.TeacherAuth.login('Teacher.One', 'safe-password');
  const tokenCall = loginCalls.find(call => call.url.includes('/auth/v1/token'));
  const body = JSON.parse(tokenCall.options.body);
  check(body.email === 'teacher.one@shueguk.internal', '교사 아이디를 내부 Auth 이메일로 변환함');
  check(body.password === 'safe-password', '입력한 비밀번호만 로그인 요청에 사용함');
  check(result.profile.display_name === '첫째', '활성 교사 표에서 표시 이름을 확인함');
  check(store.has('shueguk_teacher_session_v2'), '발급된 세션을 저장함');
  check(login.TeacherAuth.safeNext('report.html?student=1#top') === 'report.html?student=1#top', '같은 앱의 이동 주소는 유지함');
  check(login.TeacherAuth.safeNext('javascript:alert(1)') === 'index.html', '스크립트 이동 주소를 차단함');
  check(login.TeacherAuth.safeNext('../index.html') === 'index.html', '상위 경로 이동을 차단함');

  const protectedCalls = [];
  const protectedPage = makeContext('protected', protectedCalls);
  await protectedPage.context.TeacherAuth.ready;
  await protectedPage.context.fetch('https://bangdbhqpphqqdwcledg.supabase.co/rest/v1/omr_exams?select=name');
  await protectedPage.context.fetch('https://bangdbhqpphqqdwcledg.supabase.co/storage/v1/object/review-files/test.pdf');
  const dataCall = protectedCalls.find(call => call.url.includes('/omr_exams'));
  const storageCall = protectedCalls.find(call => call.url.includes('/storage/v1/'));
  check(protectedPage.attrs['data-teacher-auth'] === 'ready', '활성 교사만 보호 페이지를 표시함');
  check(dataCall.options.headers.Authorization === 'Bearer teacher-access-token', '데이터 요청에 로그인한 교사의 JWT를 붙임');
  check(storageCall.options.headers.Authorization === 'Bearer teacher-access-token', '비공개 자료 요청에도 교사의 JWT를 붙임');
  check(dataCall.options.headers.apikey.startsWith('sb_publishable_'), '브라우저용 publishable 키만 사용함');

  console.log('\n' + count + '건 중 ' + (count - failed) + '건 통과');
  if (failed) process.exit(1);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
