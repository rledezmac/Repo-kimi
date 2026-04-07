// Configuración de Supabase (reemplazar con tus credenciales)
const SUPABASE_URL = 'https://tu-proyecto.supabase.co';
const SUPABASE_ANON_KEY = 'tu-anon-key-aqui';

// Inicializar cliente Supabase
let supabase;

// Inicializar conexión
function initSupabase() {
  supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  
  // Configurar auth state change
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN') {
      console.log('Usuario autenticado:', session.user);
      loadInitialData();
    } else if (event === 'SIGNED_OUT') {
      console.log('Usuario desconectado');
    }
  });
}

// Funciones de autenticación
async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });
  if (error) throw error;
  return data;
}

async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

// Funciones de datos - Ubicaciones
async function getLocations(filters = {}) {
  let query = supabase
    .from('locations')
    .select('*, products:location_products(count)')
    .order('zone', { ascending: true })
    .order('row', { ascending: true })
    .order('shelf', { ascending: true });

  if (filters.zone) {
    query = query.eq('zone', filters.zone);
  }
  if (filters.status) {
    query = query.eq('status', filters.status);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

async function createLocation(locationData) {
  const { data, error } = await supabase
    .from('locations')
    .insert([{
      ...locationData,
      barcode: generateLocationBarcode(locationData),
      created_at: new Date().toISOString()
    }])
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

// Funciones de datos - Productos
async function getProducts(options = {}) {
  let query = supabase
    .from('products')
    .select('*, location:locations(*)')
    .order('created_at', { ascending: false });

  if (options.search) {
    query = query.or(`name.ilike.%${options.search}%,sku.ilike.%${options.search}%,barcode.ilike.%${options.search}%`);
  }
  if (options.category) {
    query = query.eq('category', options.category);
  }
  if (options.location_id) {
    query = query.eq('location_id', options.location_id);
  }
  if (options.low_stock) {
    query = query.lte('stock', 10);
  }

  // Paginación
  const page = options.page || 1;
  const limit = options.limit || 50;
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  query = query.range(from, to);

  const { data, error, count } = await query;
  if (error) throw error;
  return { data, count };
}

async function createProduct(productData) {
  const { data, error } = await supabase
    .from('products')
    .insert([{
      ...productData,
      barcode: productData.barcode || generateProductBarcode(),
      created_at: new Date().toISOString()
    }])
    .select()
    .single();
  
  if (error) throw error;
  
  // Registrar movimiento de entrada inicial
  if (productData.stock > 0) {
    await createMovement({
      product_id: data.id,
      type: 'in',
      quantity: productData.stock,
      reason: 'initial_stock',
      notes: 'Stock inicial'
    });
  }
  
  return data;
}

async function updateProductStock(productId, quantity, type = 'adjustment') {
  const { data: product, error: fetchError } = await supabase
    .from('products')
    .select('stock')
    .eq('id', productId)
    .single();
  
  if (fetchError) throw fetchError;
  
  const newStock = type === 'in' 
    ? product.stock + quantity 
    : product.stock - quantity;
  
  const { data, error } = await supabase
    .from('products')
    .update({ 
      stock: newStock,
      updated_at: new Date().toISOString()
    })
    .eq('id', productId)
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

// Funciones de datos - Movimientos
async function createMovement(movementData) {
  const { data, error } = await supabase
    .from('movements')
    .insert([{
      ...movementData,
      created_at: new Date().toISOString(),
      created_by: (await supabase.auth.getUser()).data.user?.id
    }])
    .select()
    .single();
  
  if (error) throw error;
  
  // Actualizar stock del producto
  await updateProductStock(
    movementData.product_id,
    movementData.quantity,
    movementData.type
  );
  
  return data;
}

async function getMovements(filters = {}) {
  let query = supabase
    .from('movements')
    .select('*, product:products(name, sku), location:locations(code)')
    .order('created_at', { ascending: false });

  if (filters.date_from) {
    query = query.gte('created_at', filters.date_from);
  }
  if (filters.date_to) {
    query = query.lte('created_at', filters.date_to);
  }
  if (filters.type) {
    query = query.eq('type', filters.type);
  }
  if (filters.product_id) {
    query = query.eq('product_id', filters.product_id);
  }

  const { data, error } = await query.limit(100);
  if (error) throw error;
  return data;
}

// Funciones auxiliares
function generateLocationBarcode(location) {
  // Formato: LOC-ZONA-FILA-ANAQUEL-POS (Ej: LOC-A-01-05-12)
  return `LOC-${location.zone}-${location.row.padStart(2, '0')}-${String(location.shelf).padStart(2, '0')}-${String(location.position).padStart(2, '0')}`;
}

function generateProductBarcode() {
  // Generar código EAN-13 o QR único
  return 'REF' + Date.now().toString(36).toUpperCase();
}

// Suscripción a cambios en tiempo real
function subscribeToChanges(callback) {
  const subscription = supabase
    .channel('warehouse_changes')
    .on('postgres_changes', 
      { event: '*', schema: 'public', table: 'products' },
      (payload) => callback('product', payload)
    )
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'movements' },
      (payload) => callback('movement', payload)
    )
    .subscribe();
  
  return subscription;
}

// Inicializar cuando cargue el DOM
document.addEventListener('DOMContentLoaded', initSupabase);
