#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const protectedPages = [
  'alimtalk.html', 'answer_key.html', 'clinic.html', 'colors.html', 'copy.html', 'go1.html',
  'gramma.html', 'hwork.html', 'index.html', 'omr_analysis.html',
  'omr_teacher.html', 'ops.html', 'question_board.html', 'question.html',
  'report_guide.html', 'report.html', 'review.html', 'sessions.html',
  'study.html', 'teacher_accounts.html', 'voca.html', 'weekend.html'
];
const publicPages = ['omr.html', 'question_guide.html'];
let count = 0;
let failed = 0;

function check(value, label) {
  count += 1;
  if (value) console.log('  ✓ ' + label);
  else { failed += 1; console.error('  ✗ ' + label); }
}

for (const file of protectedPages) {
  const html = fs.readFileSync(path.join(root, file), 'utf8');
  const firstScript = html.match(/<script\b[^>]*>/i);
  check(firstScript && /assets\/teacher-auth\.js/.test(firstScript[0]), file + '의 첫 스크립트가 공통 교사 인증');
  check(!/\bT_PW\b/.test(html), file + '에 공유 교사 비밀번호가 없음');
}

for (const file of publicPages) {
  const html = fs.readFileSync(path.join(root, file), 'utf8');
  check(!/assets\/teacher-auth\.js/.test(html), file + '은 교사 인증 조각이 없는 공개 페이지');
}

const auth = fs.readFileSync(path.join(root, 'assets', 'teacher-auth.js'), 'utf8');
check(/teacher_accounts/.test(auth), '활성 교사 표를 확인함');
check(/profile\.role === 'admin'/.test(auth), '관리자에게만 계정 관리 메뉴를 표시함');
check(/refresh_token/.test(auth), '세션 만료 시 토큰을 갱신함');
check(!/teachers@shueguk\.internal/.test(auth), '공유 교사 계정이 없음');
check(!/service_role|sb_secret_/i.test(auth), '서버용 비밀키가 없음');

console.log('\n' + count + '건 중 ' + (count - failed) + '건 통과');
if (failed) process.exit(1);
