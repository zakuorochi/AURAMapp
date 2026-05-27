import { GoogleGenerativeAI } from "@google/generative-ai";

export default async function handler(req, res) {
    // 1. Configuración de cabeceras CORS para permitir la conexión desde la App
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Atender solicitudes pre-flight
    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        const { image } = body;

        if (!image) {
            return res.status(400).json({ isError: true, detalle: "No se recibió ninguna imagen para procesar." });
        }

        // Limpiar cabeceras o prefijos base64 si los hay
        const cleanBase64 = image.replace(/^data:image\/\w+;base64,/, "");

        // 2. Inicializar Gemini usando la clave segura de entorno
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        
        // Usamos el modelo especializado en edición/procesamiento visual (Image-to-Image)
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-image" });

        // 3. PROMPT ULTRA-ESPECÍFICO PARA EXTRACCIÓN GHOST MANNEQUIN COMPLETA
    const prompt = `
       [TASK TYPE]: Strict Image Segmentation & Alpha-Masking (Chroma-Key). No generative drawing.

[OBJECTIVE]: Extract the ENTIRE clothing outfit (both top garments like jackets, shirts, hoodies, polos, coats, 3D and 2D, AND bottom garments like pants, jeans, skirts, shorts, 3D or 2D) as a single connected hollow 3D shell. Completely erase the 3D or 2D person wearing them and the background; in the case of a 2D image, a conversion to 3D will be performed considering the visual characteristics of the garment.

[STRICT HUMAN BODY ERADICATION RULES]:

Identify and set all pixels containing human skin, flesh, or anatomy to 100% transparent alpha (rgba 0,0,0,0).

Cleanly remove: Head, face, hair, ears, neck, throat, collarbones.

Cleanly remove: Bare arms, elbows, forearms, wrists, hands, and fingers.

Cleanly remove: Bare legs, ankles, feet, and toes.

CRITICAL: If a hand, wrist, or neck overlaps or touches the garment, surgically crop and mask out the skin pixels. Do NOT allow skin-color or skin-texture bleed into the clothing boundary.

[HOLLOW GHOST MANNEQUIN SHELL SPECIFICATIONS]:

For openings where anatomy emerged (necklines, sleeve cuffs, pant cuffs):

Clean out the skin inside the hole.

Leave the opening hollow, open, and empty as a 3D shell of clothing worn by an invisible phantom.

Keep the inner back collar fabric if visible, but do not hallucinate or redraw fabric where it does not exist.

[PRESERVATION AND ORIGINALITY CONSTRAINTS]:

Preserve 100% of the original clothing design: Keep original textures, seams, zippers, logos, fabric folds, shadows, and natural creases.

FORBIDDEN: Do NOT smooth, simplify, or flatten the image. Do NOT alter colors or patterns.

FORBIDDEN: Do NOT drop, ignore, or separate the lower garments (pants/jeans/skirts). Keep both top and bottom fully connected.

[OUTPUT FORMAT]:
Return ONLY the final hollow clothing outfit shell on a perfectly solid transparent background. No text, no background plates, no borders.
        `;

        const parts = [
            { text: prompt },
            { inlineData: { data: cleanBase64, mimeType: "image/jpeg" } }
        ];

        // 4. Ejecución del modelo con baja temperatura para evitar improvisaciones creativas
        const result = await model.generateContent({
            contents: [{ role: "user", parts }],
            generationConfig: {
                responseModalities: ["IMAGE"],
                temperature: 0.0
            }
        });

        const response = await result.response;
        const imagePart = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);

        if (imagePart && imagePart.inlineData) {
            // Devolvemos el PNG recortado quirúrgicamente en su transparencia nativa
            return res.status(200).json({ 
                success: true, 
                imagenSinFondo: imagePart.inlineData.data 
            });
        } else {
            throw new Error("La IA no pudo segmentar correctamente el conjunto de prendas.");
        }

    } catch (err) {
        console.error("BORRAR FONDO ERROR:", err.message);
        res.status(500).json({ 
            isError: true, 
            detalle: err.message 
        });
    }
}
