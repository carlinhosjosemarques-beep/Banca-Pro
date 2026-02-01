import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";
import { calcDailyTarget, daysBetween, money, signedValue } from "./utils";

function num(v) {
  const n = Number(String(v ?? "").replace(",", "."));
  return isFinite(n) ? n : 0;
}

function fmtDateBR(ymd) {
  const [y, m, d] = String(ymd).split("-");
  return `${d}/${m}/${y}`;
}

function todayYMD() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function fetchMetasSafe(userId) {
  const cols = `
    id,user_id,titulo,ativo,created_at,
    start_date,end_date,
    goal_type,banca_base,pct_dia,entradas_dia,tem_empate,pct_empate,
    daily_value,final_target,stop_win,stop_loss,pct_risco_entrada
  `;

  const { data, error } = await supabase
    .from("metas")
    .select(cols)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) return { data: [], error };

  const normalized = (data || []).map((m) => ({
    ...m,
    pct_dia: m.pct_dia ?? m.pct_risco_entrada ?? null,
    goal_type: m.goal_type ?? "pct",
    entradas_dia: m.entradas_dia ?? 1,
    tem_empate: !!m.tem_empate,
  }));

  return { data: normalized, error: null };
}

async function insertMetaSafe(payload) {
  const { data, error } = await supabase
    .from("metas")
    .insert(payload)
    .select(`
      id,user_id,titulo,ativo,created_at,
      start_date,end_date,
      goal_type,banca_base,pct_dia,entradas_dia,tem_empate,pct_empate,
      daily_value,final_target,stop_win,stop_loss,pct_risco_entrada
    `)
    .single();

  if (error) return { data: null, error };

  return {
    data: {
      ...data,
      pct_dia: data.pct_dia ?? data.pct_risco_entrada ?? null,
      goal_type: data.goal_type ?? "pct",
      entradas_dia: data.entradas_dia ?? 1,
      tem_empate: !!data.tem_empate,
    },
    error: null,
  };
}

