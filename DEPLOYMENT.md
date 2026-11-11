# EduBoard Live - Canlıya Alma (Production Deployment) Rehberi

Bu proje **Full-Stack (React Frontend + Node.js Express + WebSocket Server)** mimarisine sahiptir. Tek bir portta hem statik arayüzü hem de gerçek zamanlı WebSocket bağlantılarını yönetir.

---

## 1. Yöntem: Render.com veya Railway (En Hızlı & En Kolay - 2 Dakika)

Render veya Railway, WebSockets destekleyen en popüler PaaS sağlayıcılarıdır.

### Render.com ile Dağıtım:
1. Projenizi GitHub'a yükleyin (`git push`).
2. [Render.com](https://render.com) paneline girip **New > Web Service** seçin.
3. GitHub reponuzu bağlayın.
4. Ayarları şu şekilde yapın:
   * **Runtime:** `Node` veya `Docker` (Dockerfile projede hazırdır)
   * **Build Command:** `npm install && npm run build`
   * **Start Command:** `npm start`
   * **Plan:** Free veya Starter
5. **Deploy Web Service** butonuna basın. Size özel `https://eduboard-xxxx.onrender.com` adresi anında açılır ve WebSockets otomatik olarak çalışır.

---

## 2. Yöntem: Cloudflare Workers + Durable Objects (Önerilen Edge Mimarisi)

Dünyanın 300+ noktasında **sıfır gecikme** ve sıfır sunucu yönetimi istiyorsanız:

1. Projedeki `cloudflare-worker/` klasörüne gidin:
   ```bash
   cd cloudflare-worker
   ```
2. Cloudflare hesabınıza giriş yapıp deploy edin:
   ```bash
   npx wrangler login
   npx wrangler deploy
   ```
3. Size `wss://eduboard-yjs-edge.<subdomain>.workers.dev` adresi verilecektir.
4. Frontend'i ise ücretsiz olarak **Cloudflare Pages** veya **Vercel** üzerine yükleyebilirsiniz.

---

## 3. Yöntem: Kendi Linux Sunucunuz (Ubuntu / VPS - Nginx & PM2)

Eğer kendi sunucunuzda (DigitalOcean, Hetzner, AWS EC2 vb.) çalıştırmak isterseniz:

1. Sunucuda depoyu klonlayıp derleyin:
   ```bash
   git clone <repo-url>
   cd eduboard
   npm install
   npm run build
   ```
2. PM2 ile arka planda çalıştırın:
   ```bash
   npm install -g pm2
   pm2 start "npm start" --name eduboard
   pm2 save
   pm2 startup
   ```
3. **Nginx Yapılandırması (WebSocket Reverse Proxy):**
   `/etc/nginx/sites-available/eduboard`:
   ```nginx
   server {
       server_name tahta.okulunuz.com;

       location / {
           proxy_pass http://127.0.0.1:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection "upgrade";
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
           proxy_read_timeout 86400s;
           proxy_send_timeout 86400s;
       }
   }
   ```
4. Let's Encrypt ile ücretsiz SSL alın:
   ```bash
   sudo certbot --nginx -d tahta.okulunuz.com
   ```

---

## 4. Canlıda Kesin Çalışır mı? Kontrol Listesi

* [x] **Tek Port Mimarisi:** HTTP ve WSS aynı portta çalıştığı için CORS sorunu olmaz.
* [x] **WSS Desteği:** `useYjsStore.ts` içindeki mantık, HTTPS altındayken otomatik olarak `wss://` (Secure WebSocket) protokolüne geçer.
* [x] **Çizim Kalıcılığı:** `.storage/rooms/` klasörüne otomatik kaydedilir, sunucu yeniden başlasa da çizimler silinmez.
* [x] **Docker Desteği:** Projede `Dockerfile` hazır olduğu için Docker destekleyen her bulut platformunda (AWS, GCP, Azure, Fly.io) tek tıkla çalışır.
