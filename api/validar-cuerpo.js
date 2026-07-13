import { GoogleGenerativeAI } from "@google/generative-ai";

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        const { image } = body;

        if (!image) return res.status(400).json({ success: false, detalle: "Sin imagen." });

        const cleanBase64 = image.replace(/^data:image\/\w+;base64,/, "");

        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite" });

        // PROMPT OPTIMIZADO: Solo validación de seguridad y calidad de pose
        const prompt = `Task: User validation and pose quality assessment for virtual try-on.
        
        Rules:
        1. "is_adult_user": Set false if the subject is under 18. Set true otherwise.
        2. "is_valid_pose": Set false if the pose is complex (e.g., crossed arms, turned away, partially obscured, or non-frontal). Set true only for clear, frontal, standing poses where limbs are visible and not crossing the torso.
        3. "rejection_reason": A short Spanish reason if any rule is false. Else null.
        
        Return STRICTLY JSON:
        {
          "is_adult_user": boolean,
          "is_valid_pose": boolean,
          "rejection_reason": string | null
        }`;

        const result = await model.generateContent({
            contents: [{ 
                role: 'user', 
                parts: [{ text: prompt }, { inlineData: { mimeType: 'image/jpeg', data: cleanBase64 } }] 
            }],
            generationConfig: { responseMimeType: "application/json", temperature: 0.0 }
        });

        const validation = JSON.parse(result.response.text());

        // Respuesta limpia: Si no es adulto o la pose es mala, rechazamos
        if (!validation.is_adult_user || !validation.is_valid_pose) {
            return res.status(200).json({
                success: false,
                rejection_reason: validation.rejection_reason || "Pose no apta para el vestidor virtual. Mantente de frente y sin cruzar los brazos."
            });
        }

        return res.status(200).json({ success: true });

    } catch (err) {
        console.error("VALIDAR ERROR:", err.message);
        res.status(500).json({ success: false, detalle: "Fallo en el controlador de anatomía." });
    }
}
