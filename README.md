# Dashboard OPM · CreaTica 3D

Dashboard web de **Compras, Operaciones e Inventario** para el negocio de impresión 3D CreaTica 3D. Gestiona materiales, registra ventas, calcula precios de productos y visualiza KPIs en tiempo real.

App en producción: **[creaticaopm.web.app](https://creaticaopm.web.app)**

---

## Funcionalidades

### Dashboard
- KPIs de inventario — Índice Operativo, Inversión vs. Presupuesto, Nivel de Servicio (OTIF)
- KPIs de ventas del mes — Ingresos, número de ventas, ticket promedio
- Gráfico de ingresos mensuales (últimos 6 meses)
- Panel de últimas 5 ventas
- Gráficos de inventario — Distribución de gasto por categoría (doughnut) y nivel actual vs. mínimo (barras)
- Alertas visuales automáticas cuando un artículo cae bajo su nivel mínimo

### Inventario
- CRUD completo sincronizado en tiempo real con Firestore (`onSnapshot`)
- Filtro por categoría y búsqueda de texto en la tabla
- Exportación a CSV compatible con Excel (BOM UTF-8)
- Categorías: Filamento PLA, Filamento PETG, Resina, Repuestos, Equipos

### Comparar
- **Cotizador rápido** — compara precios entre proveedores sin necesidad de tener artículos en inventario (datos en memoria, se borran al cerrar la página)
- **Desde el inventario** — agrupa artículos iguales con distintos proveedores y muestra cuál es el más barato y el potencial de ahorro

### Ventas
- CRUD completo de ventas sincronizado con Firestore
- Campos: fecha, producto, cliente, cantidad, precio unitario, notas
- KPIs filtrados al mes actual: ingresos totales, conteo de ventas, ticket promedio

### Precios (Cotizaciones)
Calculadora basada en la metodología Print Farm Academy para determinar el costo real de un producto impreso en 3D:

| Componente | Fórmula |
|---|---|
| Filamento | `(g / 1000) × $/kg × factor eficiencia` |
| Máquina | `horas impresión × tarifa $/hr` |
| Mano de obra | `(minutos / 60) × tarifa $/hr` |
| Empaque | `suma de ítems + envío` |
| **Precio de venta** | `costo / (1 − margen%)` |

- Calculadora integrada de tarifa de impresora (costo de capital + electricidad + buffer)
- Precios sugeridos a 50%, 60%, 70% y margen personalizado
- Botón "Guardar como Producto" para persistir el cálculo en Firestore

### Productos
- Catálogo de productos guardados con sus costos y precios calculados
- Guardar directamente desde la calculadora de precios (incluye snapshot de todos los inputs)
- "Cargar en calculadora" — restaura todos los campos del formulario para recalcular
- Agregar productos manualmente con nombre, material, qty, costo/und, precio sugerido y notas
- CRUD completo con Firestore en tiempo real

---

## Stack tecnológico

| Capa | Tecnología |
|---|---|
| Frontend | HTML5 + Tailwind CSS Play CDN + Vanilla JS (ES Modules) |
| Base de datos | Firebase Firestore (web modular v10) |
| Autenticación | Firebase Authentication — Google Sign-In (`signInWithPopup`) |
| Gráficos | Chart.js 4 (CDN) |
| Hosting | Firebase Hosting |

No se requiere Node.js, bundler ni proceso de build. El proyecto corre directamente en el navegador.

---

## Estructura de archivos

```
dashboard-OPM/
├── index.html                      # SPA completa: pantallas, tabs, modales
├── firebase.json                   # Config de Firebase Hosting + deploy de reglas
├── firestore.rules                 # Reglas de seguridad de Firestore
└── js/
    ├── firebase-init.js            # Auto-detección de entorno, exporta db + auth
    ├── firebase-config.js          # Credenciales locales (gitignored)
    ├── firebase-config.example.js  # Plantilla pública sin credenciales
    ├── auth.js                     # signInWithGoogle(), logOut()
    └── app.js                      # Toda la lógica: CRUD, KPIs, gráficos, calculadora
```

---

## Configuración inicial

### 1. Crear proyecto en Firebase

1. Ve a [console.firebase.google.com](https://console.firebase.google.com) → **Agregar proyecto**
2. Dale un nombre y crea el proyecto

### 2. Habilitar Authentication

1. Menú lateral: **Authentication** → **Comenzar**
2. Pestaña **Sign-in method** → habilitar **Google** → Guardar

### 3. Crear base de datos Firestore

1. Menú lateral: **Firestore Database** → **Crear base de datos**
2. Seleccionar **Modo de producción**
3. Elegir región (recomendado: `us-central1`)

### 4. Registrar app web y obtener credenciales

1. ⚙️ **Configuración del proyecto** → **General** → **Tus apps** → registrar app web (`</>`)
2. Copiar el objeto `firebaseConfig`

### 5. Crear archivo de credenciales local

```bash
cp js/firebase-config.example.js js/firebase-config.js
```

Editar `js/firebase-config.js` con los valores del proyecto:

```js
const firebaseConfig = {
  apiKey:            "AIzaSy...",
  authDomain:        "tu-proyecto.firebaseapp.com",
  projectId:         "tu-proyecto",
  storageBucket:     "tu-proyecto.appspot.com",
  messagingSenderId: "123456789",
  appId:             "1:123456789:web:abc123",
};
```

`firebase-config.js` está en `.gitignore` — nunca se sube a git.

### 6. Aplicar reglas de Firestore

Con Firebase CLI instalado (ver sección Despliegue):
```bash
firebase deploy --only firestore:rules
```

O manualmente: **Firestore Database** → **Rules** → pegar el contenido de `firestore.rules` → Publicar.

---

## Ejecutar localmente

Los módulos ES requieren un servidor HTTP — `file://` no funciona.

```bash
# Opción A: Firebase CLI (recomendado — usa /__/firebase/init.json automáticamente)
firebase serve

# Opción B: Python (requiere js/firebase-config.js con credenciales reales)
python -m http.server 8080
```

---

## Despliegue

```bash
# Instalar Firebase CLI (una sola vez)
npm install -g firebase-tools

# Iniciar sesión
firebase login

# Vincular al proyecto Firebase
#   Seleccionar: Hosting + Firestore
#   Public directory: . (punto)
firebase init

# Desplegar hosting + reglas de Firestore
firebase deploy

# Solo el frontend (sin tocar reglas)
firebase deploy --only hosting
```

---

## Modelo de datos (Firestore)

Tres colecciones, todas filtradas por `uid` en cada query y protegidas por reglas de seguridad.

### `inventario`

| Campo | Tipo | Descripción |
|---|---|---|
| `uid` | string | UID del usuario propietario |
| `nombre` | string | Nombre del artículo (max 100) |
| `categoria` | string | Una de las 5 categorías válidas |
| `cantidad` | number | Unidades en stock (0–999999) |
| `costoUnitario` | number | Costo por unidad en USD (0–999999) |
| `proveedor` | string | Nombre del proveedor (max 100) |
| `nivelMinimo` | number | Umbral de alerta (0–999999) |
| `createdAt` | timestamp | Creación automática |
| `updatedAt` | timestamp | Actualización automática |

### `ventas`

| Campo | Tipo | Descripción |
|---|---|---|
| `uid` | string | UID del usuario propietario |
| `fecha` | string | Fecha en formato YYYY-MM-DD |
| `producto` | string | Nombre del producto vendido (max 100) |
| `cliente` | string | Nombre del cliente (max 100, opcional) |
| `cantidad` | number | Unidades vendidas (1–999999) |
| `precioUnitario` | number | Precio de venta por unidad en USD (0–999999) |
| `notas` | string | Observaciones (max 200) |
| `createdAt` | timestamp | Creación automática |
| `updatedAt` | timestamp | Actualización automática |

### `productos`

| Campo | Tipo | Descripción |
|---|---|---|
| `uid` | string | UID del usuario propietario |
| `nombre` | string | Nombre del producto (max 100) |
| `material` | string | Material utilizado (max 50, opcional) |
| `qty` | number | Unidades calculadas (1–999999) |
| `costoUnidad` | number | Costo por unidad calculado en USD (0–999999) |
| `precioSugerido` | number | Precio de venta sugerido en USD (0–999999) |
| `notas` | string | Observaciones (max 200) |
| `inputs` | string | JSON con todos los inputs de cotización para recargar (max 5000, vacío si entrada manual) |
| `createdAt` | timestamp | Creación automática |
| `updatedAt` | timestamp | Actualización automática |

---

## Seguridad

Las reglas en `firestore.rules` garantizan que:

- Un usuario **solo puede leer** documentos donde `uid == request.auth.uid`
- Al **crear**, el campo `uid` debe coincidir con el usuario autenticado y todos los campos deben pasar validación de tipos, rangos y lista blanca de categorías
- Al **actualizar**, el campo `uid` no puede modificarse y los campos siguen siendo validados
- Al **eliminar**, solo el propietario puede hacerlo
- Cualquier otra colección está **bloqueada por defecto**

La validación se aplica en tres capas: atributos HTML (`maxlength`, `max`), sanitización en JavaScript, y reglas de Firestore en el servidor.

---

## Personalización

- **Presupuesto mensual de referencia**: constante `PRESUPUESTO` en `js/app.js`
- **Categorías de inventario**: actualizar en cuatro lugares a la vez — `<option>` en `index.html` (modal + filtro), objeto `BADGE` en `js/app.js`, Set `CATEGORIAS_VALIDAS` en `js/app.js`, y función `camposValidos()` en `firestore.rules`
- **Colores de gráficos**: array `PALETA` en `js/app.js`

---

## Ramas

| Rama | Propósito |
|---|---|
| `main` | Código estable, listo para producción |
| `dev` | Desarrollo activo — hacer PRs hacia `main` |
