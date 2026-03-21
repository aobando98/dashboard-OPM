// ============================================================
//  app.js — Lógica principal de la aplicación
//  CreaTica 3D · Dashboard OPM
// ============================================================

import { auth, db }               from './firebase-config.js';
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

// Presupuesto mensual de referencia (MXN) — ajusta según tu negocio
const PRESUPUESTO = 50_000;

// ── Referencias DOM ───────────────────────────────────────────────────────────
const screenLoading   = document.getElementById('screen-loading');
const screenLogin     = document.getElementById('screen-login');
const screenDashboard = document.getElementById('screen-dashboard');
const tablaBody       = document.getElementById('tabla-inventario');
const modal           = document.getElementById('modal');
const modalDelete     = document.getElementById('modal-delete');
const formInventario  = document.getElementById('form-inventario');
const btnSubmit       = document.getElementById('btn-submit-form');

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
  inventarioItems = [];
  await logOut();
});

onAuthStateChanged(auth, (user) => {
  currentUser = user;

  if (user) {
    const nameEl  = document.getElementById('user-name');
    const emailEl = document.getElementById('user-email');
    const photoEl = document.getElementById('user-photo');

    nameEl.textContent  = user.displayName || 'Usuario';
    emailEl.textContent = user.email || '';

    if (user.photoURL) {
      photoEl.src = user.photoURL;
      photoEl.classList.remove('hidden');
    } else {
      photoEl.classList.add('hidden');
    }

    showScreen('dashboard');
    subscribeInventario();
  } else {
    if (unsubscribeSnapshot) { unsubscribeSnapshot(); unsubscribeSnapshot = null; }
    inventarioItems = [];
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
    console.error('[firestore]', err);
    showToast('Error al cargar datos. Verifica tu conexión.', 'error');
  });
}

// ── Actualización de UI ───────────────────────────────────────────────────────
function updateUI() {
  renderKPIs();
  renderChartGasto();
  renderChartInventario();
  renderTable();
}

