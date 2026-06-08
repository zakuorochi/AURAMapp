import { GoogleGenerativeAI } from "@google/generative-ai";

export default async function handler(req, res) {
    // 1. Configuración de cabeceras CORS (Intacto)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        const { image } = body;

        if (!image) {
            return res.status(400).json({ isError: true, detalle: "No se recibió imagen para validar." });
        }

        // 2. CONFIGURACIÓN GEMINI (Mantenemos Flash Lite y tus Safety Settings permisivos)
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite" });

        const safetySettings = [
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
        ];

        // 3. PROMPT OPTIMIZADO: DETECCIÓN DE MENORES Y MAPEO DE ANCLAJES (CONCEPTO MUÑECO)
        const promptValidacion = `Task: Human Figure Detection, Child Protection, and Anatomical Coordinate Mapping.

        Analyze the image and evaluate the human subject for virtual try-on suitability.

        [CRITICAL CHILD PROTECTION RULE]:
        - Visually estimate the age range of the human subject. 
        - If the subject is clearly a baby, toddler, child, or under 18 years old, set "is_adult_user" to false and provide a polite reason in Spanish in "rejection_reason".
        - If the subject is clearly an adult or young adult, set "is_adult_user" to true and "rejection_reason" to null.

        [ANATOMICAL MANNEQUIN DESIGN ("MUÑECO")]:
        - Treat the user's body as an joints-based articulation mannequin. Locate the precise normalized integer coordinates (from 0 to 1000) for these vital skeletal anchor points:
          1. "neck_base": lowest point of the neck where it connects to the shoulders.
          2. "left_shoulder" / "right_shoulder": outer joints of the shoulders.
          3. "left_wrist" / "right_wrist": wrist joints (set to null if obscured or cut off).
          4. "waist_line": center boundary of the hip alignment.

        Return strictly a JSON object following this model, where values are normalized integers [ymin, xmin, ymax, xmax] or [y, x]:
        {
          "is_adult_user": true,
          "rejection_reason": null,
          "box_2d": [ymin, xmin, ymax, xmax],
          "user_anchors": {
            "neck_base": [y, x],
            "left_shoulder": [y, x],
            "right_shoulder": [y, x],
            "left_wrist": [y, x],
            "right_wrist": [y, x],
            "waist_line": [y, x]
          }
        }

        Do not return any conversational text, markdown formatting, or explanations. Only the strict JSON object.`;

        const cleanImage = image.replace(/^data:image\/\w+;base64,/, "");

        // 4. Ejecución estructurada en JSON
        const result = await model.generateContent({
            contents: [{
                role: 'user',
                parts: [
                    { text: promptValidacion },
                    { inlineData: { mimeType: 'image/jpeg', data: cleanImage } }
                ]
            }],
            generationConfig: {
                responseMimeType: "application/json",
                temperature: 0.0
            },
          serviceTier: "flex",
            safetySettings
            
        });

        const response = await result.response;
        const candidate = response.candidates?.[0];

        // Ajuste en el puente de seguridad: Si la IA bloquea nativamente, rechazamos por precaución
        if (!candidate || candidate.finishReason === "SAFETY") {
            return res.status(200).json({ 
                success: false, 
                is_adult_user: false, 
                rejection_reason: "La imagen no pudo ser procesada por los filtros globales de privacidad corporativa." 
            });
        }

        const textResponse = response.text().trim();
        const userData = JSON.parse(textResponse);

        // Validar el flag ético de menores de edad
        if (!userData.is_adult_user) {
            return res.status(200).json({
                success: false,
                is_adult_user: false,
                rejection_reason: userData.rejection_reason || "Acceso restringido: Perfil de usuario menor de edad."
            });
        }

        // Si es adulto pero el encuadre geométrico falló
        if (!userData.box_2d || userData.box_2d.length !== 4) {
            return res.status(200).json({
                success: false,
                detalle: "No se detectó un plano corporal apto (torso y extremidades visibles) para realizar la costura digital."
            });
        }

        // Retornamos el paquete liso al dispositivo móvil
        return res.status(200).json({ 
            success: true,
            is_adult_user: true,
            coordenadas_cuerpo: userData.box_2d,
            anclajes_articulaciones: userData.user_anchors
        });

    } catch (err) {
        console.error("VALIDAR ERROR:", err.message);
        res.status(500).json({ 
            success: false, 
            isError: true, 
            detalle: "Fallo técnico en el controlador de anatomía de Auram." 
        });
    }
}
