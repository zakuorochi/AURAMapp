import { GoogleGenerativeAI } from "@google/generative-ai";

export default async function handler(req, res) {
    // Configuración de cabeceras para permitir peticiones desde tu index
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const { image } = req.body;

    if (!image) {
        return res.status(400).json({ isError: true, detalle: "No se recibió ninguna imagen." });
    }

    try {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        // Usamos el modelo 2.0/2.5 Flash que es excelente para tareas de imagen
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

        const prompt = `
            Task: Professional Background Removal.
            1. Analyze the image and find the main garment (clothing item).
            2. Extract only the garment.
            3. Remove EVERYTHING else: skin, hands, hangers, floors, shadows, and labels.
            4. If there is a person wearing it, extract ONLY the cloth, not the person.
            5. Return the result as a high-quality PNG with transparent background.
            6. Output format: Just the image data.
        `;

        const cleanBase64 = image.replace(/^data:image\/\w+;base64,/, "");

        const result = await model.generateContent({
            contents: [{
                role: "user",
                parts: [
                    { text: prompt },
                    { inlineData: { data: cleanBase64, mimeType: "image/jpeg" } }
                ]
            }],
            generationConfig: {
                responseModalities: ["IMAGE"],
                temperature: 0.1
            }
        });

        const response = await result.response;
        const imagePart = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);

        if (imagePart && imagePart.inlineData) {
            return res.status(200).json({ 
                success: true, 
                imagenSinFondo: imagePart.inlineData.data 
            });
        } else {
            throw new Error("La IA no devolvió una imagen procesada. Revisa los límites de tu API.");
        }

    } catch (err) {
        console.error("BORRADO ERROR:", err.message);
        return res.status(500).json({ isError: true, detalle: err.message });
    }
}
```

---

### 2. Nueva pantalla de resultado en `index.html`
Para poder ver si el borrado fue correcto, necesitamos una pantalla donde la IA nos muestre el resultado. Agrega esto a tu HTML después de `screen-confirm`:

```html
<div id="screen-result-ia" class="screen">
    <h3 style="color:var(--cyan-auram); font-size: 0.8rem; letter-spacing: 3px;">PRENDA PROCESADA</h3>
    <div style="background: url('https://www.transparenttextures.com/patterns/checkerboard.png'); border-radius: 15px; margin: 20px 0; width: 80%; border: 1px dashed var(--cyan-auram);">
        <img id="ia-output-preview" style="width: 100%; display: block;">
    </div>
    <p style="font-size: 0.7rem; color: #888; margin-bottom: 20px;">¿El borrado es correcto? (Sin fondo ni manos)</p>
    <div style="display: flex; gap: 15px; width: 80%;">
        <button class="btn-auram" style="flex:1; background: #333;" onclick="irA('screen-camera')">REPETIR</button>
        <button class="btn-auram" style="flex:1;" onclick="alert('Iniciando Segundo JS: Clasificación...')">ACEPTAR</button>
    </div>
</div>
```

---

### 3. La lógica de conexión (Actualizar en tu `<script>`)
Reemplaza tu función `procesarBorradorFondo()` por esta, que es la que hace la llamada real a Vercel:

```javascript
async function procesarBorradorFondo() {
    // 1. Mostrar pantalla de carga (opcional, puedes usar un alert o loader)
    console.log("Iniciando borrado de fondo...");
    
    try {
        const response = await fetch('/api/borrar-fondo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: fotoBase64 }) // fotoBase64 viene de la captura anterior
        });

        const data = await response.json();

        if (data.success && data.imagenSinFondo) {
            // 2. Colocar la imagen limpia en la nueva pantalla
            document.getElementById('ia-output-preview').src = "data:image/png;base64," + data.imagenSinFondo;
            irA('screen-result-ia');
        } else {
            alert("Error de IA: " + (data.detalle || "No se pudo limpiar la imagen."));
        }
    } catch (err) {
        alert("Error de conexión: " + err.message);
    }
}
