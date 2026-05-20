import { GoogleGenerativeAI } from "@google/generative-ai";

export default async function handler(req, res) {
    // 1. Configuración de cabeceras CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    // Valores por defecto (Sistema de Rescate) en caso de que todo falle
    let category = "Prenda";
    let color = "Multicolor";
    let suggestedCode = "B001";

    try {
        const { image } = req.body;
        if (!image) throw new Error("No se recibieron datos de imagen en el Paso 2.");

        // Limpieza de cualquier cabecera Base64 residual antes de enviar a Gemini
        const cleanBase64 = image.replace(/^data:image\/\w+;base64,/, "");

        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        // Usamos el modelo ultra-veloz gemini-2.0-flash
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-image" });

        const prompt = `
            Task: Analyze the provided transparent garment image for catalog classification.
            
            Instructions:
            1. Look closely at the clothing item.
            2. Identify its category (e.g., Blazer, Camisa, Jeans, Vestido, Casaca, Chompa).
            3. Identify its dominant color in Spanish.
            4. Generate a unique sequential product code starting with B (e.g., B001, B002).

            Return STRICTLY a JSON block with this structure:
            {
              "category": "category_name",
              "color": "main_color",
              "suggestedCode": "B00X"
            }
        `;

        const result = await model.generateContent({
            contents: [{
                role: "user",
                parts: [
                    { text: prompt },
                    { inlineData: { mimeType: "image/png", data: cleanBase64 } }
                ]
            }],
            generationConfig: {
                responseMimeType: "application/json",
                temperature: 0.1
            }
        });

        const response = await result.response;
        const textResponse = response.text();

        // Limpieza quirúrgica de bloques de código Markdown del JSON
        const jsonString = textResponse.replace(/```json|```/gi, '').trim();

        try {
            const dataIA = JSON.parse(jsonString);
            category = dataIA.category || category;
            color = dataIA.color || color;
            suggestedCode = dataIA.suggestedCode || suggestedCode;
        } catch (parseErr) {
            console.warn("Fallo al parsear JSON de Gemini. Extrayendo por expresión regular...");
            
            // Intento de extracción por Regex si el JSON viene con detalles menores de formato
            const catMatch = jsonString.match(/"category"\s*:\s*"([^"]+)"/i);
            if (catMatch) category = catMatch[1];

            const colMatch = jsonString.match(/"color"\s*:\s*"([^"]+)"/i);
            if (colMatch) color = colMatch[1];

            const codeMatch = jsonString.match(/"suggestedCode"\s*:\s*"([^"]+)"/i);
            if (codeMatch) suggestedCode = codeMatch[1];
        }

        // Devolución exitosa con datos estructurados
        return res.status(200).json({ 
            success: true, 
            category,
            color,
            suggestedCode
        });

    } catch (err) {
        console.error("METADATA RECOVERY SERVICE:", err.message);
        
        // El seguro de vida de AURAM: Si el API de Google cae o supera cuotas, 
        // devolvemos un estado exitoso con datos de emergencia en lugar de un error 500.
        return res.status(200).json({ 
            success: true, 
            category: "Prenda de Boutique",
            color: "Estilo Único",
            suggestedCode: "B001",
            note: "Modo de recuperación activado automáticamente."
        });
    }
}
