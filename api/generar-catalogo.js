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

        // PROMPT REDEFINIDO: Añadir delineado de sticker blanco y transparencia limpia
        const prompt = `Task: Professional Catalog Sticker Outline and Clean PNG Finishing.

You are given an already isolated clothing outfit (which may consist of a single connected garment or multiple separate pieces like a top and a bottom) with a transparent background. 
Your ONLY job is to apply an aesthetic sticker treatment to it:

1. **Multi-Piece Sticker Outline**: Add a solid, crisp, clean, and uniform WHITE outline (stroke/border, approximately 5-8 pixels thick) around the outer silhouette of ALL garment pieces in the image. If there are multiple separate pieces (e.g., a top and a bottom separated by transparency), outline BOTH pieces. Do NOT erase, ignore, or discard any piece.
2. **Perfect Transparency**: Keep the background outside the newly generated white outlines 100% solid transparent (alpha channel PNG).
3. **No Garment Alterations**: Do NOT change, redraw, morph, or modify the texture, color, folds, design, or structure of the garments inside the outlines.
4. **Output**: Return ONLY the final processed garment sticker with its clean white outline and transparent background.`;

        const parts = [
            { text: prompt },
            { inlineData: { data: cleanBase64, mimeType: "image/png" } }
        ];

        // Ejecución directa en modalidad de imagen
        const result = await model.generateContent({
            contents: [{ role: "user", parts }],
            generationConfig: {
                responseModalities: ["IMAGE"],
                temperature: 0.0 // Precisión quirúrgica
            }
        });

        const response = await result.response;
        const imagePart = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);

        if (imagePart && imagePart.inlineData) {
            // Enviamos de vuelta el PNG transparente con su borde blanco estilo sticker
            return res.status(200).json({ 
                success: true,
                finalImage: imagePart.inlineData.data
            });
        } else {
            throw new Error("La IA no pudo procesar el delineado final del sticker.");
        }

    } catch (err) {
        console.error("GENERAR CATALOGO ERROR:", err.message);
        return res.status(500).json({ 
            isError: true, 
            detalle: err.message 
        });
    }
}
