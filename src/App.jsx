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

/* 🔥 STRIPE CHECKOUT */
function openCheckout() {
  const url = import.meta.env.VITE_STRIPE_CHECKOUT_URL;
  if (!url) {
    alert("Checkout não configurado. Verifique VITE_STRIPE_CHECKOUT_URL no Vercel.");
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
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

  const activeByStatus =
    sub === "active" ||
    planStatus === "active" ||
    sub === "approved" ||
    sub === "paid";

  const premiumByPlan =
    plan === "premium" ||
    plan === "pro" ||
    plan === "paid";

  return activeByStatus || premiumByPlan || isPremiumFlag || hasValidUntil;
}

export default function App() {
  const [user, setUser] = useState(undefined);
  const [tab, setTab] = useState("dashboard");
  const isMobile = useIsMobile();

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
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
    });

    return () => sub?.subscription?.unsubscribe?.();
  }, []);

  async function fetchProfile(uid, email) {
    setProfileError("");
    setLoadingProfile(true);

    try {
      const select =
        "display_name,plan,subscription_status,paid_until,plan_status,is_premium,premium_until";

      let r = await supabase
        .from("profiles")
        .select(select)
        .eq("id", uid)
        .maybeSingle();

      let data = r.data;
      let error = r.error;

      if (!data && !error) {
        const r2 = await supabase
          .from("profiles")
          .select(select)
          .eq("user_id", uid)
          .maybeSingle();
        data = r2.data;
        error = r2.error;
      }

      if (!data && !error && email) {
        const r3 = await supabase
          .from("profiles")
          .select(select)
          .eq("email", email)
          .maybeSingle();
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
    if (!user?.id) return;
    fetchProfile(user.id, user.email);
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
      if (Date.now() - start > 60000) {
        clearInterval(refreshTimerRef.current);
        refreshTimerRef.current = null;
        return;
      }
      await fetchProfile(user.id, user.email);
    }, 4000);
  }

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
      <Paywall
        displayName={displayName}
        status={subscriptionStatus || planStatus || "inactive"}
        checkoutUrl={import.meta.env.VITE_STRIPE_CHECKOUT_URL || "#"}
        onLogout={sair}
        onCheckout={openCheckout}
        onRefresh={onAlreadyPaid}
      />
    );
  }

  return (
    <div>
      {tab === "dashboard" && <Dashboard user={user} />}
      {tab === "lancamentos" && <Lancamentos user={user} />}
      {tab === "relatorios" && <Relatorios user={user} />}
      {tab === "metas" && <Metas user={user} />}
      {tab === "perfil" && <Perfil user={user} onLogout={sair} />}
    </div>
  );
}
