/* 쇼츠 편집기 브라우저 E2E (2026-10-08)
 * ffmpeg로 만든 작은 영상(vp9/opus webm — 크로미엄이 바로 읽는 형식)을 실제 shorts.html에 넣어
 *   ① 영상 고르기(길이·크기 표시, 구간 기본값, 썸네일 12장, 못 읽는 파일 안내)
 *   ② 구간 자르기(입력칸·손잡이 끌기·지금 위치로·60초 넘김 경고)
 *   ③ 세로 화면(가득 채우기·흐린 배경·단색 배경이 실제로 다르게 그려짐)
 *   ④ 자막(추가·내용·색·시간 — 캔버스에 그 색 픽셀이 생김, 시간 밖이면 없음)
 *   ⑤ 내보내기(WebCodecs → mp4 내려받기 → ffprobe로 길이·크기·영상/소리 트랙 확인, 그만두기)
 *   ⑥ WebCodecs가 없는 브라우저 → MediaRecorder 녹화(webm) 폴백
 *   ⑦ 휴대폰 폭 가로 스크롤 없음 · 키보드
 * 를 검사한다. 외부로는 아무것도 보내지 않는다(구글 폰트 요청은 막는다).
 *   실행: NODE_PATH=$(npm root -g) node tools/shorts-e2e-test.js   (ffmpeg·ffprobe 필요)
 */
'use strict';
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');
process.env.LC_ALL = 'C.UTF-8';   // 로캘이 UTF-8이 아니면 크로미엄이 한글 파일 이름을 'download'로 바꾼다(실제 기기와 무관)

const ROOT = path.join(__dirname, '..');
const PORT = 8947;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webm': 'video/webm', '.mp4': 'video/mp4' };
let n = 0, bad = 0, pageErrors = 0;
function ok(cond, label){ n++; if (!cond){ bad++; console.error('  ✗', label); } else console.log('  ✓', label); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'shorts-e2e-'));

