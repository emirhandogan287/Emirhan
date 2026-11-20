const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const ICONS = {
  follicle: '<path d="M12 21c0-6 0-9 3-13M12 21c0-5-1-8-4-11M12 21V9" /><circle cx="15" cy="6" r="2"/><circle cx="7.5" cy="8" r="2"/><circle cx="12" cy="5" r="2"/>',
  leaf: '<path d="M5 19c0-8 5-14 15-15-1 10-7 15-15 15z"/><path d="M5 19c3-4 6-7 10-9"/>',
  spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/><circle cx="12" cy="12" r="2.5"/>',
  scissors: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M8.5 7.5 20 18M8.5 16.5 20 6"/>',
  drop: '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/><path d="M9 14a3 3 0 0 0 3 3"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
};
const icon = (name) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ICONS.spark}</svg>`;

const DAY_SHORT = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
const DAY_LONG = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
const MONTH_SHORT = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

const state = { config: null, service: null, date: null, time: null, dateOffset: 0 };
let slotReq = 0;

// Tarih yardımcıları: "YYYY-MM-DD" metinleri üzerinden UTC ile hesap (saat dilimi kaymasını önler)
const addDays = (str, n) => {
  const [y, m, d] = str.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
};
const dateInfo = (str) => {
  const [y, m, d] = str.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return { day: d, month: m - 1, weekday: t.getUTCDay() };
};
const humanDate = (str) => { const i = dateInfo(str); return `${i.day} ${MONTH_SHORT[i.month]} ${DAY_LONG[i.weekday]}`; };

async function api(path, opts) {
  const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...opts });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Bir hata oluştu, lütfen tekrar deneyin.');
  return data;
}

/* ---------- Render ---------- */
function renderServices() {
  const { services } = state.config;
  $('#services').innerHTML = services.map((s) => `
    <article class="svc" data-anim="card">
      ${s.badge ? `<span class="badge">${esc(s.badge)}</span>` : ''}
      <div class="svc-icon">${icon(s.icon)}</div>
      <h3>${esc(s.name)}</h3>
      <p>${esc(s.description)}</p>
      <div class="svc-meta"><span>~${s.durationMinutes} dk</span><a href="#randevu" data-service="${s.id}">Randevu al →</a></div>
    </article>`).join('');

  $('#svcPick').innerHTML = services.map((s) => `
    <button type="button" class="pick" role="radio" aria-checked="false" data-id="${s.id}">
      <b>${esc(s.name)}</b>
      <small>~${s.durationMinutes} dk${s.badge ? ` · <span class="tag">${esc(s.badge)}</span>` : ''}</small>
    </button>`).join('');

  // Kartlarda imleci takip eden ışık efekti
  $$('.svc').forEach((card) => card.addEventListener('pointermove', (e) => {
    const r = card.getBoundingClientRect();
    card.style.setProperty('--mx', `${e.clientX - r.left}px`);
    card.style.setProperty('--my', `${e.clientY - r.top}px`);
  }));
}

function renderContact() {
  const { business, openingHours, today } = state.config;
  $('#cPhone').textContent = business.phoneDisplay;
  $('#cAddress').textContent = business.address;
  $('#cInsta').textContent = '@' + business.instagram;
  $('#cWhats').href = `https://wa.me/${business.whatsappNumber}?text=${encodeURIComponent('Merhaba, randevu hakkında bilgi almak istiyorum.')}`;
  $('#cMap').href = business.mapsUrl;
  const todayWd = dateInfo(today).weekday;
  $('#hours').innerHTML = [1, 2, 3, 4, 5, 6, 0].map((d) => {
    const h = openingHours[d];
    return `<li class="${d === todayWd ? 'today' : ''}"><span>${DAY_LONG[d]}</span><span>${h ? `${h.open} – ${h.close}` : 'Kapalı'}</span></li>`;
  }).join('');
  $('#year').textContent = today.slice(0, 4);
}

