# Cómo preparar el material de un componente

Se sube **un solo ZIP por componente** (curso). Cada clase del temario abre su
propio HTML, y el instructor puede además mostrar las respuestas.

## Estructura obligatoria del ZIP

```
index.html                 (opcional) portada del curso con el índice de temas
tema-01.html               tema 1 del temario
tema-02.html               tema 2 del temario
...
soluciones/tema-01.html    respuestas de los ejercicios del tema 1 (solo instructor)
soluciones/tema-02.html
...
assets/                    imágenes, CSS, JS, fuentes compartidos
```

- El número del archivo es la **posición del tema en el temario** del componente
  (el mismo orden del Excel): la clase 3 abre `tema-03.html`.
- Todo lo que esté dentro de `soluciones/` **nunca se entrega a los alumnos**:
  lo bloquea el servidor. Las respuestas NO pueden estar dentro de `tema-XX.html`
  (ni ocultas con CSS o JavaScript): un alumno las vería con F12.
- Rutas siempre relativas (`assets/img/diagrama.png`, `../assets/estilos.css`
  desde `soluciones/`). Nada de rutas absolutas (`/assets/...` o `C:\...`).
- Límites: ZIP de hasta 50 MB, 300 MB descomprimido.

## Restricciones técnicas (el HTML se muestra aislado por seguridad)

- No usar `localStorage`, `sessionStorage` ni cookies (fallan).
- Sí se puede: JavaScript, animaciones, cuestionarios interactivos, fuentes de
  Google Fonts, librerías desde CDN (cdnjs, jsdelivr, unpkg).
- Los cuestionarios pueden ser interactivos (el alumno marca opciones), pero
  **sin corregir con las respuestas en el propio HTML**: la corrección va en
  `soluciones/`.

## Prompt sugerido para Claude

**Recomendado:** usa el botón **"Generar prompt para IA"** en la sección de
material del componente. Arma el prompt con el temario real, numerado
exactamente como los archivos, con la duración de cada clase y tus
indicaciones sobre los alumnos.

Si prefieres escribirlo a mano, esta es una versión básica (completa lo que
está entre corchetes):

> Eres un diseñador instruccional y desarrollador front-end. Genera el material
> del curso **[nombre del componente]** para **[perfil de los alumnos]**.
>
> Temario (en este orden exacto):
> 1. [Tema 1]
> 2. [Tema 2]
> 3. [...]
>
> Entrégalo como un ZIP con esta estructura:
> - `tema-01.html`, `tema-02.html`, … uno por tema, numerados con dos dígitos
>   según el orden del temario.
> - `soluciones/tema-01.html`, … con las respuestas y explicación de cada
>   ejercicio y cuestionario del tema correspondiente.
> - `assets/estilos.css` compartido y `assets/` para imágenes/JS.
> - `index.html` como portada con el índice del curso.
>
> Requisitos de cada tema:
> - Diseño muy visual y moderno (tarjetas, iconos, diagramas SVG, colores,
>   tipografía de Google Fonts), responsive y legible en proyector.
> - Estructura: objetivos → explicación con ejemplos → ejemplos prácticos
>   → ejercicios → cuestionario de repaso.
> - Numera los ejercicios y preguntas (Ejercicio 1, Pregunta 1…) para que las
>   soluciones se correspondan.
> - Las respuestas NO pueden aparecer en `tema-XX.html` de ninguna forma (ni
>   ocultas, ni en comentarios, ni en JavaScript): van solo en
>   `soluciones/tema-XX.html`.
> - No uses localStorage, sessionStorage ni cookies. Usa solo rutas relativas.

Descarga esta plantilla desde la plataforma para ver un ejemplo funcionando.
