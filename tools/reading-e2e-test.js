// Shuefit 독서(shufit_reading.html) 브라우저 검사 — 가짜 수파베이스(학원 자료 없음).
// NODE_PATH=$(npm root -g) LC_ALL=C.UTF-8 node tools/reading-e2e-test.js
const { chromium } = require('playwright');
const path = require('path');
const PAGE = 'file://' + path.resolve(__dirname, '..', 'shufit_reading.html');
let ok = 0, bad = 0;
function t(name, cond, extra) { if (cond) { ok++; } else { bad++; console.log('  실패:', name, extra === undefined ? '' : extra); } }

const PIX = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const P = [
  { id: '2306고2-가상시장', title: '가상 시장 이야기', src: '2306고2', srcname: '2023학년도 6월 고2', kind: '교육청', area: '사회', grade: '고2', ord: 0,
    plain: '가상 시장 이야기 시장에는 가격이 있다. 한계비용을 생각한다.',
    data: { passage: { blocks: [{ label: '(가)' }, { p: '시장에는 <u>가격</u>이 있다.' }, { p: '한계비용을 생각한다.', bracket: '[A]' }], vocab: ['1) 가격: 값.'] },
            notes: [{ p: '(가)' }, { p: '[1문단] 시장과 가격' }, { p: '1) 가격의 뜻:' }, { p: '① 값' }, { p: '문단 요약: 시장에는 가격이 있음' }, { p: '쉽게 요약: 값이 있어.' }],
            blanks: { lines: [{ p: '[1문단] 시장' }, { p: '① 시장에는 ( 1      )이 있다.' }], answers: { '1': '가격' } }, levels: ['기본', '실력'] },
    imgs: { 'g.png': PIX } },
  { id: '2103고2-가상진화', title: '가상 진화 이야기', src: '2103고2', srcname: '2021학년도 3월 고2', kind: '교육청', area: '인문', grade: '고2', ord: 0,
    plain: '가상 진화 이야기 진화는 천천히 일어난다.',
    data: { passage: { blocks: [{ p: '진화는 천천히 일어난다.' }] }, notes: [], blanks: { lines: [], answers: {} }, levels: ['기본'] }, imgs: {} },
  { id: '교과서-가상교과서-5-1-1', title: '가상 교과서 글', src: '가상교과서5-(1)-1', srcname: '가상 교과서 5-(1)-1', kind: '교과서', area: '', grade: '', ord: 0,
    plain: '가상 교과서 글 건축물은 문화를 담는다.',
    data: { passage: { blocks: [{ p: '건축물은 문화를 담는다.' }, { p: '소제목', sub: 1 }, { tbl: [['木', '本'], ['나무 목', '근본 본']] }, { p: '그림 설명', cap: 1 }, { p: '- 작가, &lt;가상 글&gt;', src: 1 }] },
            notes: [{ p: '[1문단] 건축물' }], analysis: [{ p: '1. 기본정보' }], keys: [{ p: '[맞는 선택지와 근거 모음]' }],
            blanks: { lines: [{ p: '① 건축물은 ( 1      )를 담는다.' }], answers: { '1': '문화' } }, book: '가상 교과서', unit: '5-(1)-1', author: '작가', levels: ['교과서'] }, imgs: {} },
];
const ch = (stem, ans, extra) => Object.assign({ stem, opts: ['가', '나', '다', '라', '마'], ans, expl: '해설입니다.' }, extra || {});
const I = [
  { passage_id: P[0].id, level: '공통', code: '00', sec_name: '원 기출', v: 1, ord: 1, kind: 'choice', data: ch('윗글에 대한 설명으로 적절한 것은?', '②', { src: '2306고2' }), plain: '윗글 한계비용' },
  { passage_id: P[0].id, level: '공통', code: '00', sec_name: '원 기출', v: 1, ord: 2, kind: 'choice',
    data: { stem: 'Ⓐ~Ⓑ에 들어갈 말은?', box: [{ p: '가격은 ( Ⓐ ) ( Ⓑ ).' }], grid: { head: ['Ⓐ', 'Ⓑ'], rows: [['높게', '증가'], ['높게', '감소'], ['낮게', '증가'], ['낮게', '감소'], ['같게', '유지']] }, opts: ['높게 · 증가', '높게 · 감소', '낮게 · 증가', '낮게 · 감소', '같게 · 유지'], ans: '①', expl: '표' }, plain: '' },
  { passage_id: P[0].id, level: '기본', code: '02', sec_name: 'OX', v: 1, ord: 1, kind: 'ox', data: { stem: '시장에는 가격이 있다.', ans: 'O', expl: '맞다' }, plain: '시장에는 가격이 있다' },
  { passage_id: P[0].id, level: '기본', code: '02', sec_name: 'OX', v: 2, ord: 1, kind: 'ox', data: { stem: '한계비용은 없다.', ans: 'X', expl: '틀리다' }, plain: '한계비용은 없다' },
  { passage_id: P[0].id, level: '기본', code: '03', sec_name: '표현법+내용확인', v: 1, ord: 1, kind: 'choice', data: ch('윗글의 서술 방식은?', '③'), plain: '' },
  { passage_id: P[0].id, level: '기본', code: '04', sec_name: '내용불일치', v: 1, ord: 1, kind: 'choice', data: ch('윗글과 일치하지 않는 것은?', '④'), plain: '' },
  { passage_id: P[0].id, level: '기본', code: '05', sec_name: '고난도 수능형', v: 1, ord: 1, kind: 'choice', data: ch('고난도 문항?', '⑤'), plain: '' },
  { passage_id: P[0].id, level: '기본', code: '06', sec_name: '보기형', v: 1, ord: 1, kind: 'choice', data: ch('<보기>를 이해한 것은?', '①', { box: [{ p: '보기 글' }] }), plain: '' },
  { passage_id: P[0].id, level: '기본', code: '07', sec_name: '주관식키워드빈칸', v: 1, ord: 1, kind: 'blank', data: { stem: '설명하시오.', model: '시장에는 (          )이 있다.', ans: '가격', expl: '' }, plain: '' },
  { passage_id: P[0].id, level: '기본', code: '07_2', sec_name: '주관식 내신형', v: 1, ord: 1, kind: 'essay', data: { stem: '서술하시오.', cond: [{ p: '답안 형식: ~' }], ans: '모범 답안', expl: '' }, plain: '' },
  { passage_id: P[0].id, level: '기본', code: '08', sec_name: '다지선다', v: 1, ord: 1, kind: 'multi', data: { stem: '옳은 것만 고른 것은?', opts: ['a', 'b', 'c', 'd', 'e', 'f'], ans: '①, ⑥', expl: '' }, plain: '' },
  { passage_id: P[0].id, level: '기본', code: '09', sec_name: '그림자료 5지선다', v: 1, ord: 1, kind: 'choice', data: ch('[자료 1]을 이해한 것은?', '②', { box: [{ img: 'g.png' }, { p: '[자료 1]' }] }), plain: '' },
  { passage_id: P[0].id, level: '기본', code: '99', sec_name: '독립 밑줄 고난도수능형', v: 1, ord: 1, kind: 'choice', data: ch('㉠의 기능은?', '③', { passage: { blocks: [{ p: '독립 지문 글' }] } }), plain: '' },
  { passage_id: P[0].id, level: '실력', code: '02', sec_name: 'OX', v: 1, ord: 1, kind: 'ox', data: { stem: '실력 OX 문항', ans: 'O', expl: '' }, plain: '' },
  { passage_id: P[1].id, level: '공통', code: '00', sec_name: '원 기출', v: 1, ord: 1, kind: 'choice', data: ch('진화 문항?', '①'), plain: '진화' },
  { passage_id: P[2].id, level: '교과서', code: '11', sec_name: 'OX 쉬움', v: 1, ord: 1, kind: 'ox', data: { stem: '건축물은 문화를 담는다.', ans: 'O', expl: '맞다' }, plain: '' },
  { passage_id: P[2].id, level: '교과서', code: '12', sec_name: 'OX 어려움', v: 1, ord: 1, kind: 'ox', data: { stem: '건축물은 문화와 무관하다.', ans: 'X', expl: '틀리다' }, plain: '' },
  { passage_id: P[2].id, level: '교과서', code: '13', sec_name: '모의고사형', v: 1, ord: 1, kind: 'choice', data: ch('교과서 모의고사형?', '②'), plain: '' },
  { passage_id: P[2].id, level: '교과서', code: '13', sec_name: '모의고사형', v: 1, ord: 2, kind: 'choice', data: ch('교과서 모의고사형 둘?', '③'), plain: '' },
  { passage_id: P[2].id, level: '교과서', code: '15', sec_name: '고난도 보기형', v: 1, ord: 1, kind: 'choice', data: ch('교과서 고난도?', '④'), plain: '' },
  { passage_id: P[2].id, level: '교과서', code: '16', sec_name: '1등급 보기형', v: 1, ord: 1, kind: 'choice', data: ch('교과서 1등급?', '⑤'), plain: '' },
  { passage_id: P[2].id, level: '교과서', code: '19', sec_name: '키워드 빈칸', v: 1, ord: 1, kind: 'blank', data: { stem: '서술하시오.', model: '건축물은 (     )를 담는다.', ans: '문화', expl: '' }, plain: '' },
];
I.forEach((x, i) => { x.id = 1000 + i; });
// 문학(084 — 같은 표, subject '문학') — 지문 하나에 두 작품
P.push({ id: '2409고3-가상문학', subject: '문학', title: '가상 시 모음', src: '2409고3', srcname: '2024학년도 9월 고3', kind: '평가원', area: '현대시', grade: '고3', ord: 0,
  plain: '가상 시 모음 별을 노래하는 마음',
  data: { passage: { blocks: [{ label: '(가)' }, { p: '별을 노래하는 마음으로' }, { label: '(나)' }, { p: '강물은 흘러간다' }] },
          works: [{ title: '가상 시 하나', author: '시인 갑', genre: '현대시' }, { title: '가상 시 둘', author: '시인 을', genre: '현대시' }],
          notes: [{ p: '[작품 1] 가상 시 하나' }, { p: '주제: 별' }], blanks: { lines: [{ p: '① 화자는 ( 1      )을 노래한다.' }], answers: { '1': '별' } }, levels: ['기본'] }, imgs: {} });
