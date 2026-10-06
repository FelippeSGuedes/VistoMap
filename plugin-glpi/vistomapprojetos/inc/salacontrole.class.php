<?php
/**
 * PluginVistomapprojetosSalaControle — "Sala de Controle": dashboards
 * nativos do VistoMap dentro do GLPI (mapas, gráficos e KPIs sobre o schema
 * inteiro do plugin — vistoria, instalação, devoluções, recusas, GPS,
 * auditoria). Página própria (menu_toadd['plugins']), separada do
 * Dashboard nativo do GLPI (PluginVistomapprojetosDashboardProvider) e da
 * tela de configuração (PluginVistomapprojetosConfig).
 *
 * Cada método `dataX()` devolve um array pronto pra virar JSON e alimentar
 * os componentes de front/sala.php — nenhum HTML é gerado aqui, só dado.
 *
 * @license GPL v2+
 */
class PluginVistomapprojetosSalaControle
{
    private const TABLE_FIELDS = 'glpi_plugin_fields_networkequipmentdispositivosderedes';
    private const TABLE_NE     = 'glpi_networkequipments';
    private const SITUACAO_COLUMN = 'plugin_fields_situaodavistoriafielddropdowns_id';

    // states_id nativo (glpi_states) — ciclo de vida do poste, compartilhado
    // entre Vistoria e Instalação (mesmos valores documentados em
    // src/lib/glpi/constants.ts do app Next.js — fonte da verdade única).
    private const STATE_EM_PROCESSO_VISTORIA = 1;
    private const STATE_AGUARDANDO_VISTORIA  = 2;
    private const STATE_LIBERADO_INSTALACAO  = 3;
    private const STATE_EM_INSTALACAO        = 4;
    private const STATE_INSTALADO            = 5;
    private const STATE_INSTALACAO_REJEITADA = 6;
    private const STATE_VISTORIADO           = 7;

    // "Aprovada" — testado contra produção (17/08): statusvistoria=Aprovado(3)
    // nunca é gravado pelo fluxo real (aprovarVistoria() no app grava Em
    // Análise, não Aprovado), dataaprovaoconcessionriafield está 100% vazio,
    // e situação=Revisitado(6) também não tem nenhum registro ainda — a
    // operação simplesmente não chegou nessa etapa. Mantemos os 3 sinais
    // reais (OR) pra já funcionar automaticamente quando o primeiro
    // acontecer, mas hoje o valor real É zero, não é bug.
    private const STATUS_VISTORIA_APROVADO = 3;
    private const SITUACAO_VISTORIADO      = 3;
    private const SITUACAO_REVISITADO      = 6;

    // Pendência (glpi_plugin_fields_pendnciafielddropdowns) — testado em
    // produção (18/08): id 0 (sem valor gravado) nunca recebe "Sem
    // Pendências" (id 3) explicitamente, o campo só é preenchido quando
    // HÁ pendência de fato. Tratamos 0 e 3 como o mesmo "sem pendência"
    // — é o significado real, não é dado inventado.
    private const PENDENCIA_CPFL   = 1;
    private const PENDENCIA_NANSEN = 2;
    private const PENDENCIA_NENHUMA = 3;

    // -----------------------------------------------------------------
    // Menu
    // -----------------------------------------------------------------

    public static function getMenuName(): string
    {
        return 'Sala de Controle';
    }

    public static function getMenuContent(): array
    {
        $menu = [];
        if (Session::haveRight('plugin_vistomapprojetos', READ)) {
            $menu['title'] = self::getMenuName();
            $menu['page']  = Plugin::getWebDir('vistomapprojetos') . '/front/geo-poc.php';
            $menu['icon']  = 'fas fa-satellite-dish';
        }
        return $menu;
    }

    // -----------------------------------------------------------------
    // Seção 1 — Visão geral (dado original, mantido)
    // -----------------------------------------------------------------

    /** Série diária (COUNT por DATE(coluna)), últimos $days dias, sempre com todo dia presente (0 se vazio). */
    private static function dailySeries(string $table, string $dateCol, int $days, array $extraWhere = []): array
    {
        global $DB;

        $since = date('Y-m-d 00:00:00', strtotime("-" . ($days - 1) . " days"));
        $rows = $DB->request([
            'SELECT'  => [new QueryExpression("DATE(`$dateCol`) AS d"), 'COUNT' => 'id AS cpt'],
            'FROM'    => $table,
            'WHERE'   => array_merge([$dateCol => ['>=', $since]], $extraWhere),
            'GROUPBY' => 'd',
        ]);
        $byDay = [];
        foreach ($rows as $r) {
            $byDay[$r['d']] = (int) $r['cpt'];
        }
        $series = [];
        for ($i = $days - 1; $i >= 0; $i--) {
            $d = date('Y-m-d', strtotime("-$i days"));
            $series[] = $byDay[$d] ?? 0;
        }
        return $series;
    }

