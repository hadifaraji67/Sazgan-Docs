// راهنمای سازگان — خواننده PDF آفلاین با جستجوی متن کامل
import * as pdfjs from './lib/pdf.min.mjs';
pdfjs.GlobalWorkerOptions.workerSrc = './lib/pdf.worker.min.mjs';

const $ = s => document.querySelector(s);
const app = $('#app');
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const enc = id => id.split('/').map(encodeURIComponent).join('/');
const store = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };
const jget = (k, d) => { try { return JSON.parse(store.get(k)) ?? d; } catch { return d; } };
const jset = (k, v) => store.set(k, JSON.stringify(v));
const fa = n => String(n).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]);

// ---------- آیکن‌ها ----------
const IC = {
  home: '<path d="M4 11l8-7 8 7v9H4z"/>',
  grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
  search: '<circle cx="11" cy="11" r="6"/><path d="M16 16l4 4"/>',
  save: '<path d="M12 4v11m-4-4l4 4 4-4M5 20h14"/>',
  menu: '<path d="M4 8h16M4 16h10"/>',
  back: '<path d="M9 5l7 7-7 7"/>',
  book: '<path d="M7 4h10v16l-5-4-5 4z"/>',
  moon: '<path d="M19 14.5A7.5 7.5 0 019.5 5a7.5 7.5 0 109.5 9.5z"/>',
  txt: '<path d="M4 19l5-13 5 13M6 14h6M17 11v8M14.5 15h5"/>',
  help: '<path d="M5 14v-2a7 7 0 0114 0v2M5 14h2v4H5zM17 14h2v4h-2z"/>',
  info: '<circle cx="12" cy="12" r="8"/><path d="M12 11v5M12 8v.01"/>',
  dev: '<rect x="3" y="5" width="18" height="13" rx="2"/><path d="M6 12h3l1.5-3 2 5 1.5-2H18"/>',
  share: '<path d="M12 15V4M8 8l4-4 4 4M5 14v6h14v-6"/>'
};
const ic = (n, s = 24) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${IC[n]}</svg>`;

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
let catalog, index, ver, learn, cfg = {};
const load = async () => {
  if (catalog) return;
  ver = await (await fetch('data/version.json')).json();
  cfg = await (await fetch('data/app.json')).json().catch(() => ({}));
  catalog = await (await fetch('data/catalog.json')).json();
  index = await (await fetch('data/index.json')).json();
  index.forEach(e => (e.m = norm(e.t)));
  learn = await (await fetch('data/learn.json')).json().catch(() => ({articles:[]}));
  $('#dv').textContent = `نسخه ${fa(ver.version)} (ساخت ${fa(ver.build)})`;
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
const toast = m => { const t = $('#toast'); t.textContent = m; t.classList.add('on'); clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('on'), 2400); };

// ---------- ذخیره و اشتراک‌گذاری ----------
const cap = window.Capacitor, native = cap?.isNativePlatform?.();
const toB64 = blob => new Promise(r => { const f = new FileReader(); f.onload = () => r(f.result.split(',')[1]); f.readAsDataURL(blob); });
const getBlob = async id => (await fetch('files/' + enc(id))).blob();
async function saveFile(id) {
  const { f } = fileById(id);
  try {
    const blob = await getBlob(id);
    if (!native) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = f.name; a.click(); }
    else await cap.registerPlugin('Filesystem').writeFile({ path: 'Sazgan/' + f.name, data: await toB64(blob), directory: 'DOCUMENTS', recursive: true });
    const sv = jget('saved', []).filter(x => x.id !== id); sv.unshift({ id, t: Date.now() }); jset('saved', sv);
    toast(native ? 'ذخیره شد: Documents/Sazgan/' + f.name : 'فایل دانلود شد');
  } catch (e) { toast('ذخیره نشد: ' + (e.message || e)); }
}
async function shareFile(id) {
  const { f } = fileById(id);
  try {
    if (!native) return toast('اشتراک‌گذاری فقط در اپ اندروید فعال است');
    const FS = cap.registerPlugin('Filesystem');
    await FS.writeFile({ path: f.name, data: await toB64(await getBlob(id)), directory: 'CACHE' });
    const { uri } = await FS.getUri({ path: f.name, directory: 'CACHE' });
    await cap.registerPlugin('Share').share({ title: f.title, url: uri, dialogTitle: 'ارسال فایل' });
  } catch (e) { if (!/cancel/i.test(String(e.message || e))) toast('ارسال نشد'); }
}

// ---------- ظاهر، منو و تنظیمات ----------
const FS = ['15px', '17px', '19px'], FSN = ['کوچک', 'متوسط', 'بزرگ'];
function applyPrefs() {
  document.body.classList.toggle('dark', store.get('dark') === '1');
  document.body.classList.toggle('min', store.get('min') === '1');
  document.documentElement.style.setProperty('--fs', FS[+store.get('fs') || 0]);
  $('#d_dk em')?.classList.toggle('on', store.get('dark') === '1');
  $('#d_min em')?.classList.toggle('on', store.get('min') === '1');
  $('#d_fs span').textContent = 'اندازه متن: ' + FSN[+store.get('fs') || 0];
}
const toggle = k => { store.set(k, store.get(k) === '1' ? '0' : '1'); applyPrefs(); };
function sheet(html) {
  const s = document.createElement('div'); s.className = 'sheet'; s.innerHTML = `<div>${html}</div>`;
  s.onclick = e => e.target === s && s.remove(); document.body.appendChild(s);
}
function initDrawer() {
  const it = (i, l, go, id, sw) => `<button class="it" ${go ? `data-go="${go}"` : ''} ${id ? `id="${id}"` : ''}>${ic(i)}<span>${l}</span>${sw ? '<em class="sw"></em>' : ''}</button>`;
  const d = document.createElement('div'); d.className = 'ov'; d.id = 'ov';
  d.innerHTML = `<div class="dr" role="dialog" aria-label="منو"><div class="dh"><b>راهنمای سازگان</b><small>مهندسی سازگان گستر</small></div>
  ${it('home', 'خانه', '#/')}${it('grid', 'همه محصولات', '#/products')}${it('save', 'فایل‌های ذخیره‌شده', '#/saved')}${it('book', 'نشانک‌ها', "#/saved?t=bm")}${it('help', 'آموزش بالینی', '#/learn')}<hr>
  ${it('moon', 'حالت شب', '', 'd_dk', 1)}${it('txt', 'اندازه متن', '', 'd_fs')}${it('dev', 'ظاهر مینیمال', '', 'd_min', 1)}${it('help', 'تماس با پشتیبانی', '', 'd_sp')}${it('info', 'درباره اپ', '', 'd_ab')}<div class="dv" id="dv"></div></div>`;
  document.body.appendChild(d);
  d.onclick = e => { if (e.target === d) closeDrawer(); const g = e.target.closest('[data-go]'); if (g) { closeDrawer(); location.hash = g.dataset.go; } };
  $('#d_dk').onclick = () => toggle('dark');
  $('#d_min').onclick = () => toggle('min');
  $('#d_fs').onclick = () => { store.set('fs', ((+store.get('fs') || 0) + 1) % 3); applyPrefs(); };
  $('#d_sp').onclick = () => { const s = cfg.support || {}; closeDrawer();
    if (s.phone) location.href = 'tel:' + s.phone; else if (s.email) location.href = 'mailto:' + s.email;
    else toast('اطلاعات تماس هنوز ثبت نشده است'); };
  $('#d_ab').onclick = () => { closeDrawer(); sheet(`<h2>راهنمای سازگان</h2><p>مهندسی سازگان گستر</p><p>نسخه ${fa(ver.version)} · ساخت ${fa(ver.build)}</p><p>${fa(ver.products)} محصول · ${fa(ver.files)} فایل · ${new Date(ver.date).toLocaleDateString('fa-IR-u-ca-persian')}</p>`); };
}
const openDrawer = () => $('#ov').classList.add('on');
const closeDrawer = () => $('#ov').classList.remove('on');
function markDrawer() { const h = location.hash.split('?')[0] || '#/'; document.querySelectorAll('.it[data-go]').forEach(b => b.classList.toggle('on', b.dataset.go.split('?')[0] === h && !(b.dataset.go.includes('t=bm') && !location.hash.includes('t=bm')) && !(h === '#/saved' && location.hash.includes('t=bm') && !b.dataset.go.includes('t=bm')))); }

// ---------- اجزای مشترک ----------
const bar = (title, back, extra = '', cls = '') => `<div class="bar ${cls}">${back ? `<button class="ib" id="bk" aria-label="بازگشت">${ic('back')}</button>` : `<button class="ib mn" id="mn" aria-label="منو">${ic('menu')}</button>`}<h1>${esc(title)}</h1>${extra}</div>`;
const NAVS = [['home', 'خانه', '#/'], ['grid', 'محصولات', '#/products'], ['search', 'جستجو', '#/s'], ['save', 'ذخیره‌شده‌ها', '#/saved']];
const nav = a => `<nav class="bn">${NAVS.map(([i, l, h]) => `<a href="${h}" aria-label="${l}" class="${a === h ? 'on' : ''}">${ic(i)}<span>${l}</span><i></i></a>`).join('')}</nav>`;
function screen(html, active) {
  app.innerHTML = html + (active ? nav(active) : '');
  $('#mn') && ($('#mn').onclick = openDrawer);
  $('#bk') && ($('#bk').onclick = () => (history.length > 1 ? history.back() : (location.hash = '#/')));
}
const fileCount = p => (p.files.length ? fa(p.files.length) + ' فایل' : 'فایلی اضافه نشده');
const prow = p => `<button class="row" data-s="${esc(p.slug)}"><div class="tile">${ic('dev')}</div><div><b>${esc(p.title)}</b><span>${fileCount(p)}${p.summary ? ' · ' + esc(p.summary) : ''}</span></div></button>`;
function plist(ps, grouped) {
  let last = null, h = '';
  for (const p of ps) { if (grouped && p.group && p.group !== last) { h += `<div class="g">${esc(p.group)}</div>`; last = p.group; } h += prow(p); }
  return h || '<div class="empty">محصولی پیدا نشد.</div>';
}
const wireProducts = root => root.querySelectorAll('[data-s]').forEach(b => (b.onclick = () => (location.hash = '#/p/' + b.dataset.s)));
function showResults(list, q, rs) {
  list.innerHTML = rs.length ? rs.map((r, i) => { const { f } = fileById(r.f); return `<button class="row" data-i="${i}"><div><b>${esc(f.title)} — صفحه ${fa(r.p)}</b><div class="snip">${snippet(r, q)}</div></div></button>`; }).join('') : `<div class="empty">نتیجه‌ای برای «${esc(q)}» پیدا نشد.</div>`;
  list.querySelectorAll('[data-i]').forEach(b => (b.onclick = () => { const r = rs[b.dataset.i]; location.hash = `#/r/${enc(r.f)}?p=${r.p}&q=${encodeURIComponent(q)}`; }));
}
function attachSearch(inp, list, restore) {
  let h;
  inp.oninput = e => { clearTimeout(h); h = setTimeout(() => { const q = e.target.value.trim(); q ? showResults(list, q, search(q)) : restore(); }, 200); };
}
const searchBox = (ph, id = 'q') => `<label class="search">${ic('search', 20)}<input id="${id}" type="search" placeholder="${ph}" autocomplete="off"></label>`;

