# plugin-glpi — cópia versionada do plugin PHP `vistomapprojetos`

O plugin roda DENTRO do GLPI, no servidor, em
`/data/glpi/plugins/vistomapprojetos/` (visto pelo container como
`/var/www/html/plugins/vistomapprojetos/`). Ele NÃO faz parte do app
Next.js e **o CI não publica nada daqui**.

Esta pasta existe só para dar histórico git a arquivos que antes viviam
apenas no servidor (com `.bak-AAAAMMDDHHMMSS` manuais ao lado). Ela espelha
o caminho do plugin, então o arquivo daqui vai para o mesmo caminho lá.

## Arquivos versionados

| aqui | no servidor |
|---|---|
| `vistomapprojetos/front/geo-poc.php` | `.../front/geo-poc.php` — "Central de Operações" |
| `vistomapprojetos/inc/salacontrole.class.php` | `.../inc/salacontrole.class.php` — consultas (`dataKpis`, `dataFluxo`, ...) |

Os demais arquivos do plugin (`project.class.php`, `fieldsupdater.class.php`,
`ajax/`, ...) NÃO estão aqui. Traga-os quando for editá-los.

## IMPORTANTE: o que está aqui NÃO é necessariamente o que está no ar

Deploy é manual (scp + permissões de `www-data`). Antes de editar o
servidor, faça o backup no padrão que já existe lá:

    cp arquivo.php arquivo.php.bak-$(date +%Y%m%d%H%M%S)

Versão original copiada em 2026-10-06 (geo-poc.php de 17/09, 86 KB, 1.422
linhas; salacontrole.class.php, 970 linhas).

## Histórico de implantações

| data | o que | sha256 (16 primeiros) | backup no servidor |
|---|---|---|---|
| 2026-10-07 | Central de Operações com dados corretos (funil por status da concessionária, KPI/flag de aprovadas) | `salacontrole.class.php` `16bcc789b9ddbbd5` · `geo-poc.php` `b026b40965a30322` | `*.bak-20261007113434` |
| 2026-10-07 | Painéis novos no estilo atual: cartões Taxa de aprovação / Esperando a concessionária, Atenção agora, Concessionárias com resultado, Motivos de reprovação | `salacontrole.class.php` `796695ee5d6165f5` · `geo-poc.php` `70bffc5d8b3fa0e1` | `*.bak-20261007120348` |
| 2026-10-07 | Mapa: bucket "Reprovado" inclui reprovados pela concessionária (antes mostrava 0) | `salacontrole.class.php` `d370bdc1f2e5ac5d` · `geo-poc.php` `70bffc5d8b3fa0e1` | `*.bak-20261007133444` |

O estado ANTERIOR (hashes `ba601e429b4237d8` e `5915aa0a0f5c50b1`) está no
commit "versiona geo-poc.php e salacontrole.class.php (estado original)".

Método usado, a repetir nas próximas: (1) conferir que o servidor ainda é
idêntico à cópia daqui; (2) `php -l` do arquivo novo no PHP real do
container; (3) rodar as funções de dados antes e depois contra o banco real;
(4) backup `.bak-AAAAMMDDHHMMSS`; (5) `sudo install -o www-data -g www-data
-m 644`; (6) conferir hash e rodar de novo no que ficou no ar.

### Conferir a tela sem login

A página exige sessão do GLPI, então não dá para abri-la de fora. Para olhar o
resultado antes de implantar: despeje o que o PHP injeta no JS com um script
CLI no container (somente leitura, carregando a classe nova por `require`),
monte uma prévia local trocando as chamadas `<?= ... ?>` pelos dados e
tire um screenshot com o Edge headless. Os painéis rodam antes do mapa, então
aparecem mesmo com o mapa desligado.
