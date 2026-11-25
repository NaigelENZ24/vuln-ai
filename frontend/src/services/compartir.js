// Si dos componentes (o el doble efecto de StrictMode) piden lo mismo a la vez, se hace una sola petición.
// No guarda nada al terminar: la siguiente lectura trae datos frescos, así un cambio de estado nunca muestra datos viejos.
export function compartir(funcion) {
  const enCurso = new Map()
  return (...args) => {
    const clave = JSON.stringify(args)
    if (!enCurso.has(clave)) {
      enCurso.set(clave, Promise.resolve(funcion(...args)).finally(() => enCurso.delete(clave)))
    }
    return enCurso.get(clave)
  }
}
