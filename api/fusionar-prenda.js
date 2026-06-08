import { GoogleGenerativeAI } from "@google/generative-ai";
import { Storage } from "@google-cloud/storage";

export default async function handler(req, res) {
    // 1. Configuración de cabeceras CORS (Intacto)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        
        // MODIFICACIÓN: Recibimos las imágenes y los dos mapas de coordenadas JSON resultantes de los pasos previos
        const { 
            image, 
            codigo, 
            genero, 
            assetsFolder, 
            garmentBase64,
            jsonPrenda, // Mapa "Sticker" (coordenadas + anclajes de la prenda)
            jsonUsuario // Mapa "Muñeco" (coordenadas + articulaciones del usuario)
        } = body;

        if (!image) {
            return res.status(400).json({ isError: true, detalle: "Faltan datos críticos: imagen del usuario para la fusión." });
        }

        const cleanUserImage = image.replace(/^data:image\/\w+;base64,/, "");
        let finalGarmentBase64 = "";

        // --- SISTEMA DE RESCATE INTELIGENTE (Intacto) ---
        if (garmentBase64) {
            console.log("AURAM LOG: Procesando fusión directa usando Base64 optimizado por el cliente.");
            finalGarmentBase64 = garmentBase64.replace(/^data:image\/\w+;base64,/, "");
        } else {
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

        // 2. CONFIGURACIÓN DEL MODELO GEMINI DE ALTA FIDELIDAD (Intacto)
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ 
            model: "gemini-2.5-flash-image" 
        });

        // 3. PROMPT REESTRUCTURADO: SE ALIMENTA DE LOS MAPAS COORDENADOS Y SE ELIMINÓ CONVERSIÓN 2D
        const instruction = `Task: High-Fidelity Coordinate-Guided Virtual Try-On.

        You are provided with two images and their respective anatomical mapping data:
        - Input Image 1: Real photo of the user (The target body).
        - Input Image 2: Isolated retail garment sticker.
        
        [COORDINATE MAP DATA INPUTS]:
        - Garment Data ("Sticker" Map): ${JSON.stringify(jsonPrenda)}
        - User Data ("Mannequin" Map): ${JSON.stringify(jsonUsuario)}

        Your absolute mission is to execute a precise physical overlay, mapping the garment from Input Image 2 exactly over the body coordinates provided in the data.

        STRICT EXECUTION RULES:
        1. MATHEMATICAL MAPPING: Use the "garment_anchors" (neckline, sleeves, hems) from the Garment Data and stretch, fold, and align them exactly with the corresponding "user_anchors" (neck_base, shoulders, wrists, waist_line) from the User Data. Do not guess boundaries; obey the JSON parameters.
        2. FLAWLESS SEAMLESS SEWING: Replace the original clothing inside the user's "box_2d" layout. The new textile must naturally adapt to the curves, volume, and posture of the user's joints without tearing or blurring structural body elements.
        3. IDENTITY AND BODY PRESERVATION: Do NOT alter, modify, or regenerate the user's face, head, hair, skin tone, hands, or fingers. Keep them pixel-perfect as they appear in Input Image 1. 
        4. SINGLE SUBJECT REQUIREMENT: Ensure exactly one person is rendered. No ghost clothing, no duplicate limbs, and no background floating elements.
        5. PROFESSIONAL FINISH: Preserve the original background lighting. Sharp-focus the newly clothed body while blending out peripheral sewing artifacts natively.

        OUTPUT FORMAT: Return only the final merged image of the person wearing the new outfit, with no borders, texts, markdown wrapping, or empty side margins.`;

        const parts = [
            { text: instruction },
            { inlineData: { data: cleanUserImage, mimeType: "image/jpeg" } },      // Imagen 1: El usuario
            { inlineData: { data: finalGarmentBase64, mimeType: "image/png" } }   // Imagen 2: La prenda recortada
        ];

        // 4. EJECUCIÓN DEL MOTOR DE IMAGEN (Intacto)
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
