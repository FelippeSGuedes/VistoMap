"""
database.py — Camada de acesso ao MySQL / GLPI do worker de Instalação.

Só enxerga:
  - a fila própria (glpi_plugin_vistomap_instalacao_projects)
  - o contexto do poste em glpi_plugin_fields_networkequipmentdispositivosderedes
    (mesmas colunas que src/lib/glpi/instalacoes.ts já lê no app — os JOINs
    abaixo espelham a mesma query, só traduzida pra SQL puro/PyMySQL)
  - glpi_states (status geral nativo do poste)

Nunca escreve nas colunas que a Vistoria usa, nunca toca em
glpi_plugin_vistomap_projects (fila da Vistoria).
"""
import logging
from contextlib import contextmanager
from typing import Any, Dict, List, Optional

import pymysql
import pymysql.cursors

from config import Config

logger = logging.getLogger("vistomap_worker_instalacao")

_CONNECT_TIMEOUT = 10

_FIELDS_TABLE = "glpi_plugin_fields_networkequipmentdispositivosderedes"
_NE_TABLE = "glpi_networkequipments"

# Mesmos JOINs de src/lib/glpi/instalacoes.ts (SELECT_BASE), só que
# filtrando por nome do equipamento em vez de states_id/coords — o worker
# precisa do registro específico do projeto que está gerando, não da lista
# de postes liberados.
_CONTEXT_SQL = f"""
    SELECT
        ne.name AS equipment_name,
        ne.states_id AS status_geral_id,
        st.name AS status_geral_nome,

        f.municipiofield AS municipio,
        f.pspostefield AS ps_poste,
        f.alturadopostemfield AS altura_poste,
        f.endereofield AS endereco,
        f.observaofield AS observacao,
        f.aterramentofield AS aterramento,
        f.materialfield AS material,
        f.danfield AS dan,
        f.chavefield AS chave,
        f.redeprimriafield AS rede_primaria,
        f.redesecundriafield AS rede_secundaria,
        f.religadorfield AS religador,
        f.transformadorfield AS transformador,
        f.instalartpfield AS instalar_tp,
        f.datadeinstalaofield AS data_instalacao,

        d_eq.name AS equipamento,
        d_fmt.name AS formato,
        d_tv.name AS tensao_contexto,
        d_loc.name AS local_instalacao,
        d_alim.name AS alimentacao,
        empresa.name AS empresa,

        f.plugin_fields_tensoidentificadafielddropdowns_id AS tensao_identificada_id,
        d_tid.name AS tensao_identificada,

        f.users_id_instaladorfield AS instalador_id,
        TRIM(CONCAT(COALESCE(inst.firstname, ''), ' ', COALESCE(inst.realname, ''))) AS instalador_nome_completo,
        inst.name AS instalador_login,

        f.plugin_fields_validaocpflfielddropdowns_id AS validador_cpfl_status_id,
        val_status.name AS validador_cpfl_status,
        f.users_id_validadorcpflfield AS validador_cpfl_user_id,
        TRIM(CONCAT(COALESCE(val.firstname, ''), ' ', COALESCE(val.realname, ''))) AS validador_cpfl_nome_completo,
        val.name AS validador_cpfl_login,

        f.cintacorretamenteinstaladafield AS checklist_cinta,
        f.equipamentofixadoadequadamentefield AS checklist_fixacao,
        f.cabeamentoorganizadofield AS checklist_cabeamento,
        f.alimentaovalidadafield AS checklist_alimentacao,
        f.equipamentoenergizadofield AS checklist_energizado,
        f.registrofotogrficocompletofield AS checklist_registro

    FROM `{_NE_TABLE}` ne
    INNER JOIN `{_FIELDS_TABLE}` f ON f.items_id = ne.id
    LEFT JOIN `glpi_states` st ON st.id = ne.states_id
    LEFT JOIN `glpi_plugin_fields_equipamentofielddropdowns` d_eq ON d_eq.id = f.plugin_fields_equipamentofielddropdowns_id
    LEFT JOIN `glpi_plugin_fields_formatofielddropdowns` d_fmt ON d_fmt.id = f.plugin_fields_formatofielddropdowns_id
    LEFT JOIN `glpi_plugin_fields_tensovfielddropdowns` d_tv ON d_tv.id = f.plugin_fields_tensovfielddropdowns_id
    LEFT JOIN `glpi_plugin_fields_localdeinstalaofielddropdowns` d_loc ON d_loc.id = f.plugin_fields_localdeinstalaofielddropdowns_id
    LEFT JOIN `glpi_plugin_fields_alimentaodoequipamentofielddropdowns` d_alim ON d_alim.id = f.plugin_fields_alimentaodoequipamentofielddropdowns_id
    LEFT JOIN `glpi_plugin_fields_empresafielddropdowns` empresa ON empresa.id = f.plugin_fields_empresafielddropdowns_id
    LEFT JOIN `glpi_plugin_fields_tensoidentificadafielddropdowns` d_tid ON d_tid.id = f.plugin_fields_tensoidentificadafielddropdowns_id
    LEFT JOIN `glpi_users` inst ON inst.id = f.users_id_instaladorfield
    LEFT JOIN `glpi_plugin_fields_validaocpflfielddropdowns` val_status ON val_status.id = f.plugin_fields_validaocpflfielddropdowns_id
    LEFT JOIN `glpi_users` val ON val.id = f.users_id_validadorcpflfield
    WHERE ne.name = %s
    LIMIT 1
"""


