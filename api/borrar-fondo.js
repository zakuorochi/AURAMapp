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

        // 3. Prompt de extracción semántica
        const prompt = `Task: Background Removal and Professional Garment Extraction.
        1. Localiza el conujto de prendas principales en la imagen.
        2. Elimina absolutamente todo lo que no sea las prendas de vestir: fondo, suelo, manos, piel humana, cabezas, cabello o perchas.
        3. Si la prenda es vestida por alguien, remueve a la persona y deja solo la tela pero respeta la postura de la prenda en la imagen, no reinterpretes la prenda ni afectes sus dimensiones o colores
        4. Devuelve la prenda con un recorte limpio y bordes suaves.
        5. La salida debe ser exclusivamente la imagen procesada con transparencia.`;

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