// ---------- صفحه‌ها ----------
function home() {
  const rec = jget('recent', []).map(r => ({ r, m: fileById(r.id) })).filter(x => x.m).slice(0, 3);
  screen(`${bar('راهنمای سازگان')}<div class="wrap">${searchBox('جستجو در متن همه راهنماها')}<div id="list"></div><div class="ver">نسخه ${fa(ver.version)} (ساخت ${fa(ver.build)})</div></div>`, '#/');
  const list = $('#list');
  const draw = () => {
    list.innerHTML = (rec.length ? `<div class="g">اخیراً خوانده‌شده</div>` + rec.map(({ r, m }, i) => `<button class="row" data-rc="${i}"><div class="tile">${ic('book')}</div><div><b>${esc(m.f.title)}</b><span>${esc(m.p.title)} · صفحه ${fa(r.p)}</span></div></button>`).join('') : '') + plist(catalog.products, true);
    wireProducts(list);
    list.querySelectorAll('[data-rc]').forEach(b => (b.onclick = () => { const { r } = rec[b.dataset.rc]; location.hash = `#/r/${enc(r.id)}?p=${r.p}`; }));
  };
  attachSearch($('#q'), list, draw); draw();
}
function products() {
  const groups = {}; catalog.products.forEach(p => (groups[p.group || 'سایر'] ||= []).push(p));
  screen(`${bar('محصولات')}<div class="wrap">${Object.entries(groups).map(([g, ps]) => `<button class="row" data-g="${esc(g)}"><div class="tile">${ic('grid')}</div><div><b>${esc(g)}</b><span>${fa(ps.length)} محصول</span></div></button>`).join('')}</div>`, '#/products');
  app.querySelectorAll('[data-g]').forEach(b => (b.onclick = () => (location.hash = '#/g/' + encodeURIComponent(b.dataset.g))));
}
function group(g) {
  const ps = catalog.products.filter(p => (p.group || 'سایر') === g);
  screen(`${bar(g, true)}<div class="wrap">${plist(ps)}</div>`, '#/products'); wireProducts(app);
}
function searchPage() {
  screen(`${bar('جستجو')}<div class="wrap">${searchBox('جستجو در متن همه راهنماها')}<div id="list"><div class="empty">کلمه‌ای از متن راهنماها را بنویسید.</div></div></div>`, '#/s');
  attachSearch($('#q'), $('#list'), () => ($('#list').innerHTML = '<div class="empty">کلمه‌ای از متن راهنماها را بنویسید.</div>')); $('#q').focus();
}
function saved(tab) {
  const sv = jget('saved', []).filter(x => fileById(x.id)), bm = jget('bm', []).filter(x => fileById(x.id));
  const body = tab === 'bm'
    ? (bm.map((b, i) => { const m = fileById(b.id); return `<div class="row"><button class="tile" data-bo="${i}" aria-label="باز کردن">${ic('book')}</button><div><b>${esc(m.f.title)}</b><span>صفحه ${fa(b.p)} · ${esc(m.p.title)}</span></div><button class="mini" data-bd="${i}">حذف</button></div>`; }).join('') || '<div class="empty">هنوز نشانکی نگذاشته‌اید. در خواننده روی آیکن نشانک بزنید.</div>')
    : (sv.map((x, i) => { const m = fileById(x.id); return `<div class="row"><button class="tile" data-so="${i}" aria-label="باز کردن">${ic('save')}</button><div><b>${esc(m.f.title)}</b><span>${new Date(x.t).toLocaleDateString('fa-IR')} · ${esc(m.p.title)}</span></div><button class="mini" data-sh="${i}">ارسال</button></div>`; }).join('') || '<div class="empty">هنوز فایلی ذخیره نکرده‌اید.</div>');
  screen(`${bar('ذخیره‌شده‌ها')}<div class="wrap"><div class="seg"><a href="#/saved" class="${tab === 'bm' ? '' : 'on'}">فایل‌ها</a><a href="#/saved?t=bm" class="${tab === 'bm' ? 'on' : ''}">نشانک‌ها</a></div>${body}</div>`, '#/saved');
  app.querySelectorAll('[data-so]').forEach(b => (b.onclick = () => (location.hash = '#/r/' + enc(sv[b.dataset.so].id))));
  app.querySelectorAll('[data-sh]').forEach(b => (b.onclick = () => shareFile(sv[b.dataset.sh].id)));
  app.querySelectorAll('[data-bo]').forEach(b => (b.onclick = () => { const x = bm[b.dataset.bo]; location.hash = `#/r/${enc(x.id)}?p=${x.p}`; }));
  app.querySelectorAll('[data-bd]').forEach(b => (b.onclick = () => { const x = bm[b.dataset.bd]; jset('bm', jget('bm', []).filter(y => !(y.id === x.id && y.p === x.p))); saved('bm'); }));
}
function product(slug) {
  const p = catalog.products.find(x => x.slug === slug);
  if (!p) return (location.hash = '#/');
  screen(`${bar(p.title, true)}<div class="wrap">${p.summary ? `<p style="color:var(--mute)">${esc(p.summary)}</p>` : ''}${p.files.length ? '' : '<div class="empty">برای این محصول هنوز فایلی اضافه نشده است.</div>'}${p.files.map(f => `<div class="row"><button class="tile" data-o="${esc(f.id)}" aria-label="باز کردن">${ic('book')}</button><button style="flex:1;text-align:start" data-o="${esc(f.id)}"><b style="font-weight:500">${esc(f.title)}</b><br><span style="color:var(--mute);font-size:.78em">${fa(f.pages)} صفحه · ${fa((f.size / 1048576).toFixed(1))} مگابایت</span></button><button class="mini" data-d="${esc(f.id)}">ذخیره</button><button class="mini" data-h="${esc(f.id)}">ارسال</button></div>`).join('')}</div>`, '#/products');
  app.querySelectorAll('[data-o]').forEach(b => (b.onclick = () => (location.hash = '#/r/' + enc(b.dataset.o))));
  app.querySelectorAll('[data-d]').forEach(b => (b.onclick = () => saveFile(b.dataset.d)));
  app.querySelectorAll('[data-h]').forEach(b => (b.onclick = () => shareFile(b.dataset.h)));
}

