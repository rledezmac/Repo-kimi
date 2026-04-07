const CACHE_NAME = 'refaccionaria-wms-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/css/styles.css',
  '/js/app.js',
  '/js/db.js',
  '/js/scanner.js',
  '/js/supabase.js',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png'
];

// Instalación: Cachear recursos estáticos
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Cache abierto');
        return cache.addAll(STATIC_ASSETS);
      })
      .catch((err) => console.error('Error cacheando:', err))
  );
  self.skipWaiting();
});

// Activación: Limpiar caches antiguos
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// Fetch: Estrategia Network First, fallback a Cache
self.addEventListener('fetch', (event) => {
  const { request } = event;
  
  // No interceptar requests de API de Supabase (WebSocket o HTTP)
  if (request.url.includes('supabase.co')) {
    return;
  }
  
  event.respondWith(
    fetch(request)
      .then((response) => {
        // Si la respuesta es válida, actualizar cache
        if (response && response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        // Si falla la red, usar cache
        return caches.match(request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          // Si no está en cache y es una navegación, mostrar offline
          if (request.mode === 'navigate') {
            return caches.match('/index.html');
          }
          return new Response('Sin conexión', { status: 503 });
        });
      })
  );
});

// Sync: Sincronización en background para movimientos pendientes
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-movements') {
    event.waitUntil(syncPendingMovements());
  }
});

// Push: Notificaciones (opcional)
self.addEventListener('push', (event) => {
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icons/icon-192x192.png',
      badge: '/icons/badge-72x72.png',
      data: data.url,
      actions: [
        { action: 'open', title: 'Abrir' },
        { action: 'close', title: 'Cerrar' }
      ]
    })
  );
});

// Click en notificación
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'open' || !event.action) {
    event.waitUntil(
      clients.openWindow(event.notification.data || '/')
    );
  }
});

// Función para sincronizar movimientos pendientes
async function syncPendingMovements() {
  const db = await openDB('RefaccionariaDB', 1);
  const pending = await db.getAll('pendingMovements');
  
  for (const movement of pending) {
    try {
      // Aquí iría la lógica para enviar a Supabase
      // await supabase.from('movements').insert(movement);
      
      // Si se envía correctamente, eliminar de pendientes
      await db.delete('pendingMovements', movement.id);
    } catch (error) {
      console.error('Error sincronizando movimiento:', error);
    }
  }
}

// IndexedDB helper
function openDB(name, version) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, version);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('pendingMovements')) {
        db.createObjectStore('pendingMovements', { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains('products')) {
        db.createObjectStore('products', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('locations')) {
        db.createObjectStore('locations', { keyPath: 'id' });
      }
    };
  });
}
