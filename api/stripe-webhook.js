import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

export const config = { api: { bodyParser: false } };

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2026-01-28.clover",
});

function buffer(readable) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    readable.on("data", (chunk) => chunks.push(chunk));
    readable.on("end", () => resolve(Buffer.concat(chunks)));
    readable.on("error", reject);
  });
}

function nowIso() {
  return new Date().toISOString();
}

function addMonths(date, months) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

async function logEvent(supabase, evt, extras = {}) {
  try {
    await supabase.from("stripe_event_log").upsert(
      {
        event_id: evt?.id ?? null,
        event_type: evt?.type ?? null,
        livemode: evt?.livemode ?? null,
        customer_id: extras.customer_id ?? null,
        subscription_id: extras.subscription_id ?? null,
        email: extras.email ?? null,
        status: extras.status ?? null,
        error_message: extras.error_message ?? null,
        payload: extras.payload ?? evt ?? null,
      },
      { onConflict: "event_id" }
    );
  } catch (_) {}
}

async function findProfileByEmailOrCustomer(supabase, email, customerId) {
  if (email) {
    const { data } = await supabase
      .from("profiles")
      .select("id,email")
      .ilike("email", email)
      .maybeSingle();
    if (data?.id) return data;
  }

  if (customerId) {
    const { data } = await supabase
      .from("profiles")
      .select("id,email")
      .eq("stripe_customer_id", customerId)
      .maybeSingle();
    if (data?.id) return data;
  }

  return null;
}

async function upsertSubscriptionRow(supabase, patch) {
  // usa stripe_subscription_id como “chave” lógica
  if (!patch?.stripe_subscription_id && !patch?.stripe_customer_id && !patch?.email) return;

  // tenta achar linha existente por subscription_id
  let row = null;
  if (patch.stripe_subscription_id) {
    const { data } = await supabase
      .from("subscriptions")
      .select("id")
      .eq("stripe_subscription_id", patch.stripe_subscription_id)
      .maybeSingle();
    row = data;
  }

  if (row?.id) {
    await supabase.from("subscriptions").update(patch).eq("id", row.id);
    return;
  }

  // cria nova
  await supabase.from("subscriptions").insert(patch);
}

async function grantPremium(supabase, profileId, payload = {}) {
  const paidUntil = payload.paid_until ?? addMonths(new Date(), 1).toISOString();

  await supabase
    .from("profiles")
    .update({
      plan: "premium",
      subscription_status: "active",
      plan_status: "active",
      is_premium: true,
      paid_until: paidUntil,
      premium_until: paidUntil,
      blocked_reason: null,
      stripe_customer_id: payload.stripe_customer_id ?? null,
      stripe_subscription_id: payload.stripe_subscription_id ?? null,
      last_paid_event: payload.last_paid_event ?? null,
      last_paid_at: nowIso(),
      updated_at: nowIso(),
    })
    .eq("id", profileId);
}

