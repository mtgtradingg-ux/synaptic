# estudio-web

Web independiente para crear asignaturas y subir apuntes desde el ordenador,
que aparecen en la app "estudio" exactamente igual que si se hubieran creado
desde el móvil. No forma parte del repo de la app ni la modifica: habla
directamente con el mismo proyecto de Supabase.

## Cómo funciona

- Sitio estático (HTML/CSS/JS), sin build ni Node — solo abrir/servir la carpeta.
- Usa la misma cuenta de usuario que la app (Supabase Auth, email/contraseña).
- Crear una asignatura extrae el texto de los PDF/TXT en el propio navegador
  (con `pdf.js`) y hace un `insert` directo a la tabla `subjects`, protegido
  por RLS — igual que hace la app.
- Añadir apuntes a una asignatura ya existente llama al edge function
  `add-subject-content` (función Premium), igual que la app.
- La generación de lecciones (Gemini, cron en background) sigue funcionando
  sola después de crear/ampliar una asignatura; no hay nada más que hacer
  desde aquí.

## Probarlo en local

Los módulos y `fetch` necesitan `http://`, no abrir el `index.html` con
doble clic (`file://`). Desde esta carpeta:

```bash
python3 -m http.server 8000
```

y abre `http://localhost:8000`.

## Desplegarlo

Es una carpeta estática normal — cualquiera de estas opciones sirve, sin
configuración adicional:

- **Netlify**: arrastra la carpeta a [app.netlify.com/drop](https://app.netlify.com/drop),
  o conecta este directorio como repo Git y despliega sin build command.
- **Vercel**: `vercel --prod` desde esta carpeta (o importar el repo, sin
  framework preset).
- **GitHub Pages**: sube esta carpeta a un repo y activa Pages sobre la
  rama/carpeta correspondiente.

No hace falta variable de entorno ni paso de build: las credenciales de
Supabase ya están en `config.js`.

## Seguridad

`config.js` contiene la `anon key` pública del proyecto de Supabase — está
pensada para vivir en el cliente y protegida por las políticas de RLS de
cada tabla (un usuario solo puede leer/crear sus propias asignaturas).
**Nunca** pongas aquí la `service role key`.

## Mantenimiento

`constants.js` replica a mano la paleta de colores, los iconos, los idiomas
y las opciones de duración de plan definidos en la app Flutter
(`lib/models/subject.dart`, `lib/screens/upload/upload_screen.dart`). Si esos
valores cambian en la app, actualízalos aquí también para que las
asignaturas creadas desde la web sigan viéndose igual.
