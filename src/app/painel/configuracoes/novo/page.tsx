"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, ChevronDown, Mail, RefreshCw, UserPlus } from "lucide-react";
import { useAuthStore } from "@/store/auth";
import { api } from "@/services/api";
import { Campo, ConfigHeader, type AcessoPainel, type OpcaoAcesso, type PerfilGlpi } from "../_shared";

export default function NovoColaboradorPage() {
  const router = useRouter();
  const { session } = useAuthStore();
  const headers = { Authorization: `Bearer ${session?.token}` };

  const [nome, setNome] = useState("");
  const [sobrenome, setSobrenome] = useState("");
  const [username, setUsername] = useState("");
  const [usernameTocado, setUsernameTocado] = useState(false);
  const [email, setEmail] = useState("");
  const [matricula, setMatricula] = useState("");
  const [acesso, setAcesso] = useState<AcessoPainel>("tecnico");
  const [profileId, setProfileId] = useState<number | "">("");
  const [forcarTroca, setForcarTroca] = useState(false);
  const [perfis, setPerfis] = useState<PerfilGlpi[]>([]);
  const [acessos, setAcessos] = useState<OpcaoAcesso[]>([]);
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<{ username: string; emailEnviado: boolean } | null>(null);

  // Carrega perfis do GLPI + opções de acesso.
  useEffect(() => {
    api
      .get<{ perfis: PerfilGlpi[]; acessos: OpcaoAcesso[] }>("/painel/usuarios/opcoes", { headers })
      .then((r) => {
        setPerfis(r.data.perfis);
        setAcessos(r.data.acessos);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Login padrão nome.sobrenome (sem acento), até o admin editar manualmente.
  const slug = (s: string) =>
    s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  const usernameAuto = [slug(nome.split(/\s+/)[0] ?? ""), slug(sobrenome.split(/\s+/).pop() ?? "")]
    .filter(Boolean)
    .join(".");
  const usernameFinal = usernameTocado ? username : usernameAuto;

  const senhaPreview = matricula.trim() ? `Nsn#${matricula.trim()}2026` : "Nsn#…2026";

  async function submit() {
    setErro(null);
    setSaving(true);
    try {
      const r = await api.post<{ username: string; emailEnviado: boolean }>(
        "/painel/usuarios/criar",
        { nome, sobrenome, username: usernameFinal, email, matricula, acesso, profileId, forcarTroca },
        { headers }
      );
      setOk({ username: r.data.username, emailEnviado: r.data.emailEnviado });
    } catch (err) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        "Falha ao criar a conta.";
      setErro(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <ConfigHeader icon={UserPlus} title="Novo colaborador" subtitle="Cria a conta no GLPI e envia as credenciais por e-mail." />

      <div
        className="rounded-2xl bg-white p-5"
        style={{ border: "1px solid var(--vm-border)", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}
      >
        {ok ? (
          <div className="space-y-4 py-2 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50">
              <CheckCircle2 className="h-6 w-6 text-emerald-600" />
            </span>
            <div>
              <p className="text-[14px] font-bold text-gray-900">Conta criada!</p>
              <p className="mt-1 text-[12.5px] text-gray-500">
                Login <b>{ok.username}</b> · senha <b>Nsn#{matricula.trim()}2026</b>
              </p>
            </div>
            <div
              className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-[12.5px] ${ok.emailEnviado ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}
            >
              <Mail className="h-4 w-4 shrink-0" />
              {ok.emailEnviado
                ? "E-mail com as credenciais enviado."
                : "Conta criada, mas o e-mail NÃO foi enviado — passe as credenciais manualmente."}
            </div>
            <button
              type="button"
              onClick={() => router.push("/painel/configuracoes/colaboradores")}
              className="w-full rounded-xl bg-[#00B388] py-2.5 text-[13px] font-bold text-white transition hover:bg-[#00875F]"
            >
              Ver colaboradores
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Campo label="Nome" value={nome} onChange={setNome} placeholder="João" />
              <Campo label="Sobrenome" value={sobrenome} onChange={setSobrenome} placeholder="Silva" />
            </div>
            <Campo
              label="E-mail"
              value={email}
              onChange={setEmail}
              placeholder="joao.silva@nansen.com.br"
              type="email"
            />
            <div>
              <Campo
                label="Usuário (login)"
                value={usernameFinal}
                onChange={(v) => { setUsername(v.toLowerCase()); setUsernameTocado(true); }}
                placeholder="joao.silva"
              />
              <p className="mt-1 text-[11px] text-gray-400">Gerado como <b>nome.sobrenome</b> — dá pra editar.</p>
            </div>
            <div>
              <Campo label="Matrícula" value={matricula} onChange={setMatricula} placeholder="4521" />
              <p className="mt-1 text-[11px] text-gray-400">Senha gerada: <b className="font-mono text-gray-600">{senhaPreview}</b></p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-500">Perfil (GLPI)</label>
                <div className="relative">
                  <select
                    value={profileId}
                    onChange={(e) => setProfileId(e.target.value === "" ? "" : Number(e.target.value))}
                    className="w-full appearance-none rounded-xl border border-gray-200 bg-white px-3 py-2.5 pr-9 text-[13px] font-medium text-gray-800 outline-none focus:border-[#00B388] focus:ring-1 focus:ring-[#00B388]"
                  >
                    <option value="">Selecione…</option>
                    {perfis.map((p) => (
                      <option key={p.id} value={p.id}>{p.nome}</option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-500">Acesso VistoMap</label>
                <div className="relative">
                  <select
                    value={acesso}
                    onChange={(e) => setAcesso(e.target.value as AcessoPainel)}
                    className="w-full appearance-none rounded-xl border border-gray-200 bg-white px-3 py-2.5 pr-9 text-[13px] font-medium text-gray-800 outline-none focus:border-[#00B388] focus:ring-1 focus:ring-[#00B388]"
                  >
                    {acessos.map((a) => (
                      <option key={a.key} value={a.key}>{a.label}</option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                </div>
              </div>
            </div>
            <p className="text-[11px] text-gray-400">
              O <b>Perfil</b> é o papel dentro do GLPI. O <b>Acesso VistoMap</b> define o grupo (app/painel) — escolha <b>Nenhum</b> para conta só de GLPI.
            </p>

            <label className="flex cursor-pointer items-start gap-2.5 rounded-xl bg-[var(--vm-fill)] px-3.5 py-3">
              <input
                type="checkbox"
                checked={forcarTroca}
                onChange={(e) => setForcarTroca(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-[#00B388]"
              />
              <div>
                <p className="text-[12.5px] font-semibold text-gray-800">Forçar troca de senha no 1º login</p>
                <p className="text-[11px] leading-snug text-gray-500">A pessoa entra com a senha padrão e o GLPI obriga a definir uma nova na hora. Recomendado (a senha padrão é previsível).</p>
              </div>
            </label>

            {erro && (
              <div className="flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2.5 text-[12.5px] text-red-700">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {erro}
              </div>
            )}

            <button
              type="button"
              onClick={submit}
              disabled={saving || !nome || !sobrenome || !usernameFinal || !email || !matricula || !profileId}
              className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl bg-[#00B388] py-3 text-[13px] font-bold text-white transition hover:bg-[#00875F] disabled:opacity-40"
            >
              {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              Criar conta e enviar e-mail
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