// ---------- خواننده ----------
async function reader(id, params) {
  const meta = fileById(id);
  if (!meta) return (location.hash = '#/');
  const { f } = meta;
  screen(`${bar(f.title, true, `<button class="ib" id="fb" aria-label="جستجو در فایل">${ic('search')}</button><button class="ib" id="bm" aria-label="نشانک">${ic('book')}</button><button class="ib" id="sv" aria-label="ذخیره">${ic('save')}</button><button class="ib" id="sh" aria-label="ارسال">${ic('share')}</button>`, 'nob rd')}
  <div class="find" id="find"><input id="fq" type="search" placeholder="جستجو در این فایل"><small id="fc"></small><button class="mini" id="fp">قبلی</button><button class="mini" id="fn">بعدی</button></div>
  <div id="pages"></div><div class="pg"><input id="pn" type="number" min="1" max="${f.pages}" inputmode="numeric"><span>از ${fa(f.pages)}</span></div>`);
  $('#sv').onclick = () => saveFile(id); $('#sh').onclick = () => shareFile(id);

  const doc = await pdfjs.getDocument({ url: 'files/' + enc(id) }).promise;
  const base = (await doc.getPage(1)).getViewport({ scale: 1 });
  const box = $('#pages'), width = Math.min(window.innerWidth - 16, 900), scale = width / base.width;
  let q = params.get('q') || '', hits = [], cur = -1, curPage = 1;
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
    cv.width = Math.floor(vp.width * dpr); cv.height = Math.floor(vp.height * dpr); d.appendChild(cv);
    await page.render({ canvasContext: cv.getContext('2d'), viewport: vp, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null }).promise;
    const tl = document.createElement('div'); tl.className = 'textLayer';
    tl.style.setProperty('--scale-factor', scale); tl.style.setProperty('--total-scale-factor', scale); d.appendChild(tl);
    await new pdfjs.TextLayer({ textContentSource: page.streamTextContent(), container: tl, viewport: vp }).render();
    mark(d);
  }
  const mark = d => { const ts = terms(q); d.querySelectorAll('.textLayer span').forEach(s => s.classList.toggle('hit', !!ts.length && ts.some(t => norm(s.textContent).n.includes(t)))); };
  const io = new IntersectionObserver(es => es.forEach(e => e.isIntersecting && render(e.target)), { rootMargin: '800px 0px' });
  nodes.forEach(n => io.observe(n));

  const pn = $('#pn'); let raf;
  const go = (n, smooth) => { n = Math.max(1, Math.min(doc.numPages, n)); nodes[n - 1].scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' }); };
  const bmOn = () => jget('bm', []).some(b => b.id === id && b.p === curPage);
  const syncBm = () => $('#bm')?.classList.toggle('on', bmOn());
  window.onscroll = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => {
    let c = 1; for (const n of nodes) { if (n.getBoundingClientRect().top <= window.innerHeight * 0.4) c = +n.dataset.p; else break; }
    curPage = c; if (document.activeElement !== pn) pn.value = c; store.set('pg:' + id, c); syncBm();
    const rc = jget('recent', []).filter(x => x.id !== id); rc.unshift({ id, p: c }); jset('recent', rc.slice(0, 5)); }); };
  pn.onchange = () => go(+pn.value, true);
  $('#bm').onclick = () => { let b = jget('bm', []); if (bmOn()) { b = b.filter(x => !(x.id === id && x.p === curPage)); toast('نشانک حذف شد'); } else { b.unshift({ id, p: curPage }); toast('نشانک صفحه ' + fa(curPage) + ' ذخیره شد'); } jset('bm', b); syncBm(); };

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
  curPage = start; pn.value = start; syncBm(); requestAnimationFrame(() => go(start));
}

