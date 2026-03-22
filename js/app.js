// ============================================================
//  app.js — Lógica principal de la aplicación
//  CreaTica 3D · Dashboard OPM
// ============================================================

import { auth, db }               from './firebase-init.js';
import { signInWithGoogle, logOut } from './auth.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import {
  collection, query, where, onSnapshot,
  addDoc, updateDoc, deleteDoc,
  doc, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

// ── Estado global ─────────────────────────────────────────────────────────────
let currentUser         = null;
let inventarioItems     = [];
let chartGasto          = null;
let chartInventario     = null;
let editingItemId       = null;
let pendingDeleteId     = null;
let unsubscribeSnapshot = null;
let cotizacionItems     = [];
let cotizacionNextId    = 0;
let ventasItems         = [];
let unsubscribeVentas   = null;
let editingVentaId      = null;
let pendingDeleteType   = 'inventario';

const PRESUPUESTO = 50_000; // USD — ajusta según tu negocio

// ── Referencias DOM ───────────────────────────────────────────────────────────
const screenLoading   = document.getElementById('screen-loading');
const screenLogin     = document.getElementById('screen-login');
const screenDashboard = document.getElementById('screen-dashboard');
const tablaBody       = document.getElementById('tabla-inventario');
const modal           = document.getElementById('modal');
const modalDelete     = document.getElementById('modal-delete');
const formInventario  = document.getElementById('form-inventario');
const btnSubmit       = document.getElementById('btn-submit-form');

// ── Constantes de validación ──────────────────────────────────────────────────
const CATEGORIAS_VALIDAS = new Set([
  'Filamento PLA', 'Filamento PETG', 'Resina', 'Repuestos', 'Equipos',
]);
const MAX_CHARS = 100;
const MAX_NUM   = 999_999;

const FORM_FIELDS = [
  'field-nombre', 'field-categoria', 'field-cantidad',
  'field-costo',  'field-proveedor', 'field-minimo',
];

const BADGE = {
  'Filamento PLA':  'bg-blue-900/50 text-blue-300',
  'Filamento PETG': 'bg-cyan-900/50 text-cyan-300',
  'Resina':         'bg-purple-900/50 text-purple-300',
  'Repuestos':      'bg-orange-900/50 text-orange-300',
  'Equipos':        'bg-emerald-900/50 text-emerald-300',
};

// ── Sanitización: normaliza antes de validar ──────────────────────────────────
function sanitizeStr(val) {
  return String(val ?? '').trim().slice(0, MAX_CHARS);
}

function sanitizeInt(val) {
  const n = Math.floor(Number(val));
  return Number.isFinite(n) ? Math.max(0, Math.min(n, MAX_NUM)) : -1; // -1 = inválido
}

function sanitizeFloat(val) {
  const n = parseFloat(Number(val).toFixed(2));
  return Number.isFinite(n) ? Math.max(0, Math.min(n, MAX_NUM)) : -1; // -1 = inválido
}

function readForm() {
  return {
    nombre:        sanitizeStr(document.getElementById('field-nombre').value),
    categoria:     document.getElementById('field-categoria').value,
    cantidad:      sanitizeInt(document.getElementById('field-cantidad').value),
    costoUnitario: sanitizeFloat(document.getElementById('field-costo').value),
    proveedor:     sanitizeStr(document.getElementById('field-proveedor').value),
    nivelMinimo:   sanitizeInt(document.getElementById('field-minimo').value),
  };
}

// ── Validación: reglas de negocio ─────────────────────────────────────────────
function validateForm(data) {
  const errors = {};

  if (!data.nombre)
    errors['field-nombre']    = 'El nombre es obligatorio.';

  if (!CATEGORIAS_VALIDAS.has(data.categoria))
    errors['field-categoria'] = 'Selecciona una categoría válida.';

  if (data.cantidad < 0)
    errors['field-cantidad']  = 'Ingresa un número entero ≥ 0.';

  if (data.costoUnitario < 0)
    errors['field-costo']     = 'Ingresa un costo válido (≥ 0).';

  if (data.nivelMinimo < 0)
    errors['field-minimo']    = 'Ingresa un número entero ≥ 0.';

  return { valid: Object.keys(errors).length === 0, errors };
}

// ── Feedback visual por campo ─────────────────────────────────────────────────
function showFieldErrors(errors) {
  clearFieldErrors();
  for (const [id, msg] of Object.entries(errors)) {
    const input = document.getElementById(id);
    const errEl = document.getElementById(`err-${id}`);
    input?.classList.add('border-red-500');
    if (errEl) errEl.textContent = msg;
  }
  // Focus al primer campo con error
  const firstId = Object.keys(errors)[0];
  document.getElementById(firstId)?.focus();
}

function clearFieldErrors() {
  FORM_FIELDS.forEach(id => {
    document.getElementById(id)?.classList.remove('border-red-500');
    const errEl = document.getElementById(`err-${id}`);
    if (errEl) errEl.textContent = '';
  });
}

// ── Gestión de pantallas ──────────────────────────────────────────────────────
function showScreen(name) {
  [screenLoading, screenLogin, screenDashboard].forEach(el => el.classList.add('hidden'));
  document.getElementById(`screen-${name}`).classList.remove('hidden');
}

// ── Autenticación ─────────────────────────────────────────────────────────────

document.getElementById('btn-google-signin').addEventListener('click', async () => {
  try {
    await signInWithGoogle();
  } catch {
    showToast('Error al iniciar sesión. Intenta de nuevo.', 'error');
  }
});

document.getElementById('btn-logout').addEventListener('click', async () => {
  if (unsubscribeSnapshot) { unsubscribeSnapshot(); unsubscribeSnapshot = null; }
  if (unsubscribeVentas)   { unsubscribeVentas();   unsubscribeVentas   = null; }
  inventarioItems = [];
  ventasItems     = [];
  await logOut();
});

onAuthStateChanged(auth, (user) => {
  currentUser = user;

  if (user) {
    document.getElementById('user-name').textContent  = user.displayName || 'Usuario';
    document.getElementById('user-email').textContent = user.email || '';

    const photoEl = document.getElementById('user-photo');
    // Sólo aceptar URLs de dominios conocidos de Google (fotos de perfil)
    if (user.photoURL && /^https:\/\/lh\d+\.googleusercontent\.com\//.test(user.photoURL)) {
      photoEl.src = user.photoURL;
      photoEl.classList.remove('hidden');
    } else {
      photoEl.classList.add('hidden');
    }

    showScreen('dashboard');
    subscribeInventario();
    subscribeVentas();
  } else {
    if (unsubscribeSnapshot) { unsubscribeSnapshot(); unsubscribeSnapshot = null; }
    if (unsubscribeVentas)   { unsubscribeVentas();   unsubscribeVentas   = null; }
    inventarioItems = [];
    ventasItems     = [];
    showScreen('login');
  }
});

// ── Suscripción Firestore ─────────────────────────────────────────────────────
function subscribeInventario() {
  const q = query(
    collection(db, 'inventario'),
    where('uid', '==', currentUser.uid),
  );

  unsubscribeSnapshot = onSnapshot(q, (snap) => {
    inventarioItems = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    updateUI();
  }, (err) => {
    console.error('[firestore]', err.code);
    showToast('Error al cargar datos. Verifica tu conexión.', 'error');
  });
}

