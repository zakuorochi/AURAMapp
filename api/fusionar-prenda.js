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

       const promptCostura = "Photorealistic virtual try-on: composite the ALL CLOTHES set onto the person, maintaining perfect layer hierarchy, natural fabric physics, and realistic shadows while keeping the person's identity and original background 100% unchanged."

        const formatImage = (img) => img.startsWith('data:') ? img : `data:image/jpeg;base64,${img}`;

        // 3. Construimos el array de "referenceImages" dinámicamente
        const referenceImages = [
            { "image": formatImage(image), "role": "person" }
        ];

        // Iteramos sobre todas las prendas que llegaron y las añadimos como "garment"
        listaPrendas.forEach(prendaStr => {
            referenceImages.push({ "image": formatImage(prendaStr), "role": "garment" });
        });

   // ... dentro de tu handler
const runwarePayload = [
    { "taskType": "authentication", "apiKey": process.env.RUNWARE_API_KEY },
    {
        "taskType": "imageInference",
        "taskUUID": crypto.randomUUID(),
        "model": "prunaai:p-image@try-on",
        "positivePrompt": promptCostura,
        "outputType": "dataURI",
        "outputFormat": "JPG",
        "inputs": {
            "referenceImages": referenceImages // <--- AQUÍ ESTABA EL ERROR, ESTABA HARDCODED
        }
    }
];

const responseRunware = await fetch("https://api.runware.ai/v1", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(runwarePayload)
});
        const dataRunware = await responseRunware.json();

        // Si la API de Runware detectó un error interno, lo lanzamos
        if (dataRunware.errors && dataRunware.errors.length > 0) {
            throw new Error("Runware API Error: " + dataRunware.errors[0].message);
        }

        // ------------------------------------------------------------------------
        // BUSCADOR DINÁMICO DE IMÁGENES (A prueba de fallos)
        // ------------------------------------------------------------------------
   let imagenFinal = null;
        
        if (dataRunware.data && Array.isArray(dataRunware.data)) {
            for (const item of dataRunware.data) {
                // AQUÍ ESTÁ LA MAGIA: Agregamos item.imageDataURI
                if (item.imageDataURI) {
                    imagenFinal = item.imageDataURI;
                } else if (item.imageURL) {
                    imagenFinal = item.imageURL;
                } else if (item.image) {
                    imagenFinal = item.image;
                } else if (item.dataURI) {
                    imagenFinal = item.dataURI;
                } else if (item.base64Data) {
                    imagenFinal = "data:image/jpeg;base64," + item.base64Data; 
                }
                
                if (imagenFinal) break; 
            }
        }

        // TRAMPA DE DEBUGGING
        if (!imagenFinal) {
            const rawResponse = JSON.stringify(dataRunware.data);
            throw new Error("Formato desconocido de Runware. Respuesta cruda: " + rawResponse.substring(0, 200));
        }

        // Retornamos el éxito al frontend
        return res.status(200).json({ 
            success: true, 
            resultado: imagenFinal 
        });

    } catch (err) {
        console.error("[ERROR AURAM-TRYON]:", err.message);
        return res.status(500).json({ error: true, detalle: err.message });
    }
}
