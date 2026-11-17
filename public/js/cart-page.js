import { initCart, loadCart, getCart, getSubtotal, updateQuantity, updateOptions, removeItem, clearCart, whatsappUrl } from './modules/cart.js';
import { api, byId, safeText, formatNaira } from './modules/utils.js';
import { openModal, closeModal } from './modules/modal.js';
import { isApiCatalogueLoaded, loadProductsCatalogue } from './modules/products.js';
import { setShopWhatsappNumber, getShopWhatsappNumber } from './config.js';
import { getCurrentUser } from './modules/account-data.js';
import { initAuth } from './modules/auth.js';
import { initPromotionAnnouncements } from './modules/promotions.js';
const delivery = { pickup: { fee: 0, label: 'Pick-up', time: 'Confirm pick-up arrangements with the store.' }, lagos: { fee: 0, label: 'Within Lagos', time: 'Delivery timing and charges are confirmed for your location.' }, outside: { fee: 0, label: 'Outside Lagos / Nationwide', time: 'Delivery timing and charges are confirmed for your location.' } };
let busy = false;
let checkoutAddressInput = null;
let appliedPromo = null;
let appliedPromoFingerprint = '';
byId('year').textContent = new Date().getFullYear();
function button(text, label, action) {
  const b = safeText('button', text); b.type = 'button'; b.setAttribute('aria-label', label);
  b.onclick = () => perform(action); return b;
}
async function perform(action) {
  if (busy) return;
  const focus = document.activeElement;
  const key = focus?.dataset.focus;
  busy = true;
  document.querySelectorAll('#cart-content button, #cart-content select').forEach(x => x.disabled = true);
  byId('cart-status').textContent = 'Saving your cart…';
  try { await action(); byId('cart-status').textContent = 'Your cart is saved.'; }
  catch (error) { byId('cart-status').textContent = `Changes were not saved: ${error.message}`; }
  finally {
    busy = false; render();
    const target = [...document.querySelectorAll('[data-focus]')].find(x => x.dataset.focus === key);
    (target || (getCart().length ? byId('items-title') : byId('empty-cart').querySelector('a')))?.focus();
  }
}
function renderSummary() {
  const option = delivery[byId('delivery').value];
  const discount = appliedPromo?.discount || 0;
  byId('subtotal').textContent = formatNaira(getSubtotal());
  byId('discount-line').hidden = !appliedPromo;
  byId('discount').textContent = `−${formatNaira(discount)}`;
  byId('delivery-fee').textContent = byId('delivery').value === 'pickup' ? 'No charge' : (option.fee > 0 ? formatNaira(option.fee) : 'Confirm with store');
  byId('total').textContent = formatNaira(Math.max(0, getSubtotal() - discount) + option.fee);
  byId('delivery-time').textContent = option.time;
}
function render() {
  const items = getCart();
  const fingerprint = cartFingerprint();
  if (appliedPromo && fingerprint !== appliedPromoFingerprint) {
    appliedPromo = null;
    appliedPromoFingerprint = '';
    byId('promo-status').textContent = 'Your cart changed. Apply the promo code again.';
  }
  byId('cart-content').hidden = !items.length;
  byId('empty-cart').hidden = !!items.length;
  const list = byId('cart-items'); list.replaceChildren();
  items.forEach((item, index) => {
    const p = item.product;
    const row = document.createElement('article'); row.className = 'cart-item';
    const img = document.createElement('img'); img.src = p.images[0]; img.alt = p.name; img.loading = 'lazy';
    img.onerror = () => { img.onerror = null; img.src = '/assets/images/products/device-placeholder.svg'; };
    const body = document.createElement('div');
    const unitPrice = p.discountPrice > 0 && p.discountPrice < p.price ? p.discountPrice : p.price;
    const top = document.createElement('div'); top.className = 'item-top'; top.append(safeText('h3', p.name), safeText('strong', formatNaira(unitPrice * item.quantity)));
    const options = document.createElement('div'); options.className = 'item-options';
    for (const [field, title, values] of [['size', 'Storage / configuration', p.sizes], ['colour', 'Colour / variant', p.colours]]) {
      const label = safeText('label', title); const select = document.createElement('select');
      select.setAttribute('aria-label', `${title} for ${p.name}`); select.dataset.focus = `${index}-${field}`;
      values.forEach(value => { const option = safeText('option', value); option.value = value; select.append(option); });
      select.value = item[field]; select.disabled = busy;
      select.onchange = () => perform(() => updateOptions(index, { [field]: select.value }));
      label.append(select); options.append(label);
    }
    const bottom = document.createElement('div'); bottom.className = 'item-bottom';
    const controls = document.createElement('div'); controls.className = 'cart-quantity';
    const minus = button('−', `Decrease quantity of ${p.name}`, () => updateQuantity(index, -1));
    const plus = button('+', `Increase quantity of ${p.name}`, () => updateQuantity(index, 1));
    minus.disabled = busy || item.quantity === 1; plus.disabled = busy || item.quantity === 20;
    minus.dataset.focus = `${index}-minus`; plus.dataset.focus = `${index}-plus`;
    controls.append(minus, safeText('span', item.quantity), plus);
    const remove = button('Remove', `Remove ${p.name}, ${item.size}, ${item.colour}`, () => removeItem(index));
    remove.className = 'text-button'; remove.disabled = busy; remove.dataset.focus = `${index}-remove`;
    bottom.append(controls, remove);
    body.append(top, safeText('p', `${formatNaira(unitPrice)} each`, 'item-price'), options, bottom);
    row.append(img, body); list.append(row);
  });
  byId('items-title').textContent = `Your selections (${items.reduce((sum, x) => sum + x.quantity, 0)})`;
  byId('items-title').tabIndex = -1;
  byId('clear-cart').disabled = busy; byId('delivery').disabled = busy; byId('checkout').disabled = busy;
  renderSummary();
}
function cartFingerprint() {
  return JSON.stringify(getCart().map(item => [item.id, item.quantity]).sort((a, b) => a[0].localeCompare(b[0])));
}

