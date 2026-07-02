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

      // 5. Prompt Ultra-Realista: Preservación Exacta, Materiales y Efecto Bokeh (Fondo Desenfoque)
      // 6. Prompt de Precisión: Bloqueo Facial, Bloqueo de Color y Efecto Bokeh
     // 7. Prompt Definitivo: Bloqueo de Pose Cruzada, Identidad, Color y Bokeh
       const promptCostura = `TASK: High-Fidelity Virtual Try-On and Material Transfer.
You must render the target garment onto the user's body with perfect anatomical integration.

STRICT ANATOMY & ENVIRONMENT LOCK (CRITICAL):
- PHOTOREALISTIC PRESERVATION: You are strictly forbidden from modifying the user's background, environment, lighting, or surrounding scene. The background must remain 100% IDENTICAL to the source photo.
- FACIAL & BODY LOCK: The user's face, hair, skin tone, hands, and body posture must be preserved with 100% pixel-perfect fidelity. DO NOT perform facial smoothing, beautification, or retouching. 
- EXCLUSIVITY: Modify ONLY the pixels corresponding to the user's torso/body where the garment is applied. All other pixels (face, hair, background, environment) must remain original and untouched.

COLORIMETRY & MATERIAL FIDELITY (ZERO HALLUCINATION):
- COLOR ACCURACY: You must NOT hallucinate or alter the garment's colors. Extract the exact RGB values, patterns, logos, and textures from the garment source and replicate them exactly.
- PHYSICAL STATE: If the original garment is unzipped, open, or wrinkled, render it with the EXACT same physical state on the user. Do not "correct" the design.
- MAPPING: Map the texture precisely to the user's pose. Ensure stitches, logos, and fabric grains align naturally with the user's body curves.

RENDER QUALITY RULES:
- 3D DRAPE: Apply natural 3D volume, realistic shadows, and cloth physics (drapes/wrinkles) to adapt the fabric to the user's specific pose.
- DEPTH & FOCUS: Apply a cinematic depth of field. Keep the user in ultra-sharp focus while maintaining the original background.
- NO HALLUCINATIONS: Do not introduce new objects, extra limbs, or structural changes to the background.

Reference anatomical coordinates: ${JSON.stringify(jsonUsuario)}.
Your goal is a seamless, professional photographic result where the garment looks physically present on the user without altering the original photography's essence.`;
        
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
