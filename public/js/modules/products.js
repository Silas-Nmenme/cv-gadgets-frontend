// Product grid rendering: category filter, sort, live text search,
// wishlist toggle and the size/colour quick-add picker.
import { products, setProductsFromApi } from "../data/products.js";
import { api, byId, formatNaira, safeText } from "./utils.js";
import { addToCart } from "./cart.js";
import { openModal, closeModal } from "./modal.js";
import { toast } from "./toast.js";

import { getWishlist, initWishlist, toggleWishlist } from "./wishlist.js";

let visibleLimit = 8;
let searchQuery = "";
let apiCatalogueLoaded = false;
let catalogueStatus = "";
let catalogueRequest;
let cataloguePage = 0;
let cataloguePages = 1;
let loadedProductCount = 0;
let filteredProductCount = 0;
let loadingNextPage = false;

export const isApiCatalogueLoaded = () => apiCatalogueLoaded;

export function loadProductsCatalogue() {
  if (!catalogueRequest) {
    catalogueRequest = api('/products?page=1&limit=50')
      .then(({ products: records, pagination }) => {
        if (!Array.isArray(records) || !records.length) {
          catalogueStatus = "Our product catalogue is being updated. Please check back soon or send us a product enquiry.";
          return false;
        }
        apiCatalogueLoaded = setProductsFromApi(records);
        refreshDynamicFilters();
        cataloguePage = pagination?.page || 1;
        cataloguePages = Math.max(1, pagination?.pages || 1);
        loadedProductCount = records.length;
        catalogueStatus = apiCatalogueLoaded
          ? ""
          : "The live product catalogue could not be displayed. Please try again shortly.";
        return apiCatalogueLoaded;
      })
      .catch(error => {
        catalogueStatus = `The live product catalogue is unavailable (${error.message}). Please try again shortly.`;
        return false;
      });
  }
  return catalogueRequest;
}

async function loadNextCataloguePage() {
  if (loadingNextPage || !apiCatalogueLoaded || cataloguePage >= cataloguePages) return;
  loadingNextPage = true;
  catalogueStatus = 'Loading more products…';
  renderProducts();
  try {
    const nextPage = cataloguePage + 1;
    const { products: records, pagination } = await api(`/products?page=${nextPage}&limit=50`);
    setProductsFromApi(records, { append: true });
    refreshDynamicFilters();
    cataloguePage = pagination?.page || nextPage;
    cataloguePages = Math.max(cataloguePage, pagination?.pages || cataloguePage);
    loadedProductCount += records.length;
    catalogueStatus = '';
  } catch (error) {
    catalogueStatus = `More products could not be loaded (${error.message}). Try again.`;
  } finally {
    loadingNextPage = false;
    renderProducts();
  }
}

// Called by search.js whenever the search box changes. Keeping the query
// here (rather than scrolling or touching the category dropdown) means
// search and the category/sort filters combine instead of fighting.
export function setSearchQuery(query) {
  searchQuery = query.trim().toLowerCase();
  visibleLimit = 8;
  renderProducts();
}

export function clearSearchQuery() {
  setSearchQuery("");
}

function matchesSearch(product) {
  if (!searchQuery) return true;
  return (
    product.name.toLowerCase().includes(searchQuery) ||
    product.description.toLowerCase().includes(searchQuery) ||
    product.category.toLowerCase().includes(searchQuery) ||
    String(product.brand || '').toLowerCase().includes(searchQuery) ||
    String(product.model || '').toLowerCase().includes(searchQuery)
  );
}

