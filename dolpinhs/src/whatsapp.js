// WhatsApp Business Cloud API (Meta) ile şablon mesaj gönderimi.
// WHATSAPP_TOKEN ve WHATSAPP_PHONE_NUMBER_ID tanımlı değilse "deneme modu"nda çalışır:
// mesajlar gönderilmez, sadece konsola ve mesaj kaydına yazılır.
import { business } from './config.js';

const API_VERSION = process.env.WHATSAPP_API_VERSION || 'v21.0';

export function isLive() {
  return Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
}

// Meta'da onaylatılacak şablon metinleri (README'de de var). {{n}} = parametreler
export const TEMPLATE_TEXTS = {
  randevu_onay:
    'Merhaba {{1}}, ' + business.name + ' randevunuz oluşturuldu.\n📅 {{2}}\n🕒 {{3}}\n💆 {{4}}\nRandevunuzdan önce size hatırlatma göndereceğiz. Değişiklik için bu mesaja yanıt verebilirsiniz.',
  randevu_hatirlatma_1gun:
    'Merhaba {{1}}, yarın ' + business.name + '\'te {{3}} randevunuz var.\n🕒 Saat: {{2}}\nSizi bekliyoruz! Gelemeyecekseniz lütfen bu mesaja yanıt verin.',
  randevu_hatirlatma_5saat:
    'Merhaba {{1}}, bugünkü {{3}} randevunuzu hatırlatmak isteriz.\n🕒 Saat: {{2}}\n' + business.name + ' ekibi olarak sizi bekliyoruz.',
};

export function renderTemplate(name, params) {
  const text = TEMPLATE_TEXTS[name] || name;
  return text.replace(/\{\{(\d+)\}\}/g, (_, i) => params[Number(i) - 1] ?? '');
}

export async function sendTemplate({ to, template, params, language = 'tr' }) {
  const body = renderTemplate(template, params);
  if (!isLive()) {
    console.log(`[WhatsApp DENEME] -> +${to} (${template})\n${body}\n`);
    return { ok: true, mode: 'dry-run', body };
  }
  const url = `https://graph.facebook.com/${API_VERSION}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
          name: template,
          language: { code: language },
          components: [{ type: 'body', parameters: params.map((text) => ({ type: 'text', text: String(text) })) }],
        },
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, mode: 'live', body, error: data?.error?.message || `HTTP ${res.status}` };
    return { ok: true, mode: 'live', body, messageId: data?.messages?.[0]?.id };
  } catch (err) {
    return { ok: false, mode: 'live', body, error: err.message };
  }
}
