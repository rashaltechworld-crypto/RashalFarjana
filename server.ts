import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "10mb" }));

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
  try {
    const { prompt, history, customKnowledge, userContext } = req.body;

    if (!prompt || typeof prompt !== "string") {
      return res.status(400).json({ error: "Prompt is required" });
    }

    const ai = getAiClient();
    if (!ai) {
      return res.json({
        reply: "⚠️ AI সাপোর্ট সার্ভিসটি সাময়িকভাবে বন্ধ আছে অথবা GEMINI_API_KEY সেট করা নেই। দয়া করে এডমিন অথবা সরাসরি হোয়াটসঅ্যাপ সাপোর্টে যোগাযোগ করুন।"
      });
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
6. If users ask about deposit issues, explain that they should enter their exact TrxID (ট্রানজেকশন আইডি) and Amount in the Deposit page for instant approval.
7. Keep responses concise, clear, and easy to read with bullet points where appropriate.
${customKnowledge ? `\n\nAdmin Custom Instructions & Knowledge Base:\n${customKnowledge}` : ""}
${userContext ? `\n\nUser Context:\nName: ${userContext.name || "Customer"}\nBalance: ৳${userContext.balance || 0}\nTotal Orders: ${userContext.totalOrders || 0}` : ""}`;

    // Format chat contents
    let contents: any[] = [];
    if (Array.isArray(history) && history.length > 0) {
      // Map previous turns if provided
      contents = history.slice(-6).map((msg: { role: string; text: string }) => ({
        role: msg.role === "user" ? "user" : "model",
        parts: [{ text: msg.text }]
      }));
    }
    contents.push({ role: "user", parts: [{ text: prompt }] });

    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents,
      config: {
        systemInstruction: defaultInstruction,
        temperature: 0.7,
      }
    });

    const reply = response.text || "দুঃখিত, কোনো উত্তর পাওয়া যায়নি। আবার চেষ্টা করুন।";
    return res.json({ reply });
  } catch (err: any) {
    console.error("Gemini API Error:", err);
    return res.status(500).json({
      error: err.message || "Failed to generate AI response",
      reply: "⚠️ এআই সাপোর্ট উত্তর তৈরি করতে সমস্যা হয়েছে। দয়া করে কিছুক্ষণ পর আবার চেষ্টা করুন।"
    });
  }
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
