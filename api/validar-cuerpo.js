import { GoogleGenerativeAI } from "@google/generative-ai";

export default async function handler(req, res) {
    // 1. Configuración de cabeceras CORS
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

        // 2. CONFIGURACIÓN GEMINI
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite" });

        const safetySettings = [
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
        ];

        // 3. PROMPT OPTIMIZADO: VISIBILIDAD DEL 70% Y MAPEADO ANATÓMICO
        const promptValidacion = `Task: Human Figure Detection, Body Visibility, and Anatomical Coordinate Mapping.

        Analyze the image and evaluate the human subject for virtual try-on suitability.

        [BODY VISIBILITY RULE]:
        - Visually estimate if at least 70% of the user's body is visible in the frame (e.g., from the head/shoulders down to the mid-thighs or knees).
        - If the user is too close to the camera and less than 70% of their body is visible, set "is_body_visible" to false and provide a polite reason in Spanish in "rejection_reason" (e.g., "Por favor, da un paso atrás para que la cámara pueda captar mejor tu cuerpo.").
        - If at least 70% of the body is visible, set "is_body_visible" to true and "rejection_reason" to null.
        - Note: Age is not a restriction. Children are allowed.

        [ANATOMICAL MANNEQUIN DESIGN ("MUÑECO")]:
        - Treat the user's body as a joints-based articulation mannequin. Locate the precise normalized integer coordinates (from 0 to 1000) for these vital skeletal anchor points:
          1. "neck_base": lowest point of the neck where it connects to the shoulders.
          2. "left_shoulder" / "right_shoulder": outer joints of the shoulders.
          3. "left_wrist" / "right_wrist": wrist joints (set to null if obscured or cut off).
          4. "waist_line": center boundary of the hip alignment.

        Return strictly a JSON object following this model, where values are normalized integers [ymin, xmin, ymax, xmax] or [y, x]:
        {
          "is_body_visible": true,
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

        // 4. Ejecución
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

        if (!candidate || candidate.finishReason === "SAFETY") {
            return res.status(200).json({ 
                success: false, 
                is_body_visible: false, 
                rejection_reason: "La imagen no pudo ser procesada por los filtros de seguridad de la cámara." 
            });
        }

        const textResponse = response.text().trim();
        const userData = JSON.parse(textResponse);

        // Validar que el usuario esté a la distancia correcta (70% visible)
        if (!userData.is_body_visible) {
            return res.status(200).json({
                success: false,
                is_body_visible: false,
                rejection_reason: userData.rejection_reason || "Por favor, aléjate un poco para que el espejo capte la mayor parte de tu cuerpo."
            });
        }

        // Si el encuadre geométrico falló por algún otro motivo
        if (!userData.box_2d || userData.box_2d.length !== 4) {
            return res.status(200).json({
                success: false,
                detalle: "No se detectó un plano corporal claro. Intenta pararte justo frente a la marca del piso."
            });
        }

        // Retornamos el paquete exitoso al frontend
        return res.status(200).json({ 
            success: true,
            is_body_visible: true,
            coordenadas_cuerpo: userData.box_2d,
            anclajes_articulaciones: userData.user_anchors
        });

    } catch (err) {
        console.error("VALIDAR ERROR:", err.message);
        res.status(500).json({ 
            success: false, 
            isError: true, 
            detalle: "Fallo técnico al escanear tu postura en el espejo." 
        });
    }
}
