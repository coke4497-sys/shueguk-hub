/* 슈톡(Shuetalk) 푸시 알림 서비스 워커 (2026-10-19) — messenger.html 이 등록한다.
 * 받은 알림은 언제나 화면에 띄운다(아이폰은 조용한 푸시가 쌓이면 구독을 끊는다).
 * 알림을 누르면 열려 있는 대화방 창으로 가서 그 메시지를 보여 주고, 없으면 새로 연다. */
'use strict';
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });

// 홈 화면 아이콘의 빨간 숫자(카카오톡처럼) — 받은 알림 수를 캐시에 세어 둔다. 슈톡 화면이 열려 읽으면 0으로.
var BADGE_CACHE = 'msg-badge', BADGE_KEY = 'badge-n';
function badgeRead() {
  return caches.open(BADGE_CACHE).then(function (c) { return c.match(BADGE_KEY); })
    .then(function (r) { return r ? r.text() : '0'; }).then(function (t) { return Number(t) || 0; })
    .catch(function () { return 0; });
}
// 거의 동시에 온 푸시가 같은 숫자를 읽고 둘 다 +1 하지 않게 차례로 처리한다 (Codex 검토)
var badgeChain = Promise.resolve();
function badgeUp() {
  // 받은 순서대로 줄에 세우고, 차례가 오면 그때 '보고 있나'를 본다 — 0으로(badgeClear)와 순서가 뒤바뀌지 않게
  var step = function () { return viewing().then(function (yes) { return yes ? null : badgeStep(); }); };
  badgeChain = badgeChain.then(step, step);
  return badgeChain;
}
function badgeStep() {
  return badgeRead().then(function (n) {
    n += 1;
    return caches.open(BADGE_CACHE).then(function (c) { return c.put(BADGE_KEY, new Response(String(n))); }).catch(function () {})
      .then(function () { if (self.navigator && self.navigator.setAppBadge) return self.navigator.setAppBadge(n).catch(function () {}); });
  });
}

self.addEventListener('push', function (e) {
  var d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { body: e.data ? e.data.text() : '' }; }
  var title = d.title || '슈톡';
  var opts = {
    body: d.body || '새 메시지가 있습니다.',
    tag: d.tag || 'msg',
    renotify: true,
    icon: 'icon-192.png',
    badge: 'icon-192.png',
    data: { url: d.url || 'messenger.html' }
  };
  e.waitUntil(Promise.all([
    self.registration.showNotification(title, opts),
    // 슈톡 화면을 지금 보고 있으면 숫자를 올리지 않는다(badgeUp 안에서) — 화면이 이미 읽음 처리했을 수 있어서 (Codex 검토)
    badgeUp()
  ]));
});
function viewing() {
  return self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
    return list.some(function (c) { return c.url.indexOf('messenger.html') >= 0 && c.visibilityState === 'visible'; });
  }).catch(function () { return false; });
}
// 화면(끝까지 읽음)·로그아웃이 보내는 '0으로' — 진행 중인 +1 뒤에 줄 세워, 늦게 끝난 +1이 0을 덮지 않게 (Codex 검토)
function badgeClear() {
  badgeChain = badgeChain.then(badgeZero, badgeZero);
  return badgeChain;
}
function badgeZero() {
  return caches.open(BADGE_CACHE).then(function (c) { return c.put(BADGE_KEY, new Response('0')); }).catch(function () {})
    .then(function () { if (self.navigator && self.navigator.clearAppBadge) return self.navigator.clearAppBadge().catch(function () {}); });
}
self.addEventListener('message', function (e) {
  if (e.data && e.data.type === 'badge-clear') e.waitUntil(badgeClear());
});

self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var url = (e.notification.data && e.notification.data.url) || 'messenger.html';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      if (c.url.indexOf('messenger.html') >= 0 && 'focus' in c) {
        c.postMessage({ type: 'msg-open', url: url });
        return c.focus();
      }
    }
    return self.clients.openWindow(url);
  }));
});
