export const MENSAJE_URL_INVALIDA =
  'Ingresa la URL de un repositorio de GitHub, por ejemplo https://github.com/usuario/repositorio'

export function parseRepoGitHub(texto) {
  try {
    const u = new URL(String(texto).trim())
    if (u.hostname !== 'github.com' && u.hostname !== 'www.github.com') return null
    const [owner, repo] = u.pathname.replace(/^\/+/, '').split('/')
    if (!owner || !repo) return null
    return { owner, repo: repo.replace(/\.git$/, '') }
  } catch {
    return null
  }
}