    /** KPIs de topo — números crus + microsséries reais, formatação fica no JS. */
    public static function dataKpis(): array
    {
        global $DB;

        $totalEquip = (int) ($DB->request([
            'COUNT' => 'cpt',
            'FROM'  => self::TABLE_NE,
            'WHERE' => ['is_deleted' => 0],
        ])->current()['cpt'] ?? 0);

        $vistoriados = (int) ($DB->request([
            'COUNT' => 'cpt',
            'FROM'  => self::TABLE_NE,
            'WHERE' => ['is_deleted' => 0, 'states_id' => self::STATE_VISTORIADO],
        ])->current()['cpt'] ?? 0);

        // Técnicos: headcount com expediente ABERTO agora, separado por
        // pausa-almoço (mesma regra de src/lib/expediente.ts).
        $expedientesAbertos = iterator_to_array($DB->request([
            'SELECT' => ['users_id', 'pausa_almoco_inicio', 'pausa_almoco_fim'],
            'FROM'   => 'glpi_plugin_vistomap_expediente',
            'WHERE'  => ['fim_at' => null],
        ]));
        $tecnicosPausados = 0;
        foreach ($expedientesAbertos as $e) {
            if (!empty($e['pausa_almoco_inicio']) && empty($e['pausa_almoco_fim'])) {
                $tecnicosPausados++;
            }
        }
        $tecnicosAtivosTotal = count($expedientesAbertos);
        $tecnicosAtivos = $tecnicosAtivosTotal - $tecnicosPausados;

        $gpsPontos = (int) ($DB->request([
            'COUNT' => 'cpt',
            'FROM'  => 'glpi_plugin_vistomap_locations',
        ])->current()['cpt'] ?? 0);

        $auditEventos = (int) ($DB->request([
            'COUNT' => 'cpt',
            'FROM'  => 'glpi_plugin_vistomap_audit',
        ])->current()['cpt'] ?? 0);

        $devolucoes = (int) ($DB->request([
            'COUNT' => 'cpt',
            'FROM'  => 'glpi_plugin_vistomap_devolucoes',
        ])->current()['cpt'] ?? 0);

        $devolucoesPendentes = (int) ($DB->request([
            'COUNT' => 'cpt',
            'FROM'  => 'glpi_plugin_vistomap_devolucoes',
            'WHERE' => ['status' => 'PENDENTE'],
        ])->current()['cpt'] ?? 0);

        return [
            'totalEquip'     => $totalEquip,
            'vistoriados'    => $vistoriados,
            'vistoriadosPct' => $totalEquip > 0 ? round($vistoriados / $totalEquip * 100, 1) : 0,
            'tecnicosAtivos' => $tecnicosAtivos,
            'tecnicosPausados' => $tecnicosPausados,
            'tecnicosTotal'  => $tecnicosAtivosTotal,
            'gpsPontos'      => $gpsPontos,
            'auditEventos'   => $auditEventos,
            'devolucoes'     => $devolucoes,
            'devolucoesPendentes' => $devolucoesPendentes,
            // Microsséries — 7/14 dias reais, uma query agregada cada.
            'vistoriasPorDia'    => self::dailySeries('glpi_plugin_vistomap_audit', 'ts', 7, ['acao' => 'vistoria-finalizada']),
            'equipamentosPorDia' => self::dailySeries(self::TABLE_NE, 'date_creation', 14, ['is_deleted' => 0]),
            'eventosPorDia'      => self::dailySeries('glpi_plugin_vistomap_audit', 'ts', 7),
            'devolucoesPorDia'   => self::dailySeries('glpi_plugin_vistomap_devolucoes', 'criado_em', 7),
            'gpsPontosPorDia'    => self::dailySeries('glpi_plugin_vistomap_locations', 'created_at', 7),
        ];
    }

    /** Funil do ciclo de vida do poste — 1 hue só (ordinal, não categórico). */
    public static function dataFunil(): array
    {
        global $DB;

        $counts = self::statesCounts();
        $total = array_sum($counts);

        $stages = [
            ['label' => 'Aguardando Vistoria',     'value' => $counts[self::STATE_AGUARDANDO_VISTORIA]  ?? 0],
            ['label' => 'Em Processo de Vistoria', 'value' => $counts[self::STATE_EM_PROCESSO_VISTORIA] ?? 0],
            ['label' => 'Vistoriado',              'value' => $counts[self::STATE_VISTORIADO]           ?? 0],
            ['label' => 'Liberado p/ Instalação',  'value' => $counts[self::STATE_LIBERADO_INSTALACAO]  ?? 0],
            ['label' => 'Em Instalação',           'value' => $counts[self::STATE_EM_INSTALACAO]        ?? 0],
            ['label' => 'Instalado',               'value' => $counts[self::STATE_INSTALADO]            ?? 0],
        ];

        return ['stages' => $stages, 'total' => $total];
    }

    /** Extensão do funil — validação CPFL da instalação, mesmo estilo. */
    public static function dataValidacaoCpfl(): array
    {
        global $DB;

        $rows = $DB->request([
            'SELECT'     => ['vc.name AS nome', 'COUNT' => 'f.items_id AS cpt'],
            'FROM'       => self::TABLE_FIELDS . ' AS f',
            'INNER JOIN' => [self::TABLE_NE . ' AS ne' => ['ON' => ['f' => 'items_id', 'ne' => 'id']]],
            'LEFT JOIN'  => [
                'glpi_plugin_fields_validaocpflfielddropdowns AS vc' => [
                    'ON' => ['f' => 'plugin_fields_validaocpflfielddropdowns_id', 'vc' => 'id'],
                ],
            ],
            'WHERE'   => ['ne.is_deleted' => 0],
            'GROUPBY' => 'nome',
        ]);

        $data = [];
        foreach ($rows as $r) {
            $data[] = ['label' => $r['nome'] ?? 'Sem validação', 'value' => (int) $r['cpt']];
        }
        usort($data, static fn($a, $b) => $b['value'] <=> $a['value']);
        return $data;
    }

    /** Proporção da situação da vistoria — vira treemap. */
    public static function dataSituacao(): array
    {
        global $DB;

        $ordem = [
            1 => 'A Vistoriar', 2 => 'Em Vistoria', 3 => 'Vistoriado',
            4 => 'Aguardando Revisita', 5 => 'Em Revisita', 6 => 'Revisitado',
            7 => 'Em Deslocamento', 8 => 'Devolvida para Correção',
        ];

        $rows = $DB->request([
            'SELECT'     => ['f.' . self::SITUACAO_COLUMN . ' AS situacao_id', 'COUNT' => 'f.items_id AS cpt'],
            'FROM'       => self::TABLE_FIELDS . ' AS f',
            'INNER JOIN' => [self::TABLE_NE . ' AS ne' => ['ON' => ['f' => 'items_id', 'ne' => 'id']]],
            'WHERE'      => ['ne.is_deleted' => 0],
            'GROUPBY'    => 'situacao_id',
        ]);

        $data = [];
        foreach ($rows as $r) {
            $id  = (int) $r['situacao_id'];
            $cpt = (int) $r['cpt'];
            if ($cpt === 0) {
                continue;
            }
            $data[] = ['label' => $ordem[$id] ?? 'Indefinido', 'value' => $cpt];
        }
        usort($data, static fn($a, $b) => $b['value'] <=> $a['value']);
        return $data;
    }

