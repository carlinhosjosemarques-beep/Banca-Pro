import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";
import { getWeekRange, money, parseYMDLocal, signedValue, typeLabel, ymd } from "./utils";

function sumSigned(rows) {
  return rows.reduce((acc, r) => acc + signedValue(r.tipo, r.valor), 0);
}

function sumByType(rows, tipo) {
  return rows.filter((r) => r.tipo === tipo).reduce((a, r) => a + Number(r.valor || 0), 0);
}

function monthStartEndFromYM(ym) {
  const [y, m] = ym.split("-").map(Number);
  const start = new Date(y, (m || 1) - 1, 1, 12, 0, 0);
  const end = new Date(y, (m || 1), 0, 12, 0, 0);
  return { start, end };
}

function ymFromDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function addMonthsYM(ym, delta) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, (m - 1) + delta, 1, 12, 0, 0);
  return ymFromDate(d);
}

export default function Dashboard({ user }) {
  const [loading, setLoading] = useState(true);
  const [todayRows, setTodayRows] = useState([]);
  const [weekRows, setWeekRows] = useState([]);
  const [monthRows, setMonthRows] = useState([]);
  const [recentRows, setRecentRows] = useState([]);
  const [saldoGeral, setSaldoGeral] = useState(0);
  const [err, setErr] = useState("");

  const today = useMemo(() => new Date(), []);
  const todayStr = useMemo(() => ymd(today), [today]);
  const week = useMemo(() => getWeekRange(today, true), [today]);

  const [monthYM, setMonthYM] = useState(() => ymFromDate(new Date()));
  const monthRange = useMemo(() => monthStartEndFromYM(monthYM), [monthYM]);
  const mStart = useMemo(() => ymd(monthRange.start), [monthRange.start]);
  const mEnd = useMemo(() => ymd(monthRange.end), [monthRange.end]);

  const lucroHoje = useMemo(
    () => sumSigned(todayRows.filter((r) => r.tipo === "green" || r.tipo === "loss")),
    [todayRows]
  );
  const lucroSemana = useMemo(
    () => sumSigned(weekRows.filter((r) => r.tipo === "green" || r.tipo === "loss")),
    [weekRows]
  );
  const lucroMes = useMemo(
    () => sumSigned(monthRows.filter((r) => r.tipo === "green" || r.tipo === "loss")),
    [monthRows]
  );

  const depMes = useMemo(() => sumByType(monthRows, "deposito"), [monthRows]);
  const saqueMes = useMemo(() => sumByType(monthRows, "saque"), [monthRows]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setErr("");
      try {
        const { data: todayData, error: e1 } = await supabase
          .from("transacoes")
          .select("*")
          .eq("user_id", user.id)
          .eq("data", todayStr)
          .order("created_at", { ascending: false });
        if (e1) throw e1;

        const wStart = ymd(week.start);
        const wEnd = ymd(week.end);

        const { data: weekData, error: e2 } = await supabase
          .from("transacoes")
          .select("*")
          .eq("user_id", user.id)
          .gte("data", wStart)
          .lte("data", wEnd)
          .order("data", { ascending: false });
        if (e2) throw e2;

        const { data: monthData, error: e3 } = await supabase
          .from("transacoes")
          .select("*")
          .eq("user_id", user.id)
          .gte("data", mStart)
          .lte("data", mEnd)
          .order("data", { ascending: false });
        if (e3) throw e3;

        const { data: recentData, error: e4 } = await supabase
          .from("transacoes")
          .select("*")
          .eq("user_id", user.id)
          .order("data", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(10);
        if (e4) throw e4;

        const { data: allData, error: e5 } = await supabase
          .from("transacoes")
          .select("tipo,valor")
          .eq("user_id", user.id);
        if (e5) throw e5;

        const geral = (allData || []).reduce(
          (acc, r) => acc + signedValue(r.tipo, r.valor),
          0
        );

        if (!cancelled) {
          setTodayRows(todayData || []);
          setWeekRows(weekData || []);
          setMonthRows(monthData || []);
          setRecentRows(recentData || []);
          setSaldoGeral(geral);
        }
      } catch (e) {
        if (!cancelled) setErr(e?.message || "Erro ao carregar");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    const channel = supabase
      .channel("rt-transacoes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "transacoes", filter: `user_id=eq.${user.id}` },
        () => load()
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [user.id, todayStr, week.start, week.end, mStart, mEnd]);

  return (
    <div className="container">
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div>
            <h2>Resumo</h2>
            <div className="muted" style={{ fontSize: 12 }}>
              Você pode trocar o mês para ver histórico (mês passado/ano passado).
            </div>
          </div>

          <div className="row">
            <button className="btn" onClick={() => setMonthYM(ymFromDate(new Date()))}>
              Mês atual
            </button>
            <button className="btn" onClick={() => setMonthYM(addMonthsYM(monthYM, -1))}>
              Mês passado
            </button>
            <div className="field" style={{ minWidth: 170 }}>
              <div className="label">Escolher mês</div>
              <input
                className="input"
                type="month"
                value={monthYM}
                onChange={(e) => setMonthYM(e.target.value)}
              />
            </div>
          </div>
        </div>

        {err ? <div className="muted" style={{ marginTop: 10 }}>{err}</div> : null}
        {loading ? <div className="muted" style={{ marginTop: 10 }}>Carregando...</div> : null}

        <div className="kpis" style={{ marginTop: 12 }}>
          <div className="card" style={{ background: "rgba(255,255,255,.02)" }}>
            <h2>Banca atual (geral)</h2>
            <div className="big">{money(saldoGeral)}</div>
            <div className="muted" style={{ fontSize: 12 }}>Somando tudo desde o início</div>
          </div>

          <div className="card" style={{ background: "rgba(255,255,255,.02)" }}>
            <h2>Lucro/Prejuízo (Hoje)</h2>
            <div className="big">{money(lucroHoje)}</div>
            <div className="muted" style={{ fontSize: 12 }}>Somente green e loss</div>
          </div>

          <div className="card" style={{ background: "rgba(255,255,255,.02)" }}>
            <h2>Lucro/Prejuízo (Semana)</h2>
            <div className="big">{money(lucroSemana)}</div>
            <div className="muted" style={{ fontSize: 12 }}>Segunda → Domingo</div>
          </div>

          <div className="card" style={{ background: "rgba(255,255,255,.02)" }}>
            <h2>Lucro/Prejuízo ({monthYM})</h2>
            <div className="big">{money(lucroMes)}</div>
            <div className="muted" style={{ fontSize: 12 }}>Somente green e loss</div>
          </div>
        </div>

        <div className="hr" />

        <div className="kpis">
          <div className="card" style={{ background: "rgba(255,255,255,.02)" }}>
            <h2>Depositado ({monthYM})</h2>
            <div className="big">{money(depMes)}</div>
          </div>
          <div className="card" style={{ background: "rgba(255,255,255,.02)" }}>
            <h2>Sacado ({monthYM})</h2>
            <div className="big">{money(saqueMes)}</div>
          </div>
          <div className="card" style={{ background: "rgba(255,255,255,.02)" }}>
            <h2>Greens ({monthYM})</h2>
            <div className="big">{monthRows.filter((r) => r.tipo === "green").length}</div>
          </div>
          <div className="card" style={{ background: "rgba(255,255,255,.02)" }}>
            <h2>Losses ({monthYM})</h2>
            <div className="big">{monthRows.filter((r) => r.tipo === "loss").length}</div>
          </div>
        </div>
      </div>

      <div className="card">
        <h2>Últimas 10 transações</h2>

        <table className="table">
          <thead>
            <tr>
              <th>Data</th>
              <th>Tipo</th>
              <th>Valor</th>
              <th>Obs</th>
            </tr>
          </thead>
          <tbody>
            {recentRows.map((r) => {
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
                  <td style={{ fontWeight: 700 }}>
                    {isPos ? money(r.valor) : `-${money(r.valor)}`}
                  </td>
                  <td className="muted">{r.obs || "-"}</td>
                </tr>
              );
            })}
            {!recentRows.length ? (
              <tr>
                <td colSpan={4} className="muted">Sem transações ainda.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
