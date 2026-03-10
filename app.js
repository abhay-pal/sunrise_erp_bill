const state = {
  products: [],
  invoices: [],
  nextInvoiceNo: 'SUN-001'
};

const els = {
  loader: document.getElementById('app-loader'),
  loaderMessage: document.getElementById('loader-message'),
  dashboard: document.getElementById('dashboard-view'),
  formView: document.getElementById('form-view'),
  form: document.getElementById('invoice-form'),
  invoiceSearch: document.getElementById('invoice-search'),
  invoiceFilter: document.getElementById('invoice-filter'),
  itemsBody: document.querySelector('#items-table tbody'),
  toast: document.getElementById('toast'),
  finalGrandTotal: document.getElementById('finalGrandTotal')
};

const CFG = window.APP_CONFIG || {};

function getApiRoot() {
  return CFG.APPS_SCRIPT_WEBAPP_URL?.trim() || CFG.API_BASE_URL || '/api';
}

async function apiGet(path, params = {}) {
  const root = getApiRoot();
  const useActionMode = !!CFG.APPS_SCRIPT_WEBAPP_URL;
  const url = new URL(useActionMode ? root : `${root}${path}`, window.location.origin);
  if (useActionMode) {
    url.searchParams.set('action', path.replace('/',''));
  }
  Object.entries(params).forEach(([k, v]) => v !== undefined && url.searchParams.set(k, v));
  const res = await fetch(url.toString(), { method: 'GET' });
  const json = await res.json();
  if (!res.ok || json.success === false) throw new Error(json.error || 'Request failed');
  return json.data || json;
}

async function apiPost(path, payload) {
  const root = getApiRoot();
  const useActionMode = !!CFG.APPS_SCRIPT_WEBAPP_URL;
  const url = new URL(useActionMode ? root : `${root}${path}`, window.location.origin);
  const body = useActionMode ? { action: path.replace('/',''), ...payload } : payload;
  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const json = await res.json();
  if (!res.ok || json.success === false) throw new Error(json.error || 'Save failed');
  return json.data || json;
}

function showLoader(msg) {
  els.loaderMessage.textContent = msg;
  els.loader.classList.remove('hidden');
}
function hideLoader() { els.loader.classList.add('hidden'); }
function toast(msg) {
  els.toast.textContent = msg;
  els.toast.classList.remove('hidden');
  setTimeout(() => els.toast.classList.add('hidden'), 2600);
}

function switchView(view) {
  if (view === 'form') {
    els.dashboard.classList.add('hidden');
    els.formView.classList.remove('hidden');
  } else {
    els.formView.classList.add('hidden');
    els.dashboard.classList.remove('hidden');
    renderInvoiceOptions(state.invoices);
  }
}

function renderInvoiceOptions(invoices) {
  const unique = [...new Set(invoices.filter(Boolean))];
  els.invoiceSearch.innerHTML = '<option value="">Select Invoice No</option>';
  unique.forEach(inv => {
    const opt = document.createElement('option');
    opt.value = inv;
    opt.textContent = inv;
    els.invoiceSearch.appendChild(opt);
  });
}

function setupNewInvoice() {
  els.form.reset();
  document.getElementById('invoiceDate').valueAsDate = new Date();
  document.getElementById('invoiceNo').value = state.nextInvoiceNo;
  els.itemsBody.innerHTML = '';
  addRow();
  calcTotals();
  switchView('form');
}

function autoFillStateCode() {
  const gstNo = document.getElementById('gstNo').value.trim();
  if (gstNo.length >= 2) document.getElementById('stateCode').value = gstNo.slice(0, 2);
}

