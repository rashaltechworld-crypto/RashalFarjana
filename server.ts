import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "10mb" }));

// Helper for offline smart fallback response when API key is missing or quota/network error occurs
function getSmartFallbackReply(prompt: string, customKnowledge?: string): string {
  const p = prompt.toLowerCase();
  
  if (p.includes("ডিপোজিট") || p.includes("deposit") || p.includes("টাকা") || p.includes("bkash") || p.includes("bKash") || p.includes("বিকাশ") || p.includes("নগদ") || p.includes("nagad") || p.includes("binance") || p.includes("usdt")) {
    return "💳 **ডিপোজিট নির্দেশিকা:**\n- বিকাশ, নগদ বা রকেটে অটো ডিপোজিট করতে 'Deposit' মেনুতে যান।\n- আপনার পছন্দমতো পেমেন্ট নম্বর নির্বাচন করে টাকা পাঠানোর পর সঠিক TrxID (ট্রানজেকশন আইডি) এবং টাকার পরিমাণ বসিয়ে 'Verify Deposit'-এ ক্লিক করুন।\n- বাইন্যান্স পে বা USDT BEP20-এ ১ ডলার = ১২০ টাকা হারে অটো টাকা যোগ হবে।";
  }

  if (p.includes("অর্ডার") || p.includes("order") || p.includes("ফলোয়ার") || p.includes("follower") || p.includes("লাইক") || p.includes("like") || p.includes("ভিউ") || p.includes("view") || p.includes("সার্ভিস")) {
    return "🚀 **নতুন অর্ডার দেওয়ার নিয়ম:**\n১. 'New Order' পেজে যান।\n২. আপনার প্রয়োজনীয় ক্যাটাগরি ও সার্ভিস সিলেক্ট করুন।\n৩. টার্গেট লিঙ্ক (যেমন: পেজ/প্রোফাইল/ভিডিও লিঙ্ক) পেস্ট করুন।\n৪. কোয়ান্টিটি (পরিমাণ) বসিয়ে 'Submit Order'-এ ক্লিক করুন।\n৫. অর্ডারের আপডেট দেখতে 'Orders' মেনুতে ক্লিক করুন।";
  }

  if (p.includes("বোনাস") || p.includes("bonus") || p.includes("স্পিন") || p.includes("spin") || p.includes("ফ্রি") || p.includes("free") || p.includes("পয়েন্ট")) {
    return "🎁 **ফ্রি বোনাস ও রিওয়ার্ডস:**\n- 'Daily Check-in' থেকে প্রতিদিন বোনাস সংগ্রহ করুন।\n- 'Ad Earn' ভিডিও দেখে আয় করুন।\n- 'Spin Wheel' স্পিন করে ভাগ্য পরীক্ষা করুন।";
  }

  if (p.includes("এডমিন") || p.includes("admin") || p.includes("সাপোর্ট") || p.includes("support") || p.includes("কন্টাক্ট") || p.includes("contact") || p.includes("হেল্প") || p.includes("help") || p.includes("হোয়াটসঅ্যাপ") || p.includes("টেলিগ্রাম")) {
    return "📞 **অফিসিয়াল কন্টাক্ট ও সাপোর্ট:**\n- টেলিগ্রাম চ্যানেল: t.me/RF2_SMM\n- হোয়াটসঅ্যাপ সাপোর্ট: wa.me/8801781119650\n- যেকোনো জরুরি প্রয়োজনে সরাসরি টেলিগ্রামে মেসেজ দিন।";
  }

  if (customKnowledge && customKnowledge.trim().length > 0) {
    return `🤖 **RF SMM Assistant:**\n${customKnowledge}\n\nযেকোনো সাহায্যের জন্য 'Deposit' বা 'New Order' অপশন ব্যবহার করুন অথবা সরাসরি এডমিন সাপোর্টে যোগ দিন।`;
  }

  return "🤖 **আসসালামু আলাইকুম! RF SMM-এ আপনাকে স্বাগতম।**\nআমি আপনার প্রশ্নের উত্তর দিতে প্রস্তুত। আপনি ডিপোজিট, নতুন অর্ডার করা, ফ্রি বোনাস অথবা সাপোর্টের বিষয়ে প্রশ্ন করতে পারেন।";
}

// Initialize GoogleGenAI client
const getAiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });
};

