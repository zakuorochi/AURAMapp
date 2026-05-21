import { GoogleGenerativeAI } from "@google/generative-ai";

export default async function handler(req, res) {
    // 1. Configuración de cabeceras CORS para permitir la conexión desde la App
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Atender solicitudes pre-flight
    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        const { image } = body;

        if (!image) {
            return res.status(400).json({ isError: true, detalle: "No se recibió ninguna imagen para procesar." });
        }

        // Limpiar cabeceras o prefijos base64 si los hay
        const cleanBase64 = image.replace(/^data:image\/\w+;base64,/, "");

        // 2. Inicializar Gemini usando la clave segura de entorno
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        
        // Usamos el modelo especializado en edición/procesamiento visual (Image-to-Image)
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-image" });

        // 3. PROMPT ULTRA-ESPECÍFICO PARA EXTRACCIÓN GHOST MANNEQUIN COMPLETA
        const prompt = `Task: Surgical Outfit Extraction and Absolute Human Removal (Ghost Mannequin).

CRITICAL MISSION:
You must extract the ENTIRE clothing outfit (both top garments like jackets, shirts, hoodies AND bottom garments like pants, jeans, skirts) as a single connected empty 3D shell. You must completely and cleanly erase the person wearing them.

STRICT INSTRUCTIONS:
1. **100% Body Erasure (Transparency)**: Completely replace ALL visible parts of the human body with 100% transparent space (alpha channel):
   - Erase the head, face, hair, ears, and neck.
   - Erase the hands, fingers, bare arms, and wrists.
   - Erase the feet, ankles, legs, and any other exposed skin.
2. **Hollow Openings (Efecto Fantasma)**: Reconstruct the inner collar opening, sleeve cuffs, and bottom hems to look realistically hollow, open, and empty, as if worn by an invisible phantom form.
3. **Outfit Unity**: Keep both upper and lower garments visible and connected. Do NOT cut off, ignore, or separate the pants/bottom garments.
4. **No Alucinations / No Alterations**: Preserve 100% of the original colors, patterns, fabric folds, wrinkles, seams, and details of the clothing. Do NOT warp, modify, or redraw the clothes.
5. **Output**: Return ONLY the final hollow clothing outfit shell on a perfectly transparent background.`;

        const parts = [
            { text: prompt },
            { inlineData: { data: cleanBase64, mimeType: "image/jpeg" } }
        ];

        // 4. Ejecución del modelo con baja temperatura para evitar improvisaciones creativas
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
            // Devolvemos el PNG recortado quirúrgicamente en su transparencia nativa
            return res.status(200).json({ 
                success: true, 
                imagenSinFondo: imagePart.inlineData.data 
            });
        } else {
            throw new Error("La IA no pudo segmentar correctamente el conjunto de prendas.");
        }

    } catch (err) {
        console.error("BORRAR FONDO ERROR:", err.message);
        res.status(500).json({ 
            isError: true, 
            detalle: err.message 
        });
    }
}
