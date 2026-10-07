// راهنمای سازگان — خواننده PDF آفلاین با جستجوی متن کامل
import * as pdfjs from './lib/pdf.min.mjs';
pdfjs.GlobalWorkerOptions.workerSrc = './lib/pdf.worker.min.mjs';

const $ = s => document.querySelector(s);
const app = $('#app');
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const enc = id => id.split('/').map(encodeURIComponent).join('/');
const store = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };

// ---------- نرمال‌سازی متن فارسی برای جستجو ----------
const MAP = { 'ي': 'ی', 'ى': 'ی', 'ك': 'ک', 'ة': 'ه', 'ۀ': 'ه', 'أ': 'ا', 'إ': 'ا', 'آ': 'ا' };
function norm(s) {
  let n = '', idx = [];
  s = s.normalize('NFKC');
  for (let i = 0; i < s.length; i++) {
    let c = MAP[s[i]] ?? s[i];
    if (/[\u200c\u200d\u200e\u200f\u0640\u064B-\u065F\u0670]/.test(c)) continue;
    if (c >= '۰' && c <= '۹') c = String(c.charCodeAt(0) - 1776);
    else if (c >= '٠' && c <= '٩') c = String(c.charCodeAt(0) - 1632);
    for (const ch of c.toLowerCase()) { n += ch; idx.push(i); }
  }
  return { n, idx };
}
const terms = q => norm(q).n.split(/\s+/).filter(Boolean);

// ---------- داده ----------
let catalog, index, ver;
const load = async () => {
  if (catalog) return;
  ver = await (await fetch('data/version.json')).json();
  catalog = await (await fetch('data/catalog.json')).json();
  index = await (await fetch('data/index.json')).json();
  index.forEach(e => (e.m = norm(e.t)));
};
const fileById = id => { for (const p of catalog.products) for (const f of p.files) if (f.id === id) return { p, f }; };

function search(q, onlyFile) {
  const ts = terms(q);
  if (!ts.length) return [];
  const out = [];
  for (const e of index) {
    if (onlyFile && e.f !== onlyFile) continue;
    if (!ts.every(t => e.m.n.includes(t))) continue;
    out.push({ e, score: ts.reduce((a, t) => a + e.m.n.split(t).length - 1, 0) });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 60).map(r => r.e);
}
function snippet(e, q) {
  const t = terms(q)[0], at = e.m.n.indexOf(t);
  const s = e.m.idx[Math.max(0, at - 30)] ?? 0, en = e.m.idx[Math.min(e.m.idx.length - 1, at + t.length + 50)] ?? e.t.length;
  return (s > 0 ? '… ' : '') + esc(e.t.slice(s, en)) + ' …';
}
const toast = (m) => { const t = $('#toast'); t.textContent = m; t.classList.add('on'); clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('on'), 2200); };

// ---------- ذخیره و اشتراک‌گذاری ----------
const cap = window.Capacitor, native = cap?.isNativePlatform?.();
const toB64 = blob => new Promise(r => { const f = new FileReader(); f.onload = () => r(f.result.split(',')[1]); f.readAsDataURL(blob); });
async function getBlob(id) { return (await fetch('files/' + enc(id))).blob(); }
async function saveFile(id) {
  const { f } = fileById(id);
  try {
    const blob = await getBlob(id);
    if (!native) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = f.name; a.click(); return toast('فایل دانلود شد'); }
    const FS = cap.registerPlugin('Filesystem');
    await FS.writeFile({ path: 'Sazgan/' + f.name, data: await toB64(blob), directory: 'DOCUMENTS', recursive: true });
    toast('ذخیره شد: Documents/Sazgan/' + f.name);
  } catch (e) { toast('ذخیره نشد: ' + (e.message || e)); }
}
async function shareFile(id) {
  const { f } = fileById(id);
  try {
    if (!native) return toast('اشتراک‌گذاری فقط در اپ اندروید فعال است');
    const FS = cap.registerPlugin('Filesystem'), Share = cap.registerPlugin('Share');
    await FS.writeFile({ path: f.name, data: await toB64(await getBlob(id)), directory: 'CACHE' });
    const { uri } = await FS.getUri({ path: f.name, directory: 'CACHE' });
    await Share.share({ title: f.title, url: uri, dialogTitle: 'ارسال فایل' });
  } catch (e) { if (!/cancel/i.test(String(e.message || e))) toast('ارسال نشد'); }
}

