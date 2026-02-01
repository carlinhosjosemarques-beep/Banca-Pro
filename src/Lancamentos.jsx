import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";
import { getWeekRange, money, parseYMDLocal, typeLabel, ymd } from "./utils";

const tipos = [
  { v: "green", t: "Green" },
  { v: "loss", t: "Loss" },
  { v: "deposito", t: "Depósito" },
  { v: "saque", t: "Saque" },
];

function sign(tipo) {
  return (tipo === "green" || tipo === "deposito") ? 1 : -1;
}

function ymFromDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function monthStartEndFromYM(ym) {
  const [y, m] = ym.split("-").map(Number);
  const start = new Date(y, (m || 1) - 1, 1, 12, 0, 0);
  const end = new Date(y, (m || 1), 0, 12, 0, 0);
  return { start, end };
}

function addMonthsYM(ym, delta) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, (m - 1) + delta, 1, 12, 0, 0);
  return ymFromDate(d);
}

export default function Lancamentos({ user }) {
  const [tipo, setTipo] = useState("green");
  const [data, setData] = useState(() => ymd(new Date()));
  const [valor, setValor] = useState("");
  const [obs, setObs] = useState("");

  const [filtro, setFiltro] = useState("mes"); // hoje | semana | mes | intervalo
  const [ini, setIni] = useState(() => ymd(new Date()));
  const [fim, setFim] = useState(() => ymd(new Date()));

  const [monthYM, setMonthYM] = useState(() => ymFromDate(new Date()));
  const monthRange = useMemo(() => monthStartEndFromYM(monthYM), [monthYM]);

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const range = useMemo(() => {
    const now = new Date();
    if (filtro === "hoje") {
      const d = ymd(now);
      return { start: d, end: d };
    }
    if (filtro === "semana") {
      const w = getWeekRange(now, true);
      return { start: ymd(w.start), end: ymd(w.end) };
    }
    if (filtro === "mes") {
      return { start: ymd(monthRange.start), end: ymd(monthRange.end) };
    }
    return { start: ini, end: fim };
  }, [filtro, ini, fim, monthRange.start, monthRange.end]);

  const resumo = useMemo(() => {
    let banca = 0;
    let lucroPreju = 0;
    let dep = 0;
    let saq = 0;
    for (const r of rows) {
      const s = sign(r.tipo);
      banca += s * Number(r.valor || 0);
      if (r.tipo === "green" || r.tipo === "loss") lucroPreju += s * Number(r.valor || 0);
      if (r.tipo === "deposito") dep += Number(r.valor || 0);
      if (r.tipo === "saque") saq += Number(r.valor || 0);
    }
    return { banca, lucroPreju, dep, saq };
  }, [rows]);

  async function load() {
    setLoading(true);
    setErr("");
    try {
      const { data, error } = await supabase
        .from("transacoes")
        .select("*")
        .eq("user_id", user.id)
        .gte("data", range.start)
        .lte("data", range.end)
        .order("data", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      setRows(data || []);
    } catch (e) {
      setErr(e?.message || "Erro ao carregar");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [range.start, range.end]);

  async function add(e) {
    e.preventDefault();
    setSaving(true);
    setErr("");
    try {
      const v = Number(String(valor).replace(",", "."));
      if (!v || v < 0) throw new Error("Informe um valor válido.");
      const payload = { user_id: user.id, tipo, data, valor: v, obs: obs?.trim() || null };
      const { error } = await supabase.from("transacoes").insert(payload);
      if (error) throw error;
      setValor("");
      setObs("");
      await load();
    } catch (e2) {
      setErr(e2?.message || "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  async function del(id) {
    if (!confirm("Excluir esta transação?")) return;
    setErr("");
    try {
      const { error } = await supabase.from("transacoes").delete().eq("id", id).eq("user_id", user.id);
      if (error) throw error;
      await load();
    } catch (e) {
      setErr(e?.message || "Erro ao excluir");
    }
  }

  async function editPrompt(r) {
    const novoValor = prompt("Novo valor (ex: 150.50)", String(r.valor ?? ""));
    if (novoValor === null) return;
    const v = Number(String(novoValor).replace(",", "."));
    if (!isFinite(v) || v < 0) return alert("Valor inválido.");

    const novaObs = prompt("Observação (opcional)", r.obs || "") ?? r.obs;

    setErr("");
    try {
      const { error } = await supabase
        .from("transacoes")
        .update({ valor: v, obs: (novaObs || "").trim() || null })
        .eq("id", r.id)
        .eq("user_id", user.id);
      if (error) throw error;
      await load();
    } catch (e) {
      setErr(e?.message || "Erro ao editar");
    }
  }

  return (
    <div className="container">
      <div className="grid" style={{ marginBottom: 12 }}>
        <div className="card" style={{ gridColumn: "span 12" }}>
          <h2>Novo lançamento</h2>

          <form onSubmit={add} className="row">
            <div className="field">
              <div className="label">Tipo</div>
              <select className="select" value={tipo} onChange={(e) => setTipo(e.target.value)}>
                {tipos.map((t) => (
                  <option key={t.v} value={t.v}>{t.t}</option>
                ))}
              </select>
            </div>

            <div className="field">
              <div className="label">Data</div>
              <input className="input" value={data} onChange={(e) => setData(e.target.value)} type="date" required />
            </div>

            <div className="field">
              <div className="label">Valor</div>
              <input className="input" value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" placeholder="0,00" required />
            </div>

            <div className="field" style={{ minWidth: 240, flex: 1 }}>
              <div className="label">Obs (opcional)</div>
              <input className="input" value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ex: Jogo X, estratégia Y" />
            </div>

            <button className="btn primary" disabled={saving}>
              {saving ? "Salvando..." : "Adicionar"}
            </button>

            {err ? <div className="muted" style={{ width: "100%" }}>{err}</div> : null}
          </form>
        </div>

        <div className="card" style={{ gridColumn: "span 12" }}>
          <div className="row" style={{ gap: 12 }}>
            <div>
              <h2 style={{ marginBottom: 6 }}>Filtro</h2>
              <div className="row">
                <button className={"tab " + (filtro === "hoje" ? "active" : "")} onClick={() => setFiltro("hoje")}>Hoje</button>
                <button className={"tab " + (filtro === "semana" ? "active" : "")} onClick={() => setFiltro("semana")}>Semana</button>
                <button className={"tab " + (filtro === "mes" ? "active" : "")} onClick={() => setFiltro("mes")}>Mês</button>
                <button className={"tab " + (filtro === "intervalo" ? "active" : "")} onClick={() => setFiltro("intervalo")}>Intervalo</button>
              </div>
            </div>

            {filtro === "mes" ? (
              <div className="row" style={{ alignItems: "flex-end" }}>
                <button className="btn" type="button" onClick={() => setMonthYM(ymFromDate(new Date()))}>
                  Mês atual
                </button>
                <button className="btn" type="button" onClick={() => setMonthYM(addMonthsYM(monthYM, -1))}>
                  Mês passado
                </button>
                <div className="field" style={{ minWidth: 170 }}>
                  <div className="label">Escolher mês</div>
                  <input className="input" type="month" value={monthYM} onChange={(e) => setMonthYM(e.target.value)} />
                </div>
              </div>
            ) : null}

            {filtro === "intervalo" ? (
              <div className="row" style={{ alignItems: "flex-end" }}>
                <div className="field">
                  <div className="label">Início</div>
                  <input className="input" type="date" value={ini} onChange={(e) => setIni(e.target.value)} />
                </div>
                <div className="field">
                  <div className="label">Fim</div>
                  <input className="input" type="date" value={fim} onChange={(e) => setFim(e.target.value)} />
                </div>
                <button className="btn" onClick={load} type="button">Aplicar</button>
              </div>
            ) : (
              <div className="muted" style={{ marginTop: 22 }}>
                Período: {parseYMDLocal(range.start)?.toLocaleDateString("pt-BR")} → {parseYMDLocal(range.end)?.toLocaleDateString("pt-BR")}
              </div>
            )}

            <div className="right" />

            <div className="row">
              <span className="badge"><span className="dot ok" />Banca (período): <b style={{ marginLeft: 6 }}>{money(resumo.banca)}</b></span>
              <span className="badge">Lucro/Prejuízo: <b style={{ marginLeft: 6 }}>{money(resumo.lucroPreju)}</b></span>
              <span className="badge">Dep.: <b style={{ marginLeft: 6 }}>{money(resumo.dep)}</b></span>
              <span className="badge">Saq.: <b style={{ marginLeft: 6 }}>{money(resumo.saq)}</b></span>
            </div>
          </div>

          <div className="hr" />

          <h2>Lançamentos do período</h2>
          {loading ? <div className="muted">Carregando...</div> : null}

          <table className="table" style={{ marginTop: 10 }}>
            <thead>
              <tr>
                <th>Data</th>
                <th>Tipo</th>
                <th>Valor</th>
                <th>Obs</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const d = parseYMDLocal(r.data);
                const isPos = r.tipo === "green" || r.tipo === "deposito";
                return (
                  <tr key={r.id}>
                    <td className="muted">{d ? d.toLocaleDateString("pt-BR") : r.data}</td>
                    <td>
                      <span className="badge">
                        <span className={"dot " + (r.tipo === "green" ? "ok" : r.tipo === "loss" ? "danger" : "")} />
                        {typeLabel(r.tipo)}
                      </span>
                    </td>
                    <td style={{ fontWeight: 800 }}>
                      {isPos ? money(r.valor) : `-${money(r.valor)}`}
                    </td>
                    <td className="muted">{r.obs || "-"}</td>
                    <td>
                      <div className="row" style={{ gap: 8 }}>
                        <button className="btn" type="button" onClick={() => editPrompt(r)}>Editar</button>
                        <button className="btn danger" type="button" onClick={() => del(r.id)}>Excluir</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!rows.length && !loading ? (
                <tr>
                  <td colSpan={5} className="muted">Sem lançamentos nesse período.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
