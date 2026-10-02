// Interactividad compartida del material. Sin almacenamiento (la plataforma
// muestra el material aislado) y sin correccion: las respuestas solo
// existen en soluciones/.
document.addEventListener('DOMContentLoaded', () => {
  if (window.hljs) window.hljs.highlightAll()

  // Resalta la opcion elegida en el cuestionario.
  document.querySelectorAll('.question input[type=radio]').forEach((input) => {
    input.addEventListener('change', () => {
      document.querySelectorAll(`input[name="${input.name}"]`).forEach((other) => {
        other.closest('label').classList.toggle('selected', other.checked)
      })
    })
  })

  // Boton "Copiar" en los bloques de codigo.
  document.querySelectorAll('pre > code').forEach((code) => {
    const button = document.createElement('button')
    button.className = 'copy-btn'
    button.type = 'button'
    button.textContent = 'Copiar'
    button.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(code.innerText)
        button.textContent = '¡Copiado!'
      } catch {
        button.textContent = 'Selecciona y copia'
      }
      setTimeout(() => { button.textContent = 'Copiar' }, 1600)
    })
    code.parentElement.appendChild(button)
  })
})
