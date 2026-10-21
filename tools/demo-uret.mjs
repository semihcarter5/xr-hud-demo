// Satış demosu üreticisi: bir işletme brif'inden (JSON) o işletmeye özel AR Ürün Kartı ön izlemesi ve teklif taslağı üretir.
//
// Kullanım:
//   node tools/demo-uret.mjs <brif.json>              → kartı hazırlar (yayınlamaz), teklif taslağını brif'in yanına yazar
//   node tools/demo-uret.mjs <brif.json> --yayinla    → hazırlar ve GitHub Pages'e gönderir (commit + push)
//   node tools/demo-uret.mjs --sil <slug> [--yayinla] → bir ön izlemeyi (kart + model) kaldırır
//
// Brif örneği: tools/brif-ornegi.json
import { readFileSync, writeFileSync, copyFileSync, existsSync, statSync, mkdirSync, rmSync, openSync, readSync, closeSync } from 'node:fs';
import { dirname, join, resolve, extname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://semihcarter5.github.io/xr-hud-demo/';
const MAX_MODEL_MB = 15;
const args = process.argv.slice(2);
const publish = args.includes('--yayinla');

function fail(msg) { console.error('HATA: ' + msg); process.exit(1); }
function git(...a) { return execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }); }

// Türkçe karakterleri sadeleştirip URL'de kullanılabilir kısa ad üretir
function slugify(s) {
  const map = { ç: 'c', ğ: 'g', ı: 'i', İ: 'i', ö: 'o', ş: 's', ü: 'u', Ç: 'c', Ğ: 'g', Ö: 'o', Ş: 's', Ü: 'u' };
  return s.replace(/[çğıİöşüÇĞÖŞÜ]/g, c => map[c]).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
}
const isHex = c => /^#[0-9a-f]{6}$/i.test(c || '');
const tl = n => n.toLocaleString('tr-TR') + ' TL';

// --- Silme modu ---
const silIdx = args.indexOf('--sil');
if (silIdx >= 0) {
  const slug = (args[silIdx + 1] || '').replace(/[^a-z0-9-]/g, '');
  if (!slug) fail('Silinecek ön izlemenin adını yaz: --sil <slug>');
  const files = [join(ROOT, 'kart/urunler', slug + '.json'), join(ROOT, 'kart/modeller', slug + '.glb')].filter(existsSync);
  if (!files.length) fail(`"${slug}" adlı ön izleme bulunamadı`);
  for (const f of files) rmSync(f);
  console.log(`Silindi: ${slug} (${files.length} dosya)`);
  if (publish) { git('add', '-A', 'kart'); git('commit', '-q', '-m', `Ön izleme kaldırıldı: ${slug}`); git('push', '-q'); console.log('Yayından kaldırıldı.'); }
  process.exit(0);
}

