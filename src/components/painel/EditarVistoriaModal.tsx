"use client";

/**
 * Modal de edição de dados de vistoria — Central de Revisitas + Fila.
 *
 * Admin altera campos chave (endereço, motivo, etc) e opcionalmente
 * marca `project_status='PENDENTE'` para o worker regerar o PDF.
 * Diff é registrado em audit.
 */

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Pencil, RefreshCcw, Save, Search, X } from "lucide-react";
import { painelService } from "@/services/painel";
import { buscarPostePorPsposte } from "@/services/postes";
import { MOTIVO_REPROVACAO_CPFL_OPTIONS } from "@/lib/glpi/motivoReprovacaoCpfl";
import type { DropdownKey } from "@/types";

export interface EditarVistoriaModalProps {
  open: boolean;
  vistoriaId: number | string | null;
  equipamento?: string;
  municipio?: string;
  initial?: {
    endereofield?: string;
    motivoReprovacaoCpfl?: string;
    descricaodetalhadacpflfield?: string;
    alturadaantenafield?: string;
    aterramentofield?: string;
    observaofield?: string;
    // Adicionados em 2026-09-15 pra tratativa de "Pendência Nansen" em
    // /painel/cpfl — mesmo whitelist ampliado em EDITAVEL_COLS (painel.ts).
    pspostefield?: string;
    municipiofield?: string;
    latitudefield?: string;
    longitudefield?: string;
    alturadopostemfield?: string;
    materialfield?: string;
    danfield?: string;
    instalartpfield?: string;
    rsrpifield?: string;
    rsrpllfield?: string;
    // Rede/Alimentação derivados do PostGIS na troca de poste (ver
    // derivarCamposRedeGlpi) — expostos aqui pra também poder ajustar na mão,
    // ou serem preenchidos automaticamente pela busca de PSPOSTE abaixo.
    redeprimriafield?: string;
    redesecundriafield?: string;
    transformadorfield?: string;
    religadorfield?: string;
    alimentacaodoequipamento?: string;
  };
  onClose: () => void;
  onSaved?: (result: { affected: number; regeneradoPdf: boolean }) => void;
}

type CamposState = NonNullable<EditarVistoriaModalProps["initial"]>;

const FIELDS: Array<{
  key: keyof CamposState;
  label: string;
  multiline?: boolean;
  placeholder?: string;
  options?: string[];
}> = [
  // pspostefield tem UI própria (busca no PostGIS), fora deste array.
  { key: "municipiofield", label: "Município", placeholder: "Cidade" },
  { key: "endereofield", label: "Endereço", placeholder: "Rua, número, bairro…" },
  { key: "latitudefield", label: "Latitude", placeholder: "-23.5505" },
  { key: "longitudefield", label: "Longitude", placeholder: "-46.6333" },
  { key: "alturadopostemfield", label: "Altura do poste", placeholder: "9 m" },
  { key: "alturadaantenafield", label: "Altura da antena", placeholder: "12 m" },
  { key: "materialfield", label: "Material / Tipo da estrutura", placeholder: "Concreto…" },
  { key: "aterramentofield", label: "Aterramento", placeholder: "1 (Sim) / 0 (Não)" },
  { key: "danfield", label: "Resistência (daN)", placeholder: "300" },
  { key: "instalartpfield", label: "Instalação de TP", placeholder: "1 (Sim) / 0 (Não)" },
  { key: "rsrpifield", label: "RSRP Claro", placeholder: "-95" },
  { key: "rsrpllfield", label: "RSRP Vivo", placeholder: "-95" },
  { key: "redeprimriafield", label: "Rede Primária", placeholder: "1 (Sim) / 0 (Não)" },
  { key: "redesecundriafield", label: "Rede Secundária", placeholder: "1 (Sim) / 0 (Não)" },
  { key: "transformadorfield", label: "Transformador", placeholder: "1 (Sim) / 0 (Não)" },
  { key: "religadorfield", label: "Religador", placeholder: "1 (Sim) / 0 (Não)" },
  { key: "alimentacaodoequipamento", label: "Alimentação do Equipamento", options: ["BT", "MT"] },
  { key: "observaofield", label: "Observações", placeholder: "Notas adicionais…", multiline: true },
  { key: "motivoReprovacaoCpfl", label: "Motivo de Reprovação CPFL", options: [...MOTIVO_REPROVACAO_CPFL_OPTIONS] },
  { key: "descricaodetalhadacpflfield", label: "Descrição Detalhada CPFL", placeholder: "Detalhe o motivo…", multiline: true },
];