    /** Postes nunca vistoriados, com coordenada — vira mapa (scatter). */
    public static function dataMapaNuncaVistoriado(): array
    {
        global $DB;

        $rows = $DB->request([
            'SELECT'     => ['f.latitudefield AS lat', 'f.longitudefield AS lon'],
            'FROM'       => self::TABLE_FIELDS . ' AS f',
            'INNER JOIN' => [self::TABLE_NE . ' AS ne' => ['ON' => ['f' => 'items_id', 'ne' => 'id']]],
            'WHERE'      => [
                'ne.is_deleted'          => 0,
                'f.datadavistoriafield'  => null,
                'f.latitudefield'        => ['<>', ''],
                'f.longitudefield'       => ['<>', ''],
            ],
            'LIMIT' => 4000,
        ]);

        $pts = [];
        foreach ($rows as $r) {
            $lat = (float) str_replace(',', '.', (string) $r['lat']);
            $lon = (float) str_replace(',', '.', (string) $r['lon']);
            if ($lat === 0.0 || $lon === 0.0) {
                continue;
            }
            $pts[] = ['la' => round($lat, 4), 'lo' => round($lon, 4)];
        }
        return ['points' => $pts, 'total' => count($pts)];
    }

    // -----------------------------------------------------------------
    // Sala de Controle v2 — núcleo (Fase 1)
    // -----------------------------------------------------------------

    /** Contagem crua por states_id — reusada por dataFunil()/dataHealth()/dataFluxo(). */
    private static function statesCounts(): array
    {
        global $DB;

        $rows = $DB->request([
            'SELECT'  => ['states_id', 'COUNT' => 'id AS cpt'],
            'FROM'    => self::TABLE_NE,
            'WHERE'   => ['is_deleted' => 0],
            'GROUPBY' => 'states_id',
        ]);

        $counts = [];
        foreach ($rows as $r) {
            $counts[(int) $r['states_id']] = (int) $r['cpt'];
        }
        return $counts;
    }

    /**
     * KPIs de filtro (cards clicáveis que recortam o mapa) + os 2 "dash"
     * de composição — Status Geral (states_id nativo) e Concessionária
     * (plugin_fields_concessionriafielddropdowns_id, bem populado: CPFL
     * Paulista/Piratininga/Santa Cruz). Tudo contagem real, sem mock.
     */
    public static function dataFiltrosMapa(): array
    {
        global $DB;

        $counts = self::statesCounts();
        $equipamentosAtivos = array_sum($counts);
        $vistoriasPendentes = ($counts[self::STATE_EM_PROCESSO_VISTORIA] ?? 0) + ($counts[self::STATE_AGUARDANDO_VISTORIA] ?? 0);
        // "Vistorias concluídas" passa a refletir a Situação da Vistoria
        // (Vistoriado ou Revisitado), não mais o Status Geral nativo
        // (states_id) — pedido do usuário 2026-09-17: Situação da Vistoria
        // é o campo certo pra medir a vistoria em si; states_id mede o
        // ciclo de vida do poste (compartilhado com Instalação), não a
        // vistoria.
        $vistoriasConcluidas = (int) ($DB->request([
            'COUNT' => 'cpt',
            'FROM'  => self::TABLE_FIELDS . ' AS f',
            'INNER JOIN' => [self::TABLE_NE . ' AS ne' => ['ON' => ['f' => 'items_id', 'ne' => 'id']]],
            'WHERE' => [
                'ne.is_deleted' => 0,
                'f.' . self::SITUACAO_COLUMN => [self::SITUACAO_VISTORIADO, self::SITUACAO_REVISITADO],
            ],
        ])->current()['cpt'] ?? 0);
        $instalacaoPendente = ($counts[self::STATE_LIBERADO_INSTALACAO] ?? 0) + ($counts[self::STATE_EM_INSTALACAO] ?? 0);
        $instalacaoAprovada = $counts[self::STATE_INSTALADO] ?? 0;

        // 3 sinais reais de aprovação, nenhum populado hoje (ver comentário
        // nas constantes) — soma dá 0 agora, passa a refletir a realidade
        // automaticamente assim que a operação chegar nessa etapa.
        $vistoriasAprovadas = (int) ($DB->request([
            'COUNT' => 'cpt',
            'FROM'  => self::TABLE_FIELDS . ' AS f',
            'INNER JOIN' => [self::TABLE_NE . ' AS ne' => ['ON' => ['f' => 'items_id', 'ne' => 'id']]],
            'WHERE' => [
                'ne.is_deleted' => 0,
                'OR' => [
                    'f.' . self::SITUACAO_COLUMN => self::SITUACAO_REVISITADO,
                    'f.plugin_fields_statusvistoriafielddropdowns_id' => self::STATUS_VISTORIA_APROVADO,
                    ['f.dataaprovaoconcessionriafield' => ['<>', null]],
                ],
            ],
        ])->current()['cpt'] ?? 0);

        $tecnicosAtivosTotal = (int) ($DB->request([
            'COUNT' => 'cpt',
            'FROM'  => 'glpi_plugin_vistomap_expediente',
            'WHERE' => ['fim_at' => null],
        ])->current()['cpt'] ?? 0);

        // Status Geral — labels nativas do GLPI (glpi_states), não texto
        // fixo nosso, pra nunca destoar se alguém renomear um status lá.
        $statusGeralRows = $DB->request([
            'SELECT' => ['ne.states_id AS sid', 'st.name AS label', 'COUNT' => 'ne.id AS cpt'],
            'FROM'   => self::TABLE_NE . ' AS ne',
            'LEFT JOIN' => ['glpi_states AS st' => ['ON' => ['ne' => 'states_id', 'st' => 'id']]],
            'WHERE'  => ['ne.is_deleted' => 0],
            'GROUPBY' => ['ne.states_id', 'st.name'],
        ]);
        $porStatusGeral = [];
        foreach ($statusGeralRows as $r) {
            $porStatusGeral[] = ['statesId' => (int) $r['sid'], 'label' => $r['label'] ?: '—', 'value' => (int) $r['cpt']];
        }
        usort($porStatusGeral, fn($a, $b) => $b['value'] <=> $a['value']);

        $concRows = $DB->request([
            'SELECT' => ['c.name AS label', 'COUNT' => 'f.id AS cpt'],
            'FROM'   => self::TABLE_FIELDS . ' AS f',
            'INNER JOIN' => [self::TABLE_NE . ' AS ne' => ['ON' => ['f' => 'items_id', 'ne' => 'id']]],
            'LEFT JOIN' => [
                'glpi_plugin_fields_concessionriafielddropdowns AS c' => [
                    'ON' => ['f' => 'plugin_fields_concessionriafielddropdowns_id', 'c' => 'id'],
                ],
            ],
            'WHERE' => ['ne.is_deleted' => 0],
            'GROUPBY' => 'c.name',
        ]);
        $porConcessionaria = [];
        foreach ($concRows as $r) {
            $porConcessionaria[] = ['label' => $r['label'] ?: 'Sem concessionária', 'value' => (int) $r['cpt']];
        }
        usort($porConcessionaria, fn($a, $b) => $b['value'] <=> $a['value']);

        return [
            'kpis' => [
                'equipamentosAtivos'  => $equipamentosAtivos,
                'vistoriasConcluidas' => $vistoriasConcluidas,
                'vistoriasPendentes'  => $vistoriasPendentes,
                'vistoriasAprovadas'  => $vistoriasAprovadas,
                'instalacaoPendente'  => $instalacaoPendente,
                'instalacaoAprovada'  => $instalacaoAprovada,
                'tecnicosEmCampo'     => $tecnicosAtivosTotal,
            ],
            'porStatusGeral'    => $porStatusGeral,
            'porConcessionaria' => $porConcessionaria,
        ];
    }

