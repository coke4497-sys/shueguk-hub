#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const page = fs.readFileSync(path.join(root, 'teacher_accounts.html'), 'utf8');
const fn = fs.readFileSync(path.join(root, 'supabase', 'functions', 'create-teacher', 'index.ts'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'supabase', 'migrations', '202609290004_teacher_assistant_role.sql'), 'utf8');
let count = 0;
let failed = 0;

function check(value, label) {
  count += 1;
  if (value) console.log('  ✓ ' + label);
  else { failed += 1; console.error('  ✗ ' + label); }
}

check(/assets\/teacher-auth\.js/.test(page), '계정 관리 화면에 교사 인증을 적용함');
check(/context\.profile\.role !== 'admin'/.test(page), '관리자만 계정 관리 화면을 사용함');
check(/functions\/v1\/create-teacher/.test(page), '계정 생성은 서버 함수에 요청함');
check(/value="assistant">조교</.test(page), '발급 화면에서 조교 계정을 선택할 수 있음');
check(!/service_role|sb_secret_/i.test(page), '브라우저 화면에 관리자 비밀키가 없음');
check(/actorProfile\.role !== 'admin'/.test(fn), '서버에서 관리자 권한을 다시 확인함');
check(/auth\.admin\.createUser/.test(fn), '서버에서 Supabase Auth 사용자를 생성함');
check(/crypto\.getRandomValues/.test(fn), '암호학적 난수로 임시 비밀번호를 생성함');
check(/auth\.admin\.deleteUser/.test(fn), '교사 권한 저장 실패 시 Auth 계정을 되돌림');
check(/accountType !== 'teacher'.*accountType !== 'assistant'/s.test(fn), '서버에서 선생님과 조교 구분만 허용함');
check(/role: accountType/.test(fn), '선택한 계정 구분을 역할로 저장함');
check(/role in \('teacher', 'assistant', 'admin'\)/.test(migration), '관리자·선생님·조교 역할만 허용함');

console.log('\n' + count + '건 중 ' + (count - failed) + '건 통과');
if (failed) process.exit(1);