export function renderProducts() {
  const grid = byId("product-grid");
  const resultCount = byId("product-result-count");
  const category = byId("category-filter").value;
  const brand = byId("brand-filter")?.value || 'all';
  const sort = byId("sort-filter").value;
  const condition = byId('condition-filter')?.value || 'all';
  const storage = byId('storage-filter')?.value || 'all';
  const ram = byId('ram-filter')?.value || 'all';
  const processor = byId('processor-filter')?.value || 'all';
  const minPrice = Number(byId('price-min')?.value || 0);
  const maxPrice = Number(byId('price-max')?.value || 0);
  const currentPrice = product => product.discountPrice > 0 && product.discountPrice < product.price ? product.discountPrice : product.price;

  let list = products.filter(
    (p) =>
      (!apiCatalogueLoaded || p.backendAvailable) &&
      (category === "all" || p.category === category) &&
      (brand === 'all' || String(p.brand || '').toLowerCase() === brand.toLowerCase()) &&
      (condition === 'all' || String(p.condition || '').toLowerCase() === condition.toLowerCase()) &&
      (storage === 'all' || [...(p.sizes || []), p.specifications?.Storage, p.specifications?.storage].filter(Boolean).some(value => String(value).toLowerCase() === storage.toLowerCase())) &&
      (ram === 'all' || String(p.specifications?.RAM || p.specifications?.Ram || '').toLowerCase() === ram.toLowerCase()) &&
      (processor === 'all' || String(p.specifications?.Processor || p.specifications?.CPU || '').toLowerCase() === processor.toLowerCase()) &&
      (!minPrice || currentPrice(p) >= minPrice) &&
      (!maxPrice || currentPrice(p) <= maxPrice) &&
      p.inStock &&
      matchesSearch(p)
  );
  if (sort === "price-asc") list.sort((a, b) => currentPrice(a) - currentPrice(b));
  if (sort === "price-desc") list.sort((a, b) => currentPrice(b) - currentPrice(a));
  if (sort === "name") list.sort((a, b) => a.name.localeCompare(b.name));
  if (sort === 'newest') list.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  filteredProductCount = list.length;

  const shown = list.slice(0, visibleLimit);
  grid.replaceChildren();

  if (!shown.length) {
    const message = searchQuery
      ? `No products match “${searchQuery}”. Try a different search or clear the filters.`
      : "No products are listed in this category yet. Please contact us if you need help sourcing a device.";
    grid.append(safeText("p", message, "empty-state"));
  } else {
    shown.forEach((p) => grid.append(makeCard(p)));
  }

  resultCount.textContent = searchQuery
    ? `${list.length} result${list.length === 1 ? "" : "s"} for “${searchQuery}”`
    : "";
  byId("catalogue-status").textContent = catalogueStatus;

  const loadMore = byId("load-more");
  const hasLoadedItems = shown.length < list.length;
  const hasMorePages = apiCatalogueLoaded && cataloguePage < cataloguePages;
  loadMore.classList.toggle("hidden", !hasLoadedItems && !hasMorePages);
  loadMore.textContent = hasLoadedItems
    ? `View more (${list.length - shown.length} remaining)`
    : `Load more products (${loadedProductCount} loaded)`;
  loadMore.disabled = loadingNextPage;
}

export function makeCard(p) {
  const card = document.createElement("article");
  card.className = "product-card";

  const img = document.createElement("img");
  img.src = p.images[0];
  img.alt = p.name;
  img.width = 800;
  img.height = 1000; // 4:5, matches the CSS aspect-ratio
  img.loading = "lazy";
  img.onerror = () => { img.onerror = null; img.src = "/assets/images/products/device-placeholder.svg"; };

  const content = document.createElement("div");
  content.className = "product-card-content";
  content.append(
    safeText("h3", p.name),
    safeText("p", [p.brand, p.subcategory || categoryName(p.category), p.condition].filter(Boolean).join(' · '), "eyebrow"),
    safeText("p", formatNaira(p.discountPrice > 0 && p.discountPrice < p.price ? p.discountPrice : p.price), "price"),
    safeText("p", p.description)
  );

  const actions = document.createElement("div");
  actions.className = "card-actions";

  const details = safeText("a", "Details", "button button-outline");
  details.href = `./product.html?code=${encodeURIComponent(p.id)}`;

  const add = safeText("button", "Add to cart", "button");
  add.type = "button";
  add.onclick = () => openQuickAdd(p);

  const heart = safeText("button", getWishlist().includes(p.id) ? "♥" : "♡", "heart-button");
  heart.type = "button";
  heart.setAttribute("aria-pressed", String(getWishlist().includes(p.id)));
  heart.setAttribute("aria-label", `Save ${p.name} to wishlist`);
  const updateHeart = () => {
    const saved = getWishlist().includes(p.id);
    heart.textContent = saved ? "♥" : "♡";
    heart.setAttribute("aria-pressed", String(saved));
    heart.setAttribute("aria-label", `${saved ? "Remove" : "Save"} ${p.name} ${saved ? "from" : "to"} wishlist`);
  };
  updateHeart();
  heart.onclick = async () => {
    heart.disabled = true;
    try {
      const saved = await toggleWishlist(p.id);
      updateHeart();
      toast(saved ? "Saved to wishlist." : "Removed from wishlist.");
    } catch (error) { toast(error.message, "error"); }
    finally { heart.disabled = false; }
  };

  actions.append(details, add, heart);
  content.append(actions);
  card.append(img, content);
  return card;
}

function categoryName(c) {
  return (
    { phones: 'Phones', laptops: 'Laptops', tablets: 'Tablets', ipads: 'iPads', macbooks: 'MacBooks', chargers: 'Chargers & accessories' }[c] || String(c || '').replace(/-/g, ' ').replace(/\b\w/g, char => char.toUpperCase())
  );
}