    /**
     * Operation Health — score composto 0-100.
     * 4 dos 5 fatores vêm de dado real; "qualidade de sinal" é mock
     * determinístico (RSSI/LQI não existem no schema hoje — nenhum
     * dispositivo de campo reporta telemetria de rádio pro backend ainda).
     * Pesos documentados abaixo, somam 100.
     */
    public static function dataHealth(): array
    {
        global $DB;

        $counts = self::statesCounts();
        $totalEquip = array_sum($counts);
        $aguardando = $counts[self::STATE_AGUARDANDO_VISTORIA] ?? 0;
        $vistoriado = $counts[self::STATE_VISTORIADO] ?? 0;
        $liberado   = $counts[self::STATE_LIBERADO_INSTALACAO] ?? 0;
        $emInst     = $counts[self::STATE_EM_INSTALACAO] ?? 0;
        $instalado  = $counts[self::STATE_INSTALADO] ?? 0;
        $aprovado   = $liberado + $emInst + $instalado;

        // Disponibilidade: fração da base que já saiu do zero (não está
        // mais "aguardando") — quanto da operação está em movimento.
        $disponibilidade = $totalEquip > 0
            ? round((($totalEquip - $aguardando) / $totalEquip) * 100, 1)
            : 100.0;

        // Qualidade de sinal: MOCK — sem fonte real (ver docblock). Valor
        // determinístico (não aleatório a cada request) baseado no dia do
        // ano, só pra não ficar estático 100% do tempo em ambiente de demo.
        $seed = (int) date('z');
        $qualidadeSinal = round(88 + (sin($seed / 3) * 4), 1);

        // Produtividade: vistorias concluídas hoje por técnico ativo, contra
        // uma meta de referência (8/técnico/dia — ajustável conforme dado
        // real de campo acumular histórico suficiente pra virar percentil).
        $tecnicosAtivos = max(1, iterator_count($DB->request([
            'SELECT'  => 'users_id',
            'FROM'    => 'glpi_plugin_vistomap_expediente',
            'WHERE'   => ['fim_at' => null],
            'GROUPBY' => 'users_id',
        ])));
        $vistoriasHoje = (int) ($DB->request([
            'COUNT' => 'cpt',
            'FROM'  => 'glpi_plugin_vistomap_audit',
            'WHERE' => ['acao' => 'vistoria-finalizada', 'ts' => ['>=', date('Y-m-d 00:00:00')]],
        ])->current()['cpt'] ?? 0);
        $metaPorTecnico = 8;
        $produtividade = min(100, round(($vistoriasHoje / ($tecnicosAtivos * $metaPorTecnico)) * 100, 1));

        // Backlog: quanto da base ainda não processada, invertido (mais
        // aguardando = score menor).
        $backlog = $totalEquip > 0
            ? round((1 - ($aguardando / $totalEquip)) * 100, 1)
            : 100.0;

        // Devoluções: fração de vistorias concluídas que NÃO geraram
        // devolução pendente.
        $devolucoesPendentes = (int) ($DB->request([
            'COUNT' => 'cpt',
            'FROM'  => 'glpi_plugin_vistomap_devolucoes',
            'WHERE' => ['status' => 'PENDENTE'],
        ])->current()['cpt'] ?? 0);
        $baseDevolucao = max(1, $vistoriado + $aprovado);
        $devolucoesScore = round((1 - min(1, $devolucoesPendentes / $baseDevolucao)) * 100, 1);

        $factors = [
            ['key' => 'disponibilidade', 'label' => 'Disponibilidade', 'value' => $disponibilidade, 'weight' => 0.25],
            ['key' => 'sinal',           'label' => 'Qualidade de sinal', 'value' => $qualidadeSinal, 'weight' => 0.15, 'mock' => true],
            ['key' => 'produtividade',   'label' => 'Produtividade', 'value' => $produtividade, 'weight' => 0.25],
            ['key' => 'backlog',         'label' => 'Backlog', 'value' => $backlog, 'weight' => 0.2],
            ['key' => 'devolucoes',      'label' => 'Devoluções', 'value' => $devolucoesScore, 'weight' => 0.15],
        ];

        $score = 0.0;
        foreach ($factors as $f) {
            $score += $f['value'] * $f['weight'];
        }
        $score = (int) round($score);

        $status = $score >= 80 ? 'good' : ($score >= 60 ? 'warn' : 'crit');
        $statusLabel = $score >= 80 ? 'Operação saudável' : ($score >= 60 ? 'Atenção' : 'Operação crítica');

        return [
            'score'       => $score,
            'status'      => $status,
            'statusLabel' => $statusLabel,
            'factors'     => $factors,
        ];
    }

