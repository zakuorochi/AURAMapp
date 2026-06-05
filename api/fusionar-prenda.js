import { GoogleGenerativeAI } from "@google/generative-ai";
import { Storage } from "@google-cloud/storage";
import admin from 'firebase-admin';

// Inicializar Firebase Admin de forma segura una sola vez en el entorno Serverless de Vercel
if (!admin.apps.length) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}
const db = admin.firestore();

// Configuración de límites y control de abuso de tokens
const LIMITE_FUSIONES = 10;
const LISTA_BLANCA = [
    "38.25.15.101", "127.0.0.1", "190.236.3.187", "190.236.6.225", "::1", "190.235.12.45"
];

export default async function handler(req, res) {
    // 1. Configuración de cabeceras CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        // Extraemos garmentBase64 (que recibe el recorte transparente y directo de borrar-fondo)
        const { image, codigo, genero, assetsFolder, garmentBase64 } = body;

        if (!image) {
            return res.status(400).json({ isError: true, detalle: "Faltan datos críticos: imagen del usuario para la fusión." });
        }

        // --- SISTEMA DE VERIFICACIÓN DE INTENTOS DIARIOS POR IP (Consumo Seguro) ---
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
        const userIp = ip.split(',')[0].trim();
        const ipKey = userIp.replace(/\./g, '_');
        const hoy = new Date().toISOString().split('T')[0]; // "YYYY-MM-DD"

        let isWhitelisted = LISTA_BLANCA.includes(userIp);
        let docRef = null;
        let currentUsos = 0;

        if (!isWhitelisted) {
            docRef = db.doc(`artifacts/auram-site/public/data/limites_fusion/${ipKey}`);
            const doc = await docRef.get();
            if (doc.exists) {
                const data = doc.data();
                if (data.fecha === hoy) {
                    currentUsos = data.contador || 0;
                }
            }

            // Validar si superó el límite de 10 fusiones diarias exitosas
            if (currentUsos >= LIMITE_FUSIONES) {
                return res.status(429).json({ 
                    isError: true, 
                    detalle: "Has alcanzado tu límite de 10 fusiones diarias gratuitas en el Beta de AURAM. ¡Vuelve mañana para seguir experimentando!"
                });
            }
        }

        const cleanUserImage = image.replace(/^data:image\/\w+;base64,/, "");
        let finalGarmentBase64 = "";

        // --- SISTEMA DE RESCATE INTELIGENTE DE PRENDA ---
        if (garmentBase64) {
            console.log("AURAM LOG: Procesando fusión directa usando Base64 recortado por Canvas en servidor.");
            finalGarmentBase64 = garmentBase64.replace(/^data:image\/\w+;base64,/, "");
        } else {
            // De lo contrario, realizamos la descarga clásica del Storage Bucket
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

        // Inicializar la API de Gemini
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

        // ==========================================
        // CAPA DE SEGURIDAD 1: SAFETY GATE (Pre-Filtro de Contenido)
        // ==========================================
        console.log("AURAM LOG: Ejecutando Safety Gate (Moderación de edad, lencería y cobertura)...");
        const safetyModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });
        const safetyPrompt = `Task: Safety, Compliance, and Ethical Verification for Virtual Try-On.

        Analyze the two images provided:
        - Image 1 (User Photo): Check if the person is a minor/child/toddler (under 18 years old).
        - Image 2 (Garment Sticker): Check if the garment belongs to the prohibited category: underwear, lingerie, swimsuits, bikinis, or if it covers less than 40% of a standard human body.

        Respond strictly in JSON format with this structure:
        {
          "isSafe": true/false,
          "reason": "SAFE" | "CHILD_DETECTED" | "PROHIBITED_GARMENT" | "INSUFFICIENT_COVERAGE"
        }`;

        const safetyParts = [
            { text: safetyPrompt },
            { inlineData: { data: cleanUserImage, mimeType: "image/jpeg" } },
            { inlineData: { data: finalGarmentBase64, mimeType: "image/png" } }
        ];

        const safetyResult = await safetyModel.generateContent({
            contents: [{ role: "user", parts: safetyParts }],
            generationConfig: { responseMimeType: "application/json" }
        });

        const safetyData = JSON.parse(safetyResult.response.text());
        console.log(`AURAM LOG: Resultado de Moderación -> [${safetyData.reason}]`);

        if (!safetyData.isSafe) {
            let msgError = "La imagen o prenda no cumple con nuestras directrices.";
            if (safetyData.reason === "CHILD_DETECTED") {
                msgError = "AURAM está diseñado exclusivamente para adultos. Por motivos de privacidad y seguridad infantil, no procesamos fotos de menores de edad.";
            } else if (safetyData.reason === "PROHIBITED_GARMENT") {
                msgError = "Por políticas de seguridad y uso ético de la plataforma, AURAM no procesa ropa interior, bañadores o lencería.";
            } else if (safetyData.reason === "INSUFFICIENT_COVERAGE") {
                msgError = "La prenda seleccionada es demasiado corta o descubierta para una fusión estable. Por favor, selecciona una prenda que cubra al menos el 40% del cuerpo.";
            }
            return res.status(400).json({ isError: true, detalle: msgError });
        }

        // ==========================================
        // PROCESO PRINCIPAL: MOTOR DE FUSIÓN (Gemini 2.5 Flash Image)
        // ==========================================
        const model = genAI.getGenerativeModel({ 
            model: "gemini-2.5-flash-image" 
        });

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

        const result = await model.generateContent({
            contents: [{ role: "user", parts }],
            generationConfig: {
                responseModalities: ["IMAGE", "TEXT"],
                temperature: 0.1 
            }
        });

        const response = await result.response;
        const imagePart = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);

        let base64Final = "";

        if (imagePart && imagePart.inlineData) {
            base64Final = imagePart.inlineData.data;
        } else {
            const textResponse = response.text();
            const match = textResponse.match(/[A-Za-z0-9+/=]{1000,}/);
            if (match) {
                base64Final = match[0];
            }
        }

        if (!base64Final || base64Final.length < 500) {
            throw new Error("La IA de fusión no devolvió un archivo de imagen procesable.");
        }

        // ==========================================
        // CAPA DE SEGURIDAD 2: QUALITY GATE (Post-Filtro de Control de Calidad)
        // ==========================================
        console.log("AURAM LOG: Iniciando control de calidad de la fusión...");
        const qualityModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });
        const qualityPrompt = `Task: Verify Virtual Try-On Quality.
        Compare Image 1 (original user) and Image 2 (generated fusion result).
        Has the person's clothing in Image 2 successfully changed to the new outfit compared to Image 1?
        
        Respond STRICTLY in JSON format with this structure:
        {
          "passed": true/false,
          "reason": "SUCCESS" | "FAIL"
        }`;

        const qualityParts = [
            { text: qualityPrompt },
            { inlineData: { data: cleanUserImage, mimeType: "image/jpeg" } },
            { inlineData: { data: base64Final, mimeType: "image/png" } }
        ];

        const qualityResult = await qualityModel.generateContent({
            contents: [{ role: "user", parts: qualityParts }],
            generationConfig: { responseMimeType: "application/json" }
        });

        const qualityData = JSON.parse(qualityResult.response.text());
        console.log(`AURAM LOG: Resultado del control de calidad -> [${qualityData.reason}]`);

        if (!qualityData.passed) {
            return res.status(400).json({ 
                isError: true, 
                detalle: "La fusión no cumplió con los estándares de calidad de AURAM (la prenda original no cambió o se detectó una deformidad). Intenta de nuevo con una pose más clara o mejor iluminación." 
            });
        }

        // --- COBRO EN CASO DE ÉXITO ---
        if (!isWhitelisted && docRef) {
            await docRef.set({
                contador: currentUsos + 1,
                fecha: hoy,
                ultimaFusion: new Date()
            }, { merge: true });
            console.log(`AURAM LOG: Fusión aprobada por control de calidad. Intento debitado. Restan: ${LIMITE_FUSIONES - (currentUsos + 1)}`);
        }

        return res.status(200).json({ 
            imagenFinal: base64Final,
            success: true
        });

    } catch (err) {
        console.error("FUSION ERROR:", err.message);
        return res.status(500).json({ 
            isError: true, 
            detalle: err.message,
            debug: `Fallo el proceso de fusión de prendas: ${err.message}` 
        });
    }
}
