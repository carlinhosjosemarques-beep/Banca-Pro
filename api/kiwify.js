import { createClient } from "@supabase/supabase-js";

function pickToken(req) {
  const q = req.query?.token;
  const h1 = req.headers["x-kiwify-token"];
  const h2 = req.headers["kiwify-token"];
  const h3 = req.headers["token"];
  const h4 = (req.headers["authorization"] || "").replace(/^Bearer\s+/i, "");
  return q || h1 || h2 || h3 || h4 || null;
}

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

function normalizeEvent(ev) {
  return String(ev || "").toLowerCase();
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "method_not_allowed" });
  }

  try {
    const token = pickToken(req);
    if (!token || token !== process.env.KIWIFY_WEBHOOK_TOKEN) {
      return res.status(401).json({
        error: "invalid_token",
        got: token ? "present" : "missing",
        hint: "Use ?token= na URL do webhook ou envie token por header",
      });
    }

    const supabaseAdmin = createClient(
      process.env.VITE_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const payload = req.body;
    const event = normalizeEvent(pickEvent(payload));
    const email = pickEmail(payload);

    if (!email) {
      return res.status(200).json({ ok: true, note: "no_email_in_payload" });
    }

    // procura profile pelo email
    const { data: profile, error: pErr } = await supabaseAdmin
      .from("profiles")
      .select("id,email,plan,subscription_status")
      .eq("email", email)
      .maybeSingle();

    if (pErr) throw pErr;
    if (!profile?.id) {
      return res.status(200).json({ ok: true, note: "user_not_found_for_email", email });
    }

    // ✅ Eventos do Kiwify (pela sua tela):
    // Compra aprovada / Assinatura renovada => libera
    // Compra recusada / Reembolso / Chargeback / Assinatura cancelada / Assinatura atrasada => bloqueia
    const isPaid =
      event.includes("compra_aprovada") ||
      event.includes("assinatura_renovada") ||
      event.includes("paid") ||
      event.includes("approved") ||
      event.includes("aprov");

    const isBlocked =
      event.includes("compra_recusada") ||
      event.includes("reembolso") ||
      event.includes("chargeback") ||
      event.includes("assinatura_cancelada") ||
      event.includes("assinatura_atrasada") ||
      event.includes("cancel") ||
      event.includes("refund") ||
      event.includes("charge_failed") ||
      event.includes("inactive");

    if (!isPaid && !isBlocked) {
      return res.status(200).json({ ok: true, note: "ignored_event", event });
    }

    const patch = isPaid
      ? { plan: "pro", subscription_status: "active" }
      : { plan: "free", subscription_status: "inactive" };

    const { error: uErr } = await supabaseAdmin
      .from("profiles")
      .update(patch)
      .eq("id", profile.id);

    if (uErr) throw uErr;

    return res.status(200).json({ ok: true, event, email, patch });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "webhook_error" });
  }
}
