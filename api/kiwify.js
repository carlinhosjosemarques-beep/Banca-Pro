import { createClient } from "@supabase/supabase-js";

function pickEmail(payload) {
  return (
    payload?.customer?.email ||
    payload?.buyer?.email ||
    payload?.data?.customer?.email ||
    payload?.data?.buyer?.email ||
    payload?.email ||
    null
  );
}

function pickEvent(payload) {
  return payload?.event || payload?.type || payload?.name || payload?.data?.event || "";
}

function isPaidEvent(ev) {
  const e = String(ev || "").toLowerCase();
  return (
    e.includes("compra_aprovada") ||
    e.includes("aprov") ||
    e.includes("approved") ||
    e.includes("paid") ||
    e.includes("assinatura_renovada") ||
    e.includes("subscription_active")
  );
}

function isCanceledEvent(ev) {
  const e = String(ev || "").toLowerCase();
  return (
    e.includes("assinatura_cancelada") ||
    e.includes("cancel") ||
    e.includes("reemb") ||
    e.includes("refun") ||
    e.includes("chargeback") ||
    e.includes("assinatura_atrasada") ||
    e.includes("past_due") ||
    e.includes("charge_failed") ||
    e.includes("subscription_inactive")
  );
}

function fallbackPaidUntilISO(payload) {
  // tenta pegar alguma data do payload (se existir) e se não tiver, dá 32 dias de folga
  const cand =
    payload?.data?.paid_until ||
    payload?.data?.premium_until ||
    payload?.paid_until ||
    payload?.premium_until ||
    payload?.subscription?.paid_until ||
    payload?.subscription?.next_charge_date ||
    payload?.data?.subscription?.next_charge_date ||
    null;

  const t = cand ? new Date(cand).getTime() : NaN;
  if (Number.isFinite(t)) return new Date(t).toISOString();

  const plus32 = Date.now() + 32 * 24 * 60 * 60 * 1000;
  return new Date(plus32).toISOString();
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "method_not_allowed" });
  }

  try {
    const token = req.query.token;
    if (!token || token !== process.env.KIWIFY_WEBHOOK_TOKEN) {
      return res.status(401).json({ error: "invalid_token" });
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
      return res.status(500).json({
        error: "missing_env",
        note: "SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set",
      });
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceKey);

    const payload = req.body || {};
    const event = pickEvent(payload);
    const email = pickEmail(payload);

    if (!email) {
      return res.status(200).json({ ok: true, note: "no_email_in_payload" });
    }

    const paid = isPaidEvent(event);
    const canceled = isCanceledEvent(event);

    if (!paid && !canceled) {
      return res.status(200).json({ ok: true, note: "ignored_event", event });
    }

    // acha o profile pelo email
    const { data: profile, error: pErr } = await supabaseAdmin
      .from("profiles")
      .select("id,email,user_id")
      .eq("email", email)
      .maybeSingle();

    if (pErr) throw pErr;

    if (!profile?.id && !profile?.user_id) {
      return res.status(200).json({ ok: true, note: "user_not_found_for_email", email });
    }

    const paidUntilISO = paid ? fallbackPaidUntilISO(payload) : null;

    const patch = paid
      ? {
          // ✅ campos que o App usa
          subscription_status: "active",
          paid_until: paidUntilISO,
          plan: "pro",

          // ✅ compat (se você usa isso em outros lugares)
          is_premium: true,
          plan_status: "active",
          premium_until: paidUntilISO,

          kiwify_customer_email: email,
          kiwify_subscription_id: payload?.subscription_id || payload?.data?.subscription_id || null,
        }
      : {
          subscription_status: "inactive",
          paid_until: null,
          plan: "free",

          is_premium: false,
          plan_status: "inactive",
          premium_until: null,

          kiwify_customer_email: email,
          kiwify_subscription_id: payload?.subscription_id || payload?.data?.subscription_id || null,
        };

    // tenta atualizar por id (schema padrão)
    let uErr = null;

    if (profile?.id) {
      const r = await supabaseAdmin.from("profiles").update(patch).eq("id", profile.id);
      uErr = r.error || null;
    }

    // fallback: se seu schema usa user_id
    if (!uErr && profile?.user_id) {
      const r2 = await supabaseAdmin.from("profiles").update(patch).eq("user_id", profile.user_id);
      uErr = r2.error || null;
    }

    if (uErr) throw uErr;

    return res.status(200).json({ ok: true, event, email });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "webhook_error" });
  }
}
