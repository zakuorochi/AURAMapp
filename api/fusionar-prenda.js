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
        const promptCostura = `TASK: Expert Virtual Try-On and Concept-to-Reality Rendering. 
You must realistically equip or dress the person in <IMAGE_1> using the EXACT design from <IMAGE_0>.

FACIAL IDENTITY LOCK (CRITICAL):
- The user's face, facial expression, hair, and skin tone MUST remain 100% IDENTICAL to <IMAGE_1>. 
- DO NOT redraw, alter, or "beautify" the face. Zero facial modifications are allowed.

STRICT DESIGN & COLOR PRESERVATION (ZERO HALLUCINATION):
- COLOR LOCK: You MUST extract and use the EXACT color palette from <IMAGE_0>. Do not change the colors of the armor or garment to match the room; maintain the original colors strictly.
- REAL GARMENTS (1:1 FIDELITY): If <IMAGE_0> is a photograph of real clothing, you must perfectly replicate the exact fabric, stitching, logos, and proportions. It must look like the exact same physical item.
- ARMOR & SKETCHES: Preserve the intricate details, decals, and original shapes without inventing new geometry.

ADAPTIVE MATERIAL & RENDERING RULES:
- SOFT FABRIC: Render as physical fabric with 3D volume, natural drape, and wrinkles wrapping the body.
- RIGID/HARD SURFACE (armor, cosplay): Preserve its structural integrity. Articulate and attach the plates biomechanically to fit the user's 3D anatomy.
- 2D SKETCH/ANIME: Translate into photorealistic physical materials preserving the exact original shapes and EXACT colors.

PHOTOGRAPHY & "WOW" FACTOR:
- Apply a professional cinematic portrait photography style.
- The user and the garment MUST be in ultra-sharp 8k focus.
- Apply a realistic depth of field (Bokeh effect / background blur) to the background to make the user and the garment visually pop. 

STRICT ANATOMY AND POSE RULES:
1. KEEP the exact original pose of the person in <IMAGE_1>.
2. DO NOT add objects. The person MUST NOT be holding a phone or camera.
3. DO NOT generate extra limbs, hands, or arms. Keep the original hands exactly where they are.

Reference these anatomical coordinates ONLY to understand body scale: ${JSON.stringify(jsonUsuario)}.
Output MUST be a highly realistic professional photograph.`;
        
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
