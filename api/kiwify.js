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

  const headerToken = String(h || "")
    .replace(/^bearer\s+/i, "")
    .trim();

  return String(q || b || headerToken || "").trim();
}

function safeISO(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "method_not_allowed" });
  }

  try {
    const incomingToken = getTokenFromRequest(req);
    const expectedToken = String(process.env.KIWIFY_WEBHOOK_TOKEN || "").trim();

    if (!expectedToken) {
      return res.status(500).json({ error: "missing_env_token" });
    }

    if (!incomingToken || incomingToken !== expectedToken) {
      return res.status(401).json({
        error: "invalid_token",
        note:
          "Kiwify provavelmente envia o token no header. Este endpoint aceita query/header/body, mas o token precisa bater com KIWIFY_WEBHOOK_TOKEN.",
      });
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
      return res.status(500).json({ error: "missing_env_supabase" });
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceKey);
    const payload = req.body || {};

    const eventRaw =
      payload?.event ||
      payload?.type ||
      payload?.name ||
      payload?.data?.event ||
      payload?.data?.type ||
      payload?.data?.name ||
      "";

    const ev = toLowerSafe(eventRaw);

    const email =
      payload?.customer?.email ||
      payload?.buyer?.email ||
      payload?.data?.customer?.email ||
      payload?.data?.buyer?.email ||
      payload?.data?.customer_email ||
      payload?.email ||
      null;

    const subscriptionId =
      payload?.subscription_id ||
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
      null;

    if (!email) {
      return res.status(200).json({
        ok: true,
        note: "no_email_in_payload",
        event: eventRaw,
      });
    }

    const isApproved =
      ev.includes("compra_aprov") ||
      ev.includes("approved") ||
      ev.includes("aprovada") ||
      ev.includes("assinatura_renov") ||
      ev.includes("renovada") ||
      ev.includes("subscription_active") ||
      ev.includes("subscription_renew") ||
      ev.includes("assinatura_ativa") ||
      ev.includes("active");

    const isCanceledOrBad =
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
      return res.status(200).json({
        ok: true,
        note: "ignored_event",
        event: eventRaw,
        email,
      });
    }

    const { data: userByEmail, error: uErr } =
      await supabaseAdmin.auth.admin.getUserByEmail(email);

    if (uErr) throw uErr;

    const uid = userByEmail?.user?.id;

    if (!uid) {
      return res.status(200).json({
        ok: true,
        note: "auth_user_not_found_for_email",
        email,
        event: eventRaw,
      });
    }

    const paidUntilISO = safeISO(paidUntilRaw) || (isApproved ? addDaysISO(31) : null);

    const patch = isApproved
      ? {
          id: uid,
          user_id: uid,
          email: String(email).toLowerCase(),
          plan: "premium",
          subscription_status: "active",
          paid_until: paidUntilISO,

          is_premium: true,
          plan_status: "active",
          premium_until: paidUntilISO,

          kiwify_customer_email: String(email).toLowerCase(),
          kiwify_subscription_id: subscriptionId ? String(subscriptionId) : null,

          updated_at: new Date().toISOString(),
        }
      : {
          id: uid,
          user_id: uid,
          email: String(email).toLowerCase(),
          plan: "free",
          subscription_status: ev.includes("past_due") || ev.includes("atras") ? "past_due" : "inactive",
          paid_until: null,

          is_premium: false,
          plan_status: ev.includes("past_due") || ev.includes("atras") ? "past_due" : "inactive",
          premium_until: null,

          kiwify_customer_email: String(email).toLowerCase(),
          kiwify_subscription_id: subscriptionId ? String(subscriptionId) : null,

          updated_at: new Date().toISOString(),
        };

    const { error: upErr } = await supabaseAdmin
      .from("profiles")
      .upsert(patch, { onConflict: "id" });

    if (upErr) throw upErr;

    return res.status(200).json({
      ok: true,
      note: "profile_updated",
      uid,
      email: patch.email,
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
    return res.status(500).json({ error: e?.message || "webhook_error" });
  }
}
