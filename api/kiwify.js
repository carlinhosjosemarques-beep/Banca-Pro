import { createClient } from "@supabase/supabase-js";

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
    const event = payload?.event || payload?.type || payload?.name || "";

    const email =
      payload?.customer?.email ||
      payload?.buyer?.email ||
      payload?.data?.customer?.email ||
      payload?.data?.buyer?.email ||
      payload?.email ||
      null;

    if (!email) {
      return res.status(200).json({ ok: true, note: "no_email_in_payload" });
    }

    const { data: profile, error: pErr } = await supabaseAdmin
      .from("profiles")
      .select("user_id,email")
      .eq("email", email)
      .maybeSingle();

    if (pErr) throw pErr;

    if (!profile?.user_id) {
      return res.status(200).json({ ok: true, note: "user_not_found_for_email" });
    }

    const ev = String(event).toLowerCase();

    const isPaid =
      ev.includes("aprov") ||
      ev.includes("paid") ||
      ev.includes("approved") ||
      ev.includes("compra_aprovada") ||
      ev.includes("assinatura_renovada") ||
      ev.includes("subscription_active");

    const isCanceled =
      ev.includes("cancel") ||
      ev.includes("reemb") ||
      ev.includes("refun") ||
      ev.includes("chargeback") ||
      ev.includes("atrasad") ||
      ev.includes("charge_failed") ||
      ev.includes("subscription_inactive") ||
      ev.includes("assinatura_cancelada") ||
      ev.includes("assinatura_atrasada");

    if (!isPaid && !isCanceled) {
      return res.status(200).json({ ok: true, note: "ignored_event", event });
    }

    const patch = isPaid
      ? {
          is_premium: true,
          plan_status: "active",
          premium_until: payload?.data?.premium_until || null,
          kiwify_customer_email: email,
          kiwify_subscription_id:
            payload?.subscription_id || payload?.data?.subscription_id || null,
        }
      : {
          is_premium: false,
          plan_status: "inactive",
          premium_until: null,
          kiwify_customer_email: email,
          kiwify_subscription_id:
            payload?.subscription_id || payload?.data?.subscription_id || null,
        };

    const { error: uErr } = await supabaseAdmin
      .from("profiles")
      .update(patch)
      .eq("user_id", profile.user_id);

    if (uErr) throw uErr;

    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "webhook_error" });
  }
}