function addRow(item = null) {
  const row = document.createElement('tr');
  const rowNo = els.itemsBody.children.length + 1;
  let options = '<option value="">Select Item...</option>';
  let found = false;
  state.products.forEach((p, idx) => {
    const selected = item && String(item.desc).trim() === String(p[0]).trim();
    if (selected) found = true;
    options += `<option value="${idx}" ${selected ? 'selected' : ''}>${p[0]}</option>`;
  });
  const isFreight = item?.desc?.includes('Packing') || item?.desc?.includes('Freight');
  if (item?.desc && !found && !isFreight) {
    options += `<option value="custom" selected>${item.desc}</option>`;
  }

  const unitPriceVal = item ? Number(item.unitPrice || item.basicPrice || 0) : 0;
  const discountPercentVal = item ? Number(item.discountPercent || 0) : 0;

  row.innerHTML = `
    <td>${rowNo}</td>
    <td>${isFreight ? `<input class="desc-text" readonly value="${item.desc}">` : `<select class="desc">${options}</select>`}</td>
    <td><input class="part" value="${item?.part || ''}"></td>
    <td><input class="hsn" value="${item?.hsn || ''}"></td>
    <td><input type="number" class="qty" value="${item?.qty || 1}"></td>
    <td><input type="number" class="unitPrice" value="${unitPriceVal}"></td>
    <td><input type="number" class="discPercent" value="${discountPercentVal}"></td>
    <td><input class="basicPrice" readonly value="${item?.basicPrice || 0}"></td>
    <td><input class="taxableVal" readonly value="${item?.taxableVal || 0}"></td>
    <td>${taxSelect('igst')}</td>
    <td>${taxSelect('cgst')}</td>
    <td>${taxSelect('sgst')}</td>
    <td><input class="totalRow" readonly value="${item?.totalRow || 0}"></td>
    <td><button type="button" class="btn-remove">×</button></td>
  `;

  row.querySelector('.igst').value = item?.igst ?? 18;
  row.querySelector('.cgst').value = item?.cgst ?? 0;
  row.querySelector('.sgst').value = item?.sgst ?? 0;

  row.addEventListener('input', event => {
    if (event.target.matches('.qty,.unitPrice,.discPercent')) calcRow(row);
  });
  row.addEventListener('change', event => {
    if (event.target.matches('.desc')) fillProduct(event.target);
    if (event.target.matches('.igst,.cgst,.sgst')) handleTax(event.target);
  });
  row.querySelector('.btn-remove').addEventListener('click', () => {
    row.remove();
    renumberRows();
    calcTotals();
  });

  els.itemsBody.appendChild(row);
  calcRow(row);
}

function addFreightRow() {
  addRow({
    desc: 'Packing & Freight Charge', part: '', hsn: '996511', qty: 1,
    unitPrice: 0, discountPercent: 0, igst: 18, cgst: 0, sgst: 0
  });
}

function taxSelect(type) {
  const values = type === 'igst' ? [0, 5, 12, 18, 28] : [0, 2.5, 6, 9, 14];
  return `<select class="${type}">${values.map(v => `<option value="${v}">${v}</option>`).join('')}</select>`;
}

function fillProduct(select) {
  if (select.value === 'custom' || select.value === '') return calcRow(select.closest('tr'));
  const product = state.products[Number(select.value)];
  const tr = select.closest('tr');
  if (!product) return;
  tr.querySelector('.part').value = product[1] || '';
  tr.querySelector('.hsn').value = product[2] || '';
  tr.querySelector('.unitPrice').value = product[3] || 0;
  calcRow(tr);
}

function handleTax(select) {
  const tr = select.closest('tr');
  if (select.classList.contains('igst') && Number(select.value) > 0) {
    tr.querySelector('.cgst').value = 0;
    tr.querySelector('.sgst').value = 0;
  } else if ((select.classList.contains('cgst') || select.classList.contains('sgst')) && Number(select.value) > 0) {
    tr.querySelector('.igst').value = 0;
  }
  calcRow(tr);
}

function calcRow(tr) {
  const qty = Number(tr.querySelector('.qty').value) || 0;
  const unitPrice = Number(tr.querySelector('.unitPrice').value) || 0;
  const discPercent = Number(tr.querySelector('.discPercent').value) || 0;
  const discAmt = unitPrice * (discPercent / 100);
  const basicPrice = unitPrice - discAmt;
  const taxableVal = basicPrice * qty;
  const igst = Number(tr.querySelector('.igst').value) || 0;
  const cgst = Number(tr.querySelector('.cgst').value) || 0;
  const sgst = Number(tr.querySelector('.sgst').value) || 0;
  const totalRow = taxableVal + taxableVal * ((igst + cgst + sgst) / 100);

  tr.querySelector('.basicPrice').value = basicPrice.toFixed(2);
  tr.querySelector('.taxableVal').value = taxableVal.toFixed(2);
  tr.querySelector('.totalRow').value = totalRow.toFixed(2);
  calcTotals();
}

