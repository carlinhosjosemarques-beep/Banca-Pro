import { useMemo } from "react";

export default function Paywall({ displayName, status, onLogout, checkoutUrl }) {
  const msg = useMemo(() => {
    if (status === "past_due") return "Sua mensalidade está em atraso. Regularize pra voltar a usar.";
    if (status === "canceled") return "Sua assinatura foi cancelada. Assine novamente pra continuar.";
    return "Seu acesso ainda não está ativo. Assine para liberar o Banca Pro.";
  }, [status]);

  return (
    <div className="container" style={{ maxWidth: 980 }}>
      <div className="card" style={{ padding: 18 }}>
        <div className="row" style={{ justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div className="muted" style={{ fontSize: 13 }}>
              {displayName ? `Olá, ${displayName} 👋` : "Olá 👋"}
            </div>
            <h2 style={{ marginTop: 6 }}>Acesso bloqueado</h2>
            <div className="muted" style={{ marginTop: 6 }}>
              {msg}
            </div>
          </div>

          <div className="row" style={{ gap: 10, alignItems: "center" }}>
            <span className="badge">
              Status:{" "}
              <b style={{ textTransform: "uppercase" }}>
                {status || "inactive"}
              </b>
            </span>
            <button className="btn" type="button" onClick={onLogout}>
              Sair
            </button>
          </div>
        </div>

        <div className="hr" />

        <div className="row" style={{ gap: 14, flexWrap: "wrap" }}>
          <div className="card" style={{ flex: 1, minWidth: 260, background: "rgba(255,255,255,.03)" }}>
            <h2 style={{ fontSize: 16 }}>O que você desbloqueia</h2>
            <ul className="muted" style={{ marginTop: 10, lineHeight: 1.6 }}>
              <li>Lançamentos: green, loss, depósito, saque</li>
              <li>Relatórios por mês, semana e intervalo</li>
              <li>Metas com cálculo automático e banca por dia</li>
              <li>Perfil e segurança por usuário</li>
            </ul>
          </div>

          <div className="card" style={{ flex: 1, minWidth: 260, background: "rgba(255,255,255,.03)" }}>
            <h2 style={{ fontSize: 16 }}>Plano Banca Pro</h2>
            <div className="muted" style={{ marginTop: 10, lineHeight: 1.7 }}>
              <div><b>R$ 24,99</b> (adesão inicial)</div>
              <div><b>R$ 10,99/mês</b> (assinatura)</div>
              <div style={{ marginTop: 10 }}>Liberação automática após pagamento.</div>
            </div>

            <div className="row" style={{ marginTop: 14, gap: 10, flexWrap: "wrap" }}>
              <a className="btn primary" href={checkoutUrl} target="_blank" rel="noreferrer">
                Assinar agora
              </a>
              <button className="btn" type="button" onClick={() => location.reload()}>
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
