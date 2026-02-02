import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";

import Login from "./Login";
import Dashboard from "./Dashboard";
import Lancamentos from "./Lancamentos";
import Relatorios from "./Relatorios";
import Metas from "./Metas";
import Perfil from "./Perfil";

function helloByHour(h) {
  if (h >= 5 && h < 12) return "Bom dia";
  if (h >= 12 && h < 18) return "Boa tarde";
  return "Boa noite";
}

function useIsMobile(max = 720) {
  const [is, setIs] = useState(() => window.innerWidth <= max);
  useEffect(() => {
    const on = () => setIs(window.innerWidth <= max);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, [max]);
  return is;
}

function openCheckout() {
  const url = import.meta.env.VITE_KIWIFY_CHECKOUT_URL;
  if (!url) {
    alert("Checkout não configurado. Falta VITE_KIWIFY_CHECKOUT_URL no .env");
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

export default function App() {
  const [user, setUser] = useState(undefined);
  const [tab, setTab] = useState("dashboard");
  const isMobile = useIsMobile();

  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem("banca_theme");
    return saved === "light" ? "light" : "dark";
  });

  const [displayName, setDisplayName] = useState("");
  const [isPremium, setIsPremium] = useState(false);
  const [planStatus, setPlanStatus] = useState("inactive");
  const [loadingProfile, setLoadingProfile] = useState(true);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("banca_theme", theme);
  }, [theme]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
    });
    return () => sub?.subscription?.unsubscribe?.();
  }, []);

  useEffect(() => {
    let channel;

    async function loadProfileAndSubscribe() {
      if (!user?.id) return;

      setLoadingProfile(true);

      const { data, error } = await supabase
        .from("profiles")
        .select("display_name,is_premium,plan_status,premium_until")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!error) {
        setDisplayName(data?.display_name || "");
        setIsPremium(!!data?.is_premium);
        setPlanStatus(data?.plan_status || "inactive");
      }

      setLoadingProfile(false);

      // realtime: libera automaticamente quando webhook marcar premium
      channel = supabase
        .channel("profile-premium-" + user.id)
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "profiles", filter: `user_id=eq.${user.id}` },
          (payload) => {
            const next = payload?.new;
            if (!next) return;
            setDisplayName(next.display_name || "");
            setIsPremium(!!next.is_premium);
            setPlanStatus(next.plan_status || "inactive");
          }
        )
        .subscribe();
    }

    loadProfileAndSubscribe();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [user?.id]);

  const saudacao = useMemo(() => {
    const h = new Date().getHours();
    const hi = helloByHour(h);
    const nm = (displayName || "").trim();
    return nm ? `${hi}, ${nm}!` : `${hi}!`;
  }, [displayName]);

  async function sair() {
    await supabase.auth.signOut();
  }

  if (user === undefined) {
    return (
      <div className="container">
        <div className="muted">Carregando...</div>
      </div>
    );
  }

  if (!user) return <Login />;

  // ✅ BLOQUEIO TOTAL (só entra pagando)
  if (loadingProfile) {
    return (
      <div className="container">
        <div className="card" style={{ marginTop: 20 }}>
          <div className="muted">Carregando seu acesso...</div>
        </div>
      </div>
    );
  }

  if (!isPremium) {
    return (
      <div className="container" style={{ paddingTop: 24 }}>
        <div className="topbar" style={{ marginBottom: 18 }}>
          <div className="brand">
            <div className="logo" />
            <div>
              <h1>Banca Pro</h1>
              <p>
                {saudacao} • {user.email}
              </p>
            </div>
          </div>

          <div className="nav">
            <button className="btn" onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}>
              {theme === "dark" ? "Modo claro" : "Modo escuro"}
            </button>
            <button className="btn danger" onClick={sair}>
              Sair
            </button>
          </div>
        </div>

        <div className="card">
          <h2 style={{ marginBottom: 6 }}>Acesso bloqueado</h2>
          <div className="muted" style={{ marginBottom: 14 }}>
            Para usar o Banca Pro, você precisa ativar sua assinatura.
          </div>

          <div className="row" style={{ gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
            <span className="badge">
              Status: <b>{planStatus === "active" ? "Ativa" : "Inativa"}</b>
            </span>
            <span className="badge">
              Conta: <b>{user.email}</b>
            </span>
          </div>

          <div className="muted" style={{ fontSize: 13, marginBottom: 16 }}>
            Depois que o pagamento for aprovado, seu acesso libera automaticamente.
          </div>

          <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
            <button className="btn primary" onClick={openCheckout}>
              Assinar agora
            </button>
            <button
              className="btn"
              onClick={() => window.location.reload()}
              title="Se você já pagou, clique aqui para checar novamente"
            >
              Já paguei
            </button>
          </div>

          <div className="hr" />

          <div className="muted" style={{ fontSize: 12 }}>
            Se você pagou com outro e-mail, entre com o mesmo e-mail usado no pagamento.
          </div>
        </div>
      </div>
    );
  }

  // ✅ PREMIUM: APP NORMAL
  return (
    <div>
      <div className="container">
        <div className="topbar">
          <div className="brand">
            <div className="logo" />
            <div>
              <h1>Banca Pro</h1>
              <p>
                {saudacao} • {user.email}
              </p>
            </div>
          </div>

          <div className="nav">
            <button className={"tab " + (tab === "dashboard" ? "active" : "")} onClick={() => setTab("dashboard")}>
              Dashboard
            </button>
            <button className={"tab " + (tab === "lancamentos" ? "active" : "")} onClick={() => setTab("lancamentos")}>
              Lançamentos
            </button>
            <button className={"tab " + (tab === "relatorios" ? "active" : "")} onClick={() => setTab("relatorios")}>
              Relatórios
            </button>
            <button className={"tab " + (tab === "metas" ? "active" : "")} onClick={() => setTab("metas")}>
              Metas
            </button>

            <button className="btn" onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}>
              {theme === "dark" ? "Modo claro" : "Modo escuro"}
            </button>

            <button className={"btn " + (tab === "perfil" ? "primary" : "")} onClick={() => setTab("perfil")} title="Perfil">
              👤
            </button>

            <button className="btn danger" onClick={sair}>
              Sair
            </button>
          </div>
        </div>
      </div>

      {tab === "dashboard" ? <Dashboard user={user} /> : null}
      {tab === "lancamentos" ? <Lancamentos user={user} /> : null}
      {tab === "relatorios" ? <Relatorios user={user} /> : null}
      {tab === "metas" ? <Metas user={user} /> : null}
      {tab === "perfil" ? <Perfil user={user} onLogout={sair} /> : null}

      {isMobile ? (
        <div className="mobilebar">
          <button className={"mitem " + (tab === "dashboard" ? "active" : "")} onClick={() => setTab("dashboard")}>
            Dashboard
          </button>
          <button className={"mitem " + (tab === "lancamentos" ? "active" : "")} onClick={() => setTab("lancamentos")}>
            Lançamentos
          </button>
          <button className={"mitem " + (tab === "relatorios" ? "active" : "")} onClick={() => setTab("relatorios")}>
            Relatórios
          </button>
          <button className={"mitem " + (tab === "metas" ? "active" : "")} onClick={() => setTab("metas")}>
            Metas
          </button>
        </div>
      ) : null}
    </div>
  );
}
