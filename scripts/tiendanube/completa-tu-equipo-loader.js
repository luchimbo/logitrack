// Archivo para subir como versión del script en Partners (LogiTrack2, sin instalación automática).
// Sólo carga en las tiendas habilitadas; en cualquier otra no hace nada.
// Carga la versión publicada en geomodi.ai, así los cambios no requieren otra versión en Partners.
(function () {
  if (!window.LS || ['7570182', '78394'].indexOf(String(LS.store && LS.store.id)) < 0) return;
  var s = document.createElement('script');
  s.src = 'https://www.geomodi.ai/cross-selling/completa-tu-equipo.js?v=' + Math.floor(Date.now() / 300000);
  s.async = true;
  document.head.appendChild(s);
})();