// ── KPIs ──────────────────────────────────────────────────────────────────────
function renderKPIs() {
  const total      = inventarioItems.length;
  const valorTotal = inventarioItems.reduce((s, i) => s + i.cantidad * i.costoUnitario, 0);
  const itemsOK    = inventarioItems.filter(i => i.cantidad >= i.nivelMinimo).length;
  const itemsAlert = total - itemsOK;
  const pctOK      = total > 0 ? Math.round((itemsOK / total) * 100) : 0;
  const pctPres    = Math.min(Math.round((valorTotal / PRESUPUESTO) * 100), 999);

  // Margen Operativo
  const margenEl = document.getElementById('kpi-margen-valor');
  margenEl.textContent = total === 0 ? '—' : `${pctOK}%`;
  margenEl.className   = `text-4xl font-bold ${
    pctOK >= 80 ? 'text-green-400' : pctOK >= 50 ? 'text-yellow-400' : 'text-red-400'
  }`;
  document.getElementById('kpi-margen-sub').textContent =
    total === 0 ? 'Sin artículos registrados'
                : `${itemsOK} de ${total} artículos en óptimas condiciones`;

  // Gasto vs Presupuesto
  document.getElementById('kpi-gasto-valor').textContent =
    `$${valorTotal.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  document.getElementById('kpi-gasto-sub').textContent =
    `${pctPres}% del presupuesto mensual`;

  const bar = document.getElementById('kpi-gasto-bar');
  bar.style.width = `${Math.min(pctPres, 100)}%`;
  bar.className   = `h-2 rounded-full transition-all duration-700 ${
    pctPres >= 100 ? 'bg-red-500' : pctPres >= 80 ? 'bg-yellow-500' : 'bg-indigo-500'
  }`;

  // OTIF / Nivel de Servicio
  const otifEl = document.getElementById('kpi-otif-valor');
  otifEl.textContent = total === 0 ? '—' : `${pctOK}%`;
  otifEl.className   = `text-4xl font-bold ${
    itemsAlert === 0 ? 'text-green-400' : itemsAlert <= 2 ? 'text-yellow-400' : 'text-red-400'
  }`;
  document.getElementById('kpi-otif-sub').textContent =
    total === 0    ? 'Sin artículos registrados' :
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
              return ` $${ctx.raw.toLocaleString('es-MX', { minimumFractionDigits: 2 })} (${pct}%)`;
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

// ── Tabla de inventario (construida con DOM API — sin innerHTML con datos de usuario) ──
function renderTable() {
  const search  = document.getElementById('input-buscar').value.toLowerCase();
  const catFilt = document.getElementById('select-categoria').value;

  let items = inventarioItems;
  if (search)  items = items.filter(i =>
    i.nombre.toLowerCase().includes(search) || (i.proveedor || '').toLowerCase().includes(search),
  );
  if (catFilt) items = items.filter(i => i.categoria === catFilt);

  // Vaciar tabla
  tablaBody.replaceChildren();

  if (items.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 8;
    td.className = 'py-16 text-center text-gray-500 text-sm';
    td.textContent = inventarioItems.length === 0
      ? 'El inventario está vacío. Haz clic en "+ Agregar Artículo" para comenzar.'
      : 'Sin resultados. Intenta cambiar los filtros de búsqueda.';
    tr.appendChild(td);
    tablaBody.appendChild(tr);
    return;
  }

  const BADGE = {
    'Filamento PLA':  'bg-blue-900/50 text-blue-300',
    'Filamento PETG': 'bg-cyan-900/50 text-cyan-300',
    'Resina':         'bg-purple-900/50 text-purple-300',
    'Repuestos':      'bg-orange-900/50 text-orange-300',
    'Equipos':        'bg-emerald-900/50 text-emerald-300',
  };

  const fragment = document.createDocumentFragment();

  items.forEach(item => {
    const alerta = item.cantidad < item.nivelMinimo;
    const valor  = item.cantidad * item.costoUnitario;

    const tr = document.createElement('tr');
    tr.className = `border-b border-gray-700/50 hover:bg-gray-700/25 transition-colors ${alerta ? 'bg-red-950/20' : ''}`;

    // Nombre
    const tdNombre = document.createElement('td');
    tdNombre.className = 'px-4 py-3 font-medium text-gray-100';
    if (alerta) {
      const dot = document.createElement('span');
      dot.className = 'inline-block w-2 h-2 bg-red-400 rounded-full mr-2 animate-pulse';
      tdNombre.appendChild(dot);
    }
    tdNombre.appendChild(document.createTextNode(item.nombre));

    // Categoría
    const tdCat = document.createElement('td');
    tdCat.className = 'px-4 py-3';
    const badge = document.createElement('span');
    badge.className = `inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${BADGE[item.categoria] ?? 'bg-gray-700 text-gray-300'}`;
    badge.textContent = item.categoria;
    tdCat.appendChild(badge);

    // Cantidad
    const tdCant = document.createElement('td');
    tdCant.className = `px-4 py-3 font-mono font-bold ${alerta ? 'text-red-400' : 'text-green-400'}`;
    tdCant.textContent = item.cantidad;
    if (alerta) {
      const min = document.createElement('span');
      min.className = 'block text-xs font-normal text-red-400/70';
      min.textContent = `Mín: ${item.nivelMinimo}`;
      tdCant.appendChild(min);
    }

    // Costo unitario
    const tdCosto = document.createElement('td');
    tdCosto.className = 'px-4 py-3 font-mono text-gray-300';
    tdCosto.textContent = `$${item.costoUnitario.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    // Valor total
    const tdValor = document.createElement('td');
    tdValor.className = 'px-4 py-3 font-mono font-semibold text-gray-200';
    tdValor.textContent = `$${valor.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    // Proveedor
    const tdProv = document.createElement('td');
    tdProv.className = 'px-4 py-3 text-gray-400 text-sm';
    tdProv.textContent = item.proveedor || '—';

    // Nivel mínimo
    const tdMin = document.createElement('td');
    tdMin.className = 'px-4 py-3 font-mono text-gray-400';
    tdMin.textContent = item.nivelMinimo;

    // Acciones
    const tdAcc = document.createElement('td');
    tdAcc.className = 'px-4 py-3';
    const btnWrap = document.createElement('div');
    btnWrap.className = 'flex gap-1.5';

    const btnEdit = document.createElement('button');
    btnEdit.className = 'px-2.5 py-1 text-xs rounded-md bg-indigo-600/20 text-indigo-400 hover:bg-indigo-600/40 border border-indigo-600/30 transition-colors';
    btnEdit.textContent = 'Editar';
    btnEdit.dataset.action = 'edit';
    btnEdit.dataset.id     = item.id;

    const btnDel = document.createElement('button');
    btnDel.className = 'px-2.5 py-1 text-xs rounded-md bg-red-600/20 text-red-400 hover:bg-red-600/40 border border-red-600/30 transition-colors';
    btnDel.textContent = 'Eliminar';
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
document.getElementById('input-buscar').addEventListener('input',    renderTable);
document.getElementById('select-categoria').addEventListener('change', renderTable);

// ── Modal Agregar / Editar ────────────────────────────────────────────────────
document.getElementById('btn-add-item').addEventListener('click',    () => openModal());
document.getElementById('btn-cancel-form').addEventListener('click', closeModal);
document.getElementById('btn-close-modal').addEventListener('click', closeModal);
modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });

function openModal(id = null) {
  editingItemId = id;
  formInventario.reset();

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
  editingItemId = null;
}

formInventario.addEventListener('submit', async e => {
  e.preventDefault();
  btnSubmit.disabled    = true;
  btnSubmit.textContent = 'Guardando…';

  const data = {
    nombre:        document.getElementById('field-nombre').value.trim(),
    categoria:     document.getElementById('field-categoria').value,
    cantidad:      Number(document.getElementById('field-cantidad').value),
    costoUnitario: Number(document.getElementById('field-costo').value),
    proveedor:     document.getElementById('field-proveedor').value.trim(),
    nivelMinimo:   Number(document.getElementById('field-minimo').value),
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
    console.error('[firestore] Error al guardar:', err);
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

function openDeleteModal(id) {
  pendingDeleteId = id;
  const item    = inventarioItems.find(i => i.id === id);
  const nameEl  = document.getElementById('delete-item-name');
  nameEl.textContent = item ? `"${item.nombre}"` : 'este artículo';
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
    await deleteDoc(doc(db, 'inventario', pendingDeleteId));
    showToast('Artículo eliminado del inventario', 'success');
    closeDeleteModal();
  } catch (err) {
    console.error('[firestore] Error al eliminar:', err);
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
    'Costo Unitario (MXN)', 'Valor Total (MXN)',
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

  // BOM (\uFEFF) para que Excel abra el archivo UTF-8 correctamente
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), { href: url, download: `inventario-creatrica3d-${new Date().toISOString().slice(0, 10)}.csv` });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  showToast(`${inventarioItems.length} artículos exportados a CSV`, 'success');
}

// ── Notificaciones Toast (DOM API — sin innerHTML con datos de usuario) ────────
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
