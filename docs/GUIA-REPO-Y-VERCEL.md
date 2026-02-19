# Guía: Repo y despliegue en Vercel (ORIGO)

Pasos para crear el repositorio de ORIGO y publicarlo en Vercel.

---

## 1. Crear el repositorio en GitHub

1. Entra en [GitHub](https://github.com) y crea un **nuevo repositorio**.
2. Nombre sugerido: `vento-origo` (o el que uses en tu org).
3. **No** inicialices con README, .gitignore ni licencia si ya tienes el proyecto local.
4. Anota la URL del repo (ej: `https://github.com/tu-usuario/vento-origo.git`).

---

## 2. Inicializar Git y subir el código (si aún no está en Git)

Desde la raíz del proyecto **vento-origo**:

```powershell
cd "c:\Users\vento\OneDrive\MACBOOK\Escritorio\Vento OS\vento-origo"

# Si todavía no hay repo local
git init
git add .
git commit -m "Initial commit: ORIGO placeholder app"

# Añadir remoto (cambia la URL por la de tu repo)
git remote add origin https://github.com/TU-USUARIO/vento-origo.git

# Rama principal (ajusta si usas main por defecto)
git branch -M main
git push -u origin main
```

Si el proyecto ya está en un repo pero con otro remoto, solo actualiza el `origin` y haz push:

```powershell
git remote set-url origin https://github.com/TU-USUARIO/vento-origo.git
git push -u origin main
```

---

## 3. Desplegar en Vercel

### 3.1 Conectar el repositorio

1. Entra en [Vercel](https://vercel.com) e inicia sesión (con GitHub si lo usas).
2. **Add New…** → **Project**.
3. **Import** el repo `vento-origo` desde GitHub (si no aparece, configura el acceso de Vercel a tu cuenta/org en GitHub).
4. Vercel detectará que es un proyecto **Next.js** y propondrá la configuración por defecto.

### 3.2 Configuración del proyecto

| Campo | Valor recomendado |
|-------|--------------------|
| **Framework Preset** | Next.js |
| **Root Directory** | `./` (dejar por defecto si el código está en la raíz del repo) |
| **Build Command** | `npm run build` (por defecto) |
| **Output Directory** | Por defecto (Next.js usa `.next`) |
| **Install Command** | `npm install` |

No hace falta configurar **port**: Vercel ignora el puerto de desarrollo (3001) y sirve la app en su propia URL.

### 3.3 Variables de entorno

Por ahora ORIGO no usa base de datos ni auth real, así que **no es obligatorio** añadir variables. Cuando conectes Supabase u otro servicio:

- **Settings** del proyecto → **Environment Variables**.
- Añade por ejemplo: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (y las que necesites para el servidor).
- Asigna a **Production**, **Preview** y/o **Development** según corresponda.

### 3.4 Desplegar

1. Pulsa **Deploy**.
2. Espera a que termine el build. Si hay errores, revisa el log en Vercel (normalmente por dependencias o Node version).
3. Vercel te dará una URL tipo `vento-origo-xxx.vercel.app`. Puedes configurar un dominio propio después en **Settings → Domains**.

---

## 4. Actualizaciones posteriores

Cada `git push` a la rama conectada (p. ej. `main`) dispara un nuevo despliegue en Vercel. Para ramas distintas puedes usar **Preview Deployments** (una URL por rama/PR).

```powershell
git add .
git commit -m "Descripción del cambio"
git push origin main
```

---

## 5. Comprobaciones rápidas

- **Build local:** `npm run build` en vento-origo debe terminar sin errores antes de confiar en Vercel.
- **Node:** El proyecto usa Node 18+; en Vercel se puede fijar en **Settings → General → Node.js Version** si hace falta.
- Si el repo está dentro de un monorepo (por ejemplo todo "Vento OS" en un solo repo), en **Root Directory** de Vercel debes poner la ruta a la carpeta de la app, p. ej. `vento-origo`.

---

## Resumen mínimo

1. Crear repo en GitHub (sin inicializar con extra).
2. En la carpeta del proyecto: `git init` (si aplica), `git add .`, `git commit`, `git remote add origin <url>`, `git push -u origin main`.
3. En Vercel: Import proyecto desde GitHub → revisar build/root → Deploy.
4. A partir de ahí, cada push a `main` redepliega automáticamente.
