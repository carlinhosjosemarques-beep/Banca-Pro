import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });

  try {
    const token = req.query.token;
    if (!token || token !== process.env.KIWIFY_WEBHOOK_TOKEN) {
      return res.status(401).json({ error: "invalid_token" });
    }

    const supabaseAdmin = createClient(
      process.env.VITE_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const payload = req.body; // Vercel já parseia JSON
    const event = payload?.event || payload?.type || payload?.name;

    // Tenta pegar email do comprador de vários jeitos (Kiwify pode variar)
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

    // procura profile pelo email
    const { data: profile, error: pErr } = await supabaseAdmin
      .from("profiles")
      .select("user_id,email")
      .eq("email", email)
      .maybeSingle();

    if (pErr) throw pErr;
    if (!profile?.user_id) {
      // não achou usuário com esse email — não falha, só loga ok
      return res.status(200).json({ ok: true, note: "user_not_found_for_email" });
    }

    // Regras simples:
    // - Eventos de pagamento aprovado / assinatura ativa => libera premium
    // - Cancelamento/atraso => remove premium
    //
    // Ajuste os nomes de evento conforme aparecer no LOG do webhook no Kiwify.
    const isPaid =
      String(event || "").toLowerCase().includes("aprov") ||
      String(event || "").toLowerCase().includes("paid") ||
      String(event || "").toLowerCase().includes("approved") ||
      String(event || "").toLowerCase().includes("subscription_active");

    const isCanceled =
      String(event || "").toLowerCase().includes("cancel") ||
      String(event || "").toLowerCase().includes("refun") ||
      String(event || "").toLowerCase().includes("charge_failed") ||
      String(event || "").toLowerCase().includes("subscription_inactive");

    let patch = null;

    if (isPaid) {
      patch = {
        is_premium: true,
        plan_status: "active",
        // opcional: se vier uma data no payload, use ela. Senão, deixa null.
        premium_until: payload?.data?.premium_until || null,
        kiwify_customer_email: email,
        kiwify_subscription_id: payload?.subscription_id || payload?.data?.subscription_id || null,
      };
    } else if (isCanceled) {
      patch = {
        is_premium: false,
        plan_status: "inactive",
        premium_until: null,
        kiwify_customer_email: email,
        kiwify_subscription_id: payload?.subscription_id || payload?.data?.subscription_id || null,
      };
    } else {
      // evento que não nos interessa ainda
      return res.status(200).json({ ok: true, note: "ignored_event", event });
    }

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
