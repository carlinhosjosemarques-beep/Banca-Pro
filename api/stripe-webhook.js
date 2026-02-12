import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

export const config = { api: { bodyParser: false } };

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

function buffer(readable) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    readable.on("data", (chunk) => chunks.push(chunk));
    readable.on("end", () => resolve(Buffer.concat(chunks)));
    readable.on("error", reject);
  });
}

function addMonths(date, m) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + m);
  return d;
}

function toIsoOrNull(x) {
  if (!x) return null;
  const t = new Date(x).getTime();
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

async function getEmailFromEvent(stripe, event) {
  const obj = event?.data?.object;

  if (event.type === "checkout.session.completed") {
    return obj?.customer_email || obj?.customer_details?.email || null;
  }

  if (event.type.startsWith("invoice.")) {
    return obj?.customer_email || obj?.customer_details?.email || null;
  }

  if (event.type.startsWith("customer.subscription.")) {
    const customerId = typeof obj?.customer === "string" ? obj.customer : obj?.customer?.id;
    if (!customerId) return null;
    const c = await stripe.customers.retrieve(customerId);
    return c?.email || null;
  }

  if (event.type === "charge.refunded" || event.type === "charge.dispute.created") {
    const customerId = typeof obj?.customer === "string" ? obj.customer : obj?.customer?.id;
    if (!customerId) return null;
    const c = await stripe.customers.retrieve(customerId);
    return c?.email || null;
  }

  return null;
}

async function resolveStripeIds(stripe, event) {
  const obj = event?.data?.object || {};

  const customerId =
    typeof obj?.customer === "string" ? obj.customer : obj?.customer?.id || null;

  let subscriptionId =
    typeof obj?.subscription === "string"
      ? obj.subscription
      : obj?.subscription?.id || null;

  if (!subscriptionId && event.type === "checkout.session.completed") {
    subscriptionId = obj?.subscription || null;
  }

  return { customerId, subscriptionId };
}

async function upsertProfileByEmail(supabase, email, patch) {
  const e = (email || "").trim().toLowerCase();
  if (!e) return null;

  const { data: byEmail } = await supabase
    .from("profiles")
    .select("id,email")
    .ilike("email", e)
    .maybeSingle();

  if (byEmail?.id) {
    await supabase.from("profiles").update({ ...patch }).eq("id", byEmail.id);
    return byEmail.id;
  }

  const { data: inserted } = await supabase
    .from("profiles")
    .insert({
      email: e,
      display_name: e.split("@")[0],
      plan: "free",
      subscription_status: "inactive",
      plan_status: "inactive",
      is_premium: false,
      updated_at: new Date().toISOString(),
      ...patch,
    })
    .select("id")
    .maybeSingle();

  return inserted?.id || null;
}

async function upsertSubscriptionRow(supabase, payload) {
  const { stripe_subscription_id, stripe_customer_id } = payload;

  if (stripe_subscription_id) {
    await supabase
      .from("subscriptions")
      .upsert(
        { ...payload, updated_at: new Date().toISOString() },
        { onConflict: "stripe_subscription_id" }
      );
    return;
  }

  if (stripe_customer_id) {
    await supabase
      .from("subscriptions")
      .upsert(
        { ...payload, updated_at: new Date().toISOString() },
        { onConflict: "stripe_customer_id" }
      );
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Method not allowed");

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );

  const buf = await buffer(req);
  const sig = req.headers["stripe-signature"];

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      buf,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.log("Webhook signature error:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  const eventId = event?.id;
  const eventType = event?.type;

  try {
    if (eventId) {
      const { data: already } = await supabase
        .from("stripe_event_log")
        .select("id")
        .eq("event_id", eventId)
        .maybeSingle();

      if (already?.id) return res.status(200).json({ ok: true, deduped: true });
    }

    const email = await getEmailFromEvent(stripe, event);
    const { customerId, subscriptionId } = await resolveStripeIds(stripe, event);

    await supabase.from("stripe_event_log").insert({
      event_id: eventId || null,
      type: eventType || null,
      livemode: !!event?.livemode,
      created_ts: event?.created || null,
      email: email || null,
      stripe_customer_id: customerId || null,
      stripe_subscription_id: subscriptionId || null,
      payload: event || null,
    });

    const nowIso = new Date().toISOString();

    const grant = async (periodEndIso) => {
      const paidUntilIso = periodEndIso || addMonths(new Date(), 1).toISOString();

      const profileId = await upsertProfileByEmail(supabase, email, {
        plan: "premium",
        subscription_status: "active",
        plan_status: "active",
        is_premium: true,
        paid_until: paidUntilIso,
        premium_until: paidUntilIso,
        stripe_customer_id: customerId || null,
        stripe_subscription_id: subscriptionId || null,
        updated_at: nowIso,
      });

      await upsertSubscriptionRow(supabase, {
        user_id: profileId,
        email: email || null,
        stripe_customer_id: customerId || null,
        stripe_subscription_id: subscriptionId || null,
        status: "active",
        current_period_end: paidUntilIso,
        cancel_at_period_end: false,
      });
    };

    const block = async (reason) => {
      const profileId = await upsertProfileByEmail(supabase, email, {
        plan: "free",
        subscription_status: "inactive",
        plan_status: "inactive",
        is_premium: false,
        paid_until: null,
        premium_until: null,
        updated_at: nowIso,
      });

      await upsertSubscriptionRow(supabase, {
        user_id: profileId,
        email: email || null,
        stripe_customer_id: customerId || null,
        stripe_subscription_id: subscriptionId || null,
        status: reason || "inactive",
        current_period_end: null,
        cancel_at_period_end: false,
      });
    };

    if (eventType === "checkout.session.completed") {
      const session = event.data.object;
      const mode = session?.mode;

      if (mode === "subscription") {
        if (subscriptionId) {
          const sub = await stripe.subscriptions.retrieve(subscriptionId);
          const cpe = sub?.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null;
          const st = (sub?.status || "").toLowerCase();
          if (st === "active" || st === "trialing") await grant(cpe);
          else await block(st || "inactive");
        } else {
          await grant(null);
        }
      } else {
        await grant(addMonths(new Date(), 1).toISOString());
      }
    }

    if (eventType === "invoice.payment_succeeded" || eventType === "invoice.paid") {
      const inv = event.data.object;
      const cpe = inv?.lines?.data?.[0]?.period?.end
        ? new Date(inv.lines.data[0].period.end * 1000).toISOString()
        : null;
      await grant(cpe);
    }

    if (eventType === "customer.subscription.created" || eventType === "customer.subscription.updated") {
      const sub = event.data.object;
      const st = (sub?.status || "").toLowerCase();
      const cpe = sub?.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null;
      const cancelAtPeriodEnd = !!sub?.cancel_at_period_end;

      if (st === "active" || st === "trialing") {
        await grant(cpe);

        await upsertSubscriptionRow(supabase, {
          user_id: null,
          email: email || null,
          stripe_customer_id: customerId || null,
          stripe_subscription_id: subscriptionId || sub?.id || null,
          status: st,
          current_period_end: cpe,
          cancel_at_period_end: cancelAtPeriodEnd,
          price_id: sub?.items?.data?.[0]?.price?.id || null,
          product_id: sub?.items?.data?.[0]?.price?.product || null,
        });
      } else {
        await block(st || "inactive");
      }
    }

    if (eventType === "invoice.payment_failed") {
      await block("payment_failed");
    }

    if (eventType === "customer.subscription.deleted") {
      await block("canceled");
    }

    if (eventType === "charge.refunded") {
      await block("refunded");
    }

    if (eventType === "charge.dispute.created") {
      await block("dispute");
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.log("WEBHOOK_ERROR:", e?.message || e);
    return res.status(200).json({ ok: true });
  }
}
