import crypto from 'crypto';

export default async function handler(req, res) {
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

        // El prompt ahora es más sencillo porque el modelo ya entiende que es un "Try-On"
        const promptCostura = "Full-body virtual try-on: seamlessly composite the entire outfit from the reference image onto the person's body, covering torso, arms, and legs. Maintain the original pose, physical body proportions, and height of the person. STRICT PRESERVATION: keep the original background, environment, skin, face, and hair 100% untouched. The garment must dynamically adapt its perspective, folds, and shadows to the subject's posture. High-fidelity textile fusion, zero distortion, photorealistic rendering.";

        const formatImage = (img) => img.startsWith('data:') ? img : `data:image/jpeg;base64,${img}`;

        // Estructura estricta para el modelo de TRY-ON de Pruna
        const runwarePayload = [
            {
                "taskType": "authentication",
                "apiKey": process.env.RUNWARE_API_KEY
            },
            {
                "taskType": "imageInference",
                "taskUUID": crypto.randomUUID(),
                "model": "prunaai:p-image@try-on",
                "positivePrompt": promptCostura,
                "outputType": "dataURI",
                "outputFormat": "JPG",
                "inputs": {
                    "referenceImages": [
                        { "image": formatImage(image), "role": "person" },
                        { "image": formatImage(garmentBase64), "role": "garment" }
                    ]
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

        // Retornar la imagen fusionada
        return res.status(200).json({ 
            success: true, 
            resultado: dataRunware.data[0].imageURL 
        });

    } catch (err) {
        console.error("[ERROR AURAM-TRYON]:", err.message);
        return res.status(500).json({ error: true, detalle: err.message });
    }
}
