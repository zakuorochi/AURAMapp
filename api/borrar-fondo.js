import { GoogleGenerativeAI } from "@google/generative-ai";
import { createCanvas, loadImage } from "canvas"; // Canvas nativo para Node.js (ideal para Vercel)

export default async function handler(req, res) {
    // 1. Configuración de cabeceras CORS para la conexión desde la App
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

        // 2. Inicializar Gemini (Usamos Flash Lite: el más rápido y económico para procesamiento de texto JSON)
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });

        // 3. PROMPT SURGICAL DETECTOR (BOUNDING BOXES)
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

        // 4. Ejecución en modalidad Texto JSON estructurado (Gasto mínimo de tokens)
        const result = await model.generateContent({
            contents: [{ role: "user", parts }],
            generationConfig: {
                responseMimeType: "application/json",
                temperature: 0.0
            }
        });

        const response = await result.response;
        const responseText = response.text().trim();
        
        // Parsear las coordenadas devueltas por la IA
        const coordsData = JSON.parse(responseText);
        if (!coordsData.box_2d || coordsData.box_2d.length !== 4) {
            throw new Error("La IA no devolvió coordenadas válidas para la prenda.");
        }

        // [ymin, xmin, ymax, xmax] en escala de 0 a 1000
        const [ymin, xmin, ymax, xmax] = coordsData.box_2d;

        // 5. RECORTE QUIRÚRGICO GRATUITO EN TU SERVIDOR (Ahorrando 99% de procesamiento)
        // Cargamos la imagen original en memoria de Node.js usando un Canvas virtual
        const imgBuffer = Buffer.from(cleanBase64, 'base64');
        const originalImage = await loadImage(imgBuffer);

        const imgWidth = originalImage.width;
        const imgHeight = originalImage.height;

        // Convertir las coordenadas normalizadas de Gemini (0-1000) a píxeles reales de tu foto
        const xReal = Math.floor((xmin / 1000) * imgWidth);
        const yReal = Math.floor((ymin / 1000) * imgHeight);
        const wReal = Math.floor(((xmax - xmin) / 1000) * imgWidth);
        const hReal = Math.floor(((ymax - ymin) / 1000) * imgHeight);

        // Crear un lienzo con el tamaño exacto del recorte detectado
        const cropCanvas = createCanvas(wReal, hReal);
        const ctx = cropCanvas.getContext('2d');

        // Dibujar el fragmento de la imagen original en el nuevo lienzo transparente
        ctx.drawImage(
            originalImage,
            xReal, yReal, wReal, hReal, // Coordenadas origen (Foto original)
            0, 0, wReal, hReal          // Coordenadas destino (Foto recortada)
        );

        // Convertir el lienzo transparente recortado de vuelta a Base64 PNG nativo
        const croppedBase64 = cropCanvas.toBuffer('image/png').toString('base64');

        // 6. RESPUESTA AL CLIENTE CON EL RECORTE OPTIMIZADO
        return res.status(200).json({ 
            success: true, 
            imagenSinFondo: croppedBase64,
            debug: {
                coordenadas_detectadas: [ymin, xmin, ymax, xmax],
                dimensiones_recorte: { ancho: wReal, alto: hReal }
            }
        });

    } catch (err) {
        console.error("BORRAR FONDO ERROR:", err.message);
        res.status(500).json({ 
            isError: true, 
            detalle: err.message 
        });
    }
}