// ── Actualización de UI ───────────────────────────────────────────────────────
function updateUI() {
  renderKPIs();
  renderChartGasto();
  renderChartInventario();
  renderTable();
  renderComparacion();
}

// ── Tabs ──────────────────────────────────────────────────────────────────────
let activeTab = 'dashboard';

function switchTab(tab) {
  activeTab = tab;
  const tabs    = ['dashboard', 'comparacion', 'ventas', 'cotizaciones'];
  const btnBase = 'flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer';

  tabs.forEach(t => {
    document.getElementById(`tab-${t}`).classList.toggle('hidden', t !== tab);
    const btn = document.getElementById(`tab-btn-${t}`);
    if (t === tab) {
      btn.className = `${btnBase} bg-indigo-600 text-white`;
    } else {
      btn.className = `${btnBase} text-gray-400 hover:text-gray-200 hover:bg-gray-700/50`;
    }
  });
}

document.getElementById('tab-btn-dashboard').addEventListener('click',     () => switchTab('dashboard'));
document.getElementById('tab-btn-comparacion').addEventListener('click',   () => switchTab('comparacion'));
document.getElementById('tab-btn-ventas').addEventListener('click',        () => switchTab('ventas'));
document.getElementById('tab-btn-cotizaciones').addEventListener('click',  () => switchTab('cotizaciones'));

// ── Cotizador rápido (in-memory, sin Firestore) ───────────────────────────────

function addCotizacionEntry() {
  const nombre   = document.getElementById('cotiz-nombre').value.trim().slice(0, 100);
  const proveedor = document.getElementById('cotiz-proveedor').value.trim().slice(0, 100);
  const precio   = parseFloat(document.getElementById('cotiz-precio').value);

  if (!nombre || !proveedor || !Number.isFinite(precio) || precio < 0) return;

  cotizacionItems.push({ id: cotizacionNextId++, nombre, proveedor, precio });
  document.getElementById('cotiz-nombre').value    = '';
  document.getElementById('cotiz-proveedor').value = '';
  document.getElementById('cotiz-precio').value    = '';
  document.getElementById('cotiz-nombre').focus();
  renderCotizacion();
}

document.getElementById('btn-add-cotizacion').addEventListener('click', addCotizacionEntry);
document.getElementById('cotiz-precio').addEventListener('keydown', e => {
  if (e.key === 'Enter') addCotizacionEntry();
});

