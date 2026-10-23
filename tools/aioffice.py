#!/usr/bin/env python3
# 슈국 AI 교무실 도구 — 클로드 순찰 세션이 쓴다. 지침: docs/AI교무실-지침.md
#   python3 tools/aioffice.py feed                         열린 지시·할 일 + 이번에 할 지시(todo)
#   python3 tools/aioffice.py claim 12                     지시 12번을 가져간다(겹친 순찰이면 409)
#   python3 tools/aioffice.py add 12 hong "카드뉴스 3장 문구" --stage 0 --last "자료 모으는 중" --log "지시 확인"
#   python3 tools/aioffice.py set 34 --col 확인 --stage 4 --last "3장 완성" --result-file 결과.md --url https://… --log "초안 완성"
#   python3 tools/aioffice.py release 12                   가져간 표시를 푼다(순찰 끝)
# 조교: lead(팀장) gyo(교재) gum(검수) hong(홍보) haeng(행정) · 칸: 진행 검수 확인 · 단계: 0 기획 1 조사 2 초안 3 검수 4 확인
# 비밀값은 환경 변수 CLOSHU_TOKEN 에서만 읽는다(저장소·대화에 넣지 않는다).
import argparse
import json
import os
import sys
import urllib.error
import urllib.request

URL = 'https://bangdbhqpphqqdwcledg.supabase.co/functions/v1/ai-office'
ROLES = ['lead', 'gyo', 'gum', 'hong', 'haeng']
COLS = ['진행', '검수', '확인']


def call(body):
    token = os.environ.get('CLOSHU_TOKEN', '')
    if not token:
        sys.exit('CLOSHU_TOKEN 환경 변수가 없습니다 — 클로드 환경 설정의 비밀값을 확인하세요.')
    req = urllib.request.Request(URL, data=json.dumps(body).encode(), method='POST',
                                 headers={'Content-Type': 'application/json', 'x-closhu-token': token})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, json.loads(r.read().decode() or 'null')
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode() or 'null')
        except ValueError:
            return e.code, None


def task_fields(a, body):
    for k in ('role', 'title', 'col', 'stage', 'last', 'log'):
        v = getattr(a, k, None)
        if v is not None:
            body[k] = v
    if a.url is not None:
        body['result_url'] = a.url
    if a.result_file:
        with open(a.result_file, encoding='utf-8') as f:
            body['result'] = f.read()
    elif a.result is not None:
        body['result'] = a.result
    return body


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest='cmd', required=True)
    sub.add_parser('feed')
    c = sub.add_parser('claim'); c.add_argument('order', type=int)
    r = sub.add_parser('release'); r.add_argument('order', type=int)
    for name in ('add', 'set'):
        p = sub.add_parser(name)
        if name == 'add':
            p.add_argument('order', type=int); p.add_argument('role', choices=ROLES); p.add_argument('title')
        else:
            p.add_argument('id', type=int); p.add_argument('--role', choices=ROLES); p.add_argument('--title')
        p.add_argument('--col', choices=COLS); p.add_argument('--stage', type=int, choices=range(0, 5))
        p.add_argument('--last'); p.add_argument('--log'); p.add_argument('--url')
        p.add_argument('--result'); p.add_argument('--result-file')
    a = ap.parse_args()
    if a.cmd == 'feed':
        st, out = call({'action': 'feed'})
    elif a.cmd in ('claim', 'release'):
        st, out = call({'action': a.cmd, 'order': a.order})
    elif a.cmd == 'add':
        st, out = call(task_fields(a, {'action': 'task', 'order': a.order}))
    else:
        st, out = call(task_fields(a, {'action': 'task', 'id': a.id}))
    print(json.dumps(out, ensure_ascii=False, indent=1))
    if st >= 400:
        sys.exit('HTTP %d' % st)


if __name__ == '__main__':
    main()
