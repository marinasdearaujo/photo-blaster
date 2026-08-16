/* Modo de comentários — Fábio Dombrate
   Ativa com ?review=1 na URL. Toque em qualquer ponto do site deixa um pin.

   NOVO: os comentários agora ficam salvos no Firebase (Realtime Database),
   então são acessíveis de qualquer navegador/aparelho.
   Painel para ver tudo: /comentarios/
   Migra automaticamente os comentários antigos do localStorage na 1ª abertura. */
(function () {
  var DB   = 'https://rifa-mae-default-rtdb.firebaseio.com/photoblaster/comentarios';
  var KEY  = 'fd_review_on';           // liga/desliga o modo
  var LKEY = 'fd_review_comments';     // comentários antigos (localStorage) p/ migrar
  var AKEY = 'fd_review_author';       // nome de quem comenta (guardado no aparelho)
  var MKEY = 'fd_review_migrated_v2';  // flag de migração feita

  var params = new URLSearchParams(location.search);
  if (params.get('review') === '1') localStorage.setItem(KEY, '1');
  if (params.get('review') === '0') { localStorage.removeItem(KEY); }
  if (localStorage.getItem(KEY) !== '1') return;

  var path = location.pathname.replace(/index\.html$/, '') || '/';
  var comments = [];      // {id,n,path,x,y,text,author,ts,resolved,_synced}
  var seq = 0;
  var curPop = null;

  // ---------------- helpers de banco (REST, sem SDK) ----------------
  function dbAll(cb) {
    fetch(DB + '.json').then(function (r) { return r.json(); }).then(function (obj) {
      var arr = [];
      if (obj) Object.keys(obj).forEach(function (id) {
        var c = obj[id]; if (!c) return; c.id = id; c._synced = true; arr.push(c);
      });
      cb(arr);
    }).catch(function () { cb(null); });
  }
  function dbPut(c) {
    var payload = { n: c.n, path: c.path, x: c.x, y: c.y, text: c.text,
                    author: c.author || '', ts: c.ts || Date.now(), resolved: !!c.resolved };
    return fetch(DB + '/' + c.id + '.json', { method: 'PUT', body: JSON.stringify(payload) })
      .then(function () { c._synced = true; })
      .catch(function () { toast('Sem conexão — tentando de novo…'); setTimeout(function () { dbPut(c); }, 4000); });
  }
  function dbDel(id) {
    return fetch(DB + '/' + id + '.json', { method: 'DELETE' }).catch(function () {});
  }
  function genId() { return 'c_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7); }
  function getAuthor() {
    var a = localStorage.getItem(AKEY);
    if (!a) { a = (prompt('Seu nome (pra identificar os comentários):', 'Fábio') || 'Fábio').trim(); localStorage.setItem(AKEY, a); }
    return a;
  }

  // ---------------- estilos ----------------
  var css = ''
    + '.rv-bar{position:fixed;top:0;left:0;right:0;z-index:100000;background:#17140f;color:#f6f2ea;'
    + 'display:flex;align-items:center;gap:10px;padding:10px 14px;font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:13px;box-shadow:0 2px 14px rgba(0,0,0,.25)}'
    + '.rv-bar .t{font-weight:700;color:#f5b62e;white-space:nowrap}'
    + '.rv-bar .h{color:#b8b2a5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'
    + '.rv-bar .sp{flex:1}'
    + '.rv-btn{background:transparent;border:1px solid #4a463d;color:#e9e4d8;border-radius:6px;padding:7px 12px;font-size:12.5px;font-weight:600;cursor:pointer;white-space:nowrap;text-decoration:none;display:inline-block}'
    + '.rv-btn.p{background:#bf5a2c;border-color:#bf5a2c;color:#fff}'
    + '.rv-btn:active{transform:translateY(1px)}'
    + 'body{padding-top:44px!important}'
    + '.rv-pin{position:absolute;z-index:99998;width:28px;height:28px;margin:-28px 0 0 -14px;border-radius:50% 50% 50% 2px;'
    + 'background:#bf5a2c;color:#fff;font:700 13px/28px -apple-system,sans-serif;text-align:center;cursor:pointer;'
    + 'box-shadow:0 3px 10px rgba(0,0,0,.3);transform:rotate(-2deg)}'
    + '.rv-pin.done{background:#5a7d4a;opacity:.7}'
    + '.rv-pop{position:absolute;z-index:99999;width:250px;background:#fff;border:1px solid #e2dacb;border-radius:12px;'
    + 'box-shadow:0 12px 40px rgba(0,0,0,.25);padding:12px;font-family:-apple-system,Segoe UI,Roboto,sans-serif}'
    + '.rv-pop textarea{width:100%;min-height:70px;border:1px solid #e2dacb;border-radius:8px;padding:9px;font-size:14px;font-family:inherit;resize:vertical;color:#17140f;box-sizing:border-box}'
    + '.rv-pop textarea:focus{outline:none;border-color:#bf5a2c}'
    + '.rv-pop .who{font-size:11.5px;color:#8a8577;margin:2px 1px 8px}'
    + '.rv-pop .row{display:flex;gap:8px;margin-top:9px;justify-content:space-between;align-items:center}'
    + '.rv-pop .del{color:#a33;background:none;border:none;font-size:12.5px;cursor:pointer}'
    + '.rv-pop .save{background:#17140f;color:#fff;border:none;border-radius:7px;padding:8px 16px;font-size:13px;font-weight:600;cursor:pointer}'
    + '.rv-toast{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:100001;background:#17140f;color:#f6f2ea;'
    + 'padding:11px 18px;border-radius:9px;font-family:-apple-system,sans-serif;font-size:13px;box-shadow:0 6px 24px rgba(0,0,0,.3)}';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  // ---------------- barra superior ----------------
  var bar = document.createElement('div');
  bar.className = 'rv-bar';
  bar.innerHTML = '<span class="t">💬 Comentários</span>'
    + '<span class="h">Toque em qualquer ponto do site para comentar</span>'
    + '<span class="sp"></span>'
    + '<a class="rv-btn" id="rv-panel" href="/comentarios/" target="_blank">📋 Painel</a>'
    + '<button class="rv-btn p" id="rv-send">Enviar pra Marina</button>'
    + '<button class="rv-btn" id="rv-exit">Sair</button>';
  document.body.appendChild(bar);

  function toast(msg) {
    var t = document.createElement('div'); t.className = 'rv-toast'; t.textContent = msg;
    document.body.appendChild(t); setTimeout(function () { t.remove(); }, 2200);
  }

  function renderPins() {
    Array.prototype.slice.call(document.querySelectorAll('.rv-pin')).forEach(function (e) { e.remove(); });
    comments.filter(function (c) { return c.path === path; }).forEach(function (c) {
      var pin = document.createElement('div');
      pin.className = 'rv-pin' + (c.resolved ? ' done' : '');
      pin.textContent = c.n;
      pin.style.left = c.x + '%'; pin.style.top = c.y + 'px';
      pin.addEventListener('click', function (e) { e.stopPropagation(); openPop(c); });
      document.body.appendChild(pin);
    });
  }

  function closePop() { if (curPop) { curPop.remove(); curPop = null; } }
  function openPop(c, isNew) {
    closePop();
    var pop = document.createElement('div'); pop.className = 'rv-pop'; curPop = pop;
    var top = c.y + 6, left = Math.min(window.innerWidth * (c.x / 100) + 8, (document.documentElement.clientWidth - 262));
    pop.style.top = top + 'px'; pop.style.left = Math.max(8, left) + 'px';
    pop.innerHTML = '<div class="who">' + (c.author ? ('por ' + c.author) : '') + '</div>'
      + '<textarea placeholder="Escreve teu comentário aqui...">' + (c.text || '') + '</textarea>'
      + '<div class="row"><button class="del">Excluir</button><button class="save">Salvar</button></div>';
    document.body.appendChild(pop);
    var ta = pop.querySelector('textarea'); ta.focus();
    pop.querySelector('.save').addEventListener('click', function () {
      var val = ta.value.trim();
      if (!val) {                       // sem texto = descarta
        comments = comments.filter(function (x) { return x !== c; });
        if (c._synced) dbDel(c.id);
        closePop(); renderPins(); return;
      }
      if (!c.author) c.author = getAuthor();
      c.text = val;
      dbPut(c);
      closePop(); renderPins(); toast('Comentário salvo ✓');
    });
    pop.querySelector('.del').addEventListener('click', function () {
      comments = comments.filter(function (x) { return x !== c; });
      if (c._synced) dbDel(c.id);
      closePop(); renderPins();
    });
    pop.addEventListener('click', function (e) { e.stopPropagation(); });
    if (isNew) { /* pin novo já está na lista local; só grava quando salvar com texto */ }
  }

  // clique no site = novo pin
  document.addEventListener('click', function (e) {
    if (e.target.closest('.rv-bar') || e.target.closest('.rv-pop') || e.target.closest('.rv-pin')) return;
    if (e.target.closest('a,button')) { e.preventDefault(); } // não navega, mas deixa comentar
    closePop();
    var c = { id: genId(), n: ++seq, path: path,
      x: +(e.pageX / document.documentElement.scrollWidth * 100).toFixed(2),
      y: Math.round(e.pageY), text: '', author: '', ts: Date.now(), resolved: false, _synced: false };
    comments.push(c); renderPins(); openPop(c, true);
  }, true);

  // ---------------- exportar pra WhatsApp (continua existindo) ----------------
  function compile() {
    var withText = comments.filter(function (c) { return (c.text || '').trim(); });
    if (!withText.length) return '';
    var byPath = {};
    withText.forEach(function (c) { (byPath[c.path] = byPath[c.path] || []).push(c); });
    var names = { '/': 'Início', '/ensaios/': 'Ensaios', '/sobre/': 'Sobre', '/ebook/': 'O Manual', '/manual/': 'O Manual' };
    var out = 'COMENTÁRIOS DO SITE — Fábio Dombrate\n';
    Object.keys(byPath).forEach(function (p) {
      out += '\n[' + (names[p] || p) + ']\n';
      byPath[p].sort(function (a, b) { return a.n - b.n; }).forEach(function (c) {
        out += '• ' + c.text + (c.resolved ? ' (resolvido)' : '') + '\n';
      });
    });
    return out;
  }
  document.getElementById('rv-send').addEventListener('click', function (e) {
    e.stopPropagation();
    var txt = compile();
    if (!txt) { toast('Nenhum comentário ainda'); return; }
    window.location.href = 'https://wa.me/?text=' + encodeURIComponent(txt);
  });
  document.getElementById('rv-exit').addEventListener('click', function (e) {
    e.stopPropagation();
    localStorage.removeItem(KEY);
    location.href = location.pathname;
  });

  // ---------------- migração dos comentários antigos (localStorage -> Firebase) ----------------
  function migrateOld(done) {
    if (localStorage.getItem(MKEY)) { done(); return; }
    var old = [];
    try { old = JSON.parse(localStorage.getItem(LKEY) || '[]'); } catch (e) {}
    old = old.filter(function (c) { return c && (c.text || '').trim(); });
    if (!old.length) { localStorage.setItem(MKEY, '1'); done(); return; }
    var author = localStorage.getItem(AKEY) || 'Fábio';
    var pending = old.length;
    old.forEach(function (c) {
      var obj = { id: genId(), n: c.n || 0, path: c.path || '/', x: c.x, y: c.y,
        text: c.text, author: author, ts: c.ts || Date.now(), resolved: false };
      dbPut(obj).then(function () { if (--pending === 0) { localStorage.setItem(MKEY, '1'); done(); } });
    });
    toast('Salvando seus comentários anteriores…');
  }

  // ---------------- carregar + sincronizar ----------------
  function refresh() {
    if (curPop) return; // não atrapalha edição aberta
    dbAll(function (arr) {
      if (!arr) return;
      comments = arr;
      seq = comments.reduce(function (m, c) { return Math.max(m, c.n || 0); }, 0);
      renderPins();
    });
  }
  migrateOld(function () { refresh(); });
  setInterval(refresh, 7000);
})();
