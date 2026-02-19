# Guía: Repo + deploy en Vercel (ORIGO)

Pasos para crear el repositorio de ORIGO y publicarlo en Vercel.

---

## 1. Crear el repositorio en GitHub

1. Entra en [github.com](https://github.com) y inicia sesión.
2. **New repository** (o `+` → New repository).
3. Configuración recomendada:
   - **Name:** `vento-origo` (o el nombre que uses para el repo).
   - **Visibility:** Private o Public, según prefieras.
   - **No** marques "Add a README", "Add .gitignore" ni "Choose a license" (el proyecto ya tiene `.gitignore` y README).
4. Clic en **Create repository**.
5. Anota la URL del repo (ej: `https://github.com/TU_USUARIO/vento-origo.git`).

---

## 2. Subir el código desde tu máquina

Abre una terminal en la carpeta del proyecto **vento-origo** (no en la raíz de Vento OS).

### Si aún no tienes Git inicializado en vento-origo

```powershell
cd "c:\Users\vento\OneDrive\MACBOOK\Escritorio\Vento OS\vento-origo"

git init
git add .
git commit -m "Initial commit: ORIGO placeholder"
```

### Conectar con GitHub y subir

Sustituye `TU_USUARIO` y `vento-origo` por tu usuario y nombre del repo si cambiaste algo.

```powershell
git remote add origin https://github.com/TU_USUARIO/vento-origo.git
git branch -M main
git push -u origin main
```

Si GitHub te pide autenticación:
- **HTTPS:** usa un [Personal Access Token (PAT)](https://github.com/settings/tokens) como contraseña.
- **SSH:** configura una clave SSH y usa la URL `git@github.com:TU_USUARIO/vento-origo.git` en lugar de `https://...`.

---

## 3. Desplegar en Vercel

### 3.1 Importar el proyecto

1. Entra en [vercel.com](https://vercel.com) e inicia sesión (con GitHub si quieres).
2. **Add New…** → **Project**.
3. **Import** el repo `vento-origo` desde la lista (conecta GitHub con Vercel si aún no lo has hecho).
4. En la pantalla de configuración:
   - **Framework Preset:** Next.js (Vercel lo detecta).
   - **Root Directory:** deja vacío (el repo es el propio proyecto).
   - **Build Command:** `npm run build` (por defecto).
   - **Output Directory:** `.next` (por defecto).
   - **Install Command:** `npm install`.

### 3.2 Variables de entorno (cuando las uses)

Cuando añadas Supabase u otro backend:

1. En el proyecto de Vercel: **Settings** → **Environment Variables**.
2. Añade las mismas que en local, por ejemplo:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. Asígnelas a **Production** (y opcionalmente Preview).

No subas nunca `.env` al repo; ya está en `.gitignore`.

### 3.3 Deploy

1. Clic en **Deploy**.
2. Vercel hará `npm install` y `npm run build`; si todo va bien, tendrás una URL tipo `vento-origo-xxx.vercel.app`.

---

## 4. Despliegues automáticos

- Cada **push a `main`** genera un deploy en **Production**.
- Cada **pull request** genera un **Preview** con su propia URL.

---

## 5. Resumen de comandos (copiar/pegar)

Ajusta la ruta y la URL del repo antes de ejecutar.

```powershell
cd "c:\Users\vento\OneDrive\MACBOOK\Escritorio\Vento OS\vento-origo"

git init
git add .
git commit -m "Initial commit: ORIGO placeholder"

git remote add origin https://github.com/TU_USUARIO/vento-origo.git
git branch -M main
git push -u origin main
```

Luego en Vercel: **Add New → Project** → importar `vento-origo` → **Deploy**.

---

## 6. Notas

- **Puerto:** En local usas `npm run dev --port 3001`. En Vercel no hace falta configurar puerto; Vercel usa el que corresponda.
- **Monorepo:** Si en el futuro ORIGO vive dentro de un monorepo (ej. raíz Vento OS con varias apps), en Vercel deberías indicar **Root Directory** como `vento-origo` y el **Build Command** seguirá siendo `npm run build` dentro de esa carpeta (o `npm run build --prefix vento-origo` según cómo definas los scripts en la raíz).
- **Dominio propio:** En **Settings → Domains** del proyecto en Vercel puedes añadir un dominio (ej. `origo.tudominio.com`).