class Database:
    """Encapsula todas as operações de banco de dados do worker de Instalação."""

    @contextmanager
    def _cursor(self):
        conn = None
        try:
            conn = pymysql.connect(
                host=Config.DB_HOST,
                user=Config.DB_USER,
                password=Config.DB_PASSWORD,
                database=Config.DB_NAME,
                port=Config.DB_PORT,
                charset="utf8mb4",
                cursorclass=pymysql.cursors.DictCursor,
                connect_timeout=_CONNECT_TIMEOUT,
                autocommit=False,
            )
            with conn.cursor() as cur:
                yield cur, conn
            conn.commit()
        except Exception:
            if conn:
                conn.rollback()
            raise
        finally:
            if conn:
                conn.close()

    # ------------------------------------------------------------------
    # Fila (glpi_plugin_vistomap_instalacao_projects)
    # ------------------------------------------------------------------

    def get_pending_projects(self) -> List[Dict]:
        sql = f"""
            SELECT id, equipment_name, items_id, itemtype, project_status,
                   project_date, pdf_path, approved_pdf_path,
                   image1_path, image2_path, image3_path, image4_path,
                   image5_path, image6_path, image7_path
              FROM `{Config.QUEUE_TABLE}`
             WHERE project_status = 'PENDENTE'
             ORDER BY created_at ASC
        """
        with self._cursor() as (cur, _):
            cur.execute(sql)
            return cur.fetchall()

    def update_project_status(self, project_id: int, status: str) -> None:
        sql = f"""
            UPDATE `{Config.QUEUE_TABLE}`
               SET project_status = %s, updated_at = NOW()
             WHERE id = %s
        """
        with self._cursor() as (cur, _):
            cur.execute(sql, (status, project_id))

    def update_project_generated(self, project_id: int, pdf_path: str, generated_at: str) -> None:
        sql = f"""
            UPDATE `{Config.QUEUE_TABLE}`
               SET project_status = 'GERADO',
                   pdf_path       = %s,
                   generated_at   = %s,
                   error_log      = NULL,
                   updated_at     = NOW()
             WHERE id = %s
        """
        with self._cursor() as (cur, _):
            cur.execute(sql, (pdf_path, generated_at, project_id))

    def update_project_error(self, project_id: int, error_msg: str) -> None:
        sql = f"""
            UPDATE `{Config.QUEUE_TABLE}`
               SET project_status = 'ERRO',
                   error_log      = %s,
                   updated_at     = NOW()
             WHERE id = %s
        """
        with self._cursor() as (cur, _):
            cur.execute(sql, (error_msg[:65_535], project_id))

    # ------------------------------------------------------------------
    # Contexto do poste (leitura)
    # ------------------------------------------------------------------

    def get_project_full_data(self, project: Dict) -> Dict[str, Any]:
        """Busca o contexto completo do poste via JOIN, igual ao app lê em instalacoes.ts."""
        data: Dict[str, Any] = dict(project)
        equipment_name = project["equipment_name"]

        with self._cursor() as (cur, _):
            cur.execute(_CONTEXT_SQL, (equipment_name,))
            row = cur.fetchone()

        if row:
            data.update(row)
        else:
            logger.warning(
                "Nenhum contexto encontrado em %s para equipamento '%s'",
                _FIELDS_TABLE, equipment_name,
            )

        return data

    # ------------------------------------------------------------------
    # Aprovação / reprovação (validação CPFL)
    # ------------------------------------------------------------------

    def get_projects_for_approval(self) -> List[Dict]:
        """Projetos GERADO cujo validador CPFL aprovou (dropdown id=1)."""
        return self._filter_by_validacao_status(Config.VALIDACAO_CPFL_APROVADO)

    def get_projects_for_rejection(self) -> List[Dict]:
        """Projetos GERADO cujo validador CPFL rejeitou (dropdown id=2)."""
        return self._filter_by_validacao_status(Config.VALIDACAO_CPFL_REJEITADO)

    def _filter_by_validacao_status(self, target_status_id: int) -> List[Dict]:
        base_sql = f"""
            SELECT id, equipment_name, items_id, itemtype, pdf_path, approved_pdf_path
              FROM `{Config.QUEUE_TABLE}`
             WHERE project_status = 'GERADO'
               AND pdf_path IS NOT NULL AND pdf_path <> ''
        """
        with self._cursor() as (cur, _):
            cur.execute(base_sql)
            candidates = cur.fetchall()

        result = []
        for row in candidates:
            status_id = self._get_validacao_status(row["equipment_name"])
            if status_id == target_status_id:
                result.append(row)
        return result

    def _get_validacao_status(self, equipment_name: str) -> Optional[int]:
        sql = f"""
            SELECT f.plugin_fields_validaocpflfielddropdowns_id AS status_id
              FROM `{_FIELDS_TABLE}` f
             INNER JOIN `{_NE_TABLE}` ne ON ne.id = f.items_id
             WHERE ne.name = %s
             LIMIT 1
        """
        try:
            with self._cursor() as (cur, _):
                cur.execute(sql, (equipment_name,))
                row = cur.fetchone()
                return row.get("status_id") if row else None
        except pymysql.Error as exc:
            logger.warning("Erro ao ler validação CPFL ('%s'): %s", equipment_name, exc)
            return None

    def update_project_approved(self, project_id: int, approved_pdf_path: str, approved_at: str) -> None:
        sql = f"""
            UPDATE `{Config.QUEUE_TABLE}`
               SET approved_pdf_path = %s,
                   approved_at       = %s,
                   updated_at        = NOW()
             WHERE id = %s
        """
        with self._cursor() as (cur, _):
            cur.execute(sql, (approved_pdf_path, approved_at, project_id))

    def update_project_rejected(self, project_id: int) -> None:
        sql = f"""
            UPDATE `{Config.QUEUE_TABLE}`
               SET pdf_path          = NULL,
                   approved_pdf_path = NULL,
                   updated_at        = NOW()
             WHERE id = %s
        """
        with self._cursor() as (cur, _):
            cur.execute(sql, (project_id,))
