# DOLPİNHS: Online Randevu + WhatsApp Hatırlatma

Bu paket, güzellik ve saç ekimi merkezi için hazırlanan **Başlangıç Paketi**dir:

- 🌐 **Online randevu sayfası:** Kaydırdıkça animasyonla açılan, mobil uyumlu bir tanıtım sayfası. Müşteri hizmeti, günü ve boş saati seçip birkaç saniyede randevu alır.
- 💬 **WhatsApp mesajları:** Randevu alınınca **onay mesajı**, randevudan **1 gün önce** ve **5 saat önce** de **hatırlatma** otomatik olarak gönderilir.
- 🗂️ **Yönetim paneli (`/admin`):** Randevuları görürsünüz, iptal edersiniz, telefonla gelen randevuları da sisteme eklersiniz (bunlara da hatırlatma gider). Hangi mesajın gönderildiğini buradan takip edersiniz.

## Çalıştırma

Gereken tek şey **Node.js 22.13 veya üzeri**. Ek bir paket kurmanız gerekmez.

```bash
cp .env.example .env    # sonra .env içindeki ADMIN_PASSWORD'ü doldurun
npm start               # http://localhost:3000  ·  yönetim: http://localhost:3000/admin
npm test                # randevu ve hatırlatma kurallarının testleri
```

`WHATSAPP_TOKEN` boş bırakılırsa sistem **deneme modunda** çalışır. Bu modda mesajlar gönderilmez, sadece konsola ve yönetim panelindeki "Son gönderilen mesajlar" bölümüne yazılır. Patrona demo yaparken bu mod kullanılır.

## İşletmeye göre ayarlama: `src/config.js`

- `business`: telefon, adres, Instagram, WhatsApp numarası, harita linki (şu an **örnek bilgiler** var, gerçekleriyle değiştirin)
- `openingHours`: çalışma saatleri (Pazar kapalı)
- `services`: hizmetler, süreleri ve **kapasiteleri** (aynı saatte kaç kişiye hizmet verilebileceği)
- `booking.totalCapacity`: salonda aynı anda çalışan toplam personel ya da koltuk sayısı
- `reminders`: hatırlatma zamanları (1 gün ve 5 saat önce) ve gece sessiz saatleri

**Fotoğraflar:** Sayfadaki "Salon / Uygulama / Ekip fotoğrafı" alanları şimdilik yer tutucu. Salonun **gerçek fotoğraflarını** `public/assets/` klasörüne koyup `public/styles.css` içindeki `.ph-1 .ph-inner`, `.ph-2 .ph-inner` ve `.ph-3 .ph-inner` kurallarına `background-image: url(assets/salon.jpg);` ekleyin.

## Hatırlatma kuralları

| Mesaj | Ne zaman gider? |
|---|---|
| Onay | Randevu alındığı anda |
| 1 gün önce | Randevudan 24 saat önce. Randevu 24 saatten kısa süre kala alındıysa **gönderilmez** |
| 5 saat önce | Randevudan 5 saat önce. Bu saat geceye (22:00–08:00) denk gelirse **sabah 08:00'de** gönderilir |

- Müşteri formda WhatsApp iznini işaretlemediyse hiçbir mesaj gönderilmez.
- İptal edilen randevulara mesaj gitmez.
- Gönderim başarısız olursa her dakika tekrar denenir, en fazla 3 kez.
- Sunucu kapanıp açılsa da hatırlatmalar kaybolmaz, çünkü veritabanında saklanıyorlar.

## WhatsApp'ı canlıya alma (Meta WhatsApp Business Cloud API)

