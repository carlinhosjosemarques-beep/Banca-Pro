import { useEffect, useMemo, useState } from "react";
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

const CHECKOUT_URL = import.meta.env.VITE_KIWIFY_CHECKOUT_URL || "#";

export default function App() {
  const [user, setUser] = useState(undefined);
  const [profile, setProfile] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(true);

  const [tab, setTab] = useState("dashboard");
  const isMobile = useIsMobile();

  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem("banca_theme");
    return saved === "light" ? "light" : "dark";
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("banca_theme", theme);
  }, [theme]);

  // AUTH
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
    });

    return () => sub?.subscription?.unsubscribe?.();
  }, []);

  // PROFILE (assinatura)
  useEffect(() => {
    async function loadProfile() {
      if (!user?.id) {
        setProfile(null);
        setLoadingProfile(false);
        return;
      }

      setLoadingProfile(true);

      const { data, error } = await supabase
        .from("profiles")
        .select("display_name, subscription_status")
        .eq("id", user.id)
        .maybeSingle();

      if (!error) setProfile(data || null);
      setLoadingProfile(false);
    }

    loadProfile();
  }, [user?.id]);

  const displayName = profile?.display_name || "";

  const saudacao = useMemo(() => {
    const h = new Date().getHours();
    const hi = helloByHour(h);
    return displayName ? `${hi}, ${displayName}!` : `${hi}!`;
  }, [displayName]);

  const assinaturaAtiva = profile?.subscription_status === "active";

  async function sair() {
    await supabase.auth.signOut();
  }

  // ====== ESTADOS ======
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
        <div className="muted">Verificando assinatura...</div>
      </div>
    );
  }

  // 🚫 PAYWALL
  if (!assinaturaAtiva) {
    return (
      <Paywall
        displayName={displayName}
        status={profile?.subscription_status || "inactive"}
        onLogout={sair}
        checkoutUrl={CHECKOUT_URL}
      />
    );
  }

  // ✅ APP LIBERADO
  return (
    <div>
      <div className="container">
        <div className="topbar">
          <div className="brand">
            <div className="logo" />
            <div>
              <h1>Banca Pro</h1>
              <p>{saudacao} • {user.email}</p>
            </div>
          </div>

          <div className="nav">
            <button className={"tab " + (tab === "dashboard" ? "active" : "")} onClick={() => setTab("dashboard")}>Dashboard</button>
            <button className={"tab " + (tab === "lancamentos" ? "active" : "")} onClick={() => setTab("lancamentos")}>Lançamentos</button>
            <button className={"tab " + (tab === "relatorios" ? "active" : "")} onClick={() => setTab("relatorios")}>Relatórios</button>
            <button className={"tab " + (tab === "metas" ? "active" : "")} onClick={() => setTab("metas")}>Metas</button>

            <button className="btn" onClick={() => setTheme(t => (t === "dark" ? "light" : "dark"))}>
              {theme === "dark" ? "Modo claro" : "Modo escuro"}
            </button>

            <button className={"btn " + (tab === "perfil" ? "primary" : "")} onClick={() => setTab("perfil")} title="Perfil">
              👤
            </button>

            <button className="btn danger" onClick={sair}>Sair</button>
          </div>
        </div>
      </div>

      {tab === "dashboard" && <Dashboard user={user} />}
      {tab === "lancamentos" && <Lancamentos user={user} />}
      {tab === "relatorios" && <Relatorios user={user} />}
      {tab === "metas" && <Metas user={user} />}
      {tab === "perfil" && <Perfil user={user} onLogout={sair} />}

      {isMobile && (
        <div className="mobilebar">
          <button className={"mitem " + (tab === "dashboard" ? "active" : "")} onClick={() => setTab("dashboard")}>Dashboard</button>
          <button className={"mitem " + (tab === "lancamentos" ? "active" : "")} onClick={() => setTab("lancamentos")}>Lançamentos</button>
          <button className={"mitem " + (tab === "relatorios" ? "active" : "")} onClick={() => setTab("relatorios")}>Relatórios</button>
          <button className={"mitem " + (tab === "metas" ? "active" : "")} onClick={() => setTab("metas")}>Metas</button>
        </div>
      )}
    </div>
  );
}
