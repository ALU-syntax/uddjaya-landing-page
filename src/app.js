import path from 'node:path';
import { fileURLToPath } from 'node:url';

import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';

import pool from './config/mysql.js';
import indexRouter from './routes/index.js';
import membershipRouter from './routes/membership.js';

const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

app.disable('x-powered-by');

if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
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

// app.use(
//   express.json({
//     limit: '50kb',
//   }),
// );

app.use(
  express.urlencoded({
    extended: false,
    limit: '50kb',
  }),
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

app.use('/', indexRouter);
app.use('/membership', membershipRouter);

app.use((req, res) => {
  return res.status(404).send('Halaman tidak ditemukan.');
});

app.use((error, req, res, next) => {
  console.error(error);

  if (res.headersSent) {
    return next(error);
  }

  return res.status(500).send(
    process.env.NODE_ENV === 'production'
      ? 'Terjadi kesalahan pada server.'
      : error.stack,
  );
});

const port = Number(process.env.PORT ?? 3000);

async function startServer() {
  try {
    await pool.query('SELECT 1');

    app.listen(port, () => {
      console.log(`Server berjalan di http://localhost:${port}`);
    });
  } catch (error) {
    console.error('Gagal terhubung ke database:', error);
    process.exit(1);
  }
}

startServer();