// 국어공방 '시 문제 풀이' 짜임(11~19) + 내신 기출(30 — 문항마다 묶음 지문, 086)
const GP1 = { blocks: [{ label: '(가)' }, { p: '별을 노래하는<br>마음으로' }, { p: '- 시인 갑, 「가상 시 하나」', src: 1 }, { label: '(나)' }, { p: '다른 시 한 행' }], works: [{ title: '가상 시 하나', author: '시인 갑' }, { title: '다른 시', author: '시인 병' }] };
const GP2 = { blocks: [{ p: '별을 노래하는<br>마음으로' }], works: [{ title: '가상 시 하나', author: '시인 갑' }] };
[{ level: '교과서', code: '11', sec_name: 'OX 쉬움', kind: 'ox', data: { stem: '(가)는 별을 노래한다.', ans: 'O', expl: '' } },
 { level: '교과서', code: '15', sec_name: '고난도 보기형', kind: 'choice', data: ch('고난도 문학 문항?', '④') },
 { level: '교과서', code: '30', sec_name: '내신 기출', kind: 'choice', data: Object.assign(ch('기출 1번?', '③'), { passage: GP1 }) },
 { level: '교과서', code: '30', sec_name: '내신 기출', kind: 'choice', data: Object.assign(ch('기출 2번?', '②'), { passage: GP1 }), ord: 2 },
 { level: '교과서', code: '30', sec_name: '내신 기출', kind: 'choice', data: Object.assign(ch('기출 3번?', '①'), { passage: GP2 }), ord: 3 },
 { level: '교과서', code: '31', sec_name: '시어 의미', kind: 'choice', data: ch('시어의 의미는?', '①') }]
  .forEach((x, i) => I.push(Object.assign({ passage_id: '2409고3-가상문학', v: 1, ord: 1, plain: '', id: 2000 + i }, x)));
// 검수 중인 작품(086) — 원장님(admin)에게만 보인다
P.push({ id: '문학-검수중', subject: '문학', review: '검수 중', uploaded_by: '김선생', title: '검수 중 시', src: '26EBS', srcname: '2026 수능특강 문학 1', kind: 'EBS', area: '현대시', grade: '', ord: 0, plain: '',
  data: { passage: { blocks: [{ p: '검수 중 시 한 행' }] }, notes: [], blanks: null, levels: ['교과서'] }, imgs: {} });
I.push({ passage_id: '문학-검수중', level: '교과서', code: '11', sec_name: 'OX 쉬움', v: 1, ord: 1, kind: 'ox', data: { stem: '검수 OX', ans: 'X', expl: '' }, plain: '', id: 2100 });
const PAPERS = [{ id: 1, teacher: '이선생', title: '지난 문제지', ids: [1014, 1002, 1012], seq: [1014, 'm:2306고2-가상시장:notes', 1002, 1012], print_date: '2026-12-01', school: '화정고', updated_at: '2026-11-18' }];

