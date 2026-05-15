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
            Role: Expert E-commerce Product Image Retoucher.
            Task: Create a perfect "Ghost Mannequin" (invisible mannequin) image from the provided photo.

            STRICT EXECUTION STEPS:
            1.  **Identify Garments:** Isolate all clothing items worn by the subject (shirt, pants, belt, etc.) as a single outfit unit.
            2.  **HUMAN ERADICATION:** Completely erase ALL visible human parts: skin, hands, neck, head, arms, and legs. There must be NO human residue.
            3.  **Interior Reconstruction:** Where the body was removed (neck opening, sleeve cuffs, waistband), reconstruct the interior fabric view to make the garment look hollow, as if worn by an invisible form.
            4.  **Preserve Integrity:** Maintain the exact original shape, realistic fabric folds, shadows, wrinkles, and texture of the clothing. Do not flatten the image.
            5.  **Final Output:** The isolated, hollowed-out garments on a 100% transparent background (PNG).
        `;
        // 4. Envío de datos a la IA
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
