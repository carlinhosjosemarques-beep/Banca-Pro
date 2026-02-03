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

function LogoMark() {
  return (
    <svg
      width="34"
      height="34"
      viewBox="0 0 64 64"
      aria-hidden="true"
      focusable="false"
      style={{ display: "block" }}
    >
      <defs>
        <linearGradient id="bp_g1" x1="8" y1="6" x2="56" y2="58" gradientUnits="userSpaceOnUse">
          <stop stopColor="#7C3AED" />
          <stop offset="1" stopColor="#22D3EE" />
        </linearGradient>
        <linearGradient id="bp_g2" x1="18" y1="12" x2="46" y2="52" gradientUnits="userSpaceOnUse">
          <stop stopColor="rgba(255,255,255,.95)" />
          <stop offset="1" stopColor="rgba(255,255,255,.65)" />
        </linearGradient>
      </defs>

      <rect x="6" y="6" width="52" height="52" rx="16" fill="url(#bp_g1)" />
      <path
        d="M22 42c0-11 8-20 20-20"
        fill="none"
        stroke="url(#bp_g2)"
        strokeWidth="6"
        strokeLinecap="round"
      />
      <path
        d="M26 44c0-8 6-14 14-14"
        fill="none"
        stroke="rgba(255,255,255,.9)"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <circle cx="42" cy="22" r="4" fill="rgba(255,255,255,.9)" />
    </svg>
  );
}

function IconSun() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ display: "block" }}>
      <path
        fill="currentColor"
        d="M12 18a6 6 0 1 0 0-12a6 6 0 0 0 0 12Zm0-16a1 1 0 0 1 1 1v1a1 1 0 1 1-2 0V3a1 1 0 0 1 1-1Zm0 18a1 1 0 0 1 1 1v1a1 1 0 1 1-2 0v-1a1 1 0 0 1 1-1ZM4 11a1 1 0 0 1 1 1a1 1 0 1 1-2 0a1 1 0 0 1 1-1Zm18 0a1 1 0 0 1 1 1a1 1 0 1 1-2 0a1 1 0 0 1 1-1ZM5.64 5.64a1 1 0 0 1 1.41 0l.71.71A1 1 0 1 1 6.35 7.76l-.71-.71a1 1 0 0 1 0-1.41Zm12.02 12.02a1 1 0 0 1 1.41 0l.71.71a1 1 0 0 1-1.41 1.41l-.71-.71a1 1 0 0 1 0-1.41ZM18.36 5.64a1 1 0 0 1 0 1.41l-.71.71a1 1 0 1 1-1.41-1.41l.71-.71a1 1 0 0 1 1.41 0ZM6.35 16.24a1 1 0 0 1 1.41 0l.71.71a1 1 0 0 1-1.41 1.41l-.71-.71a1 1 0 0 1 0-1.41Z"
      />
    </svg>
  );
}

function IconMoon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ display: "block" }}>
      <path
        fill="currentColor"
        d="M21 14.5A8.5 8.5 0 0 1 9.5 3a7 7 0 1 0 11.5 11.5Z"
      />
    </svg>
  );
}

function IconUser() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ display: "block" }}>
      <path
        fill="currentColor"
        d="M12 12a4 4 0 1 0-4-4a4 4 0 0 0 4 4Zm0 2c-4.42 0-8 2.24-8 5v1h16v-1c0-2.76-3.58-5-8-5Z"
      />
    </svg>
  );
}

function IconLogout() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ display: "block" }}>
      <path
        fill="currentColor"
        d="M10 17a1 1 0 0 1-1-1v-1H5a1 1 0 0 1 0-2h4v-2a1 1 0 0 1 1.7-.7l4 4a1 1 0 0 1 0 1.4l-4 4A1 1 0 0 1 10 17Zm8-13H12a1 1 0 1 0 0 2h6v14h-6a1 1 0 1 0 0 2h6a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2Z"
      />
    </svg>
  );
}

