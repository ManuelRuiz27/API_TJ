# Backend API - Tarjeta Joven

Esqueleto inicial de la API de Tarjeta Joven construido con Node.js, Express y MySQL. Incluye rutas para autenticacion, registro y consulta de catalogos.

## Requisitos previos

- Node.js 22.x y npm 10.x (solo si correras el proyecto fuera de Docker).
- Docker Desktop (o Docker Engine + Docker Compose v2).
- Acceso a una instancia de MySQL 8 si decides no usar el contenedor `db` incluido.

## Estructura principal

- `src/index.js`: arranca Express, configura CORS y monta las rutas.
- `src/config/db.js`: pool de conexiones MySQL usando `mysql2/promise`.
- `src/routes/` y `src/controllers/`: modulos por dominio (`auth`, `user`, `catalog`, `register`).
- `uploads/`: almacenamiento temporal para archivos subidos (mapeado como volumen en Docker).
- `tests/`: pruebas con Jest + Supertest.

## Configuracion de variables de entorno

1. Copia el archivo de ejemplo: `cp .env.example .env`.
2. Ajusta los valores:
   - Con Docker usa `DB_HOST=db`, `DB_USER=usuario`, `DB_PASSWORD=password` y `DB_NAME=tarjeta_joven` (coinciden con `docker-compose.yml`).
   - Para ejecucion local apunta `DB_HOST` y el resto de credenciales a tu propia base.
3. Define `JWT_SECRET` y `JWT_EXPIRATION` conforme a tus politicas de seguridad.

## Ejecucion local (sin Docker)

```bash
npm install
npm run dev
```

Necesitas un servidor MySQL accesible y las variables del `.env` apuntando a dicha instancia.

## Ejecucion con Docker

1. Verifica que `.env` ya exista en la raiz del proyecto.
2. Levanta los servicios:

   ```bash
   docker compose up -d --build
   ```

3. Revisa el estado: `docker compose ps` (deberias ver `backend_tj-db-1` y `backend_tj-api-1`).
4. Sigue los logs de la API cuando lo necesites: `docker compose logs -f api`.
5. Para apagar el stack: `docker compose down` (agrega `-v` si quieres borrar el volumen `db_data`).

## Seeders y datos de ejemplo

Ejecuta el script de seeders para crear el esquema minimo y poblar la base con municipios, categorias, beneficios, usuarios y solicitudes de registro de prueba:

```bash
npm run seed
# o si ya tienes el stack de Docker corriendo:
docker compose exec api node scripts/seed.js
```

El script es idempotente y toma las credenciales desde las mismas variables de entorno de la app, por lo que tambien funciona con la base remota configurada en `DB_URI`. Una vez ejecutado, puedes iniciar sesion con:

- Usuario: `ana.hernandez@example.com`
- Password: `Test1234!`
- Cardholder sin cuenta asociada para pruebas del nuevo flujo: CURP `MELR000202MBCSRD06`.

## Vinculacion de tarjeta fisica

El flujo **"Ya tengo tarjeta fisica"** queda expuesto bajo `/api/v1/cardholders`:

1. `POST /api/v1/cardholders/lookup`
   - Body: `{ "curp": "ABCD001122HDFRRN07" }`.
   - Respuesta `200`: datos basicos (`curp`, `nombres`, `apellidos`, `municipio`, `hasAccount`).
   - Errores: `422` formato CURP, `404` cuando no exista/este inactiva, `409` si ya tiene cuenta, `429` al exceder intentos (5 cada 15 minutos; se bloquea por otros 15).
   - Si es exitoso, abre una ventana de 15 minutos (`pending_account_until`) para crear la cuenta.

2. `POST /api/v1/cardholders/{curp}/account`
   - Body:
     ```json
     {
       "username": "usuario.tj",
       "password": "TuPassword123",
       "confirmPassword": "TuPassword123"
     }
     ```
   - Validaciones: nombre de usuario 4-50 caracteres alfanumericos (`.` `_` `-` permitidos), contraseña >= 8 con letras y numeros y confirmacion identica.
   - Errores: `404` si la tarjeta no paso lookup vigente, `409` si ya existe cuenta, `422` por formato, `500` en errores internos.
   - Respuesta `201`: `{"message":"Cuenta creada. Ya puedes iniciar sesion."}`.

Cada llamada queda registrada en `cardholder_audit_logs` (CURP, IP, timestamp) y el “lookup” vuelve a ser necesario si la ventana expira. Para pruebas manuales puedes usar el cardholder `MELR000202MBCSRD06` (activo sin cuenta) o verificar la respuesta `409` usando `HERL020101MBCNRZ01` (ya vinculado).

## Probar el API con Postman

1. **Crear entorno**: en Postman abre *Environments* y agrega uno nuevo con la variable `baseUrl = http://localhost:8080/api/v1`.
2. **Catalogo**:
   - Metodo: `GET`
   - URL: `{{baseUrl}}/catalog`
   - Respuesta esperada: lista paginada (si la base esta vacia devolvera items vacios).
3. **Login** (requiere un registro previo en la tabla `usuarios`):
   - Metodo: `POST`
   - URL: `{{baseUrl}}/auth/login`
   - Body (JSON):
     ```json
     {
       "username": "correo@ejemplo.com",
       "password": "TuPassword"
     }
     ```
   - Guarda el `accessToken` de la respuesta en una variable Postman llamada `accessToken`.
4. **Perfil del usuario**:
   - Metodo: `GET`
   - URL: `{{baseUrl}}/me`
   - Header: `Authorization: Bearer {{accessToken}}`.
5. **Registro con archivos**:
   - Metodo: `POST`
   - URL: `{{baseUrl}}/register`
   - Body: `multipart/form-data`.
   - Campos de texto: `nombres`, `apellidos`, `fechaNacimiento`, `curp`, `colonia`, `password`.
   - Campos de archivo: `ine`, `comprobante`, `curpDoc` (usa la opcion *File* en Postman).

> Consejo: guarda las solicitudes dentro de una coleccion y versiona el archivo exportado para mantener el flujo de pruebas compartido con el equipo.

## Scripts utiles

- `npm run dev`: modo desarrollo con recarga automatica (`nodemon`).
- `npm start`: arranque en modo produccion (lo que corre el contenedor `api`).
- `npm test`: ejecuta Jest con la base de datos mockeada.
- `npm run seed`: crea/actualiza las tablas minimas y datos de ejemplo.

## Endpoints principales

Todos los endpoints estan versionados bajo `/api/v1`:

- `POST /auth/login`
- `POST /auth/logout`
- `POST /auth/otp/send`
- `POST /auth/otp/verify`
- `GET /me`
- `GET /catalog`
- `POST /register` (multipart/form-data)

Consulta el documento funcional del frontend para conocer los contratos completos (payloads y codigos de respuesta esperados).