async function blockPremium(supabase, profileId, reason, payload = {}) {
  await supabase
    .from("profiles")
    .update({
      plan: "free",
      subscription_status: "inactive",
      plan_status: "inactive",
      is_premium: false,
      paid_until: null,
      premium_until: null,
      blocked_reason: reason || "blocked",
      stripe_customer_id: payload.stripe_customer_id ?? null,
      stripe_subscription_id: payload.stripe_subscription_id ?? null,
      last_payment_failed_at: payload.failed_at ?? nowIso(),
      updated_at: nowIso(),
    })
    .eq("id", profileId);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Method not allowed");

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );

  let evt;
  try {
    const buf = await buffer(req);
    const sig = req.headers["stripe-signature"];
    evt = stripe.webhooks.constructEvent(buf, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.log("Webhook signature error:", err?.message);
    return res.status(400).send(`Webhook Error: ${err?.message}`);
  }

  // evita processar 2x em caso de retry do Stripe
  try {
    const { data: exists } = await supabase
      .from("stripe_event_log")
      .select("id")
      .eq("event_id", evt.id)
      .maybeSingle();

    if (exists?.id) return res.status(200).json({ ok: true, duplicate: true });
  } catch (_) {}

  try {
    const type = evt.type;
    const obj = evt.data.object;

    // helpers p/ email/customer/subscription
    let email =
      obj?.customer_email ||
      obj?.customer_details?.email ||
      obj?.billing_details?.email ||
      null;

    let customerId = obj?.customer || obj?.customer_id || null;
    let subscriptionId = obj?.subscription || obj?.id || null;

    // Quando vier sem email: busca no Stripe
    if (!email && customerId) {
      try {
        const cust = await stripe.customers.retrieve(customerId);
        if (cust && !cust.deleted) email = cust.email || null;
      } catch (_) {}
    }

    // --- EVENTOS DE LIBERAÇÃO ---
    // 1) checkout.session.completed (Payment Link / Checkout)
    if (type === "checkout.session.completed") {
      // nesse evento: subscription pode existir se for assinatura
      const session = obj;

      customerId = session.customer || customerId;
      subscriptionId = session.subscription || null;

      // pega período pelo subscription (melhor que “+1 mês fixo”)
      let paidUntil = null;
      if (subscriptionId) {
        try {
          const sub = await stripe.subscriptions.retrieve(subscriptionId);
          const periodEnd = sub?.current_period_end ? new Date(sub.current_period_end * 1000) : null;
          paidUntil = periodEnd ? periodEnd.toISOString() : null;

          await upsertSubscriptionRow(supabase, {
            user_id: null,
            email,
            stripe_customer_id: customerId,
            stripe_subscription_id: subscriptionId,
            status: sub?.status || "active",
            cancel_at_period_end: !!sub?.cancel_at_period_end,
            current_period_end: periodEnd ? periodEnd.toISOString() : null,
            last_invoice_paid_at: nowIso(),
            last_event_type: type,
          });
        } catch (_) {}
      }

      const profile = await findProfileByEmailOrCustomer(supabase, email, customerId);
      if (profile?.id) {
        await grantPremium(supabase, profile.id, {
          paid_until: paidUntil ?? addMonths(new Date(), 1).toISOString(),
          stripe_customer_id: customerId,
          stripe_subscription_id: subscriptionId,
          last_paid_event: type,
        });

        // amarra user_id na subscriptions (se existir linha)
        if (subscriptionId) {
          await supabase
            .from("subscriptions")
            .update({ user_id: profile.id, updated_at: nowIso() })
            .eq("stripe_subscription_id", subscriptionId);
        }
      }

      await logEvent(supabase, evt, {
        status: "processed",
        email,
        customer_id: customerId,
        subscription_id: subscriptionId,
      });

      return res.status(200).json({ ok: true });
    }

    // 2) invoice.payment_succeeded (renovação mensal)
    if (type === "invoice.payment_succeeded") {
      const invoice = obj;

      customerId = invoice.customer || customerId;
      subscriptionId = invoice.subscription || subscriptionId;

      let paidUntil = null;
      try {
        if (subscriptionId) {
          const sub = await stripe.subscriptions.retrieve(subscriptionId);
          const periodEnd = sub?.current_period_end ? new Date(sub.current_period_end * 1000) : null;
          paidUntil = periodEnd ? periodEnd.toISOString() : null;

          await upsertSubscriptionRow(supabase, {
            email,
            stripe_customer_id: customerId,
            stripe_subscription_id: subscriptionId,
            status: sub?.status || "active",
            cancel_at_period_end: !!sub?.cancel_at_period_end,
            current_period_end: periodEnd ? periodEnd.toISOString() : null,
            last_invoice_paid_at: nowIso(),
            last_event_type: type,
          });
        }
      } catch (_) {}

      const profile = await findProfileByEmailOrCustomer(supabase, email, customerId);
      if (profile?.id) {
        await grantPremium(supabase, profile.id, {
          paid_until: paidUntil ?? addMonths(new Date(), 1).toISOString(),
          stripe_customer_id: customerId,
          stripe_subscription_id: subscriptionId,
          last_paid_event: type,
        });

        if (subscriptionId) {
          await supabase
            .from("subscriptions")
            .update({ user_id: profile.id, updated_at: nowIso() })
            .eq("stripe_subscription_id", subscriptionId);
        }
      }

      await logEvent(supabase, evt, {
        status: "processed",
        email,
        customer_id: customerId,
        subscription_id: subscriptionId,
      });

      return res.status(200).json({ ok: true });
    }

    // --- EVENTOS DE BLOQUEIO ---
    // pagamento falhou / atrasou
    if (type === "invoice.payment_failed") {
      const invoice = obj;
      customerId = invoice.customer || customerId;
      subscriptionId = invoice.subscription || subscriptionId;

      await upsertSubscriptionRow(supabase, {
        email,
        stripe_customer_id: customerId,
        stripe_subscription_id: subscriptionId,
        status: "past_due",
        last_invoice_failed_at: nowIso(),
        last_event_type: type,
      });

      const profile = await findProfileByEmailOrCustomer(supabase, email, customerId);
      if (profile?.id) {
        await blockPremium(supabase, profile.id, "Pagamento falhou (past_due)", {
          stripe_customer_id: customerId,
          stripe_subscription_id: subscriptionId,
          failed_at: nowIso(),
        });
      }

      await logEvent(supabase, evt, {
        status: "processed",
        email,
        customer_id: customerId,
        subscription_id: subscriptionId,
      });

      return res.status(200).json({ ok: true });
    }

    // cancelada
    if (type === "customer.subscription.deleted") {
      const sub = obj;
      customerId = sub.customer || customerId;
      subscriptionId = sub.id || subscriptionId;

      await upsertSubscriptionRow(supabase, {
        email,
        stripe_customer_id: customerId,
        stripe_subscription_id: subscriptionId,
        status: "canceled",
        last_event_type: type,
      });

      const profile = await findProfileByEmailOrCustomer(supabase, email, customerId);
      if (profile?.id) {
        await blockPremium(supabase, profile.id, "Assinatura cancelada", {
          stripe_customer_id: customerId,
          stripe_subscription_id: subscriptionId,
        });
      }

      await logEvent(supabase, evt, {
        status: "processed",
        email,
        customer_id: customerId,
        subscription_id: subscriptionId,
      });

      return res.status(200).json({ ok: true });
    }

    // estorno (refund)
    if (type === "charge.refunded") {
      const charge = obj;
      customerId = charge.customer || customerId;

      const profile = await findProfileByEmailOrCustomer(supabase, email, customerId);
      if (profile?.id) {
        await blockPremium(supabase, profile.id, "Pagamento estornado", {
          stripe_customer_id: customerId,
          stripe_subscription_id: null,
          failed_at: nowIso(),
        });
      }

      await logEvent(supabase, evt, {
        status: "processed",
        email,
        customer_id: customerId,
        subscription_id: null,
      });

      return res.status(200).json({ ok: true });
    }

    // evento não tratado (logar e ok)
    await logEvent(supabase, evt, {
      status: "ignored",
      email,
      customer_id: customerId,
      subscription_id: subscriptionId,
    });

    return res.status(200).json({ ok: true, ignored: true });
  } catch (err) {
    await logEvent(supabase, evt, {
      status: "error",
      error_message: err?.message || "error",
      payload: evt,
    });

    console.log("WEBHOOK ERROR:", err);
    return res.status(200).json({ ok: true }); // stripe prefere 200 p/ não retry infinito
  }
}
