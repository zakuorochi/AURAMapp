import crypto from 'crypto';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: "Método no permitido." });

    try {
        let dataCuerpo = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        
        // 1. Extraemos la imagen del usuario y buscamos la ropa (ya sea 1 o varias)
        // Aceptamos 'garmentBase64' (string) para 1 prenda o 'garments' (array) para múltiples
        const { image, garmentBase64, garments } = dataCuerpo;

        // 2. Normalizamos la entrada de prendas a un Array para procesarlo dinámicamente
        let listaPrendas = [];
        if (garments && Array.isArray(garments) && garments.length > 0) {
            listaPrendas = garments;
        } else if (garmentBase64) {
            listaPrendas = [garmentBase64];
        }

        if (listaPrendas.length === 0 || !image) {
            throw new Error("Faltan las imágenes base64 del usuario o de las prendas.");
        }

        const promptCostura = `Virtual try-on: Convert the input flat design/sketch into a photorealistic garment. 
- TRANSFORMATION: Apply hyper-realistic fabric textures, natural lighting, and shadows to the flat/anime-style design from the reference image.
- LAYERING: Composite ALL garments from the reference set onto the person simultaneously. Do not limit the transformation to the outermost layer. 
- HIERARCHY: Correctly layer the clothing: shirt as the base, tie/accessories as mid-layer, and jacket as the outer layer. Ensure all layers interact realistically with fabric folds and occlusion.
- REALISM: Render as a single, cohesive photorealistic outfit with matching shadows and lighting across all layers.
- PRESERVATION: Keep the person's face, skin, hair, and background 100% untouched.`;

        const formatImage = (img) => img.startsWith('data:') ? img : `data:image/jpeg;base64,${img}`;

        // 3. Construimos el array de "referenceImages" dinámicamente
        const referenceImages = [
            { "image": formatImage(image), "role": "person" }
        ];

        // Iteramos sobre todas las prendas que llegaron y las añadimos como "garment"
        listaPrendas.forEach(prendaStr => {
            referenceImages.push({ "image": formatImage(prendaStr), "role": "garment" });
        });

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
                    "referenceImages": referenceImages // Pasamos el array dinámico completo
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
        console.error("[ERROR AURAM-TRYON]:", err.message);
        return res.status(500).json({ error: true, detalle: err.message });
    }
}
