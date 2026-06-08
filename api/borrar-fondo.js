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
            return res.status(400).json({ isError: true, detalle: "No se recibió ninguna imagen para procesar." });
        }

        const cleanBase64 = image.replace(/^data:image\/\w+;base64,/, "");

        // 2. Inicializar Gemini (Intacto)
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite" });

        // 3. PROMPT ACTUALIZADO: RECONOCIMIENTO, POLÍTICAS (LENCERÍA) Y EFECTO STICKER ANATÓMICO
        const prompt = `Task: Object Detection, Content Moderation, and Anatomical Anchor Mapping for Retail Garments.

        Analyze the image and focus strictly on the clothing outfit located at the central axis of the image.
        
        [CRITICAL CONTENT MODERATION RULE]:
        - Evaluate if the garment is swimwear, lingerie, underwear, or if it covers less than 30% of a standard human body. 
        - If it falls into any of these forbidden categories, set "is_safe_garment" to false and provide a brief friendly reason in Spanish within "rejection_reason".
        - If it is regular, safe retail clothing (shirts, jackets, coats, t-shirts, hoodies, pants, skirts, dresses, costumes, or sketches), set "is_safe_garment" to true and "rejection_reason" to null.

        [BOUNDING BOX AND ANCHOR MAPPING]:
        - Identify the single boundary box that encapsulates the entire clothing outfit.
        - Treat the garment like an anatomical "sticker" that will be placed onto another person. Locate the precise normalized integer coordinates (from 0 to 1000) for key textile flow boundaries:
          1. "neckline": where the neck hole sits.
          2. "left_sleeve_cuff" / "right_sleeve_cuff": the wrist or shoulder sleeve endings (set to null if the garment is a bottom-only piece like pants/skirts).
          3. "bottom_hem": the lowest edge or waist/ankle ending of the garment.

        Return strictly a JSON object following this model, where coordinates are normalized integers [ymin, xmin, ymax, xmax] or [y, x]:
        {
          "is_safe_garment": true,
          "rejection_reason": null,
          "box_2d": [ymin, xmin, ymax, xmax],
          "garment_anchors": {
            "neckline": [y, x],
            "left_sleeve_cuff": [y, x],
            "right_sleeve_cuff": [y, x],
            "bottom_hem": [y, x]
          }
        }

        Do not return any conversational text, markdown formatting, or explanations. Only the strict JSON object.`;

        const parts = [
            { text: prompt },
            { inlineData: { data: cleanBase64, mimeType: "image/jpeg" } }
        ];

        // 4. Ejecución en modalidad Texto JSON estructurado (Intacto)
        const result = await model.generateContent({
            contents: [{ role: "user", parts }],
            generationConfig: {
                responseMimeType: "application/json",
                temperature: 0.0
            }
            
        });

        const response = await result.response;
        const responseText = response.text().trim();
        
        // Parsear las coordenadas devueltas por la IA de forma segura
        const coordsData = JSON.parse(responseText);
        
        // MODIFICACIÓN CORREGIDA: Validar la nueva estructura extendida del JSON
        if (coordsData.is_safe_garment === undefined) {
            throw new Error("La IA no pudo procesar la estructura de seguridad de la prenda.");
        }

        // MODIFICACIÓN CORREGIDA: Si la prenda es lencería/bañador, enviar el bloqueo controlado de inmediato
        if (!coordsData.is_safe_garment) {
            return res.status(200).json({
                success: false,
                is_safe_garment: false,
                rejection_reason: coordsData.rejection_reason || "Prenda restringida por las políticas de seguridad."
            });
        }

        // Si es segura pero fallaron las cajas geométricas, lanzar error estándar
        if (!coordsData.box_2d || coordsData.box_2d.length !== 4) {
            throw new Error("La IA no detectó una prenda de vestir clara en la fotografía.");
        }

        // MODIFICACIÓN CORREGIDA: Devolvemos el paquete completo estructurado al celular (coordenadas + anclajes + flag de seguridad)
        return res.status(200).json({ 
            success: true,
            is_safe_garment: true,
            coordenadas: coordsData.box_2d,
            anclajes: coordsData.garment_anchors || null
        });

    } catch (err) {
        // Manejo de errores (Intacto)
        console.error("BORRAR FONDO ERROR:", err.message);
        res.status(500).json({ 
            isError: true, 
            detalle: err.message 
        });
    }
}
