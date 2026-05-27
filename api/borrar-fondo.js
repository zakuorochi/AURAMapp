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
    const prompt =`
       [TASK TYPE]: Strict Image Segmentation & Alpha-Masking (Chroma-Key). No redundant generative drawing, except for 3D volume interpretation in 2D images and sketches.

[OBJECTIVE]: Extract the ENTIRE clothing outfit (both top garments like jackets, shirts, hoodies, polos, coats 3D, 2D, or sketches, AND bottom garments like pants, jeans, skirts, shorts 3D, 2D, or sketches) as a single connected hollow 3D shell. Completely erase the 3D person or 2D character wearing them and the background.

[DYNAMIC DIMENSIONAL CONVERSION RULES]:
- **Case A: Input is a Real 3D Photo**: Maintain absolute fidelity to the original pixels of the garment. Do NOT alter lighting, creases, or shadows.
- **Case B: Input is a 2D Image (Anime, Cosplay, Illustration)**: Translate the flat visual characteristics of the garment into realistic 3D volume.
  1. Completely dissolve and eliminate all black outline lines or ink strokes (lineart).
  2. Translate flat colors into three-dimensional gradients with coherent light and shadow.
  3. Add depth, realistic fabric drape, folds, and occlusion shadows according to the shape of the garment.
- **Case C: Input is a Sketch or Pencil Drawing**: Interpret lines and hatching as physical folds of real 3D fabric.
  1. Generate a solid three-dimensional structure with a plausible textile texture (cotton, wool, silk, denim) based on the stroke style.
  2. Render the garment in full color based on the information or context of the sketch, applying coherent ambient lights and shadows.

[STRICT HUMAN BODY OR CHARACTER ERADICATION RULES]:
- Identify and set all pixels containing skin, flesh, hair, or anatomy (from real 3D people or 2D illustrated characters) to 100% transparent alpha (rgba 0,0,0,0).
- Cleanly remove: Head, face, hair, ears, neck, throat, collarbones.
- Cleanly remove: Bare arms, elbows, forearms, wrists, hands, and fingers.
- Cleanly remove: Bare legs, ankles, feet, and toes.
- CRITICAL: If a hand, wrist, or neck overlaps or touches the garment, surgically crop and mask out the skin or skin-drawing pixels. Do NOT allow skin-color or skin-texture bleed into the clothing boundary.

[HOLLOW GHOST MANNEQUIN SHELL SPECIFICATIONS]:
- For openings where anatomy emerged (necklines, sleeve cuffs, pant cuffs):
  1. Clean out the skin inside the hole.
  2. Leave the opening hollow, open, and empty as a 3D shell of clothing worn by an invisible phantom.
  3. Keep the inner back collar fabric if visible, but do not hallucinate or redraw fabric where it does not exist.

[PRESERVATION AND ORIGINALITY CONSTRAINTS]:
- Preserve 100% of the original design and cut of the clothing: Keep original seams, logos, physical shapes, and overall proportions of the garments.
- **Volume Exception for 2D/Sketches**: In 2D images and sketches, it is FORBIDDEN to simplify or flatten the image; physical depth and photorealistic lighting must be added to force the transition to 3D while maintaining the original color pattern. In real 3D photos, it is FORBIDDEN to alter colors, patterns, or smooth the image.
- FORBIDDEN to drop, ignore, or separate the lower garments (pants/jeans/skirts). Keep both top and bottom fully connected into a single outfit.

[OUTPUT FORMAT]: Return ONLY the final hollow clothing outfit shell on a perfectly solid transparent background. No text, no background plates, no borders.
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
