import crypto from 'crypto';
import sharp from 'sharp';

export default async function handler(req, res) {
    // 1. Configurar cabeceras CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: "Método no permitido. Usa POST." });
    }

    try {
        // BLINDAJE: Transformar payload a objeto si llega como string
        let dataCuerpo = req.body;
        if (typeof dataCuerpo === 'string') {
            dataCuerpo = JSON.parse(dataCuerpo);
        }

        const { image, garmentBase64, jsonPrenda, jsonUsuario } = dataCuerpo;

        // Validación de seguridad
        if (!garmentBase64 || !image) {
            throw new Error("Faltan las imágenes base64 en la petición.");
        }

        // ========================================================================
        // PASO CLAVE: CONVERSIÓN DE JSON A MÁSCARA FÍSICA CON SHARP
        // ========================================================================
        const ancho = 1024;
        const alto = 1024;
        
        // IMPORTANTE: Reemplaza "hombroIzq.x", etc., por las propiedades exactas de tu jsonUsuario
        const svgMask = `
            <svg width="${ancho}" height="${alto}">
                <rect width="100%" height="100%" fill="#000000" />
                
                <defs>
                    <filter id="desenfoque">
                        <feGaussianBlur stdDeviation="3" />
                    </filter>
                </defs>
                <polygon points="
                    ${jsonUsuario.hombroIzq?.x || 300},${jsonUsuario.hombroIzq?.y || 200} 
                    ${jsonUsuario.hombroDer?.x || 700},${jsonUsuario.hombroDer?.y || 200} 
                    ${jsonUsuario.cinturaDer?.x || 650},${jsonUsuario.cinturaDer?.y || 800} 
                    ${jsonUsuario.cinturaIzq?.x || 350},${jsonUsuario.cinturaIzq?.y || 800}
                " fill="#FFFFFF" filter="url(#desenfoque)"/>
            </svg>
        `;

        // Convertir el SVG a un buffer PNG y luego a DataURI
        const mascaraBuffer = await sharp(Buffer.from(svgMask)).png().toBuffer();
        const mascaraDataURI = `data:image/png;base64,${mascaraBuffer.toString('base64')}`;


        // ========================================================================
        // PREPARACIÓN DEL PROMPT PARA PRUNA AI (P-Image-Edit)
        // ========================================================================
       // Este sería tu nuevo prompt para la API de Pruna
const promptCostura = `Professional Virtual Try-On. 
Source garment (Input 2) mapped onto target body (Input 1). 
- ANATOMY LOCK: Keep user face, skin, hair, and background 100% original. Zero facial retouching.
- GARMENT FIDELITY: Maintain the EXACT state of the garment (e.g., keep open jackets open, do not zip).
- PHYSICS: Realistic 3D drape, fabric volume, and natural shadows wrapping the body geometry.
- ALIGNMENT: Align fabric patterns, logos, and seams to the body following these reference anchors: ${JSON.stringify(jsonUsuario)}.
- STYLE: Hyper-detailed photorealistic fabric texture, seamless integration at the neck and wrists.
- NO HALLUCINATIONS: Do not alter the original background, do not change user pose, do not change garment color or design.`;

        // Formateo seguro de imágenes (Pruna acepta DataURI o Base64 puro, estandarizamos a DataURI)
        const formatImage = (img) => img.startsWith('data:') ? img : `data:image/jpeg;base64,${img}`;

        // Estructura estricta exigida por Runware API
        const runwarePayload = [
            {
                "taskType": "authentication",
                "apiKey": process.env.RUNWARE_API_KEY
            },
            {
                "taskType": "imageInference",
                "taskUUID": crypto.randomUUID(),
                "model": "prunaai:2@1",
                "positivePrompt": promptCostura,
                "width": ancho,
                "height": alto,
                "outputType": "dataURI", // Para devolver Base64 directo a tu frontend
                "outputFormat": "JPG",
                "inputs": {
                    "referenceImages": [
                        formatImage(image),          // [0] Semilla: Foto del usuario
                        formatImage(garmentBase64),  // [1] Referencia: La prenda
                        mascaraDataURI               // [2] Restricción: La máscara de Sharp
                    ]
                }
            }
        ];

        // ========================================================================
        // LLAMADA AL MOTOR DE INFERENCIA DE RUNWARE
        // ========================================================================
        const responseRunware = await fetch("https://api.runware.ai/v1", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(runwarePayload)
        });

        const dataRunware = await responseRunware.json();

        // Manejo de errores de la API de Runware
        if (dataRunware.errors && dataRunware.errors.length > 0) {
            console.error("Detalle error Pruna AI:", dataRunware.errors);
            throw new Error(dataRunware.errors[0].message || "Error en la inferencia de Pruna AI.");
        }

        // Extraer la imagen procesada
        // Runware devuelve la dataURI completa gracias al outputType que configuramos
        const imagenFusionadaDataURI = dataRunware.data[0].imageURL;

        // Retornar al index.html de AURAM
        return res.status(200).json({ 
            success: true, 
            resultado: imagenFusionadaDataURI 
        });

    } catch (err) {
        console.error("[ERROR EN BACKEND AURAM-PRUNA]:", err.message);
        return res.status(500).json({ 
            error: true, 
            detalle: err.message 
        });
    }
}
