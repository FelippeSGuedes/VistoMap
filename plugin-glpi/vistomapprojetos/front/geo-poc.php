<?php
/**
 * VistoMap Projetos — Central de Operações Geoespaciais
 * Mapbox Standard (night) + agregação H3 + deck.gl, com a composição
 * completa: KPI strip, mapa protagonista, eventos, saúde, fluxo,
 * evolução e distribuição. Todo número vem do banco de produção.
 * @license GPL v2+
 */
include('../../../inc/includes.php');

Session::checkLoginUser();
if (!Session::haveRight('plugin_vistomapprojetos', READ)) {
    Html::displayRightError();
    exit;
}

$kpis      = PluginVistomapprojetosSalaControle::dataKpis();
$fluxo     = PluginVistomapprojetosSalaControle::dataFluxoStatus();
$mapaOp    = PluginVistomapprojetosSalaControle::dataMapaOperacional();
$filtros   = PluginVistomapprojetosSalaControle::dataFiltrosMapa();
$tecnicos  = PluginVistomapprojetosSalaControle::dataTecnicosEmCampo();
$atencao   = PluginVistomapprojetosSalaControle::dataAtencao();
$concRes   = PluginVistomapprojetosSalaControle::dataConcessionariasResultado();
$motivos   = PluginVistomapprojetosSalaControle::dataMotivosReprovacao();

$webDir = Plugin::getWebDir('vistomapprojetos');
$mapboxToken = 'pk.eyJ1IjoiZmVsaXBwZWd1ZWRlcyIsImEiOiJjbWdqdmJhdzcwbm52Mmlvam1tcDBxZHRhIn0.KOmJr0i_kVzcXQgX1biogQ';

// Malha oficial do estado de SP (IBGE, qualidade intermediária) pré-processada
// em { bbox, mask, outline }: a "mask" é um retângulo do mundo com SP recortado
// como furo — pintada por cima do basemap, faz o resto do Brasil sumir e deixa
// só o estado iluminado, como no recorte da referência.
$spGeoPath = __DIR__ . '/../templates/assets/sp-state.json';
$spGeo = is_file($spGeoPath) ? json_decode(file_get_contents($spGeoPath), true) : null;

// Versão de cache por mtime real — pros cards do KPI strip (montados em
// JS), mesmo motivo do cache-busting em vx_bg() pros cards em PHP.
$assetVers = [];
foreach (glob(__DIR__ . '/../templates/assets/*.png') ?: [] as $f) {
    $assetVers[basename($f)] = filemtime($f);
}

$currentUser = Session::getLoginUserID() ? new User() : null;
$userName = 'Usuário';
$userInitials = 'U';
if ($currentUser && $currentUser->getFromDB(Session::getLoginUserID())) {
    $userName = $currentUser->getFriendlyName() ?: $userName;
    $parts = preg_split('/\s+/', trim($userName));
    $userInitials = strtoupper(substr($parts[0] ?? 'U', 0, 1) . substr($parts[count($parts) - 1] ?? '', 0, 1));
}

