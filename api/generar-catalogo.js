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
        1. **HUMAN BODY ELIMINATION (100% Transparent)**: Identify and completely erase ALL visible parts of the human body:
           - Remove the head, hair, face, ears, and neck.
           - Remove the hands, fingers, wrists, and bare arms.
           - Remove feet, ankles, and any exposed skin.
           - Replace all human body parts with 100% transparent space (alpha channel).
           
        2. **Hollow-Out Openings**: Reconstruct the inner back collar (neckline), sleeve cuffs, and bottom hems to look realistically hollow, open, and empty, as if worn by an invisible phantom form (Ghost Mannequin effect, like a hollow 3D shell of clothes).
        
        3. **Full Outfit Preservation**: Isolate and keep the entire clothing outfit (both top jackets/sweaters AND bottom pants/jeans). Keep their folds, textures, colors, and natural shape untouched.
        
        4. **Sticker Edge Refinement**: Polish the outer edges of the empty clothing shell to create a clean, sharp, continuous border against the transparent background. Ensure no loose pixels or human skin halos remain.

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
