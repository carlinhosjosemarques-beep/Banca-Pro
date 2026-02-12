import { useMemo } from "react";

export default function Paywall({ displayName, status, onLogout, checkoutUrl, onCheckout, onRefresh }) {
  const msg = useMemo(() => {
    const s = String(status || "").toLowerCase();
    if (s === "past_due") return "Sua mensalidade está em atraso. Regularize pra voltar a usar.";
    if (s === "canceled") return "Sua assinatura foi cancelada. Assine novamente pra continuar.";
    if (s === "active") return "Seu pagamento foi aprovado. Se não liberou ainda, clique em atualizar.";
    return "Seu acesso ainda não está ativo. Assine para liberar o Banca Pro.";
  }, [status]);

  function open() {
    if (onCheckout) return onCheckout();
    if (!checkoutUrl || checkoutUrl === "#") return alert("Checkout não configurado.");
    window.open(checkoutUrl, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="container" style={{ maxWidth: 980 }}>
      <div className="card" style={{ padding: 18 }}>
        <div className="row" style={{ justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
          <div style={{ minWidth: 260 }}>
            <div className="muted" style={{ fontSize: 13 }}>
              {displayName ? `Olá, ${displayName} 👋` : "Olá 👋"}
            </div>
            <h2 style={{ marginTop: 6 }}>Acesso bloqueado</h2>
            <div className="muted" style={{ marginTop: 6, lineHeight: 1.5 }}>{msg}</div>
          </div>

          <div className="row" style={{ gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <span className="badge">
              Status: <b style={{ textTransform: "uppercase" }}>{status || "inactive"}</b>
            </span>
            <button className="btn danger" type="button" onClick={onLogout}>
              Sair
            </button>
          </div>
        </div>

        <div className="hr" />

        <div className="kpis">
          <div className="kpi">
            <div className="kpiTitle">O que você desbloqueia</div>
            <ul className="muted" style={{ marginTop: 10, lineHeight: 1.7, paddingLeft: 18 }}>
              <li>Lançamentos: green, loss, depósito, saque</li>
              <li>Relatórios por mês, semana e intervalo</li>
              <li>Metas com cálculo automático e banca por dia</li>
              <li>Perfil e segurança por usuário</li>
            </ul>
          </div>

          <div className="kpi">
            <div className="kpiTitle">Plano Banca Pro</div>

            <div className="muted" style={{ marginTop: 10, lineHeight: 1.75 }}>
              <div><b>R$ 24,99</b> (assinatura)</div>
              <div style={{ marginTop: 10 }}>Liberação automática após pagamento.</div>
            </div>

            <div className="row" style={{ marginTop: 14, gap: 10, flexWrap: "wrap" }}>
              <button className="btn primary" type="button" onClick={open}>
                Assinar agora
              </button>
              <button className="btn" type="button" onClick={onRefresh}>
                Já paguei, atualizar
              </button>
            </div>

            <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>
              Use o mesmo e-mail do pagamento pra criar sua conta.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
