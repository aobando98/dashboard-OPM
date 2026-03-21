# Dashboard OPM · CreaTica 3D

Dashboard web de **Compras, Operaciones e Inventario** para el negocio de impresión 3D CreaTica 3D. Permite gestionar el stock de materiales en tiempo real, visualizar KPIs clave y exportar reportes en CSV.

---

## Características

- **Autenticación segura** — Google Sign-In via Firebase Authentication
- **Inventario en tiempo real** — CRUD completo sincronizado con Firestore (`onSnapshot`)
- **KPIs ejecutivos** — Índice Operativo, Inversión vs. Presupuesto y Nivel de Servicio (OTIF)
- **Gráficos interactivos** — Distribución de gasto por categoría (doughnut) y nivel de inventario actual (barras + línea de mínimos) via Chart.js
- **Alertas de stock** — Indicadores visuales automáticos cuando un artículo cae bajo su nivel mínimo
- **Exportación CSV** — Descarga el inventario completo con un clic, compatible con Excel
- **Privacidad total** — Cada usuario solo ve sus propios datos (reglas de Firestore por `uid`)
- **Responsive** — Diseño mobile-first con Tailwind CSS

---

## Stack tecnológico

| Capa | Tecnología |
|---|---|
| Frontend | HTML5 + Tailwind CSS (CDN) + Vanilla JS (ES Modules) |
| Base de datos | Firebase Firestore |
| Autenticación | Firebase Authentication (Google Sign-In) |
| Gráficos | Chart.js 4 |
| Hosting | Vercel / Netlify / GitHub Pages |

> No se requiere Node.js, bundler ni proceso de build. El proyecto corre directamente en el navegador.

---

## Estructura de archivos

```
dashboard-OPM/
├── index.html              # SPA completa: login, dashboard, modales
├── firestore.rules         # Reglas de seguridad de Firestore
├── .gitignore
├── PROMPT_CLAUDE.md        # Especificación original del proyecto
└── js/
    ├── firebase-config.js  # Inicialización de Firebase (credenciales aquí)
    ├── auth.js             # Google Sign-In y Sign-Out
    └── app.js              # Lógica principal: CRUD, KPIs, gráficos, CSV
```

---

## Configuración inicial

### 1. Crear proyecto en Firebase

1. Ve a [console.firebase.google.com](https://console.firebase.google.com) → **Agregar proyecto**
2. Dale un nombre (ej. `creatrica3d`) y crea el proyecto

### 2. Habilitar Authentication

1. En el menú lateral: **Authentication** → **Comenzar**
2. Pestaña **Sign-in method** → habilitar **Google** → Guardar

### 3. Crear base de datos Firestore

1. En el menú lateral: **Firestore Database** → **Crear base de datos**
2. Selecciona **Modo de producción**
3. Elige una región (recomendado: `us-central1`)

### 4. Obtener las credenciales

1. Haz clic en ⚙️ **Configuración del proyecto** → pestaña **General**
2. En **Tus apps**, registra una app web (`</>`)
3. Copia el objeto `firebaseConfig`

### 5. Pegar credenciales en el código

Abre `js/firebase-config.js` y reemplaza los valores `"PEGA_TU_..."`:

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

### 6. Aplicar reglas de seguridad

1. En la consola: **Firestore Database** → pestaña **Rules**
2. Copia el contenido de `firestore.rules` y pégalo → **Publicar**

---

## Ejecutar localmente

Los módulos ES (`type="module"`) requieren un servidor HTTP — no funcionan con `file://`.

```bash
# Opción A: Python (sin instalar nada extra)
python -m http.server 8080

# Opción B: Node.js
npx serve .

# Opción C: VS Code
# Instala la extensión "Live Server" y haz clic en "Go Live"
```

Luego abre `http://localhost:8080` en el navegador.

---

## Estructura de datos (Firestore)

**Colección:** `inventario`

| Campo | Tipo | Descripción |
|---|---|---|
| `uid` | `string` | ID del usuario propietario (Firebase Auth) |
| `nombre` | `string` | Nombre del artículo |
| `categoria` | `string` | `Filamento PLA`, `Filamento PETG`, `Resina`, `Repuestos` o `Equipos` |
| `cantidad` | `number` | Unidades en stock |
| `costoUnitario` | `number` | Precio por unidad en MXN |
| `proveedor` | `string` | Nombre del proveedor |
| `nivelMinimo` | `number` | Cantidad mínima antes de mostrar alerta |
| `createdAt` | `timestamp` | Fecha de creación (automático) |
| `updatedAt` | `timestamp` | Fecha de última modificación (automático) |

---

## Seguridad

Las reglas en `firestore.rules` garantizan que:

- Un usuario **solo puede leer** documentos donde `uid == request.auth.uid`
- Al **crear** un documento, el campo `uid` debe coincidir con el usuario autenticado
- Al **actualizar**, el campo `uid` no puede modificarse
- Al **eliminar**, solo el propietario del documento puede hacerlo
- Cualquier otra colección está **bloqueada por defecto**

---

## Despliegue gratuito

### Vercel (recomendado)

```bash
npm i -g vercel
cd dashboard-OPM
vercel --prod
```

O arrastra la carpeta a [vercel.com/new](https://vercel.com/new).

### Netlify

Arrastra la carpeta a [app.netlify.com/drop](https://app.netlify.com/drop).

### GitHub Pages

1. Ve al repositorio → **Settings** → **Pages**
2. Source: `Deploy from a branch` → rama `main` → carpeta `/ (root)`
3. Guarda — en unos minutos estará disponible en `https://<usuario>.github.io/dashboard-OPM`

---

## Ramas

| Rama | Propósito |
|---|---|
| `main` | Código estable, listo para producción |
| `dev` | Desarrollo activo. Hacer PRs hacia `main` |

---

## Personalización

- **Presupuesto mensual**: edita la constante `PRESUPUESTO` en `js/app.js` (línea con `const PRESUPUESTO = 50_000`)
- **Categorías de inventario**: modifica los `<option>` en `index.html` (modal y filtro) y el objeto `BADGE` en `js/app.js`
- **Colores de gráficos**: modifica el array `PALETA` en `js/app.js`