// Shared storage/configuration, colour and quantity picker used by both the detail modal and
// the card's "Add to cart" quick-add sheet. Configuration and colour are required
// before anything reaches the cart, matching what the server expects.
function buildOptionPicker(p) {
  const sizeLabel = safeText("label", "Storage / configuration");
  const size = document.createElement("select");
  size.required = true;
  p.sizes.forEach((v) => {
    const option = document.createElement("option");
    option.value = v;
    option.textContent = v;
    size.append(option);
  });
  sizeLabel.append(size);

  const colourLabel = safeText("label", "Colour / variant");
  const colour = document.createElement("select");
  colour.required = true;
  p.colours.forEach((v) => {
    const option = document.createElement("option");
    option.value = v;
    option.textContent = v;
    colour.append(option);
  });
  colourLabel.append(colour);

  const qtyLabel = safeText("label", "Quantity");
  const qty = document.createElement("input");
  qty.type = "number";
  qty.min = "1";
  qty.max = "20";
  qty.value = "1";
  qtyLabel.append(qty);

  return { sizeLabel, colourLabel, qtyLabel, size, colour, qty };
}

function readQuantity(qty) {
  const n = Number(qty.value);
  if (!Number.isInteger(n) || n < 1 || n > 20) {
    toast("Quantity must be between 1 and 20.", "error");
    return null;
  }
  return n;
}

// Quick-add sheet opened from the card's "Add to cart" button, so a size
// and colour are always chosen without leaving the grid context.
function openQuickAdd(p) {
  openModal(`Add ${p.name} to cart`, (modal) => {
    modal.append(safeText("p", formatNaira(p.discountPrice > 0 && p.discountPrice < p.price ? p.discountPrice : p.price), "price"));
    const { sizeLabel, colourLabel, qtyLabel, size, colour, qty } = buildOptionPicker(p);
    modal.append(sizeLabel, colourLabel, qtyLabel);

    const actions = document.createElement("div");
    actions.className = "modal-actions";
    const add = safeText("button", "Add to cart", "button");
    add.type = "button";
    add.onclick = () => {
      const n = readQuantity(qty);
      if (n === null) return;
      addToCart(p.id, n, { size: size.value, colour: colour.value });
      closeModal();
    };
    actions.append(add);
    modal.append(actions);
  });
}

function refreshDynamicFilters() {
  const updateOptions = (id, values, label) => {
    const select = byId(id);
    if (!select) return;
    const current = select.value;
    const existing = new Map([...select.options].map(option => [option.value, option.textContent]));
    for (const value of values) {
      if (!existing.has(value)) existing.set(value, label ? label(value) : value);
    }
    const first = select.options[0];
    select.replaceChildren(first.cloneNode(true));
    for (const [value, text] of [...existing.entries()].slice(1).sort((a, b) => a[1].localeCompare(b[1]))) {
      const option = safeText('option', text);
      option.value = value;
      select.append(option);
    }
    select.value = existing.has(current) ? current : 'all';
  };
  updateOptions('category-filter', [...new Set(products.map(product => product.category).filter(Boolean))], categoryName);
  updateOptions('brand-filter', [...new Set(products.map(product => product.brand).filter(Boolean))]);
  updateOptions('condition-filter', [...new Set(products.map(product => product.condition).filter(Boolean))]);
  const fields = [
    ['storage-filter', product => [...(product.sizes || []), product.specifications?.Storage, product.specifications?.storage]],
    ['ram-filter', product => [product.specifications?.RAM, product.specifications?.Ram]],
    ['processor-filter', product => [product.specifications?.Processor, product.specifications?.CPU]],
  ];
  for (const [id, getValues] of fields) {
    const select = byId(id);
    if (!select) continue;
    const current = select.value;
    const values = [...new Set(products.flatMap(getValues).filter(Boolean).map(value => String(value).trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    select.replaceChildren(safeText('option', id === 'storage-filter' ? 'Any configuration' : id === 'ram-filter' ? 'Any RAM' : 'Any processor'));
    select.options[0].value = 'all';
    for (const value of values) {
      const option = safeText('option', value);
      option.value = value;
      select.append(option);
    }
    select.value = values.includes(current) ? current : 'all';
  }
}

export function initProducts() {
  initWishlist().then(renderProducts).catch(() => {});
  byId("category-filter").addEventListener("change", () => {
    visibleLimit = 8;
    renderProducts();
  });
  byId("sort-filter").addEventListener("change", renderProducts);
  byId("brand-filter")?.addEventListener("change", renderProducts);
  for (const id of ['condition-filter', 'storage-filter', 'ram-filter', 'processor-filter']) byId(id)?.addEventListener('change', renderProducts);
  for (const id of ['price-min', 'price-max']) byId(id)?.addEventListener('input', renderProducts);
  document.querySelectorAll('[data-category]').forEach(link => link.addEventListener('click', () => {
    const value = link.dataset.category;
    byId('category-filter').value = value;
    visibleLimit = 8;
    renderProducts();
  }));
  byId("load-more").addEventListener("click", async () => {
    if (visibleLimit < filteredProductCount || !apiCatalogueLoaded) {
      visibleLimit += 8;
      renderProducts();
      return;
    }
    await loadNextCataloguePage();
  });
  renderProducts();
  loadProductsCatalogue().then(() => { refreshDynamicFilters(); renderProducts(); });
}
