# PROMPT PARA CLAUDE CODE: Dashboard de Compras e Inventario (CreaTica 3D)

**Rol:** Actúa como un Senior Full-Stack Engineer. 

**Objetivo:** Desarrollar el código completo y listo para producción de una Single-Page Application (SPA) para gestionar las Compras, Operaciones e Inventario de mi negocio de impresión 3D, "CreaTica 3D".

## 1. Stack Tecnológico Requerido
* **Frontend:** HTML5, CSS (usando Tailwind CSS vía CDN para un diseño mobile-first y moderno), y JavaScript puro (Vanilla JS). No utilices frameworks como React, Angular o Vue.
* **Backend & Base de Datos:** Firebase (versión web modular 9+).
* **Autenticación:** Firebase Authentication exclusivamente con Google Sign-In.
* **Gráficos:** Chart.js (vía CDN).
* **Arquitectura:** Patrón modular para el JavaScript (ej. separar la configuración de Firebase, la lógica de autenticación y la lógica de la interfaz/CRUD).

## 2. Requisitos Funcionales y de Interfaz
* **Autenticación:** * La aplicación debe iniciar con una pantalla de Login limpia (solo el botón de "Ingresar con Google").
    * Protección de rutas: El dashboard solo debe ser visible si hay un usuario autenticado. Incluye spinners o estados de carga durante la verificación de la sesión.
* **Módulo de Resumen Ejecutivo y Compras (KPIs):**
    * Muestra tarjetas (cards) superiores con métricas clave: Margen Operativo, Gasto vs Presupuesto, y Nivel de Servicio (OTIF).
    * Integra Chart.js para mostrar al menos dos gráficos: "Distribución de Gasto por Categoría" y "Nivel de Inventario Actual".
* **Módulo de Inventario (CRUD en Firestore):**
    * Debe permitir Crear, Leer, Actualizar y Eliminar (CRUD) artículos del inventario.
    * **Estructura de Datos Específica:** Los campos deben estar adaptados a la impresión 3D: Nombre del Artículo, Categoría (Filamento PLA, Filamento PETG, Resina, Repuestos, Equipos), Cantidad, Costo Unitario, Proveedor y Nivel Mínimo de Alerta.
    * **Seguridad:** Todo documento guardado en Firestore debe incluir el `uid` del usuario autenticado. La vista del inventario solo debe cargar los documentos que coincidan con el `uid` del usuario actual (privacidad total de los datos).
* **Funcionalidad Extra:** Incluye un botón programado en Vanilla JS que permita exportar la tabla de inventario actual a un archivo `.csv`.

## 3. Entregables Esperados
Por favor, genera la respuesta estructurada de la siguiente manera:

1.  **Estructura de Archivos:** Una lista breve de cómo debo organizar los archivos en mi carpeta local.
2.  **Código Fuente:** Los bloques de código completos y separados listos para copiar y pegar (`index.html`, `firebase-config.js`, `auth.js`, `app.js`, etc.).
3.  **Reglas de Seguridad de Firestore:** El código exacto para las reglas de Firestore que garantice que un usuario solo pueda leer, escribir y modificar los documentos donde el `userId` coincida con su `request.auth.uid`.
4.  **Guía de Configuración y Despliegue:** Instrucciones paso a paso, claras y para principiantes, sobre:
    * Cómo crear el proyecto en la Consola de Firebase y habilitar Auth (Google) y Firestore.
    * Dónde encontrar y pegar las credenciales en el código generado.
    * Cómo desplegar este proyecto de forma 100% gratuita usando Vercel, Netlify o GitHub Pages.