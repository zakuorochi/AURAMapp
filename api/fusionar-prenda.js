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
        const promptCostura = `Virtual try-on: Convert the input flat design/sketch into a photorealistic garment. 
- TRANSFORMATION: Apply hyper-realistic fabric textures, natural lighting, and shadows to the flat/anime-style design from the reference image.
- LAYERING: Composite ALL garments from the reference set onto the person simultaneously. Do not limit the transformation to the outermost layer. 
- HIERARCHY: Correctly layer the clothing: shirt as the base, tie/accessories as mid-layer, and jacket as the outer layer. Ensure all layers interact realistically with fabric folds and occlusion.
- REALISM: Render as a single, cohesive photorealistic outfit with matching shadows and lighting across all layers.
- PRESERVATION: Keep the person's face, skin, hair, and background 100% untouched.`;

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
