// Marcador de carga con la forma del contenido que viene: evita el salto de diseño y se siente más rápido.
// forma: 'lineas' (texto), 'tarjetas' (rejilla) o 'tabla' (filas). Los lectores de pantalla oyen «Cargando…».
export default function Esqueleto({ forma = 'lineas', cantidad = 3, etiqueta = 'Cargando…' }) {
  const elementos = Array.from({ length: cantidad }, (_, i) => i)
  return (
    <div className={`esqueleto esqueleto--${forma}`} role="status">
      <span className="sr-only">{etiqueta}</span>
      {forma === 'tarjetas' &&
        elementos.map((i) => (
          <div key={i} className="esqueleto__tarjeta" aria-hidden="true">
            <span className="esqueleto__barra esqueleto__barra--titulo" />
            <span className="esqueleto__barra" />
            <span className="esqueleto__barra esqueleto__barra--corta" />
          </div>
        ))}
      {forma === 'tabla' &&
        elementos.map((i) => (
          <div key={i} className="esqueleto__fila" aria-hidden="true">
            <span className="esqueleto__barra esqueleto__barra--corta" />
            <span className="esqueleto__barra" />
            <span className="esqueleto__barra esqueleto__barra--corta" />
          </div>
        ))}
      {forma === 'lineas' &&
        elementos.map((i) => (
          <span key={i} className={`esqueleto__barra ${i === cantidad - 1 ? 'esqueleto__barra--corta' : ''}`} aria-hidden="true" />
        ))}
    </div>
  )
}
