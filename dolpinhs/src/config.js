// DOLPİNHS — işletme ayarları
// Bu dosyadaki bilgileri işletmenin gerçek bilgileriyle güncelleyin.

export const business = {
  name: 'DOLPİNHS',
  tagline: 'Güzellik & Saç Ekimi Merkezi',
  // TODO: Gerçek bilgilerle değiştirin
  phoneDisplay: '0 (5XX) XXX XX XX',
  whatsappNumber: '905000000000', // wa.me bağlantısı için, başında + olmadan
  address: 'Adres bilgisi buraya gelecek',
  instagram: 'dolpinhs',
  mapsUrl: 'https://maps.google.com',
};

// Türkiye 2016'dan beri yaz saati uygulamıyor: sabit UTC+3
export const UTC_OFFSET_MINUTES = 180;

// Çalışma saatleri (0 = Pazar, 1 = Pazartesi ... 6 = Cumartesi). null = kapalı
export const openingHours = {
  0: null,
  1: { open: '09:00', close: '20:00' },
  2: { open: '09:00', close: '20:00' },
  3: { open: '09:00', close: '20:00' },
  4: { open: '09:00', close: '20:00' },
  5: { open: '09:00', close: '20:00' },
  6: { open: '10:00', close: '18:00' },
};

export const booking = {
  slotIntervalMinutes: 30,  // saat seçeneklerinin aralığı
  minLeadMinutes: 60,       // en erken kaç dakika sonrasına randevu alınabilir
  maxDaysAhead: 30,         // kaç gün sonrasına kadar randevu alınabilir
  totalCapacity: 3,         // aynı anda hizmet verebilen toplam personel/koltuk
};

// capacity: bu hizmet için aynı anda kaç randevu olabilir (ör. tek uzman)
export const services = [
  {
    id: 'sac-ekimi-on-gorusme',
    name: 'Saç Ekimi Ön Görüşme',
    description: 'Saç ve saçlı deri analizi, size özel planlama ve tüm sorularınızın yanıtlandığı ücretsiz görüşme.',
    durationMinutes: 45,
    capacity: 1,
    badge: 'Ücretsiz',
    icon: 'follicle',
  },
  {
    id: 'cilt-bakimi',
    name: 'Cilt Bakımı',
    description: 'Cilt tipinize göre temizlik, nem ve canlandırma odaklı profesyonel bakım.',
    durationMinutes: 60,
    capacity: 2,
    icon: 'leaf',
  },
  {
    id: 'lazer-epilasyon',
    name: 'Lazer Epilasyon',
    description: 'Bölgeye ve cilt tipine göre ayarlanan seanslarla konforlu uygulama.',
    durationMinutes: 30,
    capacity: 1,
    icon: 'spark',
  },
  {
    id: 'sac-bakim-kesim',
    name: 'Saç Bakımı & Kesim',
    description: 'Yüz hattınıza uygun kesim, fön ve saç sağlığını destekleyen bakım.',
    durationMinutes: 60,
    capacity: 2,
    icon: 'scissors',
  },
  {
    id: 'sac-boyama',
    name: 'Saç Boyama',
    description: 'Renk danışmanlığı ile dip boya, balyaj ve ombre uygulamaları.',
    durationMinutes: 120,
    capacity: 2,
    icon: 'drop',
  },
  {
    id: 'kas-kirpik',
    name: 'Kaş & Kirpik',
    description: 'Kaş tasarımı, laminasyon ve kirpik lifting.',
    durationMinutes: 45,
    capacity: 1,
    icon: 'eye',
  },
];

// WhatsApp hatırlatmaları
export const reminders = {
  // Randevudan kaç dakika önce hatırlatma gönderilecek
  schedule: [
    { key: 'r24', minutesBefore: 24 * 60, template: 'randevu_hatirlatma_1gun' },
    { key: 'r5', minutesBefore: 5 * 60, template: 'randevu_hatirlatma_5saat' },
  ],
  sendConfirmation: true,
  confirmationTemplate: 'randevu_onay',
  // Gece rahatsız etmemek için: bu saatler arasına düşen hatırlatma sabah quietEnd'de gönderilir
  quietStart: '22:00',
  quietEnd: '08:00',
  maxAttempts: 3,
  checkIntervalSeconds: 60,
};
