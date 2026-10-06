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