// ---------- صفحه‌ها ----------
const fa = n => String(n).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]);
function home() {
  app.innerHTML = `<div class="bar"><h1>راهنمای محصولات سازگان گستر</h1><button id="dk">شب</button></div>
  <div class="wrap"><div class="search"><input id="q" type="search" placeholder="جستجو در متن همه راهنماها" autocomplete="off"></div><div id="list"></div><div class="ver">نسخه ${fa(ver.version)} (ساخت ${fa(ver.build)}) · ${new Date(ver.date).toLocaleDateString('fa-IR-u-ca-persian')}</div></div>`;
  $('#dk').onclick = toggleDark;
  const list = $('#list');
  const drawProducts = () => {
    let last = null, h = '';
    for (const p of catalog.products) {
      if (p.group && p.group !== last) { h += `<div class="grp">${esc(p.group)}</div>`; last = p.group; }
      h += `<button class="row" data-s="${esc(p.slug)}"><b>${esc(p.title)}</b><span>${p.files.length ? fa(p.files.length) + ' فایل' : 'فایلی اضافه نشده'}${p.summary ? ' · ' + esc(p.summary) : ''}</span></button>`;
    }
    list.innerHTML = h || '<div class="empty">هنوز محصولی اضافه نشده است.</div>';
    list.querySelectorAll('[data-s]').forEach(b => b.onclick = () => (location.hash = '#/p/' + b.dataset.s));
  };
  let h;
  $('#q').oninput = e => {
    clearTimeout(h);
    h = setTimeout(() => {
      const q = e.target.value.trim();
      if (!q) return drawProducts();
      const rs = search(q);
      list.innerHTML = rs.length ? rs.map((r, i) => { const { f } = fileById(r.f); return `<button class="row" data-i="${i}"><b>${esc(f.title)} — صفحه ${fa(r.p)}</b><div class="hit-snip">${snippet(r, q)}</div></button>`; }).join('') : `<div class="empty">نتیجه‌ای برای «${esc(q)}» پیدا نشد.</div>`;
      list.querySelectorAll('[data-i]').forEach(b => b.onclick = () => { const r = rs[b.dataset.i]; location.hash = `#/r/${enc(r.f)}?p=${r.p}&q=${encodeURIComponent(q)}`; });
    }, 200);
  };
  drawProducts();
}

function product(slug) {
  const p = catalog.products.find(x => x.slug === slug);
  if (!p) return (location.hash = '#/');
  app.innerHTML = `<div class="bar"><button onclick="history.back()">بازگشت</button><h1>${esc(p.title)}</h1></div>
  <div class="wrap">${p.summary ? `<p style="color:var(--mute)">${esc(p.summary)}</p>` : ''}${p.files.length ? '' : '<div class="empty">برای این محصول هنوز فایلی اضافه نشده است.</div>'}${p.files.map(f => `<div class="file"><button class="row" data-o="${esc(f.id)}"><b>${esc(f.title)}</b><span>${fa(f.pages)} صفحه · ${fa((f.size / 1048576).toFixed(1))} مگابایت</span></button><button class="mini" data-d="${esc(f.id)}">ذخیره</button><button class="mini" data-h="${esc(f.id)}">ارسال</button></div>`).join('')}</div>`;
  app.querySelectorAll('[data-o]').forEach(b => b.onclick = () => (location.hash = '#/r/' + enc(b.dataset.o)));
  app.querySelectorAll('[data-d]').forEach(b => b.onclick = () => saveFile(b.dataset.d));
  app.querySelectorAll('[data-h]').forEach(b => b.onclick = () => shareFile(b.dataset.h));
}

