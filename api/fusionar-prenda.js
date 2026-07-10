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
        
        <polygon points="
            ${jsonUsuario.hombroIzq?.x},${jsonUsuario.hombroIzq?.y} 
            ${jsonUsuario.hombroDer?.x},${jsonUsuario.hombroDer?.y} 
            ${jsonUsuario.rodillaDer?.x || 700},${jsonUsuario.rodillaDer?.y || 800} 
            ${jsonUsuario.rodillaIzq?.x || 300},${jsonUsuario.rodillaIzq?.y || 800}
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
const promptCostura = "Full-body virtual try-on: seamlessly composite the entire outfit from the reference image onto the person's body, covering torso, arms, and legs. Maintain the original pose, physical body proportions, and height of the person. STRICT PRESERVATION: keep the original background, environment, skin, face, and hair 100% untouched. The garment must dynamically adapt its perspective, folds, and shadows to the subject's posture. High-fidelity textile fusion, zero distortion, photorealistic rendering."

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