async function applyPromo(event) {
  event.preventDefault();
  const codeInput = byId('promo-code');
  const code = codeInput.value.trim().toUpperCase();
  if (!code || busy) return;
  const requestedFingerprint = cartFingerprint();
  const submit = byId('apply-promo');
  submit.disabled = true;
  byId('promo-status').textContent = 'Checking promo code…';
  try {
    const { code: validCode, name, discount } = await api('/promos/validate', {
      method: 'POST',
      body: JSON.stringify({
        code,
        items: getCart().map(item => ({ productId: item.id, quantity: item.quantity })),
      }),
    });
    if (cartFingerprint() !== requestedFingerprint) {
      throw new Error('Your cart changed while the code was being checked. Please apply it again.');
    }
    appliedPromo = { code: validCode, name, discount };
    appliedPromoFingerprint = requestedFingerprint;
    codeInput.value = validCode;
    byId('promo-status').textContent = `${name} applied. You save ${formatNaira(discount)}.`;
    renderSummary();
  } catch (error) {
    appliedPromo = null;
    appliedPromoFingerprint = '';
    byId('promo-status').textContent = error.message || 'This promo code could not be applied.';
    renderSummary();
  } finally {
    submit.disabled = false;
  }
}
function confirmClear() {
  openModal('Clear your cart?', modal => {
    modal.append(safeText('p', 'All selections will be removed from your saved cart.'));
    const actions = document.createElement('div'); actions.className = 'modal-actions';
    const keep = button('Keep shopping', 'Keep items in cart', async () => closeModal()); keep.className = 'button button-outline';
    const clear = button('Clear cart', 'Confirm clearing cart', async () => { closeModal(); await clearCart(); }); clear.className = 'button';
    actions.append(keep, clear); modal.append(actions);
  });
}
function whatsappCheckout() {
  if (busy || !getCart().length) return;
  if (!getShopWhatsappNumber()) {
    byId('cart-status').textContent = 'WhatsApp ordering is not configured yet. Please use the contact form to ask about your order.';
    return;
  }
  openModal('Send your order request', modal => {
    modal.append(safeText('p', 'Our team can confirm product availability, delivery and payment arrangements with you. Sending a message does not reserve items.'));
    const form = document.createElement('form');
    for (const [name, title, required] of [['name', 'Your name', true], ['address', 'Delivery address (required for delivery)', byId('delivery').value !== 'pickup'], ['notes', 'Order notes or delivery instructions (optional)', false]]) {
      const label = safeText('label', title); const input = document.createElement(name === 'notes' ? 'textarea' : 'input');
      input.name = name; input.required = required; input.maxLength = name === 'notes' ? 1000 : 300;
      if (name !== 'notes') input.autocomplete = name === 'name' ? 'name' : 'street-address';
      label.append(input); form.append(label);
    }
    form.append(safeText('p', `Estimated total: ${byId('total').textContent}. Your cart stays saved until you clear it.`, 'notice'));
    const submit = safeText('button', 'Open WhatsApp', 'button'); submit.type = 'submit'; form.append(submit);
    form.onsubmit = e => {
      e.preventDefault(); if (!form.reportValidity()) return;
      const values = Object.fromEntries(new FormData(form)); const option = delivery[byId('delivery').value];
      const finalTotal = Math.max(0, getSubtotal() - (appliedPromo?.discount || 0)) + option.fee;
      const promoLine = appliedPromo ? `\nPromo code: ${appliedPromo.code} (−${formatNaira(appliedPromo.discount)})` : '';
      const extra = `\nDelivery: ${option.label} (${formatNaira(option.fee)})${promoLine}\nEstimated total: ${formatNaira(finalTotal)}\nName: ${values.name}\nAddress: ${values.address || 'Pick-up'}\nNotes: ${values.notes || 'None'}`;
      window.location.assign(whatsappUrl(extra));
    };
    modal.append(form);
  });
}
function submitPaymentUnavailable(form) {
  const notice = safeText('p', 'No payment method is currently configured. Please contact CV GADGETS before placing an order.', 'form-status');
  notice.setAttribute('role', 'status');
  form.append(notice);
}