/* ---------- Booking flow ---------- */
function goStep(step) {
  $$('.pane').forEach((p) => p.classList.toggle('active', p.dataset.pane === String(step)));
  $$('.stepper li').forEach((li) => {
    const n = Number(li.dataset.step);
    li.classList.toggle('active', n === step);
    li.classList.toggle('done', step === 'done' || n < step);
  });
}

function selectService(id, { jump = false } = {}) {
  state.service = state.config.services.find((s) => s.id === id) || null;
  state.time = null;
  $$('.pick').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.id === id)));
  if (!state.service) return;
  if (!state.date) state.date = firstOpenDate();
  renderDates();
  loadSlots();
  goStep(2);
  if (jump) $('#randevu').scrollIntoView({ behavior: 'smooth' });
}

const pageSize = () => (matchMedia('(max-width: 900px)').matches ? 4 : 7);
const isOpen = (str) => Boolean(state.config.openingHours[dateInfo(str).weekday]);
function firstOpenDate() {
  for (let i = 0; i <= state.config.maxDaysAhead; i++) {
    const d = addDays(state.config.today, i);
    if (isOpen(d)) return d;
  }
  return state.config.today;
}

function renderDates() {
  const size = pageSize();
  const max = state.config.maxDaysAhead;
  const start = state.dateOffset;
  const items = [];
  for (let i = start; i < start + size && i <= max; i++) {
    const d = addDays(state.config.today, i);
    const info = dateInfo(d);
    const label = i === 0 ? 'Bugün' : i === 1 ? 'Yarın' : DAY_SHORT[info.weekday];
    items.push(`<button type="button" class="date" role="radio" data-date="${d}" aria-checked="${d === state.date}" ${isOpen(d) ? '' : 'disabled title="Kapalı"'}>
      <small>${label}</small><b>${info.day}</b><small>${MONTH_SHORT[info.month]}</small></button>`);
  }
  $('#dates').innerHTML = items.join('');
  $('#datePrev').disabled = start === 0;
  $('#dateNext').disabled = start + size > max;
}

async function loadSlots() {
  const box = $('#slots');
  $('#toStep3').disabled = true;
  if (!state.service || !state.date) return;
  const req = ++slotReq;
  box.innerHTML = Array.from({ length: 10 }, () => '<div class="skeleton"></div>').join('');
  try {
    const data = await api(`/api/slots?service=${encodeURIComponent(state.service.id)}&date=${state.date}`);
    if (req !== slotReq) return;
    data.slots = data.slots.filter((s) => !s.past);
    const free = data.slots.filter((s) => s.available);
    if (data.closed) box.innerHTML = '<p class="slots-msg">Bu gün kapalıyız. Lütfen başka bir gün seçin.</p>';
    else if (!free.length) box.innerHTML = '<p class="slots-msg">Bu gün için boş saat kalmadı. Yan günlere göz atabilirsiniz.</p>';
    else {
      box.innerHTML = data.slots.map((s) => `<button type="button" class="slot" role="radio" data-time="${s.time}" aria-checked="${s.time === state.time}" ${s.available ? '' : 'disabled aria-disabled="true"'}>${s.time}</button>`).join('');
      if (window.gsap) gsap.from('.slot', { opacity: 0, y: 8, duration: .35, stagger: .015, ease: 'power2.out' });
    }
    $('#toStep3').disabled = !state.time || !free.some((s) => s.time === state.time);
  } catch (e) {
    if (req === slotReq) box.innerHTML = `<p class="slots-msg">${esc(e.message)}</p>`;
  }
}

function renderSummary(el) {
  el.innerHTML = `<span>💆 ${esc(state.service.name)}</span><span>📅 ${humanDate(state.date)}</span><span>🕒 ${state.time}</span>`;
}

