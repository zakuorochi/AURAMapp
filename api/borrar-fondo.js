import { GoogleGenerativeAI } from "@google/generative-ai";

export default async function handler(req, res) {
    const { image } = req.body; // Imagen en Base64 desde el Capturador

    try {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-image" });

        const prompt = `
            Task: Background Removal and Garment Extraction.
            1. Identify the main clothing item located at the center of the image.
            2. Remove everything that is NOT the garment (background, floor, hangers, hands).
            3. Return the garment perfectly cropped with a transparent background.
            4. Output format: Return ONLY the final image as a base64 string.
        `;

        const parts = [
            { text: prompt },
            { inlineData: { data: image.replace(/^data:image\/\w+;base64,/, ""), mimeType: "image/jpeg" } }
        ];

        const result = await model.generateContent({
            contents: [{ role: "user", parts }],
            generationConfig: {
                responseModalities: ["IMAGE"], // Pedimos que la IA nos devuelva la imagen procesada
                temperature: 0.1
            }
        });

        const response = await result.response;
        const imagePart = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);

        if (imagePart) {
            res.status(200).json({ 
                success: true, 
                imagenSinFondo: imagePart.inlineData.data 
            });
        } else {
            throw new Error("La IA no pudo segmentar la prenda.");
        }

    } catch (err) {
        res.status(500).json({ isError: true, detalle: err.message });
    }
}
