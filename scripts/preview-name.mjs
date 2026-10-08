export function previewName(branch) {
  const name = branch
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63)
    .replace(/-+$/g, '')

  if (!name) throw new Error(`Cannot create a Preview name from branch: ${branch}`)
  return name
}
