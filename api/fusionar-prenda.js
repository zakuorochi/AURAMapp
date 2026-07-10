import crypto from 'crypto';

export default async function handler(req, res) {
    // Configuración CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: "Método no permitido." });

    try {
        let dataCuerpo = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        const { image, garmentBase64 } = dataCuerpo;

        if (!garmentBase64 || !image) {
            throw new Error("Faltan las imágenes base64.");
        }

        // PROMPT ESTRATÉGICO: 
        // Aquí le damos el control total al modelo para que use la imagen 2 como referencia
        // y la aplique sobre la imagen 1, protegiendo el entorno.
        const promptCostura = `Virtual try-on: Compositing the garment from the reference image onto the person in the target image. 
        CRITICAL RULES: 
        1. Keep the person's face, hair, skin, and full body pose EXACTLY as in the original photo. 
        2. Keep the original background, environment, lighting, and camera angle 100% untouched. 
        3. Replace ONLY the existing clothing with the reference garment, ensuring perfect texture mapping, natural fabric folds, and shadows matching the original scene. 
        4. High-fidelity rendering.`;

        const formatImage = (img) => img.startsWith('data:') ? img : `data:image/jpeg;base64,${img}`;

        const runwarePayload = [
            {
                "taskType": "authentication",
                "apiKey": process.env.RUNWARE_API_KEY
            },
            {
                "taskType": "imageInference",
                "taskUUID": crypto.randomUUID(),
                "model": "alibaba:qwen-image@2512",
                "positivePrompt": promptCostura,
                "negativePrompt": "background change, facial distortion, skin retouching, body shape change, different pose, extra limbs, low quality, cartoon, watermark",
                "width": 1024,
                "height": 1024,
                "strength": 0.75, // Ajusta esto: 0.7-0.8 es ideal para fusionar sin borrar fondo
                "outputType": "dataURI",
                "outputFormat": "JPG",
                "inputs": {
                    "seedImage": formatImage(image) // La foto del usuario
                    // Qwen usa seedImage y maskImage. Si no pasas máscara, 
                    // la IA usará el prompt para decidir qué cambiar.
                }
            }
        ];

        const responseRunware = await fetch("https://api.runware.ai/v1", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(runwarePayload)
        });

        const dataRunware = await responseRunware.json();

        if (dataRunware.errors?.length > 0) throw new Error(dataRunware.errors[0].message);

        return res.status(200).json({ 
            success: true, 
            resultado: dataRunware.data[0].imageURL 
        });

    } catch (err) {
        console.error("[ERROR QWEN-TRYON]:", err.message);
        return res.status(500).json({ error: true, detalle: err.message });
    }
}