    /**
     * Fluxo Operacional — dado pronto pra visualização tipo Sankey.
     * Cadeia linear (Aguardando → Em Vistoria → Vistoriado) que se
     * ramifica no fim em Aprovado / Devolvido.
     */
    public static function dataFluxo(): array
    {
        global $DB;

        $counts = self::statesCounts();
        $aguardando = $counts[self::STATE_AGUARDANDO_VISTORIA] ?? 0;
        $emProcesso = $counts[self::STATE_EM_PROCESSO_VISTORIA] ?? 0;
        $vistoriado = $counts[self::STATE_VISTORIADO] ?? 0;
        $liberado   = $counts[self::STATE_LIBERADO_INSTALACAO] ?? 0;
        $emInst     = $counts[self::STATE_EM_INSTALACAO] ?? 0;
        $instalado  = $counts[self::STATE_INSTALADO] ?? 0;
        $aprovado   = $liberado + $emInst + $instalado;

        $devolvido = (int) ($DB->request([
            'COUNT' => 'cpt',
            'FROM'  => 'glpi_plugin_vistomap_devolucoes',
            'WHERE' => ['status' => 'PENDENTE'],
        ])->current()['cpt'] ?? 0);

        $nodes = [
            ['id' => 'aguardando', 'label' => 'Aguardando Vistoria', 'value' => $aguardando, 'stage' => 0],
            ['id' => 'processo',   'label' => 'Em Processo',         'value' => $emProcesso, 'stage' => 1],
            ['id' => 'vistoriado', 'label' => 'Vistoriado',          'value' => $vistoriado, 'stage' => 2],
            ['id' => 'aprovado',   'label' => 'Aprovado',            'value' => $aprovado,   'stage' => 3, 'kind' => 'good'],
            ['id' => 'devolvido',  'label' => 'Devolvido',           'value' => $devolvido,  'stage' => 3, 'kind' => 'crit'],
        ];

        $links = [
            ['source' => 'aguardando', 'target' => 'processo',   'value' => min($aguardando, max($emProcesso, 1))],
            ['source' => 'processo',   'target' => 'vistoriado', 'value' => $vistoriado],
            ['source' => 'vistoriado', 'target' => 'aprovado',   'value' => $aprovado],
            ['source' => 'vistoriado', 'target' => 'devolvido',  'value' => $devolvido],
        ];

        // Ritmo real (vistorias/dia) — média só dos dias com pelo menos 1
        // evento "vistoria-finalizada" nos últimos 14 dias, pra fim de
        // semana/dia parado não puxar a média pra baixo artificialmente.
        // Alimenta a previsão de conclusão do backlog no card Fluxo.
        $serieVistorias = self::dailySeries('glpi_plugin_vistomap_audit', 'ts', 14, ['acao' => 'vistoria-finalizada']);
        $diasComRitmo = array_filter($serieVistorias, static fn($v) => $v > 0);
        $ritmoDiario = $diasComRitmo ? round(array_sum($diasComRitmo) / count($diasComRitmo), 1) : 0.0;
        $restante = $aguardando + $emProcesso;
        $etaDias = $ritmoDiario > 0 ? (int) ceil($restante / $ritmoDiario) : null;
        $etaData = $etaDias !== null ? date('d/m', strtotime("+$etaDias days")) : null;

        return [
            'nodes' => $nodes,
            'links' => $links,
            'ritmoDiario' => $ritmoDiario,
            'restante' => $restante,
            'etaDias' => $etaDias,
            'etaData' => $etaData,
        ];
    }

    /**
     * Técnicos em Campo — nome + município de quem está com expediente
     * aberto agora. O município NÃO vem de geocoding externo: é o
     * equipamento cadastrado mais próximo da última posição GPS real do
     * técnico (glpi_plugin_vistomap_locations), por distância planar —
     * suficiente pra "vizinho mais próximo" na escala de um estado e sem
     * depender de nenhuma API paga.
     */
    public static function dataTecnicosEmCampo(): array
    {
        global $DB;

        $abertos = iterator_to_array($DB->request([
            'SELECT' => ['users_id', 'pausa_almoco_inicio', 'pausa_almoco_fim'],
            'FROM'   => 'glpi_plugin_vistomap_expediente',
            'WHERE'  => ['fim_at' => null],
        ]));
        if (!$abertos) {
            return ['tecnicos' => [], 'total' => 0];
        }

        $userIds = array_values(array_unique(array_map(static fn($e) => (int) $e['users_id'], $abertos)));
        $pausado = [];
        foreach ($abertos as $e) {
            $uid = (int) $e['users_id'];
            $pausado[$uid] = !empty($e['pausa_almoco_inicio']) && empty($e['pausa_almoco_fim']);
        }

        $nomes = [];
        foreach ($DB->request([
            'SELECT' => ['id', 'firstname', 'realname', 'name'],
            'FROM'   => 'glpi_users',
            'WHERE'  => ['id' => $userIds],
        ]) as $u) {
            $full = trim(($u['firstname'] ?? '') . ' ' . ($u['realname'] ?? ''));
            $nomes[(int) $u['id']] = $full !== '' ? $full : ($u['name'] ?? ('Usuário #' . $u['id']));
        }

        // Última posição de cada técnico — 1 linha por users_id, sem
        // window function (portável entre versões de MariaDB): busca as
        // últimas 2 dias de pings (mais que suficiente pra achar "a mais
        // recente") já ordenado, e fica só com a primeira linha por uid.
        $ultimaPos = [];
        foreach ($DB->request([
            'SELECT' => ['users_id', 'latitude', 'longitude', 'created_at'],
            'FROM'   => 'glpi_plugin_vistomap_locations',
            'WHERE'  => [
                'users_id'   => $userIds,
                'created_at' => ['>=', date('Y-m-d H:i:s', strtotime('-2 days'))],
            ],
            'ORDER'  => ['users_id', 'created_at DESC'],
        ]) as $r) {
            $uid = (int) $r['users_id'];
            if (!isset($ultimaPos[$uid])) {
                $ultimaPos[$uid] = $r;
            }
        }

        $equipPontos = iterator_to_array($DB->request([
            'SELECT' => ['f.latitudefield AS lat', 'f.longitudefield AS lon', 'f.municipiofield AS municipio'],
            'FROM'   => self::TABLE_FIELDS . ' AS f',
            'INNER JOIN' => [self::TABLE_NE . ' AS ne' => ['ON' => ['f' => 'items_id', 'ne' => 'id']]],
            'WHERE'  => [
                'ne.is_deleted'    => 0,
                'f.latitudefield'  => ['<>', ''],
                'f.longitudefield' => ['<>', ''],
                ['f.municipiofield' => ['<>', '']],
            ],
        ]));

        $tecnicos = [];
        foreach ($userIds as $uid) {
            $pos = $ultimaPos[$uid] ?? null;
            $municipio = null;
            $minutosAtras = null;
            if ($pos) {
                $lat = (float) str_replace(',', '.', (string) $pos['latitude']);
                $lon = (float) str_replace(',', '.', (string) $pos['longitude']);
                $municipio = self::municipioMaisProximo($lat, $lon, $equipPontos);
                $minutosAtras = (int) round((time() - strtotime($pos['created_at'])) / 60);
            }
            $tecnicos[] = [
                'nome'         => $nomes[$uid] ?? ('Usuário #' . $uid),
                'municipio'    => $municipio,
                'pausado'      => $pausado[$uid] ?? false,
                'minutosAtras' => $minutosAtras,
            ];
        }

        usort($tecnicos, static fn($a, $b) => strcasecmp($a['nome'], $b['nome']));

        return ['tecnicos' => $tecnicos, 'total' => count($tecnicos)];
    }

