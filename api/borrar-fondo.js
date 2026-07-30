import { GoogleGenerativeAI } from "@google/generative-ai";

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

        // 1. Recibimos la imagen (desde el Drive local) y el código extraído del nombre del archivo
        const { image, codigoPrenda } = body;

        if (!image) {
            return res.status(400).json({ isError: true, detalle: "Falta la imagen de la prenda." });
        }
        
        // Si por algún motivo no llega el código, asignamos uno genérico de seguridad
        const codigoActual = codigoPrenda || "DEFAULT-001";

        const cleanBase64 = image.replace(/^data:image\/\w+;base64,/, "");
        
        // 2. Instanciamos Gemini (Mantenemos Flash Lite que es rapidísimo para el Kiosco)
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite" });

        // 3. Prompt simplificado: Solo nos interesa aislar la prenda y obtener sus coordenadas
        const prompt = `Task: Outfit Segmentation and Coordinate Detection.
        Analyze the clothing outfit in the image.

        [GARMENT DETECTION (MAX 3 ITEMS)]:
        - Identify ONLY the 3 largest clothing items (by surface area).
        - For each, provide the exact 2D bounding box [ymin, xmin, ymax, xmax] as integers from 0 to 1000.
        - Name them: "jacket", "shirt", "pants", etc.
        - Ignore small accessories, hats, or belts.

        Return strictly a JSON object:
        {
          "detected_garments": [
            { "name": "jacket", "box_2d": [ymin, xmin, ymax, xmax] }
          ]
        }
        Do not return any conversational text.`;

        // 4. Ejecución
        const result = await model.generateContent({
            contents: [{ role: "user", parts: [{ text: prompt }, { inlineData: { data: cleanBase64, mimeType: "image/jpeg" } }] }],
            generationConfig: { responseMimeType: "application/json", temperature: 0.0 },
            serviceTier: "flex"
        });

        const responseText = (await result.response).text().trim();
        const data = JSON.parse(responseText);

        // 5. Devolvemos las coordenadas al Frontend (para que el Canvas recorte) 
        // y mantenemos el código de la prenda en la respuesta.
        return res.status(200).json({ 
            success: true, 
            codigoPrenda: codigoActual,
            detected_garments: data.detected_garments
        });

    } catch (err) {
        console.error("BORRAR FONDO ERROR:", err.message);
        res.status(500).json({ isError: true, detalle: "Fallo en servidor IA: " + err.message });
    }
}
