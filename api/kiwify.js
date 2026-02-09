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
  return payload?.event || payload?.type || payload?.name || "";
}

function isPaidEvent(ev) {
  const e = String(ev || "").toLowerCase();
  return (
    e.includes("aprov") ||
    e.includes("approved") ||
    e.includes("paid") ||
    e.includes("compra_aprovada") ||
    e.includes("assinatura_renovada") ||
    e.includes("assinatura_aprovada") ||
    e.includes("subscription_active")
  );
}

function isCanceledEvent(ev) {
  const e = String(ev || "").toLowerCase();
  return (
    e.includes("cancel") ||
    e.includes("reemb") ||
    e.includes("refun") ||
    e.includes("chargeback") ||
    e.includes("atrasad") ||
    e.includes("charge_failed") ||
    e.includes("subscription_inactive") ||
    e.includes("assinatura_cancelada") ||
    e.includes("assinatura_atrasada")
  );
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
      return res.status(500).json({ error: "missing_env", note: "SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set" });
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceKey);

    const payload = req.body || {};
    const event = pickEvent(payload);
    const email = pickEmail(payload);

    if (!email) return res.status(200).json({ ok: true, note: "no_email_in_payload" });

    const paid = isPaidEvent(event);
    const canceled = isCanceledEvent(event);

    if (!paid && !canceled) {
      return res.status(200).json({ ok: true, note: "ignored_event", event });
    }

    // acha profile por email (seu print mostra que email existe e user_id está NULL)
    const { data: profile, error: pErr } = await supabaseAdmin
      .from("profiles")
      .select("id,email")
      .eq("email", email)
      .maybeSingle();

    if (pErr) throw pErr;

    if (!profile?.id) {
      return res.status(200).json({ ok: true, note: "profile_not_found_for_email", email });
    }

    const patch = paid
      ? {
          plan: "premium",
          subscription_status: "active",
          paid_until: payload?.data?.paid_until || payload?.paid_until || addDaysISO(35),
          email,
        }
      : {
          plan: "free",
          subscription_status: "inactive",
          paid_until: null,
          email,
        };

    const { error: uErr } = await supabaseAdmin
      .from("profiles")
      .update(patch)
      .eq("id", profile.id);

    if (uErr) throw uErr;

    return res.status(200).json({ ok: true, event, email });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "webhook_error" });
  }
}
