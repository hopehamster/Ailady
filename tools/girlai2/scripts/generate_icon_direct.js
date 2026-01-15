const fs = require('fs');
const path = require('path');

const API_KEY = "AIzaSyA2C4URS0huuc0p1PhP0rqqpFzmwgk0AYM";
const MODEL = "gemini-3-pro-image-preview";
const PROMPT = "App icon for AI Girlfriend app, premium aesthetic, warm colors, digital intimacy theme, high resolution, minimalist symbol of connection, pink and deep purple gradient, glassmorphism style";
const OUTPUT_FILE = "assets/images/icon_premium.png";

async function generateImage(prompt, filename, aspectRatio = "1:1") {
  console.log(`Generating ${filename} using ${MODEL}...`);
  
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;
  
  const requestBody = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      responseModalities: ["TEXT", "IMAGE"],
      imageConfig: { aspectRatio: aspectRatio }
    }
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) throw new Error(`API Error: ${response.status} ${await response.text()}`);

    const data = await response.json();
    if (!data.candidates?.[0]?.content?.parts) throw new Error("No image data found");

    const part = data.candidates[0].content.parts.find(p => p.inlineData);
    if (!part) throw new Error("No inline image data found");

    const buffer = Buffer.from(part.inlineData.data, 'base64');
    // Save to the main assets directory
    const outputPath = path.resolve(__dirname, '../../assets/images', filename);
    
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    fs.writeFileSync(outputPath, buffer);
    console.log(`Success! Saved to ${outputPath}`);

  } catch (error) {
    console.error(`Failed to generate ${filename}:`, error.message);
  }
}

async function run() {
    // 1. Icon (Already done, but regenerating for consistency in location)
    await generateImage(PROMPT, "icon_premium.png", "1:1");

    // 2. Day Background
    await generateImage(
        "Abstract premium mobile wallpaper, soft warm pink and peach gradients, glassmorphism shapes, depth of field, high resolution, soothing, romantic atmosphere",
        "day_background.jpg",
        "9:16"
    );

    // 3. Night Background
    await generateImage(
        "Abstract premium mobile wallpaper, deep purple and midnight blue gradients, glowing elements, glassmorphism shapes, depth of field, high resolution, romantic, immersive",
        "night_background.jpg",
        "9:16"
    );
}

run();
