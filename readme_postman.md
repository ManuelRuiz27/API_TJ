# Guia de pruebas API con Postman

Esta guia explica como validar los endpoints principales del Backend TJ desde Postman. El script `scripts/seed.js` crea datos de demostracion consistentes para autenticacion, catalogo de beneficios, tarjetahabientes y solicitudes de registro; los ejemplos de este documento usan exactamente esos valores.

## Variables de entorno recomendadas en Postman

| Variable | Valor inicial | Descripcion |
|----------|---------------|-------------|
| `{{baseUrl}}` | `http://localhost:8080/api/v1` | URL base expuesta por el backend (ajusta el puerto si tu servidor usa otro). |
| `{{token}}` | *(vacio)* | Se llena automaticamente despues del login u OTP para reutilizar el Bearer Token. |
| `{{otpCurp}}` | `HERL020101MBCNRZ01` | CURP del usuario al que se enviara el OTP en las pruebas rapidas. |
| `{{otpCode}}` | *(vacio)* | Variable temporal para almacenar el codigo OTP que devuelve el endpoint `/auth/otp/send`. |

## Datos de prueba precargados

### Usuarios con credenciales listas

| Alias | Usuario (email) | Login alternativo (CURP) | Password | Municipio | Telefono |
|-------|-----------------|--------------------------|----------|-----------|----------|
| Ana | `ana.hernandez@example.com` | `HERL020101MBCNRZ01` | `Test1234!` | Tijuana | 6641234567 |
| Carlos | `carlos.lopez@example.com` | `LOMC990505HBCLPM02` | `Secret456!` | Mexicali | 6869876543 |
| Maria | `maria.soto@example.com` | `SOAM010910MBCSGR03` | `Password789!` | Ensenada | 6465551122 |

### Tarjetahabientes cargados

| CURP | Nombre | Municipio | Estado | Notas |
|------|--------|-----------|--------|-------|
| `HERL020101MBCNRZ01` | Ana Hernandez Ruiz | Tijuana | active | Ya tiene cuenta asociada (ideal para pruebas de login y OTP). |
| `LOMC990505HBCLPM02` | Carlos Lopez Mendez | Mexicali | active | Cuenta vinculada; usar para login tradicional. |
| `MELR000202MBCSRD06` | Melissa Rios Delgado | Tecate | active | **Sin cuenta**. Usar para el flujo lookup + creacion de cuenta. |
| `SAQP950101HBCQRP07` | Santiago Quintero Perez | Tijuana | inactive | Produce error 404 en lookup (tarjeta inactiva). |

### Beneficios disponibles

| Nombre | Categoria | Municipio | Descuento |
|--------|-----------|-----------|-----------|
| Cafe Frontera | Restaurantes | Tijuana | 20% en consumo presentando la tarjeta. |
| Gimnasio Vitalia | Salud | Mexicali | Inscripcion gratis + 15% mensualidad. |
| Cine Pacifico | Entretenimiento | Ensenada | 2x1 en taquilla martes y jueves. |
| Coding Lab BC | Tecnologia | Tijuana | Beca del 30% en cursos intensivos. |

### Solicitudes de registro ya existentes

| CURP | Nombre | Municipio | Estado de solicitud |
|------|--------|-----------|---------------------|
| `SAQF030415MBCSLQ04` | Fernanda Salas Quiroz | Tijuana | pending |
| `CATL021102HBCCMT05` | Luis Camacho Torres | Mexicali | approved |

> **Tip:** evita reutilizar los CURP anteriores al probar `/register/register` para no recibir `409 Conflict`. Genera un nuevo CURP (o cambia uno por un sufijo diferente) cuando necesites crear otra solicitud.

---

## 1. Autenticacion con usuario y password

### 1.1 POST `{{baseUrl}}/auth/login`

Obtiene un `accessToken` (15 minutos por defecto) y un `refreshToken` por 7 dias. El backend acepta email o CURP en el campo `username`.

**Headers**

- `Content-Type: application/json`

**Body (raw / JSON)**

```json
{
  "username": "ana.hernandez@example.com",
  "password": "Test1234!"
}
```

Tambien puedes usar `LOMC990505HBCLPM02` con `Secret456!` para probar otro caso.

**Tests recomendados en Postman**

```javascript
pm.test("Login 200", () => pm.response.to.have.status(200));
const data = pm.response.json();
pm.environment.set("token", data.accessToken);
```