// ---------- بخش آموزش ----------
function mdRender(text) {
  const inl = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>');
  const lines = text.split('\n');
  let html = '', inList = false, inTable = false, inCode = false, codeBuf = [];
  const closeBlocks = () => {
    if (inList) { html += '</ul>'; inList = false; }
    if (inTable) { html += '</table>'; inTable = false; }
  };
  for (const line of lines) {
    if (/^```/.test(line)) {
      if (inCode) { html += '<pre><code>' + esc(codeBuf.join('\n')) + '</code></pre>'; codeBuf = []; inCode = false; }
      else { closeBlocks(); inCode = true; }
      continue;
    }
    if (inCode) { codeBuf.push(line); continue; }
    const imgM = line.match(/^!\[([^\]]*)\]\(([^)]+)\)\s*$/);
    if (imgM) {
      closeBlocks();
      html += `<figure class="art-fig"><img src="learn-images/${esc(imgM[2])}" alt="${inl(imgM[1])}" loading="lazy"><figcaption>${inl(imgM[1])}</figcaption></figure>`;
      continue;
    }
    if (/^### /.test(line)) { closeBlocks(); html += `<h3>${inl(line.slice(4))}</h3>`; }
    else if (/^## /.test(line)) { closeBlocks(); html += `<h2>${inl(line.slice(3))}</h2>`; }
    else if (/^# /.test(line)) { closeBlocks(); html += `<h1>${inl(line.slice(2))}</h1>`; }
    else if (/^> /.test(line)) { closeBlocks(); html += `<blockquote>${inl(line.slice(2))}</blockquote>`; }
    else if (/^---+\s*$/.test(line)) { closeBlocks(); html += '<hr>'; }
    else if (/^\s*- /.test(line)) {
      if (inTable) { html += '</table>'; inTable = false; }
      if (!inList) { html += '<ul>'; inList = true; }
      html += `<li${/^\s+/.test(line) ? ' class="sub"' : ''}>${inl(line.replace(/^\s*- /, ''))}</li>`;
    }
    else if (/^\|/.test(line)) {
      const cells = line.split('|').slice(1, -1).map(c => c.trim());
      if (/^[\s|:-]+$/.test(line)) continue;
      if (inList) { html += '</ul>'; inList = false; }
      if (!inTable) { html += '<table>'; inTable = true; html += '<thead><tr>' + cells.map(c => `<th>${inl(c)}</th>`).join('') + '</tr></thead><tbody>'; continue; }
      html += '<tr>' + cells.map(c => `<td>${inl(c)}</td>`).join('') + '</tr>';
    }
    else if (line.trim() === '') { closeBlocks(); }
    else { closeBlocks(); html += `<p>${inl(line)}</p>`; }
  }
  if (inCode) html += '<pre><code>' + esc(codeBuf.join('\n')) + '</code></pre>';
  closeBlocks();
  return html;
}
function learnList() {
  const arts = learn.articles || [];
  screen(`${bar('آموزش بالینی')}<div class="wrap">${arts.length ? arts.map(a => `<button class="row" data-l="${esc(a.slug)}"><div class="tile">${ic('help')}</div><div><b>${esc(a.title)}</b><span>مطالعه مقاله</span></div></button>`).join('') : '<div class="empty">هنوز مقاله‌ای اضافه نشده است.</div>'}</div>`, '#/learn');
  app.querySelectorAll('[data-l]').forEach(b => (b.onclick = () => (location.hash = '#/learn/' + encodeURIComponent(b.dataset.l))));
}
function learnDetail(slug) {
  const a = (learn.articles || []).find(x => x.slug === slug);
  if (!a) return (location.hash = '#/learn');
  screen(`${bar(a.title, true)}<div class="wrap"><article class="article">${mdRender(a.body)}</article></div>`, '#/learn');
}
// ---------- مسیریابی ----------
async function route() {
  window.onscroll = null; window.scrollTo(0, 0); closeDrawer();
  await load();
  const [path, qs] = location.hash.slice(1).split('?'), parts = path.split('/').filter(Boolean).map(decodeURIComponent), P = new URLSearchParams(qs || '');
  if (parts[0] === 'p') product(parts[1]);
  else if (parts[0] === 'g') group(parts[1]);
  else if (parts[0] === 'r') await reader(parts.slice(1).join('/'), P);
  else if (parts[0] === 'products') products();
  else if (parts[0] === 's') searchPage();
  else if (parts[0] === 'saved') saved(P.get('t'));
  else if (parts[0] === 'learn') parts[1] ? learnDetail(parts[1]) : learnList();
  else home();
  markDrawer();
}
initDrawer(); applyPrefs();
addEventListener('hashchange', route);
route();
