import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' })); 
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const apiKey = process.env.GEMINI_API_KEY;
const ai = new GoogleGenAI({ apiKey: apiKey });

const SYSTEM_PROMPT = `
You are a fast, precise corporate communications proofreader. 
Your only job is to fix the user's input for grammar, spelling, punctuation, and corporate professionalism. 

Keep the output almost identical to the original meaning and structure, but make it polished. 
Provide exactly 3 versions with very subtle variations.

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
  console.log("👉 Received request...");

  try {
    const { text, imageBase64 } = req.body;
    
    // Explicitly format contents as an array of Part objects for the new SDK
    let contents = [];

    if (text && text.trim() !== "") {
      contents.push({ text: `User text to fix: "${text}"` });
    }

    if (imageBase64) {
      console.log("📸 Processing image data...");
      const base64Data = imageBase64.split(',')[1] || imageBase64;
      contents.push({
        inlineData: {
          mimeType: "image/png",
          data: base64Data
        }
      });
      contents.push({ text: "Extract the text from this image, fix it, and give 3 subtle variations matching the requested JSON structure." });
    }

    if (contents.length === 0) {
      return res.status(400).json({ success: false, error: "No text or image content provided." });
    }

    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is missing from runtime context.");
    }

    console.log("📡 Submitting to Gemini...");
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash', 
      contents: contents,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        responseMimeType: "application/json",
        temperature: 0.2 
      }
    });

    console.log("✅ Response received from Gemini");

    if (!response.text) {
      throw new Error("Gemini returned an empty response.");
    }

    let responseText = response.text.trim();

    // Clean up unexpected markdown wrappers if the model injected them
    if (responseText.startsWith("```")) {
      responseText = responseText.replace(/^```[a-zA-Z]*\n/, "").replace(/```$/, "").trim();
    }

    const jsonStartIndex = responseText.indexOf('[');
    const jsonEndIndex = responseText.lastIndexOf(']');

    if (jsonStartIndex !== -1 && jsonEndIndex !== -1) {
      responseText = responseText.substring(jsonStartIndex, jsonEndIndex + 1);
    }

    const options = JSON.parse(responseText);
    return res.json({ success: true, options });

  } catch (error) {
    console.error("❌ Runtime Server Error:", error);
    return res.status(500).json({ 
      success: false, 
      error: error.message || "Internal server error occurred." 
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

export default app;
