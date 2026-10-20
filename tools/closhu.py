#!/usr/bin/env python3
# 슈톡 클로슈(진짜 클로드) 도구 — 클로드 세션이 순찰할 때 쓴다. 지침: docs/클로슈-지침.md
#   python3 tools/closhu.py feed                                  지난번 읽은 곳 뒤 새 메시지·남은 일·사람·출근·답 안 한 @클로슈
#   python3 tools/closhu.py get students "name=eq.김민준"           읽기 전용 조회(학생은 이름·학교·학년·담당·재원만)
#   python3 tools/closhu.py say answer "글" --reply 123 --to 고희주 --key answer:123
#   python3 tools/closhu.py say ask "글" --reply 123 --opt "김민준A · 서정중 중3 · 이은지 선생님=이은지" --key ask:123
#   python3 tools/closhu.py cursor 456                            여기까지 읽음
# 비밀값은 환경 변수 CLOSHU_TOKEN 에서만 읽는다(저장소·대화에 넣지 않는다).
import argparse
import json
import os
import sys
import urllib.error
import urllib.request

URL = 'https://bangdbhqpphqqdwcledg.supabase.co/functions/v1/closhu'


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


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest='cmd', required=True)
    sub.add_parser('feed')
    g = sub.add_parser('get'); g.add_argument('table'); g.add_argument('query', nargs='?', default='')
    s = sub.add_parser('say')
    s.add_argument('kind', choices=['note', 'answer', 'ask', 'summary']); s.add_argument('text')
    s.add_argument('--reply', type=int); s.add_argument('--to', action='append', default=[])
    s.add_argument('--opt', action='append', default=[], help='"보기 글=선생님 이름"')
    s.add_argument('--key')
    c = sub.add_parser('cursor'); c.add_argument('id', type=int)
    a = ap.parse_args()
    if a.cmd == 'feed':
        st, out = call({'action': 'feed'})
    elif a.cmd == 'get':
        st, out = call({'action': 'get', 'table': a.table, 'query': a.query})
    elif a.cmd == 'say':
        body = {'action': 'say', 'kind': a.kind, 'text': a.text}
        if a.reply: body['reply_to'] = a.reply
        if a.to: body['to'] = a.to
        if a.opt: body['options'] = [{'label': o.rsplit('=', 1)[0], 'name': o.rsplit('=', 1)[1]} for o in a.opt]
        if a.key: body['key'] = a.key
        st, out = call(body)
    else:
        st, out = call({'action': 'cursor', 'id': a.id})
    print(json.dumps(out, ensure_ascii=False, indent=1))
    if st >= 400:
        sys.exit('HTTP %d' % st)


if __name__ == '__main__':
    main()
