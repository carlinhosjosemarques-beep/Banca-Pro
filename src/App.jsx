import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./supabaseClient";

import Login from "./Login";
import Dashboard from "./Dashboard";
import Lancamentos from "./Lancamentos";
import Relatorios from "./Relatorios";
import Metas from "./Metas";
import Perfil from "./Perfil";
import Paywall from "./Paywall";

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
  const url = import.meta.env.VITE_STRIPE_CHECKOUT_URL;
  if (!url) {
    alert("Checkout não configurado. Falta VITE_STRIPE_CHECKOUT_URL no .env / Vercel");
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

function LogoMark() {
  return (
    <svg width="34" height="34" viewBox="0 0 64 64" aria-hidden="true" focusable="false" style={{ display: "block" }}>
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
      <path d="M22 42c0-11 8-20 20-20" fill="none" stroke="url(#bp_g2)" strokeWidth="6" strokeLinecap="round" />
      <path d="M26 44c0-8 6-14 14-14" fill="none" stroke="rgba(255,255,255,.9)" strokeWidth="5" strokeLinecap="round" />
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
      <path fill="currentColor" d="M21 14.5A8.5 8.5 0 0 1 9.5 3a7 7 0 1 0 11.5 11.5Z" />
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

function toTime(x) {
  const t = new Date(x).getTime();
  return Number.isFinite(t) ? t : NaN;
}

function computeIsPremium(p) {
  const plan = (p?.plan || "").toLowerCase();
  const sub = (p?.subscription_status || "").toLowerCase();
  const planStatus = (p?.plan_status || "").toLowerCase();

  const paidUntil = p?.paid_until ?? p?.premium_until ?? null;
  const paidTime = paidUntil ? toTime(paidUntil) : NaN;
  const hasValidUntil = Number.isFinite(paidTime) ? paidTime > Date.now() : false;

  const isPremiumFlag = p?.is_premium === true;

  const activeByStatus = sub === "active" || planStatus === "active" || sub === "approved" || sub === "paid";
  const premiumByPlan = plan === "premium" || plan === "pro" || plan === "paid";

  return activeByStatus || premiumByPlan || isPremiumFlag || hasValidUntil;
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
  const [plan, setPlan] = useState("free");
  const [subscriptionStatus, setSubscriptionStatus] = useState("inactive");
  const [paidUntil, setPaidUntil] = useState(null);

  const [planStatus, setPlanStatus] = useState("inactive");
  const [isPremiumFlag, setIsPremiumFlag] = useState(false);
  const [premiumUntil, setPremiumUntil] = useState(null);

  const [loadingProfile, setLoadingProfile] = useState(true);
  const [profileError, setProfileError] = useState("");

  const refreshTimerRef = useRef(null);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("banca_theme", theme);
  }, [theme]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
    });
    return () => sub?.subscription?.unsubscribe?.();
  }, []);

  async function fetchProfile(uid, email) {
    setProfileError("");
    setLoadingProfile(true);

    try {
      const baseSelect = "display_name,plan,subscription_status,paid_until,plan_status,is_premium,premium_until";

      let r = await supabase.from("profiles").select(baseSelect).eq("id", uid).maybeSingle();
      let data = r.data;
      let error = r.error;

      if (!data && !error) {
        const r2 = await supabase.from("profiles").select(baseSelect).eq("user_id", uid).maybeSingle();
        data = r2.data;
        error = r2.error;
      }

      if (!data && !error && email) {
        const r3 = await supabase.from("profiles").select(baseSelect).ilike("email", email).maybeSingle();
        data = r3.data;
        error = r3.error;
      }

      if (error) throw error;

      setDisplayName(data?.display_name || "");
      setPlan(data?.plan || "free");
      setSubscriptionStatus(data?.subscription_status || "inactive");
      setPaidUntil(data?.paid_until ?? null);

      setPlanStatus(data?.plan_status || "inactive");
      setIsPremiumFlag(data?.is_premium === true);
      setPremiumUntil(data?.premium_until ?? null);
    } catch (e) {
      setProfileError(e?.message || "Erro ao carregar perfil");
    } finally {
      setLoadingProfile(false);
    }
  }

  useEffect(() => {
    let channel;

    async function loadAndSubscribe() {
      if (!user?.id) return;

      await fetchProfile(user.id, user.email);

      channel = supabase
        .channel("profile-premium-" + user.id)
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${user.id}` },
          (payload) => {
            const next = payload?.new;
            if (!next) return;

            setDisplayName(next.display_name || "");
            setPlan(next.plan || "free");
            setSubscriptionStatus(next.subscription_status || "inactive");
            setPaidUntil(next.paid_until ?? null);

            setPlanStatus(next.plan_status || "inactive");
            setIsPremiumFlag(next.is_premium === true);
            setPremiumUntil(next.premium_until ?? null);
          }
        )
        .subscribe();
    }

    loadAndSubscribe();

    return () => {
      if (channel) supabase.removeChannel(channel);
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };
  }, [user?.id]);

  const saudacao = useMemo(() => {
    const h = new Date().getHours();
    const hi = helloByHour(h);
    const nm = (displayName || "").trim();
    return nm ? `${hi}, ${nm}!` : `${hi}!`;
  }, [displayName]);

  const isPremium = useMemo(() => {
    return computeIsPremium({
      plan,
      subscription_status: subscriptionStatus,
      paid_until: paidUntil,
      plan_status: planStatus,
      is_premium: isPremiumFlag,
      premium_until: premiumUntil,
    });
  }, [plan, subscriptionStatus, paidUntil, planStatus, isPremiumFlag, premiumUntil]);

  async function sair() {
    if (refreshTimerRef.current) {
      clearInterval(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
    await supabase.auth.signOut();
  }

  async function onAlreadyPaid() {
    if (!user?.id) return;

    await fetchProfile(user.id, user.email);

    if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);

    const start = Date.now();
    refreshTimerRef.current = setInterval(async () => {
      if (Date.now() - start > 60_000) {
        clearInterval(refreshTimerRef.current);
        refreshTimerRef.current = null;
        return;
      }
      await fetchProfile(user.id, user.email);
    }, 4000);
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
      <div>
        <div className="container" style={{ paddingTop: 24 }}>
          <div className="topbar" style={{ marginBottom: 18 }}>
            <div className="brand" style={{ minWidth: 0, flex: 1, gap: 12, alignItems: "center" }}>
              <div className="logo" aria-hidden="true" style={{ width: 52, height: 52, borderRadius: 18 }}>
                <LogoMark />
              </div>
              <div style={{ minWidth: 0 }}>
                <h1 style={{ fontSize: isMobile ? 26 : 34, lineHeight: 1.05, margin: 0 }}>Banca Pro</h1>
                <p style={{ margin: "6px 0 0", color: "var(--muted)", fontSize: 13, lineHeight: 1.25, wordBreak: "break-word" }}>
                  {saudacao} • {user.email}
                </p>
              </div>
            </div>

            <div className="nav" style={{ justifyContent: "flex-end" }}>
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
        </div>

        <Paywall
          displayName={displayName}
          status={subscriptionStatus || planStatus || "inactive"}
          checkoutUrl={import.meta.env.VITE_STRIPE_CHECKOUT_URL || "#"}
          onLogout={sair}
          onCheckout={openCheckout}
          onRefresh={onAlreadyPaid}
          priceLabel={"R$ 24,99/mês"}
        />

        {profileError ? (
          <div className="container" style={{ marginTop: 12 }}>
            <div className="muted">Erro: {profileError}</div>
          </div>
        ) : null}

        <div className="container" style={{ marginTop: 10 }}>
          <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
            <span className="badge">
              Status: <b>{(subscriptionStatus || planStatus) === "active" ? "Ativa" : "Inativa"}</b>
            </span>
            <span className="badge">
              Plano: <b>{plan || "free"}</b>
            </span>
            {paidUntil || premiumUntil ? (
              <span className="badge">
                Válido até: <b>{new Date(paidUntil || premiumUntil).toLocaleDateString("pt-BR")}</b>
              </span>
            ) : null}
          </div>

          <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>
            Use o mesmo e-mail do pagamento. Se acabou de pagar, toque em “Já paguei, atualizar”.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="container">
        <div className="topbar" style={{ flexWrap: "wrap" }}>
          <div className="brand" style={{ minWidth: 0, flex: 1, gap: 12, alignItems: "center" }}>
            <div className="logo" aria-hidden="true" style={{ width: 52, height: 52, borderRadius: 18 }}>
              <LogoMark />
            </div>
            <div style={{ minWidth: 0 }}>
              <h1 style={{ fontSize: isMobile ? 26 : 34, lineHeight: 1.05, margin: 0 }}>Banca Pro</h1>
              <p style={{ margin: "6px 0 0", color: "var(--muted)", fontSize: 13, lineHeight: 1.25, wordBreak: "break-word" }}>
                {saudacao} • {user.email}
              </p>
            </div>
          </div>

          {!isMobile ? (
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
                <span>Perfil</span>
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
          ) : (
            <div className="nav" style={{ width: "100%", justifyContent: "flex-end" }}>
              <button
                className="btn"
                type="button"
                onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
                title={themeLabel}
                aria-label={themeLabel}
                style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
              >
                <ThemeIcon />
                <span style={{ whiteSpace: "nowrap" }}>{themeLabel}</span>
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
                <span style={{ whiteSpace: "nowrap" }}>Perfil</span>
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
                <span style={{ whiteSpace: "nowrap" }}>Sair</span>
              </button>
            </div>
          )}
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
