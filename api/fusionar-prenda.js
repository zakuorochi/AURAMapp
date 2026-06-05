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
        // Recibimos garmentBase64 (que ya es el sticker recortado de forma gratuita por el Canvas del celular)
        const { image, codigo, genero, assetsFolder, garmentBase64 } = body;

        if (!image) {
            return res.status(400).json({ isError: true, detalle: "Faltan datos críticos: imagen del usuario para la fusión." });
        }

        const cleanUserImage = image.replace(/^data:image\/\w+;base64,/, "");
        let finalGarmentBase64 = "";

        // --- SISTEMA DE RESCATE INTELIGENTE ---
        if (garmentBase64) {
            console.log("AURAM LOG: Procesando fusión directa usando Base64 optimizado por el cliente.");
            finalGarmentBase64 = garmentBase64.replace(/^data:image\/\w+;base64,/, "");
        } else {
            // De lo contrario, realizamos la descarga clásica de respaldo desde Google Storage
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

        // 2. CONFIGURACIÓN DEL MODELO GEMINI DE ALTA FIDELIDAD (Fusión Multimodal)
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ 
            model: "gemini-2.5-flash-image" 
        });

        // 3. PROMPT ESTRUCTURADO Y AUTORITARIO PARA EVITAR COLLAPSE O BLOQUEOS
        const instruction = `Task: High-Fidelity Virtual Try-On and Style Merging.

        You are an expert virtual dressing AI. You are provided with exactly two input images:
        - Input Image 1 (First image attached): A real photo of a person.
        - Input Image 2 (Second image attached): An isolated clothing/garment sticker with a transparent background.

        Your absolute mission is to overlay, adapt, and fuse the garment from Input Image 2 onto the body of the person in Input Image 1.

        STRICT RULES OF EXECUTION:
        1. BODY MAPPING: Identify the torso, shoulders, arms, and legs of the person in Input Image 1.
        2. drape AND SCALE: Take the garment from Input Image 2. Resize, deform, drape, and align it to perfectly match the exact pose, body orientation, and physical silhouette of the person in Input Image 1.
        3. CLOTHING REPLACEMENT: The garment from Input Image 2 must completely cover and replace the original corresponding clothing in Input Image 1. Do not let original clothing layers underneath show through or peek out around the edges of the new garment.
        4. ANATOMICAL INTEGRATION: If the new garment is shorter than the original (e.g., short sleeves replacing long sleeves, or a crop top replacing a long shirt), cleanly reconstruct the person's skin (arms, neck, or midriff) realistically, matching their exact original skin tone, texture, and ambient lighting.
        5. IDENTITY LOCK (CRITICAL): Do NOT modify, touch-up, morph, or regenerate the person's face, head, hair, eyes, nose, mouth, expressions, or personal identity. The entire head, hair, and face area must remain an identical, pixel-perfect replication of their appearance in Input Image 1.
        6. PROFESSIONAL FASHION DEPTH: Apply a premium bokeh effect to the original background of Input Image 1 (soft, creamy blur). Keep the person and the newly fitted garment in ultra-sharp focus, isolating them from the background with dramatic depth of field.
        7. OUTPUT FORMAT: Return only the final merged image of the person wearing the new outfit, with no borders, texts, or empty side margins.`;

        const parts = [
            { text: instruction },
            { inlineData: { data: cleanUserImage, mimeType: "image/jpeg" } },      // Imagen 1: El usuario
            { inlineData: { data: finalGarmentBase64, mimeType: "image/png" } }   // Imagen 2: La prenda recortada
        ];

        // 4. EJECUCIÓN DEL MOTOR DE IMAGEN CON TEMPERATURA BAJA (Fidelidad de Costura)
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
