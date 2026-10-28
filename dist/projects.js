// Projects share the existing database so the original "current" record is migrated without deletion.
export function projectMeta(s) {
  return {id:s.projectId,title:s.title,updatedAt:new Date().toISOString(),nodes:s.nodes.length,docs:s.docs.length,documentNames:s.docs.map(d=>d.name)};
}
export function putProject(store,s) {
  store.put(s,'project:'+s.projectId);
  store.put(projectMeta(s),'project-meta:'+s.projectId);
}
