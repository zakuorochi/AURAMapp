import crypto from 'crypto';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: "Método no permitido." });

    try {
        let dataCuerpo = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        
        // Ya no pedimos userId, solo las imágenes y la estrategia
        const { image, garmentBase64, garments, strategy } = dataCuerpo;

        let listaPrendas = [];
        if (garments && Array.isArray(garments) && garments.length > 0) {
            listaPrendas = garments;
        } else if (garmentBase64) {
            listaPrendas = [garmentBase64];
        }

        if (listaPrendas.length === 0 || !image) {
            throw new Error("Faltan las imágenes base64 del usuario o de las prendas.");
        }

        // 1. PROMPT PARA LA IA DE PRUNA
        const listText = strategy && strategy.trim() !== "" ? strategy : "the garments";
        const promptCostura = `Virtual try-on: dress the person in the provided ${listText}. High quality, realistic, keep the exact original face, pose and background. Keep the garment structure, buttons, and sleeve length exactly as in the reference`;

        const formatImage = (img) => img.startsWith('data:') ? img : `data:image/jpeg;base64,${img}`;

        // 2. CONSTRUCCIÓN DEL ARRAY PARA RUNWARE
        const referenceImagesArray = [
            { "image": formatImage(image), "role": "person" }
        ];

        listaPrendas.forEach(prendaStr => {
            referenceImagesArray.push({ "image": formatImage(prendaStr), "role": "garment" });
        });

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
                    "referenceImages": referenceImagesArray 
                }
            }
        ];

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 28000); 

        // 3. LLAMADA A LA API DE RUNWARE
        let responseRunware;
        try {
            responseRunware = await fetch("https://api.runware.ai/v1", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(runwarePayload),
                signal: controller.signal
            });
        } catch (fetchErr) {
            if (fetchErr.name === 'AbortError') {
                throw new Error("El servidor de Pruna IA está saturado en este momento (Timeout). Intenta de nuevo en unos minutos.");
            }
            throw fetchErr;
        } finally {
            clearTimeout(timeoutId);
        }

        const dataRunware = await responseRunware.json();

        if (dataRunware.errors && dataRunware.errors.length > 0) {
            throw new Error("Runware API Error: " + dataRunware.errors[0].message);
        }

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

        return res.status(200).json({ 
            success: true, 
            resultado: imagenFinal 
        });

    } catch (err) {
        console.error("[ERROR AURAM-TRYON]:", err.message);
        return res.status(500).json({ error: true, detalle: err.message });
    }
}
