import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";

import Login from "./Login";
import Dashboard from "./Dashboard";
import Lancamentos from "./Lancamentos";
import Relatorios from "./Relatorios";
import Metas from "./Metas";
import Perfil from "./Perfil";

function helloByHour(h) {
  // ✅ Bom dia 05–11, Boa tarde 12–17, Boa noite 18–04
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

export default function App() {
  const [user, setUser] = useState(undefined);
  const [tab, setTab] = useState("dashboard");
  const isMobile = useIsMobile();

  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem("banca_theme");
    return saved === "light" ? "light" : "dark";
  });

  const [displayName, setDisplayName] = useState("");

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
    async function loadProfile() {
      if (!user?.id) return;
      const { data } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("user_id", user.id)
        .maybeSingle();
      setDisplayName(data?.display_name || "");
    }
    loadProfile();
  }, [user?.id]);

  const saudacao = useMemo(() => {
    const h = new Date().getHours(); // pega a hora do PC do usuário
    const hi = helloByHour(h);
    const nm = (displayName || "").trim();
    return nm ? `${hi}, ${nm}!` : `${hi}!`;
  }, [displayName]);

  async function sair() {
    await supabase.auth.signOut();
  }

  if (user === undefined) return <div className="container"><div className="muted">Carregando...</div></div>;
  if (!user) return <Login />;

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

            {/* ✅ Perfil só “bonequinho” */}
            <button className={"btn " + (tab === "perfil" ? "primary" : "")} onClick={() => setTab("perfil")} title="Perfil">
              👤
            </button>

            <button className="btn danger" onClick={sair}>Sair</button>
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
          <button className={"mitem " + (tab === "dashboard" ? "active" : "")} onClick={() => setTab("dashboard")}>Dashboard</button>
          <button className={"mitem " + (tab === "lancamentos" ? "active" : "")} onClick={() => setTab("lancamentos")}>Lançamentos</button>
          <button className={"mitem " + (tab === "relatorios" ? "active" : "")} onClick={() => setTab("relatorios")}>Relatórios</button>
          <button className={"mitem " + (tab === "metas" ? "active" : "")} onClick={() => setTab("metas")}>Metas</button>
        </div>
      ) : null}
    </div>
  );
}
