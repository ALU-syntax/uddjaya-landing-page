# Deploy VPS dengan PM2, Nginx, Domain, dan Turnstile

Panduan ini mengasumsikan aplikasi Node.js berjalan di VPS yang sama dengan Nginx.
Express hanya bind ke `127.0.0.1`, lalu Nginx yang menerima trafik publik.

## 1. DNS Domain

Di provider domain, arahkan DNS ke IP VPS:

```txt
Type: A
Name: @
Value: IP_VPS_ANDA

Type: CNAME
Name: www
Value: domainanda.com
```

Tunggu propagasi DNS. Untuk subdomain seperti `membership.domainanda.com`, gunakan:

```txt
Type: A
Name: membership
Value: IP_VPS_ANDA
```

## 2. Environment Production

Buat `.env` di VPS dari `.env.example`, lalu isi nilai production:

```env
NODE_ENV=production
HOST=127.0.0.1
PORT=3000
APP_NAME="UD DJAYA"

DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=isi_user_database
DB_PASSWORD=isi_password_database
DB_NAME=isi_nama_database
DB_CONNECTION_LIMIT=10

MAIL_MAILER=smtp
MAIL_HOST=isi_smtp_host
MAIL_PORT=587
MAIL_USERNAME=isi_smtp_username
MAIL_PASSWORD=isi_smtp_password
MAIL_ENCRYPTION=tls
MAIL_FROM_ADDRESS=no-reply@domainanda.com
MAIL_FROM_NAME="${APP_NAME}"

TURNSTILE_SITE_KEY=isi_site_key_cloudflare
TURNSTILE_SECRET_KEY=isi_secret_key_cloudflare
TURNSTILE_EXPECTED_HOSTNAME=domainanda.com,www.domainanda.com
```

Jika memakai subdomain, isi `TURNSTILE_EXPECTED_HOSTNAME` dengan hostname persis,
misalnya `membership.domainanda.com`. Untuk beberapa hostname, pisahkan dengan
koma seperti `domainanda.com,www.domainanda.com`.

## 3. Cloudflare Turnstile

Di Cloudflare Dashboard, buat Turnstile widget dan masukkan hostname production.
Gunakan site key untuk frontend dan secret key untuk backend.

Aplikasi ini akan menolak submit registrasi di production jika Turnstile belum
lengkap atau token tidak valid.

## 4. Install Dependency

```bash
corepack enable
pnpm install --prod --frozen-lockfile
```

Jika `pnpm` belum tersedia:

```bash
npm install -g pnpm
pnpm install --prod --frozen-lockfile
```

## 5. Jalankan dengan PM2

```bash
npm install -g pm2
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

Perintah `pm2 startup` akan menampilkan command lanjutan. Jalankan command itu
agar PM2 otomatis hidup setelah VPS restart.

Perintah operasional:

```bash
pm2 status
pm2 logs uddjaya-membership
pm2 restart uddjaya-membership
```

## 6. Nginx Server Block

Contoh konfigurasi HTTP awal:

```nginx
server {
    listen 80;
    server_name domainanda.com www.domainanda.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    location /healthz {
        proxy_pass http://127.0.0.1:3000/healthz;
        proxy_set_header Host $host;
    }
}
```

Aktifkan konfigurasi, lalu cek dan reload:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## 7. HTTPS

Pasang SSL dengan Certbot:

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d domainanda.com -d www.domainanda.com
```

Setelah HTTPS aktif, pastikan URL register memakai domain production.

## 8. Checklist Deploy

- DNS domain mengarah ke IP VPS.
- `.env` production sudah benar dan tidak di-commit.
- Database production bisa diakses dari VPS.
- SMTP production valid.
- Turnstile widget Cloudflare berisi hostname yang sama dengan domain.
- `TURNSTILE_EXPECTED_HOSTNAME` mencakup hostname yang dibuka user.
- PM2 status `online`.
- `curl http://127.0.0.1:3000/healthz` di VPS mengembalikan `ok`.
- `sudo nginx -t` sukses.
