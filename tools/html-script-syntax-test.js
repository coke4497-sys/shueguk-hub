#!/usr/bin/env node
'use strict';

const fs = require('fs');
let checked = 0;
let failed = 0;
const pattern = new RegExp('<script(?![^>]*\\bsrc=)[^>]*>([\\s\\S]*?)<\\/script>', 'gi');

for (const file of fs.readdirSync('.').filter(name => name.endsWith('.html'))) {
  const html = fs.readFileSync(file, 'utf8');
  let match;
  let index = 0;
  while ((match = pattern.exec(html))) {
    index += 1;
    checked += 1;
    try {
      new Function(match[1]);
    } catch (error) {
      failed += 1;
      console.error(file + ' 인라인 스크립트 ' + index + ': ' + error.message);
    }
  }
}

console.log(checked + '개 인라인 스크립트 중 ' + (checked - failed) + '개 문법 통과');
if (failed) process.exit(1);
