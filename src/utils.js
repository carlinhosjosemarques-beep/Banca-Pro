export function money(n) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })
    .format(Number(n || 0));
}

export function ymd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseYMDLocal(s) {
  if (!s) return null;
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12, 0, 0);
}

export function signedValue(tipo, valor) {
  const v = Number(valor || 0);
  if (tipo === "green" || tipo === "deposito") return v;
  return -v;
}

export function typeLabel(tipo) {
  if (tipo === "green") return "Green";
  if (tipo === "loss") return "Loss";
  if (tipo === "deposito") return "Depósito";
  if (tipo === "saque") return "Saque";
  return tipo;
}

export function ymFromDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}
export function monthStartEndFromYM(ym) {
  const [y, m] = ym.split("-").map(Number);
  const start = new Date(y, (m || 1) - 1, 1, 12, 0, 0);
  const end = new Date(y, (m || 1), 0, 12, 0, 0);
  return { start, end };
}
export function addMonthsYM(ym, delta) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, (m - 1) + delta, 1, 12, 0, 0);
  return ymFromDate(d);
}

export function getWeekRange(date, weekStartsMonday = true) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0);
  const day = d.getDay();
  const offset = weekStartsMonday ? (day === 0 ? 6 : day - 1) : day;
  const start = new Date(d);
  start.setDate(d.getDate() - offset);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { start, end };
}

/* type="week" -> "2026-W05" */
export function weekToRange(weekStr) {
  if (!weekStr || !weekStr.includes("-W")) return null;
  const [yy, ww] = weekStr.split("-W").map(Number);
  const simple = new Date(yy, 0, 1 + (ww - 1) * 7, 12, 0, 0);
  const dow = simple.getDay();
  const ISOweekStart = new Date(simple);
  const diff = (dow <= 4 ? 1 - dow : 8 - dow);
  ISOweekStart.setDate(simple.getDate() + diff);
  const end = new Date(ISOweekStart);
  end.setDate(ISOweekStart.getDate() + 6);
  return { start: ISOweekStart, end };
}

/* ===== Metas ===== */
export function daysBetween(startYMD, endYMD) {
  const s = parseYMDLocal(startYMD);
  const e = parseYMDLocal(endYMD);
  if (!s || !e) return [];
  const out = [];
  const cur = new Date(s);
  while (cur <= e) {
    out.push(ymd(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

export function calcDailyTarget(meta) {
  const banca = Number(meta.banca_base || 0);
  if (meta.goal_type === "daily_fixed") return Number(meta.daily_value || 0);
  if (meta.goal_type === "final_target") {
    const total = Number(meta.final_target || 0);
    const days = daysBetween(meta.start_date, meta.end_date).length || 1;
    return total / days;
  }
  // pct
  const pct = Number(meta.pct_dia || 0) / 100;
  return banca * pct;
}

/* redistribui deficit/sobra para dias pendentes */
export function redistributeTargets(metaDays, fromIndex, delta) {
  const arr = metaDays.map(d => ({ ...d }));
  const pending = arr.slice(fromIndex + 1).filter(d => d.status === "pendente");
  const n = pending.length;
  if (!n) return arr;

  const addEach = delta / n;
  for (let i = fromIndex + 1; i < arr.length; i++) {
    if (arr[i].status === "pendente") {
      arr[i].target = Number(arr[i].target || 0) + addEach;
    }
  }
  return arr;
}
