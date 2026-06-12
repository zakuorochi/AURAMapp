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
        const promptCostura = `TASK: Expert Virtual Try-On and Concept-to-Reality Rendering. 
You must realistically equip or dress the person in <IMAGE_1> using the EXACT design from <IMAGE_0>.

STRICT POSE & ANATOMY LOCK (CRITICAL):
- POSE OVERRIDE: You MUST perfectly KEEP the exact original pose, posture, and body angle of the person in <IMAGE_1>.
- IGNORE THE POSE IN <IMAGE_0>: The image <IMAGE_0> is STRICTLY for extracting the garment's design, materials, and colors. DO NOT copy, blend, or adopt the orientation, shape, or posture of the clothing/model from <IMAGE_0>.
- DO NOT add objects (phones, cameras). Keep original hands exactly where they are without adding extra limbs.

FACIAL IDENTITY LOCK (CRITICAL):
- The user's face, facial expression, hair, and skin tone MUST remain 100% IDENTICAL to <IMAGE_1>. 
- Zero facial modifications are allowed. DO NOT redraw or beautify the face.

STRICT DESIGN & COLOR PRESERVATION (ZERO HALLUCINATION):
- COLOR LOCK: You MUST extract and use the EXACT color palette from <IMAGE_0>. Maintain original colors strictly.
- REAL GARMENTS (1:1 FIDELITY): Perfectly replicate the exact fabric, stitching, logos, and proportions from <IMAGE_0>.
- ARMOR & SKETCHES: Preserve the intricate details and original shapes without inventing new geometry.

ADAPTIVE MATERIAL & RENDERING RULES:
- SOFT FABRIC: Render as physical fabric with 3D volume, natural drape, and wrinkles wrapping the user's specific pose in <IMAGE_1>.
- RIGID/HARD SURFACE: Articulate and attach plates biomechanically to fit the user's 3D anatomy.
- 2D SKETCH/ANIME: Translate into photorealistic physical materials preserving exact colors and shapes.

PHOTOGRAPHY & "WOW" FACTOR:
- Apply a professional cinematic portrait photography style.
- The user and the garment MUST be in ultra-sharp 8k focus.
- Apply a realistic depth of field (Bokeh effect / background blur) to the background to make the subject pop.

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