export function EditarVistoriaModal({
  open,
  vistoriaId,
  equipamento,
  municipio,
  initial,
  onClose,
  onSaved,
}: EditarVistoriaModalProps) {
  const [campos, setCampos] = useState<CamposState>(initial ?? {});
  const [regenerarPdf, setRegenerarPdf] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Busca de PSPOSTE no PostGIS (cadastro-mestre de postes) — confirma que o
  // PS existe e já preenche município/lat/long/material/altura/rede/
  // alimentação do poste real, pra não gravar um PS que não existe nem
  // deixar campos de postes diferentes misturados entre si.
  const [pspostefield, setPspostefield] = useState(initial?.pspostefield ?? "");
  const [buscando, setBuscando] = useState(false);
  const [buscaResultado, setBuscaResultado] = useState<{ ok: boolean; texto: string } | null>(null);

  useEffect(() => {
    if (open) {
      setCampos(initial ?? {});
      setPspostefield(initial?.pspostefield ?? "");
      setRegenerarPdf(false);
      setError(null);
      setBuscaResultado(null);
    }
  }, [open, initial]);

  async function buscarPoste() {
    const ps = pspostefield.trim();
    if (!ps) return;
    setBuscando(true);
    setBuscaResultado(null);
    try {
      const encontrados = await buscarPostePorPsposte(ps, campos.municipiofield || municipio);
      if (encontrados.length === 0) {
        setBuscaResultado({ ok: false, texto: "PS não encontrado no cadastro de postes." });
        return;
      }
      const poste = encontrados[0];
      setCampos((c) => ({
        ...c,
        pspostefield: poste.pspostefield,
        municipiofield: poste.municipiofield,
        latitudefield: String(poste.latitudefield),
        longitudefield: String(poste.longitudefield),
        materialfield: poste.materialfield ?? c.materialfield,
        alturadopostemfield: poste.alturadopostemfield ?? c.alturadopostemfield,
        redeprimriafield: poste.redeprimriafield ?? c.redeprimriafield,
        redesecundriafield: poste.redesecundriafield ?? c.redesecundriafield,
        transformadorfield: poste.transformadorfield ?? c.transformadorfield,
        religadorfield: poste.religadorfield ?? c.religadorfield,
        alimentacaodoequipamento: poste.alimentacaodoequipamento ?? c.alimentacaodoequipamento,
      }));
      setPspostefield(poste.pspostefield);
      setBuscaResultado({
        ok: true,
        texto:
          encontrados.length > 1
            ? `Encontrado em ${poste.municipiofield} (mais ${encontrados.length - 1} cidade${encontrados.length > 2 ? "s" : ""} com esse PS — confira o município).`
            : `Encontrado em ${poste.municipiofield} — dados preenchidos automaticamente.`,
      });
    } catch {
      setBuscaResultado({ ok: false, texto: "Falha ao buscar o poste. Tente de novo." });
    } finally {
      setBuscando(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const handleSave = async () => {
    if (vistoriaId == null) return;
    setSaving(true);
    setError(null);
    try {
      const { alimentacaodoequipamento, motivoReprovacaoCpfl, ...camposTexto } = campos;
      const dropdowns: Partial<Record<DropdownKey, string>> = {};
      if (alimentacaodoequipamento) dropdowns.alimentacaodoequipamento = alimentacaodoequipamento;
      if (motivoReprovacaoCpfl) dropdowns.motivoReprovacaoCpfl = motivoReprovacaoCpfl;
      const r = await painelService.editarVistoria({
        vistoria_id: vistoriaId,
        campos: { ...camposTexto, pspostefield: pspostefield.trim() || undefined },
        dropdowns: Object.keys(dropdowns).length > 0 ? dropdowns : undefined,
        regenerar_pdf: regenerarPdf,
      });
      onSaved?.({ affected: r.affected, regeneradoPdf: regenerarPdf });
      onClose();
    } catch (err) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? "Falha ao salvar alterações.";
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[220] flex items-center justify-center p-6"
          style={{
            background: "rgba(247,249,251,0.78)",
            backdropFilter: "blur(10px)",
          }}
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[560px] overflow-hidden rounded-[24px]"
            style={{
              background: "#fff",
              border: "1px solid rgba(6,59,59,0.08)",
              boxShadow: "0 22px 56px rgba(6,59,59,0.18)",
            }}
          >
            <header
              className="flex items-start justify-between gap-3 border-b px-5 py-4"
              style={{ borderColor: "rgba(6,59,59,0.05)" }}
            >
              <div className="flex items-start gap-2.5">
                <span
                  className="flex h-9 w-9 items-center justify-center rounded-2xl text-white"
                  style={{
                    background:
                      "linear-gradient(145deg, #00C99B 0%, #00875F 100%)",
                    boxShadow: "0 4px 12px rgba(0,179,136,0.28)",
                  }}
                >
                  <Pencil className="h-4 w-4" strokeWidth={2.2} />
                </span>
                <div>
                  <p
                    className="text-[9.5px] font-bold uppercase tracking-[0.18em]"
                    style={{ color: "#00B388" }}
                  >
                    Editar vistoria
                  </p>
                  <h3
                    className="mt-0.5 text-[17px] font-semibold tracking-[-0.3px]"
                    style={{ color: "#063B3B" }}
                  >
                    {equipamento ?? `NE-${vistoriaId}`}
                  </h3>
                  {municipio && (
                    <p className="text-[11.5px]" style={{ color: "#7A8896" }}>
                      {municipio}
                    </p>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded-lg transition hover:bg-black/5"
                style={{ color: "#7A8896" }}
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <div className="max-h-[60dvh] overflow-y-auto px-5 py-4">
              <label className="mb-3 flex flex-col gap-1">
                <span className="text-[9.5px] font-bold uppercase tracking-[0.16em]" style={{ color: "#7A8896" }}>
                  PS do poste
                </span>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={pspostefield}
                    onChange={(e) => { setPspostefield(e.target.value); setBuscaResultado(null); }}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void buscarPoste(); } }}
                    placeholder="PS-000000"
                    className="flex-1 rounded-xl px-3 py-2 text-[13px] font-medium outline-none"
                    style={{ background: "#F7F9FB", border: "1px solid rgba(6,59,59,0.08)", color: "#063B3B" }}
                  />
                  <button
                    type="button"
                    onClick={() => void buscarPoste()}
                    disabled={!pspostefield.trim() || buscando}
                    className="flex items-center gap-1.5 rounded-xl px-3 text-[12px] font-semibold text-white transition disabled:opacity-50"
                    style={{ background: "#00875F" }}
                  >
                    {buscando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                    Buscar
                  </button>
                </div>
                {buscaResultado && (
                  <p
                    className="mt-0.5 flex items-center gap-1.5 text-[11px] font-medium"
                    style={{ color: buscaResultado.ok ? "#00875F" : "#B91C1C" }}
                  >
                    {buscaResultado.ok ? <CheckCircle2 className="h-3 w-3 shrink-0" /> : <AlertTriangle className="h-3 w-3 shrink-0" />}
                    {buscaResultado.texto}
                  </p>
                )}
              </label>

              <div className="grid grid-cols-2 gap-3">
                {FIELDS.map((f) => (
                  <label
                    key={f.key}
                    className={`flex flex-col gap-1 ${f.multiline ? "col-span-2" : ""}`}
                  >
                    <span
                      className="text-[9.5px] font-bold uppercase tracking-[0.16em]"
                      style={{ color: "#7A8896" }}
                    >
                      {f.label}
                    </span>
                    {f.multiline ? (
                      <textarea
                        value={campos[f.key] ?? ""}
                        onChange={(e) =>
                          setCampos((c) => ({ ...c, [f.key]: e.target.value }))
                        }
                        placeholder={f.placeholder}
                        rows={3}
                        className="rounded-xl px-3 py-2 text-[13px] font-medium outline-none"
                        style={{
                          background: "#F7F9FB",
                          border: "1px solid rgba(6,59,59,0.08)",
                          color: "#063B3B",
                        }}
                      />
                    ) : f.options ? (
                      <select
                        value={campos[f.key] ?? ""}
                        onChange={(e) =>
                          setCampos((c) => ({ ...c, [f.key]: e.target.value }))
                        }
                        className="rounded-xl px-3 py-2 text-[13px] font-medium outline-none"
                        style={{
                          background: "#F7F9FB",
                          border: "1px solid rgba(6,59,59,0.08)",
                          color: "#063B3B",
                        }}
                      >
                        <option value="">—</option>
                        {f.options.map((opt) => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={campos[f.key] ?? ""}
                        onChange={(e) =>
                          setCampos((c) => ({ ...c, [f.key]: e.target.value }))
                        }
                        placeholder={f.placeholder}
                        className="rounded-xl px-3 py-2 text-[13px] font-medium outline-none"
                        style={{
                          background: "#F7F9FB",
                          border: "1px solid rgba(6,59,59,0.08)",
                          color: "#063B3B",
                        }}
                      />
                    )}
                  </label>
                ))}
              </div>

              <label
                className="mt-4 flex items-start gap-2.5 rounded-xl px-3 py-2.5 transition cursor-pointer"
                style={{
                  background: regenerarPdf ? "#ECFDF5" : "#F7F9FB",
                  border: `1px solid ${regenerarPdf ? "rgba(0,179,136,0.32)" : "rgba(6,59,59,0.08)"}`,
                }}
              >
                <input
                  type="checkbox"
                  checked={regenerarPdf}
                  onChange={(e) => setRegenerarPdf(e.target.checked)}
                  className="mt-0.5 h-4 w-4 cursor-pointer accent-emerald-600"
                />
                <span className="flex-1">
                  <span
                    className="block text-[12px] font-semibold"
                    style={{ color: "#063B3B" }}
                  >
                    Regenerar PDF
                  </span>
                  <span
                    className="block text-[10.5px]"
                    style={{ color: "#7A8896" }}
                  >
                    Marca <code className="rounded bg-black/5 px-1">project_status='PENDENTE'</code> e o worker recria o projeto.
                  </span>
                </span>
                {regenerarPdf && <RefreshCcw className="h-4 w-4" style={{ color: "#00875F" }} />}
              </label>

              {error && (
                <div
                  className="mt-3 rounded-xl px-3 py-2 text-[11.5px] font-medium"
                  style={{
                    background: "rgba(239,68,68,0.08)",
                    border: "1px solid rgba(239,68,68,0.22)",
                    color: "#B91C1C",
                  }}
                >
                  {error}
                </div>
              )}
            </div>

            <footer
              className="flex items-center justify-end gap-2 border-t px-5 py-3"
              style={{ borderColor: "rgba(6,59,59,0.05)" }}
            >
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl px-3 py-2 text-[12.5px] font-semibold transition hover:bg-black/5"
                style={{ color: "#566773" }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl px-3.5 text-[12.5px] font-semibold text-white transition active:scale-[0.98] disabled:opacity-50"
                style={{
                  background: "linear-gradient(135deg, #00C99B 0%, #00875F 100%)",
                  boxShadow:
                    "0 1px 0 rgba(255,255,255,0.25) inset, 0 4px 12px rgba(0,179,136,0.28)",
                }}
              >
                <Save className="h-3.5 w-3.5" strokeWidth={2.4} />
                {saving ? "Salvando…" : "Salvar alterações"}
              </button>
            </footer>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
