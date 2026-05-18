import { GoogleGenerativeAI } from "@google/generative-ai";

export default async function handler(req, res) {
    // 1. Configuración de cabeceras CORS para permitir la comunicación desde el Capturador
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Manejo de peticiones de comprobación (pre-flight)
    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const { image } = req.body;
        if (!image) throw new Error("No se recibió la imagen base64 en la petición.");

        // 2. Inicialización de la IA de Google (Gemini)
        // La clave se toma de las variables de entorno de Vercel
        const apiKey = process.env.GEMINI_API_KEY || "";
        const genAI = new GoogleGenerativeAI(apiKey);
        
        // Utilizamos el modelo especializado en entender y generar imágenes (Image-to-Image)
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-image" });

         // 3. SÚPER PROMPT "GHOST MANNEQUIN"
        // Instrucciones ultra-específicas para lograr el efecto de prenda vacía sin persona.
       const prompt = `
            Task: Surgical Background and Human Removal with Absolute Pixel Preservation.
            
            Objective: Extract the central garment with 100% fidelity. Do NOT redraw, morph, or modify the clothing.

            STRICT CONSTRAINT RULES:
            1. **No Hallucinations / No Redrawing**: Do NOT alter, redraw, smooth, or modify the texture, folds, wrinkles, buttons, zippers, or logos of the garment. Every pixel of the garment must remain identical to the original photo.
            2. **No Deformations**: Keep the exact physical shape, sleeves, collar structure, and contours. Do NOT shorten, lengthen, or delete sleeves or parts of the garment.
            3. **Strict Masking (Surgical Cut)**: 
               - Set all background, floor, hanger, and shadows pixels to 100% transparent.
               - Set all human skin, hands, arms, neck, and head pixels to 100% transparent.
            4. **Output**: Return ONLY the untouched extracted garment on a 100% transparent PNG background.
        `;
        // Nota: 'image' ya llega como base64 puro desde el index.html
        const result = await model.generateContent({
            contents: [{
                role: "user",
                parts: [
                    { text: prompt },
                    { inlineData: { mimeType: "image/jpeg", data: image } }
                ]
            }],
            generationConfig: {
                // Solicitamos explícitamente que la respuesta contenga una imagen
                responseModalities: ["TEXT", "IMAGE"],
                temperature: 0.1
            }
        });

        const response = await result.response;
        
        // 5. Extracción del resultado binario de la imagen
        const imagePart = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);

        if (imagePart && imagePart.inlineData) {
            return res.status(200).json({ 
                success: true, 
                imagenSinFondo: imagePart.inlineData.data 
            });
        } else {
            // Manejo de error si la IA responde con texto de bloqueo o falla la generación
            const textResponse = response.text() || "La IA no pudo segmentar la prenda correctamente.";
            throw new Error(textResponse);
        }

    } catch (err) {
        console.error("AURAM ERROR (api/borrar-fondo):", err.message);
        res.status(500).json({ 
            isError: true, 
            detalle: err.message,
            errorId: "IA_SEGMENTATION_FAILED"
        });
    }
}
