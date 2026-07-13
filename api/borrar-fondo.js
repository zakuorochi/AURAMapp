import { GoogleGenerativeAI } from "@google/generative-ai";

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        const { image } = body;

        if (!image) return res.status(400).json({ success: false, detalle: "Sin imagen." });

        const cleanBase64 = image.replace(/^data:image\/\w+;base64,/, "");

        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        // Usar la versión 1.5-flash suele ser más estable para evitar timeouts en Vercel
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        // PROMPT SIMPLIFICADO: Solo moderación y validación
        const prompt = `Task: Content Moderation, Garment Validation, and Composition Strategy.
        Analyze the image and determine if it is a valid retail garment suitable for a virtual try-on application.
        
        Rules:
        1. "is_safe_garment": Set false if it is lingerie, underwear, swimwear, or offensive/nude content. Set true otherwise.
        2. "rejection_reason": If false, provide a short Spanish reason. Else null.
        3. "is_valid_garment": Set false if the image does not contain clothing (e.g., just background, animals, faces, or objects). Set true if it is a shirt, jacket, coat, pants, etc.
        4. "composition_strategy": For the virtual try-on engine, provide a single instruction to handle multiple layers: "Replace the entire clothing set and composite all visible layers simultaneously to ensure a cohesive outfit rendering, maintaining fabric hierarchy and realistic shadows."
        
        Return STRICTLY JSON WITHOUT MARKDOWN:
        {
          "is_safe_garment": boolean,
          "is_valid_garment": boolean,
          "rejection_reason": string | null,
          "composition_strategy": string
        }`;

        const result = await model.generateContent({
            contents: [{ role: "user", parts: [{ text: prompt }, { inlineData: { data: cleanBase64, mimeType: "image/jpeg" } }] }],
            generationConfig: { responseMimeType: "application/json", temperature: 0.0 }
        });

        // ------------------------------------------------------------------------
        // LIMPIEZA DE MARKDOWN (EVITA EL ERROR 500 DE PARSEO)
        // ------------------------------------------------------------------------
        const rawText = result.response.text().trim();
        const cleanJson = rawText.replace(/```json/gi, "").replace(/```/g, "").trim();
        const validation = JSON.parse(cleanJson);

        // Respuesta simplificada y limpia para el frontend
        if (!validation.is_safe_garment || !validation.is_valid_garment) {
            return res.status(200).json({
                success: false,
                rejection_reason: validation.rejection_reason || "La imagen no es una prenda válida."
            });
        }

        // DEVOLVEMOS LA ESTRATEGIA PARA USARLA EN PRUNA
        return res.status(200).json({ 
            success: true,
            strategy: validation.composition_strategy 
        });

    } catch (err) {
        console.error("VALIDACIÓN ERROR:", err.message);
        res.status(500).json({ success: false, detalle: "Error en el servidor de validación." });
    }
}