function calcTotals() {
  let grand = 0;
  els.itemsBody.querySelectorAll('.totalRow').forEach(el => { grand += Number(el.value) || 0; });
  els.finalGrandTotal.value = grand.toFixed(2);
}

function renumberRows() {
  [...els.itemsBody.children].forEach((tr, idx) => tr.children[0].textContent = idx + 1);
}

function serializeItems() {
  return [...els.itemsBody.querySelectorAll('tr')].map(tr => {
    const sel = tr.querySelector('.desc');
    const descTxt = tr.querySelector('.desc-text');
    const desc = descTxt ? descTxt.value : (sel?.value ? sel.options[sel.selectedIndex].text : '');
    if (!desc) return null;
    return {
      desc,
      part: tr.querySelector('.part').value,
      hsn: tr.querySelector('.hsn').value,
      qty: tr.querySelector('.qty').value,
      unitPrice: tr.querySelector('.unitPrice').value,
      discountPercent: tr.querySelector('.discPercent').value,
      basicPrice: tr.querySelector('.basicPrice').value,
      taxableVal: tr.querySelector('.taxableVal').value,
      igst: tr.querySelector('.igst').value,
      cgst: tr.querySelector('.cgst').value,
      sgst: tr.querySelector('.sgst').value,
      totalRow: tr.querySelector('.totalRow').value
    };
  }).filter(Boolean);
}

async function loadInitialData() {
  showLoader('Loading products and invoices...');
  try {
    const data = await apiGet('/initial-data');
    state.products = data.products || [];
    state.invoices = data.invoices || [];
    state.nextInvoiceNo = data.nextInvoiceNo || 'SUN-001';
    renderInvoiceOptions(state.invoices);
  } finally {
    hideLoader();
  }
}

async function loadInvoiceForEdit() {
  const invoiceNo = els.invoiceSearch.value;
  if (!invoiceNo) return toast('Select an invoice first.');
  showLoader(`Loading ${invoiceNo}...`);
  try {
    const data = await apiGet('/invoice', { invoiceNo });
    if (!data.found) throw new Error(data.error || 'Invoice not found');

    switchView('form');
    const f = els.form;
    ['invoiceNo','customerName','billingAddress','stateCode','shippingAddress','poDetails','gstNo','remark','invoiceDate','poDate'].forEach(k => {
      if (f[k] && data[k] !== undefined) f[k].value = data[k] || '';
    });

    els.itemsBody.innerHTML = '';
    const items = JSON.parse(data.itemsJson || '[]');
    if (items.length) items.forEach(addRow); else addRow();
    calcTotals();
  } finally {
    hideLoader();
  }
}

async function saveInvoice(event) {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(els.form).entries());
  payload.itemsJson = JSON.stringify(serializeItems());
  document.getElementById('itemsJson').value = payload.itemsJson;

  showLoader('Saving invoice and generating PDF...');
  try {
    const res = await apiPost('/save-invoice', payload);
    toast(res.message || 'Invoice saved successfully.');
    if (res.url) window.open(res.url, '_blank', 'noopener');
    await loadInitialData();
    switchView('dashboard');
  } finally {
    hideLoader();
  }
}

function wireEvents() {
  document.getElementById('btn-create-invoice').addEventListener('click', setupNewInvoice);
  document.getElementById('btn-edit-invoice').addEventListener('click', loadInvoiceForEdit);
  document.getElementById('btn-back').addEventListener('click', () => switchView('dashboard'));
  document.getElementById('btn-add-item').addEventListener('click', () => addRow());
  document.getElementById('btn-add-freight').addEventListener('click', addFreightRow);
  document.getElementById('gstNo').addEventListener('input', autoFillStateCode);
  els.form.addEventListener('submit', saveInvoice);
  els.invoiceFilter.addEventListener('input', e => {
    const q = e.target.value.toLowerCase().trim();
    renderInvoiceOptions(state.invoices.filter(inv => inv.toLowerCase().includes(q)));
  });
}

window.addEventListener('error', e => {
  hideLoader();
  toast(e.message || 'Unexpected error');
});

window.addEventListener('unhandledrejection', e => {
  hideLoader();
  toast(e.reason?.message || 'Request failed');
});

wireEvents();
loadInitialData();
