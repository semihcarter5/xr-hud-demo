// Telefonda sorun olursa sebebi ekranda görünsün (geliştirici konsolu olmadan)
(function () {
  var boot = document.getElementById('boot');
  function show(msg) {
    boot.hidden = false;
    boot.className = 'err';
    boot.textContent = msg + '\n\nSayfayı yenile. Düzelmezse Chrome ile aç ve bu yazının ekran görüntüsünü gönder.\n(Kapatmak için dokun)';
    boot.onclick = function () { boot.hidden = true; };
  }
  addEventListener('error', function (e) { show('Hata: ' + (e.message || 'dosya yüklenemedi')); });
  addEventListener('unhandledrejection', function (e) { show('Hata: ' + (e.reason && e.reason.message || e.reason)); });
  setTimeout(function () { if (!window.__hud) show('Demo 15 saniyede açılamadı.\nTarayıcı: ' + navigator.userAgent); }, 15000);
})();
