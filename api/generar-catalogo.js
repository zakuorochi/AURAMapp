import { GoogleGenerativeAI } from "@google/generative-ai";

export default async function handler(req, res) {
    // 1. Configuración de cabeceras CORS para permitir la conexión desde la App
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        // Parseo seguro del cuerpo de la petición
        const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        const { image } = body;

        if (!image) {
            throw new Error("No se recibieron datos de imagen en el Paso 2.");
        }

        // Limpieza de cabeceras Base64
        const cleanBase64 = image.replace(/^data:image\/\w+;base64,/, "");

        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        // Usamos el modelo especializado en edición y generación de imágenes (Image-to-Image)
        const model = genAI.getGenerativeModel({ 
            model: "gemini-2.5-flash-image" 
        });

        // PROMPT ULTRA-AGRESIVO: Destrucción de anatomía humana y efecto "Hollow Shell" (Prenda Vacía)
        const prompt = `Task: Professional Hollow Ghost Mannequin Sticker Creation.
        
        CRITICAL GOAL: Transform the wearing garments into an empty 3D shell of clothing. The human body must be completely erased.

        INSTRUCTIONS:
       Task: Professional Full-Outfit Catalog Sticker Creation.
        
        1. **Outfit Extraction (Upper + Lower)**: Isolate and extract the ENTIRE clothing set. This includes BOTH upper garments (shirts, t-shirts, jackets, blazers) AND lower garments (pants, trousers, jeans, skirts, shorts) as a single unified outfit entity.
        2. Do NOT cut off or ignore the bottom garments (pants/jeans). Keep both top and bottom fully visible and connected.
        3. **Sticker-Edge Sharpness**: Refine the outer boundaries of the entire outfit. Make the borders perfectly smooth, clean, and continuous, eliminating any feathered or loose semi-transparent pixels (zero halo artifacts).
        4. **Zero Alterations**: Preserve 100% of the original colors, patterns, textures, fabric folds, and details of the clothing. Do not warp, modify, or redraw the clothes.
        5. Ensure the final background is 100% solid transparent (alpha channel PNG mask).
        6. Return ONLY the final high-quality processed outfit sticker image with transparent background                                Q

        Return ONLY the final processed hollow outfit shell with a perfectly transparent background (PNG).`;

        const parts = [
            { text: prompt },
            { inlineData: { data: cleanBase64, mimeType: "image/png" } }
        ];

        // Ejecución con temperatura 0.0 para evitar improvisaciones o "alucinaciones"
        const result = await model.generateContent({
            contents: [{ role: "user", parts }],
            generationConfig: {
                responseModalities: ["IMAGE"],
                temperature: 0.0 
            }
        });

        const response = await result.response;
        const imagePart = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);

        if (imagePart && imagePart.inlineData) {
            // Enviamos de vuelta la prenda vacía perfecta (Sticker 3D transparente)
            return res.status(200).json({ 
                success: true,
                finalImage: imagePart.inlineData.data
            });
        } else {
            throw new Error("La IA no pudo procesar la remoción humana en el renderizado final.");
        }

    } catch (err) {
        console.error("GENERAR CATALOGO ERROR:", err.message);
        return res.status(500).json({ 
            isError: true, 
            detalle: err.message 
        });
    }
}
