/* 슈국 대화방 푸시 알림 서비스 워커 (2026-10-19) — messenger.html 이 등록한다.
 * 받은 알림은 언제나 화면에 띄운다(아이폰은 조용한 푸시가 쌓이면 구독을 끊는다).
 * 알림을 누르면 열려 있는 대화방 창으로 가서 그 메시지를 보여 주고, 없으면 새로 연다. */
'use strict';
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });

self.addEventListener('push', function (e) {
  var d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { body: e.data ? e.data.text() : '' }; }
  var title = d.title || '슈국 대화방';
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
    self.navigator && self.navigator.setAppBadge ? self.navigator.setAppBadge().catch(function () {}) : null
  ]));
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
