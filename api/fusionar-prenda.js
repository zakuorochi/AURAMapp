import { GoogleGenerativeAI } from "@google/generative-ai";
import { Storage } from "@google-cloud/storage";

export default async function handler(req, res) {
    // 1. Configuración de cabeceras CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        // Extraemos garmentBase64 para dar soporte a la fusión de rescate inmediata (comprimida)
        const { image, codigo, genero, assetsFolder, garmentBase64 } = body;

        if (!image) {
            return res.status(400).json({ isError: true, detalle: "Faltan datos críticos: imagen del usuario para la fusión." });
        }

        const cleanUserImage = image.replace(/^data:image\/\w+;base64,/, "");
        let finalGarmentBase64 = "";

        // --- SISTEMA DE RESCATE INTELIGENTE ---
        if (garmentBase64) {
            console.log("AURAM LOG: Procesando fusión directa usando Base64 de segundo plano optimizado.");
            finalGarmentBase64 = garmentBase64.replace(/^data:image\/\w+;base64,/, "");
        } else {
            // De lo contrario, realizamos la descarga clásica y segura del Storage Bucket
            if (!codigo) throw new Error("Falta el código de la prenda para acceder al almacén.");
            
            const matches = codigo.toString().toUpperCase().match(/[A-Z]\d{3}/);
            const codigoLimpio = matches ? matches[0] : codigo.toString().trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
            const generoLimpio = (genero || 'hombre').toLowerCase().trim();

            console.log(`AURAM LOG: Descargando de Google Storage -> Boutique: [${assetsFolder}] - Prenda: [${codigoLimpio}]`);

            const credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
            const storage = new Storage({ credentials });
            const bucket = storage.bucket("auram-assets-01");
            
            const carpetaRaiz = assetsFolder || "assets";
            const filePath = `${carpetaRaiz}/${generoLimpio}/${codigoLimpio}.png`;
            const file = bucket.file(filePath);

            const [exists] = await file.exists();
            if (!exists) {
                throw new Error(`Error de Almacén: La prenda ${codigoLimpio} no existe en la ruta del Bucket: ${filePath}`);
            }

            const [bufferPrenda] = await file.download();
            finalGarmentBase64 = bufferPrenda.toString('base64');
        }

        // 2. CONFIGURACIÓN DEL MODELO NANO BANANA (Gemini 2.5 Flash Image)
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ 
            model: "gemini-2.5-flash-image" 
        });

        // 3. PROMPT DE GENERACIÓN NATIVA
        const instruction = `Task: Virtual Try-On with Artistic Depth and Absolute Face Preservation.

        1. Identify the person in the first image and the full clothing outfit (which contains both top and bottom pieces, such as shirts/jackets and pants/skirts) in the second image.
        2. Replace the person's current body clothing in the first image with the corresponding pieces of the clothing outfit from the second image (e.g., replace the person's top with the new top, and the person's bottom with the new bottom).
        3. CRITICAL: If any of the new garments are shorter than the original (e.g., short sleeves over long sleeves, or shorts over pants), you MUST remove the original visible clothing parts and reconstruct the person's skin (arms and legs) realistically.
        4. The full clothing outfit from the second image (all its pieces) must be the ONLY clothing visible on the corresponding parts of the person's body. Do not leave the person's original pants or shirt visible if a replacement exists in the second image.
        5. STRICT FACE AND IDENTITY PRESERVATION: Do NOT modify, touch-up, alter, or regenerate the person's face, head, hair, eyes, nose, mouth, facial features, expressions, or general identity. The face, head, and hair in the final image must be a completely identical, pixel-perfect replication of their appearance in the first image. Preserving the exact original facial identity of the user is of absolute, non-negotiable priority.
        6. Maintain the person's pose and body shape perfectly.
        7. ARTISTIC FINISH: Apply a very shallow depth-of-field effect. Keep the person and the new garments in incredibly sharp focus. Apply a heavy, creamy, and dramatic bokeh blur to the background, making it significantly softer and much less defined than the original, isolating the subject completely.
        8. Return only the final image of the person wearing the new full outfit with their original face 100% untouched and the background intensely blurred.`;

        const parts = [
            { text: instruction },
            { inlineData: { data: cleanUserImage, mimeType: "image/jpeg" } },
            { inlineData: { data: finalGarmentBase64, mimeType: "image/png" } }
        ];

        // 4. EJECUCIÓN CON MODALIDAD DE IMAGEN
        const result = await model.generateContent({
            contents: [{ role: "user", parts }],
            generationConfig: {
                responseModalities: ["IMAGE", "TEXT"],
                temperature: 0.1 
            }
        });

        const response = await result.response;
        const imagePart = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);

        if (imagePart && imagePart.inlineData) {
            return res.status(200).json({ 
                imagenFinal: imagePart.inlineData.data,
                success: true
            });
        } else {
            const textResponse = response.text();
            const match = textResponse.match(/[A-Za-z0-9+/=]{1000,}/);
            if (match) {
                return res.status(200).json({ 
                    imagenFinal: match[0],
                    success: true
                });
            }
            throw new Error("La IA no devolvió píxeles de salida.");
        }

    } catch (err) {
        console.error("FUSION ERROR:", err.message);
        return res.status(500).json({ 
            isError: true, 
            detalle: err.message,
            debug: `Fallo el proceso de fusión de prendas: ${err.message}` 
        });
    }
}
