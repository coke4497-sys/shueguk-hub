/* 알림톡 보내기(alimtalk.html) 브라우저 E2E (2026-09-29)
 * 가짜 수파베이스·가짜 리포트 백엔드로 실제 페이지를 띄워
 *   설정 상태·종류 드롭다운(준비 전 잠금) · 반/학년/개인 고르기 · 받는 분 체크 · 연락처/접근코드 없는 학생 안내 ·
 *   동명이인·미등록 안내 · 미리보기 · 확인 창 뒤 alimSend 본문(받는 분마다 한 건, 중복 키 N:날짜|제목, 50건씩) · 결과 · 최근 기록
 * 을 검사한다. 원격에는 아무것도 보내지 않는다.
 *   실행: NODE_PATH=$(npm root -g) node tools/alimtalk-e2e-test.js
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const PORT = 8943;
const SB = 'https://bangdbhqpphqqdwcledg.supabase.co';
let n = 0, bad = 0;
function ok(cond, label){ n++; if (!cond){ bad++; console.error('  ✗', label); } else console.log('  ✓', label); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

const STUDENTS = [
  { id: 1, name: '김철수', school: '화정고', grade: '2026 고등 1학년', code: 'tok-kim', enrolled: '재원', phone_student: '010-1111-0001', phone_parent1: '01022220001', phone_parent2: '' },
  { id: 2, name: '박민수', school: '화정고', grade: '2026 고등 1학년', code: 'tok-park', enrolled: '재원', phone_student: '', phone_parent1: '01022220002', phone_parent2: '01033330002' },
  { id: 3, name: '한동명', school: '화정고', grade: '2026 고등 1학년', code: 'tok-h1', enrolled: '재원', phone_student: '01011110003', phone_parent1: '', phone_parent2: '' },
  { id: 4, name: '한동명', school: '능곡고', grade: '2026 고등 1학년', code: 'tok-h2', enrolled: '재원', phone_student: '01011110004', phone_parent1: '', phone_parent2: '' },
  { id: 5, name: '코드없음', school: '화정고', grade: '2026 고등 1학년', code: '', enrolled: '재원', phone_student: '01011110005', phone_parent1: '', phone_parent2: '' },
  { id: 6, name: '번호없음', school: '화정고', grade: '2026 고등 1학년', code: 'tok-none', enrolled: '재원', phone_student: '', phone_parent1: '', phone_parent2: '' },
  { id: 7, name: '퇴원생', school: '화정고', grade: '2026 고등 1학년', code: 'tok-out', enrolled: '퇴원', phone_student: '01011110007', phone_parent1: '', phone_parent2: '' },
  { id: 8, name: '이중등', school: '화수중', grade: '2026 중등 2학년', code: 'tok-mid', enrolled: '재원', phone_student: '01011110008', phone_parent1: '01022220008', phone_parent2: '' },
];
for (let i = 0; i < 60; i++) STUDENTS.push({ id: 100 + i, name: '고이' + i, school: '능곡고', grade: '2026 고등 2학년', code: 'c' + i, enrolled: '재원', phone_student: '0104444' + String(1000 + i), phone_parent1: '', phone_parent2: '' });
const CLASSES = [
  { book: '정규', class_id: 'r001', day: '금', start_time: '5:30', teacher: '슈', name: '고1 가', roster: '김철수 박민수(8/30부터) 한동명 (화정)새친구 코드없음 번호없음' },
  { book: '정규', class_id: 'w260912a', day: '토', start_time: '9:30', teacher: '슈', name: '이 주만', roster: '유령' },
];
const tpl = (label, ready) => ({ label, notice: true, ready, vars: ['학생명', '제목', '접근코드'],
  text: '[이수경국어학원] ' + label + '\n#{학생명} 학생에게 ' + label + '가 도착했어요.\n\n▶ #{제목}\n\n학생 페이지에서 내용을 확인해 주세요.',
  buttons: [{ name: '학생 페이지 링크', type: 'WL' }] });
const CFG = { result: 'success', ready: true, smsFallback: true, templates: {
  absent: { label: '결석 안내', ready: true, text: '', vars: [] },
  notice_sched: tpl('수업 일정 안내', true), notice_mock: tpl('주말 실전 모의고사 신청 안내', false) } };
const sends = [], getsCalled = [];
let LOG = [{ ts: '2026-09-28 18:00', kind: 'notice_sched', student: '김철수', who: '학부모1', to: '01022220001', cls: '공지', date: 'N:2026-09-28|지난 안내', ok: true, message: '' }];

function applyFilter(rows, url){
  const u = new URL(url);
  u.searchParams.forEach((v, k) => {
    if (['select', 'order', 'limit', 'offset'].includes(k)) return;
    const m = v.match(/^(eq|not\.like)\.(.*)$/); if (!m) return;
    if (m[1] === 'eq') rows = rows.filter(r => String(r[k]) === m[2]);
    else rows = rows.filter(r => !String(r[k]).startsWith(m[2].replace('*', '')));
  });
  return rows;
}

(async () => {
  const server = http.createServer((req, res) => {
    const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()){ res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': f.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/javascript' }); res.end(fs.readFileSync(f));
  }).listen(PORT);
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 } });
  await ctx.addInitScript(() => localStorage.setItem('shueguk_teacher_session_v2', JSON.stringify({
    access_token: 'tok', refresh_token: 'refresh-tok', expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: '11111111-1111-1111-1111-111111111111' } })));
  ctx.setDefaultTimeout(8000);
  let confirmMsg = '';
  ctx.on('dialog', d => { confirmMsg = d.message(); d.accept(); });
  await ctx.route('**/*', async route => {
    const req = route.request(), url = req.url();
    const json = (obj, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }, body: obj === null ? '' : JSON.stringify(obj) });
    if (req.method() === 'OPTIONS') return json(null, 204);
    if (url.includes('fonts.g')) return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
    if (url.startsWith(SB)){
      const p = url.slice(SB.length), auth = req.headers()['authorization'] || '';
      if (p.startsWith('/auth/v1/token')) return json({ access_token: 'tok', refresh_token: 'refresh-tok', expires_in: 3600, user: { id: '1' } });
      if (p.startsWith('/rest/v1/teacher_accounts')) return json([{ user_id: '11111111-1111-1111-1111-111111111111', login_id: 't', display_name: '테스트', active: true }]);
      if (auth !== 'Bearer tok') return json({ error: 'need teacher' }, 401);
      const tbl = p.slice(9).split('?')[0], M = { students: STUDENTS, tt_classes: CLASSES };
      if (!M[tbl]) return json({ error: 'unhandled' }, 404);
      const off = +(new URL(url).searchParams.get('offset') || 0);
      return json(off ? [] : applyFilter(M[tbl], url));
    }
    if (url.includes('script.google.com')){
      if (req.method() === 'POST'){
        const b = JSON.parse(req.postData());
        if (b.action === 'alimSend'){
          sends.push(b);
          const sent = b.items.map(it => ({ student: it.student, who: it.who, ok: it.to !== '01011110004', dup: it.student === '고이0', message: it.to === '01011110004' ? '수신 불가' : '보냈어요' }));
          sent.forEach((x, i) => { if (x.ok && !x.dup) LOG.unshift({ ts: '2026-09-29 10:0' + (i % 10), kind: b.kind, student: x.student, who: x.who, to: b.items[i].to, cls: '공지', date: b.items[i].date, ok: true, message: '' }); });
          return json({ result: 'success', sent, okCount: sent.filter(x => x.ok && !x.dup).length, failCount: sent.filter(x => !x.ok).length });
        }
        return json({ result: 'error' });
      }
      const u = new URL(url); getsCalled.push(u.searchParams.get('action') + '|' + (u.searchParams.get('to') || ''));
      if (u.searchParams.get('action') === 'alimConfig') return json(CFG);
      if (u.searchParams.get('action') === 'alimLog') return json({ result: 'success', rows: LOG });
      return json({ result: 'error' });
    }
    return route.continue();
  });

  const pg = await ctx.newPage();
  pg.on('pageerror', e => { bad++; console.error('  ✗ pageerror', e.message); });
  await pg.goto(`http://localhost:${PORT}/alimtalk.html`);
  await pg.waitForFunction(() => document.querySelectorAll('#clsSel option[value*="|"]').length > 0 && /보낼 수 있는/.test(document.getElementById('cfgState').textContent));

  console.log('① 설정·종류');
  const opts = await pg.$$eval('#kindSel option', els => els.map(o => o.value + ':' + o.textContent + ':' + o.disabled));
  ok(opts.join('|') === 'notice_sched:수업 일정 안내:false|notice_mock:주말 실전 모의고사 신청 안내 (준비 전):true', '공지 종류만(결석 제외), 준비 전은 잠금 — ' + opts.join('|'));
  ok(await pg.inputValue('#kindSel') === 'notice_sched', '기본 = 준비된 첫 종류');
  ok(/1개 \/ 2개/.test(await pg.textContent('#cfgState')), '상태 줄에 보낼 수 있는 종류 수');
  ok(!(await pg.$$eval('#clsSel option', els => els.map(o => o.value))).some(v => v.includes('w260912a')), "'이 주만' 반은 목록에 없음");
  ok((await pg.$$eval('.who', els => els.map(e => e.checked))).every(Boolean), '받는 분 학생·학부모1·학부모2 기본 체크');
  await pg.waitForSelector('.log-row');
  ok(/지난 안내/.test(await pg.textContent('#log')) && /수업 일정 안내/.test(await pg.textContent('#log')), '최근 기록 — 종류 이름·제목으로 묶음');
  ok(getsCalled.some(x => x === 'alimLog|'), '기록 조회에 to를 넘기지 않음(공지 키가 걸러지지 않게)');

  console.log('② 반으로 고르기');
  ok(await pg.isDisabled('#goBtn'), '아무것도 안 고르면 보내기 잠김');
  await pg.selectOption('#clsSel', '정규|r001');
  await pg.fill('#title', '10월 일정 안내');
  let sum = await pg.textContent('#sum');
  ok(/학생 2명/.test(sum) && /4건/.test(sum), '반 명단 → 연락처 있는 2명 · 받는 분 합 4건 (' + sum.slice(0, 50) + ')');
  ok(/연락처가 없는 학생 1명: 번호없음/.test(sum), '번호 없는 학생 안내');
  ok(/접근코드\)가 없는 학생 1명: 코드없음/.test(sum), '접근코드 없는 학생 안내');
  ok(/재원 명단에 없는 이름 1명: 새친구/.test(sum) && /동명이인이라 못 가린 이름 1명: 한동명/.test(sum), '미등록·동명이인 안내');
  const prev = await pg.textContent('#prev');
  ok(/김철수 학생에게 수업 일정 안내가 도착했어요/.test(prev) && /▶ 10월 일정 안내/.test(prev) && /학생 페이지 링크/.test(prev), '미리보기 = 학생명·제목·버튼');
  await pg.uncheck('.who[value="학부모2"]');
  ok(/3건/.test(await pg.textContent('#sum')), '학부모2를 빼면 3건');
  await pg.check('.who[value="학부모2"]');
  await pg.fill('#title', '');
  ok(await pg.isDisabled('#goBtn') && /제목을 넣어/.test(await pg.textContent('#goNote')), '제목이 없으면 잠김');
  await pg.fill('#title', '10월 일정 안내');
  ok(!(await pg.isDisabled('#goBtn')), '제목·대상이 있으면 열림');

  console.log('③ 보내기');
  await pg.click('#goBtn');
  await pg.waitForFunction(() => /보냈습니다/.test(document.getElementById('result').textContent));
  ok(/학생 2명에게 4건/.test(confirmMsg) && /10월 일정 안내/.test(confirmMsg), '확인 창에 인원·건수·제목');
  ok(sends.length === 1 && sends[0].kind === 'notice_sched', 'alimSend 1번 · 고른 종류');
  const its = sends[0].items;
  ok(its.map(x => x.student + ':' + x.who + ':' + x.to).join(',') === '김철수:학생:01011110001,김철수:학부모1:01022220001,박민수:학부모1:01022220002,박민수:학부모2:01033330002',
     '받는 분마다 한 건 · 번호 숫자만 — ' + its.map(x => x.student + ':' + x.who).join(','));
  ok(/^N:\d{4}-\d{2}-\d{2}\|10월 일정 안내$/.test(its[0].date) && its[0].cls === '공지', '중복 키 = N:오늘|제목 (공지 화면과 같음)');
  ok(its[0].vars['학생명'] === '김철수' && its[0].vars['제목'] === '10월 일정 안내' && its[0].vars['접근코드'] === 'tok-kim', '변수 학생명·제목·접근코드');
  ok(sends[0].pw === 'sh', '백엔드 교사용 값 동봉');
  await pg.waitForFunction(() => /10월 일정 안내/.test(document.getElementById('log').textContent));
  ok(true, '보낸 뒤 최근 기록 새로고침');

  console.log('④ 학년 · 50건 나누기 · 실패/중복 안내');
  sends.length = 0;
  await pg.click('#modeSeg [data-m="grade"]');
  await pg.click('#gradePills [data-g="고2"]');
  await pg.fill('#title', '고2 안내');
  ok(/학생 60명/.test(await pg.textContent('#sum')) && /50건씩/.test(await pg.textContent('#sum')), '고2 60명 · 50건씩 나눔 안내');
  await pg.click('#goBtn');
  for (let i = 0; i < 50 && !(sends.length === 2 && /고2|건너뛰/.test(await pg.textContent('#result'))); i++) await sleep(100);
  await sleep(200);
  ok(sends.length === 2 && sends[0].items.length === 50 && sends[1].items.length === 10, 'alimSend 2번(50·10건)');
  ok(/이미 받은 1건은 건너뛰었어요/.test(await pg.textContent('#result')), '중복 건 안내');

  console.log('⑤ 개인 · 동명이인 구분');
  sends.length = 0;
  await pg.click('#modeSeg [data-m="stu"]');
  await pg.fill('#stuQ', '한동명');
  await pg.press('#stuQ', 'Enter');
  ok((await pg.$$('#chips .fchip')).length === 0, '이름만으로는 동명이인이 담기지 않음');
  await pg.fill('#stuQ', '한동명 · 능곡고 고1');
  await pg.press('#stuQ', 'Enter');
  await pg.fill('#title', '개별 안내');
  ok(/학생 1명/.test(await pg.textContent('#sum')), '학교까지 고르면 담김');
  await pg.click('#goBtn');
  await pg.waitForFunction(() => /실패/.test(document.getElementById('result').textContent));
  ok(sends[0].items.length === 1 && sends[0].items[0].to === '01011110004', '능곡고 한동명 번호로');
  ok(/한동명 학생 \(수신 불가\)/.test(await pg.textContent('#result')), '실패 사유 안내');
  ok(!/퇴원생/.test(await pg.$eval('#stuList', e => e.innerHTML)), '퇴원생은 목록에 없음');

  console.log('⑦ 모의고사 — 신청일 칸 (2026-09-29)');
  sends.length = 0;
  await pg.setViewportSize({ width: 1100, height: 900 });
  CFG.templates.notice_mock = Object.assign(tpl('주말 실전 모의고사 신청 안내', true), { vars: ['학생명', '제목', '장소', '신청일', '정원', '접근코드'],
    text: '[이수경국어학원] 주말 실전 모의고사 신청 안내\n#{학생명} 학생에게 주말 실전 모의고사 신청 안내가 도착했어요.\n\n▶ #{제목}\n\n1. #{장소}에서 실시합니다.\n3. #{신청일} 중 택1하여 신청합니다.\n4. 각 요일 #{정원}명 선착순으로 마감합니다.' });
  await pg.reload();
  await pg.waitForFunction(() => document.querySelectorAll('#clsSel option[value*="|"]').length > 0 && /보낼 수 있는/.test(document.getElementById('cfgState').textContent));
  ok((await pg.$$('.xvar')).length === 0, '추가 변수 없는 종류는 칸 없음');
  await pg.selectOption('#kindSel', 'notice_mock');
  ok((await pg.$$eval('.xvar', els => els.map(e => e.dataset.var + '=' + e.value))).join() === '장소=대감빌딩 5층 이수경 국어 본원,신청일=,정원=35', '모의고사를 고르면 장소(기본값)·신청일 칸');
  await pg.selectOption('#clsSel', '정규|r001');
  await pg.fill('#title', '2027학년도 수능대비 실전 모의고사');
  ok(await pg.isDisabled('#goBtn') && /신청일을\(를\) 넣어/.test(await pg.textContent('#goNote')), '신청일이 비면 잠김');
  await pg.fill('.xvar[data-var="장소"]', '화정센터');
  await pg.fill('.xvar[data-var="신청일"]', '3/14(토), 3/15(일)');
  await pg.fill('.xvar[data-var="정원"]', '30');
  ok(!(await pg.isDisabled('#goBtn')) && /3\/14\(토\), 3\/15\(일\) 중 택1/.test(await pg.textContent('#prev')) && /1\. 화정센터에서 실시합니다/.test(await pg.textContent('#prev')) && /각 요일 30명 선착순/.test(await pg.textContent('#prev')), '채우면 미리보기에 들어가고 열림');
  await pg.click('#goBtn');
  await pg.waitForFunction(() => /보냈습니다/.test(document.getElementById('result').textContent));
  ok(sends.length === 1 && sends[0].kind === 'notice_mock' && sends[0].items.every(x => x.vars['신청일'] === '3/14(토), 3/15(일)' && x.vars['장소'] === '화정센터' && x.vars['정원'] === '30' && x.vars['제목'] === '2027학년도 수능대비 실전 모의고사'), '보낸 변수에 신청일');

  console.log('⑥ 휴대폰 폭');
  await pg.setViewportSize({ width: 390, height: 800 });
  ok(await pg.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), '가로 스크롤 없음');

  await browser.close(); server.close();
  console.log(bad ? `\n${bad}건 실패 / ${n}건` : `\n✓ ${n}건 모두 통과`);
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