function renderCotizacion() {
  const entriesEl = document.getElementById('cotizacion-entries');
  const resultsEl = document.getElementById('cotizacion-results');
  if (!entriesEl || !resultsEl) return;

  while (entriesEl.firstChild) entriesEl.removeChild(entriesEl.firstChild);
  while (resultsEl.firstChild) resultsEl.removeChild(resultsEl.firstChild);

  if (cotizacionItems.length === 0) return;

  // ── Tabla de entradas ──
  const tableWrap = document.createElement('div');
  tableWrap.className = 'overflow-x-auto';
  const table = document.createElement('table');
  table.className = 'w-full text-sm';

  const thead = document.createElement('thead');
  const hrow  = document.createElement('tr');
  ['Artículo', 'Proveedor', 'Precio USD', ''].forEach(label => {
    const th = document.createElement('th');
    th.className = 'text-left text-xs font-medium text-gray-500 pb-2 pr-4';
    th.textContent = label;
    hrow.appendChild(th);
  });
  thead.appendChild(hrow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  cotizacionItems.forEach(item => {
    const tr = document.createElement('tr');
    tr.className = 'border-t border-gray-700/50';

    const tdN = document.createElement('td');
    tdN.className = 'py-2 pr-4 text-gray-200';
    tdN.textContent = item.nombre;

    const tdP = document.createElement('td');
    tdP.className = 'py-2 pr-4 text-gray-400';
    tdP.textContent = item.proveedor;

    const tdC = document.createElement('td');
    tdC.className = 'py-2 pr-4 text-gray-200 font-mono';
    tdC.textContent = `$${item.precio.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const tdDel = document.createElement('td');
    const btnDel = document.createElement('button');
    btnDel.className = 'text-gray-600 hover:text-red-400 transition-colors cursor-pointer';
    btnDel.innerHTML = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
    </svg>`;
    btnDel.addEventListener('click', () => {
      cotizacionItems = cotizacionItems.filter(i => i.id !== item.id);
      renderCotizacion();
    });
    tdDel.appendChild(btnDel);

    tr.append(tdN, tdP, tdC, tdDel);
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  tableWrap.appendChild(table);

  const clearRow = document.createElement('div');
  clearRow.className = 'flex justify-end mt-2';
  const btnClear = document.createElement('button');
  btnClear.className = 'text-xs text-gray-600 hover:text-red-400 transition-colors cursor-pointer';
  btnClear.textContent = 'Limpiar todo';
  btnClear.addEventListener('click', () => { cotizacionItems = []; renderCotizacion(); });
  clearRow.appendChild(btnClear);

  entriesEl.append(tableWrap, clearRow);

  // ── Comparación agrupada ──
  const grupos = {};
  cotizacionItems.forEach(item => {
    const key = item.nombre.trim().toLowerCase();
    if (!grupos[key]) grupos[key] = { nombre: item.nombre, items: [] };
    grupos[key].items.push(item);
  });

  const comparables = Object.values(grupos).filter(g => {
    const provs = new Set(g.items.map(i => i.proveedor.trim().toLowerCase()));
    return provs.size > 1;
  });

  if (comparables.length === 0) return;

  const secLabel = document.createElement('p');
  secLabel.className = 'text-xs font-medium text-gray-500 uppercase tracking-wide pt-2';
  secLabel.textContent = 'Resultado';
  resultsEl.appendChild(secLabel);

  const fmt = v => `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  comparables.forEach(grupo => {
    const sorted   = [...grupo.items].sort((a, b) => a.precio - b.precio);
    const minPrecio = sorted[0].precio;
    const maxPrecio = sorted[sorted.length - 1].precio;
    const ahorro   = maxPrecio - minPrecio;
    const pct      = maxPrecio > 0 ? Math.round((ahorro / maxPrecio) * 100) : 0;

    const card = document.createElement('div');
    card.className = 'bg-gray-700/40 border border-gray-600/50 rounded-xl overflow-hidden mt-3';

    const cardHead = document.createElement('div');
    cardHead.className = 'flex items-center justify-between px-4 py-3 border-b border-gray-600/50';
    const cardTitle = document.createElement('span');
    cardTitle.className = 'font-medium text-white text-sm';
    cardTitle.textContent = grupo.nombre;
    const savBadge = document.createElement('span');
    savBadge.className = 'text-xs text-emerald-400 font-medium';
    savBadge.textContent = `Ahorro potencial: ${fmt(ahorro)} (${pct}%)`;
    cardHead.append(cardTitle, savBadge);
    card.appendChild(cardHead);

    sorted.forEach((item, idx) => {
      const row = document.createElement('div');
      row.className = `flex items-center justify-between px-4 py-3${idx === 0 ? ' bg-emerald-900/20' : ''}`;

      const left = document.createElement('div');
      left.className = 'flex items-center gap-2';

      if (idx === 0) {
        const badge = document.createElement('span');
        badge.className = 'text-xs bg-emerald-700/50 text-emerald-300 px-2 py-0.5 rounded-full font-medium';
        badge.textContent = 'Mejor precio';
        left.appendChild(badge);
      }

      const provName = document.createElement('span');
      provName.className = `text-sm ${idx === 0 ? 'text-emerald-300' : 'text-gray-300'}`;
      provName.textContent = item.proveedor;
      left.appendChild(provName);

      const precioEl = document.createElement('span');
      precioEl.className = `text-sm font-mono font-medium ${idx === 0 ? 'text-emerald-300' : 'text-gray-400'}`;
      precioEl.textContent = fmt(item.precio);

      row.append(left, precioEl);
      card.appendChild(row);
    });

    resultsEl.appendChild(card);
  });
}

// ── Comparación de Proveedores ────────────────────────────────────────────────
function renderComparacion() {
  const container = document.getElementById('comparacion-container');
  if (!container) return;

  while (container.firstChild) container.removeChild(container.firstChild);

  // Agrupar por nombre normalizado
  const grupos = {};
  inventarioItems.forEach(item => {
    const key = item.nombre.trim().toLowerCase();
    if (!grupos[key]) grupos[key] = { nombre: item.nombre, categoria: item.categoria, items: [] };
    grupos[key].items.push(item);
  });

  // Solo grupos con 2+ proveedores distintos
  const comparables = Object.values(grupos).filter(g => {
    const provs = new Set(g.items.map(i => (i.proveedor || '').trim().toLowerCase()));
    return provs.size > 1;
  });

  if (comparables.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'bg-gray-800 rounded-xl border border-gray-700/50 p-12 text-center';
    const icon = document.createElement('div');
    icon.className = 'w-12 h-12 bg-gray-700/60 rounded-full flex items-center justify-center mx-auto mb-4';
    icon.innerHTML = `<svg class="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
        d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3"/>
    </svg>`;
    const p1 = document.createElement('p');
    p1.className = 'text-gray-300 font-medium';
    p1.textContent = 'Sin comparaciones disponibles';
    const p2 = document.createElement('p');
    p2.className = 'text-gray-500 text-sm mt-1 max-w-xs mx-auto';
    p2.textContent = 'Agrega el mismo artículo con distintos proveedores en el inventario para verlos comparados aquí.';
    empty.append(icon, p1, p2);
    container.appendChild(empty);
    return;
  }

  // Ordenar grupos alfabéticamente
  comparables.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

  comparables.forEach(grupo => {
    const sorted    = [...grupo.items].sort((a, b) => a.costoUnitario - b.costoUnitario);
    const minCosto  = sorted[0].costoUnitario;
    const maxCosto  = sorted[sorted.length - 1].costoUnitario;
    const ahorro    = maxCosto - minCosto;
    const pctAhorro = maxCosto > 0 ? Math.round((ahorro / maxCosto) * 100) : 0;

    const fmt = v => `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    // Card
    const card = document.createElement('div');
    card.className = 'bg-gray-800 rounded-xl border border-gray-700/50 p-5';

    // Header
    const header = document.createElement('div');
    header.className = 'flex items-start justify-between mb-4';

    const titleWrap = document.createElement('div');
    const title = document.createElement('h3');
    title.className = 'text-sm font-semibold text-gray-100';
    title.textContent = grupo.nombre;
    const badgeEl = document.createElement('span');
    badgeEl.className = `inline-flex mt-1 px-2 py-0.5 rounded-full text-xs font-medium ${BADGE[grupo.categoria] ?? 'bg-gray-700 text-gray-300'}`;
    badgeEl.textContent = grupo.categoria;
    titleWrap.append(title, badgeEl);

    const savingsWrap = document.createElement('div');
    savingsWrap.className = 'text-right flex-shrink-0 ml-4';
    const savingsLabel = document.createElement('p');
    savingsLabel.className = 'text-xs text-gray-500';
    savingsLabel.textContent = 'Ahorro potencial';
    const savingsVal = document.createElement('p');
    savingsVal.className = 'text-sm font-bold text-green-400';
    savingsVal.textContent = `${fmt(ahorro)} (${pctAhorro}%)`;
    savingsWrap.append(savingsLabel, savingsVal);

    header.append(titleWrap, savingsWrap);

    // Filas de proveedores
    const rows = document.createElement('div');
    rows.className = 'space-y-2';

    sorted.forEach((item, idx) => {
      const isBest = item.costoUnitario === minCosto;
      const row = document.createElement('div');
      row.className = `flex items-center justify-between p-3 rounded-lg border ${
        isBest
          ? 'border-green-700/50 bg-green-900/20'
          : 'border-gray-700/40 bg-gray-700/20'
      }`;

      // Izquierda: rank + nombre proveedor + stock
      const left = document.createElement('div');
      left.className = 'flex items-center gap-3 min-w-0';

      const rank = document.createElement('span');
      rank.className = `w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
        isBest ? 'bg-green-600 text-white' : 'bg-gray-600 text-gray-300'
      }`;
      rank.textContent = idx + 1;

      const info = document.createElement('div');
      info.className = 'min-w-0';
      const provEl = document.createElement('p');
      provEl.className = 'text-sm text-gray-200 font-medium truncate';
      provEl.textContent = item.proveedor || '(sin proveedor)';
      const qtyEl = document.createElement('p');
      qtyEl.className = 'text-xs text-gray-500';
      qtyEl.textContent = `Stock: ${item.cantidad} uds`;
      info.append(provEl, qtyEl);
      left.append(rank, info);

      // Derecha: costo + diferencia
      const right = document.createElement('div');
      right.className = 'text-right flex-shrink-0 ml-4';
      const costEl = document.createElement('p');
      costEl.className = `text-sm font-bold ${isBest ? 'text-green-400' : 'text-gray-300'}`;
      costEl.textContent = fmt(item.costoUnitario);
      const diffEl = document.createElement('p');
      diffEl.className = 'text-xs text-gray-500';
      diffEl.textContent = isBest ? '✓ Más económico' : `+${fmt(item.costoUnitario - minCosto)}`;
      right.append(costEl, diffEl);

      row.append(left, right);
      rows.appendChild(row);
    });

    card.append(header, rows);
    container.appendChild(card);
  });
}

// ── KPIs ──────────────────────────────────────────────────────────────────────
function renderKPIs() {
  const total      = inventarioItems.length;
  const valorTotal = inventarioItems.reduce((s, i) => s + i.cantidad * i.costoUnitario, 0);
  const itemsOK    = inventarioItems.filter(i => i.cantidad >= i.nivelMinimo).length;
  const itemsAlert = total - itemsOK;
  const pctOK      = total > 0 ? Math.round((itemsOK / total) * 100) : 0;
  const pctPres    = Math.min(Math.round((valorTotal / PRESUPUESTO) * 100), 999);

  const margenEl = document.getElementById('kpi-margen-valor');
  margenEl.textContent = total === 0 ? '—' : `${pctOK}%`;
  margenEl.className   = `text-4xl font-bold ${
    pctOK >= 80 ? 'text-green-400' : pctOK >= 50 ? 'text-yellow-400' : 'text-red-400'
  }`;
  document.getElementById('kpi-margen-sub').textContent =
    total === 0 ? 'Sin artículos registrados'
                : `${itemsOK} de ${total} artículos en óptimas condiciones`;

  document.getElementById('kpi-gasto-valor').textContent =
    `$${valorTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  document.getElementById('kpi-gasto-sub').textContent =
    `${pctPres}% del presupuesto mensual`;

  const bar = document.getElementById('kpi-gasto-bar');
  bar.style.width = `${Math.min(pctPres, 100)}%`;
  bar.className   = `h-2 rounded-full transition-all duration-700 ${
    pctPres >= 100 ? 'bg-red-500' : pctPres >= 80 ? 'bg-yellow-500' : 'bg-indigo-500'
  }`;

  const otifEl = document.getElementById('kpi-otif-valor');
  otifEl.textContent = total === 0 ? '—' : `${pctOK}%`;
  otifEl.className   = `text-4xl font-bold ${
    itemsAlert === 0 ? 'text-green-400' : itemsAlert <= 2 ? 'text-yellow-400' : 'text-red-400'
  }`;
  document.getElementById('kpi-otif-sub').textContent =
    total === 0      ? 'Sin artículos registrados' :
    itemsAlert === 0 ? 'Todos los artículos sobre el nivel mínimo' :
                       `${itemsAlert} artículo${itemsAlert > 1 ? 's' : ''} en alerta de stock`;
}

// ── Gráfico 1: Distribución de gasto por categoría ────────────────────────────
const PALETA = ['#818cf8', '#a78bfa', '#c084fc', '#e879f9', '#fb7185'];

function renderChartGasto() {
  const ctx     = document.getElementById('chart-gasto').getContext('2d');
  const emptyEl = document.getElementById('chart-gasto-empty');

  const gastos = {};
  inventarioItems.forEach(i => {
    gastos[i.categoria] = (gastos[i.categoria] || 0) + i.cantidad * i.costoUnitario;
  });
  const labels = Object.keys(gastos);
  const data   = Object.values(gastos);

  if (chartGasto) { chartGasto.destroy(); chartGasto = null; }

  if (labels.length === 0) { emptyEl.classList.remove('hidden'); return; }
  emptyEl.classList.add('hidden');

  chartGasto = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: PALETA.slice(0, labels.length),
        borderColor:     '#1f2937',
        borderWidth:     3,
        hoverOffset:     8,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: '#9ca3af', font: { size: 11 }, padding: 12, usePointStyle: true },
        },
        tooltip: {
          callbacks: {
            label: ctx => {
              const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
              const pct   = Math.round((ctx.raw / total) * 100);
              return ` $${ctx.raw.toLocaleString('en-US', { minimumFractionDigits: 2 })} (${pct}%)`;
            },
          },
        },
      },
    },
  });
}

// ── Gráfico 2: Nivel de inventario actual ─────────────────────────────────────
function renderChartInventario() {
  const ctx     = document.getElementById('chart-inventario').getContext('2d');
  const emptyEl = document.getElementById('chart-inv-empty');

  const items      = inventarioItems.slice(0, 12);
  const labels     = items.map(i => i.nombre.length > 14 ? i.nombre.slice(0, 13) + '…' : i.nombre);
  const cantidades = items.map(i => i.cantidad);
  const minimos    = items.map(i => i.nivelMinimo);

  if (chartInventario) { chartInventario.destroy(); chartInventario = null; }

  if (items.length === 0) { emptyEl.classList.remove('hidden'); return; }
  emptyEl.classList.add('hidden');

  chartInventario = new Chart(ctx, {
    data: {
      labels,
      datasets: [
        {
          type: 'bar',
          label: 'Stock Actual',
          data: cantidades,
          backgroundColor: cantidades.map((q, i) =>
            q < minimos[i] ? 'rgba(248,113,113,0.75)' : 'rgba(129,140,248,0.75)',
          ),
          borderColor: cantidades.map((q, i) =>
            q < minimos[i] ? '#f87171' : '#818cf8',
          ),
          borderWidth: 2,
          borderRadius: 5,
          order: 2,
        },
        {
          type: 'line',
          label: 'Nivel Mínimo',
          data: minimos,
          borderColor:          '#fbbf24',
          backgroundColor:      'transparent',
          borderWidth:          2,
          borderDash:           [5, 4],
          pointRadius:          4,
          pointBackgroundColor: '#fbbf24',
          tension:              0,
          order:                1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          ticks: { color: '#6b7280', font: { size: 11 }, maxRotation: 40 },
          grid:  { color: '#374151' },
        },
        y: {
          beginAtZero: true,
          ticks: { color: '#6b7280', font: { size: 11 } },
          grid:  { color: '#374151' },
        },
      },
      plugins: {
        legend: { labels: { color: '#9ca3af', font: { size: 11 }, usePointStyle: true } },
      },
    },
  });
}

// ── Tabla de inventario ───────────────────────────────────────────────────────
function renderTable() {
  const search  = document.getElementById('input-buscar').value.toLowerCase();
  const catFilt = document.getElementById('select-categoria').value;

  let items = inventarioItems;
  if (search)  items = items.filter(i =>
    i.nombre.toLowerCase().includes(search) || (i.proveedor || '').toLowerCase().includes(search),
  );
  if (catFilt) items = items.filter(i => i.categoria === catFilt);

  tablaBody.replaceChildren();

  if (items.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan   = 8;
    td.className = 'py-16 text-center text-gray-500 text-sm';
    td.textContent = inventarioItems.length === 0
      ? 'El inventario está vacío. Haz clic en "+ Agregar Artículo" para comenzar.'
      : 'Sin resultados. Intenta cambiar los filtros de búsqueda.';
    tr.appendChild(td);
    tablaBody.appendChild(tr);
    return;
  }

  const fragment = document.createDocumentFragment();

  items.forEach(item => {
    const alerta = item.cantidad < item.nivelMinimo;
    const valor  = item.cantidad * item.costoUnitario;

    const tr = document.createElement('tr');
    tr.className = `border-b border-gray-700/50 hover:bg-gray-700/25 transition-colors ${alerta ? 'bg-red-950/20' : ''}`;

    const tdNombre = document.createElement('td');
    tdNombre.className = 'px-4 py-3 font-medium text-gray-100';
    if (alerta) {
      const dot = document.createElement('span');
      dot.className = 'inline-block w-2 h-2 bg-red-400 rounded-full mr-2 animate-pulse';
      tdNombre.appendChild(dot);
    }
    tdNombre.appendChild(document.createTextNode(item.nombre));

    const tdCat = document.createElement('td');
    tdCat.className = 'px-4 py-3';
    const badge = document.createElement('span');
    // Sólo aplica clase si la categoría está en la lista blanca conocida
    badge.className = `inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
      CATEGORIAS_VALIDAS.has(item.categoria) ? (BADGE[item.categoria] ?? 'bg-gray-700 text-gray-300') : 'bg-gray-700 text-gray-400'
    }`;
    badge.textContent = CATEGORIAS_VALIDAS.has(item.categoria) ? item.categoria : 'Desconocida';
    tdCat.appendChild(badge);

    const tdCant = document.createElement('td');
    tdCant.className = `px-4 py-3 font-mono font-bold ${alerta ? 'text-red-400' : 'text-green-400'}`;
    tdCant.textContent = item.cantidad;
    if (alerta) {
      const min = document.createElement('span');
      min.className = 'block text-xs font-normal text-red-400/70';
      min.textContent = `Mín: ${item.nivelMinimo}`;
      tdCant.appendChild(min);
    }

    const tdCosto = document.createElement('td');
    tdCosto.className = 'px-4 py-3 font-mono text-gray-300';
    tdCosto.textContent = `$${item.costoUnitario.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const tdValor = document.createElement('td');
    tdValor.className = 'px-4 py-3 font-mono font-semibold text-gray-200';
    tdValor.textContent = `$${valor.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const tdProv = document.createElement('td');
    tdProv.className = 'px-4 py-3 text-gray-400 text-sm';
    tdProv.textContent = item.proveedor || '—';

    const tdMin = document.createElement('td');
    tdMin.className = 'px-4 py-3 font-mono text-gray-400';
    tdMin.textContent = item.nivelMinimo;

    const tdAcc = document.createElement('td');
    tdAcc.className = 'px-4 py-3';
    const btnWrap = document.createElement('div');
    btnWrap.className = 'flex gap-1.5';

    const btnEdit = document.createElement('button');
    btnEdit.className = 'px-2.5 py-1 text-xs rounded-md bg-indigo-600/20 text-indigo-400 hover:bg-indigo-600/40 border border-indigo-600/30 transition-colors';
    btnEdit.textContent    = 'Editar';
    btnEdit.dataset.action = 'edit';
    btnEdit.dataset.id     = item.id;

    const btnDel = document.createElement('button');
    btnDel.className = 'px-2.5 py-1 text-xs rounded-md bg-red-600/20 text-red-400 hover:bg-red-600/40 border border-red-600/30 transition-colors';
    btnDel.textContent    = 'Eliminar';
    btnDel.dataset.action = 'delete';
    btnDel.dataset.id     = item.id;

    btnWrap.append(btnEdit, btnDel);
    tdAcc.appendChild(btnWrap);

    tr.append(tdNombre, tdCat, tdCant, tdCosto, tdValor, tdProv, tdMin, tdAcc);
    fragment.appendChild(tr);
  });

  tablaBody.appendChild(fragment);
}

// Event delegation para la tabla
tablaBody.addEventListener('click', e => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  if (btn.dataset.action === 'edit')   openModal(btn.dataset.id);
  if (btn.dataset.action === 'delete') openDeleteModal(btn.dataset.id);
});

// Filtros
document.getElementById('input-buscar').addEventListener('input',     renderTable);
document.getElementById('select-categoria').addEventListener('change', renderTable);

// ── Modal Agregar / Editar ────────────────────────────────────────────────────
document.getElementById('btn-add-item').addEventListener('click',    () => openModal());
document.getElementById('btn-cancel-form').addEventListener('click', closeModal);
document.getElementById('btn-close-modal').addEventListener('click', closeModal);
modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });

function openModal(id = null) {
  editingItemId = id;
  formInventario.reset();
  clearFieldErrors();

  if (id) {
    const item = inventarioItems.find(i => i.id === id);
    if (!item) return;
    document.getElementById('modal-title').textContent   = 'Editar Artículo';
    document.getElementById('field-nombre').value        = item.nombre;
    document.getElementById('field-categoria').value     = item.categoria;
    document.getElementById('field-cantidad').value      = item.cantidad;
    document.getElementById('field-costo').value         = item.costoUnitario;
    document.getElementById('field-proveedor').value     = item.proveedor ?? '';
    document.getElementById('field-minimo').value        = item.nivelMinimo;
  } else {
    document.getElementById('modal-title').textContent = 'Agregar Artículo';
  }

  modal.classList.remove('hidden');
  setTimeout(() => document.getElementById('field-nombre').focus(), 50);
}

function closeModal() {
  modal.classList.add('hidden');
  clearFieldErrors();
  editingItemId = null;
}

// ── Submit del formulario con sanitización + validación ───────────────────────
formInventario.addEventListener('submit', async e => {
  e.preventDefault();

  // 1. Leer y sanitizar todos los inputs
  const raw = readForm();

  // 2. Validar reglas de negocio
  const { valid, errors } = validateForm(raw);
  if (!valid) {
    showFieldErrors(errors);
    return; // No deshabilitar el botón — el usuario debe corregir
  }

  // 3. Guardar en Firestore sólo datos limpios y validados
  btnSubmit.disabled    = true;
  btnSubmit.textContent = 'Guardando…';

  const data = {
    nombre:        raw.nombre,
    categoria:     raw.categoria,
    cantidad:      raw.cantidad,
    costoUnitario: raw.costoUnitario,
    proveedor:     raw.proveedor,
    nivelMinimo:   raw.nivelMinimo,
    uid:           currentUser.uid,
    updatedAt:     serverTimestamp(),
  };

  try {
    if (editingItemId) {
      await updateDoc(doc(db, 'inventario', editingItemId), data);
      showToast('Artículo actualizado correctamente', 'success');
    } else {
      data.createdAt = serverTimestamp();
      await addDoc(collection(db, 'inventario'), data);
      showToast('Artículo agregado al inventario', 'success');
    }
    closeModal();
  } catch (err) {
    console.error('[firestore] Error al guardar:', err.code);
    showToast('Error al guardar. Intenta de nuevo.', 'error');
  } finally {
    btnSubmit.disabled    = false;
    btnSubmit.textContent = 'Guardar';
  }
});

// ── Modal de confirmación de eliminación ──────────────────────────────────────
document.getElementById('btn-cancel-delete').addEventListener('click',  closeDeleteModal);
document.getElementById('btn-confirm-delete').addEventListener('click', handleDelete);
modalDelete.addEventListener('click', e => { if (e.target === modalDelete) closeDeleteModal(); });

function openDeleteModal(id, type = 'inventario') {
  pendingDeleteId   = id;
  pendingDeleteType = type;
  const nameEl = document.getElementById('delete-item-name');
  if (type === 'venta') {
    const v = ventasItems.find(v => v.id === id);
    nameEl.textContent = v ? `"${v.producto}"` : 'esta venta';
  } else {
    const item = inventarioItems.find(i => i.id === id);
    nameEl.textContent = item ? `"${item.nombre}"` : 'este artículo';
  }
  modalDelete.classList.remove('hidden');
}

function closeDeleteModal() {
  modalDelete.classList.add('hidden');
  pendingDeleteId = null;
}

async function handleDelete() {
  if (!pendingDeleteId) return;
  const btn        = document.getElementById('btn-confirm-delete');
  btn.disabled     = true;
  btn.textContent  = 'Eliminando…';

  try {
    const coleccion = pendingDeleteType === 'venta' ? 'ventas' : 'inventario';
    const msg       = pendingDeleteType === 'venta' ? 'Venta eliminada' : 'Artículo eliminado del inventario';
    await deleteDoc(doc(db, coleccion, pendingDeleteId));
    showToast(msg, 'success');
    closeDeleteModal();
  } catch (err) {
    console.error('[firestore] Error al eliminar:', err.code);
    showToast('Error al eliminar. Intenta de nuevo.', 'error');
  } finally {
    btn.disabled    = false;
    btn.textContent = 'Sí, eliminar';
  }
}

// ── Exportación a CSV ─────────────────────────────────────────────────────────
document.getElementById('btn-export-csv').addEventListener('click', exportCSV);

function exportCSV() {
  if (inventarioItems.length === 0) {
    showToast('No hay artículos para exportar', 'error');
    return;
  }

  const HEADERS = [
    'Nombre', 'Categoría', 'Cantidad',
    'Costo Unitario (USD)', 'Valor Total (USD)',
    'Proveedor', 'Nivel Mínimo',
  ];

  const rows = inventarioItems.map(i => [
    i.nombre,
    i.categoria,
    i.cantidad,
    i.costoUnitario.toFixed(2),
    (i.cantidad * i.costoUnitario).toFixed(2),
    i.proveedor ?? '',
    i.nivelMinimo,
  ]);

  const csv = [HEADERS, ...rows]
    .map(row => row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), {
    href:     url,
    download: `inventario-creatrica3d-${new Date().toISOString().slice(0, 10)}.csv`,
  });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  showToast(`${inventarioItems.length} artículos exportados a CSV`, 'success');
}

// ── Ventas: Firestore subscription ───────────────────────────────────────────

function subscribeVentas() {
  const q = query(
    collection(db, 'ventas'),
    where('uid', '==', currentUser.uid),
  );
  unsubscribeVentas = onSnapshot(q, (snap) => {
    ventasItems = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => b.fecha.localeCompare(a.fecha)); // más reciente primero
    updateVentasUI();
  }, (err) => {
    console.error('[firestore ventas]', err.code);
    showToast('Error al cargar ventas. Verifica tu conexión.', 'error');
  });
}

function updateVentasUI() {
  renderVentasKPIs();
  renderVentasTable();
}

// ── Ventas: KPIs ──────────────────────────────────────────────────────────────

function renderVentasKPIs() {
  const ahora  = new Date();
  const mesAct = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}`;

  const delMes = ventasItems.filter(v => v.fecha && v.fecha.startsWith(mesAct));
  const totalIngresos = delMes.reduce((s, v) => s + v.cantidad * v.precioUnitario, 0);
  const count         = delMes.length;
  const promedio      = count > 0 ? totalIngresos / count : 0;

  const fmt = n => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  document.getElementById('vkpi-ingresos').textContent     = count === 0 ? '—' : fmt(totalIngresos);
  document.getElementById('vkpi-ingresos-sub').textContent = count === 0
    ? 'Sin ventas este mes'
    : `${count} venta${count > 1 ? 's' : ''} registrada${count > 1 ? 's' : ''}`;

  document.getElementById('vkpi-count').textContent     = count === 0 ? '—' : count;
  document.getElementById('vkpi-count-sub').textContent = ventasItems.length === 0
    ? 'Sin ventas registradas'
    : `${ventasItems.length} venta${ventasItems.length > 1 ? 's' : ''} en total`;

  document.getElementById('vkpi-avg').textContent     = count === 0 ? '—' : fmt(promedio);
  document.getElementById('vkpi-avg-sub').textContent = count === 0 ? 'Sin ventas este mes' : 'por venta este mes';
}

// ── Ventas: Tabla ─────────────────────────────────────────────────────────────

function renderVentasTable() {
  const tbody  = document.getElementById('ventas-tabla-body');
  const emptyEl = document.getElementById('ventas-empty');
  if (!tbody) return;

  while (tbody.firstChild) tbody.removeChild(tbody.firstChild);

  if (ventasItems.length === 0) {
    emptyEl.classList.remove('hidden');
    return;
  }
  emptyEl.classList.add('hidden');

  const fmt = n => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  ventasItems.forEach(v => {
    const total = v.cantidad * v.precioUnitario;
    const tr    = document.createElement('tr');
    tr.className = 'border-t border-gray-700/40 hover:bg-gray-700/20 transition-colors';

    const tdFecha = document.createElement('td');
    tdFecha.className = 'px-4 py-3 text-gray-300 text-sm whitespace-nowrap';
    // Mostrar fecha en formato local sin desfase de zona horaria
    const [y, m, d] = (v.fecha || '').split('-');
    tdFecha.textContent = v.fecha ? `${d}/${m}/${y}` : '—';

    const tdProducto = document.createElement('td');
    tdProducto.className = 'px-4 py-3 text-gray-100 text-sm font-medium max-w-[180px] truncate';
    tdProducto.textContent = v.producto;
    if (v.notas) tdProducto.title = v.notas;

    const tdCliente = document.createElement('td');
    tdCliente.className = 'px-4 py-3 text-gray-400 text-sm';
    tdCliente.textContent = v.cliente || '—';

    const tdCant = document.createElement('td');
    tdCant.className = 'px-4 py-3 text-gray-300 text-sm text-right';
    tdCant.textContent = v.cantidad;

    const tdPrecio = document.createElement('td');
    tdPrecio.className = 'px-4 py-3 text-gray-300 text-sm text-right font-mono';
    tdPrecio.textContent = fmt(v.precioUnitario);

    const tdTotal = document.createElement('td');
    tdTotal.className = 'px-4 py-3 text-emerald-400 text-sm text-right font-mono font-semibold';
    tdTotal.textContent = fmt(total);

    const tdAcciones = document.createElement('td');
    tdAcciones.className = 'px-4 py-3';
    const btnGroup = document.createElement('div');
    btnGroup.className = 'flex items-center justify-end gap-1';

    const btnEdit = document.createElement('button');
    btnEdit.className = 'p-1.5 text-gray-500 hover:text-indigo-400 transition-colors cursor-pointer rounded';
    btnEdit.title = 'Editar';
    btnEdit.innerHTML = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
    </svg>`;
    btnEdit.addEventListener('click', () => openVentaModal(v));

    const btnDel = document.createElement('button');
    btnDel.className = 'p-1.5 text-gray-500 hover:text-red-400 transition-colors cursor-pointer rounded';
    btnDel.title = 'Eliminar';
    btnDel.innerHTML = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
    </svg>`;
    btnDel.addEventListener('click', () => openDeleteModal(v.id, 'venta'));

    btnGroup.append(btnEdit, btnDel);
    tdAcciones.appendChild(btnGroup);

    tr.append(tdFecha, tdProducto, tdCliente, tdCant, tdPrecio, tdTotal, tdAcciones);
    tbody.appendChild(tr);
  });
}

// ── Ventas: Modal crear / editar ──────────────────────────────────────────────

const modalVenta = document.getElementById('modal-venta');

function openVentaModal(venta = null) {
  editingVentaId = venta ? venta.id : null;
  document.getElementById('modal-venta-title').textContent = venta ? 'Editar Venta' : 'Nueva Venta';
  document.getElementById('btn-submit-venta').textContent  = venta ? 'Guardar Cambios' : 'Guardar Venta';

  // Fecha por defecto: hoy en formato YYYY-MM-DD
  const hoy = new Date().toISOString().slice(0, 10);
  document.getElementById('venta-fecha').value    = venta ? venta.fecha            : hoy;
  document.getElementById('venta-producto').value = venta ? venta.producto         : '';
  document.getElementById('venta-cliente').value  = venta ? (venta.cliente || '')  : '';
  document.getElementById('venta-cantidad').value = venta ? venta.cantidad         : '';
  document.getElementById('venta-precio').value   = venta ? venta.precioUnitario   : '';
  document.getElementById('venta-notas').value    = venta ? (venta.notas || '')    : '';

  modalVenta.classList.remove('hidden');
  document.getElementById('venta-producto').focus();
}

function closeVentaModal() {
  modalVenta.classList.add('hidden');
  editingVentaId = null;
}

async function guardarVenta() {
  const fecha   = document.getElementById('venta-fecha').value;
  const producto = String(document.getElementById('venta-producto').value).trim().slice(0, 100);
  const cliente  = String(document.getElementById('venta-cliente').value).trim().slice(0, 100);
  const cantidad = Math.floor(Number(document.getElementById('venta-cantidad').value));
  const precioUnitario = parseFloat(Number(document.getElementById('venta-precio').value).toFixed(2));
  const notas   = String(document.getElementById('venta-notas').value).trim().slice(0, 200);

  if (!fecha || !producto || !Number.isFinite(cantidad) || cantidad < 1
      || !Number.isFinite(precioUnitario) || precioUnitario < 0) {
    showToast('Completa los campos obligatorios.', 'error');
    return;
  }

  const btn = document.getElementById('btn-submit-venta');
  btn.disabled = true;
  btn.textContent = 'Guardando…';

  const data = {
    uid: currentUser.uid, fecha, producto, cliente, cantidad,
    precioUnitario, notas, updatedAt: serverTimestamp(),
  };

  try {
    if (editingVentaId) {
      await updateDoc(doc(db, 'ventas', editingVentaId), data);
      showToast('Venta actualizada', 'success');
    } else {
      await addDoc(collection(db, 'ventas'), { ...data, createdAt: serverTimestamp() });
      showToast('Venta registrada', 'success');
    }
    closeVentaModal();
  } catch (err) {
    console.error('[firestore ventas] Error al guardar:', err.code);
    showToast('Error al guardar. Intenta de nuevo.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = editingVentaId ? 'Guardar Cambios' : 'Guardar Venta';
  }
}

document.getElementById('btn-nueva-venta').addEventListener('click',       () => openVentaModal());
document.getElementById('btn-close-modal-venta').addEventListener('click', closeVentaModal);
document.getElementById('btn-submit-venta').addEventListener('click',      guardarVenta);
modalVenta.addEventListener('click', e => { if (e.target === modalVenta) closeVentaModal(); });

// ── Cotizaciones: inicializar filas dinámicas ─────────────────────────────────

function initCotizRows() {
  // 5 filas de hardware/materiales extra
  const hwContainer = document.getElementById('cq-hw-rows');
  if (hwContainer && hwContainer.children.length === 0) {
    for (let i = 0; i < 5; i++) {
      const row = document.createElement('div');
      row.className = 'grid grid-cols-3 gap-2 items-center';
      row.innerHTML = `
        <input type="text"   placeholder="Material extra"
          class="cq-hw-name col-span-1 bg-gray-700/50 border border-gray-600/50 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-indigo-500"/>
        <input type="number" placeholder="0.00" min="0" step="0.01"
          class="cq-hw-cost bg-gray-700/50 border border-gray-600/50 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-indigo-500"/>
        <input type="number" placeholder="1" min="1" step="1"
          class="cq-hw-qty  bg-gray-700/50 border border-gray-600/50 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-indigo-500"/>
      `;
      hwContainer.appendChild(row);
    }
  }

  // 5 filas de empaque
  const pkgContainer = document.getElementById('cq-pkg-rows');
  if (pkgContainer && pkgContainer.children.length === 0) {
    for (let i = 0; i < 5; i++) {
      const row = document.createElement('div');
      row.className = 'grid grid-cols-3 gap-2 items-center';
      row.innerHTML = `
        <input type="text"   placeholder="Ítem de empaque"
          class="cq-pkg-name col-span-1 bg-gray-700/50 border border-gray-600/50 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-indigo-500"/>
        <input type="number" placeholder="0.00" min="0" step="0.01"
          class="cq-pkg-cost bg-gray-700/50 border border-gray-600/50 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-indigo-500"/>
        <input type="number" placeholder="1" min="1" step="1"
          class="cq-pkg-qty  bg-gray-700/50 border border-gray-600/50 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-indigo-500"/>
      `;
      pkgContainer.appendChild(row);
    }
  }
}

// ── Cotizaciones: calcular tarifa de impresora ────────────────────────────────

function calcPrinterRate(adv) {
  // Costo de vida = (costo impresora + upfront extra) + (mantenimiento anual × vida)
  const lifetimeCost = (adv.printerCost + adv.additionalUpfront) + (adv.annualMaintenance * adv.printerLife);
  // Horas activas por año = 8760 × uptime%
  const uptimeHrsPerYr = 8760 * (adv.uptime / 100);
  // Costo de capital por hora
  const capitalPerHr = lifetimeCost / (uptimeHrsPerYr * adv.printerLife);
  // Costo eléctrico por hora
  const electricalPerHr = (adv.powerW / 1000) * adv.electricityCost;
  // Tarifa final con buffer
  return (capitalPerHr + electricalPerHr) * adv.bufferFactor;
}

// ── Cotizaciones: leer todos los inputs ───────────────────────────────────────

function getCotizInputs() {
  const v = id => parseFloat(document.getElementById(id)?.value) || 0;
  const s = id => String(document.getElementById(id)?.value || '').trim();

  // Filas de hardware extra
  const hwRows = [...(document.getElementById('cq-hw-rows')?.querySelectorAll('.grid') || [])].map(row => ({
    cost: parseFloat(row.querySelector('.cq-hw-cost')?.value) || 0,
    qty:  Math.max(1, parseInt(row.querySelector('.cq-hw-qty')?.value)  || 1),
  }));

  // Filas de empaque
  const pkgRows = [...(document.getElementById('cq-pkg-rows')?.querySelectorAll('.grid') || [])].map(row => ({
    cost: parseFloat(row.querySelector('.cq-pkg-cost')?.value) || 0,
    qty:  Math.max(1, parseInt(row.querySelector('.cq-pkg-qty')?.value)  || 1),
  }));

  return {
    // Producto
    qty: Math.max(1, parseInt(document.getElementById('cq-qty')?.value) || 1),
    // Costos de impresión
    filCostPerKg: v('cq-fil-cost'),
    filGrams:     v('cq-fil-g'),
    printHrs:     v('cq-print-hr'),
    laborMin:     v('cq-labor-min'),
    // Materiales extra y empaque
    hwRows,
    pkgRows,
    shippingCost: v('cq-shipping'),
    // Avanzados
    efficiency:   Math.max(0.01, v('cq-adv-eff')  || 1.1),
    laborRate:    v('cq-adv-labor')                || 20,
    printerRate:  v('cq-adv-printer')              || 0.31,
    // Margen personalizado
    customMargin: v('cq-custom-margin') || 65,
  };
}

// ── Cotizaciones: cálculo principal ───────────────────────────────────────────

function calcCotizacion(inp) {
  // 1. Costo de filamento: (g / 1000) × $/kg × factor eficiencia
  const filamentCost = (inp.filGrams / 1000) * inp.filCostPerKg * inp.efficiency;

  // 2. Materiales extra (hardware)
  const hwCost = inp.hwRows.reduce((sum, r) => sum + r.cost * r.qty, 0);

  // 3. Costo de máquina (tiempo de impresión × tarifa $/hr)
  const machineCost = inp.printHrs * inp.printerRate;

  // 4. Costo laboral: (min / 60) × tarifa $/hr
  const laborCost = (inp.laborMin / 60) * inp.laborRate;

  // 5. Costo de empaque (materiales)
  const pkgMaterials = inp.pkgRows.reduce((sum, r) => sum + r.cost * r.qty, 0);
  const packagingCost = pkgMaterials + inp.shippingCost;

  // 6. Costo total desembarcado por lote
  const totalLanded = filamentCost + hwCost + machineCost + laborCost + packagingCost;
  const perUnit     = inp.qty > 0 ? totalLanded / inp.qty : totalLanded;

  // 7. Precios sugeridos a distintos márgenes (precio = costo / (1 - margen))
  const priceAt = (margin) => perUnit / (1 - margin / 100);

  return {
    materials:  filamentCost + hwCost,
    labor:      laborCost,
    machine:    machineCost,
    packaging:  packagingCost,
    landed:     totalLanded,
    perUnit,
    price50:    priceAt(50),
    price60:    priceAt(60),
    price70:    priceAt(70),
    priceCustom: priceAt(inp.customMargin),
  };
}

// ── Cotizaciones: actualizar panel de resultados ──────────────────────────────

function recalcularCotizacion() {
  const inp  = getCotizInputs();
  const res  = calcCotizacion(inp);
  const fmt  = n => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // Subtotales en panel de resultados
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set('cq-r-materials', fmt(res.materials));
  set('cq-r-labor',     fmt(res.labor));
  set('cq-r-machine',   fmt(res.machine));
  set('cq-r-packaging', fmt(res.packaging));
  set('cq-r-landed',    fmt(res.landed));
  set('cq-r-per-unit',  fmt(res.perUnit));
  set('cq-r-50',        fmt(res.price50));
  set('cq-r-60',        fmt(res.price60));
  set('cq-r-70',        fmt(res.price70));
  set('cq-r-custom',    fmt(res.priceCustom));

  // Actualizar subtotales inline del formulario
  const hwSub  = inp.hwRows.reduce((s, r)  => s + r.cost * r.qty, 0);
  const pkgSub = inp.pkgRows.reduce((s, r) => s + r.cost * r.qty, 0);
  const hwSubEl  = document.getElementById('cq-hw-subtotal');
  const pkgSubEl = document.getElementById('cq-pkg-subtotal');
  if (hwSubEl)  hwSubEl.textContent  = fmt(hwSub);
  if (pkgSubEl) pkgSubEl.textContent = fmt(pkgSub + inp.shippingCost);
}

// ── Cotizaciones: calculadora de tarifa de impresora ─────────────────────────

function updatePrinterCalcResult() {
  const v = id => parseFloat(document.getElementById(id)?.value) || 0;
  const adv = {
    printerCost:        v('cq-pc-cost'),
    additionalUpfront:  v('cq-pc-upfront'),
    annualMaintenance:  v('cq-pc-maint'),
    printerLife:        Math.max(1, v('cq-pc-life')   || 3),
    uptime:             Math.max(1, v('cq-pc-uptime') || 50),
    powerW:             v('cq-pc-power'),
    electricityCost:    v('cq-pc-elec'),
    bufferFactor:       Math.max(1, v('cq-pc-buffer') || 1.35),
  };
  const rate = calcPrinterRate(adv);
  const resultEl = document.getElementById('cq-pc-result');
  if (resultEl) {
    resultEl.textContent = `$${rate.toFixed(4)}/hr`;
  }
  return rate;
}

// ── Cotizaciones: event listeners ─────────────────────────────────────────────

const tabCotiz = document.getElementById('tab-cotizaciones');
if (tabCotiz) {
  // Reactividad: cualquier cambio en el tab recalcula
  tabCotiz.addEventListener('input', () => {
    updatePrinterCalcResult();
    recalcularCotizacion();
  });

  // Toggle panel avanzado
  document.getElementById('btn-cq-adv')?.addEventListener('click', () => {
    const panel = document.getElementById('cq-adv-panel');
    panel?.classList.toggle('hidden');
  });

  // Toggle calculadora de impresora
  document.getElementById('btn-cq-printer-calc')?.addEventListener('click', () => {
    const panel = document.getElementById('cq-printer-calc-panel');
    panel?.classList.toggle('hidden');
  });

  // Botón "Usar esta tarifa"
  document.getElementById('btn-cq-use-rate')?.addEventListener('click', () => {
    const rate = updatePrinterCalcResult();
    const field = document.getElementById('cq-adv-printer');
    if (field) {
      field.value = rate.toFixed(4);
      recalcularCotizacion();
    }
  });
}

// Inicialización al cargar
initCotizRows();
recalcularCotizacion();

// ── Notificaciones Toast ──────────────────────────────────────────────────────
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  const ok        = type === 'success';

  const toast = document.createElement('div');
  toast.className = [
    'flex items-center gap-3 px-4 py-3 rounded-xl shadow-xl border text-sm font-medium',
    'transition-all duration-300 opacity-0 translate-y-3 pointer-events-auto',
    ok ? 'bg-green-900/95 border-green-700/80 text-green-200'
       : 'bg-red-900/95 border-red-700/80 text-red-200',
  ].join(' ');

  const icon = document.createElement('span');
  icon.textContent = ok ? '✓' : '✗';

  const text = document.createElement('span');
  text.textContent = message;

  toast.append(icon, text);
  container.appendChild(toast);

  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      toast.classList.replace('opacity-0', 'opacity-100');
      toast.classList.replace('translate-y-3', 'translate-y-0');
    }),
  );

  setTimeout(() => {
    toast.classList.replace('opacity-100', 'opacity-0');
    toast.classList.replace('translate-y-0', 'translate-y-3');
    setTimeout(() => toast.remove(), 350);
  }, 3200);
}