function ffmpeg(args){ execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' }); }
function probe(file){
  const out = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name,width,height:format=duration', '-of', 'json', file]).toString();
  const j = JSON.parse(out);
  return { dur: parseFloat(j.format.duration), streams: j.streams };
}
function makeVideos(){
  const short = path.join(TMP, 'short.webm'), long = path.join(TMP, 'long.webm'), h264 = path.join(TMP, 'h264.mp4');
  ffmpeg(['-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=30', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', '8', '-c:v', 'libvpx-vp9', '-b:v', '600k', '-c:a', 'libopus', '-b:a', '64k', short]);
  ffmpeg(['-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=15', '-f', 'lavfi', '-i', 'sine=frequency=330:sample_rate=48000', '-t', '70', '-c:v', 'libvpx-vp9', '-b:v', '200k', '-c:a', 'libopus', '-b:a', '48k', long]);
  ffmpeg(['-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=30', '-t', '3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', h264]);
  return { short, long, h264 };
}

function serve(){
  return http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    let p = path.join(ROOT, decodeURIComponent(u.pathname));
    if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()){ res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
    fs.createReadStream(p).pipe(res);
  }).listen(PORT);
}

async function openPage(browser, opts){
  const ctx = await browser.newContext(Object.assign({ acceptDownloads: true, viewport: { width: 1200, height: 900 } }, opts && opts.ctx));
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  if (opts && opts.init) await ctx.addInitScript(opts.init);
  const page = await ctx.newPage();
  page.on('pageerror', e => console.error('  [pageerror]', e.message));
  await page.goto('http://localhost:' + PORT + '/shorts.html');
  return { ctx, page };
}
const S = page => page.evaluate(() => { const s = window.__shorts.S; return { dur: s.dur, w: s.w, h: s.h, start: s.start, end: s.end, mode: s.mode, posX: s.posX, zoom: s.zoom, caps: s.caps, playing: s.playing, exporting: s.exporting }; });
// 캔버스에 특정 색 픽셀이 몇 개인지(자막·배경 검사)
const countColor = (page, t, hex, tol) => page.evaluate(([t, hex, tol]) => {
  const c = document.createElement('canvas'); c.width = 270; c.height = 480; const x = c.getContext('2d');
  window.__shorts.V.currentTime = window.__shorts.V.currentTime;   // 지금 프레임 그대로
  window.__shorts.drawFrame(x, 270, 480, t);
  const d = x.getImageData(0, 0, 270, 480).data, R = parseInt(hex.slice(1, 3), 16), G = parseInt(hex.slice(3, 5), 16), B = parseInt(hex.slice(5, 7), 16);
  let k = 0; for (let i = 0; i < d.length; i += 4){ if (Math.abs(d[i] - R) <= tol && Math.abs(d[i + 1] - G) <= tol && Math.abs(d[i + 2] - B) <= tol) k++; }
  return k;
}, [t, hex, tol]);

(async () => {
  const vids = makeVideos();
  const server = serve();
  const browser = await chromium.launch();
  try {
    /* ---------- ① 영상 고르기 ---------- */
    console.log('① 영상 고르기');
    let { ctx, page } = await openPage(browser);
    ok(await page.evaluate(() => window.__shorts.ENGINE) === 'webcodecs', '크로미엄은 WebCodecs 방식으로 내보낸다');
    ok(await page.$eval('#s-trim', e => e.classList.contains('off')), '영상 전에는 아래 단계가 잠겨 있다');
    await page.setInputFiles('#file', vids.short);
    await page.waitForFunction(() => window.__shorts.S.dur > 0);
    let s = await S(page);
    ok(Math.abs(s.dur - 8) < .1 && s.w === 640 && s.h === 360, '길이 8초 · 640×360을 읽었다');
    ok((await page.textContent('#fmeta')).includes('0:08.0') && (await page.textContent('#fmeta')).includes('640×360'), '파일 정보 줄에 길이·크기');
    ok(s.start === 0 && Math.abs(s.end - 8) < .1, '구간 기본값 = 처음부터 끝까지(8초는 60초 안)');
    ok(!(await page.$eval('#s-export', e => e.classList.contains('off'))), '내보내기 단계가 열렸다');
    await page.waitForFunction(() => document.querySelectorAll('#thumbs img').length === 12, null, { timeout: 15000 });
    ok((await page.$$('#thumbs img')).length === 12, '썸네일 12장');
    ok(await page.$eval('#pvEmpty', e => e.classList.contains('hide')), '미리보기 안내 글이 사라졌다');

    /* ---------- ② 구간 자르기 ---------- */
    console.log('② 구간 자르기');
    await page.fill('#tStart', '0:01.0'); await page.dispatchEvent('#tStart', 'change');
    await page.fill('#tEnd', '0:04.0'); await page.dispatchEvent('#tEnd', 'change');
    s = await S(page);
    ok(Math.abs(s.start - 1) < .01 && Math.abs(s.end - 4) < .01, '입력칸으로 1.0~4.0초');
    ok((await page.textContent('#tLen')) === '3.0초', '선택 구간 3.0초 표시');
    await page.fill('#tEnd', '0:00.5'); await page.dispatchEvent('#tEnd', 'change');
    s = await S(page);
    ok(s.end >= s.start + .19, '끝이 시작보다 앞으로 못 간다(최소 0.2초)');
    await page.fill('#tEnd', '0:04.0'); await page.dispatchEvent('#tEnd', 'change');
    // 오른쪽 손잡이 끌기 → 끝이 바뀐다
    const tl = await page.$('#tl'); const box = await tl.boundingBox();
    const hr = await (await page.$('#hdR')).boundingBox();
    await page.mouse.move(hr.x + hr.width / 2, hr.y + hr.height / 2); await page.mouse.down();
    await page.mouse.move(box.x + box.width * .75, hr.y + hr.height / 2, { steps: 6 }); await page.mouse.up();
    s = await S(page);
    ok(Math.abs(s.end - 6) < .4, '오른쪽 손잡이를 끌어 끝을 6초쯤으로 (' + s.end.toFixed(2) + ')');
    // 줄을 누르면 그 자리로 이동
    await page.mouse.click(box.x + box.width * .5, box.y + box.height / 2);
    await page.waitForFunction(() => Math.abs(window.__shorts.V.currentTime - 4) < .3);
    ok(true, '줄을 누르면 미리보기가 그 시각(4초)으로');
    await page.click('#setStart');
    s = await S(page);
    ok(Math.abs(s.start - 4) < .3, '[지금 위치로]가 시작을 4초로');
    await page.fill('#tStart', '0:01.0'); await page.dispatchEvent('#tStart', 'change');
    await page.fill('#tEnd', '0:04.0'); await page.dispatchEvent('#tEnd', 'change');
    ok(await page.$eval('#tWarn', e => e.classList.contains('hide')), '3초 구간에는 경고 없음');

    /* ---------- ③ 세로 화면 ---------- */
    console.log('③ 세로 화면');
    await page.evaluate(() => new Promise(r => { const v = window.__shorts.V; v.addEventListener('seeked', r, { once: true }); v.currentTime = 2; }));
    await page.click('#modePills [data-mode="color"]');
    await page.click('#bgPills [data-bg="#FFFFFF"]');
    const white = await countColor(page, 2, '#FFFFFF', 3);
    ok(white > 270 * 480 * .3, '단색 배경(흰색)이면 위아래가 흰색으로 채워진다 (' + white + 'px)');
    ok(!(await page.$eval('#colorOpts', e => e.classList.contains('hide'))) && (await page.$eval('#fillOpts', e => e.classList.contains('hide'))), '단색 배경에서는 배경색 알약만 보인다');
    await page.click('#modePills [data-mode="fill"]');
    const whiteFill = await countColor(page, 2, '#FFFFFF', 3);
    ok(whiteFill < white * .5, '가득 채우기면 흰 배경이 사라진다 (' + whiteFill + 'px)');
    await page.click('#modePills [data-mode="blur"]');
    const whiteBlur = await countColor(page, 2, '#FFFFFF', 3);
    ok(whiteBlur < white * .5, '흐린 배경도 흰 배경이 아니다 (' + whiteBlur + 'px)');
    ok((await page.textContent('#frameNote')).includes('배경'), '흐린 배경 안내 문구');
    await page.click('#modePills [data-mode="fill"]');
    await page.$eval('#posX', e => { e.value = 0; e.dispatchEvent(new Event('input', { bubbles: true })); });
    ok((await S(page)).posX === 0 && (await page.textContent('#posXv')) === '왼쪽', '보이는 위치 슬라이더 → 왼쪽');
    await page.$eval('#zoom', e => { e.value = 150; e.dispatchEvent(new Event('input', { bubbles: true })); });
    ok((await S(page)).zoom === 1.5 && (await page.textContent('#zoomv')) === '150%', '확대 150%');
    await page.$eval('#posX', e => { e.value = 50; e.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.$eval('#zoom', e => { e.value = 100; e.dispatchEvent(new Event('input', { bubbles: true })); });

    /* ---------- ④ 자막 ---------- */
    console.log('④ 자막');
    ok(!(await page.$eval('#capEmpty', e => e.classList.contains('hide'))), '처음엔 자막 없음 안내');
    await page.click('#addCap');
    s = await S(page);
    ok(s.caps.length === 1 && Math.abs(s.caps[0].start - 2) < .05 && Math.abs(s.caps[0].end - 4) < .05, '[자막 추가] = 지금 위치(2초)부터 3초, 구간 끝(4초)에서 잘림');
    await page.fill('.cap textarea', '이수경국어\n슈퍼스타');
    await page.click('.cap [data-k="color"] [data-v="yellow"]');
    await page.click('.cap [data-k="style"] [data-v="none"]');
    await page.click('.cap [data-k="size"] [data-v="xl"]');
    s = await S(page);
    ok(s.caps[0].text === '이수경국어\n슈퍼스타' && s.caps[0].color === 'yellow' && s.caps[0].style === 'none' && s.caps[0].size === 'xl', '내용·색·꾸밈·크기가 저장된다');
    const yIn = await countColor(page, 3, '#FFE25A', 6), yOut = await countColor(page, 1.5, '#FFE25A', 6);
    ok(yIn > 150, '자막 시간 안(3초)에는 노란 글자 픽셀이 그려진다 (' + yIn + 'px)');
    ok(yOut < 20, '자막 시간 밖(1.5초)에는 없다 (' + yOut + 'px)');
    await page.fill('.cap [data-k="start"]', '0:01.0'); await page.dispatchEvent('.cap [data-k="start"]', 'change');
    s = await S(page);
    ok(Math.abs(s.caps[0].start - 1) < .01, '자막 시작 시간 입력칸');
    await page.click('#addTitle');
    s = await S(page);
    ok(s.caps.length === 2 && s.caps[1].pos === 'top' && Math.abs(s.caps[1].start - 1) < .01 && Math.abs(s.caps[1].end - 4) < .01 && s.caps[1].font === 'dohyeon', '[제목 추가] = 구간 전체 · 위 · 도현체');
    ok((await page.$$('.cap')).length === 2, '자막 카드 2장');
    await page.click('.cap[data-id="2"] [data-act="del"]');
    ok((await S(page)).caps.length === 1 && (await page.$$('.cap')).length === 1, '[지우기]로 자막이 빠진다');

    /* ---------- ⑤ 내보내기 ---------- */
    console.log('⑤ 내보내기 (WebCodecs → mp4)');
    await page.click('#sizePills [data-size="720"]');
    const dlP = page.waitForEvent('download', { timeout: 120000 });
    await page.click('#go');
    ok(await page.evaluate(() => window.__shorts.S.exporting), '내보내는 동안 exporting');
    ok(await page.$eval('#go', e => e.disabled), '버튼이 잠긴다');
    const dl = await dlP;
    const out = path.join(TMP, 'out.mp4'); await dl.saveAs(out);
    ok(/^쇼츠_short_\d{6}\.mp4$/.test(dl.suggestedFilename()), '파일 이름 쇼츠_short_날짜.mp4 (' + dl.suggestedFilename() + ')');
    await page.waitForFunction(() => document.querySelector('#result').classList.contains('show'));
    ok(fs.statSync(out).size > 20000, 'mp4 파일 크기 ' + fs.statSync(out).size);
    const p = probe(out);
    const vs = p.streams.find(x => x.codec_type === 'video'), as = p.streams.find(x => x.codec_type === 'audio');
    ok(Math.abs(p.dur - 3) < .25, 'ffprobe 길이 ≈ 3초 (' + p.dur + ')');
    ok(vs && vs.width === 720 && vs.height === 1280, '720×1280 영상 트랙 (' + (vs && vs.codec_name) + ')');
    ok(!!as, '소리 트랙이 있다 (' + (as && as.codec_name) + ')');
    ok((await page.textContent('#rMeta')).includes('3.0초'), '결과 줄에 길이');
    ok(!(await page.$eval('#go', e => e.disabled)) && !(await S(page)).exporting, '끝나면 버튼이 풀린다');
    // 그만두기
    await page.click('#sizePills [data-size="1080"]');
    await page.click('#go');
    await page.waitForFunction(() => /영상을 만드는 중/.test(document.querySelector('#pmsg').textContent), null, { timeout: 30000 });
    await page.click('#cancel');
    await page.waitForFunction(() => !window.__shorts.S.exporting);
    ok(await page.$eval('#progWrap', e => e.classList.contains('hide')) && !(await page.$eval('#result', e => e.classList.contains('show'))), '[그만두기]면 진행 줄이 닫히고 결과가 없다');
    ok(await page.$eval('#xerr', e => e.classList.contains('hide')), '그만둔 것은 오류로 보이지 않는다');

    /* ---------- ⑦ 키보드·긴 영상·못 읽는 파일 ---------- */
    console.log('⑦ 키보드 · 긴 영상 · 못 읽는 파일');
    await page.click('body');
    await page.keyboard.press('Space');
    await page.waitForFunction(() => window.__shorts.S.playing);
    ok(true, '스페이스로 재생');
    await sleep(400);
    await page.keyboard.press('Space');
    ok(!(await S(page)).playing, '다시 누르면 멈춤');
    await page.setInputFiles('#file', vids.long);
    await page.waitForFunction(() => window.__shorts.S.dur > 60);
    s = await S(page);
    ok(Math.abs(s.end - 60) < .01 && s.caps.length === 0, '긴 영상은 처음 60초가 선택되고 자막은 비워진다');
    await page.fill('#tEnd', '1:10.0'); await page.dispatchEvent('#tEnd', 'change');
    ok(!(await page.$eval('#tWarn', e => e.classList.contains('hide'))) && (await page.textContent('#tWarn')).includes('60초'), '60초를 넘기면 경고');
    await page.setInputFiles('#file', vids.h264);
    await page.waitForFunction(() => !document.querySelector('#ferr').classList.contains('hide') || window.__shorts.S.dur > 2 && window.__shorts.S.dur < 4, null, { timeout: 15000 });
    const errShown = !(await page.$eval('#ferr', e => e.classList.contains('hide')));
    ok(errShown ? (await page.textContent('#ferr')).includes('열지 못합니다') : (await S(page)).w === 320, errShown ? '못 읽는 형식(H.264 없는 크로미엄)은 안내 문구' : '이 크로미엄은 H.264도 읽는다 — 안내 분기 생략');
    await ctx.close();

    /* ---------- ⑥ MediaRecorder 폴백 ---------- */
    console.log('⑥ WebCodecs 없는 브라우저 → 녹화 방식');
    ({ ctx, page } = await openPage(browser, { init: () => { delete window.VideoEncoder; } }));
    ok(await page.evaluate(() => window.__shorts.ENGINE) === 'recorder', 'VideoEncoder가 없으면 녹화 방식');
    ok((await page.textContent('#engineTag')).includes('녹화'), '안내 태그');
    await page.setInputFiles('#file', vids.short);
    await page.waitForFunction(() => window.__shorts.S.dur > 0);
    await page.fill('#tStart', '0:01.0'); await page.dispatchEvent('#tStart', 'change');
    await page.fill('#tEnd', '0:03.0'); await page.dispatchEvent('#tEnd', 'change');
    await page.click('#sizePills [data-size="720"]');
    const dl2P = page.waitForEvent('download', { timeout: 60000 });
    await page.click('#go');
    const dl2 = await dl2P;
    const out2 = path.join(TMP, 'out2.' + dl2.suggestedFilename().split('.').pop()); await dl2.saveAs(out2);
    ok(/^쇼츠_short_\d{6}\.(webm|mp4)$/.test(dl2.suggestedFilename()), '녹화 파일 이름 (' + dl2.suggestedFilename() + ')');
    await page.waitForFunction(() => document.querySelector('#result').classList.contains('show'));
    const p2 = probe(out2);
    ok(Math.abs(p2.dur - 2) < 1, '녹화 길이 ≈ 2초 (' + p2.dur + ')');
    const vs2 = p2.streams.find(x => x.codec_type === 'video');
    ok(vs2 && vs2.width === 720 && vs2.height === 1280, '녹화도 720×1280 (' + (vs2 && vs2.codec_name) + ')');
    ok(!!p2.streams.find(x => x.codec_type === 'audio'), '녹화에도 소리 트랙');
    if (out2.endsWith('.webm')) ok((await page.textContent('#rNote')).includes('webm'), 'webm으로 만들었다는 안내');
    await ctx.close();

    /* ---------- ⑧ 휴대폰 폭 ---------- */
    console.log('⑧ 휴대폰 폭');
    ({ ctx, page } = await openPage(browser, { ctx: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } }));
    await page.setInputFiles('#file', vids.short);
    await page.waitForFunction(() => window.__shorts.S.dur > 0);
    await page.click('#addCap');
    ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), '390px에서 가로 스크롤 없음');
    const pvBox = await (await page.$('.stage')).boundingBox();
    ok(pvBox.width <= 300 && pvBox.height < 844 * .85, '미리보기가 화면에 들어온다 (' + Math.round(pvBox.width) + '×' + Math.round(pvBox.height) + ')');
    await ctx.close();
  } finally {
    await browser.close(); server.close();
    try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e){}
  }
  ok(pageErrors === 0, '페이지 오류 없음 (' + pageErrors + ')');
  console.log('\n' + n + '건 중 ' + (n - bad) + '건 통과' + (bad ? ', ' + bad + '건 실패' : ''));
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