// --- Brif'i oku ve doğrula ---
const briefPath = args.find(a => !a.startsWith('--'));
if (!briefPath) fail('Brif dosyasını ver: node tools/demo-uret.mjs <brif.json>');
let b;
try { b = JSON.parse(readFileSync(briefPath, 'utf8')); } catch (e) { fail('Brif okunamadı: ' + e.message); }
const u = b.urun || {};
if (!b.isletme) fail('"isletme" (işletme adı) eksik');
if (!u.ad) fail('"urun.ad" (ürün adı) eksik');
if (u.fiyat !== undefined && !(typeof u.fiyat === 'number' && u.fiyat >= 0)) fail('"urun.fiyat" sayı olmalı (ör. 12900)');
if (b.renk && !isHex(b.renk)) fail('"renk" #rrggbb biçiminde olmalı (ör. #b5652e)');
if (!b.model) fail('"model" eksik: .glb dosya yolu ya da https:// adresi');
if (b.satin_al_link && !/^https:\/\//.test(b.satin_al_link)) fail('"satin_al_link" https:// ile başlamalı');
for (const s of b.secenekler || []) if (!s.ad || !isHex(s.renk)) fail('Her seçenekte "ad" ve #rrggbb "renk" olmalı');

const slug = `${slugify(b.isletme)}-${slugify(u.ad)}-${randomBytes(2).toString('hex')}`.slice(0, 60);
const days = Number.isFinite(b.sure_gun) ? b.sure_gun : 30;
const until = new Date(Date.now() + days * 864e5).toISOString().slice(0, 10);

// --- Model: yerel dosyaysa kontrol edip kopyala, adresse olduğu gibi kullan ---
let modelSrc;
if (/^https:\/\//.test(b.model)) modelSrc = b.model;
else {
  const p = resolve(dirname(briefPath), b.model);
  if (!existsSync(p)) fail('Model dosyası bulunamadı: ' + p);
  if (extname(p).toLowerCase() !== '.glb') fail('Model .glb olmalı (tek dosyalık glTF)');
  const mb = statSync(p).size / 1048576;
  if (mb > MAX_MODEL_MB) fail(`Model ${mb.toFixed(1)} MB; telefonda yavaş açılır. ${MAX_MODEL_MB} MB altına küçült`);
  const fd = openSync(p, 'r'), head = Buffer.alloc(4); readSync(fd, head, 0, 4, 0); closeSync(fd);
  if (head.toString('latin1') !== 'glTF') fail('Dosya geçerli bir .glb değil');
  mkdirSync(join(ROOT, 'kart/modeller'), { recursive: true });
  copyFileSync(p, join(ROOT, 'kart/modeller', slug + '.glb'));
  modelSrc = 'modeller/' + slug + '.glb';
}

// --- Kart verisi (kart/urunler/<slug>.json) ---
const card = {
  preview: { for: b.isletme, until },
  brand: { name: b.isletme, tagline: b.slogan || '', accent: b.renk || '#b5652e' },
  product: { name: u.ad, price: u.fiyat, currency: u.para || 'TRY', description: u.aciklama || '', features: u.ozellikler || [], dimensions: u.olculer || '' },
  variantLabel: b.secenekler_baslik || 'Seçenek',
  variants: (b.secenekler || []).map(s => ({ name: s.ad, modelVariant: s.model_varyant || '', swatch: s.renk, priceDelta: s.fiyat_farki || 0 })),
  model: { src: modelSrc, alt: u.ad, cameraOrbit: b.kamera || '30deg 75deg auto' },
  cta: { label: 'Satın al', url: b.satin_al_link || '' },
  credit: b.model_kaynak ? { prefix: '', text: b.model_kaynak } : undefined,
};
if (u.fiyat === undefined) delete card.product.price;
writeFileSync(join(ROOT, 'kart/urunler', slug + '.json'), JSON.stringify(card, null, 2) + '\n');
const link = `${SITE}kart/?u=${slug}`;

// --- Teklif taslağı (göndermeden önce mutlaka oku ve düzelt) ---
const hitap = b.kisi ? `Merhaba ${b.kisi},` : 'Merhaba,';
const kisa = ['instagram', 'whatsapp'].includes((b.kanal || '').toLowerCase());
const teklif = kisa
  ? `${hitap}\n\n${b.isletme} için "${u.ad}" ürününüzü telefonda AR olarak hazırladım: müşteriniz ürünü kendi odasında, gerçek boyutunda görebiliyor. Uygulama gerekmiyor:\n\n${link}\n\nBeğenirseniz ürün sayfanıza ve sosyal medyanıza ekleyebilirim. Ürün başı ${tl(3500)}; ilk 5 işletmeye %30 indirim uyguluyorum.\n\nİyi çalışmalar.`
  : `Konu: ${u.ad} ürününüz için ücretsiz AR ön izlemesi\n\n${hitap}\n\n${b.isletme} için "${u.ad}" ürününüzün artırılmış gerçeklik (AR) ön izlemesini hazırladım. Müşteriniz bu bağlantıyı telefonunda açıp "Kendi odanda gör" düğmesine dokununca ürünü kendi evinde, gerçek boyutunda görebiliyor. iPhone ve Android'de uygulama gerekmiyor:\n\n${link}\n\nBu ön izleme ${until} tarihine kadar açık kalacak. Beğenirseniz:\n- Tek ürün: ${tl(3500)}\n- 10 ürünlük AR katalog: ${tl(24000)}\n(KDV hariç; ilk 5 işletmeye %30 kurucu müşteri indirimi)\n\nKısa bir görüşme için uygun bir zamanınızı yazabilirsiniz.\n\nSaygılarımla`;
const teklifPath = join(dirname(resolve(briefPath)), `teklif-${slug}.txt`);
writeFileSync(teklifPath, teklif + '\n');

if (publish) {
  git('add', 'kart/urunler/' + slug + '.json', ...(modelSrc.startsWith('modeller/') ? ['kart/modeller/' + slug + '.glb'] : []));
  git('commit', '-q', '-m', `Ön izleme: ${b.isletme} · ${u.ad}`);
  git('push', '-q');
}

console.log(`Hazır: ${b.isletme} · ${u.ad}`);
console.log(`  Kart adı : ${slug}`);
console.log(`  Link     : ${link}${publish ? '' : '   (henüz yayınlanmadı: --yayinla ile gönder)'}`);
console.log(`  Bitiş    : ${until}`);
console.log(`  Teklif   : ${teklifPath}`);
console.log('Not: Teklifi göndermeden önce oku. Ticari ileti kurallarına (İYS) uy; ön izlemeyi yalnızca o işletmeyle paylaş.');