async function submit(e) {
  e.preventDefault();
  const err = $('#error');
  err.textContent = '';
  const name = $('#name').value.trim();
  const phone = $('#phone').value.trim();
  $('#name').parentElement.classList.toggle('invalid', name.length < 2);
  $('#phone').parentElement.classList.toggle('invalid', phone.replace(/\D/g, '').length < 10);
  if (name.length < 2) return (err.textContent = 'Lütfen adınızı ve soyadınızı yazın.');
  if (phone.replace(/\D/g, '').length < 10) return (err.textContent = 'Lütfen geçerli bir telefon numarası girin.');
  if (!$('#kvkk').checked) return (err.textContent = 'Devam etmek için KVKK aydınlatma metnini onaylamanız gerekiyor.');

  const btn = $('#submit');
  btn.disabled = true;
  btn.textContent = 'Oluşturuluyor…';
  try {
    const res = await api('/api/appointments', {
      method: 'POST',
      body: JSON.stringify({
        serviceId: state.service.id, date: state.date, time: state.time, name, phone,
        note: $('#note').value, whatsappOptIn: $('#wa').checked, kvkkConsent: true, website: $('input[name=website]').value,
      }),
    });
    renderSummary($('#doneSummary'));
    const first = res.name.split(' ')[0];
    const when = { r24: '1 gün', r5: '5 saat' };
    const rem = (res.reminders || []).map((k) => when[k]).filter(Boolean);
    $('#doneNote').textContent = !res.whatsappOptIn
      ? `Teşekkürler ${first}! Randevunuzu kaydettik. Değişiklik için bize telefon veya WhatsApp'tan ulaşabilirsiniz.`
      : rem.length
        ? `Teşekkürler ${first}! Onay mesajınız WhatsApp'a gönderilecek. Randevunuzdan ${rem.join(' ve ')} önce size hatırlatma yapacağız.`
        : `Teşekkürler ${first}! Onay mesajınız WhatsApp'a gönderilecek. Randevunuz yakın olduğu için ayrıca hatırlatma göndermeyeceğiz, görüşmek üzere!`;
    goStep('done');
    $('#booking').scrollIntoView({ behavior: 'smooth', block: 'center' });
  } catch (e2) {
    err.textContent = e2.message;
    if (/doldu/.test(e2.message)) { state.time = null; loadSlots(); }
  } finally {
    btn.disabled = false;
    btn.textContent = 'Randevuyu Onayla';
  }
}

function bindBooking() {
  $('#svcPick').addEventListener('click', (e) => { const b = e.target.closest('.pick'); if (b) selectService(b.dataset.id); });
  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-service]');
    if (a) { e.preventDefault(); selectService(a.dataset.service, { jump: true }); }
  });
  $('#dates').addEventListener('click', (e) => {
    const b = e.target.closest('.date');
    if (!b || b.disabled) return;
    state.date = b.dataset.date; state.time = null;
    renderDates(); loadSlots();
  });
  $('#datePrev').addEventListener('click', () => { state.dateOffset = Math.max(0, state.dateOffset - pageSize()); renderDates(); });
  $('#dateNext').addEventListener('click', () => { state.dateOffset += pageSize(); renderDates(); });
  $('#slots').addEventListener('click', (e) => {
    const b = e.target.closest('.slot');
    if (!b || b.disabled) return;
    state.time = b.dataset.time;
    $$('.slot').forEach((s) => s.setAttribute('aria-checked', String(s === b)));
    $('#toStep3').disabled = false;
  });
  $('#toStep3').addEventListener('click', () => { renderSummary($('#summary')); goStep(3); $('#name').focus({ preventScroll: true }); });
  $$('[data-back]').forEach((b) => b.addEventListener('click', () => goStep(b.closest('[data-pane]').dataset.pane === '3' ? 2 : 1)));
  $('#form').addEventListener('submit', submit);
  $('#again').addEventListener('click', () => {
    state.time = null; $('#form').reset(); goStep(1);
    $$('.pick').forEach((b) => b.setAttribute('aria-checked', 'false'));
  });
  let lastSize = pageSize();
  addEventListener('resize', () => { if (pageSize() !== lastSize) { lastSize = pageSize(); state.dateOffset = 0; if (state.service) renderDates(); } });

  const dlg = $('#kvkk-metni');
  $$('#kvkkLink, .kvkk-open').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); dlg.showModal(); }));
  $('[data-close]', dlg).addEventListener('click', () => dlg.close());
}

