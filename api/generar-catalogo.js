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
        // Usamos el modelo especializado en edición y generación de imágenes
        const model = genAI.getGenerativeModel({ 
            model: "gemini-2.5-flash-image" 
        });

        // PROMPT OPTIMIZADO: Captura de outfit completo (Superior + Inferior) y acabado Sticker Premium
        const prompt = `Task: Professional Full-Outfit Catalog Sticker Creation.
        
        1. **Outfit Extraction (Upper + Lower)**: Isolate and extract the ENTIRE clothing set. This includes BOTH upper garments (shirts, t-shirts, jackets, blazers) AND lower garments (pants, trousers, jeans, skirts, shorts) as a single unified outfit entity.
        2. Do NOT cut off or ignore the bottom garments (pants/jeans). Keep both top and bottom fully visible and connected.
        3. **Sticker-Edge Sharpness**: Refine the outer boundaries of the entire outfit. Make the borders perfectly smooth, clean, and continuous, eliminating any feathered or loose semi-transparent pixels (zero halo artifacts).
        4. **Zero Alterations**: Preserve 100% of the original colors, patterns, textures, fabric folds, and details of the clothing. Do not warp, modify, or redraw the clothes.
        5. Ensure the final background is 100% solid transparent (alpha channel PNG mask).
        6. Return ONLY the final high-quality processed outfit sticker image with transparent background.`;

        const parts = [
            { text: prompt },
            { inlineData: { data: cleanBase64, mimeType: "image/png" } }
        ];

        // Ejecución directa en modalidad de imagen
        const result = await model.generateContent({
            contents: [{ role: "user", parts }],
            generationConfig: {
                responseModalities: ["IMAGE"],
                temperature: 0.0 // Forzamos precisión matemática sin creatividad
            }
        });

        const response = await result.response;
        const imagePart = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);

        if (imagePart && imagePart.inlineData) {
            // Enviamos de vuelta el PNG transparente con todo el conjunto
            return res.status(200).json({ 
                success: true,
                finalImage: imagePart.inlineData.data
            });
        } else {
            throw new Error("La IA no pudo procesar el renderizado final del sticker completo.");
        }

    } catch (err) {
        console.error("GENERAR CATALOGO ERROR:", err.message);
        return res.status(500).json({ 
            isError: true, 
            detalle: err.message 
        });
    }
}
