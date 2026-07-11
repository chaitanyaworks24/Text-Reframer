import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' })); 
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const SYSTEM_PROMPT = `
You are a fast, precise corporate communications proofreader. 
Your only job is to fix the user's input for grammar, spelling, punctuation, and corporate professionalism. 
Keep the output almost identical to the original meaning and structure, but make it polished. 
Provide exactly 3 versions with very subtle variations.

You must return a raw JSON array matching this exact schema:
[
  {
    "type": "Option 1",
    "description": "Direct correction with fixed grammar and punctuation.",
    "text": "Polished text here..."
  },
  {
    "type": "Option 2",
    "description": "Subtle variation, slightly more corporate.",
    "text": "Polished text here..."
  },
  {
    "type": "Option 3",
    "description": "Alternative subtle phrasing tweak.",
    "text": "Polished text here..."
  }
]
`;

app.post('/api/reframe', async (req, res) => {
  console.log("=== 🛠️ NEW DEBUG RUN STARTED 🛠️ ===");
  try {
    const { text, imageBase64 } = req.body;
    
    // Fall back to a hardcoded string if process.env.GEMINI_API_KEY is blocked by Vercel context
    const apiKey = process.env.GEMINI_API_KEY || "AQ.Ab8RN6LVfkopViKqtjXcbpyeH0-q35PTmSyD3PgrhlcHlp77uA";
    const fallbackBaseUrl = process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com';

    console.log("🔑 API Key check status:", apiKey ? "Present (String verified)" : "MISSING / UNDEFINED");

    // Initialize the SDK with the correct option name structure
    const ai = new GoogleGenAI({ 
      apiKey: apiKey,
      baseURL: fallbackBaseUrl
    });

    let contents = [];

    if (text && text.trim() !== "") {
      contents.push({ text: `User text to fix: "${text}"` });
    }

    if (imageBase64) {
      console.log("📸 Processing image data...");
      const base64Data = imageBase64.split(',')[1] || imageBase64;
      contents.push({
        inlineData: { mimeType: "image/png", data: base64Data }
      });
      contents.push({ text: "Extract text, fix grammar, and return the 3 options JSON structure." });
    }

    if (contents.length === 0) {
      return res.status(400).json({ success: false, error: "No content provided." });
    }

    console.log("📡 Payload valid. Dispatching API handshake...");
    
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash', 
      contents: contents,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        responseMimeType: "application/json",
        temperature: 0.1 
      }
    });

    const rawText = response.text;
    console.log("📥 RAW TEXT FROM GEMINI:", JSON.stringify(rawText));

    if (!rawText) {
      throw new Error("Gemini returned a completely empty text response wrapper.");
    }

    let cleanedText = rawText.trim();

    if (cleanedText.startsWith("```")) {
      cleanedText = cleanedText.replace(/^```[a-zA-Z]*\n/, "").replace(/```$/, "").trim();
    }

    const jsonStartIndex = cleanedText.indexOf('[');
    const jsonEndIndex = cleanedText.lastIndexOf(']');

    if (jsonStartIndex !== -1 && jsonEndIndex !== -1) {
      cleanedText = cleanedText.substring(jsonStartIndex, jsonEndIndex + 1);
    }
    
    console.log("🧹 CLEANED TEXT FOR PARSING:", cleanedText);

    let parsedOptions;
    try {
      parsedOptions = JSON.parse(cleanedText);
      console.log("✅ PARSED SUCCESS. ARRAY LENGTH:", Array.isArray(parsedOptions) ? parsedOptions.length : "NOT AN ARRAY");
    } catch (parseErr) {
      console.error("❌ JSON.parse CRASHED!");
      throw new Error(`Failed to parse text payload into valid JSON structure. Content: ${cleanedText}`);
    }

    const optionsArray = Array.isArray(parsedOptions) ? parsedOptions : [parsedOptions];
    return res.json({ success: true, options: optionsArray });

  } catch (error) {
    console.error("💥 SYSTEM RUNTIME EXCEPTION REVEALED:");
    console.error(error.stack || error.message || error);
    console.log("========================================");
    
    return res.status(500).json({ 
      success: false, 
      error: error.message || "Internal server crash tracked." 
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Debug instance active on port ${PORT}`);
});

export default app;
