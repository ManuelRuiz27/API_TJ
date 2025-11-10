const multer = require('multer');
const bcrypt = require('bcrypt');
const fs = require('fs/promises');
const db = require('../config/db');

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2 MB
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'application/pdf']);
const CURP_REGEX = /^[A-Z]{4}\d{6}[HM][A-Z]{5}[0-9A-Z]{2}$/;
const NUMERO_REGEX = /^(\d{1,5}[A-Za-z0-9]{0,4}|S\/?N)$/i;
const CP_REGEX = /^\d{5}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
const SALT_ROUNDS = 10;

// Configuracion de multer para manejar multiples archivos y validar el tipo
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + file.originalname;
    cb(null, uniqueSuffix);
  }
});

exports.upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      const error = new Error('Solo se permiten archivos JPG, PNG o PDF.');
      error.code = 'UNSUPPORTED_FILE';
      cb(error);
    }
  }
});

function normalizeEmail(value = '') {
  return value.trim().toLowerCase();
}

function parseBoolean(value) {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return ['true', '1', 'si', 'on', 'yes'].includes(normalized);
  }
  if (typeof value === 'number') {
    return value === 1;
  }
  return false;
}

function parseFechaNacimiento(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const match = value.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) {
    return null;
  }
  const [, dd, mm, yyyy] = match;
  const day = Number(dd);
  const month = Number(mm);
  const year = Number(yyyy);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return `${yyyy}-${mm}-${dd}`;
}

async function cleanupUploadedFiles(files = {}) {
  const pending = [];
  for (const field of Object.values(files)) {
    if (!Array.isArray(field)) continue;
    for (const file of field) {
      if (file?.path) {
        pending.push(fs.unlink(file.path).catch(() => {}));
      }
    }
  }
  if (pending.length) {
    await Promise.all(pending);
  }
}

function formatFolio(id) {
  return `TJ-${String(id).padStart(6, '0')}`;
}

async function rejectRequest(res, status, message, files) {
  await cleanupUploadedFiles(files);
  return res.status(status).json({ message });
}

exports.register = async (req, res) => {
  const body = req.body || {};
  const nombres = (body.nombres || '').trim();
  const apellidos = (body.apellidos || '').trim();
  const fechaNacimiento = body.fechaNacimiento;
  const rawCurp = (body.curp || '').trim().toUpperCase();
  const calle = (body.calle || '').trim();
  const numeroRaw = (body.numero || '').trim();
  const cp = (body.cp || '').trim();
  const colonia = (body.colonia || '').trim();
  const username = normalizeEmail(body.username || '');
  const password = body.password || '';
  const aceptaTerminos = parseBoolean(body.aceptaTerminos);

  if (
    !nombres ||
    !apellidos ||
    !fechaNacimiento ||
    !rawCurp ||
    !calle ||
    !numeroRaw ||
    !cp ||
    !colonia ||
    !username ||
    !password
  ) {
    return rejectRequest(res, 400, 'Faltan campos obligatorios', req.files);
  }
  if (nombres.length < 2 || apellidos.length < 2) {
    return rejectRequest(res, 422, 'Nombre y apellidos deben tener al menos 2 caracteres', req.files);
  }
  if (!CURP_REGEX.test(rawCurp)) {
    return rejectRequest(res, 422, 'El CURP tiene un formato invalido', req.files);
  }
  const fechaISO = parseFechaNacimiento(fechaNacimiento);
  if (!fechaISO) {
    return rejectRequest(res, 422, 'fechaNacimiento debe tener formato DD/MM/AAAA valido', req.files);
  }
  if (calle.length < 2) {
    return rejectRequest(res, 422, 'La calle debe tener al menos 2 caracteres', req.files);
  }
  if (!NUMERO_REGEX.test(numeroRaw)) {
    return rejectRequest(
      res,
      422,
      'El numero debe ser S/N o de 1 a 5 digitos con sufijo alfanumerico',
      req.files
    );
  }
  const numero =
    numeroRaw.toUpperCase() === 'S/N' || numeroRaw.toLowerCase() === 's/n'
      ? 'S/N'
      : numeroRaw;
  if (!CP_REGEX.test(cp)) {
    return rejectRequest(res, 422, 'El codigo postal debe tener 5 digitos', req.files);
  }
  if (!colonia) {
    return rejectRequest(res, 422, 'La colonia es obligatoria', req.files);
  }
  if (!EMAIL_REGEX.test(username)) {
    return rejectRequest(res, 422, 'El username debe ser un correo electronico valido', req.files);
  }
  if (!PASSWORD_REGEX.test(password)) {
    return rejectRequest(
      res,
      422,
      'La contrasena debe tener al menos 8 caracteres e incluir mayuscula, minuscula y numero',
      req.files
    );
  }
  if (!aceptaTerminos) {
    return rejectRequest(res, 422, 'Debes aceptar los terminos y condiciones', req.files);
  }

  const ineFile = req.files?.ine?.[0];
  const comprobanteFile = req.files?.comprobante?.[0];
  const curpDocFile = req.files?.curpDoc?.[0];

  if (!ineFile || !comprobanteFile || !curpDocFile) {
    return rejectRequest(res, 422, 'Debes adjuntar INE, comprobante y CURP digital', req.files);
  }

  try {
    const [existingUser] = await db.execute(
      'SELECT id FROM usuarios WHERE curp = ? OR email = ? LIMIT 1',
      [rawCurp, username]
    );
    if (existingUser.length > 0) {
      return rejectRequest(res, 409, 'Ya existe un usuario con ese CURP o correo', req.files);
    }

    const [existingCardholder] = await db.execute(
      'SELECT id FROM cardholders WHERE curp = ? LIMIT 1',
      [rawCurp]
    );
    if (existingCardholder.length > 0) {
      return rejectRequest(res, 409, 'La CURP ya cuenta con una tarjeta activa', req.files);
    }

    const [existingRequestByCurp] = await db.execute(
      "SELECT id FROM solicitudes_registro WHERE curp = ? AND status IN ('pending','approved') LIMIT 1",
      [rawCurp]
    );
    if (existingRequestByCurp.length > 0) {
      return rejectRequest(res, 409, 'Ya existe una solicitud activa para este CURP', req.files);
    }

    const [existingRequestByUsername] = await db.execute(
      "SELECT id FROM solicitudes_registro WHERE username = ? AND status IN ('pending','approved') LIMIT 1",
      [username]
    );
    if (existingRequestByUsername.length > 0) {
      return rejectRequest(res, 409, 'El username solicitado ya esta en uso', req.files);
    }

    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    const [result] = await db.execute(
      `INSERT INTO solicitudes_registro
        (nombres, apellidos, fecha_nacimiento, curp, username, calle, numero, cp, colonia, password_hash, municipio_id, status, acepta_terminos, doc_ine, doc_comprobante, doc_curp)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'pending', ?, ?, ?, ?)`,
      [
        nombres,
        apellidos,
        fechaISO,
        rawCurp,
        username,
        calle,
        numero,
        cp,
        colonia,
        hashedPassword,
        aceptaTerminos ? 1 : 0,
        ineFile.filename,
        comprobanteFile.filename,
        curpDocFile.filename
      ]
    );

    const solicitudId = result.insertId;
    const folio = formatFolio(solicitudId);
    await db.execute('UPDATE solicitudes_registro SET folio = ? WHERE id = ?', [folio, solicitudId]);

    return res.status(201).json({ message: 'Solicitud recibida', folio });
  } catch (err) {
    console.error(err);
    await cleanupUploadedFiles(req.files);
    return res.status(500).json({ message: 'Error al registrar solicitud' });
  }
};
