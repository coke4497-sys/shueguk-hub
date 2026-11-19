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

(async () => {
  const b = await chromium.launch();
  const pg = await b.newPage({ viewport: { width: 1280, height: 1000 } });
  const errs = [], reqs = [];
  pg.on('pageerror', e => errs.push(e.message));
  await pg.route('**/*', async route => {
    const u = route.request().url();
    if (/\/auth\/v1\/token/.test(u)) return route.fulfill({ json: { access_token: 'tok', expires_in: 3600 } });
    if (/\/rest\/v1\//.test(u)) {
      reqs.push({ u: decodeURIComponent(u), auth: route.request().headers()['authorization'] });
      const q = new URL(u); const sp = q.searchParams;
      const like = (sp.get('plain') || '').replace(/^ilike\.\*|\*$/g, '');
      if (q.pathname.endsWith('/reading_passages')) {
        let rows = P;
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
  t('최근 출처 먼저(order=src.desc)', reqs[0].u.includes('order=src.desc'));
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
  t('찾은 문항 1개(기본)', (await pg.$$('#list .q')).length === 1);
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
  t('OX v1·v2', (await pg.$$('#list .q')).length === 2 && (await pg.$$eval('#list .tag.lav', a => a.map(x => x.textContent))).join() === 'v1,v2');
  await pg.click('#tchips [data-t="09"]');
  t('그림자료 그림', (await pg.$$('#list img')).length === 1);
  await pg.click('#tchips [data-t="99"]');
  t('99 독립 지문으로 바뀜', (await pg.textContent('#pas')).includes('독립 지문 글'));
  await pg.click('#tchips [data-t="notes"]');
  t('핵심정리 요약 상자', (await pg.$$('#list .sum')).length === 1 && (await pg.$$('#list .easy')).length === 1);
  await pg.click('#tchips [data-t="10"]');
  t('요약 빈칸 번호(학생 화면은 답 없음)', (await pg.textContent('#list .blank')) === '1');
  await pg.click('[data-lv="실력"]');
  t('실력으로 바꾸면 실력 문항', /변형 문항\(실력\) 1/.test(await pg.textContent('#tot')));

  await pg.evaluate(() => window.__printDoc('study', true));
  const st = await pg.textContent('#print');
  t('학습자료 교사용 — 머리·지문·핵심정리·빈칸 답', st.includes('Shuefit 독서 · 실력 · 교사용') && st.includes('시장에는') && st.includes('쉽게 요약') && /가격/.test(await pg.textContent('#print .blank')));
  await pg.evaluate(() => document.body.classList.remove('printing'));
  await pg.click('[data-lv="기본"]');
  await pg.evaluate(() => window.__printDoc('exam', false));
  t('시험지 — 원 기출 2 + 고난도 1 + 보기형 1', (await pg.$$('#print .q')).length === 4 && (await pg.textContent('#print .ins')).includes('[1~4]'));
  t('시험지 답안 기록표', (await pg.$$('#print .omr td')).length === 8);
  t('학생용엔 정답 표시 없음', (await pg.$$('#print .opts li.ok')).length === 0);
  await pg.evaluate(() => document.body.classList.remove('printing'));
  await pg.evaluate(() => window.__printDoc('exam', true));
  t('교사용 정답 동그라미', (await pg.$$('#print .opts li.ok')).length >= 3);
  await pg.evaluate(() => document.body.classList.remove('printing'));

  // 다른 지문(실력 없음) — 난도 알약 잠김
  await pg.click('#res .rc:nth-child(2)'); await pg.waitForFunction(() => /가상 진화/.test(document.querySelector('#pmeta').textContent));
  t('실력 없는 지문은 실력 잠김', await pg.$eval('[data-lv="실력"]', e => e.disabled));

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
  await pg.evaluate(() => window.__printDoc('exam', false));
  t('교과서 시험지 — 모의고사형 2', (await pg.$$('#print .q')).length === 2 && (await pg.textContent('#print .ins')).includes('[1~2]'));
  await pg.evaluate(() => document.body.classList.remove('printing'));
  await pg.selectOption('#exset', '15,16');
  await pg.evaluate(() => window.__printDoc('exam', true));
  t('교과서 시험지 — 고난도·1등급 2, 교사용 정답', (await pg.$$('#print .q')).length === 2 && (await pg.$$('#print .opts li.ok')).length === 2);
  await pg.evaluate(() => document.body.classList.remove('printing'));
  await pg.evaluate(() => window.__printDoc('study', true));
  t('교과서 학습자료 — OX 2·키워드 빈칸·문단 정리 빈칸 답', (await pg.$$('#print .oxl')).length === 2 && /문화/.test(await pg.textContent('#print')));
  await pg.evaluate(() => document.body.classList.remove('printing'));
  await pg.click('#areas [data-area=""]'); await pg.click('#res .rc:nth-child(1)');
  await pg.waitForFunction(() => /가상 시장/.test(document.querySelector('#pmeta').textContent));
  t('모의고사 지문으로 돌아가면 난도·원 기출', (await pg.$$('#pmeta [data-lv]')).length === 2 && await pg.$eval('#tchips .chip.on', e => e.dataset.t) === 'orig' && !(await pg.$eval('#exsetw', e => e.classList.contains('on'))));

  const m = await b.newPage({ viewport: { width: 390, height: 844 } });
  await m.route('**/*', r => pg.context() && r.request().url().startsWith('file://') ? r.continue() : (/rest\/v1\/reading_passages/.test(r.request().url()) && !/id=eq/.test(r.request().url()) ? r.fulfill({ json: P }) : r.fulfill({ status: 200, body: /auth/.test(r.request().url()) ? '{"access_token":"tok"}' : '[]' })));
  await m.goto(PAGE); await m.waitForSelector('#res .rc');
  t('휴대폰 가로 넘침 없음', await m.evaluate(() => document.documentElement.scrollWidth) <= 390);

  t('스크립트 오류 없음', errs.length === 0, errs);
  await b.close();
  console.log(`reading-e2e: ${ok} 통과 / ${bad} 실패`);
  process.exit(bad ? 1 : 0);
})();
