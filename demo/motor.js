// Motor da demonstração: navega entre os retratos das telas reais. Nada é gravado.
(function () {
  var D = window.DEMO;
  var palco = document.getElementById('demo-palco');
  var seletorPapel = document.getElementById('demo-papel');
  var caixaAviso = document.getElementById('demo-aviso');
  var atual = null;
  var papel = 'socio';
  var temporizador = null;
  var NAO_GRAVA = 'Na demonstração, os botões não gravam. No sistema publicado, esta ação funciona de verdade.';

  D.papeis.forEach(function (p) {
    var o = document.createElement('option');
    o.value = p.id; o.textContent = p.nome;
    seletorPapel.appendChild(o);
  });

  function avisar(texto) {
    caixaAviso.textContent = texto;
    caixaAviso.hidden = false;
    clearTimeout(temporizador);
    temporizador = setTimeout(function () { caixaAviso.hidden = true; }, 5000);
  }

  function mostrar(id) {
    if (!D.telas[id]) { avisar('Esta tela ainda não está na demonstração.'); return false; }
    atual = id;
    if (id !== 'entrada') papel = id.split('-')[0];
    palco.innerHTML = D.telas[id];
    seletorPapel.value = papel;
    window.scrollTo(0, 0);
    try { if (location.hash !== '#' + id) location.hash = id; } catch (e) { /* sem endereço */ }
    return true;
  }

  // ---- Painéis e modais por cima da tela
  function sobrepostos() { return palco.querySelectorAll('[data-demo-sobre]'); }
  function abrirSobre(chave) {
    var html = (D.sobre[papel] || {})[chave];
    if (!html) { avisar('Este detalhe não está na demonstração.'); return; }
    var caixa = document.createElement('div');
    caixa.setAttribute('data-demo-sobre', chave);
    // O painel lateral vem sem o véu; o modal já traz o seu.
    caixa.innerHTML = html.indexOf('class="fundo-modal"') === 0 || html.indexOf('<div class="fundo-modal"') === 0
      ? html : '<div class="fundo-modal"></div>' + html;
    (palco.querySelector('.conteudo') || palco).appendChild(caixa);
    return caixa;
  }
  function fecharSobre() {
    var todos = sobrepostos();
    if (!todos.length) return false;
    todos[todos.length - 1].remove();
    return true;
  }

  function irParaRota(href) {
    var partes = href.split('?');
    var id = (D.rotas[papel] || {})[partes[0]];
    if (!id) { avisar('O papel ' + seletorPapel.options[seletorPapel.selectedIndex].text + ' não tem acesso a esta tela.'); return; }
    mostrar(id);
    var ficha = /(?:^|&)ficha=([^&]+)/.exec(partes[1] || '');
    if (ficha && (D.sobre[papel] || {})['ficha:' + ficha[1]]) abrirSobre('ficha:' + ficha[1]);
  }

  function filtrarFase(chip) {
    var grupo = chip.parentElement;
    grupo.querySelectorAll('.chip').forEach(function (c) { c.setAttribute('aria-pressed', c === chip ? 'true' : 'false'); });
    var fase = chip.textContent.trim().toLowerCase();
    palco.querySelectorAll('.coluna-quadro').forEach(function (coluna) {
      var dela = (coluna.querySelector('.fase') || {}).textContent || '';
      coluna.style.display = fase === 'tudo' || dela.trim().toLowerCase() === fase ? '' : 'none';
    });
  }

  // De cima para baixo: o primeiro seletor que casar com o clique decide o que abre.
  var GATILHOS = [
    ['[data-teste="card-avancar"]', function () { avisar('Avançar só passa para a etapa seguinte, e só com o critério cumprido. ' + NAO_GRAVA); }],
    ['[data-teste="card"]', function (el) { abrirSobre('lead:' + el.getAttribute('data-nome')); }],
    ['[data-teste="novo-lead"]', function () { abrirSobre('modal:novo-lead'); }],
    ['[data-teste="acao-perdido"]', function () { abrirSobre('modal:perdido'); }],
    ['[data-teste="acao-venda"]', function () { abrirSobre('modal:venda'); }],
    ['[data-teste="acao-link"]', function (el) {
      var painel = el.closest('.painel-lateral');
      var modal = abrirSobre('modal:link');
      if (!painel || !modal) return;
      ['interesse', 'tamanho', 'quantidade', 'valor'].forEach(function (campo) {
        var de = painel.querySelector('input[name="' + campo + '"]');
        var para = modal.querySelector('input[name="' + campo + '"]');
        if (de && para) para.value = de.value || (campo === 'quantidade' ? '1' : '');
      });
    }],
    ['[data-teste^="editar-pessoa-"]', function (el) { abrirSobre('modal:pessoa:' + el.getAttribute('data-teste').replace('editar-pessoa-', '')); }],
    ['[data-teste="adicionar-pessoa"]', function () { abrirSobre('modal:pessoa-nova'); }],
    ['[data-teste^="editar-"]', function (el) { abrirSobre('modal:meta:' + el.getAttribute('data-teste').replace('editar-', '')); }],
    ['[data-teste^="historico-"]', function (el) { abrirSobre('painel:meta:' + el.getAttribute('data-teste').replace('historico-', '')); }],
    ['[data-teste^="metrica-"]', function (el) { abrirSobre('ficha:' + el.getAttribute('data-teste').replace('metrica-', '')); }],
    ['[data-teste="alternar-tema"]', function () {
      var raiz = document.documentElement;
      raiz.setAttribute('data-tema', raiz.getAttribute('data-tema') === 'escuro' ? 'claro' : 'escuro');
    }],
    ['[data-teste="abrir-menu"]', function () {
      if (window.innerWidth <= 900) {
        var lateral = palco.querySelector('.lateral'); var veu = palco.querySelector('.veu');
        var abrir = lateral.getAttribute('data-aberto') !== 'true';
        lateral.setAttribute('data-aberto', abrir); if (veu) veu.setAttribute('data-aberto', abrir);
      } else {
        var moldura = palco.querySelector('.moldura');
        moldura.setAttribute('data-recolhido', moldura.getAttribute('data-recolhido') !== 'true');
      }
    }],
    ['.veu', function () {
      palco.querySelectorAll('.lateral, .veu').forEach(function (e) { e.setAttribute('data-aberto', 'false'); });
    }],
    ['[data-teste="sair"]', function () { mostrar('entrada'); }],
    ['.filtros .chip', filtrarFase],
  ];

  document.addEventListener('click', function (evento) {
    var alvo = evento.target;
    if (alvo.closest('#demo-barra')) return;

    // Fechar: clique no véu, ou botões Fechar e Cancelar.
    if (sobrepostos().length) {
      var botao = alvo.closest('button');
      var texto = botao ? botao.textContent.trim() : '';
      if (alvo.classList.contains('fundo-modal') || texto === 'Fechar' || texto === 'Cancelar') {
        evento.preventDefault(); fecharSobre(); return;
      }
    }
    for (var i = 0; i < GATILHOS.length; i++) {
      var achado = alvo.closest(GATILHOS[i][0]);
      if (achado && palco.contains(achado)) { evento.preventDefault(); GATILHOS[i][1](achado); return; }
    }
    var link = alvo.closest('a[href]');
    if (link) {
      var href = link.getAttribute('href');
      if (href.charAt(0) === '/') { evento.preventDefault(); irParaRota(href); }
      return; // links de fora (WhatsApp) abrem normalmente
    }
    var botaoComum = alvo.closest('button');
    if (botaoComum && palco.contains(botaoComum)) {
      evento.preventDefault();
      if (atual === 'entrada') { mostrar(D.inicio[papel]); return; }
      avisar(NAO_GRAVA);
    }
  }, true);

  document.addEventListener('submit', function (evento) {
    evento.preventDefault();
    if (atual === 'entrada') { mostrar(D.inicio[papel]); return; }
    avisar(NAO_GRAVA);
  }, true);

  document.addEventListener('keydown', function (evento) {
    if (evento.key === 'Escape') fecharSobre();
  });

  seletorPapel.addEventListener('change', function () {
    papel = seletorPapel.value;
    mostrar(D.inicio[papel]);
    avisar('Agora você está vendo o sistema como ' + seletorPapel.options[seletorPapel.selectedIndex].text + ': o menu e os dados mudam conforme o papel.');
  });

  window.addEventListener('hashchange', function () {
    var id = location.hash.slice(1);
    if (id && id !== atual && D.telas[id]) mostrar(id);
  });

  var inicial = location.hash.slice(1);
  mostrar(D.telas[inicial] ? inicial : D.inicio.socio);
})();
