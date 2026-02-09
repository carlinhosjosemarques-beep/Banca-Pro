import { createClient } from "@supabase/supabase-js";

function toLowerSafe(v) {
  return String(v || "").toLowerCase();
}

function addDaysISO(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function pickEmail(payload) {
  return (
    payload?.customer?.email ||
    payload?.buyer?.email ||
    payload?.data?.customer?.email ||
    payload?.data?.buyer?.email ||
    payload?.email ||
    payload?.customer_email ||
    null
  );
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });

  try {
    // evita warning (url.parse)
    const url = new URL(req.url, "http://localhost");
    const token = url.searchParams.get("token");

    if (!token || token !== process.env.KIWIFY_WEBHOOK_TOKEN) {
      return res.status(401).json({ error: "invalid_token" });
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
      return res.status(500).json({ error: "missing_env" });
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    const payload = req.body || {};

    const eventRaw =
      payload?.event ||
      payload?.type ||
      payload?.name ||
      payload?.data?.event ||
      payload?.data?.type ||
      "";

    const ev = toLowerSafe(eventRaw);

    const email = pickEmail(payload);
    if (!email) return res.status(200).json({ ok: true, note: "no_email_in_payload", event: eventRaw });

    const isApproved =
      ev.includes("compra_aprov") ||
      ev.includes("approved") ||
      ev.includes("aprovada") ||
      ev.includes("assinatura_renov") ||
      ev.includes("renovada") ||
      ev.includes("subscription_active") ||
      ev.includes("subscription_renew");

    const isCanceledOrBad =
      ev.includes("reembolso") ||
      ev.includes("refund") ||
      ev.includes("chargeback") ||
      ev.includes("cancel") ||
      ev.includes("assinatura_cancel") ||
      ev.includes("past_due") ||
      ev.includes("atras") ||
      ev.includes("recus");

    if (!isApproved && !isCanceledOrBad) {
      return res.status(200).json({ ok: true, note: "ignored_event", event: eventRaw, email });
    }

    // tenta pegar o uid, mas NÃO depende disso
    let uid = null;
    try {
      const { data: userByEmail } = await supabaseAdmin.auth.admin.getUserByEmail(email);
      uid = userByEmail?.user?.id || null;
    } catch {
      uid = null;
    }

    const paidUntilRaw =
      payload?.paid_until ||
      payload?.data?.paid_until ||
      payload?.data?.premium_until ||
      payload?.premium_until ||
      null;

    const activeUntil = paidUntilRaw
      ? new Date(paidUntilRaw).toISOString()
      : addDaysISO(31);

    const status = isApproved
      ? "active"
      : ev.includes("past_due") || ev.includes("atras")
      ? "past_due"
      : "inactive";

    const patch = isApproved
      ? {
          // se tiver uid, salva também
          ...(uid ? { id: uid, user_id: uid } : {}),
          email,

          // família 1
          plan: "premium",
          subscription_status: "active",
          paid_until: activeUntil,

          // família 2
          plan_status: "active",
          is_premium: true,
          premium_until: activeUntil,

          updated_at: new Date().toISOString(),
        }
      : {
          ...(uid ? { id: uid, user_id: uid } : {}),
          email,

          plan: "free",
          subscription_status: status,
          paid_until: null,

          plan_status: status,
          is_premium: false,
          premium_until: null,

          updated_at: new Date().toISOString(),
        };

    // ✅ Atualiza SEMPRE pelo e-mail (é isso que faltava)
    // 1) tenta update por email
    const upd = await supabaseAdmin
      .from("profiles")
      .update(patch)
      .eq("email", email)
      .select("id")
      .maybeSingle();

    if (upd.error) throw upd.error;

    // 2) se não existia linha com esse email, cria
    if (!upd.data) {
      const ins = await supabaseAdmin
        .from("profiles")
        .insert(patch)
        .select("id")
        .maybeSingle();

      if (ins.error) throw ins.error;
    }

    return res.status(200).json({
      ok: true,
      note: "profile_updated_by_email",
      uid,
      email,
      event: eventRaw,
      status,
      plan: patch.plan,
      paid_until: patch.paid_until,
    });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "webhook_error" });
  }
}
