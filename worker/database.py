"""
database.py — Camada de acesso ao MySQL / GLPI para o worker VistoMap.

Responsabilidades:
  - Buscar projetos pendentes
  - Buscar dados completos (campos customizados do plugin_fields)
  - Atualizar status do projeto
  - Resolver / criar valores de dropdown
  - Controlar aprovação e reprovação
"""
import re
import logging
from contextlib import contextmanager
from typing import Any, Dict, List, Optional

import pymysql
import pymysql.cursors

from config import Config

logger = logging.getLogger("vistomap_worker")

# Timeout de conexão MySQL
_CONNECT_TIMEOUT = 10

# Tabela fixa do plugin_fields para NetworkEquipment (Dispositivos de Rede)
_FIELDS_TABLE = "glpi_plugin_fields_networkequipmentdispositivosderedes"
_NE_TABLE     = "glpi_networkequipments"


def _safe_table(name: str) -> bool:
    """Valida nome de tabela: apenas letras minúsculas, dígitos e _."""
    return bool(re.match(r"^[a-z0-9_]+$", name))


class Database:
    """Encapsula todas as operações de banco de dados do worker."""

    # ------------------------------------------------------------------
    # Conexão
    # ------------------------------------------------------------------

    @contextmanager
    def _cursor(self):
        """Abre conexão, entrega (cursor, conn) e comita / fecha ao sair."""
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
    # Projetos pendentes
    # ------------------------------------------------------------------

    def get_pending_projects(self) -> List[Dict]:
        """Retorna todos os projetos com project_status = PENDENTE."""
        sql = """
            SELECT
                id, equipment_name, items_id, itemtype,
                project_status, pdf_path, approved_pdf_path,
                image1_path, image2_path, image3_path,
                project_hash, project_date,
                created_at, updated_at
            FROM glpi_plugin_vistomap_projects
            WHERE project_status = 'PENDENTE'
            ORDER BY created_at ASC
        """
        with self._cursor() as (cur, _):
            cur.execute(sql)
            return cur.fetchall()

    # ------------------------------------------------------------------
    # Dados completos do projeto
    # ------------------------------------------------------------------

    def get_project_full_data(self, project: Dict) -> Dict:
        """
        Busca todos os campos do NetworkEquipment via JOIN com
        glpi_plugin_fields_networkequipmentdispositivosderedes.
        Mantém project_date vindo da tabela glpi_plugin_vistomap_projects.
        """
        data: Dict[str, Any] = dict(project)
        equipment_name = project["equipment_name"]

        sql = """
            SELECT
                ne.name,

                f.pspostefield,
                f.municipiofield,
                f.latitudefield,
                f.longitudefield,
                f.alturadaantenafield,
                f.alturadopostemfield,
                f.endereofield,
                f.observaofield,
                f.aterramentofield,
                f.intensidadedesinalfield,
                f.velocidadefield,

                f.instalartpfield,
                f.danfield,
                f.rsrpifield,
                f.rsrpllfield,

                f.plugin_fields_tipodeantenafielddropdowns_id,
                f.plugin_fields_ganhodbifielddropdowns_id,
                f.plugin_fields_mododeoperaofielddropdowns_id,
                f.plugin_fields_operadorafourgfielddropdowns_id,
                f.plugin_fields_tipodematerialfielddropdowns_id,
                f.plugin_fields_tensofielddropdowns_id,
                f.plugin_fields_alimentaodoequipamentofielddropdowns_id,
                f.plugin_fields_localdeinstalaofielddropdowns_id,

                f.plugin_fields_tensovfielddropdowns_id,
                f.plugin_fields_tipoifielddropdowns_id,
                f.plugin_fields_tipollfielddropdowns_id,

                f.plugin_fields_statusvistoriafielddropdowns_id,
                f.plugin_fields_pendnciafielddropdowns_id

            FROM glpi_plugin_fields_networkequipmentdispositivosderedes f
            INNER JOIN glpi_networkequipments ne
                ON ne.id = f.items_id
            WHERE ne.name = %s
            LIMIT 1
        """
        try:
            with self._cursor() as (cur, _):
                cur.execute(sql, (equipment_name,))
                row = cur.fetchone()
                if row:
                    # Renomeia colunas de dropdown para o nome de campo base
                    row = self._normalize_dropdown_keys(row)
                    data.update(row)
                else:
                    logger.warning(
                        "Nenhum registro encontrado em %s para equipamento '%s'",
                        _FIELDS_TABLE, equipment_name,
                    )
        except pymysql.Error as exc:
            logger.error(
                "Erro ao buscar dados do equipamento '%s': %s",
                equipment_name, exc, exc_info=True,
            )

        return data

    @staticmethod
    def _normalize_dropdown_keys(row: Dict) -> Dict:
        """
        Renomeia plugin_fields_<campo>dropdowns_id → <campo>
        para que o DropdownResolver receba o nome do campo sem prefixo.
        Exemplo:
            plugin_fields_ganhodbifielddropdowns_id → ganhodbifield
        """
        mapping = {
            "plugin_fields_tipodeantenafielddropdowns_id":           "tipodeantenafield",
            "plugin_fields_ganhodbifielddropdowns_id":               "ganhodbifield",
            "plugin_fields_mododeoperaofielddropdowns_id":           "mododeoperaofield",
            "plugin_fields_operadorafourgfielddropdowns_id":         "operadorafourgfield",
            "plugin_fields_tipodematerialfielddropdowns_id":         "tipodematerialfield",
            "plugin_fields_tensofielddropdowns_id":                  "tensofield",
            "plugin_fields_alimentaodoequipamentofielddropdowns_id": "alimentaodoequipamentofield",
            "plugin_fields_localdeinstalaofielddropdowns_id":        "localdeinstalaofield",
            "plugin_fields_tensovfielddropdowns_id":                 "tensovfield",
            "plugin_fields_tipoifielddropdowns_id":                  "tipoifield",
            "plugin_fields_tipollfielddropdowns_id":                 "tipollfield",
            "plugin_fields_statusvistoriafielddropdowns_id":         "plugin_fields_statusvistoriafielddropdowns_id",
            "plugin_fields_pendnciafielddropdowns_id":               "plugin_fields_pendnciafielddropdowns_id",
        }
        normalized: Dict = {}
        for k, v in row.items():
            normalized[mapping.get(k, k)] = v
        return normalized

    # ------------------------------------------------------------------
    # Atualização de status
    # ------------------------------------------------------------------

    def update_project_status(self, project_id: int, status: str) -> None:
        """Atualiza project_status."""
        sql = """
            UPDATE glpi_plugin_vistomap_projects
               SET project_status = %s, updated_at = NOW()
             WHERE id = %s
        """
        with self._cursor() as (cur, _):
            cur.execute(sql, (status, project_id))

    def update_project_generated(
        self, project_id: int, pdf_path: str, generated_at: str
    ) -> None:
        """Marca projeto como GERADO e salva o caminho do PDF."""
        sql = """
            UPDATE glpi_plugin_vistomap_projects
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
        """Marca projeto como ERRO e salva a mensagem."""
        sql = """
            UPDATE glpi_plugin_vistomap_projects
               SET project_status = 'ERRO',
                   error_log      = %s,
                   updated_at     = NOW()
             WHERE id = %s
        """
        with self._cursor() as (cur, _):
            cur.execute(sql, (error_msg[:65_535], project_id))

    # ------------------------------------------------------------------
    # Aprovação / reprovação
    # ------------------------------------------------------------------

    def get_projects_for_approval(self) -> List[Dict]:
        """
        Projetos GERADO com pdf_path válido e approved_pdf_path vazio,
        cujo statusvistoria == Aprovado (id=3).
        """
        sql = """
            SELECT id, equipment_name, items_id, itemtype,
                   pdf_path, approved_pdf_path
              FROM glpi_plugin_vistomap_projects
             WHERE project_status = 'GERADO'
               AND pdf_path IS NOT NULL AND pdf_path <> ''
               AND (approved_pdf_path IS NULL OR approved_pdf_path = '')
        """
        return self._filter_by_vistoria_status(sql, Config.STATUS_APROVADO_ID)

    def get_projects_for_rejection(self) -> List[Dict]:
        """
        Projetos GERADO com pdf_path válido,
        cujo statusvistoria == Reprovado (id=4).
        """
        sql = """
            SELECT id, equipment_name, items_id, itemtype,
                   pdf_path, approved_pdf_path
              FROM glpi_plugin_vistomap_projects
             WHERE project_status = 'GERADO'
               AND pdf_path IS NOT NULL AND pdf_path <> ''
        """
        return self._filter_by_vistoria_status(sql, Config.STATUS_REPROVADO_ID)

    def _filter_by_vistoria_status(
        self, base_sql: str, target_status_id: int
    ) -> List[Dict]:
        """Filtra candidatos verificando statusvistoria no plugin_fields."""
        with self._cursor() as (cur, _):
            cur.execute(base_sql)
            candidates = cur.fetchall()

        result = []
        for row in candidates:
            vs = self._get_vistoria_status(row["equipment_name"])
            if vs == target_status_id:
                result.append(row)
        return result

    def _get_vistoria_status(self, equipment_name: str) -> Optional[int]:
        """
        Lê plugin_fields_statusvistoriafielddropdowns_id do NetworkEquipment
        usando JOIN por equipment_name — consistente com get_project_full_data.
        Evita leitura incorreta por items_id desatualizado ou divergente.
        """
        sql = """
            SELECT f.plugin_fields_statusvistoriafielddropdowns_id
              FROM glpi_plugin_fields_networkequipmentdispositivosderedes f
             INNER JOIN glpi_networkequipments ne
                     ON ne.id = f.items_id
             WHERE ne.name = %s
             LIMIT 1
        """
        try:
            with self._cursor() as (cur, _):
                cur.execute(sql, (equipment_name,))
                row = cur.fetchone()
                if row:
                    return row.get("plugin_fields_statusvistoriafielddropdowns_id")
                logger.warning(
                    "_get_vistoria_status: nenhum registro para '%s'", equipment_name
                )
        except pymysql.Error as exc:
            logger.warning("Erro ao ler statusvistoria ('%s'): %s", equipment_name, exc)
        return None

    def update_project_approved(
        self, project_id: int, approved_pdf_path: str, approved_at: str
    ) -> None:
        """Salva caminho do PDF aprovado e atualiza pendência para Sem Pendências."""
        proj = self._get_project_by_id(project_id)
        if proj:
            self._set_pendencia(
                proj["items_id"], proj["itemtype"], Config.SEM_PENDENCIAS_ID
            )

        sql = """
            UPDATE glpi_plugin_vistomap_projects
               SET approved_pdf_path = %s,
                   approved_at       = %s,
                   updated_at        = NOW()
             WHERE id = %s
        """
        with self._cursor() as (cur, _):
            cur.execute(sql, (approved_pdf_path, approved_at, project_id))

    def update_project_rejected(self, project_id: int) -> None:
        """Limpa PDFs no banco e atualiza pendência para Pendência Nansen."""
        proj = self._get_project_by_id(project_id)
        if proj:
            self._set_pendencia(
                proj["items_id"], proj["itemtype"], Config.PENDENCIA_NANSEN_ID
            )

        sql = """
            UPDATE glpi_plugin_vistomap_projects
               SET pdf_path          = NULL,
                   approved_pdf_path = NULL,
                   updated_at        = NOW()
             WHERE id = %s
        """
        with self._cursor() as (cur, _):
            cur.execute(sql, (project_id,))

    def _get_project_by_id(self, project_id: int) -> Optional[Dict]:
        sql = """
            SELECT id, equipment_name, items_id, itemtype
              FROM glpi_plugin_vistomap_projects
             WHERE id = %s
        """
        with self._cursor() as (cur, _):
            cur.execute(sql, (project_id,))
            return cur.fetchone()

    def _set_pendencia(
        self, items_id: int, itemtype: str, pendencia_id: int
    ) -> None:
        sql = """
            UPDATE glpi_plugin_fields_networkequipmentdispositivosderedes
               SET plugin_fields_pendnciafielddropdowns_id = %s
             WHERE items_id = %s
        """
        try:
            with self._cursor() as (cur, _):
                cur.execute(sql, (pendencia_id, items_id))
        except pymysql.Error as exc:
            logger.warning("Erro ao atualizar pendência (items_id=%s): %s", items_id, exc)

    # ------------------------------------------------------------------
    # Dropdowns
    # ------------------------------------------------------------------

    def get_dropdown_text(self, dropdown_table: str, dropdown_id: int) -> Optional[str]:
        """Retorna o texto (name) de um valor de dropdown pelo ID."""
        if not _safe_table(dropdown_table):
            logger.warning("Nome de tabela dropdown inválido: %s", dropdown_table)
            return None
        sql = f"SELECT name FROM `{dropdown_table}` WHERE id = %s LIMIT 1"
        try:
            with self._cursor() as (cur, _):
                cur.execute(sql, (dropdown_id,))
                row = cur.fetchone()
                return row["name"] if row else None
        except pymysql.Error as exc:
            logger.warning("Erro ao ler dropdown %s id=%s: %s", dropdown_table, dropdown_id, exc)
            return None

    def get_or_create_dropdown(
        self, dropdown_table: str, text_value: str
    ) -> Optional[int]:
        """
        Busca um valor de dropdown por texto (case-insensitive).
        Se não existir, cria automaticamente.
        Retorna o ID.
        """
        if not _safe_table(dropdown_table):
            return None

        clean = text_value.strip()

        sql_find = f"""
            SELECT id FROM `{dropdown_table}`
             WHERE LOWER(TRIM(name)) = LOWER(%s)
             LIMIT 1
        """
        sql_insert = f"""
            INSERT INTO `{dropdown_table}` (name, completename, comment, level)
            VALUES (%s, %s, '', 0)
        """
        try:
            with self._cursor() as (cur, conn):
                cur.execute(sql_find, (clean,))
                row = cur.fetchone()
                if row:
                    return row["id"]
                cur.execute(sql_insert, (clean, clean))
                conn.commit()
                return cur.lastrowid
        except pymysql.Error as exc:
            logger.warning(
                "Erro ao criar dropdown %s valor='%s': %s",
                dropdown_table, clean, exc
            )
            return None
