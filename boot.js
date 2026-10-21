// Telefonda sorun olursa sebebi ekranda görünsün (geliştirici konsolu olmadan)
(function () {
  var boot = document.getElementById('boot');
  var fatal = false;
  function show(msg, hint) {
    if (fatal) return; // asıl sebebi gösteren mesaj, arkasından gelen hatalarla ezilmesin
    boot.hidden = false;
    boot.className = 'err';
    boot.textContent = msg + '\n\n' + (hint || 'Sayfayı yenile. Düzelmezse Chrome ile aç ve bu yazının ekran görüntüsünü gönder.') + '\n(Kapatmak için dokun)';
    boot.onclick = function () { boot.hidden = true; };
  }
  // 3D grafik (WebGL) yoksa demo hiç çalışamaz: açıkça söyle
  var c = document.createElement('canvas');
  if (!(c.getContext('webgl2') || c.getContext('webgl'))) {
    show('Bu cihaz veya tarayıcı 3D grafiği (WebGL) desteklemiyor.',
      'Güncel Chrome, Safari, Edge ya da Firefox ile dene. Tarayıcı ayarlarında "donanım hızlandırma" kapalıysa aç.');
    fatal = true;
  }
  addEventListener('error', function (e) { show('Hata: ' + (e.message || 'dosya yüklenemedi')); });
  addEventListener('unhandledrejection', function (e) { show('Hata: ' + (e.reason && e.reason.message || e.reason)); });
  setTimeout(function () { if (!window.__hud) show('Demo 15 saniyede açılamadı.\nTarayıcı: ' + navigator.userAgent); }, 15000);
})();
