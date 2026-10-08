// Web push for event reminders (/ucet → "Notifikácie v tomto prehliadači").
// Only shows notifications sent by the worker ({title, body, url}) and opens the page on click.
// Deliberately no caching and no fetch handler: the site keeps loading straight from the network.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    // not JSON – show the default title
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Kingdom 1035', {
      body: data.body || '',
      icon: '/icons/icon-192.png',
      data: { url: data.url || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  // only pages of this site
  const url = new URL(event.notification.data?.url || '/', self.location.origin);
  if (url.origin !== self.location.origin) return;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows.find((client) => client.url === url.href) || windows[0];
      if (!open) return self.clients.openWindow(url.href);
      return open
        .focus()
        .then((client) => (client.url === url.href ? client : client.navigate(url.href)))
        .catch(() => self.clients.openWindow(url.href)); // a window this worker does not control
    }),
  );
});