function ButtonWithIcon({ className = "", onClick, title, children }) {
  return (
    <button className={className} onClick={onClick} title={title} type="button">
      <span className="btnIcon" aria-hidden="true" style={{ display: "inline-flex", alignItems: "center" }}>
        {children?.[0]}
      </span>
      <span className="btnText">{children?.[1]}</span>
    </button>
  );
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

  const themeLabel = theme === "dark" ? "Modo claro" : "Modo escuro";
  const ThemeIcon = theme === "dark" ? IconSun : IconMoon;

  if (user === undefined) {
    return (
      <div className="container">
        <div className="muted">Carregando...</div>
      </div>
    );
  }

  if (!user) return <Login />;

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
            <div className="logo" aria-hidden="true">
              <LogoMark />
            </div>
            <div>
              <h1>Banca Pro</h1>
              <p>
                {saudacao} • {user.email}
              </p>
            </div>
          </div>

          <div className="nav">
            <button
              className="btn"
              type="button"
              onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
              title={themeLabel}
              aria-label={themeLabel}
              style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
            >
              <ThemeIcon />
              <span>{themeLabel}</span>
            </button>

            <button
              className="btn danger"
              type="button"
              onClick={sair}
              title="Sair"
              aria-label="Sair"
              style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
            >
              <IconLogout />
              <span>Sair</span>
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
            <button className="btn primary" type="button" onClick={openCheckout}>
              Assinar agora
            </button>
            <button
              className="btn"
              type="button"
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

  return (
    <div>
      <div className="container">
        <div className="topbar">
          <div className="brand">
            <div className="logo" aria-hidden="true">
              <LogoMark />
            </div>
            <div>
              <h1>Banca Pro</h1>
              <p>
                {saudacao} • {user.email}
              </p>
            </div>
          </div>

          <div className="nav">
            <button className={"tab " + (tab === "dashboard" ? "active" : "")} type="button" onClick={() => setTab("dashboard")}>
              Dashboard
            </button>
            <button className={"tab " + (tab === "lancamentos" ? "active" : "")} type="button" onClick={() => setTab("lancamentos")}>
              Lançamentos
            </button>
            <button className={"tab " + (tab === "relatorios" ? "active" : "")} type="button" onClick={() => setTab("relatorios")}>
              Relatórios
            </button>
            <button className={"tab " + (tab === "metas" ? "active" : "")} type="button" onClick={() => setTab("metas")}>
              Metas
            </button>

            <button
              className="btn"
              type="button"
              onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
              title={themeLabel}
              aria-label={themeLabel}
              style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
            >
              <ThemeIcon />
              <span>{themeLabel}</span>
            </button>

            <button
              className={"btn " + (tab === "perfil" ? "primary" : "")}
              type="button"
              onClick={() => setTab("perfil")}
              title="Perfil"
              aria-label="Perfil"
              style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
            >
              <IconUser />
              <span className="hideOnMobile">Perfil</span>
            </button>

            <button
              className="btn danger"
              type="button"
              onClick={sair}
              title="Sair"
              aria-label="Sair"
              style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
            >
              <IconLogout />
              <span className="hideOnMobile">Sair</span>
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
          <button className={"mitem " + (tab === "dashboard" ? "active" : "")} type="button" onClick={() => setTab("dashboard")}>
            Dashboard
          </button>
          <button className={"mitem " + (tab === "lancamentos" ? "active" : "")} type="button" onClick={() => setTab("lancamentos")}>
            Lançamentos
          </button>
          <button className={"mitem " + (tab === "relatorios" ? "active" : "")} type="button" onClick={() => setTab("relatorios")}>
            Relatórios
          </button>
          <button className={"mitem " + (tab === "metas" ? "active" : "")} type="button" onClick={() => setTab("metas")}>
            Metas
          </button>
        </div>
      ) : null}
    </div>
  );
}
