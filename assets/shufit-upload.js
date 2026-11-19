/* Shuefit [문항 올리기] — 선생님이 드라이브 「슈핏 문항 올리기」 과목 폴더에 한글 파일·PDF 를 넣고 [올렸어요]를 누르면
 * 수정 요청함('수정요청' 탭, 화면 '슈핏 문항')에 한 줄을 남겨 클로슈를 바로 부른다(PR #329 즉시 알림 — 운영 시간엔 매시 순찰도).
 * 클로슈가 새 파일을 받아 변환해 '검수 중'으로 올리고, 결과는 처리메모(이 창의 '올린 기록')와 슈톡 알림으로 알린다.
 * (2026-11-19 원장님 "문항 올리기 버튼 만들어 주세요" — 검수는 원장님만, 리포트 086·087)
 * 쓰는 곳: shufit_grammar.html · shufit_reading.html(독서·문학·화법·작문) — ShufitUpload.mount('문학') */
(function (W) {
  var REPORT_API = 'https://script.google.com/macros/s/AKfycbzhCncBwn-JlqXARC3wfrWUCuNHzlNK2df0bdhx-w78Xr8mzYUcIYZOJdRi9N4bHtsb/exec';
  var SCREEN = '슈핏 문항';
  // 원장님 드라이브 「슈핏 문항 올리기」 과목 폴더(선생님마다 초대 — 링크만으로는 열리지 않는다)
  var FOLDERS = {
    '문법': '1GBwN0d8qvCAe5pqbIOP_mCRwCjlqzEOr', '독서': '13sEk4G2U_-FngO8YZHY0lbhl4l7Sg1ap', '문학': '1VuoNjbAwcOvo9szEfgfKraKcH9-iZ_E3',
    '화법': '184CHg6AwxkxmFX4f7y-pSPFjAtxih1s_', '작문': '1iKh50yWYeVpBll8GDCn4POQYBrAt-s_t'
  };
  var SUBS = ['문법', '독서', '문학', '화법', '작문'];
  var st = { sub: '독서', me: '', admin: false, rows: null, busy: false };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function $(id) { return document.getElementById(id); }
  function folderUrl(s) { return 'https://drive.google.com/drive/folders/' + FOLDERS[s]; }

  var CSS = '.upbtn{border:0;border-radius:999px;background:#e6e2f2;color:#4a4266;font:inherit;font-size:13.5px;padding:9px 16px;cursor:pointer;white-space:nowrap}' +
    '.upbtn:hover{background:#ddd6ee}' +
    '#upBack{position:fixed;inset:0;background:rgba(30,40,35,.38);display:flex;align-items:flex-start;justify-content:center;z-index:200;padding:40px 16px;overflow:auto}' +
    '#upBack[hidden]{display:none}' +
    '#upBox{background:#fff;border-radius:24px;max-width:560px;width:100%;padding:24px 24px 20px;box-shadow:0 12px 40px rgba(0,0,0,.18);font-family:"Gowun Dodum",sans-serif;color:#2a332f}' +
    '#upBox h2{font-family:"Gowun Batang",serif;font-size:22px;margin:0;font-weight:700}' +
    '#upBox .uph{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px}' +
    '#upBox .upx{width:36px;height:36px;border-radius:50%;border:0;background:#f2f5f3;font-size:18px;cursor:pointer;color:#4f5c56}' +
    '#upBox .upd{font-size:13px;color:#5c6a64;margin:0 0 14px;line-height:1.6}' +
    '#upBox .ups{display:flex;gap:6px;flex-wrap:wrap;margin:0 0 14px}' +
    '#upBox .ups button{border:0;border-radius:999px;padding:8px 14px;background:#f2f5f3;color:#4f5c56;font:inherit;font-size:13.5px;cursor:pointer}' +
    '#upBox .ups button.on{background:#4a3f63;color:#fff}' +
    '#upBox .step{background:#f6f7f4;border-radius:16px;padding:14px 16px;margin:0 0 10px}' +
    '#upBox .step b.n{display:inline-block;width:22px;height:22px;border-radius:50%;background:#4a3f63;color:#fff;text-align:center;line-height:22px;font-size:12px;margin-right:6px;font-weight:400}' +
    '#upBox .step .t{font-size:14.5px;font-weight:700;margin-bottom:8px}' +
    '#upBox .step ul{margin:8px 0 0;padding-left:18px;font-size:12.5px;color:#4f5c56;line-height:1.7}' +
    '#upBox a.fold{display:inline-block;background:#fff;border-radius:999px;padding:9px 16px;color:#2f5a50;text-decoration:none;font-size:14px;border:1px solid #cfe0d8}' +
    '#upBox textarea{width:100%;box-sizing:border-box;min-height:70px;border:1px solid #dfe5e1;border-radius:12px;padding:10px;font:inherit;font-size:14px;background:#fff;resize:vertical}' +
    '#upBox .chk{display:flex;gap:14px;flex-wrap:wrap;font-size:13px;color:#4f5c56;margin-top:8px}' +
    '#upBox .go{width:100%;height:50px;border:0;border-radius:14px;background:#4a3f63;color:#fff;font:inherit;font-size:15px;cursor:pointer;margin-top:4px}' +
    '#upBox .go:disabled{opacity:.5;cursor:default}' +
    '#upBox .msg{font-size:13px;margin:8px 0 0;min-height:18px}' +
    '#upBox .msg.ok{color:#2f5a50}#upBox .msg.err{color:#b0525d}' +
    '#upBox .hist{margin-top:18px;border-top:1px solid #e5ede8;padding-top:14px}' +
    '#upBox .hist h3{font-size:15px;margin:0 0 8px;font-family:"Gowun Batang",serif}' +
    '#upBox .hr{border-radius:12px;background:#fafbf9;padding:10px 12px;margin:0 0 6px;font-size:13px;line-height:1.55}' +
    '#upBox .hr .top{display:flex;gap:6px;align-items:center;flex-wrap:wrap}' +
    '#upBox .hr .pl{border-radius:999px;padding:2px 9px;font-size:12px}' +
    '#upBox .pl.w{background:#fdf0dc;color:#8a5a14}#upBox .pl.d{background:#d7ece4;color:#2f5a50}#upBox .pl.h{background:#f7e2de;color:#9b4a40}' +
    '#upBox .hr .memo{color:#4f5c56;margin-top:4px;white-space:pre-wrap}' +
    '#upBox .hr .res{color:#2a332f;margin-top:4px;white-space:pre-wrap}' +
    '#upBox .none{font-size:13px;color:#5c6a64}' +
    '@media(max-width:560px){#upBack{padding:16px 10px}#upBox{padding:20px 16px 16px}}';

  function html() {
    return '<div id="upBox" role="dialog" aria-modal="true" aria-labelledby="upTitle">' +
      '<div class="uph"><h2 id="upTitle">문항 올리기</h2><button class="upx" type="button" id="upX" aria-label="닫기">×</button></div>' +
      '<p class="upd">드라이브 과목 폴더에 파일을 넣고 [올렸어요]를 누르면 클로슈가 변환해 올립니다. 원장님 검수가 끝나면 모든 선생님이 출제할 수 있어요.</p>' +
      '<div class="ups" id="upSubs"></div>' +
      '<div class="step"><div class="t"><b class="n">1</b>드라이브 폴더에 파일을 넣습니다</div><a class="fold" id="upFold" target="_blank" rel="noopener"></a>' +
      '<ul><li>한글 파일(HWP·HWPX)과 같은 이름의 PDF를 함께 넣어 주세요.</li><li>한글 파일이 없으면 PDF만 넣어도 됩니다. 아래에 표시해 주세요.</li>' +
      '<li>내신 기출 모음은 이름을 <b>[기출]작품명(작가).pdf</b>로 해 주세요.</li><li>폴더가 열리지 않으면 원장님께 초대를 부탁해 주세요.</li></ul></div>' +
      '<div class="step"><div class="t"><b class="n">2</b>메모 <span style="font-weight:400;font-size:12.5px;color:#5c6a64">· 선택</span></div>' +
      '<textarea id="upMemo" maxlength="400" placeholder="예) 26 수능특강 문학 29~31 세 작품 · 31번은 기출 PDF만 있어요"></textarea>' +
      '<div class="chk"><label><input type="checkbox" id="upNoHwp"> 한글 파일 없음 (PDF만)</label><label><input type="checkbox" id="upScan"> 스캔본 (글자가 긁히지 않는 PDF)</label></div></div>' +
      '<button class="go" type="button" id="upGo">올렸어요 · 클로슈에게 알리기</button>' +
      '<div class="msg" id="upMsg"></div>' +
      '<div class="hist"><h3 id="upHistT">내가 올린 기록</h3><div id="upHist"><div class="none">불러오는 중…</div></div></div>' +
      '</div>';
  }

  function drawSubs() {
    $('upSubs').innerHTML = SUBS.map(function (s) { return '<button type="button" data-us="' + s + '"' + (s === st.sub ? ' class="on"' : '') + '>' + s + '</button>'; }).join('');
    var a = $('upFold'); a.href = folderUrl(st.sub); a.textContent = '「' + st.sub + '」 폴더 열기 ↗';
  }

  function parseRow(r) {
    var t = String(r.text || ''), m = t.match(/^\[슈핏 문항\]\s*(\S+)/);
    return { sub: m ? m[1] : '', memo: (t.match(/메모:\s*([\s\S]*?)(?:\n표시:|$)/) || [])[1] || '', flag: (t.match(/표시:\s*(.*)/) || [])[1] || '' };
  }
  function stLabel(s) {
    if (s === '처리 완료') return '<span class="pl d">올림 · 원장님 검수</span>';
    if (s === '보류') return '<span class="pl h">확인 필요</span>';
    return '<span class="pl w">클로슈가 처리 중</span>';
  }
  function drawHist() {
    var box = $('upHist'); if (!box) return;
    $('upHistT').textContent = st.admin ? '선생님들이 올린 기록' : '내가 올린 기록';
    if (st.rows === null) { box.innerHTML = '<div class="none">불러오는 중…</div>'; return; }
    if (st.rows === false) { box.innerHTML = '<div class="none">기록을 불러오지 못했어요. 창을 다시 열어 주세요.</div>'; return; }
    var rows = st.rows.filter(function (r) { return r.screen === SCREEN && (st.admin || !st.me || r.writer === st.me); }).slice(0, 15);
    if (!rows.length) { box.innerHTML = '<div class="none">아직 올린 기록이 없어요.</div>'; return; }
    box.innerHTML = rows.map(function (r) {
      var p = parseRow(r);
      return '<div class="hr"><div class="top">' + stLabel(r.status) + '<b>' + esc(p.sub) + '</b><span style="color:#5c6a64">' + esc(String(r.ts || '').slice(0, 16)) + (st.admin ? ' · ' + esc(r.writer) : '') + '</span></div>' +
        (p.memo.trim() || p.flag ? '<div class="memo">' + esc(p.memo.trim()) + (p.flag ? (p.memo.trim() ? ' · ' : '') + esc(p.flag) : '') + '</div>' : '') +
        (r.note ? '<div class="res">' + esc(r.note) + '</div>' : '') + '</div>';
    }).join('');
  }
  function loadHist() {
    st.rows = null; drawHist();
    fetch(REPORT_API + '?action=editReqList&pw=sh&t=' + Date.now(), { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (d) {
      st.rows = (d && d.result === 'success' && d.reqs) || false; drawHist();
    }).catch(function () { st.rows = false; drawHist(); });
  }

  function send() {
    if (st.busy) return;
    var msg = $('upMsg');
    if (!st.me) { msg.className = 'msg err'; msg.textContent = '로그인한 선생님 이름을 찾지 못했어요. 허브에 다시 로그인해 주세요.'; return; }
    var memo = $('upMemo').value.trim(), flags = [];
    if ($('upNoHwp').checked) flags.push('한글 파일 없음');
    if ($('upScan').checked) flags.push('스캔본');
    var text = '[슈핏 문항] ' + st.sub + ' · 폴더 ' + FOLDERS[st.sub] + (memo ? '\n메모: ' + memo : '') + (flags.length ? '\n표시: ' + flags.join(' · ') : '');
    st.busy = true; $('upGo').disabled = true; msg.className = 'msg'; msg.textContent = '알리는 중…';
    fetch(REPORT_API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'editReqAdd', pw: 'sh', writer: st.me, screen: SCREEN, text: text }) })
      .then(function (r) { return r.json(); }).then(function (d) {
        if (!d || d.result !== 'success') throw new Error((d && d.message) || '저장하지 못했습니다');
        msg.className = 'msg ok'; msg.textContent = '클로슈에게 알렸어요. 변환이 끝나면 슈톡과 아래 기록으로 결과를 알려 드려요.';
        $('upMemo').value = ''; $('upNoHwp').checked = false; $('upScan').checked = false;
        if (W.shuegukActivity) W.shuegukActivity('Shuefit ' + st.sub, '문항 올리기', st.sub, memo, false);
        loadHist();
      }).catch(function (e) { msg.className = 'msg err'; msg.textContent = '알리지 못했습니다(' + e.message + '). 잠시 뒤 다시 눌러 주세요.'; })
      .then(function () { st.busy = false; $('upGo').disabled = false; });
  }

  function open() {
    $('upBack').hidden = false; drawSubs(); $('upMsg').textContent = ''; loadHist();
    setTimeout(function () { var f = $('upFold'); if (f) f.focus(); }, 30);
  }
  function close() { $('upBack').hidden = true; }

  function mount(sub, slot) {
    if (SUBS.indexOf(sub) >= 0) st.sub = sub;
    if (!$('upStyle')) { var s = document.createElement('style'); s.id = 'upStyle'; s.textContent = CSS; document.head.appendChild(s); }
    var b = document.createElement('button'); b.type = 'button'; b.className = 'upbtn'; b.id = 'upBtn'; b.textContent = '문항 올리기';
    b.onclick = open;
    var host = slot || document.querySelector('.hd .hdr');
    if (host) host.insertBefore(b, host.firstChild); else document.body.appendChild(b);
    var back = document.createElement('div'); back.id = 'upBack'; back.hidden = true; back.innerHTML = html(); document.body.appendChild(back);
    back.addEventListener('click', function (e) {
      if (e.target === back || e.target.id === 'upX') { close(); return; }
      var s = e.target.closest('[data-us]'); if (s) { st.sub = s.getAttribute('data-us'); drawSubs(); }
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !back.hidden) close(); });
    $('upGo').onclick = send;
    try {
      if (W.shuegukTeacherInfo) W.shuegukTeacherInfo().then(function (o) { st.me = o.name || ''; st.admin = o.role === 'admin'; drawHist(); }).catch(function () {});
      else if (W.shuegukTeacherName) W.shuegukTeacherName().then(function (n) { st.me = n || ''; }).catch(function () {});
    } catch (e) {}
  }
  W.ShufitUpload = { mount: mount, open: open, folders: FOLDERS, _st: st };
})(window);
