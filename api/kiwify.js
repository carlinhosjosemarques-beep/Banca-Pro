import { createClient } from "@supabase/supabase-js";

function getEventName(payload) {
  return (
    payload?.event ||
    payload?.type ||
    payload?.name ||
    payload?.data?.event ||
    payload?.data?.type ||
    ""
  );
}

function getBuyerEmail(payload) {
  return (
    payload?.customer?.email ||
    payload?.buyer?.email ||
    payload?.data?.customer?.email ||
    payload?.data?.buyer?.email ||
    payload?.email ||
    null
  );
}

function isApprovedEvent(event) {
  const e = String(event || "").toLowerCase();
  return (
    e.includes("aprov") ||
    e.includes("approved") ||
    e.includes("paid") ||
    e.includes("payment_succeeded") ||
    e.includes("subscription_active") ||
    e.includes("active")
  );
}

function isCanceledEvent(event) {
  const e = String(event || "").toLowerCase();
  return (
    e.includes("cancel") ||
    e.includes("refun") ||
    e.includes("refund") ||
    e.includes("chargeback") ||
    e.includes("charge_failed") ||
    e.includes("subscription_inactive") ||
    e.includes("inactive") ||
    e.includes("expired")
  );
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });

  // ✅ SEGREDO NO HEADER (mais “aceito” por plataformas)
  const auth = req.headers.authorization || "";
  const expected = `Bearer ${process.env.KIWIFY_WEBHOOK_TOKEN || ""}`;
  if (!process.env.KIWIFY_WEBHOOK_TOKEN || auth !== expected) {
    return res.status(401).json({ error: "unauthorized" });
  }

  // ✅ responde rápido e não quebra a Kiwify (sempre 200 em casos “não críticos”)
  try {
    const supabaseAdmin = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    );

    const payload = req.body || {};
    const event = getEventName(payload);
    const email = getBuyerEmail(payload);

    if (!email) {
      return res.status(200).json({ ok: true, note: "no_email" });
    }

    // procura profile pelo email
    const { data: profile, error: pErr } = await supabaseAdmin
      .from("profiles")
      .select("user_id,email")
      .eq("email", email)
      .maybeSingle();

    if (pErr) {
      console.error("profile_lookup_error", pErr);
      return res.status(200).json({ ok: true, note: "profile_lookup_error" });
    }

    if (!profile?.user_id) {
      // usuário ainda não criou conta com esse e-mail
      return res.status(200).json({ ok: true, note: "user_not_found_for_email", email });
    }

    const paid = isApprovedEvent(event);
    const canceled = isCanceledEvent(event);

    if (!paid && !canceled) {
      return res.status(200).json({ ok: true, note: "ignored_event", event });
    }

    const subscriptionId =
      payload?.subscription_id ||
      payload?.data?.subscription_id ||
      payload?.data?.subscription?.id ||
      null;

    const patch = paid
      ? {
          is_premium: true,
          plan_status: "active",
          premium_until: null, // opcional: se você tiver uma data real, coloca aqui
          kiwify_customer_email: email,
          kiwify_subscription_id: subscriptionId,
        }
      : {
          is_premium: false,
          plan_status: "inactive",
          premium_until: null,
          kiwify_customer_email: email,
          kiwify_subscription_id: subscriptionId,
        };

    const { error: uErr } = await supabaseAdmin
      .from("profiles")
      .update(patch)
      .eq("user_id", profile.user_id);

    if (uErr) {
      console.error("profile_update_error", uErr);
      return res.status(200).json({ ok: true, note: "profile_update_error" });
    }

    return res.status(200).json({ ok: true, event, email, paid });
  } catch (e) {
    console.error("webhook_error", e);
    // ✅ não devolve 500 pra evitar bloqueio/retry agressivo
    return res.status(200).json({ ok: true, note: "caught_error" });
  }
}
