// 허브 H WORK 메뉴 — 선생님 카드 (2026-11-21). NODE_PATH=$(npm root -g) node tools/hwork-menu-e2e.js
const { chromium } = require('playwright'); const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
let ok = 0, bad = 0; const t = (c, m) => { if (c) { ok++; } else { bad++; console.log('FAIL', m); } };
(async () => {
  const srv = http.createServer((q, r) => { const p = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); fs.readFile(p, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'Content-Type': p.endsWith('.js') ? 'text/javascript' : 'text/html; charset=utf-8' }); r.end(d); } }); }).listen(0);
  const base = 'http://127.0.0.1:' + srv.address().port;
  const br = await chromium.launch();
  async function open(profile, qs) {
    const pg = await br.newPage();
    await pg.route('**/assets/teacher-auth.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.TeacherAuth={config:{url:'https://sb.test'},ready:Promise.resolve({profile:${JSON.stringify(profile)}})};` }));
    await pg.route('https://sb.test/**', r => { const u = r.request().url();
      if (u.includes('hwork_homeworks')) return r.fulfill({ json: [{ teacher: '이수경' }, { teacher: '이수경' }, { teacher: '김현지' }] });
      if (u.includes('hwork_submissions')) return r.fulfill({ json: [{ teacher: '이수경' }] });
      if (u.includes('msg_members')) return r.fulfill({ json: [{ name: '이수경', role: 'admin' }, { name: '김현지', role: 'teacher' }, { name: '이은지', role: 'teacher' }, { name: '고희주', role: 'assistant' }] });
      r.fulfill({ json: [] }); });
    await pg.goto(base + '/hwork.html' + (qs || '')); await pg.waitForTimeout(400); return pg;
  }
  // 원장님 — 모든 선생님(조교 제외), 나 먼저
  let pg = await open({ display_name: '이수경', role: 'admin', login_id: 'lee' });
  let names = await pg.$$eval('#tcards [data-t]', a => a.map(x => x.dataset.t));
  t(JSON.stringify(names) === JSON.stringify(['이수경', '김현지', '이은지']), '원장님 카드 ' + names);
  t(await pg.isHidden('#menu'), '처음엔 메뉴 숨김');
  t((await pg.textContent('#tcards')).includes('출제한 과제 2개 · 제출 1건'), '수');
  await pg.click('[data-t="김현지"]');
  t(pg.url().endsWith('?t=' + encodeURIComponent('김현지')), '주소 ?t=');
  t(await pg.isVisible('#menu'), '메뉴 보임');
  const hrefs = await pg.$$eval('a.hwgo', a => a.map(x => x.href));
  t(hrefs.length === 5 && hrefs.every(h => h.includes('t=' + encodeURIComponent('김현지'))), '링크 t ' + hrefs[0]);
  t((await pg.textContent('#who')).includes('김현지 선생님의 H WORK') && (await pg.textContent('#who')).includes('다른 선생님'), '머리');
  await pg.goBack(); await pg.waitForTimeout(200);
  t(await pg.isVisible('#picker'), '뒤로 가기 = 카드');
  await pg.close();
  // 대표님(parkeh, 선생님 역할)도 모두
  pg = await open({ display_name: '박언호대표님', role: 'teacher', login_id: 'parkeh' });
  names = await pg.$$eval('#tcards [data-t]', a => a.map(x => x.dataset.t));
  t(names.length === 4 && names[0] === '박언호대표님', '대표님 ' + names);
  await pg.close();
  // 선생님 — 본인 카드만, 남의 ?t= 는 본인으로
  pg = await open({ display_name: '김현지', role: 'teacher', login_id: 'kim' });
  names = await pg.$$eval('#tcards [data-t]', a => a.map(x => x.dataset.t));
  t(JSON.stringify(names) === '["김현지"]', '선생님 ' + names);
  await pg.close();
  pg = await open({ display_name: '김현지', role: 'teacher', login_id: 'kim' }, '?t=' + encodeURIComponent('이수경'));
  t((await pg.textContent('#who')).includes('김현지 선생님의 H WORK') && !(await pg.textContent('#who')).includes('다른 선생님'), '남의 t 막음');
  const h0 = await pg.$eval('a.hwgo', a => a.href); t(h0.includes(encodeURIComponent('김현지')), '링크 본인');
  await pg.setViewportSize({ width: 390, height: 800 });
  t(await pg.evaluate(() => document.documentElement.scrollWidth <= 390), '휴대폰 넘침 없음');
  await pg.close();
  await br.close(); srv.close();
  console.log('ok', ok, 'bad', bad); process.exit(bad ? 1 : 0);
})();
