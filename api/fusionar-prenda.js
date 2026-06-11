export default async function handler(req, res) {
    // 1. Configurar cabeceras CORS para que tu index.html se comunique sin bloqueos
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
        // BLINDAJE: Si req.body llega como string por el peso del Base64, lo transformamos a objeto
        let dataCuerpo = req.body;
        if (typeof dataCuerpo === 'string') {
            dataCuerpo = JSON.parse(dataCuerpo);
        }

        // 2. Recibimos los nombres exactos que manda tu index.html
        const { image, garmentBase64, jsonPrenda, jsonUsuario } = dataCuerpo;

        // Validación de seguridad con los nuevos nombres
        if (!garmentBase64 || !image) {
            throw new Error("Faltan las imágenes base64 en la petición.");
        }

        // 3. Preparar el prompt en inglés técnico para máxima precisión en la costura
       // 3. Prompt estricto Anti-Alucinaciones y control de pose
        const promptCostura = `TASK: Expert Virtual Try-On. You must realistically dress the person in <IMAGE_1> using ONLY the exact garment from <IMAGE_0>.

STRICT ANATOMY AND POSE RULES:
1. KEEP the exact original pose of the person in <IMAGE_1>.
2. DO NOT add objects. The person MUST NOT be holding a phone or camera.
3. DO NOT generate extra limbs, hands, or arms. Keep the original hands exactly where they are.
4. DO NOT alter the user's face, facial hair, skin tone, or the original background environment.

FITTING INSTRUCTIONS:
- Extract the clothing design, texture, and color from <IMAGE_0>.
- Wrap and tailor it naturally over the user's torso in <IMAGE_1>.
- Reference these anatomical coordinates ONLY to understand the body scale and position, do not print them: ${JSON.stringify(jsonUsuario)}.

Output MUST be a highly realistic, unedited-looking photograph preserving the exact original body structure.`;
        
        const responseXAI = await fetch("https://api.x.ai/v1/images/edits", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${process.env.XAI_API_KEY}`
            },
           // ... código anterior ...
            body: JSON.stringify({
                model: "grok-imagine-image",
                prompt: promptCostura,
                images: [
                    // Grok exige que el Base64 se envíe como un "url" con el prefijo incluido
                    { url: `data:image/jpeg;base64,${garmentBase64}` },
                    { url: `data:image/jpeg;base64,${image}` }
                ],
                n: 1,
                resolution: "1k",
                response_format: "b64_json"
            })
            // ... código siguiente ...
        });

        // 5. Procesar la respuesta del servidor de xAI
        const dataXAI = await responseXAI.json();

        if (!responseXAI.ok) {
            console.error("Detalle error xAI:", dataXAI);
            throw new Error(dataXAI.error?.message || "Error interno en el motor de Grok Imagine.");
        }

        // Extraemos la cadena base64 limpia que nos devuelve Grok
        const imagenFusionadaBase64 = dataXAI.data[0].b64_json;

        // 6. Enviar el resultado de vuelta a tu index.html
        return res.status(200).json({ 
            success: true, 
            resultado: `data:image/jpeg;base64,${imagenFusionadaBase64}` 
        });

    } catch (err) {
        console.error("[ERROR EN BACKEND AURAM-GROK]:", err.message);
        return res.status(500).json({ 
            error: true, 
            detalle: err.message 
        });
    }
}
