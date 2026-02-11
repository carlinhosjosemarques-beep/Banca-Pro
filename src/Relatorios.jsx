import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./supabaseClient";
import {
  addMonthsYM,
  money,
  monthStartEndFromYM,
  parseYMDLocal,
  signedValue,
  weekToRange,
  ymFromDate,
  ymd
} from "./utils";

function sumPnl(rows) {
  return (rows || [])
    .filter(r => r.tipo === "green" || r.tipo === "loss")
    .reduce((a, r) => a + signedValue(r.tipo, r.valor), 0);
}
function sumByType(rows, tipo) {
  return (rows || []).filter(r => r.tipo === tipo).reduce((a, r) => a + Number(r.valor || 0), 0);
}
function groupByDay(rows) {
  const map = new Map();
  for (const r of rows || []) {
    const key = r.data;
    const prev = map.get(key) || [];
    prev.push(r);
    map.set(key, prev);
  }
  const keys = Array.from(map.keys()).sort();
  return keys.map(k => ({ day: k, rows: map.get(k) }));
}
function stats(rows) {
  const g = (rows || []).filter(r => r.tipo === "green");
  const l = (rows || []).filter(r => r.tipo === "loss");
  const gc = g.length, lc = l.length;
  const total = gc + lc;
  const winRate = total ? (gc / total) * 100 : 0;
  const gsum = g.reduce((a, r) => a + Number(r.valor || 0), 0);
  const lsum = l.reduce((a, r) => a + Number(r.valor || 0), 0);
  const avgG = gc ? gsum / gc : 0;
  const avgL = lc ? lsum / lc : 0;
  const maxG = g.reduce((m, r) => Math.max(m, Number(r.valor || 0)), 0);
  const maxL = l.reduce((m, r) => Math.max(m, Number(r.valor || 0)), 0);
  return { gc, lc, winRate, avgG, avgL, maxG, maxL };
}

function drawLine(canvas, pts) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;

  ctx.clearRect(0, 0, w, h);

  ctx.globalAlpha = 0.35;
  ctx.strokeStyle = "#888";
  for (let i = 1; i < 5; i++) {
    const y = (h * i) / 5;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }
  ctx.globalAlpha = 1;

  if (!pts || pts.length < 2) return;

  const xs = pts.map(p => p.x);
  const ys = pts.map(p => p.y);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const pad = 18;

  const minX = xs[0];
  const maxX = xs[xs.length - 1];

  const sx = (x) => {
    if (maxX === minX) return pad;
    return pad + ((x - minX) / (maxX - minX)) * (w - pad * 2);
  };

  const sy = (y) => {
    if (maxY === minY) return h / 2;
    return pad + (1 - (y - minY) / (maxY - minY)) * (h - pad * 2);
  };

  if (minY < 0 && maxY > 0) {
    ctx.globalAlpha = 0.7;
    ctx.strokeStyle = "#bbb";
    ctx.setLineDash([6, 7]);
    ctx.beginPath(); ctx.moveTo(0, sy(0)); ctx.lineTo(w, sy(0)); ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }

  ctx.strokeStyle = "#5b8cff";
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(sx(pts[0].x), sy(pts[0].y));
  for (let i = 1; i < pts.length; i++) ctx.lineTo(sx(pts[i].x), sy(pts[i].y));
  ctx.stroke();
}

