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
            return res.status(400).json({ isError: true, detalle: "No se recibió ninguna imagen para procesar." });
        }

        const cleanBase64 = image.replace(/^data:image\/\w+;base64,/, "");

        // 2. Inicializar Gemini (Usamos Flash Lite: el más rápido y económico para texto estructurado)
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });

        // 3. PROMPT DE RECONOCIMIENTO GEOMÉTRICO DE LA PRENDA
        const prompt = `Task: Object Detection and Accurate Bounding Box Coordinates.

        Analyze the image and locate the clothing outfit (this includes all visible garments such as shirts, jackets, pants, skirts, or full outfits worn by the person).
        Identify the single boundary box that encapsulates the entire clothing outfit.

        Return strictly a JSON object following this model, where values are normalized integers from 0 to 1000 representing [ymin, xmin, ymax, xmax]:
        {
          "box_2d": [ymin, xmin, ymax, xmax]
        }

        Do not return any conversational text, markdowns, or explanations. Only the strict JSON object.`;

        const parts = [
            { text: prompt },
            { inlineData: { data: cleanBase64, mimeType: "image/jpeg" } }
        ];

        // 4. Ejecución en modalidad Texto JSON estructurado (Gasto de tokens insignificante: ~$0.00009 USD)
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
        if (!coordsData.box_2d || coordsData.box_2d.length !== 4) {
            throw new Error("La IA no detectó una prenda de vestir clara en la fotografía.");
        }

        // Devolvemos las coordenadas al cliente para que realice el recorte gratis
        return res.status(200).json({ 
            success: true, 
            coordenadas: coordsData.box_2d
        });

    } catch (err) {
        console.error("BORRAR FONDO ERROR:", err.message);
        res.status(500).json({ 
            isError: true, 
            detalle: err.message 
        });
    }
}
