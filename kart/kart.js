// AR Ürün Kartı şablonu: ?u=<ürün> ile urunler/<ürün>.json dosyasını okur ve sayfayı doldurur.
// Yeni müşteri için sadece bir JSON dosyası ve bir .glb model eklemek yeterlidir.
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var mv = $('mv');
  var slug = (new URLSearchParams(location.search).get('u') || 'koltuk').replace(/[^a-z0-9-]/gi, '');
  var data = null, current = null;

  function toast(msg) {
    var t = $('toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toast.timer); toast.timer = setTimeout(function () { t.hidden = true; }, 2200);
  }
  function money(n, cur) { return n.toLocaleString('tr-TR') + (cur === 'USD' ? ' $' : ' TL'); }
  // Güvenli metin: JSON'daki yazılar HTML olarak değil düz metin olarak basılır
  function text(el, s) { el.textContent = s || ''; }

  // Ön izleme süresi dolduysa (satın alınmadıysa) model yüklenmez
  function expired() {
    var until = data.preview && data.preview.until;
    return !!until && new Date(until + 'T23:59:59') < new Date();
  }

  function render() {
    var b = data.brand || {}, p = data.product || {}, m = data.model || {};
    if (data.preview) {
      $('preview').hidden = false;
      text($('preview'), data.preview.for + ' için hazırlanmış özel ön izleme · yayında değildir');
      if (expired()) {
        text($('preview'), 'Bu ön izlemenin süresi doldu');
        text($('name'), 'Ön izleme süresi doldu'); text($('desc'), 'Bu bağlantı artık kullanılmıyor. Yeni bir ön izleme için bizimle iletişime geçin.');
        mv.remove(); return;
      }
    }
    document.title = p.name + ' · ' + b.name;
    $('example').hidden = !data.example;
    if (b.accent) document.documentElement.style.setProperty('--accent', b.accent);
    text($('brandName'), b.name); text($('brandTag'), b.tagline);
    text($('name'), p.name); text($('desc'), p.description);
    var ul = $('features'); ul.innerHTML = '';
    (p.features || []).forEach(function (f) { var li = document.createElement('li'); li.textContent = f; ul.appendChild(li); });
    if (p.dimensions) { $('dims').hidden = false; text($('dims'), 'Ölçüler: ' + p.dimensions + ' · AR’da gerçek boyutunda yerleşir'); }
    mv.alt = m.alt || p.name;
    if (m.cameraOrbit) mv.cameraOrbit = m.cameraOrbit;
    if (m.exposure) mv.exposure = m.exposure;
    if (m.arPlacement) mv.arPlacement = m.arPlacement; // duvar ürünleri için 'wall'
    mv.src = m.src;
    // Seçenekler (renk/kumaş): modeldeki varyantlar ve fiyat farkı
    var vs = data.variants || [];
    $('variantsBox').hidden = vs.length === 0;
    text($('variantLabel'), data.variantLabel || 'Seçenek');
    var box = $('swatches'); box.innerHTML = '';
    vs.forEach(function (v, i) {
      var btn = document.createElement('button');
      btn.type = 'button'; btn.className = 'swatch'; btn.setAttribute('role', 'radio');
      var dot = document.createElement('i'); dot.style.background = v.swatch;
      btn.appendChild(dot); btn.appendChild(document.createTextNode(v.name));
      btn.onclick = function () { pick(i); };
      box.appendChild(btn);
    });
    if (vs.length) pick(0); else updatePrice();
    // Satın al / iletişim
    var cta = $('cta');
    if (data.cta && data.cta.url && /^https:\/\//.test(data.cta.url)) { cta.href = data.cta.url; text(cta, data.cta.label || 'Satın al'); cta.hidden = false; }
    // Model lisans / kaynak bilgisi
    var cr = $('credit'); cr.innerHTML = '';
    if (data.credit) {
      cr.appendChild(document.createTextNode(data.credit.prefix !== undefined ? data.credit.prefix : '3D model: '));
      if (data.credit.url && /^https:\/\//.test(data.credit.url)) {
        var a = document.createElement('a'); a.href = data.credit.url; a.target = '_blank'; a.rel = 'noopener'; a.textContent = data.credit.text; cr.appendChild(a);
      } else cr.appendChild(document.createTextNode(data.credit.text));
    }
  }

  function pick(i) {
    current = data.variants[i];
    Array.prototype.forEach.call($('swatches').children, function (el, k) { el.setAttribute('aria-checked', String(k === i)); });
    if (current.modelVariant && mv.availableVariants && mv.availableVariants.indexOf(current.modelVariant) >= 0) mv.variantName = current.modelVariant;
    updatePrice();
  }
  function updatePrice() {
    var p = data.product;
    if (typeof p.price !== 'number') { $('price').hidden = true; return; }
    text($('price'), money(p.price + (current && current.priceDelta || 0), p.currency));
  }

  // Model yükleme durumu
  mv.addEventListener('progress', function (e) { $('bar').style.width = Math.round(e.detail.totalProgress * 100) + '%'; });
  mv.addEventListener('load', function () {
    $('bar').parentElement.hidden = true;
    if (current && current.modelVariant) mv.variantName = current.modelVariant; // varyantlar model yüklenince hazır olur
    window.__kart.loaded = true;
  });
  mv.addEventListener('error', function () { $('loadErr').hidden = false; });
  // AR desteklenmiyorsa (bilgisayar) telefonla açmak için QR göster
  mv.addEventListener('load', function () {
    var canAr = mv.canActivateAR;
    $('qrBox').hidden = canAr;
    if (!canAr && window.QRCode && !$('qr').hasChildNodes()) new QRCode($('qr'), { text: location.href, width: 224, height: 224, correctLevel: QRCode.CorrectLevel.M });
  });
  mv.addEventListener('ar-status', function (e) { if (e.detail.status === 'failed') toast('AR açılamadı; telefonda Chrome veya Safari ile dene'); });

  $('share').onclick = function () {
    var done = function () { toast('Link kopyalandı'); };
    if (navigator.clipboard) navigator.clipboard.writeText(location.href).then(done, function () { prompt('Linki kopyala:', location.href); });
  };

  window.__kart = { get data() { return data; }, mv: mv, pick: pick, loaded: false };
  fetch('urunler/' + slug + '.json', { cache: 'no-store' })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (j) { data = j; render(); })
    .catch(function () { text($('name'), 'Ürün bulunamadı'); text($('desc'), 'Bu bağlantıdaki ürün kaldırılmış ya da adres hatalı.'); $('loadErr').hidden = true; });
})();
