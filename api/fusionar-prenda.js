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

        // Prompt enriquecido: Aquí le damos toda la responsabilidad a la IA
        // Este sería tu nuevo prompt para la API de Pruna
const promptCostura = `Professional Virtual Try-On. 
Source garment (Input 2) mapped onto target body (Input 1). 
- ANATOMY LOCK: Keep user face, skin, hair, and background 100% original. Zero facial retouching.
- GARMENT FIDELITY: Maintain the EXACT state of the garment (e.g., keep open jackets open, do not zip).
- PHYSICS: Realistic 3D drape, fabric volume, and natural shadows wrapping the body geometry.
- ALIGNMENT: Align fabric patterns, logos, and seams to the body following these reference anchors: ${JSON.stringify(jsonUsuario)}.
- STYLE: Hyper-detailed photorealistic fabric texture, seamless integration at the neck and wrists.
- NO HALLUCINATIONS: Do not alter the original background, do not change user pose, do not change garment color or design.`;

        const formatImage = (img) => img.startsWith('data:') ? img : `data:image/jpeg;base64,${img}`;

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
                "width": 1024,
                "height": 1024,
                "outputType": "dataURI",
                "outputFormat": "JPG",
                "inputs": {
                    "referenceImages": [
                        formatImage(image),         // Imagen base (Persona)
                        formatImage(garmentBase64)  // Imagen de referencia (Ropa)
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

        return res.status(200).json({ 
            success: true, 
            resultado: dataRunware.data[0].imageURL 
        });

    } catch (err) {
        console.error("[ERROR AURAM-PURE-IA]:", err.message);
        return res.status(500).json({ error: true, detalle: err.message });
    }
}
