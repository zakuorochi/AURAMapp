import crypto from 'crypto';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: "Método no permitido." });

    try {
        let dataCuerpo = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        
        // 1. Extraemos las imágenes enviadas por el frontend
        const { image, garmentBase64, garments } = dataCuerpo;

        // 2. Normalizamos la entrada a un Array (acepta 1 prenda o múltiples prendas)
        let listaPrendas = [];
        if (garments && Array.isArray(garments) && garments.length > 0) {
            listaPrendas = garments;
        } else if (garmentBase64) {
            listaPrendas = [garmentBase64];
        }

        if (listaPrendas.length === 0 || !image) {
            throw new Error("Faltan las imágenes base64 del usuario o de las prendas.");
        }

        // Prompt corto y directo recomendado por la documentación de Runware
        const promptCostura = "Full-body virtual try-on: replace existing clothes with the provided outfit reference, maintain original background and body pose.";

        const formatImage = (img) => img.startsWith('data:') ? img : `data:image/jpeg;base64,${img}`;

        // 3. Construimos el array dinámico para Runware
        const referenceImagesArray = [
            { "image": formatImage(image), "role": "person" }
        ];

        // Iteramos sobre las prendas y las añadimos (funcionará ya sea 1 foto de conjunto o 3 fotos separadas)
        listaPrendas.forEach(prendaStr => {
            referenceImagesArray.push({ "image": formatImage(prendaStr), "role": "garment" });
        });

        // 4. Payload con el array dinámico inyectado correctamente
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
                    "referenceImages": referenceImagesArray // <--- AQUÍ SE INYECTA EL ARRAY LIMPIO
                }
            }
        ];

        // 5. Llamada a la API
        const responseRunware = await fetch("https://api.runware.ai/v1", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(runwarePayload)
        });

        const dataRunware = await responseRunware.json();

        if (dataRunware.errors && dataRunware.errors.length > 0) {
            throw new Error("Runware API Error: " + dataRunware.errors[0].message);
        }

        // 6. Buscador dinámico de la imagen de respuesta
        let imagenFinal = null;
        
        if (dataRunware.data && Array.isArray(dataRunware.data)) {
            for (const item of dataRunware.data) {
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

        if (!imagenFinal) {
            const rawResponse = JSON.stringify(dataRunware.data);
            throw new Error("Formato desconocido de Runware. Respuesta cruda: " + rawResponse.substring(0, 200));
        }

        // 7. Retorno exitoso
        return res.status(200).json({ 
            success: true, 
            resultado: imagenFinal 
        });

    } catch (err) {
        console.error("[ERROR AURAM-TRYON]:", err.message);
        return res.status(500).json({ error: true, detalle: err.message });
    }
}