    /** Vizinho mais próximo por distância planar (equirectangular) — barata o bastante pra rodar por técnico sem índice espacial. */
    private static function municipioMaisProximo(float $lat, float $lon, array $pontos): ?string
    {
        $melhorDist = null;
        $melhorMun = null;
        $cosLat = cos(deg2rad($lat));
        foreach ($pontos as $p) {
            $plat = (float) str_replace(',', '.', (string) $p['lat']);
            $plon = (float) str_replace(',', '.', (string) $p['lon']);
            if ($plat === 0.0 || $plon === 0.0) {
                continue;
            }
            $dLat = $plat - $lat;
            $dLon = ($plon - $lon) * $cosLat;
            $dist = $dLat * $dLat + $dLon * $dLon;
            if ($melhorDist === null || $dist < $melhorDist) {
                $melhorDist = $dist;
                $melhorMun = trim((string) $p['municipio']);
            }
        }
        return $melhorMun !== '' ? $melhorMun : null;
    }

    /**
     * Mapa Operacional — GeoJSON de todos os equipamentos com coordenada.
     * Classificação de status por regra de negócio real (states_id +
     * devolução pendente + idade do backlog), sem telemetria inventada.
     */
    public static function dataMapaOperacional(): array
    {
        global $DB;

        // Devolução pendente mais recente por equipamento — pra marcar
        // "reprovado" no mapa. Guarda a DATA (não só um booleano): se a
        // vistoria foi refeita DEPOIS da devolução ter sido aberta, ela é
        // lixo órfão (ninguém marcou como resolvida quando a vistoria foi
        // corrigida) e não deve mais contar como problema atual — achado
        // real em produção (CAM-P-A-129: devolução de 31/07 sobrevivendo
        // a uma vistoria refeita em 05/08, aparecendo como reprovado
        // mesmo já corrigido).
        $devolucaoPendentePorAlvo = [];
        foreach ($DB->request([
            'SELECT'  => ['equipamento', 'MAX' => 'criado_em AS ultima'],
            'FROM'    => 'glpi_plugin_vistomap_devolucoes',
            'WHERE'   => ['status' => 'PENDENTE'],
            'GROUPBY' => 'equipamento',
        ]) as $r) {
            $devolucaoPendentePorAlvo[$r['equipamento']] = $r['ultima'];
        }

        $rows = $DB->request([
            'SELECT' => [
                'ne.id AS id', 'ne.name AS nome', 'ne.states_id AS states_id',
                'ne.date_creation AS criado_em',
                'f.latitudefield AS lat', 'f.longitudefield AS lon',
                'f.datadavistoriafield AS data_vistoria',
                'f.' . self::SITUACAO_COLUMN . ' AS situacao_id',
                'f.users_id_vistoriadorafield AS tecnico_id',
                'f.municipiofield AS municipio',
                'ta.name AS tipo_antena',
                'eq.name AS tipo_equipamento',
                'st.name AS status_geral_nome',
                'tec.firstname AS tec_firstname', 'tec.realname AS tec_realname', 'tec.name AS tec_login',
                'f.plugin_fields_statusvistoriafielddropdowns_id AS status_vistoria_id',
                'f.dataaprovaoconcessionriafield AS data_aprovacao',
                'c.name AS concessionaria',
                'f.plugin_fields_pendnciafielddropdowns_id AS pendencia_id',
            ],
            'FROM'       => self::TABLE_FIELDS . ' AS f',
            'INNER JOIN' => [self::TABLE_NE . ' AS ne' => ['ON' => ['f' => 'items_id', 'ne' => 'id']]],
            'LEFT JOIN'  => [
                'glpi_plugin_fields_tipodeantenafielddropdowns AS ta' => [
                    'ON' => ['f' => 'plugin_fields_tipodeantenafielddropdowns_id', 'ta' => 'id'],
                ],
                // Tipo de equipamento REAL (DCU/Repetidor) — antes o card
                // "Por Equipamento" usava um P/G/S extraído do NOME
                // (2º segmento), que não é o tipo de equipamento de
                // verdade. Achado em produção (17/08): esse dropdown só
                // tem 2 valores populados, DCU (3.883) e Repetidor (747).
                'glpi_plugin_fields_equipamentofielddropdowns AS eq' => [
                    'ON' => ['f' => 'plugin_fields_equipamentofielddropdowns_id', 'eq' => 'id'],
                ],
                'glpi_states AS st' => ['ON' => ['ne' => 'states_id', 'st' => 'id']],
                'glpi_users AS tec' => ['ON' => ['f' => 'users_id_vistoriadorafield', 'tec' => 'id']],
                'glpi_plugin_fields_concessionriafielddropdowns AS c' => [
                    'ON' => ['f' => 'plugin_fields_concessionriafielddropdowns_id', 'c' => 'id'],
                ],
            ],
            'WHERE'      => [
                'ne.is_deleted'    => 0,
                'f.latitudefield'  => ['<>', ''],
                'f.longitudefield' => ['<>', ''],
            ],
            'LIMIT' => 8000,
        ]);

        $situacaoLabel = [
            1 => 'A Vistoriar', 2 => 'Em Vistoria', 3 => 'Vistoriado',
            4 => 'Aguardando Revisita', 5 => 'Em Revisita', 6 => 'Revisitado',
            7 => 'Em Deslocamento', 8 => 'Devolvida para Correção',
        ];

        // 11 status reais, combinando os 2 campos do GLPI — pedido explícito
        // do usuário 2026-08-13: "verificar nos 2 campos Situação da
        // Vistoria e Status Geral... se tiver algo como INSTALADO ou EM
        // INSTALAÇÃO priorizar isso". Regra: quando states_id (Status
        // Geral) já saiu do ciclo de vistoria (liberado/em instalação/
        // instalado/rejeitado), ele manda; senão, quem decide é a
        // Situação da Vistoria (mais granular). Atualizado 2026-09-17:
        // Aguardando Revisita, Em Revisita e Revisitado ganharam bucket e
        // cor próprios — antes caíam escondidos dentro de Atribuído/A
        // Vistoriar, Em Vistoria e Vistoriado, sem diferenciação visual.
        $STATUS_META = [
            'a_vistoriar'         => ['label' => 'A Vistoriar',              'color' => '#9CA0AA'],
            'atribuido'           => ['label' => 'Atribuído',                'color' => '#D97706'],
            'em_vistoria'         => ['label' => 'Em Vistoria',              'color' => '#2563EB'],
            'aguardando_revisita' => ['label' => 'Aguardando Revisita',      'color' => '#F97316'],
            'em_revisita'         => ['label' => 'Em Revisita',              'color' => '#0EA5E9'],
            'deslocamento'        => ['label' => 'Em Deslocamento',          'color' => '#DB2777'],
            'vistoriado'          => ['label' => 'Vistoriado',               'color' => '#16A34A'],
            'revisitado'          => ['label' => 'Revisitado',               'color' => '#10B981'],
            'liberado'            => ['label' => 'Liberado p/ Instalação',   'color' => '#7C3AED'],
            'em_instalacao'       => ['label' => 'Em Instalação',            'color' => '#0D9488'],
            'instalado'           => ['label' => 'Instalado',                'color' => '#0F766E'],
            'reprovado'           => ['label' => 'Reprovado',                'color' => '#DC2626'],
        ];

        $features = [];
        $counts = array_fill_keys(array_keys($STATUS_META), 0);
        $porRegiao = [];
        $tipos = [];
        $pendencias = [];

        foreach ($rows as $r) {
            $lat = (float) str_replace(',', '.', (string) $r['lat']);
            $lon = (float) str_replace(',', '.', (string) $r['lon']);
            if ($lat === 0.0 || $lon === 0.0) {
                continue;
            }

            $statesId = (int) $r['states_id'];
            $situacaoId = (int) $r['situacao_id'];
            // Colunas GLPI Fields nunca ficam NULL: "sem técnico" é 0, não
            // NULL — checar "!== null" classificava TODO equipamento sem
            // técnico como "Atribuído" (achado real: CAM-P-A-453).
            $temTecnico = ((int) $r['tecnico_id']) > 0;

            // Devolução só conta como "reprovado" se for MAIS RECENTE que a
            // última vistoria — senão é órfã de uma vistoria já corrigida
            // (ver comentário acima de onde $devolucaoPendentePorAlvo é
            // montado).
            $ultimaDevolucao = $devolucaoPendentePorAlvo[$r['nome']] ?? null;
            $temDevolucaoPendente = $ultimaDevolucao !== null
                && ($r['data_vistoria'] === null || strtotime($ultimaDevolucao) > strtotime($r['data_vistoria']));

            // 1) Status Geral já além da vistoria — prioridade absoluta.
            if ($statesId === self::STATE_INSTALACAO_REJEITADA) {
                $status = 'reprovado';
            } elseif ($statesId === self::STATE_INSTALADO) {
                $status = 'instalado';
            } elseif ($statesId === self::STATE_EM_INSTALACAO) {
                $status = 'em_instalacao';
            } elseif ($statesId === self::STATE_LIBERADO_INSTALACAO) {
                $status = 'liberado';
            }
            // 2) Ainda em vistoria — decide a Situação da Vistoria. Cada
            //    valor tem bucket/cor próprios agora (antes Em Revisita
            //    caía dentro de Em Vistoria, Revisitado dentro de
            //    Vistoriado e Aguardando Revisita dentro de Atribuído/A
            //    Vistoriar — pedido do usuário 2026-09-17).
            elseif ($situacaoId === 8 || $temDevolucaoPendente) {
                $status = 'reprovado';
            } elseif ($situacaoId === 7) {
                $status = 'deslocamento';
            } elseif ($situacaoId === 6) {
                $status = 'revisitado';
            } elseif ($situacaoId === 5) {
                $status = 'em_revisita';
            } elseif ($situacaoId === 4) {
                $status = 'aguardando_revisita';
            } elseif ($situacaoId === 3) {
                $status = 'vistoriado';
            } elseif ($situacaoId === 2) {
                $status = 'em_vistoria';
            } elseif ($situacaoId === 1 && $temTecnico) {
                $status = 'atribuido';
            } else {
                $status = 'a_vistoriar';
            }
            $counts[$status]++;

            $regiao = $r['municipio'] ? trim((string) $r['municipio']) : 'Sem região';
            $porRegiao[$regiao] = ($porRegiao[$regiao] ?? 0) + 1;
            // Tipo de equipamento real (DCU/Repetidor), não mais o P/G/S
            // extraído do nome — pedido explícito do usuário 18/08.
            $tipo = $r['tipo_equipamento'] ? trim((string) $r['tipo_equipamento']) : 'Sem tipo';
            $tipos[$tipo] = ($tipos[$tipo] ?? 0) + 1;

            $tecNomeCompleto = trim(($r['tec_firstname'] ?? '') . ' ' . ($r['tec_realname'] ?? ''));
            $tecnicoNome = $temTecnico ? ($tecNomeCompleto ?: ($r['tec_login'] ?? null)) : null;
            $statusVistoriaId = (int) ($r['status_vistoria_id'] ?? 0);
            $aprovada = $situacaoId === self::SITUACAO_REVISITADO
                || $statusVistoriaId === self::STATUS_VISTORIA_APROVADO
                || !empty($r['data_aprovacao']);

            $pendenciaId = (int) ($r['pendencia_id'] ?? 0);
            if ($pendenciaId === self::PENDENCIA_CPFL) {
                $pendenciaLabel = 'Pendência CPFL';
            } elseif ($pendenciaId === self::PENDENCIA_NANSEN) {
                $pendenciaLabel = 'Pendência Nansen';
            } else {
                $pendenciaLabel = 'Sem Pendências';
            }
            $pendencias[$pendenciaLabel] = ($pendencias[$pendenciaLabel] ?? 0) + 1;

            $features[] = [
                'type' => 'Feature',
                'geometry' => ['type' => 'Point', 'coordinates' => [round($lon, 5), round($lat, 5)]],
                'properties' => [
                    'id'      => (int) $r['id'],
                    'nome'    => $r['nome'],
                    'status'  => $status,
                    'situacao' => $situacaoLabel[$situacaoId] ?? '—',
                    'statusGeral' => $r['status_geral_nome'] ?? '—',
                    'ultimaVistoria' => $r['data_vistoria'] ? substr($r['data_vistoria'], 0, 10) : null,
                    'temTecnico' => $temTecnico,
                    'tecnicoNome' => $tecnicoNome,
                    'regiao'  => $regiao,
                    'tipo'    => $tipo,
                    'concessionaria' => $r['concessionaria'] ?: null,
                    // Valores brutos pro filtro clicável do mapa (cada card
                    // de KPI recorta o mapa usando exatamente esses campos —
                    // mesma fonte de verdade da contagem em dataFiltrosMapa()).
                    'statesId' => $statesId,
                    'situacaoId' => $situacaoId,
                    'aprovada' => $aprovada ? 1 : 0,
                    'pendencia' => $pendenciaLabel,
                    // indicador 0/1 só pro que importa pro cluster (reprovado
                    // chama atenção; o resto usa a cor "roxo neutro" default).
                    'isReprovado' => $status === 'reprovado' ? 1 : 0,
                ],
            ];
        }

        arsort($porRegiao);
        arsort($tipos);
        arsort($pendencias);

        return [
            'type' => 'FeatureCollection',
            'features' => $features,
            'counts' => $counts,
            'statusMeta' => $STATUS_META,
            'porRegiao' => $porRegiao,
            'porTipo' => $tipos,
            'porPendencia' => $pendencias,
            'total' => count($features),
        ];
    }