export default function Metas({ user }) {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [saldoGeral, setSaldoGeral] = useState(0);
  const [metas, setMetas] = useState([]);

  const [openMetaId, setOpenMetaId] = useState(null);
  const [metaDays, setMetaDays] = useState([]);
  const [loadingDays, setLoadingDays] = useState(false);

  // create form
  const [titulo, setTitulo] = useState("Minha Meta");
  const [startDate, setStartDate] = useState(() => todayYMD());
  const [endDate, setEndDate] = useState(() => todayYMD());
  const [goalType, setGoalType] = useState("pct");

  const [bancaBase, setBancaBase] = useState(0);

  const [pctDia, setPctDia] = useState(2);
  const [entradasDia, setEntradasDia] = useState(5);

  const [temEmpate, setTemEmpate] = useState(false);
  const [pctEmpate, setPctEmpate] = useState(10);

  const [dailyValue, setDailyValue] = useState(200);
  const [finalTarget, setFinalTarget] = useState(5000);

  const [stopWin, setStopWin] = useState(0);
  const [stopLoss, setStopLoss] = useState(0);

  // inline input per row (green/loss + editar valor)
  const [editingRowId, setEditingRowId] = useState(null);
  const [editingStatus, setEditingStatus] = useState(null); // "green" | "loss"
  const [editingValue, setEditingValue] = useState("");

  // editar meta
  const [editingMeta, setEditingMeta] = useState(false);

  const [editTitulo, setEditTitulo] = useState("");
  const [editStart, setEditStart] = useState("");
  const [editEnd, setEditEnd] = useState("");
  const [editGoalType, setEditGoalType] = useState("pct");

  const [editBancaBase, setEditBancaBase] = useState(0);

  const [editPctDia, setEditPctDia] = useState(2);
  const [editEntradasDia, setEditEntradasDia] = useState(5);
  const [editTemEmpate, setEditTemEmpate] = useState(false);
  const [editPctEmpate, setEditPctEmpate] = useState(10);

  const [editDailyValue, setEditDailyValue] = useState(200);
  const [editFinalTarget, setEditFinalTarget] = useState(5000);

  const [editStopWin, setEditStopWin] = useState(0);
  const [editStopLoss, setEditStopLoss] = useState(0);

  async function loadAll({ keepBancaBase = false } = {}) {
    setLoading(true);
    setErr("");
    try {
      const { data: allTx, error: e1 } = await supabase
        .from("transacoes")
        .select("tipo,valor")
        .eq("user_id", user.id);
      if (e1) throw e1;

      const geral = (allTx || []).reduce(
        (acc, r) => acc + signedValue(r.tipo, r.valor),
        0
      );

      setSaldoGeral(geral);
      if (!keepBancaBase) setBancaBase(geral || 0);

      const { data: metasData, error: e2 } = await fetchMetasSafe(user.id);
      if (e2) throw e2;

      setMetas(metasData || []);
    } catch (e) {
      setErr(e?.message || "Erro ao carregar");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, [user.id]);

  const sugestaoCreate = useMemo(() => {
    if (goalType !== "pct") return null;

    const banca = num(bancaBase);
    const pct = num(pctDia);
    const entradas = Math.max(1, parseInt(entradasDia || 1, 10));

    const alvoDia = banca * (pct / 100);
    const porEntrada = alvoDia / entradas;

    const pctE = temEmpate ? num(pctEmpate) : 0;
    const extraEmpate = porEntrada * (pctE / 100);
    const totalPorEntrada = porEntrada + extraEmpate;

    return { alvoDia, porEntrada, extraEmpate, totalPorEntrada, entradas };
  }, [goalType, bancaBase, pctDia, entradasDia, temEmpate, pctEmpate]);

  async function createMeta(e) {
    e.preventDefault();
    setErr("");

    try {
      if (!startDate || !endDate) throw new Error("Informe as datas.");
      if (endDate < startDate)
        throw new Error("Data final não pode ser menor que a inicial.");

      const banca = num(bancaBase);
      if (banca <= 0) throw new Error("Banca base inválida.");

      const payload = {
        user_id: user.id,
        titulo: (titulo || "Minha Meta").trim(),
        ativo: true,
        start_date: startDate,
        end_date: endDate,
        goal_type: goalType,
        banca_base: banca,

        pct_dia: goalType === "pct" ? num(pctDia) : null,
        pct_risco_entrada: goalType === "pct" ? num(pctDia) : null,

        entradas_dia:
          goalType === "pct"
            ? Math.max(1, parseInt(entradasDia || 1, 10))
            : null,
        tem_empate: goalType === "pct" ? !!temEmpate : false,
        pct_empate: goalType === "pct" && temEmpate ? num(pctEmpate) : null,

        daily_value: goalType === "daily_fixed" ? num(dailyValue) : null,
        final_target: goalType === "final_target" ? num(finalTarget) : null,

        stop_win: num(stopWin) || null,
        stop_loss: num(stopLoss) || null,
      };

      const { data: inserted, error } = await insertMetaSafe(payload);
      if (error) throw error;

      const days = daysBetween(inserted.start_date, inserted.end_date);
      const baseDaily = calcDailyTarget(inserted);

      const rows = (days || []).map((d) => ({
        user_id: user.id,
        meta_id: inserted.id,
        day: d,
        target: baseDaily,
        status: "pendente",
        actual: null,
      }));

      const { error: e3 } = await supabase.from("meta_days").insert(rows);
      if (e3) throw e3;

      await loadAll();
      setTitulo("Minha Meta");
      setOpenMetaId(null);
      setMetaDays([]);
      setEditingMeta(false);
    } catch (e2) {
      setErr(e2?.message || "Erro ao criar meta");
    }
  }

  async function deleteMeta(m) {
    if (!confirm("Excluir esta meta?")) return;
    setErr("");
    try {
      const { error } = await supabase
        .from("metas")
        .delete()
        .eq("id", m.id)
        .eq("user_id", user.id);
      if (error) throw error;

      if (openMetaId === m.id) {
        setOpenMetaId(null);
        setMetaDays([]);
        setEditingRowId(null);
        setEditingStatus(null);
        setEditingValue("");
        setEditingMeta(false);
      }
      await loadAll();
    } catch (e) {
      setErr(e?.message || "Erro ao excluir");
    }
  }

  async function toggleActive(m) {
    setErr("");
    try {
      const { error } = await supabase
        .from("metas")
        .update({ ativo: !m.ativo })
        .eq("id", m.id)
        .eq("user_id", user.id);
      if (error) throw error;
      await loadAll({ keepBancaBase: true });
    } catch (e) {
      setErr(e?.message || "Erro ao atualizar");
    }
  }

  async function openMeta(m) {
    const id = m.id;
    if (openMetaId === id) {
      setOpenMetaId(null);
      setMetaDays([]);
      setEditingRowId(null);
      setEditingStatus(null);
      setEditingValue("");
      setEditingMeta(false);
      return;
    }
    setOpenMetaId(id);
    setLoadingDays(true);
    setErr("");
    try {
      const { data, error } = await supabase
        .from("meta_days")
        .select("id,user_id,meta_id,day,target,actual,status")
        .eq("user_id", user.id)
        .eq("meta_id", id)
        .order("day", { ascending: true });
      if (error) throw error;
      setMetaDays(data || []);
    } catch (e) {
      setErr(e?.message || "Erro ao carregar calendário");
    } finally {
      setLoadingDays(false);
    }
  }

  async function refreshOpenMetaDays(metaId) {
    const { data, error } = await supabase
      .from("meta_days")
      .select("id,user_id,meta_id,day,target,actual,status")
      .eq("user_id", user.id)
      .eq("meta_id", metaId)
      .order("day", { ascending: true });
    if (error) throw error;
    setMetaDays(data || []);
  }

  const selectedMeta = useMemo(
    () => metas.find((m) => m.id === openMetaId) || null,
    [metas, openMetaId]
  );

  const plannedTotal = useMemo(() => {
    if (!selectedMeta || !metaDays.length) return 0;

    const count = metaDays.length;
    if (selectedMeta.goal_type === "daily_fixed") {
      const dv = num(selectedMeta.daily_value);
      return dv * count;
    }
    if (selectedMeta.goal_type === "final_target") {
      const ft = num(selectedMeta.final_target);
      const bb = num(selectedMeta.banca_base);
      return Math.max(0, ft - bb);
    }
    return metaDays.reduce((a, d) => a + Number(d.target || 0), 0);
  }, [selectedMeta, metaDays]);

  const realizedTotal = useMemo(() => {
    if (!metaDays.length) return 0;
    return metaDays.reduce((a, d) => a + Number(d.actual ?? 0), 0);
  }, [metaDays]);

  const bancaAtual = useMemo(() => {
    if (!selectedMeta) return 0;
    return num(selectedMeta.banca_base) + realizedTotal;
  }, [selectedMeta, realizedTotal]);

  const bancaAlvo = useMemo(() => {
    if (!selectedMeta) return 0;
    const bb = num(selectedMeta.banca_base);
    if (selectedMeta.goal_type === "final_target") return num(selectedMeta.final_target);
    return bb + plannedTotal;
  }, [selectedMeta, plannedTotal]);

  const remaining = useMemo(
    () => plannedTotal - realizedTotal,
    [plannedTotal, realizedTotal]
  );

  const sugestaoMetaAberta = useMemo(() => {
    if (!selectedMeta || selectedMeta.goal_type !== "pct") return null;

    const banca = num(bancaAtual);
    const pct = num(selectedMeta.pct_dia);
    const entradas = Math.max(1, parseInt(selectedMeta.entradas_dia || 1, 10));

    const alvoDia = banca * (pct / 100);
    const porEntrada = alvoDia / entradas;

    const pctE = selectedMeta.tem_empate ? num(selectedMeta.pct_empate) : 0;
    const extraEmpate = porEntrada * (pctE / 100);
    const totalPorEntrada = porEntrada + extraEmpate;

    return { alvoDia, porEntrada, extraEmpate, totalPorEntrada, entradas, pctE };
  }, [selectedMeta, bancaAtual]);

  const bancaPorDia = useMemo(() => {
    if (!selectedMeta || !metaDays.length) return [];
    let running = num(selectedMeta.banca_base);

    return metaDays.map((d) => {
      running += Number(d.actual ?? 0);
      return { id: d.id, banca: running };
    });
  }, [selectedMeta, metaDays]);

  function getBancaRow(dayId) {
    const found = bancaPorDia.find((x) => x.id === dayId);
    return found ? found.banca : null;
  }

  function beginInput(row, status) {
    setEditingRowId(row.id);
    setEditingStatus(status);
    setEditingValue("");
  }

  function beginEditValue(row) {
    const st = row.status === "loss" ? "loss" : "green";
    setEditingRowId(row.id);
    setEditingStatus(st);
    setEditingValue(
      row.actual === null || row.actual === undefined
        ? ""
        : String(Math.abs(Number(row.actual)))
    );
  }

  function cancelInput() {
    setEditingRowId(null);
    setEditingStatus(null);
    setEditingValue("");
  }

  async function submitValue(row) {
    setErr("");
    try {
      const raw = num(editingValue);
      if (!raw) throw new Error("Digite um valor.");

      const actual = editingStatus === "loss" ? -Math.abs(raw) : Math.abs(raw);

      const { error: e1 } = await supabase
        .from("meta_days")
        .update({ status: editingStatus, actual })
        .eq("id", row.id)
        .eq("user_id", user.id);
      if (e1) throw e1;

      await refreshOpenMetaDays(row.meta_id);
      cancelInput();
    } catch (e) {
      setErr(e?.message || "Erro ao lançar valor");
    }
  }

  function startEditMeta(m) {
    setEditingMeta(true);

    setEditTitulo(m.titulo || "Minha Meta");
    setEditStart(m.start_date || todayYMD());
    setEditEnd(m.end_date || todayYMD());
    setEditGoalType(m.goal_type || "pct");

    setEditBancaBase(num(m.banca_base));

    setEditPctDia(num(m.pct_dia ?? 0) || 2);
    setEditEntradasDia(parseInt(m.entradas_dia || 1, 10));
    setEditTemEmpate(!!m.tem_empate);
    setEditPctEmpate(num(m.pct_empate ?? 0) || 10);

    setEditDailyValue(num(m.daily_value ?? 0) || 200);
    setEditFinalTarget(num(m.final_target ?? 0) || 5000);

    setEditStopWin(num(m.stop_win ?? 0) || 0);
    setEditStopLoss(num(m.stop_loss ?? 0) || 0);
  }

  function cancelEditMeta() {
    setEditingMeta(false);
  }

  async function saveEditMeta(m) {
    setErr("");
    try {
      if (!editStart || !editEnd) throw new Error("Informe as datas.");
      if (editEnd < editStart)
        throw new Error("Data final não pode ser menor que a inicial.");

      const bb = num(editBancaBase);
      if (bb <= 0) throw new Error("Banca base inválida.");

      const upd = {
        titulo: (editTitulo || "Minha Meta").trim(),
        start_date: editStart,
        end_date: editEnd,
        goal_type: editGoalType,
        banca_base: bb,

        pct_dia: editGoalType === "pct" ? num(editPctDia) : null,
        pct_risco_entrada: editGoalType === "pct" ? num(editPctDia) : null,
        entradas_dia:
          editGoalType === "pct"
            ? Math.max(1, parseInt(editEntradasDia || 1, 10))
            : null,
        tem_empate: editGoalType === "pct" ? !!editTemEmpate : false,
        pct_empate: editGoalType === "pct" && editTemEmpate ? num(editPctEmpate) : null,

        daily_value: editGoalType === "daily_fixed" ? num(editDailyValue) : null,
        final_target: editGoalType === "final_target" ? num(editFinalTarget) : null,

        stop_win: num(editStopWin) || null,
        stop_loss: num(editStopLoss) || null,
      };

      const { error } = await supabase
        .from("metas")
        .update(upd)
        .eq("id", m.id)
        .eq("user_id", user.id);

      if (error) throw error;

      await loadAll({ keepBancaBase: true });

      setEditingMeta(false);
    } catch (e) {
      setErr(e?.message || "Erro ao editar meta");
    }
  }

  return (
    <div className="container">
      <div className="card">
        <div
          className="row"
          style={{ justifyContent: "space-between", alignItems: "flex-end" }}
        >
          <div>
            <h2>Metas</h2>
            <div className="muted" style={{ fontSize: 13 }}>
              Sua banca atual: <b>{money(saldoGeral)}</b>
            </div>
          </div>
        </div>

        {err ? (
          <div className="muted" style={{ marginTop: 10 }}>
            {err}
          </div>
        ) : null}
        {loading ? (
          <div className="muted" style={{ marginTop: 10 }}>
            Carregando...
          </div>
        ) : null}

        <div className="hr" />

        <h2>Criar nova meta</h2>

        <form
          onSubmit={createMeta}
          className="row"
          style={{ alignItems: "flex-end" }}
        >
          <div className="field" style={{ minWidth: 220, flex: 1 }}>
            <div className="label">Título</div>
            <input
              className="input"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
            />
          </div>

          <div className="field">
            <div className="label">Início</div>
            <input
              className="input"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>

          <div className="field">
            <div className="label">Término</div>
            <input
              className="input"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>

          <div className="field" style={{ minWidth: 220 }}>
            <div className="label">Tipo de meta</div>
            <select
              className="select"
              value={goalType}
              onChange={(e) => setGoalType(e.target.value)}
            >
              <option value="pct">% ao dia (em cima da banca)</option>
              <option value="daily_fixed">Valor fixo por dia</option>
              <option value="final_target">Meta final até a data</option>
            </select>
          </div>

          <div className="field">
            <div className="label">Banca base</div>
            <input
              className="input"
              value={String(bancaBase)}
              onChange={(e) => setBancaBase(e.target.value)}
              inputMode="decimal"
            />
          </div>

          {goalType === "pct" ? (
            <>
              <div className="field">
                <div className="label">% ao dia</div>
                <input
                  className="input"
                  value={String(pctDia)}
                  onChange={(e) => setPctDia(e.target.value)}
                  inputMode="decimal"
                />
              </div>

              <div className="field">
                <div className="label">Entradas por dia</div>
                <input
                  className="input"
                  value={String(entradasDia)}
                  onChange={(e) => setEntradasDia(e.target.value)}
                  inputMode="numeric"
                />
              </div>

              <div className="field" style={{ minWidth: 220 }}>
                <div className="label">Proteção de empate?</div>
                <select
                  className="select"
                  value={temEmpate ? "sim" : "nao"}
                  onChange={(e) => setTemEmpate(e.target.value === "sim")}
                >
                  <option value="nao">Não</option>
                  <option value="sim">Sim</option>
                </select>
              </div>

              {temEmpate ? (
                <div className="field">
                  <div className="label">% para cobrir empate</div>
                  <input
                    className="input"
                    value={String(pctEmpate)}
                    onChange={(e) => setPctEmpate(e.target.value)}
                    inputMode="decimal"
                  />
                </div>
              ) : null}
            </>
          ) : null}

          {goalType === "daily_fixed" ? (
            <div className="field">
              <div className="label">Valor/dia</div>
              <input
                className="input"
                value={String(dailyValue)}
                onChange={(e) => setDailyValue(e.target.value)}
                inputMode="decimal"
              />
            </div>
          ) : null}

          {goalType === "final_target" ? (
            <div className="field">
              <div className="label">Banca alvo (R$)</div>
              <input
                className="input"
                value={String(finalTarget)}
                onChange={(e) => setFinalTarget(e.target.value)}
                inputMode="decimal"
              />
            </div>
          ) : null}

          <div className="field">
            <div className="label">Stop Win (R$ por dia)</div>
            <input
              className="input"
              value={String(stopWin)}
              onChange={(e) => setStopWin(e.target.value)}
              inputMode="decimal"
              placeholder="opcional"
            />
          </div>

          <div className="field">
            <div className="label">Stop Loss (R$ por dia)</div>
            <input
              className="input"
              value={String(stopLoss)}
              onChange={(e) => setStopLoss(e.target.value)}
              inputMode="decimal"
              placeholder="opcional"
            />
          </div>

          <button className="btn primary" type="submit">
            Criar meta
          </button>
        </form>

        {sugestaoCreate ? (
          <div style={{ marginTop: 12 }}>
            <div className="row" style={{ flexWrap: "wrap" }}>
              <span className="badge">
                Alvo do dia: <b>{money(sugestaoCreate.alvoDia)}</b>
              </span>
              <span className="badge">
                Por entrada ({sugestaoCreate.entradas}x):{" "}
                <b>{money(sugestaoCreate.porEntrada)}</b>
              </span>
              {temEmpate ? (
                <>
                  <span className="badge">
                    Empate (+{pctEmpate}%):{" "}
                    <b>{money(sugestaoCreate.extraEmpate)}</b>
                  </span>
                  <span className="badge">
                    Total por entrada:{" "}
                    <b>{money(sugestaoCreate.totalPorEntrada)}</b>
                  </span>
                </>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className="hr" />

        <h2>Minhas metas</h2>

        {metas.length ? (
          metas.map((m) => (
            <div key={m.id} style={{ marginBottom: 12 }}>
              <details className="meta" open={openMetaId === m.id}>
                <summary
                  onClick={(e) => {
                    e.preventDefault();
                    openMeta(m);
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div className="metaTitle">{m.titulo}</div>
                    <div className="metaSub">
                      {fmtDateBR(m.start_date)} → {fmtDateBR(m.end_date)} •{" "}
                      {m.ativo ? "Ativa" : "Pausada"}
                      {m.goal_type === "pct"
                        ? ` • ${m.pct_dia}%/dia • ${m.entradas_dia || 1} entradas`
                        : ""}
                      {m.goal_type === "daily_fixed"
                        ? ` • ${money(m.daily_value)}/dia`
                        : ""}
                      {m.goal_type === "final_target"
                        ? ` • Banca alvo ${money(m.final_target)}`
                        : ""}
                    </div>
                  </div>

                  <button
                    className="btn"
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      startEditMeta(m);
                    }}
                  >
                    Editar meta
                  </button>

                  <button
                    className="btn"
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleActive(m);
                    }}
                  >
                    {m.ativo ? "Pausar" : "Ativar"}
                  </button>
                  <button
                    className="btn danger"
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteMeta(m);
                    }}
                  >
                    Excluir
                  </button>
                </summary>

                {openMetaId === m.id ? (
                  <div style={{ marginTop: 12 }}>
                    {loadingDays ? (
                      <div className="muted">Carregando calendário...</div>
                    ) : null}

                    <div
                      className="row"
                      style={{ marginBottom: 10, flexWrap: "wrap" }}
                    >
                      <span className="badge">
                        Banca alvo: <b>{money(bancaAlvo)}</b>
                      </span>
                      <span className="badge">
                        Banca atual: <b>{money(bancaAtual)}</b>
                      </span>
                      <span className="badge">
                        Planejado: <b>{money(plannedTotal)}</b>
                      </span>
                      <span className="badge">
                        <span className="dot ok" />
                        Realizado: <b>{money(realizedTotal)}</b>
                      </span>
                      <span className="badge">
                        <span className="dot warn" />
                        Restante: <b>{money(remaining)}</b>
                      </span>
                    </div>

                    {sugestaoMetaAberta ? (
                      <div
                        className="row"
                        style={{ marginBottom: 10, flexWrap: "wrap" }}
                      >
                        <span className="badge">
                          Alvo do dia: <b>{money(sugestaoMetaAberta.alvoDia)}</b>
                        </span>
                        <span className="badge">
                          Entrada ({sugestaoMetaAberta.entradas}x):{" "}
                          <b>{money(sugestaoMetaAberta.porEntrada)}</b>
                        </span>
                        {sugestaoMetaAberta.pctE ? (
                          <>
                            <span className="badge">
                              Empate (+{sugestaoMetaAberta.pctE}%):{" "}
                              <b>{money(sugestaoMetaAberta.extraEmpate)}</b>
                            </span>
                            <span className="badge">
                              Total por entrada:{" "}
                              <b>{money(sugestaoMetaAberta.totalPorEntrada)}</b>
                            </span>
                          </>
                        ) : null}
                      </div>
                    ) : null}

                    {editingMeta ? (
                      <div style={{ marginBottom: 12 }}>
                        <div
                          className="row"
                          style={{
                            alignItems: "flex-end",
                            flexWrap: "wrap",
                          }}
                        >
                          <div
                            className="field"
                            style={{ minWidth: 220, flex: 1 }}
                          >
                            <div className="label">Título</div>
                            <input
                              className="input"
                              value={editTitulo}
                              onChange={(e) => setEditTitulo(e.target.value)}
                            />
                          </div>

                          <div className="field">
                            <div className="label">Início</div>
                            <input
                              className="input"
                              type="date"
                              value={editStart}
                              onChange={(e) => setEditStart(e.target.value)}
                            />
                          </div>

                          <div className="field">
                            <div className="label">Término</div>
                            <input
                              className="input"
                              type="date"
                              value={editEnd}
                              onChange={(e) => setEditEnd(e.target.value)}
                            />
                          </div>

                          <div className="field" style={{ minWidth: 220 }}>
                            <div className="label">Tipo</div>
                            <select
                              className="select"
                              value={editGoalType}
                              onChange={(e) => setEditGoalType(e.target.value)}
                            >
                              <option value="pct">% ao dia</option>
                              <option value="daily_fixed">Valor fixo/dia</option>
                              <option value="final_target">Banca alvo</option>
                            </select>
                          </div>

                          <div className="field">
                            <div className="label">Banca base</div>
                            <input
                              className="input"
                              value={String(editBancaBase)}
                              onChange={(e) => setEditBancaBase(e.target.value)}
                              inputMode="decimal"
                            />
                          </div>

                          {editGoalType === "pct" ? (
                            <>
                              <div className="field">
                                <div className="label">% ao dia</div>
                                <input
                                  className="input"
                                  value={String(editPctDia)}
                                  onChange={(e) => setEditPctDia(e.target.value)}
                                  inputMode="decimal"
                                />
                              </div>

                              <div className="field">
                                <div className="label">Entradas/dia</div>
                                <input
                                  className="input"
                                  value={String(editEntradasDia)}
                                  onChange={(e) =>
                                    setEditEntradasDia(e.target.value)
                                  }
                                  inputMode="numeric"
                                />
                              </div>

                              <div
                                className="field"
                                style={{ minWidth: 220 }}
                              >
                                <div className="label">Empate?</div>
                                <select
                                  className="select"
                                  value={editTemEmpate ? "sim" : "nao"}
                                  onChange={(e) =>
                                    setEditTemEmpate(e.target.value === "sim")
                                  }
                                >
                                  <option value="nao">Não</option>
                                  <option value="sim">Sim</option>
                                </select>
                              </div>

                              {editTemEmpate ? (
                                <div className="field">
                                  <div className="label">% empate</div>
                                  <input
                                    className="input"
                                    value={String(editPctEmpate)}
                                    onChange={(e) =>
                                      setEditPctEmpate(e.target.value)
                                    }
                                    inputMode="decimal"
                                  />
                                </div>
                              ) : null}
                            </>
                          ) : null}

                          {editGoalType === "daily_fixed" ? (
                            <div className="field">
                              <div className="label">Valor/dia</div>
                              <input
                                className="input"
                                value={String(editDailyValue)}
                                onChange={(e) =>
                                  setEditDailyValue(e.target.value)
                                }
                                inputMode="decimal"
                              />
                            </div>
                          ) : null}

                          {editGoalType === "final_target" ? (
                            <div className="field">
                              <div className="label">Banca alvo</div>
                              <input
                                className="input"
                                value={String(editFinalTarget)}
                                onChange={(e) =>
                                  setEditFinalTarget(e.target.value)
                                }
                                inputMode="decimal"
                              />
                            </div>
                          ) : null}

                          <div className="field">
                            <div className="label">Stop Win</div>
                            <input
                              className="input"
                              value={String(editStopWin)}
                              onChange={(e) => setEditStopWin(e.target.value)}
                              inputMode="decimal"
                            />
                          </div>

                          <div className="field">
                            <div className="label">Stop Loss</div>
                            <input
                              className="input"
                              value={String(editStopLoss)}
                              onChange={(e) => setEditStopLoss(e.target.value)}
                              inputMode="decimal"
                            />
                          </div>

                          <button
                            className="btn primary"
                            type="button"
                            onClick={() => saveEditMeta(m)}
                          >
                            Salvar
                          </button>
                          <button
                            className="btn"
                            type="button"
                            onClick={cancelEditMeta}
                          >
                            Cancelar
                          </button>
                        </div>

                        <div className="hr" style={{ marginTop: 12 }} />
                      </div>
                    ) : null}

                    <table className="table">
                      <thead>
                        <tr>
                          <th>Dia</th>
                          <th>Banca (após o dia)</th>
                          <th>Real</th>
                          <th>Status</th>
                          <th>Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {metaDays.map((d) => {
                          const isGreen = d.status === "green";
                          const isLoss = d.status === "loss";
                          const rowStyle = isGreen
                            ? { background: "rgba(0,255,140,.06)" }
                            : isLoss
                            ? { background: "rgba(255,70,70,.06)" }
                            : null;

                          const bancaDia = getBancaRow(d.id);

                          return (
                            <tr key={d.id} style={rowStyle || undefined}>
                              <td className="muted">{fmtDateBR(d.day)}</td>
                              <td style={{ fontWeight: 800 }}>
                                {bancaDia === null ? "—" : money(bancaDia)}
                              </td>
                              <td>
                                {d.actual === null || d.actual === undefined
                                  ? "—"
                                  : money(d.actual)}
                              </td>
                              <td
                                className="muted"
                                style={{
                                  color: isGreen
                                    ? "#7CFFB2"
                                    : isLoss
                                    ? "#FF8A8A"
                                    : undefined,
                                  fontWeight: 700,
                                }}
                              >
                                {d.status}
                              </td>
                              <td>
                                <div
                                  className="row"
                                  style={{ gap: 10, flexWrap: "wrap" }}
                                >
                                  <button
                                    className="btn"
                                    type="button"
                                    onClick={() => beginInput(d, "green")}
                                  >
                                    Green
                                  </button>
                                  <button
                                    className="btn danger"
                                    type="button"
                                    onClick={() => beginInput(d, "loss")}
                                  >
                                    Loss
                                  </button>

                                  <button
                                    className="btn"
                                    type="button"
                                    onClick={() => beginEditValue(d)}
                                  >
                                    Editar valor
                                  </button>

                                  {editingRowId === d.id ? (
                                    <div className="row" style={{ gap: 8 }}>
                                      <input
                                        className="input"
                                        style={{ width: 170 }}
                                        value={editingValue}
                                        onChange={(e) =>
                                          setEditingValue(e.target.value)
                                        }
                                        inputMode="decimal"
                                        placeholder={
                                          editingStatus === "loss"
                                            ? "Valor (vira negativo)"
                                            : "Valor"
                                        }
                                      />
                                      <button
                                        className="btn primary"
                                        type="button"
                                        onClick={() => submitValue(d)}
                                      >
                                        OK
                                      </button>
                                      <button
                                        className="btn"
                                        type="button"
                                        onClick={cancelInput}
                                      >
                                        Cancelar
                                      </button>
                                    </div>
                                  ) : null}
                                </div>
                              </td>
                            </tr>
                          );
                        })}

                        {!metaDays.length && !loadingDays ? (
                          <tr>
                            <td colSpan={5} className="muted">
                              Sem dias para esta meta.
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </details>
            </div>
          ))
        ) : (
          <div className="muted">Nenhuma meta criada ainda.</div>
        )}
      </div>
    </div>
  );
}
