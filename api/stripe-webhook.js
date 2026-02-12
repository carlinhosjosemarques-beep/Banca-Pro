import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

export const config = {
  api: {
    bodyParser: false,
  },
};

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

function buffer(readable) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    readable.on("data", (chunk) => chunks.push(chunk));
    readable.on("end", () => resolve(Buffer.concat(chunks)));
    readable.on("error", reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).send("Method not allowed");
  }

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

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );

  if (
    event.type === "checkout.session.completed" ||
    event.type === "invoice.payment_succeeded"
  ) {
    const session = event.data.object;
    const email = session.customer_email || session.customer_details?.email;

    if (!email) return res.status(200).json({ ok: true });

    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .ilike("email", email)
      .maybeSingle();

    if (!profile) return res.status(200).json({ ok: true });

    const paidUntil = new Date();
    paidUntil.setMonth(paidUntil.getMonth() + 1);

    await supabase.from("profiles").update({
      plan: "premium",
      subscription_status: "active",
      is_premium: true,
      plan_status: "active",
      paid_until: paidUntil.toISOString(),
      premium_until: paidUntil.toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", profile.id);
  }

  if (
    event.type === "customer.subscription.deleted" ||
    event.type === "invoice.payment_failed"
  ) {
    const subscription = event.data.object;
    const email = subscription.customer_email;

    if (!email) return res.status(200).json({ ok: true });

    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .ilike("email", email)
      .maybeSingle();

    if (!profile) return res.status(200).json({ ok: true });

    await supabase.from("profiles").update({
      plan: "free",
      subscription_status: "inactive",
      is_premium: false,
      plan_status: "inactive",
      paid_until: null,
      premium_until: null,
      updated_at: new Date().toISOString(),
    }).eq("id", profile.id);
  }

  return res.status(200).json({ received: true });
}
