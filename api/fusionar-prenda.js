import { GoogleGenerativeAI } from "@google/generative-ai";
import { Storage } from "@google-cloud/storage";
import admin from 'firebase-admin';

// Inicializar Firebase Admin de forma segura una sola vez en el entorno Serverless
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
        const { image, codigo, genero, assetsFolder, garmentBase64 } = body;

        if (!image) {
            return res.status(400).json({ isError: true, detalle: "Faltan datos críticos: imagen de usuario para la fusión." });
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

        // Obtener el Base64 de la prenda (vía directa del pre-recorte del frontend o del bucket de almacenamiento)
        if (garmentBase64) {
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

        // 2. CONFIGURACIÓN DEL MODELO DE IMAGEN (Gemini 2.5 Flash Image)
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ 
            model: "gemini-2.5-flash-image" 
        });

        // 3. PROMPT DE GENERACIÓN EN PLURAL (OPTIMIZADO PARA CONJUNTOS DE ARRIBA Y ABAJO)
        const instruction = `Task: Virtual Try-On with Artistic Depth.

1. Identify the person in the first image and the full clothing outfit (which contains both top and bottom pieces, such as shirts/jackets and pants/skirts) in the second image.
2. Replace the person's current body clothing in the first image with the corresponding pieces of the clothing outfit from the second image (e.g., replace the person's top with the new top, and the person's bottom with the new bottom).
3. CRITICAL: If any of the new garments are shorter than the original (e.g., short sleeves over long sleeves, or shorts over pants), you MUST remove the original visible clothing parts and reconstruct the person's skin (arms and legs) realistically.
4. The full clothing outfit from the second image (all its pieces) must be the ONLY clothing visible on the corresponding parts of the person's body. Do not leave the person's original pants or shirt visible if a replacement exists in the second image.
5. Maintain the person's pose, body shape, and background perfectly.
6. ARTISTIC FINISH: Apply a realistic shallow depth-of-field effect. Keep the person and the new garments in sharp focus while applying a natural blur (bokeh) to the background.
7. Return only the final image of the person wearing the new full outfit with the blurred background.`;

        const parts = [
            { text: instruction },
            { inlineData: { data: cleanUserImage, mimeType: "image/jpeg" } },
            { inlineData: { data: finalGarmentBase64, mimeType: "image/png" } }
        ];

        // 4. EJECUCIÓN CON MODALIDAD DE IMAGEN
        const result = await model.generateContent({
            contents: [{ role: "user", parts }],
            generationConfig: {
                responseModalities: ["IMAGE"],
                temperature: 0.1 
            }
        });

        const response = await result.response;
        const candidate = response.candidates?.[0];
        const imagePart = candidate?.content?.parts?.find(p => p.inlineData);

        let base64Final = "";

        if (imagePart && imagePart.inlineData) {
            base64Final = imagePart.inlineData.data;
        } else {
            // Modo rescate en caso de que lo devuelva como texto base64 en lugar de inlineData estructurado
            const textResponse = response.text ? response.text() : "";
            const match = textResponse.match(/[A-Za-z0-9+/=]{1000,}/);
            if (match) {
                base64Final = match[0];
            }
        }

        if (base64Final && base64Final.length > 100) {
            // --- FILTRO B (COBRO EN ÉXITO): El contador de Firestore SÓLO se incrementa si la IA completó el trabajo con éxito ---
            if (!isWhitelisted && docRef) {
                await docRef.set({
                    contador: currentUsos + 1,
                    fecha: hoy,
                    ultimaFusion: new Date()
                }, { merge: true });
                console.log(`AURAM LOG: Fusión exitosa para IP [${userIp}]. Intento descontado. Restan: ${LIMITE_FUSIONES - (currentUsos + 1)}`);
            }

            return res.status(200).json({ 
                imagenFinal: base64Final,
                success: true 
            });
        }

        const textError = candidate?.content?.parts?.find(p => p.text)?.text || "Sin detalle";
        throw new Error(`Formato no procesable. La IA dijo: ${textError.substring(0, 100)}`);

    } catch (err) {
        console.error("FUSION ERROR:", err.message);
        res.status(500).json({ isError: true, detalle: err.message });
    }
}
