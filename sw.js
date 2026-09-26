// ============================================================
// Service Worker لتطبيق تيسير (Taysir)
// الهدف الوحيد: تلبية شرط المتصفح لتفعيل "تثبيت التطبيق" (PWA) وتحسين
// سرعة إعادة الفتح، وليس تخزين نسخة دائمة قد تتقادم — لذلك يعتمد استراتيجية
// "الشبكة أولاً" (Network First) مع الرجوع للكاش فقط عند انقطاع الإنترنت،
// كي لا يظل المستخدم عالقاً على نسخة قديمة من التطبيق بعد أي تحديث.
// ============================================================

const CACHE_NAME = 'taysir-shell-v2';
// مكتبات خارجية ثابتة الإصدار (مولّد رموز QR، قارئ QR، Supabase): تُحفَظ على
// الجهاز بعد أول تحميل، كي تُعرض التذكرة ورمزها حتى بلا إنترنت في المحطة
const CDN_LIBS = [
  'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js',
  'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'
];
const APP_SHELL = ['/'];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => {})
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ============================================================
// الإشعارات الحقيقية (Push Notifications) — تعمل حتى لو كان التطبيق مغلقاً
// تماماً، بعكس إشعارات customer_notifications الداخلية القديمة. الحدث
// 'push' يصل من المتصفح نفسه عندما ترسل دالة send-push إشعاراً عبر بروتوكول
// Web Push، ولا علاقة له مباشرة بـ Supabase.
// ============================================================
self.addEventListener('push', (event) => {
  let data = { title: 'تيسير', body: '' };
  try{ data = event.data ? event.data.json() : data; }catch(e){}
  event.waitUntil(
    self.registration.showNotification(data.title || 'تيسير', {
      body: data.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      dir: 'rtl',
      lang: 'ar'
    })
  );
});

// عند الضغط على الإشعار: فتح التطبيق (أو التركيز على تبويب مفتوح له فعلاً)
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsArr) => {
      for(const client of clientsArr){
        if('focus' in client) return client.focus();
      }
      if(self.clients.openWindow) return self.clients.openWindow('/');
    })
  );
});

self.addEventListener('fetch', (event) => {
  // فقط طلبات GET من نفس النطاق (لا نتدخل في نداءات Supabase أو أي نطاق خارجي)
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);

  // مكتبات CDN المعروفة: الشبكة أولاً، والنسخة المحفوظة عند انقطاع الإنترنت
  if (CDN_LIBS.some((u) => event.request.url.startsWith(u))) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && (response.ok || response.type === 'opaque')) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone)).catch(() => {});
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone)).catch(() => {});
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match('/')))
  );
});
