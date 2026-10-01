// Vercel Serverless Function — Node.js runtime
// Setara dengan supabase/functions/am-proxy, tapi format Vercel.

const crypto = require("crypto");

const API_KEY = "AIzaSyDtG1AU22ErnQD60AzBAcaknySiz9_CEq0";
const IDT = "https://www.googleapis.com/identitytoolkit/v3/relyingparty";
const VFY = "https://us-central1-alight-creative.cloudfunctions.net/verifyPurchase";

const rnd = () => `${Math.floor(Math.random()*254)+1}.${Math.floor(Math.random()*255)}.${Math.floor(Math.random()*255)}.${Math.floor(Math.random()*254)+1}`;

const spoof = (h) => ({
  ...h,
  "x-forwarded-for": rnd(),
  "x-real-ip": rnd(),
  "client-ip": rnd(),
  "x-client-ip": rnd(),
  "x-originating-ip": rnd(),
  "x-cluster-client-ip": rnd(),
});

const H1 = {
  "content-type": "application/json",
  "x-android-package": "com.alightcreative.motion",
  "x-android-cert": "ECA6BF91B8715A6F810ED0BBFC65B6CD578F52A8",
  "user-agent": "dalvik/2.1.0 (linux; u; android 15; 23127pn0cc build/bp1a.250505.005)",
};

const H2 = {
  "content-type": "application/json; charset=utf-8",
  "user-agent": "okhttp/3.12.1",
  "accept-encoding": "gzip",
};

function parseCode(raw) {
  if (!raw) return null;
  let s = String(raw).replace(/&amp;/g, "&");
  try { s = decodeURIComponent(s); } catch {}
  try {
    const u = new URL(s);
    let c = u.searchParams.get("oobCode");
    if (!c) {
      const n = u.searchParams.get("link") || u.searchParams.get("q") || u.searchParams.get("url");
      if (n) { try { c = new URL(n).searchParams.get("oobCode"); } catch {} }
    }
    if (c) return c.replace(/[^a-zA-Z0-9_-]/g, "");
  } catch {}
  const m = s.match(/oobCode=([a-zA-Z0-9_-]+)/i);
  if (m) return m[1];
  const t = raw.trim();
  if (/^[a-zA-Z0-9_-]{10,}$/.test(t) && !t.includes("://")) return t;
  return null;
}

async function sendLink(email) {
  const r = await fetch(`${IDT}/getOobConfirmationCode?key=${API_KEY}`, {
    method: "POST",
    headers: spoof(H1),
    body: JSON.stringify({
      requestType: 6,
      email,
      androidInstallApp: true,
      canHandleCodeInApp: true,
      continueUrl: "https://alightcreative.com?ui_sid=0366624874&ui_sd=0",
      iosBundleId: "com.alightcreative.motion",
      androidPackageName: "com.alightcreative.motion",
      androidMinimumVersion: "585",
      clientType: "CLIENT_TYPE_ANDROID",
    }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(typeof j === "object" ? JSON.stringify(j) : String(j));
  return j;
}

async function verifyLink(email, raw) {
  const c = parseCode(raw);
  if (!c) throw new Error("Magic link tidak valid / oobCode tidak ditemukan");
  const r = await fetch(`${IDT}/emailLinkSignin?key=${API_KEY}`, {
    method: "POST",
    headers: spoof(H1),
    body: JSON.stringify({ email, oobCode: c, clientType: "CLIENT_TYPE_ANDROID" }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(typeof j === "object" ? JSON.stringify(j) : String(j));
  return { idToken: j.idToken, refreshToken: j.refreshToken, localId: j.localId, isNewUser: j.isNewUser };
}

async function verifyPurchase(idToken) {
  const orderId = "reycode-" + crypto.randomBytes(6).toString("hex");
  const r = await fetch(VFY, {
    method: "POST",
    headers: spoof({
      ...H2,
      authorization: "Bearer " + idToken,
      "firebase-instance-id-token": "cSDnCyp3T-uwp07z3tL86T:APA91bFkmvvsHw5nnqa1SBFci-99DRsKClLiETdRrVcJjS5yBx1v_FbCb1d8WhBuea_zmwnYBktyTIzcRhN4b6uNOUur9wPc0gKXmJDoZic0LhNq5V2s0xI",
    }),
    body: JSON.stringify({
      data: {
        productId: "am.full.sub.annual.19q4",
        token: "mmgaobamlahbbeccfplmbkbb.AO-J1OzqG0or_GJJIx-ms8GrTm-jaglCRfhQSRPUZKpl2YspYS-oN7_94uv8RC5vQbvd_Ios2pPDStZ2n7F0hLE3FiOU7HS3R6Fquulv5xLXFECSv4ctElw",
        skuType: "subs",
        orderId,
      },
    }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(typeof j === "object" ? JSON.stringify(j) : String(j));
  return { orderId, result: j };
}

module.exports = async (req, res) => {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, apikey");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ status: false, error: "Method not allowed" });

  try {
    const { action, email, url } = req.body || {};

    if (action === "send") {
      if (!email) throw new Error("Email wajib");
      await sendLink(email);
      return res.status(200).json({ status: true, message: "Magic link dikirim" });
    }

    if (action === "verif") {
      if (!email || !url) throw new Error("Email & URL wajib");
      const auth = await verifyLink(email, url);
      const pro = await verifyPurchase(auth.idToken);
      return res.status(200).json({ status: true, message: "Premium aktif", data: pro });
    }

    throw new Error("Action tidak dikenal");
  } catch (e) {
    return res.status(200).json({ status: false, error: String(e.message || e) });
  }
};