async function checkout() {
  if (busy || !getCart().length) return;
  let user;
  try {
    user = await getCurrentUser({ refresh: true });
  } catch (error) {
    byId('cart-status').textContent = `We could not verify your sign-in: ${error.message}`;
    return;
  }
  if (!user) {
    const returnTo = encodeURIComponent('/cart.html?checkout=1');
    window.location.assign(`./signin.html?returnTo=${returnTo}`);
    return;
  }

  await loadProductsCatalogue();
  if (!isApiCatalogueLoaded()) {
    whatsappCheckout();
    return;
  }
  if (getCart().some(item => !item.product?.backendAvailable)) {
    whatsappCheckout();
    return;
  }

  let shopConfig;
  try {
    shopConfig = await api('/config');
  } catch (error) {
    byId('cart-status').textContent = `Online checkout is unavailable: ${error.message}`;
    whatsappCheckout();
    return;
  }

  setShopWhatsappNumber(shopConfig.whatsapp);
  for (const [option, fee] of Object.entries(shopConfig.deliveryFees || {})) {
    if (delivery[option] && Number.isFinite(fee) && fee >= 0) delivery[option].fee = fee;
  }
  renderSummary();

  openModal('Place your order', modal => {
    modal.append(safeText('p', 'Your total and availability are confirmed by the backend. The shop will contact you about the next steps.'));
    const form = document.createElement('form');
    const states = ['Abia','Adamawa','Akwa Ibom','Anambra','Bauchi','Bayelsa','Benue','Borno','Cross River','Delta','Ebonyi','Edo','Ekiti','Enugu','FCT','Gombe','Imo','Jigawa','Kaduna','Kano','Katsina','Kebbi','Kogi','Kwara','Lagos','Nasarawa','Niger','Ogun','Ondo','Osun','Oyo','Plateau','Rivers','Sokoto','Taraba','Yobe','Zamfara'];
    const deliveryRequired = byId('delivery').value !== 'pickup';
    const fields = [
      ['name', 'Full name', 'text', true, 80, 'name'],
      ['email', 'Email address', 'email', true, 254, 'email'],
      ['phone', 'Nigerian phone number', 'tel', true, 16, 'tel'],
      ['state', 'State', 'select', deliveryRequired, 60, 'address-level1'],
      ['city', 'City / town', 'text', deliveryRequired, 80, 'address-level2'],
      ['address', 'Street address', 'text', deliveryRequired, 300, 'street-address'],
    ];
    for (const [name, title, type, required, maxLength, autocomplete] of fields) {
      const label = safeText('label', title);
      const input = document.createElement(type === 'select' ? 'select' : 'input');
      input.name = name;
      if (type !== 'select') input.type = type;
      input.required = required;
      if (type !== 'select') input.maxLength = maxLength;
      input.autocomplete = autocomplete;
      if (name === 'state') {
        const placeholder = safeText('option', 'Select your state'); placeholder.value = ''; input.append(placeholder);
        states.forEach(state => { const option = safeText('option', state); option.value = state; input.append(option); });
      }
      if (name === 'name') { input.value = user.name || ''; input.readOnly = true; }
      if (name === 'email') { input.value = user.email || ''; input.readOnly = true; }
      if (name === 'phone') { input.placeholder = '08012345678'; input.pattern = '(?:\\+?234|0)[789][0-9]{9}'; }
      if (name === 'address') checkoutAddressInput = input;
      label.append(input);
      form.append(label);
    }
    const paymentLabel = safeText('label', 'Payment method');
    const payment = document.createElement('select');
    payment.name = 'paymentMethod';
    payment.required = true;
    const paymentChoices = [
      ['bank_transfer', 'Bank transfer', shopConfig.payments?.bankTransfer],
      ['pay_on_delivery', 'Pay on delivery', shopConfig.payments?.payOnDelivery],
      ['paystack', 'Pay online with Paystack', shopConfig.payments?.paystack],
    ];
    for (const [value, label, enabled] of paymentChoices) {
      if (!enabled) continue;
      const option = safeText('option', label);
      option.value = value;
      payment.append(option);
    }
    paymentLabel.append(payment);
    form.append(paymentLabel);
    const paymentHelp = safeText('div', '', 'payment-help');
    paymentHelp.hidden = true;
    form.append(paymentHelp);
    const updatePaymentHelp = () => {
      const details = shopConfig.payments?.bankTransferDetails;
      if (payment.value === 'bank_transfer' && details) {
        paymentHelp.replaceChildren(safeText('strong', 'Bank transfer details'), safeText('p', `${details.bankName} · ${details.accountName} · ${details.accountNumber}`));
        paymentHelp.hidden = false;
      } else { paymentHelp.replaceChildren(); paymentHelp.hidden = true; }
    };
    payment.addEventListener('change', updatePaymentHelp);
    updatePaymentHelp();
    if (!payment.options.length) { submitPaymentUnavailable(form); }

    const notesLabel = safeText('label', 'Order notes or delivery instructions (optional)');
    const notes = document.createElement('textarea');
    notes.name = 'notes';
    notes.maxLength = 1000;
    notesLabel.append(notes);
    form.append(notesLabel);
    form.append(safeText('p', `Estimated total: ${byId('total').textContent}. The server calculates the final total from its catalogue and delivery rates.`, 'notice'));

    const status = safeText('p', '', 'form-status');
    status.setAttribute('role', 'status');
    form.append(status);
    const submit = safeText('button', 'Place order', 'button');
    submit.type = 'submit';
    submit.disabled = !payment.options.length;
    form.append(submit);
    form.onsubmit = async event => {
      event.preventDefault();
      if (!form.reportValidity() || submit.disabled) return;
      submit.disabled = true;
      status.textContent = 'Submitting your order…';
      try {
        const values = Object.fromEntries(new FormData(form));
        const result = await api('/orders', {
          method: 'POST',
          body: JSON.stringify({
            customer: {
              name: user.name,
              email: user.email,
              phone: values.phone.trim(),
              state: values.state || '',
              city: values.city.trim(),
              address: byId('delivery').value === 'pickup' ? 'Pick-up' : values.address.trim(),
            },
            items: getCart().map(item => ({
              productId: item.id,
              quantity: item.quantity,
              size: item.size,
              colour: item.colour,
            })),
            deliveryOption: byId('delivery').value,
            paymentMethod: values.paymentMethod,
            promoCode: appliedPromo?.code || '',
            notes: values.notes.trim(),
          }),
        });

        await clearCart().catch(error => {
          console.error('Could not clear cart after successful order:', error.message);
        });

        if (result.authorizationUrl) {
          window.location.assign(result.authorizationUrl);
          return;
        }

        form.replaceChildren(
          safeText('h3', 'Your order has been received.'),
          safeText('p', `Order ${result.orderId} · ${formatNaira(result.total)} · ${result.paymentStatus}. ${result.message}`)
        );
        const contact = safeText('a', getShopWhatsappNumber() ? 'Contact the shop on WhatsApp' : 'Contact CV GADGETS');
        contact.className = 'button';
        contact.href = getShopWhatsappNumber()
          ? whatsappUrl(`\nOrder reference: ${result.orderId}\nCustomer: ${values.name}\nPhone: ${values.phone}`)
          : './#contact';
        if (getShopWhatsappNumber()) { contact.target = '_blank'; contact.rel = 'noopener noreferrer'; }
        form.append(contact);
      } catch (error) {
        status.textContent = error.message || 'Your order could not be submitted. Please try again.';
        submit.disabled = false;
      }
    };
    modal.append(form);
  });
}
byId('delivery').onchange = () => {
  renderSummary();
  if (checkoutAddressInput) checkoutAddressInput.required = byId('delivery').value !== 'pickup';
  const checkoutForm = document.querySelector('.modal form');
  if (checkoutForm) { for (const field of ['state', 'city']) { const input = checkoutForm.elements.namedItem(field); if (input) input.required = byId('delivery').value !== 'pickup'; } }
};
byId('clear-cart').onclick = confirmClear;
byId('promo-form').addEventListener('submit', applyPromo);
byId('checkout').onclick = checkout;
window.addEventListener('cvgadgets:cart-change', render);
async function start(retry = false) {
  byId('retry-cart').hidden = true; byId('cart-status').textContent = 'Loading your saved cart…';
  try {
    const catalogue = loadProductsCatalogue();
    await (retry ? loadCart() : initCart());
    render();
    await catalogue;
    render();
    byId('cart-status').textContent = 'Your selections are saved for your next visit.';
    if (new URLSearchParams(window.location.search).get('checkout') === '1') {
      window.history.replaceState({}, '', window.location.pathname);
      await checkout();
    }
  }
  catch (error) { byId('cart-status').textContent = `Your cart is unavailable right now: ${error.message}`; byId('retry-cart').hidden = false; }
}
byId('retry-cart').onclick = () => start(true);
initAuth();
initPromotionAnnouncements('cart-promotions');
start();
