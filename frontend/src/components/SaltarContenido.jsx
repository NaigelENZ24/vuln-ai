import '../styles/header.css'

// Cada página tiene su <main> sin id; se le da el foco aquí para no tocar todas las páginas.
function saltar(e) {
  const main = document.querySelector('main')
  if (!main) return
  e.preventDefault()
  main.setAttribute('tabindex', '-1')
  main.focus()
  main.scrollIntoView()
}

// Primer elemento enfocable: con Tab aparece y lleva directo al contenido, sin recorrer el menú.
export default function SaltarContenido() {
  return (
    <a className="saltar" href="#contenido" onClick={saltar}>
      Saltar al contenido
    </a>
  )
}
