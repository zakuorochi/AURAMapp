import { GoogleGenerativeAI } from "@google/generative-ai";

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const { image } = req.body;
        if (!image) throw new Error("No se recibió la imagen procesada.");

        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        // Usamos la versión de alta fidelidad para el acabado final
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-image" });

        const prompt = `
            Task: Professional Catalog Finish (Ghost Mannequin Effect).
            
            1. Take the provided garment image and perform a deep edge cleaning.
            2. Ensure the background is 100% transparent.
            3. RECONSTRUCTION: Refine the neck, sleeves, and waist openings to look perfectly hollow (Ghost Mannequin effect). 
            4. Remove any remaining shadows or artifacts from the original photo.
            5. Analysis: Identify the type of garment (shirt, pants, etc.) and its primary color.
            
            Return a JSON with:
            {
              "finalImage": "base64_data",
              "category": "category_name",
              "color": "main_color",
              "suggestedCode": "A00X"
            }
        `;

        const result = await model.generateContent({
            contents: [{
                role: "user",
                parts: [
                    { text: prompt },
                    { inlineData: { mimeType: "image/png", data: image } }
                ]
            }],
            generationConfig: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: "OBJECT",
                    properties: {
                        finalImage: { type: "STRING" },
                        category: { type: "STRING" },
                        color: { type: "STRING" },
                        suggestedCode: { type: "STRING" }
                    }
                }
            }
        });

        const response = await result.response;
        const data = JSON.parse(response.text());

        res.status(200).json({ 
            success: true, 
            ...data 
        });

    } catch (err) {
        console.error("CATALOG ERROR:", err.message);
        res.status(500).json({ isError: true, detalle: err.message });
    }
}
