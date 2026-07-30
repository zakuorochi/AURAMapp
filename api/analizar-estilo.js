import { GoogleGenerativeAI } from "@google/generative-ai";

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        // Eliminamos la necesidad de recibir y validar un userId
        const { image, garmentBase64 } = body; 

        if (!image || !garmentBase64) {
            return res.status(400).json({ isError: true, detalle: "Faltan datos de imágenes para el análisis." });
        }

        const cleanUserImage = image.replace(/^data:image\/\w+;base64,/, "");
        const cleanGarmentImage = garmentBase64.replace(/^data:image\/\w+;base64,/, "");

        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: 'gemini-3.1-flash-lite' }); 

        const promptTexto = `You are AURAM, an elite, highly perceptive, and sincere fashion advisor. You are empathetic but REALISTIC. Do not flatter unconditionally.
TASK: Analyze the user's photo and the garment. Return ONLY a valid JSON object.

TONE & ADVICE RULES:
- Be intellectually honest. If the combination clashes, the style is highly dissonant, or the color washes them out, respectfully point it out.
- Always offer constructive solutions (e.g., suggest a different color palette, a different cut, or how to style it better).
- It is perfectly fine to give low numerical scores if the outfit objectively does not work.

CONTEXT RULES:
1. GEEK/ANIMATED: Focus on "vibe" (strength, agility). Suggest themed event suitability.
2. DESIGN SKETCH: Give advice on fabrics, structure, and materialization.
3. REAL CLOTHING: Focus on style, colorimetry (luminosity/harmony), and actual fit.

CRITICAL CONSTRAINTS:
- PROHIBITION: No weight/thinness/body shape judgments. No mentions of race.
- OUTPUT LANGUAGE: The values inside the JSON (especially the 'analisis') MUST BE ENTIRELY IN SPANISH.
- TEXT LENGTH: The 'analisis' text must be MAXIMUM 45 WORDS, strictly containing: 1) How it fits, 2) Ideal occasions, 3) Sincere constructive advice.

REQUIRED JSON FORMAT (Do not use markdown blocks, return raw JSON):
{
  "bromaDetectada": false, // set to true ONLY IF a user is wearing clothing of the opposite gender as an obvious comedic joke.
  "stats": {
    "estilo": 80, // 0-100 integer. Be honest, use the full 0-100 range.
    "combinacion": 50, // 0-100 integer.
    "colorimetria": 65 // 0-100 integer.
  },
  "analisis": "El corte de la prenda funciona, pero este tono apaga tu rostro. Úsalo para eventos casuales de día. Como consejo sincero: te verías mucho mejor probando con colores más cálidos o combinándolo con accesorios oscuros."
}`;

        const result = await model.generateContent({
            contents: [{
                role: 'user',
                parts: [
                    { text: promptTexto },
                    { inlineData: { mimeType: 'image/jpeg', data: cleanUserImage } },
                    { inlineData: { mimeType: 'image/jpeg', data: cleanGarmentImage } }
                ]
            }],
            generationConfig: { temperature: 0.7, maxOutputTokens: 150 }
        });

        const textoAnalisis = result.response.text().trim();

        return res.status(200).json({ 
            success: true, 
            analisisAURAM: textoAnalisis 
        });

    } catch (err) {
        console.error("ANALISIS ERROR:", err.message);
        // Fallback de seguridad para garantizar que el tótem siempre muestre un resultado
        return res.status(200).json({ 
            success: true, 
            analisisAURAM: "✨ Esta prenda tiene un corte excelente. La combinación aporta mucha frescura a tu estilo. ¡Una elección sólida para tu armario!" 
        });
    }
}
