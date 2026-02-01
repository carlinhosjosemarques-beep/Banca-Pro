import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false });

  try {
    const body = req.body || {};

    // 1) valida token (Kiwify permite configurar um "token" no webhook) :contentReference[oaicite:2]{index=2}
    const expected = process.env.KIWIFY_WEBHOOK_TOKEN;
    const received =
      (req.headers["x-kiwify-token"] || req.headers["x-webhook-token"] || "").toString() ||
      (body.token ? String(body.token) : "");

    if (!expected || received !== expected) {
      return res.status(401).json({ ok: false, error: "token inválido" });
    }

    // 2) evento (o nome exato pode variar no payload; tratamos com fallback)
    const event =
      body.trigger || body.event || body.type || body.action || "";

    // 3) tenta achar email em vários lugares comuns
    const email =
      body?.customer?.email ||
      body?.buyer?.email ||
      body?.purchase?.email ||
      body?.data?.customer?.email ||
      body?.data?.buyer?.email ||
      body?.data?.email ||
      body?.email ||
      "";

    if (!email) {
      return res.status(200).json({ ok: true, ignored: "sem email no payload" });
    }

    // 4) decide status
    // eventos comuns listados pela Kiwify incluem compra aprovada/reembolso/chargeback/cancelamento etc. :contentReference[oaicite:3]{index=3}
    let status = "inactive";
    if (event === "compra_aprovada" || event === "subscription_renewed") status = "active";
    if (event === "subscription_late") status = "past_due";
    if (event === "subscription_canceled") status = "canceled";
    if (event === "compra_reembolsada" || event === "chargeback") status = "inactive";

    const supabase = createClient(
      process.env.VITE_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // 5) grava “liberação por email” (pra quem paga antes de cadastrar)
    if (status === "active") {
      const { error: e1 } = await supabase
        .from("access_grants")
        .upsert(
          { email, plan: "pro", subscription_status: "active" },
          { onConflict: "email" }
        );
      if (e1) throw e1;
    } else {
      // se não estiver ativo, remove grant (pra bloquear)
      await supabase.from("access_grants").delete().eq("email", email);
    }

    // 6) se já existir profile com esse email, atualiza na hora
    // (note: precisa email salvo no profile)
    const { data: prof, error: e2 } = await supabase
      .from("profiles")
      .select("id,email")
      .eq("email", email)
      .maybeSingle();

    if (!e2 && prof?.id) {
      const { error: e3 } = await supabase
        .from("profiles")
        .update({
          subscription_status:
            status === "active" ? "active" :
            status === "past_due" ? "past_due" :
            status === "canceled" ? "canceled" : "inactive",
          plan: "pro",
        })
        .eq("id", prof.id);

      if (e3) throw e3;
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(200).json({ ok: false, error: err?.message || "erro" });
  }
}
