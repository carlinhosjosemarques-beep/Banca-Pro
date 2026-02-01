export default function Landing({ onGoLogin, checkoutUrl }) {
  return (
    <div className="container" style={{ maxWidth: 980 }}>
      <div className="card" style={{ padding: 18 }}>
        <div className="row" style={{ justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ minWidth: 260, flex: 1 }}>
            <div className="badge" style={{ display: "inline-flex" }}>Banca Pro</div>
            <h2 style={{ marginTop: 10, fontSize: 28, lineHeight: 1.15 }}>
              Gestão profissional da sua banca — simples, rápida e organizada.
            </h2>
            <div className="muted" style={{ marginTop: 10, lineHeight: 1.6 }}>
              Controle greens e losses, depósitos e saques, veja relatórios e planeje metas com cálculo automático.
            </div>

            <div className="row" style={{ marginTop: 14, gap: 10, flexWrap: "wrap" }}>
              <a className="btn primary" href={checkoutUrl} target="_blank" rel="noreferrer">
                Assinar por R$ 24,99 + R$ 10,99/mês
              </a>
              <button className="btn" type="button" onClick={onGoLogin}>
                Já tenho conta
              </button>
            </div>

            <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>
              Dica: pagou? crie sua conta com o mesmo e-mail do pagamento.
            </div>
          </div>

          <div className="card" style={{ minWidth: 260, flex: 1, background: "rgba(255,255,255,.03)" }}>
            <h2 style={{ fontSize: 16 }}>O que você resolve no dia a dia</h2>
            <ul className="muted" style={{ marginTop: 10, lineHeight: 1.8 }}>
              <li>Resultado real por dia/semana/mês/ano</li>
              <li>Entradas sugeridas por % da banca</li>
              <li>Proteção de empate (opcional) e cálculo automático</li>
              <li>Metas com banca por dia e ajuste automático</li>
              <li>Histórico e segurança por usuário</li>
            </ul>

            <div className="hr" />

            <div className="muted" style={{ lineHeight: 1.7 }}>
              <div><b>Adesão:</b> R$ 24,99</div>
              <div><b>Mensal:</b> R$ 10,99</div>
              <div style={{ marginTop: 8 }}>Acesso liberado automaticamente após pagamento.</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