**Respuesta 200 (ejemplo)**

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "8b6427f65679c3b2a7f1..."
}
```

### 1.2 POST `{{baseUrl}}/auth/logout`

Elimina los refresh tokens asociados al usuario autenticado.

- Authorization: Bearer `{{token}}`
- Respuesta exitosa: `204 No Content`.

---

## 2. Autenticacion con OTP

Usalo para flujos sin password (el OTP se devuelve en la respuesta para facilitar pruebas locales).

### 2.1 POST `{{baseUrl}}/auth/otp/send`

**Body**

```json
{
  "curp": "{{otpCurp}}"
}
```

Con `{{otpCurp}} = HERL020101MBCNRZ01` la respuesta incluye:

```json
{
  "message": "OTP generado",
  "otp": "123456"
}
```

Guarda el codigo con un script:

```javascript
const data = pm.response.json();
pm.environment.set("otpCode", data.otp);
```

### 2.2 POST `{{baseUrl}}/auth/otp/verify`

**Body**

```json
{
  "curp": "{{otpCurp}}",
  "otp": "{{otpCode}}"
}
```

Respuesta 200:

```json
{
  "accessToken": "<jwt>",
  "refreshToken": "<refresh>"
}
```

Agrega un test igual al de login para llenar `{{token}}`.

---

## 3. Perfil del usuario autenticado

### GET `{{baseUrl}}/user/me`

- Authorization: Bearer `{{token}}`
- Respuesta si usaste a Ana:

```json
{
  "id": 1,
  "nombre": "Ana",
  "apellidos": "Hernandez Ruiz",
  "curp": "HERL020101MBCNRZ01",
  "email": "ana.hernandez@example.com",
  "municipio": "Tijuana",
  "telefono": "6641234567"
}
```

---

## 4. Catalogo de beneficios

### GET `{{baseUrl}}/catalog/catalog`

Parametros utililes:

| Parametro | Significado | Ejemplo |
|-----------|-------------|---------|
| `municipio` | Filtra por municipio. | `municipio=Tijuana` |
| `categoria` | Filtra por categoria. | `categoria=Salud` |
| `q` | Busca en nombre o descripcion. | `q=coding` |
| `page`, `pageSize` | Paginacion. | `page=1&pageSize=10` |

**Casos sugeridos**

1. `GET ...?municipio=Tijuana` debe devolver `Cafe Frontera` y `Coding Lab BC`.
2. `GET ...?categoria=Salud` regresa `Gimnasio Vitalia`.
3. `GET ...?q=cine` encuentra `Cine Pacifico`.

**Respuesta tipo**

```json
{
  "items": [
    {
      "id": 1,
      "nombre": "Cafe Frontera",
      "categoria": "Restaurantes",
      "municipio": "Tijuana",
      "descuento": "20% en consumo presentando la tarjeta",
      "direccion": "Av. Revolucion 123, Zona Centro",
      "horario": "L-D 08:00 - 22:00",
      "descripcion": "Coffee shop local con descuentos especiales para estudiantes.",
      "lat": "32.52151",
      "lng": "-117.02454"
    }
  ],
  "total": 1,
  "page": 1,
  "pageSize": 20,
  "totalPages": 1
}
```

---

## 5. Tarjetahabiente: lookup y creacion de cuenta

### 5.1 Lookup POST `{{baseUrl}}/cardholders/lookup`

**Body**

```json
{
  "curp": "MELR000202MBCSRD06"
}
```

**Respuesta 200**

```json
{
  "curp": "MELR000202MBCSRD06",
  "nombres": "Melissa",
  "apellidos": "Rios Delgado",
  "municipio": "Tecate",
  "hasAccount": false
}
```

**Escenarios extra**

- `HERL020101MBCNRZ01` devuelve `409` porque ya tiene cuenta.
- `SAQP950101HBCQRP07` devuelve `404` (tarjeta inactiva).

El lookup habilita durante 15 minutos la creacion de cuenta (`pending_account_until`).

### 5.2 Crear cuenta POST `{{baseUrl}}/cardholders/MELR000202MBCSRD06/account`

Realiza este paso inmediatamente despues del lookup exitoso.

```json
{
  "username": "melissa.rios@example.com",
  "password": "NewPassword123!",
  "confirmPassword": "NewPassword123!"
}
```

Respuesta 201:

```json
{ "message": "Cuenta creada. Ya puedes iniciar sesion." }
```

Si repites la peticion recibiras `409` porque la CURP ya quedo vinculada.

---

## 6. Solicitud de registro (personas sin tarjeta)

### POST `{{baseUrl}}/register/register`

El frontend envia **multipart/form-data**. Usa form-data en Postman; marca los tres documentos como `File`. Todos los campos de texto se envian como cadenas.

| Key | Value de ejemplo | Tipo | Validación |
|-----|------------------|------|-----------|
| `nombres` | `Julieta` | Text | >= 2 caracteres |
| `apellidos` | `Morales Cano` | Text | >= 2 caracteres |
| `fechaNacimiento` | `21/05/2005` | Text | Formato `DD/MM/AAAA` válido |
| `curp` | `MOCJ050521BCNNNN10` | Text | CURP oficial (se valida regex) |
| `calle` | `Av. Revolucion` | Text | >= 2 caracteres |
| `numero` | `321B` | Text | `S/N` o 1-5 digitos + sufijo alfanumerico (<=4) |
| `cp` | `22000` | Text | 5 digitos |
| `colonia` | `Zona Centro` | Text | No vacio |
| `username` | `julieta.morales@example.com` | Text | Email válido, se guarda en minúsculas |
| `password` | `SecurePass2025!` | Text | >=8 caracteres con mayúscula, minúscula y número |
| `aceptaTerminos` | `true` | Text | Debe ser `true/1/si` |
| `ine` | `ine_demo.png` | File | JPG/PNG/PDF, < 2 MB |
| `comprobante` | `comprobante_demo.pdf` | File | JPG/PNG/PDF, < 2 MB |
| `curpDoc` | `curp_demo.pdf` | File | JPG/PNG/PDF, < 2 MB |

**Respuesta 201**

```json
{
  "message": "Solicitud recibida",
  "folio": "TJ-000123"
}
```

Errores comunes:

- `409` si el CURP ya existe en `usuarios`, en `cardholders` o si hay una solicitud pendiente/aprobada con el mismo CURP o username.
- `422` si algún campo no cumple los requisitos (fecha inválida, password débil, CP incorrecto, archivos sin los formatos/size permitidos, etc.).
- `400` si faltan campos obligatorios antes de validar el detalle.

---

### Paso final

Guarda esta guia junto con tu coleccion de Postman para recordar que los datos de ejemplo provienen del seeder y pueden regenerarse ejecutando `node scripts/seed.js`.