1. [business.facebook.com](https://business.facebook.com) üzerinden bir **Meta Business hesabı** açın.
2. [developers.facebook.com](https://developers.facebook.com) adresinde bir uygulama oluşturun ve **WhatsApp** ürününü ekleyin.
3. İşletmenin numarasını WhatsApp Business Platform'a bağlayın. Bu numara normal WhatsApp uygulamasında kullanılmayan bir numara olmalı.
4. **Mesaj şablonlarını** oluşturun. Kategori **Utility (Yardımcı)**, dil **Turkish (tr)** olmalı. Aşağıdaki metinleri olduğu gibi kullanın:

**`randevu_onay`**
```
Merhaba {{1}}, DOLPİNHS randevunuz oluşturuldu.
📅 {{2}}
🕒 {{3}}
💆 {{4}}
Randevunuzdan önce size hatırlatma göndereceğiz. Değişiklik için bu mesaja yanıt verebilirsiniz.
```

**`randevu_hatirlatma_1gun`**
```
Merhaba {{1}}, yarın DOLPİNHS'te {{3}} randevunuz var.
🕒 Saat: {{2}}
Sizi bekliyoruz! Gelemeyecekseniz lütfen bu mesaja yanıt verin.
```

**`randevu_hatirlatma_5saat`**
```
Merhaba {{1}}, bugünkü {{3}} randevunuzu hatırlatmak isteriz.
🕒 Saat: {{2}}
DOLPİNHS ekibi olarak sizi bekliyoruz.
```

5. Şablonlar onaylanınca **kalıcı erişim anahtarını** (System User token) ve **Phone Number ID**'yi `.env` dosyasına yazın:
   ```
   WHATSAPP_TOKEN=...
   WHATSAPP_PHONE_NUMBER_ID=...
   ```
6. Sunucuyu yeniden başlatın. Yönetim panelinde **"WhatsApp: canlı"** yazısı görünmeli.

> Meta, işletmenin başlattığı her şablon mesajı için küçük bir ücret alır. Fiyatlar ülkeye ve kategoriye göre değişir, güncel tarifeyi Meta'nın fiyatlandırma sayfasından kontrol edin. Bu maliyeti aylık bakım ücretine dahil etmeniz önerilir.

## Yayına alma

Uygulama sürekli çalışan bir sunucu ister, çünkü hatırlatmaları dakikada bir kontrol eder. Ayrıca veritabanı dosyasının (`data/`) kalıcı olarak saklanması gerekir. Uygun seçenekler:

- Küçük bir **VPS** (Linux sunucu) üzerinde `npm start` ile çalıştırıp `pm2` ya da `systemd` ile sürekli açık tutmak. Önüne Nginx ve ücretsiz bir HTTPS sertifikası (Let's Encrypt) koymak.
- Node.js destekleyen ve **kalıcı disk** sunan bir barındırma servisi.

Alan adı (ör. `dolpinhs.com`) alınıp sunucuya yönlendirilir. Mutlaka **HTTPS** kullanın.

## ⚠️ Yayına almadan önce

- **KVKK:** Sayfadaki aydınlatma metni bir **taslaktır**. İşletmenin avukatı ya da KVKK danışmanı tarafından kontrol edilmeli ve işletmenin unvanı ile iletişim bilgileri eklenmelidir.
- **Sağlık reklamı:** Saç ekimi bir sağlık hizmetidir. Sayfaya "garantili sonuç" gibi iddialar ya da öncesi/sonrası fotoğrafları eklemeden önce sağlık reklamı mevzuatını kontrol edin.
- `config.js` içindeki **örnek telefon, adres ve WhatsApp numarasını** gerçek bilgilerle değiştirin.
- Güçlü bir `ADMIN_PASSWORD` belirleyin.

## Dosya yapısı

```
server.js            HTTP sunucusu ve API
src/config.js        işletme ayarları
src/appointments.js  boş saat hesabı, randevu oluşturma, hatırlatma planı
src/reminders.js     zamanı gelen mesajları gönderen döngü
src/whatsapp.js      WhatsApp Cloud API istemcisi ve şablon metinleri
src/time.js          İstanbul saati yardımcıları
public/              sayfa (index.html), yönetim paneli (admin.html), stiller, GSAP
test/                testler
```