// AI Support API endpoint
app.post("/api/ai-support", async (req, res) => {
  const { prompt, history, customKnowledge, userContext, attachments } = req.body || {};

  if ((!prompt || typeof prompt !== "string") && (!attachments || attachments.length === 0)) {
    return res.status(400).json({ error: "Prompt or attachment is required" });
  }

  const userPromptText = prompt || "আটাচড ছবি/ভিডিওটি দেখুন এবং সাহায্য করুন।";

  const ai = getAiClient();
  if (!ai) {
    // Return smart fallback reply seamlessly
    const reply = getSmartFallbackReply(userPromptText, customKnowledge);
    return res.json({ reply });
  }

  const defaultInstruction = `You are "RF SMM Assistant" (আরএফ এসএমএম অ্যাসিস্ট্যান্ট), an intelligent, polite, and helpful AI Customer Support Agent for "RF SMM Panel BD" (Bangladesh's leading SMM Panel).
Key Instructions:
1. Always reply in clear, friendly Bengali (বাংলা) or simple English if the user asks in English.
2. Maintain a professional, welcoming tone. Use emojis naturally (e.g. 🤖, 🚀, 💎, 📱, 💳, ✅).
3. RF SMM Panel provides Facebook, Instagram, TikTok, YouTube, Telegram followers, likes, views, watch time, and reactions.
4. Deposits/Payments accepted:
   - bKash 1 (Merchant - Auto TrxID)
   - bKash 2 (Personal - Auto TrxID)
   - Nagad Merchant
   - Rocket Personal
   - Binance Pay / UID ($1 = 120 TK, min 0.10$ = 12 TK)
   - USDT BEP20 ($1 = 120 TK)
5. Explain how to order:
   - Go to "New Order" (নতুন অর্ডার)
   - Select Category & Service
   - Paste Target Link (যেমন পেজ/প্রোফাইল লিংক)
   - Enter Quantity (পরিমাণ)
   - Click "Submit Order" (অর্ডার জমা দিন)
6. If users ask about deposit issues or upload payment screenshots/videos, inspect the attachment if available and instruct them to enter the exact TrxID and Amount in the Deposit page for instant verification.
7. Keep responses concise, clear, and easy to read with bullet points where appropriate.
${customKnowledge ? `\n\nAdmin Custom Instructions & Knowledge Base:\n${customKnowledge}` : ""}
${userContext ? `\n\nUser Context:\nName: ${userContext.name || "Customer"}\nBalance: ৳${userContext.balance || 0}\nTotal Orders: ${userContext.totalOrders || 0}` : ""}`;

  // Format chat contents
  let contents: any[] = [];
  if (Array.isArray(history) && history.length > 0) {
    contents = history.slice(-6).map((msg: { role: string; text: string }) => ({
      role: msg.role === "user" ? "user" : "model",
      parts: [{ text: msg.text }]
    }));
  }

  const userParts: any[] = [{ text: userPromptText }];

  if (Array.isArray(attachments) && attachments.length > 0) {
    for (const att of attachments) {
      if (att.data && att.mimeType) {
        // extract raw base64 if prefixed
        const base64Clean = att.data.includes(",") ? att.data.split(",")[1] : att.data;
        userParts.push({
          inlineData: {
            mimeType: att.mimeType,
            data: base64Clean
          }
        });
      }
    }
  }

  contents.push({ role: "user", parts: userParts });

  // Try list of candidate models
  const candidateModels = ["gemini-3.6-flash", "gemini-2.5-flash", "gemini-1.5-flash", "gemini-2.0-flash"];

  try {
    for (const modelName of candidateModels) {
      try {
        const response = await ai.models.generateContent({
          model: modelName,
          contents,
          config: {
            systemInstruction: defaultInstruction,
            temperature: 0.7,
          }
        });

        if (response && response.text) {
          return res.json({ reply: response.text });
        }
      } catch (err: any) {
        console.warn(`Model ${modelName} call failed:`, err?.message || err);
      }
    }
  } catch (outerErr) {
    console.warn("AI Support endpoint outer catch:", outerErr);
  }

  // If all models fail (e.g. quota limit, network or rate limit), provide instant smart offline fallback
  const fallbackReply = getSmartFallbackReply(userPromptText, customKnowledge);
  return res.json({ reply: fallbackReply });
});

// Health check route
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", geminiConfigured: !!process.env.GEMINI_API_KEY });
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