(async () => {
  const b = await chromium.launch();
  const pg = await b.newPage({ viewport: { width: 1280, height: 1000 } });
  await pg.addInitScript(() => { try { localStorage.setItem('shueguk_teacher_session_v2', JSON.stringify({ access_token: 'tok', refresh_token: 'R', expires_at: Math.floor(Date.now() / 1000) + 3600 })); } catch (e) {} });   // 허브 개인 로그인(2026-11-22 공용 교사 계정 폐지)
  // 두 화면(문제지 만들기 / 내 문제지함, 2026-11-19) — 누르기 전에 그 칸이 있는 화면·탭을 연다(사람은 탭을 눌러 간다)
  for (const m of ['click', 'fill', 'check', 'uncheck', 'selectOption']) { const o = pg[m].bind(pg); pg[m] = async (sel, ...a) => { await pg.evaluate(s => window.__sfReveal && window.__sfReveal(s), sel).catch(() => {}); return o(sel, ...a); }; }
  const errs = [], reqs = [], writes = [], gas = [];
  pg.on('pageerror', e => errs.push(e.message));
  await pg.route('**/*', async route => {
    const u = route.request().url();
    if (/\/auth\/v1\/token/.test(u)) return route.fulfill({ json: { access_token: 'tok', expires_in: 3600 } });
    if (/script\.google\.com/.test(u)) { gas.push(route.request().postData()); return route.fulfill({ json: { ok: true, result: 'success' } }); }
    if (/\/rest\/v1\//.test(u) && route.request().method() !== 'GET') {
      writes.push({ m: route.request().method(), u: decodeURIComponent(u), b: route.request().postData() });
      if (/shufit_reading_papers\?on_conflict/.test(u)) return route.fulfill({ status: 201, json: JSON.parse(route.request().postData()) });
      return route.fulfill({ status: 201, body: '' });
    }
    if (/\/rest\/v1\/shufit_reading_papers/.test(u)) return route.fulfill({ json: PAPERS });
    if (/\/rest\/v1\/reading_items\?select=id,passage_id/.test(u)) { const ids = (new URL(u).searchParams.get('id') || '').replace(/^in\.\(|\)$/g, '').split(',').map(Number); return route.fulfill({ json: I.filter(x => ids.includes(x.id)).map(x => ({ id: x.id, passage_id: x.passage_id })) }); }
    if (/\/rest\/v1\/students\?select=name/.test(u)) return route.fulfill({ json: [
      { name: '김가람', school: '화정고', grade: '2026 고등 2학년', enrolled: '재원' }, { name: '박나래', school: '화정고', grade: '2026 고등 2학년', enrolled: '재원' },
      { name: '박나래', school: '능곡고', grade: '2026 고등 2학년', enrolled: '재원' }, { name: '최다솜', school: '화정고', grade: '2026 고등 1학년', enrolled: '재원' }] });
    if (/\/rest\/v1\/tt_classes/.test(u)) return route.fulfill({ json: [
      { class_id: 'n009', name: '고2 화정A(비상 화언)', day: '수', start_time: '5:30', teacher: '주혜', roster: '김가람 (화정)박나래 최다솜' },
      { class_id: 'n017', name: '고2 확인', day: '토', start_time: '2:00', teacher: '현정', roster: '김가람' }] });
    if (/\/rest\/v1\/assignments/.test(u)) return route.fulfill({ json: [] });
    if (/\/rest\/v1\/(hwork_homeworks|students|hwork_submissions)/.test(u)) return route.fulfill({ json: /hwork_homeworks/.test(u) ? [{ teacher: '김선생', code: 'Shuefit 독서: 가상 시장 이야기 · 01 원 기출 (2)', data: { items: {} } }] : [] });
    if (/\/rest\/v1\//.test(u)) {
      reqs.push({ u: decodeURIComponent(u), auth: route.request().headers()['authorization'] });
      const q = new URL(u); const sp = q.searchParams;
      const like = (sp.get('plain') || '').replace(/^ilike\.\*|\*$/g, '');
      if (q.pathname.endsWith('/reading_passages')) {
        let rows = P;
        if (sp.get('subject')) rows = rows.filter(p => (p.subject || '독서') === sp.get('subject').replace(/^eq\./, ''));
        if (sp.get('id')) rows = rows.filter(p => p.id === sp.get('id').replace(/^eq\./, ''));
        if (like) rows = rows.filter(p => p.plain.includes(like));
        return route.fulfill({ json: rows });
      }
      if (q.pathname.endsWith('/reading_items')) {
        let rows = I;
        if (sp.get('passage_id')) rows = rows.filter(r => r.passage_id === sp.get('passage_id').replace(/^eq\./, ''));
        if (like) rows = rows.filter(r => r.plain.includes(like));
        return route.fulfill({ json: rows });
      }
      return route.fulfill({ status: 404, json: {} });
    }
    if (u.startsWith('file://')) return route.continue();
    return route.fulfill({ status: 200, body: '' });
  });
  await pg.goto(PAGE);
  await pg.waitForSelector('#res .rc');
  t('목록 카드 3개', (await pg.$$('#res .rc')).length === 3);
  t('교사 신분으로 읽음', reqs.every(r => r.auth === 'Bearer tok'));
  t('최근 출처 먼저(order=src.desc)', reqs.find(r => /reading_passages/.test(r.u)).u.includes('order=src.desc'));
  t('영역 알약', (await pg.$$eval('#areas .chip', a => a.map(x => x.innerText.replace(/\s+/g, '')))).join() === '전체영역3,인문1,사회1,교과서1');
  await pg.click('[data-area="인문"]');
  t('영역 거르기', (await pg.$$('#res .rc')).length === 1 && (await pg.textContent('#res')).includes('가상 진화'));
  await pg.click('[data-area=""]');
  t('작업 칸은 고르기 전 숨김', await pg.$eval('#work', e => e.hidden));

  await pg.fill('#q', '한계비용');
  await pg.waitForFunction(() => /한계비용/.test(document.querySelector('#pcnt').textContent));
  const cards = await pg.$$eval('#res .rc', a => a.map(x => x.innerText.replace(/\s+/g, ' ')));
  t('찾기 결과 1개', cards.length === 1, cards);
  t('찾기 카드 — 지문 1곳 · 문항 2개', /지문 1곳 · 문항 2개/.test(cards[0]), cards[0]);
  t('찾기 앞뒤 글에 형광펜', (await pg.$$('#res mark')).length >= 1);
  t('서버에서 ilike 로 찾음', reqs.some(r => r.u.includes('reading_items') && r.u.includes('plain=ilike.*한계비용*')));
  await pg.click('#res .rc');
  await pg.waitForSelector('#list .q');
  t('찾은 문항 칩이 켜짐', /한계비용/.test(await pg.textContent('#tchips .chip.on')));
  t('찾은 문항 1개(기본·실력 합침)', (await pg.$$('#list .q')).length === 1);
  t('지문·문항 형광펜', (await pg.$$('#pas mark')).length === 1 && (await pg.$$('#list mark')).length >= 1);
  t('지문 [A] 표시', (await pg.textContent('#pas .bm')) === '[A]');
  t('어휘 풀이', (await pg.textContent('#pas .voc')).includes('가격: 값.'));
  t('머리 숫자', (await pg.textContent('#tot')).includes('원 기출 2'));

  await pg.fill('#q', ''); await pg.waitForTimeout(500);
  t('지우면 찾은 문항 칩 사라짐', !(await pg.$('#tchips [data-t="hits"]')));
  await pg.click('#tchips [data-t="orig"]');
  t('원 기출 2문항 + 짝짓기 표', (await pg.$$('#list .q')).length === 2 && (await pg.$$('#list .gridt')).length === 1);
  t('정답·해설 접이식', (await pg.$$('#list details.ex')).length === 2);
  await pg.click('#tchips [data-t="02"]');
  t('OX 기본 v1·v2 + 실력 = v1~v3 한 목록', (await pg.$$('#list .q')).length === 3 && (await pg.$$eval('#list .tag.lav', a => a.map(x => x.textContent))).join() === 'v1,v2,v3');
  await pg.click('#tchips [data-t="09"]');
  t('그림자료 그림', (await pg.$$('#list img')).length === 1);
  await pg.click('#tchips [data-t="99"]');
  t('99 독립 지문으로 바뀜', (await pg.textContent('#pas')).includes('독립 지문 글'));
  await pg.click('#tchips [data-t="notes"]');
  t('핵심정리 요약 상자', (await pg.$$('#list .sum')).length === 1 && (await pg.$$('#list .easy')).length === 1);
  await pg.click('#tchips [data-t="10"]');
  t('요약 빈칸 번호(학생 화면은 답 없음)', (await pg.textContent('#list .blank')) === '1');
  t('난도 알약 없음·변형 문항 합계', (await pg.$$('[data-lv]')).length === 0 && /변형 문항 12/.test(await pg.textContent('#tot')), await pg.textContent('#tot'));

  // ── 3단계(2026-11-19): 학습 자료도 문제지에 담는다 · 묶음 담기 — 바로 인쇄·골라서 인쇄는 없어짐 ──
  t('바로 인쇄·골라서 인쇄 없음', !(await pg.$('#pchips')) && !(await pg.$('[data-pr="study"]')) && !(await pg.$('[data-pr="exam"]')));
  t('요약 빈칸 탭 — [+ 문제지에 담기]', /학습 자료예요/.test(await pg.textContent('#list .nqnote')) && /\+ 문제지에 담기/.test(await pg.textContent('#list [data-mat="10"]')));
  await pg.click('#list [data-mat="10"]');
  t('학습 자료 담기 — 개수·담음 표시·목록 줄', (await pg.textContent('#selN')) === '학습 자료 1' && /담음/.test(await pg.textContent('#list [data-mat="10"]')) && (await pg.$$('#sel .si.mat')).length === 1, await pg.textContent('#selN'));
  t('학습 자료만이면 H WORK·제목', await pg.$eval('#saveBtn', e => e.disabled) && /\(학습 자료\)$/.test(await pg.inputValue('#pTitle')), await pg.inputValue('#pTitle'));
  await pg.click('#list [data-mat="10"]');
  t('다시 누르면 빠짐', (await pg.textContent('#selN')) === '0문항');
  t('묶음 담기 안내', /학습자료 핵심정리 · OX · 표현법·내용확인 · 내용불일치 · 키워드 빈칸 · 핵심 요약 빈칸/.test(await pg.textContent('#bdlInfo')) && /시험지 원 기출 · 고난도 수능형 · 보기형 \(4문항\)/.test(await pg.textContent('#bdlInfo')), await pg.textContent('#bdlInfo'));
  await pg.click('[data-bundle="study"]');
  const sn = await pg.textContent('#selN');
  t('학습자료 묶음 담기 — 문항 + 학습 자료 2(핵심정리 맨 앞)', / · 학습 자료 2$/.test(sn) && (await pg.$$('#sel .si.mat')).length === 2 && /핵심정리/.test(await pg.$eval('#sel .si', e => e.textContent)), sn);
  await pg.evaluate(() => selDoc('study', true));
  const st = await pg.textContent('#print');
  t('학습지 교사용 — 지문·핵심정리·빈칸 답이 그 지문 뒤에', st.includes('시장에는') && st.includes('쉽게 요약') && /가격/.test(await pg.$$eval('#print .notes .blank', a => a.map(x => x.textContent).join()))
    && (await pg.$$eval('#print .sech', a => a.map(x => x.textContent))).join() === '핵심정리,핵심 요약 빈칸', st.slice(0, 160));
  await pg.evaluate(() => { document.body.classList.remove('printing'); SEL = []; selChanged(); });
  await pg.click('[data-bundle="exam"]');
  t('시험지 묶음 담기 — 원 기출 2 + 고난도 1 + 보기형 1', (await pg.textContent('#selN')) === '4문항');
  await pg.click('[data-bundle="exam"]');
  t('같은 묶음을 또 누르면 겹쳐 담지 않음', (await pg.textContent('#selN')) === '4문항');
  await pg.evaluate(() => selDoc('study', false));
  t('학생용 — 답안 기록표·정답 표시 없음', (await pg.$$('#print .ansrow td')).length === 8 && (await pg.$$('#print .opts li.ok')).length === 0 && (await pg.textContent('#print .ins')).includes('[1~4]'));
  await pg.evaluate(() => { document.body.classList.remove('printing'); SEL = []; selChanged(); });

  // ── 고른 문항 — 여러 지문을 담아 인쇄·책자·H WORK 출제 (2026-11-19) ──
  await pg.evaluate(() => { window.print = () => {}; });
  const unprint = () => pg.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  t('처음엔 내보내기 버튼 잠김', await pg.$eval('[data-sp="exam"]', e => e.disabled) && await pg.$eval('#saveBtn', e => e.disabled));
  await pg.click('#tchips [data-t="orig"]');
  await pg.click('#list [data-pick="1000"]');
  await pg.click('#list [data-pick="1001"]');
  t('담기 → 담음 표시', (await pg.textContent('#list [data-pick="1000"]')).includes('담음') && (await pg.$$('#list .q.on')).length === 2);
  await pg.click('#tchips [data-t="02"]');
  await pg.click('#allBtn');
  await pg.click('#tchips [data-t="07"]'); await pg.click('#list [data-pick="1008"]');
  await pg.click('#tchips [data-t="07_2"]'); await pg.click('#list [data-pick="1009"]');
  await pg.click('#tchips [data-t="09"]'); await pg.click('#list [data-pick="1011"]');
  await pg.click('#tchips [data-t="99"]'); await pg.click('#list [data-pick="1012"]');
  await pg.click('#res .rc:nth-child(2)'); await pg.waitForFunction(() => /가상 진화/.test(document.querySelector('#pmeta').textContent));
  await pg.click('#tchips [data-t="orig"]'); await pg.click('#list [data-pick="1014"]');
  t('고른 문항 10개(OX 실력 포함)', (await pg.textContent('#selN')) === '10문항', await pg.textContent('#selN'));
  t('지문 묶음 머리 3개(본 지문·독립 지문·다른 지문)', (await pg.$$('#sel .sgh')).length === 3);
  t('제목 자동', (await pg.inputValue('#pTitle')) === 'Shuefit 독서: 가상 시장 이야기 외 1지문 (10)', await pg.inputValue('#pTitle'));
  await pg.fill('#pSchool', '행신고등학교');
  t('저장 전에는 인쇄 잠김', await pg.$eval('[data-bk]', e => e.disabled) && /저장해야/.test(await pg.textContent('#paperMsg')));
  await pg.fill('#hTeacher', '박선생');
  await pg.click('#paperSave');
  await pg.waitForFunction(() => !document.querySelector('[data-bk]').disabled);
  const pw = writes.find(w => /shufit_reading_papers\?on_conflict/.test(w.u));
  t('문제지 저장 본문 — 선생님·제목·문항 순서·학교·차례(seq)', !!pw && (b => b.teacher === '박선생' && b.ids.length === 10 && b.ids[0] === 1000 && b.school === '행신고등학교' && b.seq.join() === b.ids.join())(JSON.parse(pw.b)[0]));
  writes.length = 0;
  await pg.click('[data-x="ex"]');
  t('시험지 양식 A형/B형 고르기', (await pg.$$('#exDes [data-d]')).length === 2 && await pg.$eval('#exDes [data-d="A"]', e => e.classList.contains('on')));
  await pg.fill('#exTitle', '2026년 2학기 모의 기말고사');
  const exam = async (sel) => { await pg.evaluate(() => { document.querySelector('#print').innerHTML = ''; }); await pg.evaluate(s => document.querySelector(s).click(), sel); await pg.waitForFunction(() => document.querySelectorAll('#print .page').length > 0, null, { timeout: 8000 }); };
  await exam('[data-sp="exam"]:not([data-t])');
  const ins = await pg.$$eval('#print .xb.instr', a => a.map(x => x.textContent));
  t('시험지(A형) — 지문마다 안내 [1~8]·[9]·[10]', ins.join('|') === '※ [1~8] 다음 글을 읽고 물음에 답하시오.|※ [9] 다음 글을 읽고 물음에 답하시오.|※ [10] 다음 글을 읽고 물음에 답하시오.', ins);
  t('시험지(A형) — 학교 지필고사 머리·로고·시험명·학교', !!(await pg.$('#print .cover .logo')) && (await pg.textContent('#print .cover .exam')) === '2026년 2학기 모의 기말고사' && (await pg.textContent('#print .cover .school')) === '행신고등학교' && /독서 · 사회·인문/.test(await pg.textContent('#print .cover .subject')), await pg.textContent('#print .cover .subject'));
  t('시험지 10문항·흑백 2단·쪽 번호', (await pg.$$('#print .xq')).length === 10 && (await pg.$$('#print .page .cols .col')).length >= 2 && /__T__/.test(await pg.textContent('#print')) === false);
  t('답안 기록표 — 5지·OX·서술 칸', (await pg.$$('#print .omrpage .omr > div')).length === 10 && (await pg.$$('#print .omr i.w')).length === 2 && (await pg.textContent('#print .omrpage')).includes('행신고등학교'));
  t('학생용엔 정답 표시 없음', (await pg.$$('#print .opts li.ok')).length === 0 && !(await pg.$('#print .tmark')));
  t('시험지 = 여백 0 쪽 상자', (await pg.textContent('#pageStyle')).includes('margin:0'));
  t('지문 그림 = 그 지문 그림', await pg.$$eval('#print img', a => a.length > 0 && a.every(i => i.src.startsWith('data:image/png;base64,iVBOR'))));
  await unprint();
  await exam('[data-sp="exam"][data-t]');
  t('교사용 시험지 — 같은 쪽에 정답 동그라미 + 뒤에 정답과 해설', (await pg.$$('#print .opts li.ok')).length >= 3 && !!(await pg.$('#print .tmark')) && (await pg.$$('#print .kq')).length === 10);
  await unprint();
  await exam('[data-sp="key"]');
  t('정답표 한 장', (await pg.$$('#print .page')).length === 1 && (await pg.$$('#print .kgrid > div')).length === 10);
  await unprint();
  await pg.click('#exDes [data-d="B"]');
  t('B형 칸으로 바뀜', await pg.isVisible('#exYear') && !(await pg.isVisible('#exTitle')));
  await exam('[data-sp="exam"]:not([data-t])');
  t('시험지(B형) — 표 머리·안내 상자·안내문 ※ 없음', !!(await pg.$('#print .coverB table')) && !!(await pg.$('#print .notice')) && (await pg.$$eval('#print .xb.instr', a => a.every(x => !x.textContent.startsWith('※')))));
  if (process.env.SHOT) await pg.pdf({ path: process.env.SHOT + '/reading-exam-B.pdf', preferCSSPageSize: true });
  await unprint(); await pg.click('#exDes [data-d="A"]');
  await unprint();
  await pg.evaluate(() => document.querySelector('[data-sp="study"][data-t="1"]').click());
  t('학습지 교사용 — 정답과 해설', (await pg.textContent('#print .ansbox')).includes('1. 정답 ②'));
  await unprint();
  await pg.evaluate(() => document.querySelector('[data-bk][data-t="1"]').click());
  await pg.waitForFunction(() => document.querySelectorAll('#print .sheet').length > 0, null, { timeout: 8000 });
  const sheets = (await pg.$$('#print .sheet')).length;
  t('책자 쪽 수 4의 배수·표지·뒤표지', sheets % 4 === 0 && !!(await pg.$('#print .cover')) && !!(await pg.$('#print .bkback')), sheets);
  t('책자 10문항 모두·쪽 번호', (await pg.$$('#print .sheet .q')).length === 10 && /- 2 -/.test(await pg.textContent('#print')));
  t('책자 여백 0', (await pg.textContent('#pageStyle')).includes('margin:0'));
  if (process.env.SHOT) await pg.pdf({ path: process.env.SHOT + '/reading-booklet.pdf', preferCSSPageSize: true });
  await unprint();
  t('인쇄 뒤 A4 쪽 번호로 되돌림', (await pg.textContent('#pageStyle')).includes('counter(pages)'));
  // 순서를 바꾸면 다시 저장해야 인쇄
  await pg.click('#sel .si:nth-of-type(2) [data-mv="-1"]').catch(() => {});
  await pg.evaluate(() => { const S = window.__SEL(); });
  // 저장한 문제지 불러오기
  await pg.fill('#hTeacher', ''); await pg.dispatchEvent('#hTeacher', 'change');
  t('불러오기 목록 — 저장한 문제지 묶음', (await pg.$$eval('#loadSel optgroup', a => a.map(x => x.label))).includes('저장한 문제지'));
  pg.once('dialog', d => d.accept());
  const v = await pg.$eval('#loadSel', s => [...s.options].find(o => /지난 문제지/.test(o.textContent)).value);
  await pg.selectOption('#loadSel', v);
  await pg.waitForFunction(() => document.querySelector('#selN').textContent === '3문항 · 학습 자료 1');
  t('불러온 순서(seq — 학습 자료 포함)·지문 묶음', (await pg.$$eval('#sel .si .st', a => a.map(x => x.querySelector('small').textContent + (x.closest('.mat') ? ':' + x.textContent.replace('학습 자료', '') : '')))).join('|') === '원 기출|학습 자료:핵심정리|OX|독립 밑줄 수능형', await pg.$$eval('#sel .si .st', a => a.map(x => x.textContent)));
  t('불러오기 목록에 학습 자료 수', /지난 문제지 · 이선생 \(3문항 · 학습 자료 1\)/.test(await pg.textContent('#loadSel')));
  t('불러온 선생님·제목·날짜·학교', (await pg.inputValue('#hTeacher')) === '이선생' && (await pg.inputValue('#pTitle')) === '지난 문제지' && (await pg.inputValue('#pDate')) === '2026-12-01' && (await pg.inputValue('#pSchool')) === '화정고');
  t('불러온 문제지는 바로 인쇄 가능', !(await pg.$eval('[data-bk]', e => e.disabled)));
  await pg.fill('#pSchool', '능곡고'); await pg.dispatchEvent('#pSchool', 'change'); await pg.waitForTimeout(150);
  t('학교를 바꾸면 그 문제지에 PATCH', writes.some(w => w.m === 'PATCH' && /shufit_reading_papers\?subject=eq\.독서&teacher=eq\.이선생&title=eq\.지난 문제지/.test(w.u) && JSON.parse(w.b).school === '능곡고'));
  await pg.click('#list [data-pick]').catch(() => {});
  pg.once('dialog', d => d.accept());
  await pg.click('#paperDel'); await pg.waitForTimeout(150);
  t('문제지 삭제', writes.some(w => w.m === 'DELETE' && /shufit_reading_papers\?subject=eq\.독서&teacher=eq\.이선생/.test(w.u)));
  pg.once('dialog', d => d.accept());
  await pg.click('#newBtn');
  t('새 문제지 — 비움·인쇄 잠김', (await pg.textContent('#selN')) === '0문항' && await pg.$eval('[data-bk]', e => e.disabled));
  writes.length = 0;
  // H WORK 출제는 다시 9문항을 담아서
  await pg.click('#res .rc:nth-child(1)'); await pg.waitForFunction(() => /가상 시장/.test(document.querySelector('#pmeta').textContent));
  for (const [ty, ids] of [['orig', [1000, 1001]], ['02', [1002, 1003]], ['07', [1008]], ['07_2', [1009]], ['09', [1011]], ['99', [1012]]]) {
    await pg.click(`#tchips [data-t="${ty}"]`); for (const id of ids) await pg.click(`#list [data-pick="${id}"]`);
  }
  await pg.click('#res .rc:nth-child(2)'); await pg.waitForFunction(() => /가상 진화/.test(document.querySelector('#pmeta').textContent));
  await pg.click('#tchips [data-t="orig"]'); await pg.click('#list [data-pick="1014"]');
  // H WORK 출제
  await pg.click('[data-x="hw"]');
  await pg.fill('#hTeacher', '김선생');
  const hdlg = []; const onD = d => { hdlg.push(d.message()); d.accept(); pg.off('dialog', onD); }; pg.on('dialog', onD);
  await pg.click('#saveBtn');
  await pg.waitForFunction(() => /구간 \d+개로 나눠 출제했습니다/.test(document.querySelector('#saveMsg').textContent), null, { timeout: 8000 });
  t('출제 전에 구간 목록을 묻기', /구간 7개로 나눠/.test(hdlg[0] || ''), hdlg[0]);
  const posts = writes.filter(w => w.m === 'POST' && /hwork_src_items$/.test(w.u.split('?')[0])).map(w => JSON.parse(w.b));
  const items = [].concat(...posts);
  const codes = gas.map(g => JSON.parse(g).data.code);
  t('언제나 구간마다 따로 과제 — 7개', gas.length === 7 && posts.length === 7, codes);
  t('구간 이름 — 지문 · 번호 유형 (수)', codes[1] === 'Shuefit 독서: 가상 시장 이야기 · 02 OX (2)' && codes[5] === 'Shuefit 독서: 가상 시장 이야기 · 01 독립 밑줄 수능형 (1)' && codes[6] === 'Shuefit 독서: 가상 진화 이야기 · 01 원 기출 (1)', codes);
  t('같은 이름의 다른 과제가 있으면 뒤에 02', codes[0] === 'Shuefit 독서: 가상 시장 이야기 · 01 원 기출 (2) 02', codes[0]);
  t('src 문항 9줄·구간마다 번호 1부터', items.length === 9 && posts.every(r => r.map(x => x.no).join() === r.map((x, i) => i + 1).join()));
  t('src 종류', items.map(x => x.type).join() === '5지,5지,OX,OX,단답,서술,5지,5지,5지', items.map(x => x.type).join());
  t('정답 표시 없음·보기 번호 칸', items.every(x => !/cn ok/.test(x.html)) && items[0].html.includes('<span class="cn">①</span>'));
  t('옛 문항 지우고 넣음', writes.some(w => w.m === 'DELETE' && w.u.includes('hwork_src_items?code=eq.' + codes[0])));
  const D = gas.map(g => JSON.parse(g).data);
  t('과제 데이터 — 채점 종류·정답', D[0].count === 2 && D[0].items[1].type === 'choice5' && D[0].items[1].ans === '2' && D[1].items[1].ans === 'O' && D[2].items[1].type === 'text' && D[3].items[1].type === 'essay' && D[0].rd[1] === 1000 && D[0].src === 'reading', JSON.stringify(D.map(d => d.items)));
  t('미러 hwork_homeworks', writes.some(w => w.u.includes('hwork_homeworks?on_conflict')));
  t('출제한 문항은 낸 적 있음', !!(await pg.$('#list .used')));
  // 아직 안 낸 문항만 · 채우기 (문법과 같은 기능)
  t('안 낸 문항만 — 선생님 이름', (await pg.textContent('#fUnusedLb')) === '김선생 선생님이 안 낸 문항만');
  await pg.check('#fUnused');
  t('안 낸 문항만 — 낸 원 기출은 숨김', (await pg.$$('#list .q')).length === 0 && /아직 안 낸 문항이 없습니다/.test(await pg.textContent('#list')));
  await pg.click('#res .rc:nth-child(1)'); await pg.waitForFunction(() => /가상 시장/.test(document.querySelector('#pmeta').textContent));
  await pg.click('#tchips [data-t="02"]');
  t('안 낸 OX만 — 실력 OX 하나', (await pg.$$('#list .q')).length === 1 && (await pg.textContent('#list')).includes('실력 OX 문항'));
  await pg.fill('#autoN', '11'); await pg.click('#autoBtn');
  t('채우기 — 모두 11문항이 되게(안 낸 문항으로)', (await pg.textContent('#selN')) === '11문항' && await pg.evaluate(() => window.__SEL().some(x => x.id === 1013)), await pg.textContent('#selN'));
  await pg.uncheck('#fUnused');
  t('안 낸 문항만을 끄면 다시 모두', (await pg.$$('#list .q')).length === 3);

  // 다른 지문(실력 없음) — 난도 알약 잠김
  t('난도 알약 없음', (await pg.$$('[data-lv]')).length === 0);

  // 교과서 지문(080) — 난도 없음, 교과서 유형, 시험지 문항 고르기
  await pg.click('#areas [data-area="교과서"]');
  t('교과서 알약으로 거름', (await pg.$$('#res .rc')).length === 1 && /교과서/.test(await pg.textContent('#res .rc')));
  await pg.click('#res .rc'); await pg.waitForFunction(() => /가상 교과서 글/.test(document.querySelector('#pmeta').textContent));
  t('교과서는 난도 알약 없음', (await pg.$$('#pmeta [data-lv]')).length === 0 && /작가/.test(await pg.textContent('#pmeta')));
  t('교과서 유형 알약', (await pg.$$eval('#tchips .chip', a => a.map(x => x.dataset.t))).join() === 'notes,analysis,11,12,13,14,15,16,17,18,19,10,keys');
  t('처음 유형 = OX 쉬움', await pg.$eval('#tchips .chip.on', e => e.dataset.t) === '11');
  t('지문 소제목·그림 표·설명·출처', (await pg.$$('#pas p.sub')).length === 1 && (await pg.$$('#pas .gridt')).length === 1 && (await pg.$$('#pas p.cap')).length === 1 && (await pg.$$('#pas p.src')).length === 1);
  await pg.click('#tchips [data-t="analysis"]'); t('지문 분석', /기본정보/.test(await pg.textContent('#list')));
  await pg.click('#tchips [data-t="keys"]'); t('정오답 선지 근거', /근거 모음/.test(await pg.textContent('#list')));
  t('시험지 문항 고르기 보임', await pg.$eval('#exsetw', e => e.classList.contains('on')));
  await pg.evaluate(() => { window.__K = SEL.slice(); window.__KS = SAVED; SEL = []; selChanged(); });
  t('교과서 묶음 안내 — 시험지 = 고른 유형', /시험지 모의고사형 \(2문항\)/.test(await pg.textContent('#bdlInfo')) && /학습자료 문단별 정리 · OX 쉬움 · OX 어려움 · 키워드 빈칸 · 문단 정리 빈칸/.test(await pg.textContent('#bdlInfo')), await pg.textContent('#bdlInfo'));
  await pg.selectOption('#exset', '15,16');
  t('시험지 유형을 바꾸면 안내도 바뀜', /시험지 고난도 보기형 · 1등급 보기형 \(2문항\)/.test(await pg.textContent('#bdlInfo')));
  await pg.click('[data-bundle="exam"]');
  await pg.evaluate(() => selDoc('study', true));
  t('교과서 시험지 묶음 — 고난도·1등급 2, 교사용 정답', (await pg.textContent('#selN')) === '2문항' && (await pg.$$('#print .q')).length === 2 && (await pg.$$('#print .opts li.ok')).length === 2);
  await pg.evaluate(() => { document.body.classList.remove('printing'); SEL = []; selChanged(); });
  await pg.click('[data-bundle="study"]');
  await pg.evaluate(() => selDoc('study', true));
  t('교과서 학습자료 묶음 — 문단별 정리·문단 정리 빈칸 답', / · 학습 자료 2$/.test(await pg.textContent('#selN')) && /문화/.test(await pg.textContent('#print')) && (await pg.$$eval('#print .sech', a => a.map(x => x.textContent))).join() === '문단별 정리,문단 정리 빈칸');
  await pg.evaluate(() => { document.body.classList.remove('printing'); SEL = []; selChanged(); });
  // 학습 자료만 담은 문제지 저장 — ids 는 문항만(빈 배열), seq 에 'm:지문:종류'
  await pg.click('#tchips [data-t="keys"]'); await pg.click('#list [data-mat="keys"]');
  await pg.click('#tchips [data-t="notes"]'); await pg.click('#list [data-mat="notes"]');
  t('학습 자료 두 개 — 담은 순서', (await pg.$$eval('#sel .si.mat .st', a => a.map(x => x.textContent.replace('학습 자료', '')))).join() === '정오답 선지 근거,문단별 정리');
  await pg.fill('#pTitle', '교과서 정리 자료');
  writes.length = 0;
  await pg.click('#paperSave');
  await pg.waitForFunction(() => /인쇄할 수 있어요/.test(document.querySelector('#paperMsg').textContent));
  const mw = writes.find(w => /shufit_reading_papers\?on_conflict/.test(w.u));
  t('학습 자료 문제지 저장 — ids 빈 배열 · seq 차례', !!mw && (b => b.ids.length === 0 && b.seq.join() === 'm:교과서-가상교과서-5-1-1:keys,m:교과서-가상교과서-5-1-1:notes')(JSON.parse(mw.b)[0]), mw && mw.b);
  await pg.evaluate(() => { PAPERS = PAPERS.filter(p => p.title !== '교과서 정리 자료'); SEL = window.__K; SAVED = window.__KS; drawLoad(); baDraw(); selChanged(); });
  await pg.click('#tchips [data-t="11"]');
  await pg.evaluate(() => window.__printDoc('all', true));
  t('이 단원 모두 인쇄 — 지문·문단별 정리·지문 분석·모든 유형·정오답 근거', (await pg.$$eval('#print .bksec b', a => a.map(x => x.textContent))).join() === '지문,문단별 정리,지문 분석,OX 쉬움,OX 어려움,모의고사형,고난도 보기형,1등급 보기형,키워드 빈칸,문단 정리 빈칸,정오답 선지 근거');
  await pg.evaluate(() => document.body.classList.remove('printing'));
  await pg.click('#tchips [data-t="11"]');
  // 모두 인쇄 — 기본 중철 책자, [A4] 로 바꿀 수 있음
  t('모두 인쇄 기본 = 중철 책자', await pg.$eval('#umSeg [data-um="bk"]', e => e.classList.contains('on')));
  await pg.click('#paT');
  await pg.waitForFunction(() => document.querySelectorAll('#print .sheet').length > 0, null, { timeout: 8000 });
  const usheets = (await pg.$$('#print .sheet')).length;
  t('단원 책자 — 표지·뒤표지·4의 배수', usheets % 4 === 0 && !!(await pg.$('#print .cover')) && !!(await pg.$('#print .bkback')) && /단원 전체/.test(await pg.textContent('#print .cover')), usheets);
  t('단원 책자 — 구간마다 새 쪽 맨 위에서 시작', await pg.evaluate(() => [...document.querySelectorAll('#print .bksec:not(.first)')].every(e => e.parentElement.classList.contains('bbody') && e.parentElement.firstElementChild === e)));
  t('단원 책자 — 구간 제목에 문항 수', /1등급 보기형\s*1문항/.test(await pg.evaluate(() => [...document.querySelectorAll('#print .bksec')].map(e => e.textContent).join('|'))));
  t('단원 책자 앞표지 — 담긴 것 목록이 학교·이름 칸을 덮지 않음', await pg.evaluate(() => { const c = document.querySelector('#print .cover'); return c.querySelector('.cv-list').getBoundingClientRect().bottom <= c.querySelector('.cv-name').getBoundingClientRect().top; }));
  t('단원 책자 — 모든 묶음·문항·정답과 해설', (await pg.$$eval('#print .bksec b', a => a.map(x => x.textContent))).join() === '지문,문단별 정리,지문 분석,OX 쉬움,OX 어려움,모의고사형,고난도 보기형,1등급 보기형,키워드 빈칸,문단 정리 빈칸,정오답 선지 근거'
    && (await pg.$$('#print .sheet .q')).length === 5 && /정답과 해설/.test(await pg.textContent('#print')) && /문화/.test(await pg.textContent('#print')),
    JSON.stringify([await pg.$$eval('#print .bksec b', a => a.map(x => x.textContent)), (await pg.$$('#print .sheet .q')).length]));
  await unprint();
  await pg.click('#umSeg [data-um="a4"]');
  await pg.click('#paS'); await pg.waitForTimeout(300);
  t('[A4] 고르면 A4 한 파일', !(await pg.$('#print .sheet')) && (await pg.$$('#print .bksec b')).length === 11);
  await unprint();
  await pg.click('#umSeg [data-um="bk"]');
  // 이 단원 모두 H WORK 출제 — 다른 지문 문항을 비우고 교과서 문항만 담아 출제
  t('모두 출제 안내', /문항 7개/.test(await pg.textContent('#unitHwNote')), await pg.textContent('#unitHwNote'));
  await pg.fill('#pTitle', '교과서 단원 과제');
  writes.length = 0; gas.length = 0;
  const dlg = [];
  const onDlg = d => { dlg.push(d.message()); d.accept(); };
  pg.on('dialog', onDlg);
  await pg.click('#unitHw');
  await pg.waitForFunction(() => /구간 \d+개로 나눠 출제했습니다/.test(document.querySelector('#saveMsg').textContent), null, { timeout: 8000 });
  pg.off('dialog', onDlg);
  t('모두 출제 — 다른 지문 비울지·구간으로 나눠 출제할지 묻기', dlg.length === 2 && /다른 지문 문항 \d+개/.test(dlg[0]) && /문항 7개를 구간 \d+개로 나눠/.test(dlg[1]), JSON.stringify(dlg));
  t('모두 출제 — 학생 직접 고르기 칸이 열려 진행·완료 안내가 보임', await pg.isVisible('#saveMsg') && await pg.isVisible('#hwAssignBtn') && await pg.$eval('#hwWho [data-w="pick"]', e => e.classList.contains('on')));
  await pg.waitForFunction(() => /H WORK 과제로 출제했습니다/.test(document.querySelector('#unitHwNote').textContent), null, { timeout: 8000 });
  t('모두 출제 — 지문 머리에도 완료·배정 안내', /학생 직접 고르기/.test(await pg.textContent('#unitHwNote')));
  t('모두 출제 — 고른 문항 7·H WORK 탭', (await pg.textContent('#selN')) === '7문항' && !(await pg.$eval('#xp-hw', e => e.hidden)));
  const uposts = writes.filter(w => w.m === 'POST' && /hwork_src_items$/.test(w.u.split('?')[0])).map(w => JSON.parse(w.b));
  const ugas = gas.filter(Boolean).map(g => JSON.parse(g)).filter(g => g.action === 'saveHomework');
  t('모두 출제 — 구간마다 따로 과제', ugas.length > 1 && ugas.length === uposts.length && uposts.reduce((a, r) => a + r.length, 0) === 7
    && ugas.every((g, i) => /^Shuefit 독서: 가상 교과서 글 · \d\d .+ \(\d+\)$/.test(g.data.code) && g.data.count === uposts[i].length && uposts[i].every((r, k) => r.code === g.data.code && r.no === k + 1)),
    JSON.stringify(ugas.map(g => g.data.code)));
  t('모두 출제 — 구간 이름은 01부터', /· 01 /.test(ugas[0].data.code) && new Set(ugas.map(g => g.data.code)).size === ugas.length);
  // 구간 과제 모두 한 번에 배정
  gas.length = 0;
  await pg.evaluate(() => { window.HWP_SEL = { type: '개인', target: '홍길동', summary: '홍길동' }; });
  const dlg2 = []; const onDlg2 = d => { dlg2.push(d.message()); d.accept(); }; pg.on('dialog', onDlg2);
  await pg.click('#hwAssignBtn');
  await pg.waitForFunction(() => /구간 과제 \d+개를 배정했습니다/.test(document.querySelector('#hwAssignMsg').textContent), null, { timeout: 8000 });
  pg.off('dialog', onDlg2);
  const adds = gas.filter(Boolean).map(g => JSON.parse(g)).filter(g => g.action === 'addAssignment');
  t('모두 출제 — 구간 과제 모두 배정', /구간 과제 \d+개를/.test(dlg2[0] || '') && adds.length === ugas.length && adds.every((a, i) => a.item === '김선생 / ' + ugas[i].data.code && a.target === '홍길동'), JSON.stringify(adds.map(a => a.item)));
  await pg.click('#areas [data-area=""]'); await pg.click('#res .rc:nth-child(1)');
  await pg.waitForFunction(() => /가상 시장/.test(document.querySelector('#pmeta').textContent));
  t('모의고사 지문으로 돌아가면 묶음 안내도', /학습자료 핵심정리 · OX/.test(await pg.textContent('#bdlInfo')));
  t('모의고사 지문으로 돌아가면 난도·원 기출', (await pg.$$('#pmeta [data-lv]')).length === 0 && await pg.$eval('#tchips .chip.on', e => e.dataset.t) === 'orig' && !(await pg.$eval('#exsetw', e => e.classList.contains('on'))));

  // ── 저장한 문제지 묶음(2026-11-19 — 문법과 같은 칸): 합쳐서 중철 책자 · 한 번에 출제·배정 ──
  const idA = I.filter(x => x.passage_id === P[0].id && x.code === '00').map(x => x.id).slice(0, 2), idB = I.filter(x => x.passage_id === P[1].id).map(x => x.id);
  await pg.evaluate(([a, bb]) => { PAPERS.unshift({ id: 71, teacher: '김선생', title: '시장 원 기출', ids: a, school: '화정고2' }, { id: 72, teacher: '김선생', title: '진화 원 기출', ids: bb, school: '화정고2' }); baDraw(); }, [idA, idB]);
  await pg.waitForFunction(() => document.querySelectorAll('#baCls option').length > 1);
  t('묶음 칸 — 진도반 고르기(확인 반 빼기)', !(await pg.$$eval('#baCls option', a => a.map(o => o.textContent))).some(x => x.includes('확인')));
  { const acc = d => d.accept(); pg.on('dialog', acc);   // 하나만 고르면 그 문제지를 연다 — 지금 고른 문항(저장 안 함)을 바꿀지 묻는다
    await pg.check('[data-bap="72"]'); await pg.waitForFunction(() => document.querySelector('#pTitle').value === '진화 원 기출', null, { timeout: 8000 });
    pg.off('dialog', acc); }
  await pg.click('#xTabs [data-x=pr]');
  t('하나 고르면 그 문제지를 연다(저장 안 한 문항은 물어봄)', (await pg.textContent('#shOrd')).includes('「진화 원 기출」') && await pg.isVisible('#shOne'));
  t('문제지함 날짜·학교 칸 — 그 문제지 값', await pg.isVisible('#xMeta') && (await pg.inputValue('#xSchool')) === '화정고2');
  await pg.fill('#xSchool', '화정고 2학년'); 
  t('하나일 때 고치면 그 문제지 칸도', (await pg.inputValue('#pSchool')) === '화정고 2학년');
  await pg.fill('#xSchool', '화정고2');
  await pg.check('[data-bap="71"]');
  t('묶음 칸 — 고른 차례 번호', (await pg.$$eval('#baPapers .ord', a => a.map(x => x.textContent))).sort().join() === '1,2' && (await pg.$eval('[data-bap="72"] + span .ord', e => e.textContent)) === '1');
  t('묶음 칸 — 문제지 학교로 진도반 저절로·학교·학년 맞는 학생만', (await pg.locator('#baClsOn span').count()) === 1 && (await pg.textContent('#baStu')).includes('받을 학생 2명') && (await pg.textContent('#baStu .miss')).includes('최다솜'));
  await pg.evaluate(() => { window.print = () => {}; });
  await pg.click('#mpBkS');
  await pg.waitForFunction(() => document.querySelectorAll('#print .sheet').length > 0, null, { timeout: 8000 });
  const rmp = await pg.evaluate(() => { const secs = [...document.querySelectorAll('#print .bksec')];
    return { n: document.querySelectorAll('#print .sheet').length, secs: secs.map(e => e.textContent), top: secs.slice(1).every(e => e.parentElement.classList.contains('bbody') && e.parentElement.firstElementChild === e),
      ins: [...document.querySelectorAll('#print .bbody .ins')].map(e => e.textContent), cover: document.querySelector('#print .cover .cv-sub').textContent, title: document.title }; });
  t('묶음 책자 — 고른 차례대로 소제목·문항 수', rmp.n % 4 === 0 && rmp.secs.join('|') === '진화 원 기출' + idB.length + '문항|시장 원 기출' + idA.length + '문항', rmp.secs);
  t('묶음 책자 — 둘째 문제지부터 새 쪽 맨 위', rmp.top);
  t('묶음 책자 — 번호는 문제지마다 1번부터', rmp.ins.length === 2 && rmp.ins.every(x => /^\[1/.test(x)), rmp.ins);
  t('묶음 책자 — 표지·파일 이름', /문제지 2개/.test(rmp.cover) && /문제지 2개 묶음/.test(rmp.title), [rmp.cover, rmp.title]);
  await pg.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  await pg.click('#mpBkT');
  await pg.waitForFunction(() => document.querySelectorAll('#print .ksec').length === 2, null, { timeout: 8000 });
  t('묶음 교사용 — 정답과 해설도 문제지마다 소제목', (await pg.$$eval('#print .ksec', a => a.map(x => x.textContent))).join('|') === '진화 원 기출' + idB.length + '문항|시장 원 기출' + idA.length + '문항');
  await pg.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  t('여러 개 — 묶음 책자에만 쓴다는 안내', /이번 묶음 책자에만/.test(await pg.textContent('#xMetaNote')));
  await pg.fill('#xDate', '2026-12-24'); await pg.fill('#xSchool', '능곡고');
  await pg.click('#mpBkS');
  await pg.waitForFunction(() => /능곡고/.test((document.querySelector('#print') || {}).textContent || ''), null, { timeout: 8000 });
  t('묶음 책자 — 문제지함에서 바꾼 날짜·학교', /2026\. 12\. 24\./.test(await pg.textContent('#print')) && (await pg.inputValue('#pSchool')) === '화정고2');
  await pg.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  gas.length = 0;
  await pg.evaluate(() => { ALLHW = ALLHW.filter(h => !(h.data && h.data.rd && /가상 (진화|시장)/.test(h.code))); baDraw(); });
  const onDlg3 = d => d.accept(); pg.on('dialog', onDlg3);
  await pg.click('#baGo');
  await pg.waitForFunction(() => /끝났습니다/.test(document.querySelector('#baMsg').textContent), null, { timeout: 8000 });
  pg.off('dialog', onDlg3);
  const bg = gas.filter(Boolean).map(g => JSON.parse(g)), bsv = bg.filter(g => g.action === 'saveHomework'), bas = bg.filter(g => g.action === 'addAssignment');
  t('한 번에 — 문제지마다 구간 과제로 출제, 이름 안 겹침', bsv.length === 2 && new Set(bsv.map(g => g.data.code)).size === 2 && /가상 진화.* · 01 /.test(bsv[0].data.code), bsv.map(g => g.data.code));
  t('한 번에 — 진도반 학생 토큰으로 배정(같은 이름은 학교·학년까지)', bas.length === 2 && bas.every((a, i) => a.type === '일부' && a.item === '김선생 / ' + bsv[i].data.code && a.target === '김가람, 박나래|화정고|2026고등2학년'), bas.map(a => a.target));
  gas.length = 0; pg.on('dialog', onDlg3);
  await pg.click('#baGo');
  await pg.waitForFunction(() => /건너뜀 2개/.test(document.querySelector('#baMsg').textContent), null, { timeout: 8000 });
  pg.off('dialog', onDlg3);
  t('다시 누르면 이미 출제·배정한 것은 건너뜀', !gas.filter(Boolean).map(g => JSON.parse(g)).some(g => g.action === 'saveHomework' || g.action === 'addAssignment'));

  // ── 두 화면(2026-11-19 시안 2단계) — 만들기에는 인쇄·출제가 없고, 문제지함에서 고른다 ──
  await pg.click('#xTabs [data-x=pr]');
  t('여러 개 — 묶음 책자, 시험지·삭제·열기 잠김', await pg.isVisible('#shMulti') && await pg.isHidden('#shOne') && await pg.isDisabled('#xTabs [data-x=ex]') && await pg.isDisabled('#paperDel') && await pg.isDisabled('#shOpen') && /① 진화 원 기출 → ② 시장 원 기출/.test(await pg.textContent('#shOrd')));
  await pg.uncheck('[data-bap="72"]');
  await pg.waitForFunction(() => document.querySelector('#pTitle').value === '시장 원 기출', null, { timeout: 8000 });
  t('하나만 남으면 그 문제지를 열어 낱장 인쇄', await pg.isVisible('#shOne') && !(await pg.isDisabled('#xp-pr [data-sp="study"]')) && (await pg.textContent('#shOrd')).includes('「시장 원 기출」'));
  await pg.click('#shOpen');
  t('열어서 고치기 → 문제지 만들기', await pg.isVisible('#makeView') && await pg.isHidden('#xCard') && (await pg.textContent('#steps')).includes('저장함'));
  await pg.click('#goShelf');
  t('[내 문제지함에서 인쇄·출제] → 문제지함', await pg.isVisible('#shelfView') && await pg.isHidden('#makeView'));
  await pg.click('#shF [data-shf=new]');
  t('아직 안 낸 것 — 출제한 문제지는 빠짐', (await pg.$$('[data-bap="71"]')).length === 0);
  await pg.click('#shF [data-shf=all]');
  if (process.env.SHOT) await pg.screenshot({ path: process.env.SHOT + '/reading-shelf.png', fullPage: true });
  await pg.evaluate(() => setMode('make'));
  if (process.env.SHOT) await pg.screenshot({ path: process.env.SHOT + '/reading-make.png' });

  // ── Shuefit 문학(2026-11-19) — 같은 화면, 주소 ?s=lit ──
  t('독서 목록에는 문학 작품이 없음', !/가상 시 모음/.test(await pg.textContent('#res')));
  const lp = await b.newPage({ viewport: { width: 1280, height: 1000 } });
  for (const mm of ['click', 'fill']) { const o = lp[mm].bind(lp); lp[mm] = async (sel, ...a) => { await lp.evaluate(s2 => window.__sfReveal && window.__sfReveal(s2), sel).catch(() => {}); return o(sel, ...a); }; }
  const lerr = []; lp.on('pageerror', e => lerr.push(e.message));
  const lw = [], upPosts = [];
  await lp.route('**/*', async route => {
    const u = route.request().url();
    if (/script\.google\.com/.test(u) && /editReqList/.test(u)) return route.fulfill({ json: { result: 'success', reqs: [
      { screen: '슈핏 문항', writer: '김선생', ts: '2026-11-19 22:10', status: '처리 완료', text: '[슈핏 문항] 문학 · 폴더 x\n메모: 멸치 한 작품', note: '「멸치」 132문항을 올렸어요.' },
      { screen: '슈핏 문항', writer: '박선생', ts: '2026-11-19 22:20', status: '접수됨', text: '[슈핏 문항] 독서 · 폴더 y' },
      { screen: '수업 리포트', writer: '김선생', ts: '2026-11-19 22:30', status: '접수됨', text: 'x' }] } });
    if (/script\.google\.com/.test(u) && route.request().method() === 'POST') { upPosts.push(JSON.parse(route.request().postData())); return route.fulfill({ json: { result: 'success' } }); }
    if (/\/rest\/v1\//.test(u) && route.request().method() !== 'GET') { lw.push({ u: decodeURIComponent(u), b: route.request().postData() }); return /on_conflict/.test(u) ? route.fulfill({ status: 201, json: JSON.parse(route.request().postData()) }) : route.fulfill({ status: 201, body: '' }); }
    if (/\/rest\/v1\/shufit_reading_papers/.test(u)) return route.fulfill({ json: [] });
    if (/\/rest\/v1\/(hwork_homeworks|students|hwork_submissions|tt_classes|assignments|teacher_accounts)/.test(u)) return route.fulfill({ json: [] });
    if (/\/rest\/v1\//.test(u)) {
      const q = new URL(u), sp = q.searchParams;
      if (q.pathname.endsWith('/reading_passages')) { let rows = P; if (sp.get('subject')) rows = rows.filter(x => (x.subject || '독서') === sp.get('subject').replace(/^eq\./, '')); if (sp.get('id')) rows = rows.filter(x => x.id === sp.get('id').replace(/^eq\./, '')); return route.fulfill({ json: rows }); }
      if (q.pathname.endsWith('/reading_items')) return route.fulfill({ json: I.filter(r => !sp.get('passage_id') || r.passage_id === sp.get('passage_id').replace(/^eq\./, '')) });
      return route.fulfill({ status: 404, json: {} });
    }
    if (u.startsWith('file://')) return route.continue();
    return route.fulfill({ status: 200, body: '' });
  });
  await lp.goto(PAGE + '?s=lit'); await lp.waitForSelector('#res .rc');
  t('문학 — 이름·작은 제목·창 제목', (await lp.textContent('h1')) === 'Shuefit 문학' && /문학 학습/.test(await lp.textContent('.subt')) && (await lp.title()) === 'Shuefit 문학');
  t('문학 — 문학 작품만·갈래 알약', (await lp.$$('#res .rc')).length === 1 && /전체 갈래/.test(await lp.textContent('#areas')) && /현대시/.test(await lp.textContent('#areas')));
  t('문학 — 검수 중 작품은 선생님 화면에 없음 · 안내', (await lp.$$('#res .rc')).length === 1 && /검수를 기다리는 작품 1개/.test(await lp.textContent('#pcnt')), await lp.textContent('#pcnt'));
  await lp.click('#res .rc'); await lp.waitForSelector('#list .notes');
  t('문학 — 기본 탭 작품 정리 · 작품 꼬리표', /작품 정리/.test(await lp.textContent('#lt')) && /가상 시 하나 · 시인 갑/.test(await lp.textContent('#pmeta')));
  const lchips = await lp.$$eval('#tchips .chip', a => a.map(x => x.textContent.replace(/\d+$/, '')));
  t('문학 — 유형 알약(작품 정리·참고자료 보기형·내신 기출, 자료의 새 유형도)', lchips.includes('작품 정리') && lchips.includes('참고자료 보기형') && lchips.includes('내신 기출') && lchips.includes('시어 의미'), lchips.join());
  t('문학 — 묶음 안내(시험지 = 내신 기출)', /학습자료 작품 정리 · OX 쉬움 · 핵심 정리 빈칸/.test(await lp.textContent('#bdlInfo')) && /시험지 내신 기출 \(3문항\)/.test(await lp.textContent('#bdlInfo')), await lp.textContent('#bdlInfo'));
  await lp.click('#tchips [data-t="30"]'); await lp.waitForSelector('#list .gpas');
  t('문학 — 내신 기출은 묶음마다 지문([1~2]·[3]) · 시는 줄바꿈', (await lp.$$('#list .gpas')).length === 2 && /\[1~2\]/.test(await lp.textContent('#list .gpas')) && (await lp.$$('#list .gpas p.poem')).length === 2);
  await lp.click('[data-bundle="exam"]');
  await lp.evaluate(() => { selDoc('study', true); });
  t('문학 — 내신 기출 문제지 = 묶음마다 지문 한 번', (await lp.textContent('#selN')) === '3문항' && (await lp.$$('#print .pas')).length === 2, [await lp.textContent('#selN'), (await lp.$$('#print .pas')).length]);
  await lp.evaluate(() => { document.body.classList.remove('printing'); SEL = []; selChanged(); });
  await lp.click('#tchips [data-t="notes"]');
  await lp.click('[data-bundle="study"]');
  t('문학 — 학습자료 묶음 담기', (await lp.textContent('#selN')) === '1문항 · 학습 자료 2' && /^Shuefit 문학: 가상 시 모음/.test(await lp.inputValue('#pTitle')), await lp.textContent('#selN'));
  await lp.fill('#hTeacher', '김선생');
  await lp.click('#paperSave');
  await lp.waitForFunction(() => /그대로예요/.test(document.querySelector('#paperMsg').textContent), null, { timeout: 8000 }).catch(() => {});
  const lsv = lw.find(w => /shufit_reading_papers\?on_conflict=subject,teacher,title/.test(w.u));
  t('문학 — 문제지 저장 subject 문학', !!lsv && JSON.parse(lsv.b)[0].subject === '문학', JSON.stringify(lw.map(w => w.u)));
  await lp.evaluate(() => { selDoc('study', true); });
  t('문학 — 학습지 머리 Shuefit 문학', /Shuefit 문학 · 1문항 · 학습 자료 2/.test(await lp.textContent('#print')) && /작품 정리/.test(await lp.textContent('#print')));
  if (process.env.SHOT) { await lp.evaluate(() => { document.body.classList.remove('printing'); }); await lp.screenshot({ path: process.env.SHOT + '/literature-make.png' }); }
  // [문항 올리기](2026-11-19) — 드라이브 폴더 열기 → [올렸어요] → 수정 요청함('슈핏 문항')으로 클로슈 알림
  await lp.evaluate(() => { document.body.classList.remove('printing'); setMode('make'); ShufitUpload._st.me = '김선생'; });
  await lp.click('#upBtn'); await lp.waitForSelector('#upHist .hr');
  t('문항 올리기 — 창·과목 기본 문학·폴더 링크', await lp.isVisible('#upBox') && (await lp.textContent('#upSubs .on')) === '문학' && /drive\.google\.com\/drive\/folders\/1VuoNjbAwcOvo9szEfgfKraKcH9-iZ_E3/.test(await lp.getAttribute('#upFold', 'href')) && /「문학」 폴더 열기/.test(await lp.textContent('#upFold')));
  t('문항 올리기 — 내 기록만(슈핏 문항·내 이름)·결과 메모', (await lp.$$('#upHist .hr')).length === 1 && /올림 · 원장님 검수/.test(await lp.textContent('#upHist')) && /132문항을 올렸어요/.test(await lp.textContent('#upHist')));
  await lp.click('#upSubs [data-us="독서"]');
  t('문항 올리기 — 과목 바꾸면 폴더도', /13sEk4G2U_-FngO8YZHY0lbhl4l7Sg1ap/.test(await lp.getAttribute('#upFold', 'href')));
  await lp.click('#upSubs [data-us="문학"]');
  await lp.fill('#upMemo', '수특 문학 30번'); await lp.check('#upNoHwp');
  await lp.click('#upGo'); await lp.waitForFunction(() => /클로슈에게 알렸어요/.test(document.querySelector('#upMsg').textContent));
  const up = upPosts.find(x => x.action === 'editReqAdd');
  t('문항 올리기 — 수정 요청함 본문', !!up && up.screen === '슈핏 문항' && up.writer === '김선생' && up.pw === 'sh' && /^\[슈핏 문항\] 문학 · 폴더 1VuoNjb/.test(up.text) && /메모: 수특 문학 30번/.test(up.text) && /표시: 한글 파일 없음/.test(up.text), up);
  await lp.evaluate(() => { ShufitUpload._st.admin = true; });
  await lp.keyboard.press('Escape');
  await lp.click('#upBtn'); await lp.waitForSelector('#upHist .hr');
  t('문항 올리기 — 원장님은 모든 선생님 기록', (await lp.$$('#upHist .hr')).length === 2 && /선생님들이 올린 기록/.test(await lp.textContent('#upHistT')));
  await lp.click('#upX');
  t('문항 올리기 — 닫기', await lp.isHidden('#upBack'));
  // 원장님 화면 — 검수 중 작품이 보이고 [검수 완료] → PATCH review 완료
  await lp.evaluate(() => { document.body.classList.remove('printing'); setMode('make'); ADMIN = true; ME = '이수경'; LIST = ALLLIST.filter(reviewOk); drawRes(); });
  t('문학 — 원장님은 검수 중 작품도 봄', (await lp.$$('#res .rc')).length === 2 && /검수 중/.test(await lp.textContent('#res')));
  await lp.click('#res .rc:has-text("검수 중 시")'); await lp.waitForSelector('#rvOk');
  t('문학 — 검수 중 꼬리표·올린 사람', /검수 중 · 김선생 올림/.test(await lp.textContent('#pmeta')));
  lp.once('dialog', d => d.accept());
  await lp.click('#rvOk');
  await lp.waitForFunction(() => !document.querySelector('#rvOk'));
  const rvw = lw.find(w => /reading_passages\?id=eq\.문학-검수중/.test(w.u));
  t('문학 — 검수 완료 저장', !!rvw && JSON.parse(rvw.b).review === '완료' && JSON.parse(rvw.b).reviewed_by === '이수경', rvw && rvw.b);
  t('문학 — 스크립트 오류 없음', lerr.length === 0, lerr);
  await lp.close();
  // ── Shuefit 화법·작문(2026-11-19) — 같은 화면, 주소 ?s=speech · ?s=writing ──
  for (const [k, nm, ar] of [['speech', '화법', '전체 영역'], ['writing', '작문', '전체 영역']]) {
    const sp2 = await b.newPage({ viewport: { width: 1280, height: 900 } });
    const se = []; sp2.on('pageerror', e => se.push(e.message));
    let asked = '';
    await sp2.route('**/*', async route => {
      const u = route.request().url();
      if (/\/rest\/v1\/reading_passages/.test(u)) { asked = decodeURIComponent(u); return route.fulfill({ json: [] }); }
      if (/\/rest\/v1\//.test(u)) return route.fulfill({ json: [] });
      if (u.startsWith('file://')) return route.continue();
      return route.fulfill({ status: 200, body: '' });
    });
    await sp2.goto(PAGE + '?s=' + k);
    await sp2.waitForFunction(() => /아직 올린/.test(document.querySelector('#pcnt').textContent));
    t(nm + ' — 이름·작은 제목·빈 안내·과목 조건', (await sp2.textContent('h1')) === 'Shuefit ' + nm && new RegExp(nm + ' 학습').test(await sp2.textContent('.subt'))
      && new RegExp('아직 올린 ' + nm).test(await sp2.textContent('#pcnt')) && asked.includes('subject=eq.' + nm) && se.length === 0, [asked, se]);
    await sp2.close();
  }

  const m = await b.newPage({ viewport: { width: 390, height: 844 } });
  await m.route('**/*', r => pg.context() && r.request().url().startsWith('file://') ? r.continue() : (/rest\/v1\/reading_passages/.test(r.request().url()) && !/id=eq/.test(r.request().url()) ? r.fulfill({ json: P }) : r.fulfill({ status: 200, body: /auth/.test(r.request().url()) ? '{"access_token":"tok"}' : '[]' })));
  await m.goto(PAGE); await m.waitForSelector('#res .rc');
  t('휴대폰 가로 넘침 없음', await m.evaluate(() => document.documentElement.scrollWidth) <= 390);

  t('스크립트 오류 없음', errs.length === 0, errs);
  await b.close();
  console.log(`reading-e2e: ${ok} 통과 / ${bad} 실패`);
  process.exit(bad ? 1 : 0);
})();