export default function Relatorios({ user }) {
  const [mode, setMode] = useState("mes");
  const [monthYM, setMonthYM] = useState(() => ymFromDate(new Date()));
  const [weekStr, setWeekStr] = useState("");
  const [ini, setIni] = useState(() => ymd(new Date()));
  const [fim, setFim] = useState(() => ymd(new Date()));

  const range = useMemo(() => {
    if (mode === "mes") {
      const r = monthStartEndFromYM(monthYM);
      return { start: ymd(r.start), end: ymd(r.end) };
    }
    if (mode === "semana") {
      const r = weekToRange(weekStr);
      if (r) return { start: ymd(r.start), end: ymd(r.end) };
      const now = new Date();
      const monday = new Date(now);
      monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
      const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
      return { start: ymd(monday), end: ymd(sunday) };
    }
    return { start: ini, end: fim };
  }, [mode, monthYM, weekStr, ini, fim]);

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

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
        .order("data", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      setRows(data || []);
    } catch (e) {
      setErr(e?.message || "Erro ao carregar");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [range.start, range.end]);

  const pnl = useMemo(() => sumPnl(rows), [rows]);
  const dep = useMemo(() => sumByType(rows, "deposito"), [rows]);
  const saq = useMemo(() => sumByType(rows, "saque"), [rows]);
  const st = useMemo(() => stats(rows), [rows]);

  const byDay = useMemo(() => groupByDay(rows), [rows]);
  const daily = useMemo(() => byDay.map((d, idx) => {
    const val = d.rows
      .filter(r => r.tipo === "green" || r.tipo === "loss")
      .reduce((a, r) => a + signedValue(r.tipo, r.valor), 0);
    return { day: d.day, idx, val, dep: sumByType(d.rows, "deposito"), saq: sumByType(d.rows, "saque") };
  }), [byDay]);

  const canvasWrapRef = useRef(null);
  const canvasRef = useRef(null);

  useEffect(() => {
    const wrap = canvasWrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;

    const ro = new ResizeObserver(() => {
      const dpr = window.devicePixelRatio || 1;
      const rect = wrap.getBoundingClientRect();
      const w = Math.max(300, Math.floor(rect.width));
      const h = Math.max(180, Math.floor(rect.height));

      canvas.style.width = w + "px";
      canvas.style.height = h + "px";
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);

      const ctx = canvas.getContext("2d");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      drawLine(canvas, daily.map(p => ({ x: p.idx, y: p.val })));
    });

    ro.observe(wrap);
    return () => ro.disconnect();
  }, [daily]);

  const periodoLabel = useMemo(() => {
    const a = parseYMDLocal(range.start);
    const b = parseYMDLocal(range.end);
    return `${a ? a.toLocaleDateString("pt-BR") : range.start} → ${b ? b.toLocaleDateString("pt-BR") : range.end}`;
  }, [range.start, range.end]);

  return (
    <div className="container reportsPage">
      <div className="card">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 260px", minWidth: 0 }}>
            <h2>Relatórios</h2>
            <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>
              Escolha mês, uma semana específica, ou um intervalo.
            </div>
          </div>

          <div className="row" style={{ flex: "1 1 320px", minWidth: 0, justifyContent: "flex-end" }}>
            <button className={"tab " + (mode === "mes" ? "active" : "")} onClick={() => setMode("mes")}>Mês</button>
            <button className={"tab " + (mode === "semana" ? "active" : "")} onClick={() => setMode("semana")}>Semana</button>
            <button className={"tab " + (mode === "intervalo" ? "active" : "")} onClick={() => setMode("intervalo")}>Intervalo</button>
          </div>
        </div>

        <div className="hr" />

        <div className="row" style={{ alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
          {mode === "mes" ? (
            <>
              <button className="btn" type="button" onClick={() => setMonthYM(ymFromDate(new Date()))}>Mês atual</button>
              <button className="btn" type="button" onClick={() => setMonthYM(addMonthsYM(monthYM, -1))}>Mês passado</button>
              <div className="field" style={{ flex: "1 1 190px", minWidth: 0, maxWidth: 260 }}>
                <div className="label">Escolher mês</div>
                <input className="input" type="month" value={monthYM} onChange={(e) => setMonthYM(e.target.value)} />
              </div>
            </>
          ) : null}

          {mode === "semana" ? (
            <div className="field" style={{ flex: "1 1 230px", minWidth: 0, maxWidth: 320 }}>
              <div className="label">Escolher semana</div>
              <input className="input" type="week" value={weekStr} onChange={(e) => setWeekStr(e.target.value)} />
            </div>
          ) : null}

          {mode === "intervalo" ? (
            <>
              <div className="field" style={{ flex: "1 1 180px", minWidth: 0, maxWidth: 260 }}>
                <div className="label">Início</div>
                <input className="input" type="date" value={ini} onChange={(e) => setIni(e.target.value)} />
              </div>
              <div className="field" style={{ flex: "1 1 180px", minWidth: 0, maxWidth: 260 }}>
                <div className="label">Fim</div>
                <input className="input" type="date" value={fim} onChange={(e) => setFim(e.target.value)} />
              </div>
              <button className="btn" type="button" onClick={load}>Aplicar</button>
            </>
          ) : null}

          <span className="badge" style={{ marginLeft: "auto", maxWidth: "100%", whiteSpace: "normal", lineHeight: 1.2 }}>
            Período: <b>{periodoLabel}</b>
          </span>
        </div>

        {err ? <div className="muted" style={{ marginTop: 10 }}>{err}</div> : null}
        {loading ? <div className="muted" style={{ marginTop: 10 }}>Carregando...</div> : null}

        <div className="hr" />

        <div className="kpis">
          <div className="kpi">
            <div className="kpiTitle">Resultado (green/loss)</div>
            <div className="kpiValue">{money(pnl)}</div>
          </div>

          <div className="kpi">
            <div className="kpiTitle">Depositado</div>
            <div className="kpiValue">{money(dep)}</div>
          </div>

          <div className="kpi">
            <div className="kpiTitle">Sacado</div>
            <div className="kpiValue">{money(saq)}</div>
          </div>

          <div className="kpi">
            <div className="kpiTitle">Taxa de acerto</div>
            <div className="kpiValue">{st.winRate.toFixed(1)}%</div>
          </div>
        </div>

        <div className="hr" />

        <div className="row">
          <span className="badge"><span className="dot ok" />Greens: <b>{st.gc}</b></span>
          <span className="badge"><span className="dot danger" />Losses: <b>{st.lc}</b></span>
          <span className="badge">Média green: <b>{money(st.avgG)}</b></span>
          <span className="badge">Média loss: <b>{money(st.avgL)}</b></span>
          <span className="badge">Maior green: <b>{money(st.maxG)}</b></span>
          <span className="badge">Maior loss: <b>{money(st.maxL)}</b></span>
        </div>

        <div className="hr" />

        <h2>Evolução diária (resultado do período)</h2>
        <div className="muted" style={{ fontSize: 13, marginBottom: 8 }}>
          Linha mostra o resultado por dia (somente green/loss).
        </div>

        <div ref={canvasWrapRef} className="chartBox">
          <canvas ref={canvasRef} className="canvas" />
        </div>

        <div className="hr" />

        <h2>Resultado por dia</h2>
        <div className="tableWrap" style={{ marginTop: 10 }}>
          <table className="table">
            <thead>
              <tr>
                <th>Dia</th>
                <th>Resultado (green/loss)</th>
                <th>Depósito</th>
                <th>Saque</th>
              </tr>
            </thead>
            <tbody>
              {daily.map((d) => (
                <tr key={d.day}>
                  <td className="muted">{parseYMDLocal(d.day)?.toLocaleDateString("pt-BR")}</td>
                  <td style={{ fontWeight: 800 }}>{money(d.val)}</td>
                  <td>{money(d.dep)}</td>
                  <td>{money(d.saq)}</td>
                </tr>
              ))}
              {!daily.length && !loading ? (
                <tr><td colSpan={4} className="muted">Sem dados no período.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
