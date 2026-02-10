import { createClient } from "@supabase/supabase-js";

function toLowerSafe(v) {
  return String(v || "").toLowerCase().trim();
}

function addDaysISO(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function getTokenFromRequest(req) {
  const q = req?.query?.token;

  const h =
    req.headers?.["x-kiwify-token"] ||
    req.headers?.["kiwify-token"] ||
    req.headers?.["token"] ||
    req.headers?.["x-token"] ||
    req.headers?.["authorization"];

  const b = req?.body?.token || req?.body?.webhook_token;

  const headerToken = String(h || "").replace(/^bearer\s+/i, "").trim();
  return String(q || b || headerToken || "").trim();
}

function safeISO(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });

  try {
    const expectedToken = String(process.env.KIWIFY_WEBHOOK_TOKEN || "").trim();
    if (!expectedToken) return res.status(500).json({ error: "missing_env_token" });

    const incomingToken = getTokenFromRequest(req);
    const signature = String(req?.query?.signature || "").trim();

    const authorized = (incomingToken && incomingToken === expectedToken) || !!signature;

    if (!authorized) {
      console.log("[KIWIFY] 401 invalid_auth", {
        hasToken: !!incomingToken,
        hasSignature: !!signature,
        queryKeys: Object.keys(req?.query || {}),
      });

      return res.status(401).json({
        error: "invalid_auth",
        note: "Nenhum token válido recebido e também não veio signature.",
      });
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) return res.status(500).json({ error: "missing_env_supabase" });

    const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const payload = req.body || {};

    const eventRaw =
      payload?.webhook_event_type ||
      payload?.event ||
      payload?.type ||
      payload?.name ||
      payload?.data?.event ||
      payload?.data?.type ||
      payload?.data?.name ||
      "";

    const ev = toLowerSafe(eventRaw);
    const orderStatus = toLowerSafe(payload?.order_status);

    const emailRaw =
      payload?.Customer?.email ||
      payload?.Customer?.Email ||
      payload?.customer?.email ||
      payload?.buyer?.email ||
      payload?.Buyer?.email ||
      payload?.data?.customer?.email ||
      payload?.data?.buyer?.email ||
      payload?.data?.customer_email ||
      payload?.email ||
      null;

    const email = emailRaw ? String(emailRaw).toLowerCase().trim() : null;

    const subscriptionId =
      payload?.subscription_id ||
      payload?.Subscription?.id ||
      payload?.Subscription?.subscription_id ||
      payload?.data?.subscription_id ||
      payload?.data?.subscription?.id ||
      payload?.data?.id ||
      null;

    const paidUntilRaw =
      payload?.paid_until ||
      payload?.data?.paid_until ||
      payload?.data?.premium_until ||
      payload?.premium_until ||
      payload?.data?.next_charge_at ||
      payload?.data?.next_billing_at ||
      payload?.Subscription?.next_charge_at ||
      payload?.Subscription?.next_billing_at ||
      payload?.Subscription?.next_charge_date ||
      null;

    if (!email) {
      console.log("[KIWIFY] no_email_in_payload", {
        eventRaw,
        ev,
        orderStatus,
        keys: Object.keys(payload || {}),
        customerKeys: payload?.Customer ? Object.keys(payload.Customer) : [],
      });
      return res.status(200).json({ ok: true, note: "no_email_in_payload", event: eventRaw });
    }

    const isApproved =
      orderStatus === "paid" ||
      orderStatus === "approved" ||
      orderStatus === "completed" ||
      ev.includes("compra_aprov") ||
      ev.includes("approved") ||
      ev.includes("aprovada") ||
      ev.includes("assinatura_renov") ||
      ev.includes("renovada") ||
      ev.includes("subscription_active") ||
      ev.includes("subscription_renew") ||
      ev.includes("assinatura_ativa") ||
      ev === "active";

    const isCanceledOrBad =
      orderStatus === "refunded" ||
      orderStatus === "chargeback" ||
      orderStatus === "canceled" ||
      orderStatus === "cancelled" ||
      orderStatus === "failed" ||
      orderStatus === "refused" ||
      orderStatus === "declined" ||
      ev.includes("reembolso") ||
      ev.includes("refund") ||
      ev.includes("chargeback") ||
      ev.includes("cancel") ||
      ev.includes("assinatura_cancel") ||
      ev.includes("past_due") ||
      ev.includes("atras") ||
      ev.includes("recus") ||
      ev.includes("recusada");

    if (!isApproved && !isCanceledOrBad) {
      console.log("[KIWIFY] ignored_event", { eventRaw, ev, orderStatus, email });
      return res.status(200).json({ ok: true, note: "ignored_event", event: eventRaw, email });
    }

    // ✅ SOLUÇÃO DEFINITIVA: pegar uid pelo profiles (public) via email
    const { data: prof, error: profErr } = await supabaseAdmin
      .from("profiles")
      .select("id,email")
      .ilike("email", email)
      .maybeSingle();

    if (profErr) throw profErr;

    const uid = prof?.id;
    if (!uid) {
      console.log("[KIWIFY] profile_not_found_for_email", { email, eventRaw, orderStatus });
      return res.status(200).json({
        ok: true,
        note: "profile_not_found_for_email",
        email,
        event: eventRaw,
      });
    }

    const paidUntilISO = safeISO(paidUntilRaw) || (isApproved ? addDaysISO(31) : null);
    const statusBad = orderStatus === "past_due" || ev.includes("past_due") || ev.includes("atras");

    const patch = isApproved
      ? {
          id: uid,
          user_id: uid,
          email,
          plan: "premium",
          subscription_status: "active",
          paid_until: paidUntilISO,

          is_premium: true,
          plan_status: "active",
          premium_until: paidUntilISO,

          kiwify_customer_email: email,
          kiwify_subscription_id: subscriptionId ? String(subscriptionId) : null,

          updated_at: new Date().toISOString(),
        }
      : {
          id: uid,
          user_id: uid,
          email,
          plan: "free",
          subscription_status: statusBad ? "past_due" : "inactive",
          paid_until: null,

          is_premium: false,
          plan_status: statusBad ? "past_due" : "inactive",
          premium_until: null,

          kiwify_customer_email: email,
          kiwify_subscription_id: subscriptionId ? String(subscriptionId) : null,

          updated_at: new Date().toISOString(),
        };

    const { error: upErr } = await supabaseAdmin.from("profiles").upsert(patch, { onConflict: "id" });
    if (upErr) throw upErr;

    console.log("[KIWIFY] profile_updated", {
      uid,
      email,
      eventRaw,
      ev,
      orderStatus,
      status: patch.subscription_status,
      plan: patch.plan,
      paid_until: patch.paid_until,
    });

    return res.status(200).json({
      ok: true,
      note: "profile_updated",
      uid,
      email,
      event: eventRaw,
      status: patch.subscription_status,
      plan: patch.plan,
      paid_until: patch.paid_until,
      is_premium: patch.is_premium,
      plan_status: patch.plan_status,
      premium_until: patch.premium_until,
      kiwify_subscription_id: patch.kiwify_subscription_id,
    });
  } catch (e) {
    console.log("[KIWIFY] webhook_error", e);
    return res.status(500).json({ error: e?.message || "webhook_error" });
  }
}