Html::header('Central de Operações', $_SERVER['PHP_SELF'], 'plugins', 'PluginVistomapprojetosSalaControle');
?>
<link rel="stylesheet" href="https://api.mapbox.com/mapbox-gl-js/v3.9.0/mapbox-gl.css" />
<script src="https://api.mapbox.com/mapbox-gl-js/v3.9.0/mapbox-gl.js"></script>
<script src="https://unpkg.com/h3-js@4.5.0/dist/h3-js.umd.js"></script>
<script src="https://unpkg.com/deck.gl@9.3.10/dist/dist.dev.js"></script>
<style>
  #page, #page-content, #content { padding:0 !important; margin:0 !important; background:#F2F0F9 !important; }

  .vx {
    /* Tema claro de ponta a ponta — página e cards na mesma família tonal
       (branco/lavanda muito claro), só variando a intensidade pra separar
       card de fundo. O contraste escuro-vs-claro anterior (cards quase
       pretos boiando num fundo claro) ficava artificial; agora tudo
       combina com o branco nativo do GLPI. */
    --bg:#EDEAF7; --panel:#FFFFFF; --panel2:#F6F3FC; --bd:#E4DEF3;
    --ink:#241F3D; --mut:#69618C; --faint:#8D84AD;
    --cyan:#0EA5E9; --grn:#16A34A; --amb:#D97706; --red:#DC2626; --pur:#7C5CE0;
    --shadow:0 1px 2px rgba(36,31,61,.05), 0 10px 28px -8px rgba(76,59,153,.14);
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
    background:var(--bg); color:var(--ink); min-height:calc(100vh - 60px);
    display:flex; flex-direction:column;
  }
  .vx *{box-sizing:border-box;}

  /* ── canvas de conteúdo ── */
  .vx-main{display:flex; flex-direction:column; min-width:0;}
  .vx-body{padding:22px 28px 32px; display:flex; flex-direction:column; gap:18px; flex:1; min-height:0; max-width:1720px; margin:0 auto; width:100%;}
  .vx-metaline{display:flex; justify-content:space-between; align-items:center; gap:12px; font-size:11px; color:var(--faint); margin-top:-6px;}
  .vx-metaline-r{display:flex; align-items:center; gap:14px;}
  .vx-live{display:inline-flex; align-items:center; gap:6px; color:var(--grn); font-weight:600;}
  .vx-live i{width:6px;height:6px;border-radius:50%;background:var(--grn);display:block;
    box-shadow:0 0 0 0 rgba(34,197,94,.6); animation:vxp 2.2s infinite;}
  @keyframes vxp{70%{box-shadow:0 0 0 8px rgba(34,197,94,0);}100%{box-shadow:0 0 0 0 rgba(34,197,94,0);}}

  /* ── KPI strip ── */
  .vx-kpis{display:grid; grid-template-columns:repeat(6,1fr); gap:12px;}
  .vx-kpi{background:var(--panel) center/cover no-repeat; border:1px solid var(--bd); border-radius:16px; padding:22px 22px 20px;
    overflow:hidden; position:relative; box-shadow:var(--shadow); min-height:150px;
    cursor:pointer; transition:border-color .14s ease, box-shadow .14s ease, transform .14s ease;}
  .vx-kpi:not(.off):hover{border-color:var(--pur); transform:translateY(-2px);
    box-shadow:0 2px 4px rgba(36,31,61,.06), 0 16px 32px -10px rgba(124,92,224,.28);}
  .vx-kpi.on{border-color:var(--pur); box-shadow:0 0 0 1.5px var(--pur), 0 16px 32px -10px rgba(124,92,224,.28);}
  .vx-kpi.off{cursor:default;}
  .vx-kpi.off:hover{transform:none; border-color:var(--bd); box-shadow:var(--shadow);}
  .vx-kpi-h{display:flex; align-items:center; gap:10px; margin-bottom:16px;}
  .vx-kpi-ic{width:32px;height:32px;border-radius:9px;display:grid;place-items:center;flex:none;}
  .vx-kpi-ic svg{width:16px;height:16px;}
  .vx-kpi-lb{font-size:12px; color:var(--mut); font-weight:600; line-height:1.25; text-shadow:0 1px 3px rgba(255,255,255,.9);}
  .vx-kpi-v{font-size:34px; font-weight:800; letter-spacing:-.02em; font-variant-numeric:tabular-nums; line-height:1; text-shadow:0 1px 4px rgba(255,255,255,.9);}
  .vx-kpi-d{font-size:10.5px; font-weight:700; margin-left:7px; vertical-align:middle;}

  /* ── mapa: elemento único, dominante ── */
  .vx-mapfull{box-shadow:var(--shadow);}
  .vx-mapwrap{position:relative; height:66vh; min-height:540px; max-height:760px;}

  /* ── grade de dashes abaixo do mapa ── */
  .vx-dashrow{display:grid; grid-template-columns:repeat(auto-fit, minmax(400px, 1fr)); gap:16px;}
  .vx-panel{background:var(--panel) center/cover no-repeat; border:1px solid var(--bd); border-radius:16px; display:flex; flex-direction:column;
    min-height:0; overflow:hidden; box-shadow:var(--shadow);}
  .vx-panel.vx-mapfull{background-image:none;}
  .vx-ph{display:flex; align-items:center; justify-content:space-between; padding:18px 20px;
    border-bottom:1px solid var(--bd); background:rgba(255,255,255,.62); backdrop-filter:blur(2px);}
  .vx-pt{font-size:12.5px; font-weight:800; letter-spacing:.05em; text-shadow:0 1px 3px rgba(255,255,255,.8);}
  .vx-ps{font-size:11px; color:var(--faint); margin-top:3px; text-shadow:0 1px 3px rgba(255,255,255,.8);}
  .vx-pb{padding:20px; overflow:auto; flex:1; min-height:260px; display:flex; flex-direction:column;}
  /* Marca d'água do Mapbox — ferramenta interna, atrás de login do GLPI,
     não uma página pública; mantém só o link de atribuição compacto (o
     "i" no canto), tira o logo gráfico. */
  .vx-mapwrap .mapboxgl-ctrl-logo{display:none !important;}
  #vx-map{position:absolute; inset:0;}

  /* ═══ canto superior esquerdo do mapa: só uma lupa. Filtro "rápido"
     agora é 100% pelos cards abaixo do mapa — isso aqui é só busca de
     equipamento + montagem de filtro específico (multi-critério, tipo
     pesquisa avançada do GLPI). ═══ */
  .vx-mapmenu{position:absolute; top:14px; left:14px; z-index:5;}
  .vx-mm-search{position:relative;}
  .vx-search-toggle{width:38px; height:38px; border-radius:50%; flex:none;
    background:rgba(255,255,255,.88); border:1px solid rgba(255,255,255,.7); color:var(--pur);
    backdrop-filter:blur(14px) saturate(1.6);
    box-shadow:0 1px 2px rgba(36,31,61,.06), 0 10px 24px -8px rgba(36,31,61,.28), inset 0 1px 0 rgba(255,255,255,.8);
    display:grid; place-items:center; cursor:pointer;
    transition:background .15s ease, transform .12s ease, box-shadow .15s ease;}
  .vx-search-toggle svg{width:16px; height:16px;}
  .vx-search-toggle:hover{background:#fff; transform:scale(1.06);}
  .vx-search-toggle.on{background:var(--pur); color:#fff; box-shadow:0 0 0 4px rgba(124,92,224,.18), 0 10px 24px -8px rgba(36,31,61,.28);}

  .vx-search-panel{position:absolute; top:calc(100% + 10px); left:0; width:min(304px, calc(100vw - 40px)); display:none;
    background:#fff; border:1px solid var(--bd); border-radius:16px; padding:14px;
    box-shadow:0 20px 42px -10px rgba(36,31,61,.3), 0 2px 8px rgba(36,31,61,.07); z-index:6;
    max-height:min(72vh, 560px); overflow-y:auto;
    animation:vxPopIn .18s cubic-bezier(.2,.8,.3,1) both;}
  .vx-search-panel.show{display:block;}
  .vx-sp-hint{display:flex; gap:8px; font-size:11px; line-height:1.5; color:var(--mut);
    background:var(--panel2); border:1px solid var(--bd); border-radius:10px; padding:9px 10px; margin-bottom:12px;}

  .vx-mm-search-box{display:flex; align-items:center; gap:7px; background:rgba(124,92,224,.07); border:1px solid transparent;
    border-radius:999px; padding:8px 12px; width:100%;
    transition:background .18s ease, box-shadow .18s ease;}
  .vx-mm-search-box:focus-within{background:#fff; box-shadow:0 0 0 3px rgba(124,92,224,.14), 0 2px 6px rgba(36,31,61,.08);}
  .vx-mm-search-box svg{width:13px; height:13px; color:var(--pur); opacity:.55; flex:none;}
  .vx-mm-search-box input{flex:1; min-width:0; background:none; border:none; outline:none; color:#241F3D; font-size:12px; font-weight:500;}
  .vx-mm-search-box input::placeholder{color:#ACA3CC; font-weight:400;}
  .vx-mm-search-box .vx-search-x{display:none; background:rgba(124,92,224,.12); border:none; border-radius:50%;
    width:16px; height:16px; color:var(--pur); cursor:pointer; font-size:12px; line-height:1; flex:none;
    align-items:center; justify-content:center; transition:background .15s ease;}
  .vx-mm-search-box .vx-search-x:hover{background:rgba(124,92,224,.22);}
  .vx-mm-search-box .vx-search-x.show{display:flex;}

  .vx-search-results{width:100%; margin-top:6px;
    background:#fff; border:1px solid var(--bd); border-radius:13px; padding:4px;
    max-height:220px; overflow:auto; display:none;
    box-shadow:0 6px 18px -6px rgba(36,31,61,.16); z-index:6;}
  .vx-search-results.show{display:block;}
  .vx-sr-item{display:flex; align-items:center; justify-content:space-between; gap:8px; padding:9px 11px;
    cursor:pointer; border-radius:9px; font-size:11.5px; transition:background .12s ease;}
  .vx-sr-item:hover{background:var(--panel2);}
  .vx-sr-name{color:#241F3D; font-weight:700;}
  .vx-sr-meta{font-size:10.5px; font-weight:600;}
  .vx-sr-empty{padding:14px; font-size:11px; color:#8D84AD; text-align:center;}

  /* ── filtro específico (multi-critério, igual pesquisa avançada do
     GLPI): cada linha é [campo] [valor], combinadas com E ── */
  .vx-sp-divider{display:flex; align-items:center; gap:8px; font-size:9.5px; font-weight:700; letter-spacing:.04em;
    text-transform:uppercase; color:var(--faint); margin:14px 0 10px;}
  .vx-sp-divider::before, .vx-sp-divider::after{content:""; flex:1; height:1px; background:var(--bd);}
  .vx-adv-rows{display:flex; flex-direction:column; gap:7px;}
  .vx-adv-row{display:flex; align-items:center; gap:6px;}
  .vx-adv-field, .vx-adv-value{flex:1; min-width:0; background:var(--panel2); border:1px solid var(--bd); border-radius:8px;
    padding:7px 8px; font-size:11.5px; font-weight:600; color:var(--ink); cursor:pointer;}
  .vx-adv-field:focus, .vx-adv-value:focus{outline:none; border-color:var(--pur); box-shadow:0 0 0 3px rgba(124,92,224,.14);}
  .vx-adv-rm{flex:none; width:26px; height:26px; border-radius:8px; border:1px solid var(--bd); background:#fff;
    color:var(--faint); cursor:pointer; font-size:14px; line-height:1; display:grid; place-items:center; transition:background .12s ease, color .12s ease, border-color .12s ease;}
  .vx-adv-rm:hover{background:#FEF2F2; border-color:#FCA5A5; color:#DC2626;}
  .vx-sp-addrow{margin-top:9px; font-size:11.5px; font-weight:700; color:var(--pur); background:none; border:none;
    cursor:pointer; padding:2px; display:inline-block;}
  .vx-sp-addrow:hover{text-decoration:underline;}
  .vx-sp-actions{display:flex; gap:8px; margin-top:13px;}
  .vx-sp-clear{flex:1; padding:9px; border-radius:9px; border:1px solid var(--bd); background:#fff; color:var(--mut);
    font-size:11.5px; font-weight:700; cursor:pointer; transition:background .12s ease;}
  .vx-sp-clear:hover{background:var(--panel2);}
  .vx-sp-apply{flex:1.5; padding:9px; border-radius:9px; border:none;
    background:linear-gradient(135deg,#6D28D9,#8B5CF6); color:#fff; font-size:11.5px; font-weight:700; cursor:pointer;
    box-shadow:0 6px 16px -6px rgba(124,58,237,.5); transition:filter .15s ease, transform .12s ease;}
  .vx-sp-apply:hover{filter:brightness(1.1); transform:translateY(-1px);}
  .vx-sp-apply:active{transform:translateY(0) scale(.98);}

  .vx-zoom{position:absolute; right:12px; bottom:12px; z-index:3; display:flex; flex-direction:column; gap:6px;}
  .vx-zb{width:30px;height:30px;border-radius:10px;background:rgba(18,15,32,.82);border:1px solid rgba(167,139,250,.22);
    color:#D8D2F0; font-size:15px; cursor:pointer; display:grid; place-items:center; backdrop-filter:blur(8px);
    box-shadow:0 6px 16px -6px rgba(0,0,0,.4); transition:background .15s ease, transform .12s ease;}
  .vx-zb:hover{background:rgba(124,92,224,.55); transform:translateY(-1px);}
  .vx-zb:active{transform:translateY(0) scale(.94);}
  .vx-compass{width:30px;height:30px;border-radius:10px;background:rgba(18,15,32,.82);border:1px solid rgba(167,139,250,.22);
    cursor:pointer; display:grid; place-items:center; backdrop-filter:blur(8px);
    box-shadow:0 6px 16px -6px rgba(0,0,0,.4); transition:background .15s ease, transform .12s ease;}
  .vx-compass:hover{background:rgba(124,92,224,.35); transform:translateY(-1px);}
  .vx-compass svg{width:15px;height:15px;transition:transform .25s ease;}
  /* pin de hotspot (top-N municípios por concentração) */
  .vx-pin{display:flex; flex-direction:column; align-items:center; pointer-events:none; transform:translateY(-6px);}
  .vx-pin-ic{width:11px;height:11px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);
    box-shadow:0 0 0 3px rgba(255,255,255,.14), 0 2px 8px rgba(0,0,0,.5); margin-bottom:5px;}
  .vx-pin-lb{background:rgba(7,11,18,.88); border:1px solid rgba(255,255,255,.1); border-radius:6px;
    padding:3px 8px; font-size:10.5px; font-weight:700; color:#EAF2FA; white-space:nowrap;
    box-shadow:0 3px 10px rgba(0,0,0,.4); text-align:center; line-height:1.3;}
  .vx-pin-lb small{display:block; font-size:9px; font-weight:600; color:#8DA0B5;}
  /* Painel de informação do mapa — sempre escuro com texto claro, de
     propósito: flutua por cima da imagem do mapa (satélite/terreno), não
     é um card da página, então não segue a retintagem clara do resto da
     UI. pointer-events normal (não "none") — o mouse precisa conseguir
     entrar nele e clicar no botão. */
  /* Card premium de hover — dark glass, identidade própria (não segue os
     tokens claros do resto da UI, de propósito: flutua sobre imagem de
     mapa, precisa competir visualmente com satélite/terreno por baixo). */
  @keyframes vxPopIn{ from{opacity:0; transform:translateY(8px) scale(.95);} to{opacity:1; transform:translateY(0) scale(1);} }
  #vx-popup{position:absolute; z-index:7; display:none;
    width:clamp(224px, 19vw, 258px);
    background:
      linear-gradient(165deg, rgba(34,28,64,.94) 0%, rgba(10,9,20,.97) 62%),
      radial-gradient(130% 150% at 0% 0%, rgba(139,92,246,.18), transparent 55%);
    backdrop-filter:blur(22px) saturate(150%); -webkit-backdrop-filter:blur(22px) saturate(150%);
    border:1px solid rgba(167,139,250,.24); border-radius:15px;
    padding:13px 13px 11px; color:#F3F1FA;
    box-shadow:0 0 0 1px rgba(124,92,224,.06), 0 0 26px -4px rgba(124,92,224,.36),
      0 20px 38px -12px rgba(0,0,0,.62), inset 0 1px 0 rgba(255,255,255,.05);
    animation:vxPopIn .2s cubic-bezier(.2,.8,.3,1) both;}
  @media (prefers-reduced-motion:reduce){ #vx-popup{animation:none;} }
  #vx-popup .pp-top{display:flex; align-items:flex-start; justify-content:space-between; gap:8px; margin-bottom:10px;}
  #vx-popup .pp-id{font-size:13.5px; font-weight:800; letter-spacing:-.01em; color:#fff; line-height:1.2;
    text-shadow:0 1px 10px rgba(139,92,246,.32);}
  #vx-popup .pp-badge{display:inline-flex; align-items:center; gap:4px; margin-top:6px;
    font-size:9px; font-weight:700; letter-spacing:.03em; text-transform:uppercase;
    padding:3px 7px 3px 6px; border-radius:999px; white-space:nowrap;}
  #vx-popup .pp-badge svg{width:8.5px; height:8.5px;}
  #vx-popup .pp-close{flex:none; width:20px; height:20px; border-radius:7px; display:grid; place-items:center;
    background:rgba(255,255,255,.045); border:1px solid rgba(255,255,255,.08); color:#8B85AA;
    cursor:pointer; font-size:13px; line-height:1; padding:0;
    transition:background .15s ease, color .15s ease, transform .15s ease;}
  #vx-popup .pp-close:hover{background:rgba(255,255,255,.09); color:#EDE9FE; transform:rotate(90deg);}
  #vx-popup .pp-info{display:flex; flex-direction:column;}
  #vx-popup .pp-row{display:flex; align-items:flex-start; gap:8px; padding:7px 0;
    border-bottom:1px solid rgba(255,255,255,.055);}
  #vx-popup .pp-row:last-child{border-bottom:0; padding-bottom:2px;}
  #vx-popup .pp-ic{flex:none; width:22px; height:22px; margin-top:1px; border-radius:7px;
    display:grid; place-items:center; background:rgba(139,92,246,.13); color:#B9A6F5;}
  #vx-popup .pp-ic svg{width:10.5px; height:10.5px;}
  #vx-popup .pp-txt{min-width:0; flex:1;}
  #vx-popup .pp-lb{font-size:9px; font-weight:600; letter-spacing:.04em; text-transform:uppercase; color:#6F6890;}
  #vx-popup .pp-vl{font-size:11.5px; font-weight:700; color:#F3F1FA; margin-top:2px;
    white-space:nowrap; overflow:hidden; text-overflow:ellipsis;}
  #vx-popup .pp-vl.dot{display:flex; align-items:center; gap:5px;}
  #vx-popup .pp-vl.dot i{width:5px; height:5px; border-radius:50%; background:currentColor; flex:none;
    box-shadow:0 0 7px currentColor;}
  #vx-popup .pp-btn{display:flex; align-items:center; justify-content:center; gap:6px; width:100%;
    margin-top:10px; padding:9px 10px; border-radius:10px; border:1px solid rgba(196,181,253,.3);
    background:linear-gradient(135deg,#6D28D9 0%,#9061F0 55%,#7C3AED 100%);
    color:#fff; font-size:11px; font-weight:700; letter-spacing:.01em; text-decoration:none;
    box-shadow:0 6px 16px -6px rgba(124,58,237,.55), inset 0 1px 0 rgba(255,255,255,.18);
    transition:filter .15s ease, transform .15s ease, box-shadow .15s ease;}
  #vx-popup .pp-btn svg{width:12px; height:12px; flex:none;}
  #vx-popup .pp-btn .pp-arrow{transition:transform .15s ease;}
  #vx-popup .pp-btn:hover{filter:brightness(1.12); transform:translateY(-1px);
    box-shadow:0 8px 20px -6px rgba(124,58,237,.7), inset 0 1px 0 rgba(255,255,255,.22);}
  #vx-popup .pp-btn:hover .pp-arrow{transform:translateX(3px);}
  #vx-popup .pp-btn:active{transform:translateY(0) scale(.98); filter:brightness(.98);}

  /* barra clicável — usada por Status Geral / Concessionárias / Por
     Equipamento: cada linha É um filtro do mapa, não só uma legenda. */
  .vx-bar-row{display:flex; align-items:center; gap:9px; padding:7px 6px; margin:0 -6px; border-radius:7px;
    cursor:pointer; border:1px solid transparent; transition:background .12s ease;}
  .vx-bar-row:hover{background:var(--panel2);}
  .vx-bar-row.on{background:var(--panel2); border-color:var(--pur);}
  .vx-bar-row .lb{flex:0 0 128px; font-size:12px; color:var(--mut); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;}
  .vx-bar-row .tr{flex:1; height:12px; border-radius:6px; background:var(--bd); overflow:hidden;}
  .vx-bar-row .tr span{display:block; height:100%; border-radius:6px;}
  .vx-bar-row .vl{flex:0 0 44px; text-align:right; font-size:12.5px; font-weight:700; font-variant-numeric:tabular-nums;}
  .vx-filter-chip{display:none; align-items:center; gap:8px; font-size:11.5px; font-weight:600; color:#4C3B99;
    background:#EFE9FF; border:1px solid #D8CCFA; border-radius:999px; padding:6px 12px; margin-bottom:2px; width:fit-content;}
  .vx-filter-chip button{background:none; border:none; color:#4C3B99; font-weight:800; cursor:pointer; font-size:13px; line-height:1;}

  /* ── Fluxo da operação ──
     Não é um funil literal: os dados reais (4.300 → 2 → 291) ALARGAM no
     meio, então uma silhueta de funil sempre pareceria quebrada. Vira um
     medidor de progresso do pipeline + composição por etapa. */
  .vx-fl{display:flex; flex-direction:column; gap:16px; height:100%;}
  .vx-fl-head{display:flex; align-items:flex-end; justify-content:space-between; gap:12px;}
  .vx-fl-pct{font-size:40px; font-weight:800; line-height:.95; letter-spacing:-.03em;
    background:linear-gradient(135deg,#16A34A,#0EA5E9); -webkit-background-clip:text; background-clip:text;
    -webkit-text-fill-color:transparent; font-variant-numeric:tabular-nums;}
  .vx-fl-pct-sub{font-size:11px; color:var(--mut); font-weight:600; margin-top:4px;}
  .vx-fl-total{text-align:right; font-size:10.5px; color:var(--faint); line-height:1.4;}
  .vx-fl-total b{display:block; font-size:16px; color:var(--ink); font-variant-numeric:tabular-nums;}
  /* barra empilhada: flex-grow proporcional ao valor + flex-basis mínimo,
     então etapa minúscula (2 de 4.593) ainda aparece como sliver visível */
  .vx-fl-bar{display:flex; gap:2px; height:20px; border-radius:10px; overflow:hidden; background:var(--bd);}
  .vx-fl-seg{border-radius:3px; transition:filter .12s ease;}
  .vx-fl-seg:first-child{border-radius:10px 3px 3px 10px;}
  .vx-fl-seg:last-child{border-radius:3px 10px 10px 3px;}
  .vx-fl-rows{display:flex; flex-direction:column; gap:2px;}
  .vx-fl-row{display:flex; align-items:center; gap:10px; padding:7px 8px; margin:0 -8px; border-radius:8px;
    cursor:pointer; border:1px solid transparent; transition:background .12s ease;}
  .vx-fl-row:hover{background:var(--panel2);}
  .vx-fl-row.on{background:var(--panel2); border-color:var(--pur);}
  .vx-fl-row .dot{width:9px; height:9px; border-radius:3px; flex:none;}
  .vx-fl-row .lb{flex:1; font-size:12px; color:var(--mut); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;}
  .vx-fl-row .vl{font-size:13px; font-weight:800; font-variant-numeric:tabular-nums; color:var(--ink);}
  .vx-fl-row .pc{width:52px; text-align:right; font-size:11px; color:var(--faint); font-variant-numeric:tabular-nums;}
  .vx-fl-alert{display:flex; align-items:center; gap:8px; font-size:11px; color:#B45309;
    background:#FEF3C7; border:1px solid #FDE68A; border-radius:8px; padding:8px 10px; margin-top:auto;}
  .vx-fl-alert b{font-variant-numeric:tabular-nums;}

  /* ── Atenção agora ── */
  .vx-attn-b{display:grid; grid-template-columns:repeat(auto-fit, minmax(270px, 1fr)); gap:12px; padding:16px 20px 18px;}
  .vx-at{display:flex; gap:14px; align-items:flex-start; padding:13px 15px; border:1px solid var(--bd); border-radius:12px;
    background:var(--panel2); transition:border-color .14s ease, box-shadow .14s ease;}
  .vx-at.click{cursor:pointer;}
  .vx-at.click:hover{border-color:var(--pur);}
  .vx-at.on{border-color:var(--pur); box-shadow:0 0 0 1.5px var(--pur);}
  .vx-at-n{font-size:28px; font-weight:800; line-height:1; letter-spacing:-.02em; font-variant-numeric:tabular-nums; min-width:46px;}
  .vx-at-t{font-size:12px; color:var(--mut); line-height:1.4; min-width:0;}
  .vx-at-t b{display:block; color:var(--ink); font-weight:700; font-size:12.5px; margin-bottom:2px;}

  /* ── cartões novos do strip ── */
  .vx-kpi-sub{font-size:11px; font-weight:700; margin-top:9px; line-height:1.3;}

  /* ── Concessionárias com resultado ── */
  /* fundo semitransparente: o painel tem curvas decorativas que cruzavam o texto */
  .vx-conc-res{display:flex; flex-direction:column; gap:12px; margin-top:16px; padding:13px 15px;
    background:rgba(255,255,255,.84); border:1px solid var(--bd); border-radius:12px;}
  .vx-conc-h{display:flex; justify-content:space-between; align-items:baseline; font-size:12px; color:var(--ink); font-weight:700;}
  .vx-conc-h b{font-variant-numeric:tabular-nums;}
  .vx-conc-tr{height:7px; border-radius:4px; background:var(--bd); overflow:hidden; margin:5px 0 4px;}
  .vx-conc-tr span{display:block; height:100%; border-radius:4px; background:var(--pur);}
  .vx-conc-o{font-size:11px; color:var(--faint); font-variant-numeric:tabular-nums;}
  .vx-conc-o i{font-style:normal; font-weight:700;}

  /* ── Motivos de reprovação (barras sem clique: o ponto do mapa não carrega o motivo) ── */
  .vx-bar-row.vx-static{cursor:default;}
  .vx-bar-row.vx-static:hover{background:transparent;}
  #vx-motivos .vx-bar-row .lb{flex-basis:170px;}
  .vx-mot-nt{margin-top:10px; font-size:11px; color:var(--faint);}
  /* insight de ritmo/previsão — frase curta + 3 estatísticas lado a lado,
     não um parágrafo corrido com número em negrito solto no meio do texto */
  .vx-fl-insight{display:flex; gap:11px; padding:11px 12px; border-radius:11px;
    background:linear-gradient(135deg,#F5F1FF 0%,#FBF9FF 100%); border:1px solid #E2D9FA;}
  .vx-fl-ins-ic{flex:none; width:30px; height:30px; margin-top:1px; border-radius:9px; display:grid; place-items:center;
    background:linear-gradient(135deg,#7C5CE0,#9F86EA); color:#fff;
    box-shadow:0 4px 12px -4px rgba(124,92,224,.55);}
  .vx-fl-ins-ic svg{width:14px; height:14px;}
  .vx-fl-ins-body{flex:1; min-width:0;}
  .vx-fl-ins-title{font-size:11.5px; color:#5B4FA0; line-height:1.4; margin-bottom:8px;}
  .vx-fl-ins-title b{color:#3B2E85; font-weight:800;}
  .vx-fl-ins-stats{display:flex; gap:16px;}
  .vx-fl-ins-stat{display:flex; flex-direction:column; gap:2px; padding-left:12px; border-left:1px solid #E2D9FA;}
  .vx-fl-ins-stat:first-child{padding-left:0; border-left:0;}
  .vx-fl-ins-stat .vl{font-size:13.5px; font-weight:800; color:#3B2E85; font-variant-numeric:tabular-nums; line-height:1.15;}
  .vx-fl-ins-stat .lb{font-size:9.5px; color:#8D84AD; font-weight:600; letter-spacing:.01em;}
  .vx-dist{display:flex; align-items:center; gap:18px;}
  .vx-dist-lg{flex:1; min-width:0;}
  .vx-dist-r{display:flex; align-items:center; gap:7px; font-size:12px; margin-bottom:8px; color:var(--mut);}
  .vx-dist-r i{width:8px;height:8px;border-radius:2px;flex:none;}

  /* donut clicável — Concessionárias (poucas categorias, proporção importa) */
  .vx-donutf{display:flex; align-items:center; gap:18px;}
  .vx-donutf-lg{flex:1; min-width:0;}
  .vx-donutf-r{display:flex; align-items:center; gap:8px; font-size:12px; margin-bottom:3px; color:var(--mut);
    padding:5px 6px; margin-left:-6px; margin-right:-6px; border-radius:7px; cursor:pointer;
    border:1px solid transparent; transition:background .12s ease;}
  .vx-donutf-r:hover{background:var(--panel2);}
  .vx-donutf-r.on{background:var(--panel2); border-color:var(--pur);}
  .vx-donutf-r i{width:8px;height:8px;border-radius:2px;flex:none;}
  .vx-donutf-r span{flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;}
  .vx-donutf-r b{color:var(--ink); font-variant-numeric:tabular-nums;}

  /* ── Por Equipamento: SEMPRE horizontal (DCU | donut grande | Repetidor)
     — grid de 3 trilhas com as laterais fluidas (minmax(0,1fr)) e o donut
     central em clamp() atado à largura real do container via cqw, então
     ele cresce/encolhe com o card em vez de forçar quebra de linha. Só
     colapsa pra coluna numa largura realmente mínima (celular). ── */
  .vx-eqd{position:relative; display:grid; grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);
    align-items:center; gap:clamp(8px,3.4cqw,30px); height:100%; min-height:150px; padding:2px 0;}
  .vx-eqd-deco{position:absolute; inset:-6px; z-index:0; opacity:.022; pointer-events:none;}
  /* mesmo "material" (vidro/borda/sombra) nos 3 elementos — laterais E o
     halo atrás do donut — pra ler como um componente só, não 3 soltos */
  .vx-eqd-side{position:relative; z-index:1; min-width:0; padding:15px 12px; border-radius:14px; cursor:pointer;
    text-align:center; background:rgba(255,255,255,.32); border:1px solid rgba(255,255,255,.55);
    backdrop-filter:blur(7px); box-shadow:0 1px 2px rgba(36,31,61,.03);
    transition:background .15s ease, box-shadow .15s ease, transform .15s ease, border-color .15s ease;}
  .vx-eqd-side:hover{background:rgba(255,255,255,.75); transform:translateY(-2px);}
  .vx-eqd-side.on{background:#fff; border-color:var(--bd); box-shadow:0 10px 26px -10px rgba(36,31,61,.22), 0 0 0 1px var(--bd);}
  .vx-eqd-ic{width:26px; height:26px; margin:0 auto 9px; border-radius:8px; display:grid; place-items:center;}
  .vx-eqd-ic svg{width:12px; height:12px;}
  .vx-eqd-val{font-size:clamp(19px,6.1cqw,27px); font-weight:800; letter-spacing:-.02em;
    font-variant-numeric:tabular-nums; line-height:1;}
  .vx-eqd-lbl{font-size:11px; font-weight:600; color:var(--mut); margin-top:6px; white-space:nowrap;}
  .vx-eqd-pctval{display:inline-block; font-size:11px; font-weight:800; font-variant-numeric:tabular-nums;
    margin-top:11px; padding-bottom:3px; border-bottom:1.5px solid currentColor;}
  .vx-eqd-desc{font-size:9.5px; font-weight:500; color:var(--faint); margin-top:10px; line-height:1.45; max-width:17ch; margin-left:auto; margin-right:auto;}

  .vx-eqd-center{position:relative; z-index:1; width:clamp(164px,51cqw,240px); height:clamp(164px,51cqw,240px); margin:0 auto;
    filter:drop-shadow(0 10px 18px rgba(76,59,153,.10));}
  .vx-eqd-center::before{content:""; position:absolute; inset:-7%; z-index:-1; border-radius:50%;
    background:rgba(255,255,255,.32); border:1px solid rgba(255,255,255,.55); box-shadow:0 1px 2px rgba(36,31,61,.03);}
  .vx-eqd-center svg{width:100%; height:100%; overflow:visible;}
  .vx-eqd-total{position:absolute; inset:15%; display:grid; place-items:center; justify-items:center; text-align:center; pointer-events:none;}
  /* selo com gradiente azul→roxo — as duas cores do próprio donut, deixando
     explícito que o total É a soma dos dois segmentos */
  .vx-eqd-total-ic{width:22px; height:22px; margin-bottom:8px; border-radius:50%; display:grid; place-items:center;
    background:linear-gradient(135deg,#2E6FF2,#8B5CF6); box-shadow:0 3px 10px -2px rgba(76,59,153,.45);}
  .vx-eqd-total-ic svg{width:11px; height:11px; color:#fff;}
  .vx-eqd-total-v{font-size:clamp(23px,7cqw,33px); font-weight:800; letter-spacing:-.025em; line-height:1;
    font-variant-numeric:tabular-nums; color:#2E6FF2;
    background:linear-gradient(120deg,#2E6FF2 20%,#8B5CF6 90%);
    -webkit-background-clip:text; background-clip:text; -webkit-text-fill-color:transparent;}
  .vx-eqd-total-l{font-size:8px; font-weight:700; letter-spacing:.07em; color:var(--faint); margin-top:7px; line-height:1.4;}

  #vx-portipo{container-type:inline-size;}
  @container (max-width:280px){
    .vx-eqd{grid-template-columns:1fr; justify-items:center; gap:10px;}
    .vx-eqd-center{order:-1;}
  }
  .vx-dist-r span{flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;}
  .vx-dist-r b{color:var(--ink); font-variant-numeric:tabular-nums;}

  /* lista de técnicos em campo — cada linha filtra o mapa por técnico */
  .vx-tec-list{display:flex; flex-direction:column; gap:2px; max-height:206px; overflow-y:auto; margin:0 -6px; padding:0 6px;}
  .vx-tec-row{display:flex; align-items:center; gap:10px; padding:8px 6px; border-radius:9px; cursor:pointer;
    border:1px solid transparent; transition:background .12s ease;}
  .vx-tec-row:hover{background:var(--panel2);}
  .vx-tec-row.on{background:var(--panel2); border-color:var(--pur);}
  .vx-tec-av{flex:none; width:34px; height:34px; border-radius:10px; display:grid; place-items:center;
    font-size:12px; font-weight:800; color:#fff; background:linear-gradient(135deg,var(--pur),#9F86EA);}
  .vx-tec-tx{flex:1; min-width:0;}
  .vx-tec-nm{font-size:12.5px; font-weight:700; color:var(--ink); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;}
  .vx-tec-mu{font-size:11px; color:var(--mut); margin-top:1px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;}
  .vx-tec-rt{flex:none; text-align:right;}
  .vx-tec-ago{font-size:10px; font-weight:700; color:var(--faint); font-variant-numeric:tabular-nums;}
  .vx-tec-dot{display:inline-flex; align-items:center; gap:4px; font-size:9.5px; font-weight:700;
    letter-spacing:.03em; text-transform:uppercase; margin-top:3px;}
  .vx-tec-dot i{width:6px; height:6px; border-radius:50%; background:currentColor;}
  .vx-tec-empty{color:var(--faint); font-size:11.5px; padding:6px 0;}

  @media (max-width:1500px){
    /* 6 KPIs: 3+3 em telas de notebook, não 4+2 torto */
    .vx-kpis{grid-template-columns:repeat(3,1fr);}
  }
  @media (max-width:1180px){
    .vx-body{padding:18px 16px 24px;}
    .vx-kpis{grid-template-columns:repeat(2,1fr);}
    .vx-mapwrap{height:52vh; min-height:420px;}
  }
  /* tablet estreito / celular deitado */
  @media (max-width:720px){
    .vx-body{padding:14px 10px 20px; gap:14px;}
    .vx-kpis{grid-template-columns:1fr 1fr; gap:8px;}
    .vx-kpi{padding:12px 12px 11px; border-radius:11px;}
    .vx-kpi-v{font-size:22px;}
    .vx-mapwrap{height:56vh; min-height:360px;}
    .vx-metaline{flex-wrap:wrap; row-gap:6px;}
  }
  /* celular em pé */
  @media (max-width:480px){
    .vx-kpis{grid-template-columns:1fr;}
    .vx-zoom{bottom:8px; right:8px;}
    .vx-mm-search-box input{font-size:16px;} /* evita zoom automático do iOS ao focar */
  }
</style>

<div class="vx">
  <div class="vx-main">
    <div class="vx-body">
      <div class="vx-metaline">
        <div class="vx-filter-chip" id="vx-filter-chip"><span></span><button id="vx-filter-clear" title="Limpar filtro">&times;</button></div>
        <div class="vx-metaline-r">
          <span id="vx-clock">--:--:--</span>
          <span class="vx-live"><i></i> Sistema online</span>
        </div>
      </div>

      <div class="vx-kpis" id="vx-kpis"></div>

      <!-- Atenção agora: o que pede ação. Começa oculto; o JS mostra se houver item. -->
      <section class="vx-panel vx-attn" id="vx-attn" style="display:none">
        <div class="vx-ph"><div><div class="vx-pt">ATENÇÃO AGORA</div><div class="vx-ps">O que pede ação · clique pra ver no mapa</div></div></div>
        <div class="vx-attn-b" id="vx-attn-b"></div>
      </section>

      <!-- mapa: elemento único, dominante -->
      <section class="vx-panel vx-mapfull">
        <div class="vx-mapwrap">
          <div id="vx-map"></div>
          <div class="vx-mapmenu">
            <div class="vx-mm-search">
              <button class="vx-search-toggle" id="vx-search-toggle" title="Buscar equipamento ou criar filtro">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
              </button>
              <div class="vx-search-panel" id="vx-search-panel">
                <div class="vx-sp-hint">💡 Pra filtros rápidos, clique nos cards abaixo do mapa — status, concessionária, tipo, pendência ou técnico.</div>
                <div class="vx-mm-search-box">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
                  <input type="text" id="vx-search-input" placeholder="Buscar equipamento ou município...">
                  <button class="vx-search-x" id="vx-search-clear">&times;</button>
                </div>
                <div class="vx-search-results" id="vx-search-results"></div>
                <div class="vx-sp-divider"><span>ou crie um filtro específico</span></div>
                <div class="vx-adv-rows" id="vx-adv-rows"></div>
                <button class="vx-sp-addrow" id="vx-adv-add">+ Adicionar critério</button>
                <div class="vx-sp-actions">
                  <button class="vx-sp-clear" id="vx-adv-clear">Limpar</button>
                  <button class="vx-sp-apply" id="vx-adv-apply">Aplicar filtro</button>
                </div>
              </div>
            </div>
          </div>
          <div class="vx-zoom">
            <button class="vx-compass" id="vx-compass-btn" title="Alinhar ao norte">
              <svg id="vx-compass" viewBox="0 0 24 24" fill="none" stroke="#7DD3FC" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 2 L15 12 L12 22 L9 12 Z" fill="#7DD3FC" stroke="none"/>
                <path d="M12 2 L9 12 L12 8 Z" fill="#17132C" stroke="none"/>
              </svg>
            </button>
            <button class="vx-zb" data-z="in">+</button>
            <button class="vx-zb" data-z="out">−</button>
            <button class="vx-zb" data-z="reset" title="Reenquadrar">⤢</button>
          </div>
          <div id="vx-popup"></div>
        </div>
      </section>

      <!-- dashes: grade limpa abaixo do mapa -->
      <div class="vx-dashrow">
        <section class="vx-panel" style="<?= vx_bg($webDir, 'fluxo.png') ?>">
          <div class="vx-ph"><div><div class="vx-pt">FLUXO DA OPERAÇÃO</div><div class="vx-ps">Do backlog à aprovação</div></div></div>
          <div class="vx-pb" id="vx-flow"></div>
        </section>
        <section class="vx-panel" style="<?= vx_bg($webDir, 'evoc.png') ?>">
          <div class="vx-ph"><div><div class="vx-pt">EVOLUÇÃO DA OPERAÇÃO</div><div class="vx-ps">Vistorias finalizadas · 7 dias</div></div></div>
          <div class="vx-pb" id="vx-evo"></div>
        </section>
        <section class="vx-panel" style="<?= vx_bg($webDir, 'dist.png') ?>">
          <div class="vx-ph"><div><div class="vx-pt">DISTRIBUIÇÃO</div><div class="vx-ps">Equipamentos por município</div></div></div>
          <div class="vx-pb"><div class="vx-dist" id="vx-dist"></div></div>
        </section>
        <section class="vx-panel" style="<?= vx_bg($webDir, 'statusgr.png') ?>">
          <div class="vx-ph"><div><div class="vx-pt">STATUS GERAL</div><div class="vx-ps">Clique pra filtrar o mapa</div></div></div>
          <div class="vx-pb" id="vx-statusgeral"></div>
        </section>
        <section class="vx-panel" style="<?= vx_bg($webDir, 'conc.png') ?>">
          <div class="vx-ph"><div><div class="vx-pt">CONCESSIONÁRIAS</div><div class="vx-ps">Clique pra filtrar o mapa</div></div></div>
          <div class="vx-pb" id="vx-concessionaria"></div>
        </section>
        <section class="vx-panel" style="<?= vx_bg($webDir, 'equipamentofor.png') ?>">
          <div class="vx-ph"><div><div class="vx-pt">POR EQUIPAMENTO</div><div class="vx-ps">Clique pra filtrar o mapa</div></div></div>
          <div class="vx-pb" id="vx-portipo"></div>
        </section>
        <section class="vx-panel" style="<?= vx_bg($webDir, 'teccamp.png') ?>">
          <div class="vx-ph"><div><div class="vx-pt">TÉCNICOS EM CAMPO</div><div class="vx-ps">Última posição · clique pra filtrar o mapa</div></div></div>
          <div class="vx-pb" id="vx-tecnicos"></div>
        </section>
        <section class="vx-panel">
          <div class="vx-ph"><div><div class="vx-pt">PENDÊNCIAS</div><div class="vx-ps">Clique pra filtrar o mapa</div></div></div>
          <div class="vx-pb" id="vx-pendencias"></div>
        </section>
        <section class="vx-panel">
          <div class="vx-ph"><div><div class="vx-pt">MOTIVOS DE REPROVAÇÃO</div><div class="vx-ps">Principais motivos entre os reprovados</div></div></div>
          <div class="vx-pb" id="vx-motivos"></div>
        </section>
      </div>
    </div>
  </div>
</div>

<script>
(function () {
  "use strict";
  mapboxgl.accessToken = <?= json_encode($mapboxToken) ?>;
  var ASSET_DIR = <?= json_encode($webDir . '/templates/assets/') ?>;
  var ASSET_VERS = <?= json_encode($assetVers) ?>;
  function bgStyle(file){
    var v = ASSET_VERS[file] || Date.now();
    return "background-image:linear-gradient(150deg, rgba(255,255,255,.5) 0%, rgba(255,255,255,.22) 45%, rgba(255,255,255,.05) 100%), url('"+ASSET_DIR+file+"?v="+v+"')";
  }
  var KPIS    = <?= json_encode($kpis) ?>;
  var FLUXO   = <?= json_encode($fluxo) ?>;
  var MAPA    = <?= json_encode($mapaOp) ?>;
  var FILTROS = <?= json_encode($filtros) ?>;
  var TEC     = <?= json_encode($tecnicos) ?>;
  var ATENCAO = <?= json_encode($atencao) ?>;
  var CONCRES = <?= json_encode($concRes) ?>;
  var MOTIVOS = <?= json_encode($motivos) ?>;

  var C = { cyan:"#0EA5E9", grn:"#16A34A", amb:"#D97706", red:"#DC2626", pur:"#7C5CE0", mut:"#69618C" };
  var IC = {
    box:'<path d="M21 8v8a2 2 0 0 1-1 1.7l-7 4a2 2 0 0 1-2 0l-7-4A2 2 0 0 1 3 16V8a2 2 0 0 1 1-1.7l7-4a2 2 0 0 1 2 0l7 4A2 2 0 0 1 21 8z"/>',
    check:'<path d="M22 11.1V12a10 10 0 1 1-5.9-9.1"/><path d="m9 11 3 3L22 4"/>',
    user:'<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    pin:'<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>',
    shield:'<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    undo:'<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-15-6.7L3 13"/>',
    alert:'<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    info:'<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
    calendar:'<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/>',
    arrowRight:'<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>',
    pause:'<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>',
    trend:'<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>',
    tower:'<path d="M4.9 16.1C1 12.2 1 5.8 4.9 1.9"/><path d="M7.8 4.7a6.14 6.14 0 0 0-.8 7.5"/><circle cx="12" cy="9" r="2"/><path d="M16.2 4.8c2 2 2.26 5.11.8 7.47"/><path d="M19.1 1.9a9.96 9.96 0 0 1 0 14.1"/><path d="M9.5 18h5"/><path d="M12 18v4"/>',
    layers:'<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>'
  };
  function svg(p, cls){ return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="'+(cls||"")+'">'+p+'</svg>'; }
  function nf(n){ return Number(n||0).toLocaleString("pt-BR"); }
  function tint(hex,a){ var n=parseInt(hex.slice(1),16); return "rgba("+((n>>16)&255)+","+((n>>8)&255)+","+(n&255)+","+a+")"; }
  function esc(s){ return String(s==null?"":s).replace(/[&<>"']/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]; }); }
  function rgb(hex){ var n=parseInt((hex||"#888").slice(1),16); return [(n>>16)&255,(n>>8)&255,n&255]; }

  /* ── relógio ── */
  (function clock(){
    var el=document.getElementById("vx-clock");
    function t(){ var d=new Date(); el.textContent=d.toLocaleTimeString("pt-BR")+" · "+d.toLocaleDateString("pt-BR"); }
    t(); setInterval(t,1000);
  })();

  /* ── sparkline SVG ── */
  function spark(series, color){
    var v=(series||[]).map(function(d){ return typeof d==="object" ? Number(d.total||d.value||0) : Number(d||0); });
    if(v.length<2) v=[0,0];
    var mx=Math.max.apply(null,v), mn=Math.min.apply(null,v), rg=(mx-mn)||1;
    var W=100,H=34,step=W/(v.length-1);
    var pts=v.map(function(y,i){ return [ (i*step).toFixed(2), (H-2-((y-mn)/rg)*(H-8)).toFixed(2) ]; });
    var line=pts.map(function(p,i){ return (i?"L":"M")+p[0]+" "+p[1]; }).join(" ");
    var area=line+" L"+W+" "+H+" L0 "+H+" Z";
    var id="g"+Math.random().toString(36).slice(2,8);
    return '<svg class="spark" viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="none">'+
      '<defs><linearGradient id="'+id+'" x1="0" y1="0" x2="0" y2="1">'+
      '<stop offset="0%" stop-color="'+color+'" stop-opacity=".34"/>'+
      '<stop offset="100%" stop-color="'+color+'" stop-opacity="0"/></linearGradient></defs>'+
      '<path d="'+area+'" fill="url(#'+id+')"/>'+
      '<path d="'+line+'" fill="none" stroke="'+color+'" stroke-width="1.6" vector-effect="non-scaling-stroke"/></svg>';
  }
  function delta(series){
    var v=(series||[]).map(function(d){ return typeof d==="object"?Number(d.total||d.value||0):Number(d||0); });
    if(v.length<4) return null;
    var h=v.length>>1, a=v.slice(0,h).reduce(function(s,x){return s+x;},0), b=v.slice(h).reduce(function(s,x){return s+x;},0);
    if(a===0) return b>0?100:null;
    return Math.round((b-a)/a*100);
  }

  /* ═══ motor de filtro do mapa ═══
     Um único estado global (activeFilter) usado por KPI, Status Geral,
     Concessionárias e Por Equipamento — clicar em QUALQUER um deles
     recorta o mapa pelo mesmo mecanismo. Clicar de novo no mesmo filtro
     limpa (toggle). renderMap fica definido lá embaixo; aqui só o estado
     + a função que os componentes chamam. */
  var activeFilter = null; // {key, test:function(p), label}
  var onFilterChange = function(){}; // setado depois que o mapa existir

  function applyFilterUI(){
    document.querySelectorAll("[data-filter-key]").forEach(function(el){
      el.classList.toggle("on", !!activeFilter && el.getAttribute("data-filter-key")===activeFilter.key);
    });
    var chip=document.getElementById("vx-filter-chip");
    if(activeFilter){ chip.style.display="inline-flex"; chip.querySelector("span").textContent="Filtro: "+activeFilter.label; }
    else { chip.style.display="none"; }
    onFilterChange();
  }
  // Toggle — usado por KPI/Status Geral/Concessionárias/Por Equipamento:
  // clicar de novo no mesmo filtro limpa.
  function setFilter(key, test, label){
    if(activeFilter && activeFilter.key===key){ activeFilter=null; }
    else { activeFilter = test ? {key:key, test:test, label:label} : null; }
    applyFilterUI();
  }
  // Direto (sem toggle) — usado pela busca, que já tem seu próprio botão
  // de limpar e precisa poder ficar "ligada" enquanto o texto muda.
  function setFilterDirect(key, test, label){
    activeFilter = test ? {key:key, test:test, label:label} : null;
    applyFilterUI();
  }
  document.getElementById("vx-filter-clear").addEventListener("click", function(){ setFilter(null); clearSearch(); });

  /* ── busca de equipamento/município — filtra o mapa ao vivo enquanto
     digita, e permite ir direto num equipamento específico. */
  function normalizeStr(s){
    return (s||"").normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase().trim();
  }
  var searchInput = document.getElementById("vx-search-input");
  var searchResults = document.getElementById("vx-search-results");
  var searchClearBtn = document.getElementById("vx-search-clear");

  function clearSearch(){
    searchInput.value="";
    searchResults.classList.remove("show");
    searchClearBtn.classList.remove("show");
  }
  searchClearBtn.addEventListener("click", function(){
    clearSearch();
    if(activeFilter && activeFilter.key==="search") setFilterDirect(null);
    searchInput.focus();
  });

  searchInput.addEventListener("input", function(){
    var raw = searchInput.value;
    var q = normalizeStr(raw);
    searchClearBtn.classList.toggle("show", raw.length>0);

    if(!q){
      searchResults.classList.remove("show");
      if(activeFilter && activeFilter.key==="search") setFilterDirect(null);
      return;
    }

    var matches = FEATURES.filter(function(f){
      var p=f.properties;
      return normalizeStr(p.nome).indexOf(q)>-1 || normalizeStr(p.regiao).indexOf(q)>-1;
    });

    // Narrow o mapa em tempo real pros equipamentos que batem — não é só
    // uma lista de sugestão, é filtro de verdade (pedido explícito).
    setFilterDirect("search", function(p){
      return normalizeStr(p.nome).indexOf(q)>-1 || normalizeStr(p.regiao).indexOf(q)>-1;
    }, '"'+raw+'" ('+matches.length+')');

    var top = matches.slice(0,8);
    searchResults.innerHTML = top.length ? top.map(function(f){
      var p=f.properties, m=SM[p.status]||{label:p.status,color:"#889"};
      return '<div class="vx-sr-item" data-lon="'+f.geometry.coordinates[0]+'" data-lat="'+f.geometry.coordinates[1]+'">'+
        '<span class="vx-sr-name">'+p.nome+'</span>'+
        '<span class="vx-sr-meta" style="color:'+m.color+'">'+m.label+'</span></div>';
    }).join("") : '<div class="vx-sr-empty">Nenhum equipamento encontrado</div>';
    searchResults.classList.add("show");

    searchResults.querySelectorAll(".vx-sr-item").forEach(function(el, i){
      el.addEventListener("click", function(){
        var f = top[i];
        map.flyTo({center:f.geometry.coordinates, zoom:15.5, duration:900});
        searchResults.classList.remove("show");
        setTimeout(function(){ openPopup(f.properties, mapEl.clientWidth/2, mapEl.clientHeight/2); }, 950);
      });
    });
  });
  var mapEl = document.getElementById("vx-map");
  document.addEventListener("click", function(ev){
    if(!ev.target.closest(".vx-mm-search")){
      searchResults.classList.remove("show");
      closeSearchPanel();
    }
  });

  /* ── KPI strip (clicável — cada card recorta o mapa) ── */
  (function kpis(){
    var K = FILTROS.kpis || {};
    var defs=[
      {key:"total", lb:"Equipamentos ativos", v:K.equipamentosAtivos, ic:IC.box, c:C.cyan, test:null, bg:"vistoria.png"},
      {key:"vist_concluida", lb:"Vistorias concluídas", v:K.vistoriasConcluidas, ic:IC.check, c:C.grn, test:function(p){return p.situacaoId===3||p.situacaoId===6;}, bg:"concluidas_gioc.png"},
      {key:"vist_pendente", lb:"Vistorias pendentes", v:K.vistoriasPendentes, ic:IC.alert, c:C.amb, test:function(p){return p.statesId===1||p.statesId===2;}, bg:"vistoriaspen.png"},
      {key:"vist_aprovada", lb:"Vistorias aprovadas", v:K.vistoriasAprovadas, ic:IC.shield, c:C.pur, test:function(p){return p.aprovada===1;}, bg:"vistoriasap.png"},
      // Os cartões de Instalação (sempre 0 e 0: a instalação ainda não começou)
      // deram lugar a estes dois. Reaproveitam as mesmas imagens de fundo.
      {key:"taxa_aprov", lb:"Taxa de aprovação", v:K.taxaAprovacao, f:function(v){ return v==null?"—":String(v).replace(".",",")+"%"; },
        sub:(K.decididas>0 ? nf(K.decididas)+" decididas pela concessionária" : ""), subc:C.mut,
        ic:IC.check, c:C.grn, test:function(p){return p.statusVistoriaId===3||p.statusVistoriaId===4||p.statusVistoriaId===7;}, bg:"instapro.png"},
      {key:"em_analise", lb:"Esperando a concessionária", v:K.emAnalise,
        sub:(K.emAnaliseMais7d>0 ? nf(K.emAnaliseMais7d)+" há mais de 7 dias" : ""), subc:C.amb,
        ic:IC.alert, c:C.amb, test:function(p){return p.statusVistoriaId===5;}, bg:"instpen.png"}
    ];
    document.getElementById("vx-kpis").innerHTML=defs.map(function(d){
      return '<div class="vx-kpi'+(d.off?" off":"")+'" data-filter-key="'+d.key+'" style="'+bgStyle(d.bg)+'">'+
        '<div class="vx-kpi-h"><div class="vx-kpi-ic" style="background:'+tint(d.c,.14)+';color:'+d.c+'">'+svg(d.ic)+'</div>'+
        '<div class="vx-kpi-lb">'+d.lb+'</div></div>'+
        '<div><span class="vx-kpi-v">'+(d.f ? d.f(d.v) : nf(d.v))+'</span></div>'+
        (d.sub ? '<div class="vx-kpi-sub" style="color:'+d.subc+'">'+d.sub+'</div>' : '')+
      '</div>';
    }).join("");
    document.querySelectorAll(".vx-kpi:not(.off)").forEach(function(el,i){
      el.addEventListener("click", function(){
        var d=defs.filter(function(x){return !x.off;})[i];
        setFilter(d.key, d.test, d.lb);
      });
    });
  })();

  /* ── barra clicável genérica (Status Geral / Concessionárias / Por Equipamento) ── */
  function renderBarList(elId, items, filterPrefix, testBuilder, palette){
    var mx = items.reduce(function(m,it){ return Math.max(m,it.value); },1);
    document.getElementById(elId).innerHTML = items.map(function(it,i){
      var key = filterPrefix+"_"+i, c = palette[i%palette.length];
      return '<div class="vx-bar-row" data-filter-key="'+key+'">'+
        '<span class="lb">'+it.label+'</span>'+
        '<span class="tr"><span style="width:'+Math.max(4,it.value/mx*100)+'%;background:'+c+'"></span></span>'+
        '<span class="vl">'+nf(it.value)+'</span></div>';
    }).join("") || '<div style="color:var(--faint);font-size:11.5px">Sem dado.</div>';
    items.forEach(function(it,i){
      var key=filterPrefix+"_"+i;
      var row=document.querySelector('[data-filter-key="'+key+'"]');
      if(row) row.addEventListener("click", function(){ setFilter(key, testBuilder(it), it.label); });
    });
  }
  var PAL = [C.cyan, C.grn, C.amb, C.pur, C.red, "#14B8A6", "#DB2777", "#65A30D"];

  /* ── donut clicável genérico — poucas categorias, proporção importa ── */
  function renderDonutFilter(elId, items, filterPrefix, testBuilder, palette){
    var tot = items.reduce(function(s,it){ return s+it.value; },0)||1;
    var R=44, CIRC=2*Math.PI*R, acc=0;
    var arcs = items.map(function(it,i){
      var c=palette[i%palette.length], frac=it.value/tot, len=CIRC*frac, dash=len+" "+(CIRC-len), off=-acc*CIRC; acc+=frac;
      return '<circle cx="55" cy="55" r="'+R+'" fill="none" stroke="'+c+'" stroke-width="15" '+
        'stroke-dasharray="'+dash.replace(/(\d+\.\d\d)\d+/g,"$1")+'" stroke-dashoffset="'+off.toFixed(1)+'" transform="rotate(-90 55 55)"/>';
    }).join("");
    document.getElementById(elId).innerHTML =
      '<div class="vx-donutf">'+
        '<div style="position:relative;width:124px;height:124px;flex:none">'+
          '<svg viewBox="0 0 110 110" style="width:124px;height:124px">'+arcs+'</svg>'+
          '<div style="position:absolute;inset:0;display:grid;place-items:center;text-align:center">'+
            '<div><div style="font-size:19px;font-weight:800;font-variant-numeric:tabular-nums">'+nf(tot)+'</div>'+
            '<div style="font-size:9.5px;color:var(--faint)">total</div></div></div>'+
        '</div>'+
        '<div class="vx-donutf-lg">'+items.map(function(it,i){
          var key=filterPrefix+"_"+i, c=palette[i%palette.length];
          return '<div class="vx-donutf-r" data-filter-key="'+key+'" style="color:'+c+'">'+
            '<i style="background:'+c+'"></i><span>'+it.label+'</span><b>'+Math.round(it.value/tot*100)+'%</b></div>';
        }).join("")+'</div>'+
      '</div>';
    items.forEach(function(it,i){
      var key=filterPrefix+"_"+i;
      var row=document.querySelector('[data-filter-key="'+key+'"]');
      if(row) row.addEventListener("click", function(){ setFilter(key, testBuilder(it), it.label); });
    });
  }

  /* ── Por Equipamento: donut tecnológico + 2 painéis laterais (DCU /
     Repetidor). Só as 2 maiores categorias ganham painel dedicado — o
     donut em si soma TODAS (mesmo alguma categoria residual tipo "Sem
     tipo"), então o total no centro nunca mente. Lógica de clique idêntica
     à do antigo grid de blocos: mesma chave, mesmo testBuilder(it). ── */
  function renderEquipDonut(elId, items, filterPrefix, testBuilder){
    var DESC = {
      "DCU": "Dispositivos concentradores de dados",
      "Repetidor": "Dispositivos de retransmissão de sinal"
    };
    var COLOR = { "DCU": "#2E6FF2", "Repetidor": "#8B5CF6" };
    var ICON  = { "DCU": IC.box, "Repetidor": IC.tower };
    var FALLBACK = "#94A3B8";
    var colorFor = function(label){ return COLOR[label] || FALLBACK; };
    var tot = items.reduce(function(s,it){ return s+it.value; },0) || 1;
    var top2 = items.slice(0,2);

    var R=50, CIRC=2*Math.PI*R, GAP = items.length>1 ? 2.2 : 0, acc=0;
    var arcs="", markers="";
    items.forEach(function(it){
      var c = colorFor(it.label), frac = it.value/tot;
      var rawLen = CIRC*frac, len = Math.max(0, rawLen-GAP);
      var dash = len+" "+(CIRC-len), off = -acc*CIRC;
      arcs += '<circle cx="60" cy="60" r="'+R+'" fill="none" style="stroke:'+c+'; filter:drop-shadow(0 0 5px '+tint(c,.45)+')" '+
        'stroke-width="14" stroke-linecap="round" '+
        'stroke-dasharray="'+dash.replace(/(\d+\.\d\d)\d+/g,"$1")+'" stroke-dashoffset="'+off.toFixed(1)+'" '+
        'transform="rotate(-90 60 60)"></circle>';
      acc += frac;
      var ang = (acc*360-90) * Math.PI/180;
      var mx = (60+R*Math.cos(ang)).toFixed(1), my = (60+R*Math.sin(ang)).toFixed(1);
      markers += '<circle cx="'+mx+'" cy="'+my+'" r="3.4" fill="#fff" style="stroke:'+c+'; filter:drop-shadow(0 0 4px '+tint(c,.6)+')" stroke-width="2.3"></circle>';
    });

    var sideHtml = function(it, i){
      if(!it) return "";
      var c = colorFor(it.label), pct = it.value/tot*100, key = filterPrefix+"_"+i;
      return '<div class="vx-eqd-side" data-filter-key="'+key+'">'+
        '<div class="vx-eqd-ic" style="background:'+tint(c,.13)+';color:'+c+'">'+svg(ICON[it.label]||IC.box)+'</div>'+
        '<div class="vx-eqd-val" style="color:'+c+'">'+nf(it.value)+'</div>'+
        '<div class="vx-eqd-lbl">'+esc(it.label)+'</div>'+
        '<div class="vx-eqd-pctval" style="color:'+c+'">'+pct.toFixed(1).replace(".",",")+'%</div>'+
        '<div class="vx-eqd-desc">'+esc(DESC[it.label]||"Equipamentos de rede")+'</div>'+
      '</div>';
    };

    // Anéis-guia extremamente discretos (dentro/fora do anel principal) —
    // dão a leitura de "instrumento de medição" sem competir com os dados.
    var guides =
      '<circle cx="60" cy="60" r="'+(R+8)+'" fill="none" style="stroke:var(--bd)" stroke-width="1" opacity=".4"></circle>'+
      '<circle cx="60" cy="60" r="'+(R-9)+'" fill="none" style="stroke:var(--bd)" stroke-width="1" opacity=".4"></circle>';

    document.getElementById(elId).innerHTML =
      '<div class="vx-eqd">'+
        '<svg class="vx-eqd-deco" viewBox="0 0 400 200" preserveAspectRatio="none" aria-hidden="true">'+
          '<path d="M0,140 C60,110 100,170 160,140 C220,110 260,170 320,140 C360,120 380,150 400,140" fill="none" stroke="#8B5CF6" stroke-width="1.4"/>'+
          '<path d="M0,58 C50,88 90,28 150,58 C210,88 250,28 310,58 C350,78 380,48 400,58" fill="none" stroke="#2E6FF2" stroke-width="1.4"/>'+
        '</svg>'+
        sideHtml(top2[0],0)+
        '<div class="vx-eqd-center"><svg viewBox="0 0 120 120">'+
          guides+
          '<circle cx="60" cy="60" r="'+R+'" fill="none" style="stroke:var(--bd)" stroke-width="14"></circle>'+
          arcs+markers+
        '</svg><div class="vx-eqd-total"><div class="vx-eqd-total-ic">'+svg(IC.layers)+'</div>'+
        '<div class="vx-eqd-total-v">'+nf(tot)+'</div>'+
        '<div class="vx-eqd-total-l">EQUIPAMENTOS<br>TOTAIS</div></div></div>'+
        sideHtml(top2[1],1)+
      '</div>';

    top2.forEach(function(it,i){
      if(!it) return;
      var key = filterPrefix+"_"+i;
      var el = document.querySelector('[data-filter-key="'+key+'"]');
      if(el) el.addEventListener("click", function(){ setFilter(key, testBuilder(it), it.label); });
    });
  }

  (function statusGeral(){
    renderBarList("vx-statusgeral", FILTROS.porStatusGeral||[], "sg",
      function(it){ return function(p){ return p.statesId===it.statesId; }; }, PAL);
  })();
  (function concessionaria(){
    renderDonutFilter("vx-concessionaria", FILTROS.porConcessionaria||[], "cc",
      function(it){ return function(p){ return (p.concessionaria||"Sem concessionária")===it.label; }; }, PAL);
    // Resultado de cada concessionária: quanto da base já foi vistoriado e como
    // ela decidiu. O donut só mostrava o tamanho de cada base.
    var res = CONCRES || [];
    if(res.length){
      document.getElementById("vx-concessionaria").insertAdjacentHTML("beforeend",
        '<div class="vx-conc-res">'+res.map(function(r){
          var pct = r.base ? r.vistoriadas/r.base*100 : 0;
          return '<div class="vx-conc-r">'+
            '<div class="vx-conc-h"><span>'+esc(r.label)+'</span><b>'+pct.toFixed(1).replace(".",",")+'%</b></div>'+
            '<div class="vx-conc-tr"><span style="width:'+Math.max(pct,0.8)+'%"></span></div>'+
            '<div class="vx-conc-o">'+nf(r.vistoriadas)+' de '+nf(r.base)+' vistoriadas'+
              (r.vistoriadas ? ' · <i style="color:'+C.grn+'">'+nf(r.aprovadas)+' aprov.</i>'+
                ' · <i style="color:'+C.amb+'">'+nf(r.emAnalise)+' análise</i>'+
                ' · <i style="color:'+C.red+'">'+nf(r.reprovadas)+' reprov.</i>' : '')+
            '</div></div>';
        }).join("")+'</div>');
    }
  })();

  /* ── Atenção agora — itens vindos de dataAtencao(); clique filtra o mapa ── */
  (function atencao(){
    var A = (ATENCAO && ATENCAO.itens) || [];
    if(!A.length) return;
    var TOM = {warn:C.amb, crit:C.red, info:C.cyan};
    function testeDe(it){
      if(it.id==="espera")  return function(p){ return p.statusVistoriaId===5; };
      if(it.id==="reprov")  return function(p){ return p.statusVistoriaId===4 && p.concessionaria===it.conc; };
      if(it.id==="zero")    return function(p){ return p.concessionaria===it.conc; };
      return null; // devolução: o ponto do mapa não carrega esse dado
    }
    document.getElementById("vx-attn-b").innerHTML = A.map(function(it,i){
      var c = TOM[it.tom] || C.cyan, clicavel = !!testeDe(it);
      return '<div class="vx-at'+(clicavel?' click':'')+'" data-filter-key="at_'+i+'">'+
        '<div class="vx-at-n" style="color:'+c+'">'+nf(it.n)+'</div>'+
        '<div class="vx-at-t"><b>'+esc(it.titulo)+'</b>'+esc(it.detalhe||"")+'</div></div>';
    }).join("");
    document.getElementById("vx-attn").style.display = "";
    A.forEach(function(it,i){
      var t = testeDe(it); if(!t) return;
      var key = "at_"+i, el = document.querySelector('[data-filter-key="'+key+'"]');
      if(el) el.addEventListener("click", function(){ setFilter(key, t, it.titulo); });
    });
  })();

  /* ── Motivos de reprovação ── */
  (function motivos(){
    var M = MOTIVOS || {}, itens = M.itens || [], el = document.getElementById("vx-motivos");
    if(!itens.length){ el.innerHTML = '<div class="vx-tec-empty">Nenhuma reprovação registrada.</div>'; return; }
    var mx = itens.reduce(function(m,it){ return Math.max(m,it.value); },1);
    el.innerHTML = itens.map(function(it){
      return '<div class="vx-bar-row vx-static"><span class="lb" title="'+esc(it.label)+'">'+esc(it.label)+'</span>'+
        '<span class="tr"><span style="width:'+Math.max(4,it.value/mx*100)+'%;background:'+C.red+'"></span></span>'+
        '<span class="vl">'+nf(it.value)+'</span></div>';
    }).join("") +
      '<div class="vx-mot-nt">'+nf(M.total)+' reprovações no total'+(M.outros>0 ? ' · '+nf(M.outros)+' em outros motivos' : '')+'</div>';
  })();
  (function porTipo(){
    var items = Object.keys(MAPA.porTipo||{}).map(function(k){ return {label:k, value:MAPA.porTipo[k]}; });
    renderEquipDonut("vx-portipo", items, "tp",
      function(it){ return function(p){ return p.tipo===it.label; }; });
  })();
  (function pendencias(){
    // Ordem/paleta fixas (não arsort do PHP) — "Sem Pendências" sempre
    // neutro por último, CPFL/Nansen sempre em destaque, mesmo que a
    // proporção mude com o tempo.
    var raw = MAPA.porPendencia || {};
    var order = ["Pendência CPFL","Pendência Nansen","Sem Pendências"];
    var pal = {"Pendência CPFL":C.red, "Pendência Nansen":C.amb, "Sem Pendências":"#CBD5E1"};
    var items = order.filter(function(k){ return raw[k]!=null; }).map(function(k){ return {label:k, value:raw[k]}; });
    renderDonutFilter("vx-pendencias", items, "pd",
      function(it){ return function(p){ return p.pendencia===it.label; }; },
      items.map(function(it){ return pal[it.label]; }));
  })();

  /* ── técnicos em campo — nome + município (equipamento mais próximo da
     última posição GPS real), clicável pra filtrar o mapa por técnico ── */
  (function tecnicosEmCampo(){
    var list = TEC.tecnicos || [];
    var el = document.getElementById("vx-tecnicos");
    if(!list.length){
      el.innerHTML = '<div class="vx-tec-empty">Nenhum técnico com expediente aberto agora.</div>';
      return;
    }
    function initials(nome){
      var parts = String(nome).trim().split(/\s+/);
      return ((parts[0]||"")[0]||"") + ((parts[parts.length-1]||"")[0]||"");
    }
    function agoInfo(min){
      if(min==null) return {txt:"sem GPS", c:C.mut};
      if(min<15) return {txt:"há "+min+" min", c:C.grn};
      if(min<60) return {txt:"há "+min+" min", c:C.amb};
      if(min<1440) return {txt:"há "+Math.round(min/60)+"h", c:C.red};
      return {txt:"há "+Math.round(min/1440)+"d", c:C.red};
    }
    el.innerHTML = '<div class="vx-tec-list">'+list.map(function(t,i){
      var ago = agoInfo(t.minutosAtras);
      return '<div class="vx-tec-row" data-filter-key="tec_'+i+'">'+
        '<div class="vx-tec-av">'+esc(initials(t.nome).toUpperCase())+'</div>'+
        '<div class="vx-tec-tx"><div class="vx-tec-nm">'+esc(t.nome)+'</div>'+
        '<div class="vx-tec-mu">'+esc(t.municipio||"Município desconhecido")+'</div></div>'+
        '<div class="vx-tec-rt"><div class="vx-tec-ago" style="color:'+ago.c+'">'+ago.txt+'</div>'+
        (t.pausado?'<div class="vx-tec-dot" style="color:'+C.amb+'"><i></i>pausa</div>':'')+
        '</div></div>';
    }).join("")+'</div>';
    list.forEach(function(t,i){
      var key="tec_"+i;
      var rowEl=document.querySelector('[data-filter-key="'+key+'"]');
      if(rowEl) rowEl.addEventListener("click", function(){ setFilter(key, function(p){ return p.tecnicoNome===t.nome; }, t.nome); });
    });
  })();

  /* ── fluxo da operação ──
     Etapas do pipeline (estados mutuamente exclusivos do equipamento) +
     progresso geral. "Devolvido" fica FORA da barra empilhada de
     propósito: vem da tabela de devoluções, não é um states_id — somar
     na mesma barra misturaria dois denominadores diferentes. */
  (function flow(){
    var nodes = FLUXO.nodes || [];
    var stages = nodes.filter(function(n){ return n.id!=="devolvido"; });
    var devolvido = nodes.filter(function(n){ return n.id==="devolvido"; })[0];

    // Etapas pelo STATUS NA CONCESSIONÁRIA (dataFluxoStatus) — antes eram
    // estados do poste (Liberado/Em instalação/Instalado) que a operação de
    // vistoria não usa, e "Aprovado" saía 0. O desenho é o mesmo.
    var META = {
      aguardando:    {c:C.amb,     test:function(p){ return p.statesId===2; }},
      analise:       {c:C.cyan,    test:function(p){ return p.statusVistoriaId===5; }},
      aprovado:      {c:C.pur,     test:function(p){ return p.statusVistoriaId===3; }},
      aprovado_pend: {c:"#A78BFA", test:function(p){ return p.statusVistoriaId===7; }},
      reprovado:     {c:C.red,     test:function(p){ return p.statusVistoriaId===4; }}
    };

    var tot = stages.reduce(function(s,n){ return s+Number(n.value||0); },0) || 1;
    var done = stages.filter(function(n){ return n.done; })
                     .reduce(function(s,n){ return s+Number(n.value||0); },0);
    var pct = done/tot*100;

    var segs = stages.filter(function(n){ return Number(n.value)>0; }).map(function(n){
      var c=(META[n.id]||{}).c||C.cyan;
      // flex-grow proporcional ao valor + flex-basis mínimo de 5px: a
      // etapa minúscula (2 de 4.593) continua visível como sliver, sem
      // distorcer a proporção das grandes.
      return '<div class="vx-fl-seg" style="flex:'+n.value+' 0 5px;background:linear-gradient(180deg,'+c+','+tint(c,.62)+')" title="'+n.label+': '+nf(n.value)+'"></div>';
    }).join("");

    var rows = stages.map(function(n,i){
      var m=META[n.id]||{c:C.cyan}, v=Number(n.value||0);
      var pc = v>0 ? (v/tot*100) : 0;
      var pcTxt = v===0 ? "—" : (pc<0.1 ? "<0,1%" : pc.toFixed(1).replace(".",",")+"%");
      return '<div class="vx-fl-row" data-filter-key="fl_'+n.id+'">'+
        '<span class="dot" style="background:'+m.c+'"></span>'+
        '<span class="lb">'+n.label+'</span>'+
        '<span class="vl">'+nf(v)+'</span>'+
        '<span class="pc">'+pcTxt+'</span></div>';
    }).join("");

    document.getElementById("vx-flow").innerHTML =
      '<div class="vx-fl">'+
        '<div class="vx-fl-head">'+
          '<div><div class="vx-fl-pct">'+pct.toFixed(1).replace(".",",")+'%</div>'+
          '<div class="vx-fl-pct-sub">da base já vistoriada</div></div>'+
          '<div class="vx-fl-total"><b>'+nf(tot)+'</b>equipamentos no fluxo</div>'+
        '</div>'+
        '<div class="vx-fl-bar">'+segs+'</div>'+
        '<div class="vx-fl-rows">'+rows+'</div>'+
        (FLUXO.etaDias
          ? '<div class="vx-fl-insight">'+
              '<div class="vx-fl-ins-ic">'+svg(IC.trend)+'</div>'+
              '<div class="vx-fl-ins-body">'+
                '<div class="vx-fl-ins-title">No ritmo atual, o backlog inteiro zera em <b>~'+FLUXO.etaDias+' dias</b></div>'+
                '<div class="vx-fl-ins-stats">'+
                  '<div class="vx-fl-ins-stat"><span class="vl">'+String(FLUXO.ritmoDiario).replace(".",",")+'/dia</span><span class="lb">RITMO MÉDIO</span></div>'+
                  '<div class="vx-fl-ins-stat"><span class="vl">'+nf(FLUXO.restante)+'</span><span class="lb">NO BACKLOG</span></div>'+
                  '<div class="vx-fl-ins-stat"><span class="vl">'+FLUXO.etaData+'</span><span class="lb">PREVISÃO</span></div>'+
                '</div>'+
              '</div>'+
            '</div>'
          : '')+
        (devolvido && Number(devolvido.value)>0
          ? '<div class="vx-fl-alert">⚠ <b>'+nf(devolvido.value)+'</b> devolução(ões) pendente(s) de correção</div>'
          : '')+
      '</div>';

    stages.forEach(function(n){
      var m=META[n.id]; if(!m) return;
      var el=document.querySelector('[data-filter-key="fl_'+n.id+'"]');
      if(el) el.addEventListener("click", function(){ setFilter("fl_"+n.id, m.test, n.label); });
    });
  })();

  /* ── evolução ── */
  (function evo(){
    var s=(KPIS.vistoriasPorDia||[]).map(function(d){ return typeof d==="object"?Number(d.total||d.value||0):Number(d||0); });
    if(!s.length) s=[0,0];
    var W=100,H=88,mx=Math.max.apply(null,s)||1,step=W/Math.max(1,s.length-1);
    var pts=s.map(function(y,i){ return [(i*step).toFixed(2),(H-8-(y/mx)*(H-20)).toFixed(2)]; });
    var line=pts.map(function(p,i){ return (i?"L":"M")+p[0]+" "+p[1]; }).join(" ");
    document.getElementById("vx-evo").innerHTML=
      '<svg viewBox="0 0 100 88" preserveAspectRatio="none" style="width:100%;height:104px;display:block">'+
        '<defs><linearGradient id="evog" x1="0" y1="0" x2="0" y2="1">'+
        '<stop offset="0%" stop-color="'+C.grn+'" stop-opacity=".35"/><stop offset="100%" stop-color="'+C.grn+'" stop-opacity="0"/></linearGradient></defs>'+
        '<path d="'+line+' L100 88 L0 88 Z" fill="url(#evog)"/>'+
        '<path d="'+line+'" fill="none" stroke="'+C.grn+'" stroke-width="1.8" vector-effect="non-scaling-stroke"/>'+
      '</svg>'+
      '<div style="display:flex;justify-content:space-between;font-size:9.5px;color:var(--faint);margin-top:4px">'+
      '<span>7 dias atrás</span><span>pico '+nf(mx)+'/dia</span><span>hoje</span></div>';
  })();

  /* ── distribuição (por município — só leitura, sem filtro por design:
     são dezenas de municípios, um donut "top 5 + outros" não mapeia bem
     pra um clique único de filtro) ── */
  (function dist(){
    var pal=[C.cyan,C.grn,C.amb,C.pur,C.red,"#14B8A6"];
    var e=Object.keys(MAPA.porRegiao||{}).map(function(k){ return [k,MAPA.porRegiao[k]]; });
    e.sort(function(a,b){ return b[1]-a[1]; });
    var top=e.slice(0,5), rest=e.slice(5).reduce(function(s,x){ return s+x[1]; },0);
    if(rest>0) top.push(["Outros",rest]);
    var tot=e.reduce(function(s,x){ return s+x[1]; },0)||1;
    var R=48,CIRC=2*Math.PI*R,acc=0;
    var arcs=top.map(function(x,i){
      var frac=x[1]/tot, len=CIRC*frac, dash=len+" "+(CIRC-len), off=-acc*CIRC; acc+=frac;
      return '<circle cx="60" cy="60" r="'+R+'" fill="none" stroke="'+pal[i%pal.length]+'" stroke-width="16" '+
        'stroke-dasharray="'+dash.replace(/(\d+\.\d\d)\d+/g,"$1")+'" stroke-dashoffset="'+off.toFixed(1)+'" transform="rotate(-90 60 60)"/>';
    }).join("");
    document.getElementById("vx-dist").innerHTML=
      '<div style="position:relative;width:132px;height:132px;flex:none">'+
        '<svg viewBox="0 0 120 120" style="width:132px;height:132px">'+arcs+'</svg>'+
        '<div style="position:absolute;inset:0;display:grid;place-items:center;text-align:center">'+
          '<div><div style="font-size:21px;font-weight:800;font-variant-numeric:tabular-nums">'+nf(tot)+'</div>'+
          '<div style="font-size:10px;color:var(--faint)">total</div></div>'+
        '</div>'+
      '</div>'+
      '<div class="vx-dist-lg">'+top.map(function(x,i){
        return '<div class="vx-dist-r"><i style="background:'+pal[i%pal.length]+'"></i>'+
          '<span>'+x[0]+'</span><b>'+Math.round(x[1]/tot*100)+'%</b></div>';
      }).join("")+'</div>';
  })();

  /* ══════════ MAPA ══════════ */
  var SM=MAPA.statusMeta||{};
  var SPGEO=<?= $spGeo ? json_encode($spGeo) : 'null' ?>;

  // Enquadramento pelo ESTADO (não pela nuvem de pontos) — é o estado que
  // define o "recorte" visível; os dados ficam dentro dele.
  var SPBB = SPGEO ? SPGEO.bbox : [-53.11,-25.31,-44.17,-19.78];
  var BOUNDS=[[SPBB[0],SPBB[1]],[SPBB[2],SPBB[3]]];

  // Ray-casting simples — só entra na camada operacional quem está DENTRO
  // do polígono real do estado (não só do bbox). Defensivo: hoje os 4.630
  // equipamentos já caem 100% dentro de SP, mas um dado futuro com
  // coordenada errada não pode vazar pro mapa estadual.
  function insidePolygon(lon, lat, ring) {
    var inside = false;
    for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      var xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
      var hit = ((yi > lat) !== (yj > lat)) && (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi);
      if (hit) inside = !inside;
    }
    return inside;
  }
  function insideSP(lon, lat) {
    if (!SPGEO) return true;
    var rings = SPGEO.mask.geometry.coordinates.slice(1); // [0] é o retângulo do mundo
    for (var i = 0; i < rings.length; i++) {
      if (insidePolygon(lon, lat, rings[i])) return true;
    }
    return false;
  }
  var FEATURES=(MAPA.features||[]).filter(function(f){
    var c=f.geometry.coordinates;
    return c[0] && c[1] && insideSP(c[0], c[1]);
  });

  // Centro real dos dados (não o centro geométrico do estado) — câmera
  // inicial abre já em cima de onde a operação de fato está, no zoom que
  // o usuário pediu (ainda dá pra ver hexágono/ponto individual, mas já
  // é uma boa fatia do território, não o estado inteiro espremido).
  var dSumLon=0, dSumLat=0, dN=0;
  FEATURES.forEach(function(f){ var c=f.geometry.coordinates; dSumLon+=c[0]; dSumLat+=c[1]; dN++; });
  var DATA_CENTER = dN ? [dSumLon/dN, dSumLat/dN] : [(SPBB[0]+SPBB[2])/2,(SPBB[1]+SPBB[3])/2];

  var map=new mapboxgl.Map({
    container:"vx-map",
    style:"mapbox://styles/mapbox/standard",
    projection:"mercator",
    center:DATA_CENTER, zoom:9.5, pitch:42, bearing:-14,
    antialias:true, attributionControl:false,
    // Trava a navegação dentro do estado (+ folga) — impossível arrastar até
    // o resto do Brasil, que era exatamente a reclamação.
    maxBounds:[[SPBB[0]-1.2,SPBB[1]-1.2],[SPBB[2]+1.2,SPBB[3]+1.2]],
    minZoom:5.8, maxZoom:17
  });
  map.addControl(new mapboxgl.AttributionControl({compact:true}));
  // interleaved:true (testado no round anterior pra corrigir o desalinhamento
  // dos pontos ao rotacionar) faz o deck.gl parar de renderizar QUALQUER
  // coisa junto do Mapbox Standard — provável incompatibilidade entre o
  // pipeline 3D do Standard e o modo interleaved dessa versão do deck.gl.
  // Voltando pro modo overlaid (padrão); a projeção mercator forçada já
  // deve segurar o desalinhamento sozinha, sem precisar do interleaved.
  var overlay=new deck.MapboxOverlay({layers:[]});

  map.on("load",function(){
    map.setProjection("mercator");
    // Câmera inicial já vem correta do construtor (DATA_CENTER/zoom 8.6) —
    // sem fitBounds aqui, que forçava reenquadrar o estado inteiro toda
    // vez e desfazia o zoom pedido. O botão "reenquadrar" (⤢) continua
    // usando fitBounds pra voltar à visão de estado quando o usuário quiser.
    if(map.setConfigProperty){
      // "dusk" em vez de "night" — terreno/vegetação/água aparecem com cor
      // real (verde, azul), não tudo achatado em tons quase pretos. Mais
      // realista e ainda com boa profundidade/atmosfera, só não tão escuro.
      map.setConfigProperty("basemap","lightPreset","dusk");
      map.setConfigProperty("basemap","showPointOfInterestLabels",false);
      map.setConfigProperty("basemap","showTransitLabels",false);
      // Nome de município nativo ligado (pedido explícito) — o filtro
      // geográfico via setFilter não funciona no Standard (layers de label
      // vivem dentro do sistema de "imports/fragments" do GL JS v3, não
      // aparecem em getStyle().layers), então cidade de estado vizinho bem
      // na borda pode eventualmente aparecer também; aceitável, já que a
      // câmera fica travada em SP (maxBounds) e o contorno abaixo já marca
      // visualmente onde termina o território operacional. Nome de rua
      // continua desligado (ruído, não ajuda a leitura do mapa).
      map.setConfigProperty("basemap","showPlaceLabels",true);
      map.setConfigProperty("basemap","showRoadLabels",false);
    }

    if(SPGEO){
      // Sem preenchimento opaco fora do estado — em zoom mais próximo isso
      // virava uma faixa preta/azul chapada na lateral (reclamação real).
      // O contorno fino da divisa continua marcando "aqui é o território
      // operacional", sem esconder o terreno ao redor.
      map.addSource("sp-line",{type:"geojson",data:SPGEO.outline});
      map.addLayer({id:"sp-glow",type:"line",source:"sp-line",slot:"top",
        layout:{"line-join":"round","line-cap":"round"},
        paint:{"line-color":"#38BDF8","line-width":4,"line-blur":4,"line-opacity":0.22}});
      map.addLayer({id:"sp-edge",type:"line",source:"sp-line",slot:"top",
        layout:{"line-join":"round","line-cap":"round"},
        paint:{"line-color":"#5EA9CC","line-width":1,"line-opacity":0.55}});
    }

    map.addControl(overlay);
    render();
    map.on("rotate",updateCompass);
    map.on("pitch",updateCompass);
    updateCompass();
  });

  /* Bússola: mostra a orientação real (bearing != 0) e, clicada, realinha
     o mapa pro norte — sem isso, um bearing fixo em -14° tira a referência
     de orientação de quem não está acostumado com mapa girado. */
  function updateCompass(){
    var el=document.getElementById("vx-compass");
    if(el) el.style.transform="rotate("+(-map.getBearing())+"deg)";
  }

  document.querySelectorAll(".vx-zb").forEach(function(b){
    b.addEventListener("click",function(){
      var z=this.dataset.z;
      if(z==="in") map.zoomIn();
      else if(z==="out") map.zoomOut();
      else map.fitBounds(BOUNDS,{padding:40,duration:700,pitch:48,bearing:-14});
    });
  });
  document.getElementById("vx-compass-btn").addEventListener("click",function(){
    map.easeTo({bearing:0,duration:500});
  });

  /* Painel de informação no HOVER (não precisa clicar) — inclui o botão
     "Ir para o Equipamento". Pra um botão sobreviver dentro de um tooltip
     de hover, ele não pode sumir assim que o mouse sai do ícone: uso um
     pequeno atraso (scheduleHide) que é cancelado se o mouse entrar no
     próprio painel (indo em direção ao botão) ou reaparecer sobre outro
     ícone antes do tempo acabar. */
  var hideTimer = null;
  function cancelHide(){ if(hideTimer){ clearTimeout(hideTimer); hideTimer=null; } }
  function scheduleHide(){
    cancelHide();
    hideTimer = setTimeout(closePopup, 220);
  }
  function closePopup(){ document.getElementById("vx-popup").style.display="none"; }
  function ppRow(icon, lb, vl, dotColor){
    var vlHtml = dotColor
      ? '<span class="pp-vl dot" style="color:'+dotColor+'"><i></i>'+esc(vl)+'</span>'
      : '<div class="pp-vl">'+esc(vl)+'</div>';
    return '<div class="pp-row"><div class="pp-ic">'+svg(icon)+'</div><div class="pp-txt">'+
      '<div class="pp-lb">'+esc(lb)+'</div>'+vlHtml+'</div></div>';
  }
  function openPopup(p,x,y){
    var m = SM[p.status] || {label:p.status, color:"#9CA0AA"};
    var badgeColor = p.status==="vistoriado" ? "#34D399" : m.color;
    var wrap = document.getElementById("vx-popup");
    var formUrl = "/front/networkequipment.form.php?id=" + encodeURIComponent(p.id);
    wrap.innerHTML =
      '<div class="pp-top">'+
        '<div><div class="pp-id">'+esc(p.nome)+'</div>'+
        '<span class="pp-badge" style="background:'+tint(badgeColor,.16)+'; color:'+badgeColor+'; '+
          'border:1px solid '+tint(badgeColor,.34)+'; box-shadow:0 0 14px '+tint(badgeColor,.22)+'">'+
          svg(IC.check)+esc(m.label)+'</span></div>'+
        '<button class="pp-close" id="pp-close-btn" title="Fechar" aria-label="Fechar">&times;</button>'+
      '</div>'+
      '<div class="pp-info">'+
        ppRow(IC.pin, "Município", p.regiao || "—") +
        ppRow(IC.calendar, "Data da vistoria", p.ultimaVistoria || "—") +
        ppRow(IC.user, "Técnico vistoriador", p.tecnicoNome || "— sem técnico —") +
        ppRow(IC.shield, "Status geral", p.statusGeral || "—", badgeColor) +
      '</div>'+
      '<a class="pp-btn" href="'+formUrl+'" target="_blank" rel="noopener">'+
        svg(IC.box)+'<span>Ir para o Equipamento</span>'+svg(IC.arrowRight,"pp-arrow")+'</a>';
    wrap.style.display="block";
    wrap.style.animation="none"; void wrap.offsetWidth; wrap.style.animation="";
    var pw = wrap.offsetWidth || 250, ph = wrap.offsetHeight || 210;
    var maxX = wrap.parentElement.clientWidth - pw - 10, maxY = wrap.parentElement.clientHeight - ph - 10;
    wrap.style.left = Math.max(8, Math.min(x+14, maxX)) + "px";
    wrap.style.top  = Math.max(8, Math.min(y+14, maxY)) + "px";
    document.getElementById("pp-close-btn").addEventListener("click", closePopup);
  }

  /* Chega de agregação/heatmap/zoom-dependente — pedido direto: hexágono
     pequeno em cima da coordenada REAL de cada equipamento, todos os
     4.630 plotados sempre, sem agrupar nada. Constrói um atlas de ícones
     (1 hexágono pequeno por status, cor real) uma vez só, e usa
     IconLayer — tamanho fixo em pixels, não infla/reduz com zoom nem H3
     nenhum por baixo. */
  var HEX_ICON_SIZE = 26; // px na atlas (a exibição em tela é getSize, menor)
  var statusKeys = Object.keys(SM).length ? Object.keys(SM) : ["a_vistoriar"];
  var atlasCanvas = document.createElement("canvas");
  atlasCanvas.width = HEX_ICON_SIZE * statusKeys.length;
  atlasCanvas.height = HEX_ICON_SIZE;
  var actx = atlasCanvas.getContext("2d");
  var ICON_MAPPING = {};
  statusKeys.forEach(function(key, i){
    var cx = i*HEX_ICON_SIZE + HEX_ICON_SIZE/2, cy = HEX_ICON_SIZE/2, r = HEX_ICON_SIZE/2 - 3;
    actx.beginPath();
    for (var a=0; a<6; a++){
      var ang = (Math.PI/180) * (60*a - 30); // hexágono "flat-top"
      var px = cx + r*Math.cos(ang), py = cy + r*Math.sin(ang);
      if (a===0) actx.moveTo(px,py); else actx.lineTo(px,py);
    }
    actx.closePath();
    actx.fillStyle = (SM[key]||{color:"#9CA0AA"}).color;
    actx.fill();
    actx.lineWidth = 1.3;
    actx.strokeStyle = "rgba(6,10,16,0.85)";
    actx.stroke();
    ICON_MAPPING[key] = {x:i*HEX_ICON_SIZE, y:0, width:HEX_ICON_SIZE, height:HEX_ICON_SIZE, anchorX:HEX_ICON_SIZE/2, anchorY:HEX_ICON_SIZE/2};
  });
  var ICON_ATLAS = atlasCanvas.toDataURL();

  // Painel da lupa: busca (já existente, só realocada) + montador de
  // filtro específico multi-critério — cada linha é [campo][valor],
  // combinadas com E, igual à pesquisa avançada do GLPI. Os filtros
  // "rápidos" (1 clique) ficam só nos cards abaixo do mapa agora.
  var FIELD_DEFS = [
    {key:"status", label:"Status", opts:Object.keys(SM).map(function(k){ return {v:k, label:SM[k].label}; }),
      test:function(v){ return function(p){ return p.status===v; }; }},
    {key:"statesId", label:"Status Geral", opts:(FILTROS.porStatusGeral||[]).map(function(it){ return {v:String(it.statesId), label:it.label}; }),
      test:function(v){ var n=Number(v); return function(p){ return p.statesId===n; }; }},
    {key:"concessionaria", label:"Concessionária", opts:(FILTROS.porConcessionaria||[]).map(function(it){ return {v:it.label, label:it.label}; }),
      test:function(v){ return function(p){ return (p.concessionaria||"Sem concessionária")===v; }; }},
    {key:"tipo", label:"Tipo de Equipamento", opts:Object.keys(MAPA.porTipo||{}).map(function(k){ return {v:k, label:k}; }),
      test:function(v){ return function(p){ return p.tipo===v; }; }},
    {key:"pendencia", label:"Pendência", opts:Object.keys(MAPA.porPendencia||{}).map(function(k){ return {v:k, label:k}; }),
      test:function(v){ return function(p){ return p.pendencia===v; }; }},
    {key:"regiao", label:"Município", opts:Object.keys(MAPA.porRegiao||{}).sort(function(a,b){ return a.localeCompare(b,"pt-BR"); }).map(function(k){ return {v:k, label:k}; }),
      test:function(v){ return function(p){ return p.regiao===v; }; }},
    {key:"tecnico", label:"Técnico vistoriador", opts:(TEC.tecnicos||[]).map(function(t){ return {v:t.nome, label:t.nome}; }),
      test:function(v){ return function(p){ return p.tecnicoNome===v; }; }}
  ];
  function fieldByKey(k){ return FIELD_DEFS.filter(function(f){ return f.key===k; })[0]; }
  var advRowsEl = document.getElementById("vx-adv-rows");
  function addAdvRow(){
    advRowsEl.insertAdjacentHTML("beforeend",
      '<div class="vx-adv-row">'+
        '<select class="vx-adv-field">'+FIELD_DEFS.map(function(f){ return '<option value="'+f.key+'">'+esc(f.label)+'</option>'; }).join("")+'</select>'+
        '<select class="vx-adv-value"></select>'+
        '<button class="vx-adv-rm" title="Remover critério">&times;</button>'+
      '</div>');
    var row = advRowsEl.lastElementChild;
    var fieldSel = row.querySelector(".vx-adv-field"), valueSel = row.querySelector(".vx-adv-value");
    function fillValues(){
      var f = fieldByKey(fieldSel.value);
      valueSel.innerHTML = (f?f.opts:[]).map(function(o){ return '<option value="'+esc(o.v)+'">'+esc(o.label)+'</option>'; }).join("");
    }
    fieldSel.addEventListener("change", fillValues);
    row.querySelector(".vx-adv-rm").addEventListener("click", function(){
      if(advRowsEl.children.length>1) row.remove();
    });
    fillValues();
  }
  document.getElementById("vx-adv-add").addEventListener("click", addAdvRow);
  document.getElementById("vx-adv-apply").addEventListener("click", function(){
    var criteria = [];
    advRowsEl.querySelectorAll(".vx-adv-row").forEach(function(row){
      var f = fieldByKey(row.querySelector(".vx-adv-field").value);
      var v = row.querySelector(".vx-adv-value").value;
      if(f && v){ criteria.push({label:f.label+": "+v, test:f.test(v)}); }
    });
    if(!criteria.length){ setFilter(null); closeSearchPanel(); return; }
    setFilterDirect("adv",
      function(p){ return criteria.every(function(c){ return c.test(p); }); },
      criteria.map(function(c){ return c.label; }).join("  +  "));
    closeSearchPanel();
  });
  document.getElementById("vx-adv-clear").addEventListener("click", function(){
    advRowsEl.innerHTML = "";
    addAdvRow();
    if(activeFilter && activeFilter.key==="adv") setFilter(null);
  });
  addAdvRow();

  var searchToggleBtn = document.getElementById("vx-search-toggle");
  var searchPanelEl = document.getElementById("vx-search-panel");
  function openSearchPanel(){
    searchPanelEl.classList.add("show");
    searchToggleBtn.classList.add("on");
    searchInput.focus();
  }
  function closeSearchPanel(){
    searchPanelEl.classList.remove("show");
    searchToggleBtn.classList.remove("on");
  }
  searchToggleBtn.addEventListener("click", function(ev){
    ev.stopPropagation();
    if(searchPanelEl.classList.contains("show")) closeSearchPanel(); else openSearchPanel();
  });

  function updateCount(){
    var n = currentData().length, tot = FEATURES.length;
    if(activeFilter){
      var span = document.querySelector("#vx-filter-chip span");
      if(span) span.textContent = "Filtro: "+activeFilter.label+"  ·  "+nf(n)+" de "+nf(tot);
    }
  }

  // Recorte ativo do mapa — quando há filtro (KPI, Status Geral,
  // Concessionária ou Por Equipamento), só os pontos que batem aparecem.
  // BUG que deixava o mapa vazio: Array.filter chama o teste com o
  // FEATURE inteiro ({type,geometry,properties}), não com "properties"
  // — toda função de teste (p.statesId, p.status, p.nome...) escreve
  // como se "p" já fosse properties. Corrige extraindo aqui, um lugar só.
  function currentData(){
    return activeFilter ? FEATURES.filter(function(f){ return activeFilter.test(f.properties); }) : FEATURES;
  }

  function render(){
    updateCount();
    var data = currentData();
    var layer = new deck.IconLayer({
      id:"equip-hex", data:data, pickable:true,
      iconAtlas:ICON_ATLAS, iconMapping:ICON_MAPPING,
      getIcon:function(d){ var s=d.properties.status; return ICON_MAPPING[s]?s:"a_vistoriar"; },
      sizeUnits:"pixels", getSize:12, sizeMinPixels:9, sizeMaxPixels:15,
      getPosition:function(d){ return d.geometry.coordinates; },
      onHover:function(i){
        if(!i.object){ scheduleHide(); return; }
        cancelHide();
        openPopup(i.object.properties, i.x, i.y);
      },
      onClick:function(i){
        // Mantido como reforço pra touch (celular/tablet não tem hover
        // de verdade) — mesmo painel, mesma função.
        if(!i.object) return;
        cancelHide();
        openPopup(i.object.properties, i.x, i.y);
      }
    });
    overlay.setProps({layers:[layer]});
  }
  onFilterChange = render;

  // Entrar no painel (indo em direção ao botão) cancela o fechamento;
  // sair de novo agenda o fechamento — assim o hover "atravessa" do ícone
  // pro painel sem sumir no meio do caminho.
  var popupEl = document.getElementById("vx-popup");
  popupEl.addEventListener("mouseenter", cancelHide);
  popupEl.addEventListener("mouseleave", scheduleHide);
})();
</script>
<?php
Html::footer();

function vx_ic(string $n): string
{
    static $p = [
        'grid'      => '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
        'map'       => '<path d="m9 4-6 2v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14"/><path d="M15 6v14"/>',
        'box'       => '<path d="M21 8v8a2 2 0 0 1-1 1.7l-7 4a2 2 0 0 1-2 0l-7-4A2 2 0 0 1 3 16V8a2 2 0 0 1 1-1.7l7-4a2 2 0 0 1 2 0l7 4A2 2 0 0 1 21 8z"/>',
        'clipboard' => '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>',
        'user'      => '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
        'alert'     => '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
        'file'      => '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
        'bell'      => '<path d="M6 8a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6Z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
        'cog'       => '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 9 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/>',
        'search'    => '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
    ];
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' . ($p[$n] ?? '') . '</svg>';
}

/**
 * Fundo de card com ilustração — gradiente branco protetor por cima (o
 * texto do card precisa continuar legível não importa onde a ilustração
 * fique mais carregada) + a imagem real, cobrindo o card inteiro.
 */
function vx_bg(string $webDir, string $file): string
{
    // Cache-busting por mtime real do arquivo — sem isso, trocar a imagem
    // no servidor não atualizava nada pra quem já tinha a URL antiga em
    // cache do navegador (mesmo nome de arquivo, mesma URL, 304 forever).
    $path = __DIR__ . '/../templates/assets/' . $file;
    $ver = is_file($path) ? filemtime($path) : time();
    return "background-image:linear-gradient(150deg, rgba(255,255,255,.5) 0%, rgba(255,255,255,.22) 45%, rgba(255,255,255,.05) 100%), url('{$webDir}/templates/assets/{$file}?v={$ver}');";
}
