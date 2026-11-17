// The live catalogue is managed from the CV GADGETS admin dashboard.
// No demo inventory or made-up prices are shown to customers.
export let products = [];

function categoryKey(category) {
  const normalized = String(category || '').trim().toLowerCase();
  return normalized.replace(/\s+/g, '-');
}

export function setProductsFromApi(records, { append = false } = {}) {
  const existing = append ? products.filter(product => product.backendAvailable) : [];
  const mapped = (Array.isArray(records) ? records : []).map(record => {
    const images = Array.isArray(record.images) ? record.images.filter(value => typeof value === 'string' && value.trim()) : [];
    const options = Array.isArray(record.sizes) && record.sizes.length ? record.sizes : ['Standard'];
    const colours = Array.isArray(record.colours) && record.colours.length ? record.colours : ['Standard'];
    return {
      id: record.productCode, name: record.name, category: categoryKey(record.category),
      brand: record.brand || '', model: record.model || '', subcategory: record.subcategory || '', condition: record.condition || '',
      warranty: record.warranty || '', specifications: record.specifications || {},
      price: Number(record.price), discountPrice: Number(record.discountPrice) || 0,
      images: images.length ? images : ['/assets/images/products/device-placeholder.svg'],
      sizes: options, colours, description: record.description || '',
      inStock: record.active !== false && Number(record.stock) > 0,
      stock: Number(record.stock) || 0, backendAvailable: true, featured: Boolean(record.featured), createdAt: record.createdAt || null,
    };
  }).filter(product => product.id && product.name && Number.isFinite(product.price));
  if (!mapped.length && !existing.length) { products = []; return false; }
  const ids = new Set([...existing, ...mapped].map(product => product.id));
  products = [...existing.filter(item => !mapped.some(next => next.id === item.id)), ...mapped];
  return products.length > 0;
}
