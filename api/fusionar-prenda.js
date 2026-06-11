import fetch from 'node-fetch'; // Vercel lo incluye nativamente en Node.js

export default async function handler(req, res) {
    // 1. Configurar cabeceras CORS para que tu index.html se comunique sin bloqueos
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: "Método no permitido. Usa POST." });
    }

    try {
        const { fotoPrendaBase64, fotoUsuarioBase64, coordenadasJson } = req.body;

        // Validación de seguridad para que el backend no procese basura
        if (!fotoPrendaBase64 || !fotoUsuarioBase64) {
            throw new Error("Faltan las imágenes base64 en la petición.");
        }

        // 2. Preparar el prompt ultra enfocado en la costura textil por coordenadas
        const promptCostura = `Eres AURAM, un sistema de costura digital por IA para retail de moda en Lima. 
        Debes fusionar de forma fotorrealista la prenda de vestir de la Foto 1 en el cuerpo de la persona de la Foto 2.
        Usa estos puntos de anclaje anatómicos del cuerpo para encajar la prenda perfectamente: ${JSON.stringify(coordenadasJson)}.
        Conserva el diseño, texturas, costuras y color exacto de la prenda. Mantén el fondo y la iluminación ambiental intactos.`;

        // 3. Petición directa al endpoint oficial de xAI (Grok Imagine)
        const responseXAI = await fetch("https://api.x.ai/v1/images/edits", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${process.env.XAI_API_KEY}` // Jala la llave de Vercel
            },
            body: JSON.stringify({
                model: "grok-imagine-image",  // Tu modelo económico de $0.022 USD
                prompt: promptCostura,
                // xAI requiere un arreglo estructurado en JSON para la multientrada de imágenes
                images: [
                    { type: "base64", data: fotoPrendaBase64, label: "Foto 1: Prenda" },
                    { type: "base64", data: fotoUsuarioBase64, label: "Foto 2: Usuario" }
                ],
                n: 1,
                resolution: "1k",            // Forzamos 1024px para amarrar el costo bajo
                response_format: "b64_json"  // Le pedimos que nos devuelva Base64 directo para el Canvas
            })
        });

        // 4. Procesar la respuesta del servidor de xAI
        const dataXAI = await responseXAI.json();

        if (!responseXAI.ok) {
            console.error("Detalle error xAI:", dataXAI);
            throw new Error(dataXAI.error?.message || "Error interno en el motor de Grok Imagine.");
        }

        // Extraemos la cadena base64 limpia que nos devuelve Grok
        const imagenFusionadaBase64 = dataXAI.data[0].b64_json;

        // 5. Enviar el resultado de vuelta a tu index.html
        // Mantenemos el formato exacto que tu frontend ya sabe leer y pintar en pantalla
        return res.status(200).json({ 
            success: true, 
            resultado: `data:image/jpeg;base64,${imagenFusionadaBase64}` 
        });

    } catch (err) {
        console.error("[ERROR EN BACKEND AURAM-GROK]:", err.message);
        return res.status(500).json({ 
            error: true, 
            detalle: err.message 
        });
    }
}