// ---------- خواننده ----------
async function reader(id, params) {
  const meta = fileById(id);
  if (!meta) return (location.hash = '#/');
  const { f } = meta;
  app.innerHTML = `<div class="bar"><button onclick="history.back()">بازگشت</button><h1>${esc(f.title)}</h1><button id="fb">جستجو</button><button id="sv">ذخیره</button><button id="sh">ارسال</button><button id="dk">شب</button></div>
  <div class="find" id="find"><input id="fq" type="search" placeholder="جستجو در این فایل"><small id="fc"></small><button class="mini" id="fp">قبلی</button><button class="mini" id="fn">بعدی</button></div>
  <div id="pages"></div><div class="pg"><input id="pn" type="number" min="1" max="${f.pages}" inputmode="numeric"><span>از ${fa(f.pages)}</span></div>`;
  $('#dk').onclick = toggleDark; $('#sv').onclick = () => saveFile(id); $('#sh').onclick = () => shareFile(id);

  const doc = await pdfjs.getDocument({ url: 'files/' + enc(id) }).promise;
  const first = await doc.getPage(1), base = first.getViewport({ scale: 1 });
  const box = $('#pages');
  const width = Math.min(window.innerWidth - 16, 900), scale = width / base.width;
  let q = params.get('q') || '', hits = [], cur = -1;
  const nodes = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const d = document.createElement('div'); d.className = 'page'; d.dataset.p = p;
    d.style.width = width + 'px'; d.style.height = Math.round(base.height * scale) + 'px';
    box.appendChild(d); nodes.push(d);
  }
  const rendered = new Set();
  async function render(d) {
    const n = +d.dataset.p; if (rendered.has(n)) return; rendered.add(n);
    const page = await doc.getPage(n), vp = page.getViewport({ scale });
    d.style.height = Math.round(vp.height) + 'px';
    const dpr = Math.min(window.devicePixelRatio || 1, 2), cv = document.createElement('canvas');
    cv.width = Math.floor(vp.width * dpr); cv.height = Math.floor(vp.height * dpr);
    d.appendChild(cv);
    await page.render({ canvasContext: cv.getContext('2d'), viewport: vp, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null }).promise;
    const tl = document.createElement('div'); tl.className = 'textLayer';
    tl.style.setProperty('--scale-factor', scale); tl.style.setProperty('--total-scale-factor', scale);
    d.appendChild(tl);
    await new pdfjs.TextLayer({ textContentSource: page.streamTextContent(), container: tl, viewport: vp }).render();
    mark(d);
  }
  function mark(d) {
    const ts = terms(q);
    d.querySelectorAll('.textLayer span').forEach(s => { s.classList.toggle('hit', !!ts.length && ts.some(t => norm(s.textContent).n.includes(t))); });
  }
  const io = new IntersectionObserver(es => es.forEach(e => e.isIntersecting && render(e.target)), { rootMargin: '800px 0px' });
  nodes.forEach(n => io.observe(n));

  // شماره صفحه جاری
  const pn = $('#pn'); let raf;
  const go = (n, smooth) => { n = Math.max(1, Math.min(doc.numPages, n)); nodes[n - 1].scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' }); };
  window.onscroll = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => {
    let c = 1; for (const n of nodes) { if (n.getBoundingClientRect().top <= window.innerHeight * 0.4) c = +n.dataset.p; else break; }
    if (document.activeElement !== pn) pn.value = c; store.set('pg:' + id, c); }); };
  pn.onchange = () => go(+pn.value, true);

  // جستجو در فایل
  const fq = $('#fq'), fc = $('#fc');
  function doFind(jump = true) {
    q = fq.value.trim(); hits = search(q, id).map(e => e.p).sort((a, b) => a - b); cur = hits.length ? 0 : -1;
    nodes.forEach(d => rendered.has(+d.dataset.p) && mark(d));
    fc.textContent = !q ? '' : hits.length ? `۱ از ${fa(hits.length)} صفحه` : 'پیدا نشد';
    if (jump && hits.length) go(hits[0]);
  }
  const step = k => { if (!hits.length) return; cur = (cur + k + hits.length) % hits.length; fc.textContent = `${fa(cur + 1)} از ${fa(hits.length)} صفحه`; go(hits[cur]); };
  $('#fb').onclick = () => { $('#find').classList.toggle('on'); fq.focus(); };
  fq.onchange = () => doFind(); $('#fn').onclick = () => step(1); $('#fp').onclick = () => step(-1);

  const start = +(params.get('p') || store.get('pg:' + id) || 1);
  if (q) { $('#find').classList.add('on'); fq.value = q; doFind(false); cur = Math.max(0, hits.indexOf(start)); fc.textContent = `${fa(cur + 1)} از ${fa(hits.length)} صفحه`; }
  pn.value = start; requestAnimationFrame(() => go(start));
}

// ---------- مسیریابی ----------
function toggleDark() { document.body.classList.toggle('dark'); store.set('dark', document.body.classList.contains('dark') ? '1' : '0'); }
async function route() {
  window.onscroll = null; window.scrollTo(0, 0);
  await load();
  const [path, qs] = location.hash.slice(1).split('?'), parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  if (parts[0] === 'p') product(parts[1]);
  else if (parts[0] === 'r') await reader(parts.slice(1).join('/'), new URLSearchParams(qs || ''));
  else home();
}
if (store.get('dark') === '1') document.body.classList.add('dark');
addEventListener('hashchange', route);
route();
