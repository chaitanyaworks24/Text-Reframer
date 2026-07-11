import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' })); 

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// System instructions cleanly isolated
const SYSTEM_PROMPT = `
You are a fast, precise corporate communications proofreader. 
Your only job is to fix the user's input for grammar, spelling, punctuation, and corporate professionalism. 

Keep the output almost identical to the original meaning and structure, but make it polished. 
Provide exactly 3 versions with very subtle variations (e.g., slightly different transitions or word choice).

Provide the response in this strict JSON array format with no markdown wrappers:
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
  console.log("👉 Received a request from frontend...");

  try {
    const { text, imageBase64 } = req.body;
    
    // Dedicated array for purely user-facing content inputs
    let contents = [];

    // Handle text input safely
    if (text && text.trim() !== "") {
      contents.push(`User text to fix: "${text}"`);
    }

    // Handle image input safely
    if (imageBase64) {
      console.log("📸 Processing image data...");
      const base64Data = imageBase64.split(',')[1] || imageBase64;
      contents.push({
        inlineData: {
          mimeType: "image/png",
          data: base64Data
        }
      });
      contents.push("Extract the text from this image, fix it, and give 3 subtle variations matching the requested JSON structure.");
    }

    // Edge case safety handler
    if (contents.length === 0) {
      return res.status(400).json({ success: false, error: "No text or image content provided." });
    }

    console.log("📡 Sending payload to Gemini API...");

    // Using proper @google/genai SDK formatting constraints
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash', 
      contents: contents,
      config: {
        systemInstruction: SYSTEM_PROMPT, // Correct placement for system prompts
        responseMimeType: "application/json",
        temperature: 0.2 
      }
    });

    console.log("✅ Received response from Gemini!");

    let responseText = response.text.trim();

    // Clean up markdown fences if present
    if (responseText.startsWith("```")) {
      responseText = responseText.replace(/^```[a-zA-Z]*\n/, "").replace(/```$/, "").trim();
    }

    // Extract raw JSON boundaries safely
    const jsonStartIndex = responseText.indexOf('[');
    const jsonEndIndex = responseText.lastIndexOf(']');

    if (jsonStartIndex !== -1 && jsonEndIndex !== -1) {
      responseText = responseText.substring(jsonStartIndex, jsonEndIndex + 1);
    }

    const options = JSON.parse(responseText);
    return res.json({ success: true, options });

  } catch (error) {
    console.log("\n❌ ERROR DETECTED INSIDE BACKEND:");
    console.error(error); 
    console.log("---------------------------------\n");

    return res.status(500).json({ 
      success: false, 
      error: error.message || "Internal server error occurred." 
    });
  }
});

const PORT = 3000;
// Remove app.listen(PORT...) entirely!
// Just export the app object so Vercel can wrap it inside its serverless runtime.
export default app;