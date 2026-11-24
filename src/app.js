import path from 'node:path';
import { fileURLToPath } from 'node:url';

import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';

import pool from './config/mysql.js';
import indexRouter from './routes/index.js';
import membershipRouter from './routes/membership.js';
import b2bRouter from './routes/b2b.js';

const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

app.disable('x-powered-by');

if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 'loopback');
}

app.set('view engine', 'ejs');
app.set('views', path.join(projectRoot, 'views'));

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          'https://cdn.jsdelivr.net',
          'https://cdnjs.cloudflare.com',
          'https://challenges.cloudflare.com',
          'https://esm.sh',
        ],
        scriptSrcAttr: ["'none'"],
        styleSrc: [
          "'self'",
          'https://cdnjs.cloudflare.com',
          'https://fonts.googleapis.com',
        ],
        fontSrc: [
          "'self'",
          'https://cdnjs.cloudflare.com',
          'https://fonts.gstatic.com',
          'data:',
        ],
        imgSrc: [
          "'self'",
          'data:',
          'https://res.cloudinary.com',
        ],
        connectSrc: [
          "'self'",
          'https://challenges.cloudflare.com',
          'https://esm.sh',
          'https://res.cloudinary.com',
        ],
        frameSrc: [
          "'self'",
          'https://challenges.cloudflare.com',
        ],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        objectSrc: ["'none'"],
      },
    },
  }),
);

app.use(
  express.json({
    limit: '50kb',
  }),
);

app.use(
  express.urlencoded({
    extended: false,
    limit: '50kb',
  }),
);

app.use(
  "/vendor/lottie",
  express.static(
    path.join(
      projectRoot,
      "node_modules",
      "lottie-web",
      "build",
      "player",
    ),
  ),
);

app.use(
  '/vendor/izitoast',
  express.static(path.join(projectRoot, 'node_modules/izitoast/dist'), {
    maxAge: process.env.NODE_ENV === 'production' ? '1d' : 0,
  }),
);

app.use(
  express.static(path.join(projectRoot, 'public'), {
    maxAge: process.env.NODE_ENV === 'production' ? '1d' : 0,
  })
);

app.get('/healthz', (req, res) => {
  return res.status(200).send('ok');
});

app.use('/', indexRouter);
app.use('/membership', membershipRouter);
app.use('/b2b', b2bRouter);

app.use((req, res) => {
  return res.status(404).send('Halaman tidak ditemukan.');
});

// Pesan untuk request yang ditolak middleware (body-parser dll.). Pesan asli error tidak diteruskan
// karena bisa memuat potongan isi request (mis. pesan JSON.parse).
const clientErrorMessages = {
  400: 'Data yang dikirim tidak valid.',
  413: 'Data yang dikirim terlalu besar.',
  415: 'Format data tidak didukung.',
};

app.use((error, req, res, next) => {
  if (res.headersSent) {
    console.error(error);

    return next(error);
  }

  // Error 4xx (body rusak, terlalu besar, encoding tidak didukung) membawa status sendiri; selain itu = kesalahan server.
  const errorStatus = Number(error?.status ?? error?.statusCode);
  const isClientError = Number.isInteger(errorStatus) && errorStatus >= 400 && errorStatus < 500;
  const status = isClientError ? errorStatus : 500;

  if (isClientError) {
    // Cukup satu baris: request sampah/serangan tidak perlu stack trace di log PM2.
    console.warn(`${status} ${req.method} ${req.originalUrl}: ${error.type ?? error.code ?? error.message}`);
  } else {
    console.error(error);
  }

  let message;

  if (isClientError) {
    message = clientErrorMessages[status] ?? 'Permintaan tidak dapat diproses.';
  } else {
    message = process.env.NODE_ENV === 'production' ? 'Terjadi kesalahan pada server.' : error.stack;
  }

  // Form membership & B2B mengirim JSON lewat fetch dan membaca { message }.
  if (req.is('application/json') || req.accepts(['html', 'json']) === 'json') {
    return res.status(status).json({ message });
  }

  return res.status(status).send(message);
});

const host = process.env.HOST ?? '127.0.0.1';
const port = Number(process.env.PORT ?? 3000);

async function startServer() {
  try {
    await pool.query('SELECT 1');

    app.listen(port, host, () => {
      console.log(`Server berjalan di http://${host}:${port}`);
    });
  } catch (error) {
    console.error('Gagal terhubung ke database:', error);
    process.exit(1);
  }
}

startServer();
