// Archivo para subir como versión del script en Partners (LogiTrack2, sin instalación automática).
// Carga la versión publicada en geomodi.ai, así los cambios no requieren otra versión en Partners.
(function () {
  if (!window.LS || String(LS.store && LS.store.id) !== '7570182') return;
  var s = document.createElement('script');
  s.src = 'https://www.geomodi.ai/cross-selling/completa-tu-equipo.js?v=' + Math.floor(Date.now() / 300000);
  s.async = true;
  document.head.appendChild(s);
})();
