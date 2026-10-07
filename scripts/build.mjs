// ساخت محتوای اپ: کپی PDFها، استخراج متن برای جستجو و ساخت catalog.json
// ورودی: پوشه content/<slug>/ شامل product.json و فایل‌های PDF
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const W = (...p) => path.join(root, 'www', ...p);
const NM = (...p) => path.join(root, 'node_modules', ...p);

for (const d of ['lib', 'files', 'data', 'fonts']) fs.rmSync(W(d), { recursive: true, force: true });
for (const d of ['lib', 'files', 'data', 'fonts']) fs.mkdirSync(W(d), { recursive: true });

// کتابخانه PDF و فونت وزیرمتن (آفلاین)
for (const f of ['pdf.min.mjs', 'pdf.worker.min.mjs'])
  fs.copyFileSync(NM('pdfjs-dist/legacy/build', f), W('lib', f));
for (const f of ['Vazirmatn-Regular.woff2', 'Vazirmatn-Medium.woff2', 'Vazirmatn-Bold.woff2'])
  fs.copyFileSync(NM('vazirmatn/fonts/webfonts', f), W('fonts', f));

const contentDir = path.join(root, 'content');
const slugs = fs.readdirSync(contentDir).filter(d => fs.statSync(path.join(contentDir, d)).isDirectory()).sort();

const catalog = { products: [] };
const index = [];

for (const slug of slugs) {
  const dir = path.join(contentDir, slug);
  const metaPath = path.join(dir, 'product.json');
  const meta = fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath, 'utf8')) : {};
  const pdfs = fs.readdirSync(dir).filter(f => f.toLowerCase().endsWith('.pdf')).sort();
  const product = { slug, title: meta.title || slug, summary: meta.summary || '', group: meta.group || '', files: [] };
  fs.mkdirSync(W('files', slug), { recursive: true });

  for (const name of pdfs) {
    const id = `${slug}/${name}`;
    fs.copyFileSync(path.join(dir, name), W('files', slug, name));
    const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(path.join(dir, name))), useSystemFonts: true }).promise;
    for (let p = 1; p <= doc.numPages; p++) {
      const tc = await (await doc.getPage(p)).getTextContent();
      const t = tc.items.map(i => i.str).join(' ').normalize('NFKC').replace(/[\u200e\u200f\u202a-\u202e]/g, '').replace(/\s+/g, ' ').trim();
      if (t) index.push({ f: id, p, t });
    }
    const title = (meta.titles && meta.titles[name]) || name.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ');
    product.files.push({ id, name, title, pages: doc.numPages, size: fs.statSync(path.join(dir, name)).size });
    console.log(`✓ ${id} (${doc.numPages} صفحه)`);
  }
  catalog.products.push(product);
}

const version = {
  version: (process.env.APP_VERSION || fs.readFileSync(path.join(root, 'VERSION'), 'utf8')).trim(),
  build: process.env.APP_BUILD || 'dev',
  date: new Date().toISOString(),
  products: catalog.products.length,
  files: catalog.products.reduce((a, p) => a + p.files.length, 0)
};
fs.writeFileSync(W('data', 'app.json'), fs.existsSync(path.join(contentDir, 'app.json')) ? fs.readFileSync(path.join(contentDir, 'app.json')) : '{}');
fs.writeFileSync(W('data', 'version.json'), JSON.stringify(version));
fs.writeFileSync(W('data', 'catalog.json'), JSON.stringify(catalog));
fs.writeFileSync(W('data', 'index.json'), JSON.stringify(index));
console.log(`محصول: ${catalog.products.length} | صفحه‌های ایندکس‌شده: ${index.length}`);
