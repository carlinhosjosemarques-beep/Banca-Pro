import { createClient } from "@supabase/supabase-js";

function toLowerSafe(v) {
  return String(v || "").toLowerCase();
}

function addDaysISO(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });

  try {
    const token = req.query.token;
    if (!token || token !== process.env.KIWIFY_WEBHOOK_TOKEN) {
      return res.status(401).json({ error: "invalid_token" });
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
      return res.status(500).json({ error: "missing_env" });
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceKey);

    const payload = req.body || {};

    const eventRaw =
      payload?.event ||
      payload?.type ||
      payload?.name ||
      payload?.data?.event ||
      payload?.data?.type ||
      "";

    const ev = toLowerSafe(eventRaw);

    const email =
      payload?.customer?.email ||
      payload?.buyer?.email ||
      payload?.data?.customer?.email ||
      payload?.data?.buyer?.email ||
      payload?.email ||
      null;

    if (!email) return res.status(200).json({ ok: true, note: "no_email_in_payload" });

    const isApproved =
      ev.includes("compra_aprov") ||
      ev.includes("approved") ||
      ev.includes("aprovada") ||
      ev.includes("assinatura_renov") ||
      ev.includes("renovada") ||
      ev.includes("subscription_renew") ||
      ev.includes("subscription_active");

    const isCanceledOrBad =
      ev.includes("reembolso") ||
      ev.includes("refund") ||
      ev.includes("chargeback") ||
      ev.includes("cancel") ||
      ev.includes("assinatura_cancel") ||
      ev.includes("assinatura_atras") ||
      ev.includes("past_due") ||
      ev.includes("recusada") ||
      ev.includes("compra_recus");

    if (!isApproved && !isCanceledOrBad) {
      return res.status(200).json({ ok: true, note: "ignored_event", event: eventRaw });
    }

    const { data: userByEmail, error: uErr } = await supabaseAdmin.auth.admin.getUserByEmail(email);
    if (uErr) throw uErr;

    const uid = userByEmail?.user?.id;
    if (!uid) {
      return res.status(200).json({ ok: true, note: "auth_user_not_found_for_email" });
    }

    const paidUntil =
      payload?.paid_until ||
      payload?.data?.paid_until ||
      payload?.data?.premium_until ||
      payload?.premium_until ||
      null;

    const patch = isApproved
      ? {
          id: uid,
          email,
          plan: "premium",
          subscription_status: "active",
          paid_until: paidUntil ? new Date(paidUntil).toISOString() : addDaysISO(31),
          kiwify_customer_email: email,
          kiwify_subscription_id: payload?.subscription_id || payload?.data?.subscription_id || null,
          updated_at: new Date().toISOString(),
        }
      : {
          id: uid,
          email,
          plan: "free",
          subscription_status: ev.includes("past_due") || ev.includes("atras") ? "past_due" : "inactive",
          paid_until: null,
          kiwify_customer_email: email,
          kiwify_subscription_id: payload?.subscription_id || payload?.data?.subscription_id || null,
          updated_at: new Date().toISOString(),
        };

    const { error: upErr } = await supabaseAdmin
      .from("profiles")
      .upsert(patch, { onConflict: "id" });

    if (upErr) throw upErr;

    return res.status(200).json({ ok: true, uid, email, status: patch.subscription_status });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "webhook_error" });
  }
}
