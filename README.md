# Quinci 2

Quinci es una PWA local para administrar ingresos, gastos, ahorro, metas y deudas por quincena. No requiere cuentas ni envía información financiera a un servidor.

## Desarrollo

Requisitos: Node.js 24 o compatible.

```bash
npm install
npm run dev
```

Comprobación completa:

```bash
npm run check
```

Generar la versión estática y copiarla a la raíz:

```bash
npm run publish:root
```

## Estructura

- `source/src/`: código TypeScript y React legible.
- `tests/`: pruebas de cálculos financieros críticos.
- `public/`: iconos locales incluidos en el modo offline.
- `dist/`: compilación de producción.
- `.github/workflows/pages.yml`: publicación automática en GitHub Pages.

## Datos y respaldos

Los datos permanecen en el almacenamiento local del navegador. La aplicación migra automáticamente la estructura de la versión anterior cuando la encuentra.

- **Respaldo completo JSON:** contiene todos los años, movimientos, metas, deudas, categorías y ajustes; es restaurable.
- **Reporte CSV:** contiene los movimientos del año activo y no se considera un respaldo.
- Los respaldos llevan `schemaVersion` y se validan completamente antes de reemplazar datos.

## Privacidad

El PIN es un bloqueo contra miradas casuales. Se deriva con PBKDF2 y nunca se guarda como texto, pero no sustituye el cifrado y bloqueo del dispositivo. Si se olvida, no puede quitarse para revelar datos: se debe restablecer la información local e importar un respaldo.
