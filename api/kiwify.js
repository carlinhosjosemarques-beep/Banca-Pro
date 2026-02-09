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
    const eventRaw = payload?.event || payload?.type || payload?.name || "";
    const ev = String(eventRaw).toLowerCase();

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

    // Busca perfil pelo e-mail
    // (compatível com tabelas que usam id OU user_id)
    const { data: profile, error: pErr } = await supabaseAdmin
      .from("profiles")
      .select("id,user_id,email")
      .eq("email", email)
      .maybeSingle();

    if (pErr) throw pErr;

    const profileId = profile?.id || null;
    const profileUserId = profile?.user_id || null;

    if (!profileId && !profileUserId) {
      return res.status(200).json({ ok: true, note: "user_not_found_for_email" });
    }

    // Eventos que liberam
    const isPaid =
      ev.includes("compra_aprov") ||
      ev.includes("compra aprovad") ||
      ev.includes("approved") ||
      ev.includes("paid") ||
      ev.includes("assinatura_renov") ||
      ev.includes("assinatura renov") ||
      ev.includes("subscription_active") ||
      ev.includes("assinatura ativa");

    // Eventos que bloqueiam
    const isBlocked =
      ev.includes("compra_recus") ||
      ev.includes("compra recus") ||
      ev.includes("cancel") ||
      ev.includes("reemb") ||
      ev.includes("refun") ||
      ev.includes("chargeback") ||
      ev.includes("assinatura_cancel") ||
      ev.includes("assinatura_atras") ||
      ev.includes("past_due") ||
      ev.includes("subscription_inactive");

    if (!isPaid && !isBlocked) {
      return res.status(200).json({ ok: true, note: "ignored_event", event: eventRaw });
    }

    // ✅ Campos que o App.jsx lê
    const patchCore = isPaid
      ? {
          subscription_status: "active",
          plan: "pro",
          paid_until: null, // null = sem expiração (o app aceita como premium enquanto status=active)
        }
      : {
          subscription_status: "inactive", // ou "canceled" / "past_due" se preferir
          plan: "free",
          paid_until: null,
        };

    // ✅ Mantém compatibilidade com seus campos antigos (se existirem)
    const patchCompat = isPaid
      ? {
          is_premium: true,
          plan_status: "active",
          premium_until: null,
        }
      : {
          is_premium: false,
          plan_status: "inactive",
          premium_until: null,
        };

    const patch = {
      ...patchCore,
      ...patchCompat,
      kiwify_customer_email: email,
      kiwify_subscription_id:
        payload?.subscription_id || payload?.data?.subscription_id || payload?.data?.subscription?.id || null,
      kiwify_last_event: eventRaw || null,
    };

    // Atualiza por id (padrão) e tenta também por user_id (fallback)
    let updated = false;

    if (profileId) {
      const { error: u1 } = await supabaseAdmin.from("profiles").update(patch).eq("id", profileId);
      if (u1) throw u1;
      updated = true;
    } else if (profileUserId) {
      const { error: u2 } = await supabaseAdmin.from("profiles").update(patch).eq("user_id", profileUserId);
      if (u2) throw u2;
      updated = true;
    }

    return res.status(200).json({ ok: true, updated, email, event: eventRaw });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "webhook_error" });
  }
}
