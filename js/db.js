// IndexedDB para modo offline
const DB_NAME = 'RefaccionariaDB';
const DB_VERSION = 1;

class LocalDB {
  constructor() {
    this.db = null;
  }

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        
        // Store de productos
        if (!db.objectStoreNames.contains('products')) {
          const productStore = db.createObjectStore('products', { keyPath: 'id' });
          productStore.createIndex('sku', 'sku', { unique: true });
          productStore.createIndex('barcode', 'barcode', { unique: false });
          productStore.createIndex('location_id', 'location_id', { unique: false });
        }
        
        // Store de ubicaciones
        if (!db.objectStoreNames.contains('locations')) {
          const locationStore = db.createObjectStore('locations', { keyPath: 'id' });
          locationStore.createIndex('barcode', 'barcode', { unique: true });
          locationStore.createIndex('zone', 'zone', { unique: false });
        }
        
        // Store de movimientos pendientes
        if (!db.objectStoreNames.contains('pendingMovements')) {
          db.createObjectStore('pendingMovements', { 
            keyPath: 'id', 
            autoIncrement: true 
          });
        }
        
        // Store de sincronización
        if (!db.objectStoreNames.contains('syncMeta')) {
          db.createObjectStore('syncMeta', { keyPath: 'key' });
        }
      };
    });
  }

  // Productos
  async saveProducts(products) {
    const tx = this.db.transaction('products', 'readwrite');
    const store = tx.objectStore('products');
    
    for (const product of products) {
      await store.put(product);
    }
    
    return tx.complete;
  }

  async getProducts(query = {}) {
    const tx = this.db.transaction('products', 'readonly');
    const store = tx.objectStore('products');
    
    if (query.barcode) {
      const index = store.index('barcode');
      return index.getAll(query.barcode);
    }
    
    if (query.sku) {
      const index = store.index('sku');
      return index.get(query.sku);
    }
    
    if (query.location_id) {
      const index = store.index('location_id');
      return index.getAll(query.location_id);
    }
    
    return store.getAll();
  }

  async getProductByBarcode(barcode) {
    const tx = this.db.transaction('products', 'readonly');
    const store = tx.objectStore('products');
    const index = store.index('barcode');
    return index.get(barcode);
  }

  // Ubicaciones
  async saveLocations(locations) {
    const tx = this.db.transaction('locations', 'readwrite');
    const store = tx.objectStore('locations');
    
    for (const location of locations) {
      await store.put(location);
    }
    
    return tx.complete;
  }

  async getLocationByBarcode(barcode) {
    const tx = this.db.transaction('locations', 'readonly');
    const store = tx.objectStore('locations');
    const index = store.index('barcode');
    return index.get(barcode);
  }

  async getAllLocations() {
    const tx = this.db.transaction('locations', 'readonly');
    return tx.objectStore('locations').getAll();
  }

  // Movimientos pendientes (offline)
  async queueMovement(movement) {
    const tx = this
