# Quinci — Mi Libreta Financiera

App personal para administrar tu dinero quincena a quincena: salario, gastos, ganancias extra, ahorro, deudas y metas — con PIN, modo claro/oscuro, gráficas, categorías propias y respaldo en JSON/CSV.

Esta carpeta ya es una **PWA (Progressive Web App)** lista para publicarse: no necesita servidor, base de datos, ni build adicional. Se sube tal cual a GitHub Pages y queda funcionando.

## 📦 Qué hay en esta carpeta

```
quinci-app/
├── index.html          → punto de entrada, carga Tailwind (CDN) y app.js
├── app.js              → toda la app (React + recharts + lucide-react), ya empaquetada
├── manifest.json        → nombre, ícono y colores para que se pueda "instalar"
├── sw.js                → service worker: hace que funcione sin internet
├── .nojekyll             → le dice a GitHub Pages que sirva los archivos tal cual
├── icons/
│   ├── icon-192.png
│   ├── icon-512.png
│   └── icon-maskable-512.png
└── README.md             → este archivo
```

## 🚀 Publicar en GitHub Pages (paso a paso)

1. **Crea un repositorio nuevo** en GitHub (puede ser público o privado; Pages funciona con ambos si tienes cuenta Pro, o público si tienes cuenta gratuita).
   - Nombre sugerido: `quinci`

2. **Sube todo el contenido de esta carpeta** a la raíz del repositorio (no la carpeta en sí, sino lo que hay adentro: `index.html`, `app.js`, `icons/`, etc.).
   - Desde la web de GitHub: botón **"Add file" → "Upload files"**, arrastra todo.
   - O desde terminal, si prefieres Git:
     ```bash
     git init
     git add .
     git commit -m "Primera versión de Quinci"
     git branch -M main
     git remote add origin https://github.com/TU-USUARIO/quinci.git
     git push -u origin main
     ```

3. **Activa GitHub Pages**
   - Ve a tu repositorio → pestaña **Settings**.
   - Menú lateral → **Pages**.
   - En "Build and deployment" → **Source**: elige **"Deploy from a branch"**.
   - **Branch**: `main`, carpeta `/ (root)`.
   - Guarda.

4. **Espera 1–2 minutos.** GitHub te da un link arriba, algo como:
   ```
   https://TU-USUARIO.github.io/quinci/
   ```

5. **Ábrelo desde tu celular** en Chrome (Android) o Safari (iPhone), y usa "Agregar a pantalla de inicio" / "Instalar app". A partir de ahí abre como app de verdad, con ícono propio y sin internet.

## 🔁 Actualizar la app más adelante

Si en el futuro pides cambios y te doy un nuevo `app.js`, solo tienes que:
1. Reemplazar el archivo `app.js` (y `index.html` si también cambió) en el repositorio.
2. GitHub Pages se actualiza solo en un par de minutos, sin repetir la configuración.

## 💾 Dónde viven tus datos

Todo se guarda en el `localStorage` de **tu navegador, en tu dispositivo**. Eso significa:
- Nadie más tiene acceso a tus datos — ni siquiera GitHub, ni Anthropic.
- Si cambias de celular, o borras los datos del navegador, o desinstalas la app, tus datos se pierden **a menos que hayas exportado un respaldo**.
- Usa el botón de exportar (JSON o CSV) dentro de la app de vez en cuando. Hay un aviso dentro de la app que te lo recuerda si pasa más de una semana sin respaldar.

## 🛠️ Si quieres modificar el código tú mismo

`app.js` está minificado (todo en una línea, ilegible a propósito para que pese menos). Si quieres tocar el código directamente:
- El código fuente original en React (legible) es el archivo `finanzas.jsx` que también te compartí por separado en el chat — ese es el que se edita.
- Después de editarlo, hace falta volver a "empaquetarlo" (build) para generar un nuevo `app.js`. Si no tienes ese proceso configurado, simplemente pide los cambios en el chat con Claude y te entrego un `app.js` actualizado listo para reemplazar.

## 📋 Funciones incluidas

- Ingresos y gastos por quincena, con ahorro separado y metas de ahorro
- Categorías predefinidas + categorías propias
- Gastos fijos recurrentes (sugeridos automáticamente)
- Límites de gasto por categoría con aviso visual
- Comparación con el mes anterior y promedio histórico por categoría
- Manejo de deudas (tarjetas, préstamos)
- Historial por año, con edición, restauración y eliminación (con deshacer)
- Exportar/Importar JSON, exportar CSV
- PIN de bloqueo, modo claro/oscuro, moneda configurable
- Funciona sin internet una vez instalada