    /**
     * Atividade em Tempo Real — últimos eventos de auditoria, formatados
     * pra timeline (ícone/severidade por tipo de ação real).
     */
    public static function dataAtividade(int $limit = 30): array
    {
        global $DB;

        $rows = $DB->request([
            'SELECT' => ['ts', 'ator_nome', 'ator_role', 'acao', 'alvo_label', 'descricao'],
            'FROM'   => 'glpi_plugin_vistomap_audit',
            'ORDER'  => 'ts DESC',
            'LIMIT'  => $limit,
        ]);

        // acao real (confirmado em produção) → [severidade, verbo].
        $acaoMap = [
            'vistoria-atribuida'       => ['info', 'atribuiu vistoria de'],
            'vistoria-em-deslocamento' => ['info', 'está em deslocamento para'],
            'vistoria-iniciada'        => ['info', 'iniciou vistoria em'],
            'vistoria-finalizada'      => ['good', 'finalizou vistoria em'],
            'vistoria-aprovada'        => ['good', 'aprovou vistoria de'],
            'vistoria-devolvida'       => ['crit', 'devolveu vistoria de'],
            'vistoria-desvinculada'    => ['warn', 'desvinculou vistoria de'],
            'vistoria-reaberta'        => ['warn', 'reabriu vistoria de'],
            'dados-editados'           => ['info', 'editou dados de'],
            'devolucao-resolvida'      => ['good', 'resolveu devolução de'],
            'expediente-iniciado'      => ['good', 'iniciou expediente'],
            'expediente-finalizado'    => ['info', 'finalizou expediente'],
            'instalacao-assumida'      => ['info', 'assumiu instalação de'],
            'instalacao-finalizada'    => ['good', 'finalizou instalação de'],
            'override-solicitado'      => ['warn', 'solicitou override em'],
            'override-aprovado'        => ['good', 'aprovou override em'],
            'override-reprovado'       => ['crit', 'reprovou override em'],
            'recusa-solicitada'        => ['warn', 'solicitou recusa de'],
            'recusa-aprovada'          => ['good', 'aprovou recusa de'],
            'recusa-reprovada'         => ['crit', 'reprovou recusa de'],
            'login-tecnico'            => ['info', 'entrou no app'],
            'login-admin'              => ['info', 'entrou no painel'],
            'pdf-regenerado'           => ['info', 'regerou PDF de'],
        ];

        $items = [];
        foreach ($rows as $r) {
            [$sev, $verbo] = $acaoMap[$r['acao']] ?? ['info', $r['acao']];
            $alvo = $r['alvo_label'] ? ' ' . $r['alvo_label'] : '';
            $items[] = [
                'ts'       => $r['ts'],
                'ator'     => $r['ator_nome'],
                'atorRole' => $r['ator_role'],
                'acao'     => $r['acao'],
                'severity' => $sev,
                'headline' => trim($r['ator_nome'] . ' ' . $verbo . $alvo),
                'sub'      => $r['descricao'] ?: null,
            ];
        }

        return ['items' => $items];
    }
}