/* ---------- Scroll effects ---------- */
function bindNav() {
  const nav = $('#nav');
  const bar = $('.progress span');
  const onScroll = () => {
    nav.classList.toggle('scrolled', scrollY > 30);
    const max = document.documentElement.scrollHeight - innerHeight;
    bar.style.transform = `scaleX(${max > 0 ? scrollY / max : 0})`;
  };
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

function animate() {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!window.gsap || !window.ScrollTrigger || reduce) return;
  gsap.registerPlugin(ScrollTrigger);

  // Hero girişi
  gsap.timeline({ defaults: { ease: 'expo.out' } })
    .from('.hero-title .line > span', { yPercent: 110, duration: 1.4, stagger: .12 })
    .from('.hero-fade', { opacity: 0, y: 24, duration: 1, stagger: .1 }, '-=1')
    .from('.hero-card', { opacity: 0, x: 40, rotate: 3, duration: 1.2 }, '-=.8');

  // Hero parallax
  gsap.to('.hero-inner', { yPercent: 30, opacity: .2, ease: 'none', scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true } });
  gsap.to('.b1', { yPercent: 40, ease: 'none', scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true } });
  gsap.to('.waves .w1', { y: -30, ease: 'none', scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true } });

  // Kayan yazı bandı: kaydırma yönüne göre hızlanır
  gsap.to('.marquee-track', { x: -200, ease: 'none', scrollTrigger: { trigger: '.marquee', start: 'top bottom', end: 'bottom top', scrub: 1 } });

  // Genel görünme efektleri
  $$('.reveal').forEach((el) => gsap.from(el, { opacity: 0, y: 40, duration: 1, ease: 'power3.out', scrollTrigger: { trigger: el, start: 'top 88%' } }));
  gsap.from('.svc', { opacity: 0, y: 60, rotateX: -12, transformOrigin: '50% 0', duration: 1, stagger: .08, ease: 'power3.out', scrollTrigger: { trigger: '#services', start: 'top 80%' } });

  // Fotoğraf alanları: perde açılma + parallax
  $$('.ph').forEach((el) => {
    gsap.from(el, { clipPath: 'inset(100% 0 0 0 round 22px)', duration: 1.3, ease: 'expo.out', scrollTrigger: { trigger: el, start: 'top 85%' } });
    gsap.to(el, { yPercent: Number(el.dataset.speed) || 0, ease: 'none', scrollTrigger: { trigger: el, start: 'top bottom', end: 'bottom top', scrub: true } });
  });

  // Saç ekimi yolculuğu: masaüstünde sabitlenir, adımlar kaydırdıkça yanar
  const mm = gsap.matchMedia();
  mm.add('(min-width: 901px)', () => {
    const steps = $$('.step');
    $('.journey').classList.add('has-pin');
    const st = ScrollTrigger.create({
      trigger: '.journey-pin', start: 'top top', end: `+=${steps.length * 60}%`, pin: true, scrub: true,
      onUpdate: (self) => {
        const active = Math.min(steps.length - 1, Math.floor(self.progress * steps.length));
        steps.forEach((s, i) => s.classList.toggle('on', i <= active));
        $('.journey-bar span').style.transform = `scaleX(${self.progress})`;
      },
    });
    return () => { st.kill(); $('.journey').classList.remove('has-pin'); };
  });
  mm.add('(max-width: 900px)', () => {
    $$('.step').forEach((el) => gsap.from(el, { opacity: 0, x: 30, duration: .8, ease: 'power3.out', scrollTrigger: { trigger: el, start: 'top 88%' } }));
  });
}

/* ---------- Init ---------- */
async function init() {
  bindNav();
  try {
    state.config = await api('/api/config');
  } catch {
    $('#services').innerHTML = '<p>Hizmetler yüklenemedi. Lütfen sayfayı yenileyin.</p>';
    return;
  }
  renderServices();
  renderContact();
  bindBooking();
  animate();
}
init();
