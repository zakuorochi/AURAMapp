import { GoogleGenerativeAI } from "@google/generative-ai";

export default async function handler(req, res) {
    // 1. Configuración de cabeceras CORS para permitir la conexión desde la App
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        // Corrección del error 'undefined': Parseo seguro del cuerpo de la petición
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

        // PROMPT DEFINITIVO: Efecto Sticker de Catálogo Profesional (Igual a B003a.png)
        const prompt = `Task: Professional Catalog Sticker Creation (Ghost Mannequin Cut).
        
        1. Take the provided garment image and transform it into a premium, retail-ready product cutout.
        2. Clean up and refine the edges, making them perfectly smooth, sharp, and continuous.
        3. Ensure there is a 100% solid transparent background (alpha channel PNG mask). No loose pixels or halo artifacts.
        4. Preserve 100% of the original colors, patterns, textures, fabric folds, and details of the clothing. Do not warp, modify, or redesign the garment.
        5. Reconstruct any remaining small gaps near necklines or sleeves to give it a clean "hollow-out" (ghost mannequin) appearance.
        6. Return ONLY the final refined garment image with transparent background.`;

        const parts = [
            { text: prompt },
            { inlineData: { data: cleanBase64, mimeType: "image/png" } }
        ];

        // Ejecución directa en modalidad de imagen (Evita el error de JSON Mode)
        const result = await model.generateContent({
            contents: [{ role: "user", parts }],
            generationConfig: {
                responseModalities: ["IMAGE"],
                temperature: 0.1 
            }
        });

        const response = await result.response;
        const imagePart = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);

        if (imagePart && imagePart.inlineData) {
            // Devolvemos la imagen final optimizada de catálogo en Base64
            return res.status(200).json({ 
                success: true,
                finalImage: imagePart.inlineData.data
            });
        } else {
            throw new Error("La IA no pudo procesar el renderizado final del sticker.");
        }

    } catch (err) {
        console.error("GENERAR CATALOGO ERROR:", err.message);
        return res.status(500).json({ 
            isError: true, 
            detalle: err.message 
        });
    }
}
