import express from "express";
import Stripe from "stripe";
import dotenv from "dotenv";
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const app = express();
app.use(express.json());

// Stripe setup
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Simple in-memory session store
const sessions = new Map();

function createSession(minutes) {
  const sessionId = crypto.randomBytes(16).toString("hex");
  const expiresAt = Date.now() + minutes * 60 * 1000;
  sessions.set(sessionId, { expiresAt });
  return { sessionId, expiresAt };
}

function isValidSession(sessionId) {
  const s = sessions.get(sessionId);
  if (!s) return false;
  if (Date.now() > s.expiresAt) {
    sessions.delete(sessionId);
    return false;
  }
  return true;
}

// Static files
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, "public")));
// Force homepage
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Protect games page (must have valid session)
app.get("/games.html", (req, res) => {
  const sid = req.query.sid;
  if (!sid || !isValidSession(sid)) {
    return res.redirect("/");
  }
  res.sendFile(path.join(__dirname, "public", "games.html"));
});

// Protect success page (only meaningful with sid)
app.get("/success.html", (req, res) => {
  const sid = req.query.sid;
if (!sid || !isValidSession(sid)) return res.redirect("/");
  res.sendFile(path.join(__dirname, "public", "success.html"));
});

// Create checkout session
app.post("/api/create-checkout", async (req, res) => {
  try {
    const { minutes = 10 } = req.body;
    const amountCents = Math.ceil(minutes / 10) * 200;

    const { sessionId } = createSession(minutes);

    const checkout = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: { name: `Arcade Time (${minutes} minutes)` },
            unit_amount: amountCents
          },
          quantity: 1
        }
      ],
      success_url: `${process.env.PUBLIC_BASE_URL}/success.html?sid=${sessionId}`,
      cancel_url: `${process.env.PUBLIC_BASE_URL}/index.html`,
      metadata: { sessionId, minutes }
    });

    res.json({ url: checkout.url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Payment error" });
  }
});

// Session validation
app.get("/api/session/:id", (req, res) => {
  const valid = isValidSession(req.params.id);
  res.json({ valid });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
app.use(express.static(path.join(__dirname, "public")));
